// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPonsFactoryV2, IPonsLaunchForwarder, IPonsFeeEscrow} from "./interfaces/IPonsV2.sol";
import {Treasury} from "./Treasury.sol";

/**
 * HOIST — launch a token on Pons V2 whose creator fees pay the holders who stake it.
 *
 * `launch()` deploys a fresh Treasury, then launches the token on Pons with
 * that treasury as the creator-fee recipient and the creator tax the
 * launcher chose (0 to Pons' maximum). The router has no owner; the
 * operations and platform-vault addresses are fixed at deployment and every
 * treasury it creates pays them 15% and 5% of its inflows. The only launch
 * cost is Pons' own launch fee, read live. Rewards are paid in ETH.
 */
contract HoistRouter is ReentrancyGuard {
    uint256 public constant LAUNCH_CONFIG_ID = 0;
    address public constant NATIVE_PAIR = address(0);

    IPonsFactoryV2 public immutable ponsFactory;
    IPonsLaunchForwarder public immutable ponsForwarder;
    IPonsFeeEscrow public immutable feeEscrow;
    address public immutable operations;
    address public immutable vault;

    struct LaunchParams {
        string name;
        string symbol;
        string logo;
        string description;
        uint16 creatorTaxBps;
        bytes32 salt;
        /// Wei spent on tokens for the launcher in the same transaction.
        uint256 developerBuy;
        uint256 minTokensOut;
    }

    struct LaunchInfo {
        address token;
        address curve;
        address treasury;
        address creator;
        uint16 creatorTaxBps;
        uint64 launchedAt;
        uint64 launchBlock;
        string name;
        string symbol;
        string logo;
    }

    struct Totals {
        uint256 tokensLaunched;
        uint256 paidToHolders;
        uint256 sharedToHolders;
        uint256 treasuryBalance;
        uint256 rounds;
        uint256 stakers;
        uint256 vaultOwed;
        uint256 vaultPaid;
        uint256 received;
    }

    address[] private _launches;
    mapping(address token => LaunchInfo) private _info;
    mapping(address treasury => address token) public tokenOfTreasury;
    mapping(address creator => address[] tokens) private _byCreator;

    event Launched(
        address indexed token,
        address indexed creator,
        address treasury,
        address curve,
        uint16 creatorTaxBps,
        uint256 developerBuy
    );

    error ZeroAddress();
    error LaunchClosed();
    error WrongValue(uint256 expected, uint256 sent);
    error EmptyName();
    error EmptySymbol();
    error TaxTooHigh(uint256 max);
    error UnknownToken();
    error RefundFailed();

    constructor(IPonsFactoryV2 factory_, address operations_, address vault_) {
        if (address(factory_) == address(0) || operations_ == address(0) || vault_ == address(0)) revert ZeroAddress();
        ponsFactory = factory_;
        operations = operations_;
        vault = vault_;
        feeEscrow = IPonsFeeEscrow(factory_.feeEscrow());
        ponsForwarder = IPonsLaunchForwarder(factory_.launchForwarder());
        if (address(feeEscrow) == address(0) || address(ponsForwarder) == address(0)) revert ZeroAddress();
    }

    /// Send exactly `ponsLaunchFee() + params.developerBuy` wei.
    function launch(LaunchParams calldata params)
        external
        payable
        nonReentrant
        returns (address token, address curve, address treasury)
    {
        if (!canLaunchHere()) revert LaunchClosed();
        if (bytes(params.name).length == 0) revert EmptyName();
        if (bytes(params.symbol).length == 0) revert EmptySymbol();
        uint256 maxTax = ponsFactory.maxCreatorTaxBps();
        if (params.creatorTaxBps > maxTax) revert TaxTooHigh(maxTax);

        uint256 ponsFee = ponsFactory.launchFee();
        uint256 expected = ponsFee + params.developerBuy;
        if (msg.value != expected) revert WrongValue(expected, msg.value);

        treasury = address(new Treasury(feeEscrow, operations, vault));
        (token, curve) = _launchOnPons(params, treasury, ponsFee);
        Treasury(payable(treasury)).bind(token);

        _launches.push(token);
        _byCreator[msg.sender].push(token);
        tokenOfTreasury[treasury] = token;
        LaunchInfo storage info = _info[token];
        info.token = token;
        info.curve = curve;
        info.treasury = treasury;
        info.creator = msg.sender;
        info.creatorTaxBps = params.creatorTaxBps;
        info.launchedAt = uint64(block.timestamp);
        info.launchBlock = uint64(block.number);
        info.name = params.name;
        info.symbol = params.symbol;
        info.logo = params.logo;

        emit Launched(token, msg.sender, treasury, curve, params.creatorTaxBps, params.developerBuy);

        uint256 refund = address(this).balance;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }

    function _launchOnPons(LaunchParams calldata params, address treasury, uint256 ponsFee)
        private
        returns (address token, address curve)
    {
        IPonsFactoryV2.LaunchParams memory ponsParams = IPonsFactoryV2.LaunchParams({
            name: params.name,
            symbol: params.symbol,
            logo: params.logo,
            description: params.description,
            socials: IPonsFactoryV2.Socials({x: "", telegram: "", website: "", discord: "", extra: ""}),
            creatorFeeRecipient: treasury,
            creatorTaxBps: params.creatorTaxBps,
            buybackEnabled: false,
            economicsHash: ponsFactory.previewLaunchEconomics(LAUNCH_CONFIG_ID, NATIVE_PAIR),
            salt: params.salt
        });
        address[] memory exempt = new address[](0);
        if (params.developerBuy > 0) {
            (token, curve) = ponsForwarder.launchAndBuy{value: ponsFee + params.developerBuy}(
                ponsParams, LAUNCH_CONFIG_ID, NATIVE_PAIR, params.developerBuy, params.minTokensOut, msg.sender, exempt
            );
        } else {
            (token, curve) = ponsFactory.launchToken{value: ponsFee}(ponsParams, LAUNCH_CONFIG_ID, NATIVE_PAIR, exempt);
        }
    }

    // ───────────────────────────────────────────── views ──

    function canLaunchHere() public view returns (bool) {
        return ponsFactory.launchEnabled() && ponsFactory.canLaunch(address(this));
    }

    function ponsLaunchFee() external view returns (uint256) {
        return ponsFactory.launchFee();
    }

    function maxCreatorTaxBps() external view returns (uint256) {
        return ponsFactory.maxCreatorTaxBps();
    }

    function launchCount() external view returns (uint256) {
        return _launches.length;
    }

    /// Newest first. `offset` counts from the newest launch.
    function launches(uint256 offset, uint256 limit) external view returns (LaunchInfo[] memory page) {
        uint256 n = _launches.length;
        if (offset >= n) return page;
        uint256 count = n - offset;
        if (count > limit) count = limit;
        page = new LaunchInfo[](count);
        for (uint256 i = 0; i < count; i++) page[i] = _info[_launches[n - 1 - offset - i]];
    }

    function launchesOf(address creator) external view returns (address[] memory) {
        return _byCreator[creator];
    }

    function infoOf(address token) external view returns (LaunchInfo memory info) {
        info = _info[token];
        if (info.token == address(0)) revert UnknownToken();
    }

    /// Sums over every treasury this router created. A view: read it with eth_call.
    function totals() external view returns (Totals memory t) {
        uint256 n = _launches.length;
        t.tokensLaunched = n;
        for (uint256 i = 0; i < n; i++) {
            Treasury tr = Treasury(payable(_info[_launches[i]].treasury));
            t.paidToHolders += tr.totalPaidToHolders();
            t.sharedToHolders += tr.totalToHolders();
            t.treasuryBalance += address(tr).balance;
            t.rounds += tr.rounds();
            t.stakers += tr.stakers();
            t.vaultOwed += tr.vaultOwed();
            t.vaultPaid += tr.vaultPaid();
            t.received += tr.totalReceived();
        }
    }

    /// A refund from Pons during a launch lands here and is passed back before `launch()` returns.
    receive() external payable {}
}
