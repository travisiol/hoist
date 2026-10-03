// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPonsFeeEscrow} from "./interfaces/IPonsV2.sol";

/**
 * HOIST — one treasury per launched token, registered on Pons as the
 * token's creator-fee recipient.
 *
 * Every wei that reaches it (fees pulled from the Pons escrow, or anything
 * sent directly) is split once, exactly:
 *
 *   - HOLDER_BPS (80%) to the holders who stake the token here, pro rata to
 *     their stake at the moment the funds are split (an accumulator);
 *   - OPERATIONS_BPS (15%) owed to the operations address;
 *   - the rest (5%, plus the rounding remainder of the split) owed to the
 *     platform vault.
 *
 * If nobody is staked when funds arrive, the holder share waits and is
 * shared at the first split that finds stakers. Operations and the vault are
 * paid by pull payment (`releaseOperations` / `releaseVault`, callable by
 * anyone, always to the fixed addresses), so a receiver that refuses ETH can
 * never block holders. No owner, no admin, nothing can be changed.
 */
contract Treasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    /// Mirrored in the site's config (src/config/split.ts).
    uint256 public constant HOLDER_BPS = 8_000;
    uint256 public constant OPERATIONS_BPS = 1_500;
    uint256 public constant VAULT_BPS = 500;
    uint256 private constant ACC = 1e36;

    address public immutable router;
    IPonsFeeEscrow public immutable escrow;
    address public immutable operations;
    address public immutable vault;
    /// The launched token. Set once by the router in the launch transaction.
    IERC20 public token;

    /// ETH this contract owes to someone (stakers, operations, vault, or waiting).
    uint256 public held;
    uint256 public accPerShare;
    uint256 private _carry; // scaled remainder of the accumulator division
    /// Holder share received while nobody was staked.
    uint256 public waiting;

    uint256 public totalStaked;
    uint256 public stakers;
    mapping(address => uint256) public stakeOf;
    mapping(address => uint256) private _debt;
    mapping(address => uint256) private _owed;

    uint256 public operationsOwed;
    uint256 public vaultOwed;
    uint256 public operationsPaid;
    uint256 public vaultPaid;

    uint256 public totalReceived;
    uint256 public totalToHolders; // shared into the accumulator
    uint256 public totalPaidToHolders; // claimed by stakers
    uint256 public rounds;
    uint64 public lastPullAt;

    event Inflow(uint256 amount, uint256 holders, uint256 operations, uint256 vault);
    event Round(uint256 indexed index, uint256 amount, uint256 totalStaked);
    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event Paid(address indexed account, uint256 amount);
    event Released(address indexed to, uint256 amount);

    error ZeroAddress();
    error NotRouter();
    error AlreadyBound();
    error ZeroAmount();
    error NotEnoughStaked();
    error NothingToClaim();
    error TransferFailed();

    constructor(IPonsFeeEscrow escrow_, address operations_, address vault_) {
        if (address(escrow_) == address(0) || operations_ == address(0) || vault_ == address(0)) revert ZeroAddress();
        router = msg.sender;
        escrow = escrow_;
        operations = operations_;
        vault = vault_;
    }

    receive() external payable {}

    function bind(address token_) external {
        if (msg.sender != router) revert NotRouter();
        if (address(token) != address(0)) revert AlreadyBound();
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
    }

    // ───────────────────────────────────────────── fees ──

    /// Pulls this treasury's fees from the Pons escrow and splits everything new. Anyone may call.
    function pull() external nonReentrant {
        _pull();
    }

    function _pull() private {
        try escrow.balanceOf(address(this)) returns (uint256 pending) {
            if (pending > 0) {
                try escrow.claim() {} catch {}
            }
        } catch {}
        lastPullAt = uint64(block.timestamp);
        _split();
    }

    function _split() private {
        uint256 fresh = address(this).balance - held;
        uint256 toHolders;
        if (fresh > 0) {
            toHolders = (fresh * HOLDER_BPS) / BPS;
            uint256 toOps = (fresh * OPERATIONS_BPS) / BPS;
            uint256 toVault = fresh - toHolders - toOps;
            held += fresh;
            totalReceived += fresh;
            operationsOwed += toOps;
            vaultOwed += toVault;
            emit Inflow(fresh, toHolders, toOps, toVault);
        }
        if (totalStaked == 0) {
            waiting += toHolders;
            return;
        }
        uint256 amount = toHolders + waiting;
        if (amount == 0) return;
        waiting = 0;
        uint256 scaled = amount * ACC + _carry;
        uint256 inc = scaled / totalStaked;
        _carry = scaled - inc * totalStaked;
        accPerShare += inc;
        totalToHolders += amount;
        emit Round(rounds, amount, totalStaked);
        rounds += 1;
    }

    // ───────────────────────────────────────────── staking ──

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pull();
        _settle(msg.sender);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (stakeOf[msg.sender] == 0 && received > 0) stakers += 1;
        stakeOf[msg.sender] += received;
        totalStaked += received;
        _debt[msg.sender] = (stakeOf[msg.sender] * accPerShare) / ACC;
        emit Staked(msg.sender, received);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > stakeOf[msg.sender]) revert NotEnoughStaked();
        _pull();
        _settle(msg.sender);
        stakeOf[msg.sender] -= amount;
        totalStaked -= amount;
        if (stakeOf[msg.sender] == 0) stakers -= 1;
        _debt[msg.sender] = (stakeOf[msg.sender] * accPerShare) / ACC;
        token.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// Pays the caller everything its stake has earned so far, in ETH.
    function claim() external nonReentrant returns (uint256 amount) {
        _pull();
        _settle(msg.sender);
        amount = _owed[msg.sender];
        if (amount == 0) revert NothingToClaim();
        _owed[msg.sender] = 0;
        held -= amount;
        totalPaidToHolders += amount;
        _pay(msg.sender, amount);
        emit Paid(msg.sender, amount);
    }

    function _settle(address account) private {
        uint256 accrued = (stakeOf[account] * accPerShare) / ACC;
        uint256 debt = _debt[account];
        if (accrued > debt) _owed[account] += accrued - debt;
        _debt[account] = accrued;
    }

    // ───────────────────────────────────────────── pull payments ──

    function releaseOperations() external nonReentrant returns (uint256 amount) {
        _pull();
        amount = operationsOwed;
        if (amount == 0) return 0;
        operationsOwed = 0;
        operationsPaid += amount;
        held -= amount;
        _pay(operations, amount);
        emit Released(operations, amount);
    }

    function releaseVault() external nonReentrant returns (uint256 amount) {
        _pull();
        amount = vaultOwed;
        if (amount == 0) return 0;
        vaultOwed = 0;
        vaultPaid += amount;
        held -= amount;
        _pay(vault, amount);
        emit Released(vault, amount);
    }

    function _pay(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ───────────────────────────────────────────── views ──

    function pendingInEscrow() public view returns (uint256) {
        try escrow.balanceOf(address(this)) returns (uint256 v) {
            return v;
        } catch {
            return 0;
        }
    }

    /// What `account` could claim right now, without counting fees not yet pulled.
    function claimable(address account) public view returns (uint256) {
        uint256 accrued = (stakeOf[account] * accPerShare) / ACC;
        uint256 debt = _debt[account];
        return _owed[account] + (accrued > debt ? accrued - debt : 0);
    }

    struct Status {
        address token;
        uint256 balance;
        uint256 pendingInEscrow;
        uint256 waiting;
        uint256 totalReceived;
        uint256 totalToHolders;
        uint256 totalPaidToHolders;
        uint256 rounds;
        uint256 stakers;
        uint256 totalStaked;
        uint256 operationsOwed;
        uint256 vaultOwed;
        uint256 operationsPaid;
        uint256 vaultPaid;
        uint64 lastPullAt;
        uint256 yourStake;
        uint256 yourClaimable;
    }

    function status(address account) external view returns (Status memory s) {
        s.token = address(token);
        s.balance = address(this).balance;
        s.pendingInEscrow = pendingInEscrow();
        s.waiting = waiting;
        s.totalReceived = totalReceived;
        s.totalToHolders = totalToHolders;
        s.totalPaidToHolders = totalPaidToHolders;
        s.rounds = rounds;
        s.stakers = stakers;
        s.totalStaked = totalStaked;
        s.operationsOwed = operationsOwed;
        s.vaultOwed = vaultOwed;
        s.operationsPaid = operationsPaid;
        s.vaultPaid = vaultPaid;
        s.lastPullAt = lastPullAt;
        s.yourStake = stakeOf[account];
        s.yourClaimable = claimable(account);
    }
}
