import { expect } from "chai";
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const PONS_FEE = ethers.parseEther("0.0005");
const E = (v: string) => ethers.parseEther(v);

async function deployFixture() {
  const [creator, alice, bob, trader, stranger, operations, vault, ponsSink] = await ethers.getSigners();
  const factory = await (await ethers.getContractFactory("MockPonsFactory")).deploy(ponsSink.address);
  const router = await (await ethers.getContractFactory("HoistRouter")).deploy(await factory.getAddress(), operations.address, vault.address);
  const escrow = await ethers.getContractAt("MockFeeEscrow", await factory.feeEscrow());
  return { creator, alice, bob, trader, stranger, operations, vault, factory, router, escrow };
}
type Fx = Awaited<ReturnType<typeof deployFixture>>;

function params(overrides: Record<string, unknown> = {}) {
  return {
    name: "Hoisted",
    symbol: "HST",
    logo: "https://example.org/a.png",
    description: "",
    creatorTaxBps: 500,
    salt: ethers.hexlify(ethers.randomBytes(32)),
    developerBuy: 0n,
    minTokensOut: 0n,
    ...overrides,
  };
}

async function launchOne(fx: Fx, overrides: Record<string, unknown> = {}) {
  const p = params(overrides);
  const receipt = await (await fx.router.connect(fx.creator).launch(p, { value: PONS_FEE + (p.developerBuy as bigint) })).wait();
  const ev = receipt!.logs
    .map((l) => {
      try {
        return fx.router.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "Launched")!;
  const { token, curve, treasury } = ev.args as unknown as { token: string; curve: string; treasury: string };
  return {
    token: await ethers.getContractAt("MockLaunchedToken", token),
    curve: await ethers.getContractAt("MockCurve", curve),
    treasury: await ethers.getContractAt("Treasury", treasury),
    treasuryAddress: treasury,
  };
}
type L = Awaited<ReturnType<typeof launchOne>>;

/** Buys tokens for `who` on the curve, then stakes `amount` of them. */
async function buyAndStake(fx: Fx, l: L, who: typeof fx.alice, eth: string, amount?: bigint) {
  const v = E(eth);
  await l.curve.connect(who).buy(v, 0, who.address, { value: v });
  const bal = await l.token.balanceOf(who.address);
  const amt = amount ?? bal;
  await l.token.connect(who).approve(l.treasuryAddress, amt);
  await l.treasury.connect(who).stake(amt);
  return amt;
}

/** Credits `eth` to the treasury in the escrow, as Pons would. */
async function fees(fx: Fx, l: L, eth: string | bigint) {
  const v = typeof eth === "bigint" ? eth : E(eth);
  await fx.escrow.connect(fx.stranger).credit(l.treasuryAddress, { value: v });
}

describe("HoistRouter", () => {
  it("launches with a fresh treasury as creator-fee recipient and records it", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx, { creatorTaxBps: 300 });
    const last = await fx.factory.lastParams();
    expect(last.creatorFeeRecipient).to.equal(l.treasuryAddress);
    expect(last.creatorTaxBps).to.equal(300);
    expect(await l.treasury.token()).to.equal(await l.token.getAddress());
    expect(await l.treasury.router()).to.equal(await fx.router.getAddress());
    expect(await l.treasury.operations()).to.equal(fx.operations.address);
    expect(await l.treasury.vault()).to.equal(fx.vault.address);
    const info = await fx.router.infoOf(await l.token.getAddress());
    expect(info.treasury).to.equal(l.treasuryAddress);
    expect(info.creator).to.equal(fx.creator.address);
    expect(info.creatorTaxBps).to.equal(300);
    expect(await fx.router.launchCount()).to.equal(1n);
    expect(await fx.router.launchesOf(fx.creator.address)).to.deep.equal([await l.token.getAddress()]);
    expect(await fx.router.tokenOfTreasury(l.treasuryAddress)).to.equal(await l.token.getAddress());
  });

  it("rejects bad input, a tax above Pons' max and a wrong value", async () => {
    const fx = await loadFixture(deployFixture);
    await expect(fx.router.launch(params({ name: "" }), { value: PONS_FEE })).to.be.revertedWithCustomError(fx.router, "EmptyName");
    await expect(fx.router.launch(params({ symbol: "" }), { value: PONS_FEE })).to.be.revertedWithCustomError(fx.router, "EmptySymbol");
    await expect(fx.router.launch(params({ creatorTaxBps: 1001 }), { value: PONS_FEE })).to.be.revertedWithCustomError(fx.router, "TaxTooHigh");
    await expect(fx.router.launch(params(), { value: PONS_FEE + 1n })).to.be.revertedWithCustomError(fx.router, "WrongValue");
    await fx.factory.setLaunchEnabled(false);
    await expect(fx.router.launch(params(), { value: PONS_FEE })).to.be.revertedWithCustomError(fx.router, "LaunchClosed");
  });

  it("a developer buy goes to the creator; bind is router-only and once", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx, { developerBuy: E("0.1") });
    expect(await l.token.balanceOf(fx.creator.address)).to.be.gt(0n);
    await expect(l.treasury.bind(fx.stranger.address)).to.be.revertedWithCustomError(l.treasury, "NotRouter");
  });

  it("totals sum every treasury", async () => {
    const fx = await loadFixture(deployFixture);
    const a = await launchOne(fx);
    const b = await launchOne(fx);
    await buyAndStake(fx, a, fx.alice, "0.1");
    await buyAndStake(fx, b, fx.bob, "0.1");
    await fees(fx, a, "1");
    await fees(fx, b, "2");
    await a.treasury.pull();
    await b.treasury.pull();
    await a.treasury.connect(fx.alice).claim();
    const t = await fx.router.totals();
    expect(t.tokensLaunched).to.equal(2n);
    expect(t.rounds).to.equal(2n); // one round per pull that found stakers and new funds
    expect(t.stakers).to.equal(2n);
    expect(t.paidToHolders).to.equal(await a.treasury.totalPaidToHolders());
    expect(t.received).to.equal((await a.treasury.totalReceived()) + (await b.treasury.totalReceived()));
  });
});

describe("Treasury", () => {
  it("constants equal the site config", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    const cfg = fs.readFileSync(path.resolve(__dirname, "../../src/config/split.ts"), "utf8");
    const num = (k: string) => BigInt(new RegExp(`${k}:\\s*([0-9_]+)`).exec(cfg)![1].replace(/_/g, ""));
    expect(await l.treasury.HOLDER_BPS()).to.equal(num("holderBps"));
    expect(await l.treasury.OPERATIONS_BPS()).to.equal(num("operationsBps"));
    expect(await l.treasury.VAULT_BPS()).to.equal(num("vaultBps"));
    expect(num("holderBps") + num("operationsBps") + num("vaultBps")).to.equal(10_000n);
  });

  it("splits every inflow 80/15/5 exactly to the wei, remainder to the vault", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    await buyAndStake(fx, l, fx.alice, "0.1");
    const before = await l.treasury.totalReceived();
    const opsBefore = await l.treasury.operationsOwed();
    const vaultBefore = await l.treasury.vaultOwed();
    const odd = 1_000_000_000_000_000_007n;
    await fees(fx, l, odd);
    await expect(l.treasury.pull())
      .to.emit(l.treasury, "Inflow")
      .withArgs(odd, (odd * 8000n) / 10000n, (odd * 1500n) / 10000n, odd - (odd * 8000n) / 10000n - (odd * 1500n) / 10000n);
    expect((await l.treasury.totalReceived()) - before).to.equal(odd);
    const h = (odd * 8000n) / 10000n;
    const o = (odd * 1500n) / 10000n;
    expect((await l.treasury.operationsOwed()) - opsBefore).to.equal(o);
    expect((await l.treasury.vaultOwed()) - vaultBefore).to.equal(odd - h - o);
    // with one staker every holder wei is claimable, less at most 1 wei of accumulator rounding,
    // which is carried into the next round rather than lost
    const claimable = await l.treasury.claimable(fx.alice.address);
    expect((await l.treasury.totalToHolders()) - claimable).to.be.lte(1n);
    // the contract always holds exactly what it owes
    expect(await ethers.provider.getBalance(l.treasuryAddress)).to.equal(await l.treasury.held());
  });

  it("pays two stakers pro rata across rounds", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx, { creatorTaxBps: 0 });
    // give both the same token amounts by transfer, so stakes are exact
    await l.curve.connect(fx.trader).buy(E("1"), 0, fx.trader.address, { value: E("1") });
    await l.treasury.pull(); // absorb the trader's fees: nobody staked, they wait
    const waitingBefore = await l.treasury.waiting();
    expect(waitingBefore).to.be.gt(0n);
    const unit = E("1000");
    await l.token.connect(fx.trader).transfer(fx.alice.address, unit);
    await l.token.connect(fx.trader).transfer(fx.bob.address, unit * 3n);
    await l.token.connect(fx.alice).approve(l.treasuryAddress, unit);
    await l.treasury.connect(fx.alice).stake(unit);
    // first pull with a staker hands the waiting share to Alice alone
    await l.treasury.pull();
    expect(await l.treasury.waiting()).to.equal(0n);
    expect(await l.treasury.claimable(fx.alice.address)).to.equal(waitingBefore);
    await l.token.connect(fx.bob).approve(l.treasuryAddress, unit * 3n);
    await l.treasury.connect(fx.bob).stake(unit * 3n);
    const r0 = await l.treasury.rounds();
    await fees(fx, l, "1");
    await expect(l.treasury.pull()).to.emit(l.treasury, "Round").withArgs(r0, E("0.8"), unit * 4n);
    expect(await l.treasury.claimable(fx.alice.address)).to.equal(waitingBefore + E("0.2"));
    expect(await l.treasury.claimable(fx.bob.address)).to.equal(E("0.6"));
    // Bob leaves half; next round 1 ETH holders 0.8 split 1:1.5
    await l.treasury.connect(fx.bob).unstake(unit + unit / 2n);
    await fees(fx, l, "1");
    await l.treasury.pull();
    expect(await l.treasury.claimable(fx.alice.address)).to.equal(waitingBefore + E("0.2") + E("0.32"));
    expect(await l.treasury.claimable(fx.bob.address)).to.equal(E("0.6") + E("0.48"));
    const balBefore = await ethers.provider.getBalance(fx.bob.address);
    const rc = await (await l.treasury.connect(fx.bob).claim()).wait();
    const gas = rc!.gasUsed * rc!.gasPrice;
    expect((await ethers.provider.getBalance(fx.bob.address)) - balBefore + gas).to.equal(E("1.08"));
    expect(await l.treasury.totalPaidToHolders()).to.equal(E("1.08"));
    await expect(l.treasury.connect(fx.bob).claim()).to.be.revertedWithCustomError(l.treasury, "NothingToClaim");
    expect(await l.treasury.stakers()).to.equal(2n);
    await l.treasury.connect(fx.bob).unstake(unit + unit / 2n);
    expect(await l.treasury.stakers()).to.equal(1n);
    expect(await l.token.balanceOf(fx.bob.address)).to.equal(unit * 3n);
  });

  it("a late staker earns nothing from rounds before its stake", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    await buyAndStake(fx, l, fx.alice, "0.1");
    await fees(fx, l, "1");
    // Bob stakes: the stake pulls first, so the 1 ETH round goes to Alice alone
    await buyAndStake(fx, l, fx.bob, "0.1");
    expect(await l.treasury.claimable(fx.bob.address)).to.equal(0n);
    expect(await l.treasury.claimable(fx.alice.address)).to.be.gte(E("0.8"));
  });

  it("rejects unstaking more than staked and zero amounts", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    const amt = await buyAndStake(fx, l, fx.alice, "0.1");
    await expect(l.treasury.connect(fx.alice).unstake(amt + 1n)).to.be.revertedWithCustomError(l.treasury, "NotEnoughStaked");
    await expect(l.treasury.connect(fx.alice).stake(0)).to.be.revertedWithCustomError(l.treasury, "ZeroAmount");
    await expect(l.treasury.connect(fx.alice).unstake(0)).to.be.revertedWithCustomError(l.treasury, "ZeroAmount");
  });

  it("blocks re-entry into claim", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    const attacker = await (await ethers.getContractFactory("ReentrantStaker")).deploy(l.treasuryAddress);
    await l.curve.connect(fx.trader).buy(E("0.1"), 0, await attacker.getAddress(), { value: E("0.1") });
    await attacker.stakeAll(await l.token.getAddress());
    await fees(fx, l, "1");
    await attacker.doClaim();
    expect(await attacker.reentered()).to.equal(true);
    expect(await attacker.reentryFailed()).to.equal(true);
    expect(await ethers.provider.getBalance(l.treasuryAddress)).to.equal(await l.treasury.held());
  });

  it("keeps working with a broken or stuck escrow", async () => {
    const fx = await loadFixture(deployFixture);
    for (const name of ["BrokenEscrow", "StuckEscrow"]) {
      const esc = await (await ethers.getContractFactory(name)).deploy();
      const tr = await (await ethers.getContractFactory("Treasury")).deploy(await esc.getAddress(), fx.operations.address, fx.vault.address);
      const tok = await (await ethers.getContractFactory("MockLaunchedToken")).deploy("T", "T", fx.alice.address, E("100"));
      await tr.bind(await tok.getAddress());
      await tok.connect(fx.alice).approve(await tr.getAddress(), E("100"));
      await tr.connect(fx.alice).stake(E("100"));
      await fx.stranger.sendTransaction({ to: await tr.getAddress(), value: E("1") });
      await tr.pull();
      expect(await tr.claimable(fx.alice.address)).to.equal(E("0.8"));
      await tr.connect(fx.alice).claim();
      await tr.connect(fx.alice).unstake(E("100"));
      expect(await tok.balanceOf(fx.alice.address)).to.equal(E("100"));
    }
  });

  it("operations and vault are paid by pull payment, to the fixed addresses only", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    await buyAndStake(fx, l, fx.alice, "0.1");
    await fees(fx, l, "2");
    await l.treasury.pull();
    const opsOwed = await l.treasury.operationsOwed();
    const vaultOwed = await l.treasury.vaultOwed();
    const o0 = await ethers.provider.getBalance(fx.operations.address);
    const v0 = await ethers.provider.getBalance(fx.vault.address);
    await l.treasury.connect(fx.stranger).releaseOperations();
    await l.treasury.connect(fx.stranger).releaseVault();
    expect((await ethers.provider.getBalance(fx.operations.address)) - o0).to.equal(opsOwed);
    expect((await ethers.provider.getBalance(fx.vault.address)) - v0).to.equal(vaultOwed);
    expect(await l.treasury.operationsPaid()).to.equal(opsOwed);
    expect(await l.treasury.vaultPaid()).to.equal(vaultOwed);
    // a vault that refuses ETH cannot block holders
    const bad = await (await ethers.getContractFactory("RejectingReceiver")).deploy();
    const tr = await (await ethers.getContractFactory("Treasury")).deploy(await fx.escrow.getAddress(), fx.operations.address, await bad.getAddress());
    const tok = await (await ethers.getContractFactory("MockLaunchedToken")).deploy("T", "T", fx.alice.address, E("10"));
    await tr.bind(await tok.getAddress());
    await tok.connect(fx.alice).approve(await tr.getAddress(), E("10"));
    await tr.connect(fx.alice).stake(E("10"));
    await fx.stranger.sendTransaction({ to: await tr.getAddress(), value: E("1") });
    await expect(tr.releaseVault()).to.be.revertedWithCustomError(tr, "TransferFailed");
    await tr.connect(fx.alice).claim();
    expect(await tr.totalPaidToHolders()).to.equal(E("0.8"));
  });

  it("pulls curve fees from the escrow on stake and claim", async () => {
    const fx = await loadFixture(deployFixture);
    const l = await launchOne(fx);
    await buyAndStake(fx, l, fx.alice, "0.5");
    // the buy credited fees in the escrow; stake pulled them (nobody staked yet -> waiting)
    expect(await fx.escrow.balanceOf(l.treasuryAddress)).to.equal(0n);
    expect(await l.treasury.waiting()).to.be.gt(0n);
    await l.curve.connect(fx.trader).buy(E("1"), 0, fx.trader.address, { value: E("1") });
    expect(await l.treasury.pendingInEscrow()).to.equal((E("1") * 600n) / 10000n);
    await l.treasury.connect(fx.alice).claim();
    expect(await fx.escrow.balanceOf(l.treasuryAddress)).to.equal(0n);
    expect(await l.treasury.totalPaidToHolders()).to.be.gt(0n);
  });
});
