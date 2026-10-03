import { ethers } from "hardhat";

/**
 * Local rig only (hardhat node on 8901, mock Pons). Plays the whole loop on
 * a router deployed by seed-local.ts (ROUTER env): launch, two stakers,
 * trades that credit the escrow, pull, split checked to the wei, claims,
 * unstake, operations/vault release. Never run against a real network.
 */
async function main() {
  if ((await ethers.provider.getNetwork()).chainId !== 31337n) throw new Error("local only");
  const s = await ethers.getSigners();
  const [creator, alice, bob, trader] = s;
  const router = await ethers.getContractAt("HoistRouter", process.env.ROUTER!);
  const fee = await router.ponsLaunchFee();
  const salt = ethers.hexlify(ethers.randomBytes(32));
  await (await router.connect(creator).launch({ name: "Local Lift", symbol: "LIFT", logo: "", description: "", creatorTaxBps: 500, salt, developerBuy: ethers.parseEther("0.05"), minTokensOut: 0n }, { value: fee + ethers.parseEther("0.05") })).wait();
  const info = (await router.launches(0, 1))[0];
  const token = await ethers.getContractAt("MockLaunchedToken", info.token);
  const curve = await ethers.getContractAt("MockCurve", info.curve);
  const tr = await ethers.getContractAt("Treasury", info.treasury);
  const factory = await ethers.getContractAt("MockPonsFactory", await router.ponsFactory());
  const escrow = await ethers.getContractAt("MockFeeEscrow", await factory.feeEscrow());
  const log = (k: string, v: unknown) => console.log(k.padEnd(28), typeof v === "bigint" ? ethers.formatEther(v) : v);

  for (const w of [alice, bob]) {
    const v = ethers.parseEther(w === alice ? "0.1" : "0.3");
    await (await curve.connect(w).buy(v, 0, w.address, { value: v })).wait();
    const bal = await token.balanceOf(w.address);
    await (await token.connect(w).approve(info.treasury, bal)).wait();
    await (await tr.connect(w).stake(bal)).wait();
  }
  log("alice stake", await tr.stakeOf(alice.address));
  log("bob stake", await tr.stakeOf(bob.address));
  log("waiting (pre-stake fees)", await tr.waiting());

  const recv0 = await tr.totalReceived();
  const ops0 = await tr.operationsOwed();
  const vault0 = await tr.vaultOwed();
  const toH0 = await tr.totalToHolders();
  const w0 = await tr.waiting();
  // trades credit 6% (1% Pons + 5% tax in the mock) to the escrow for the treasury
  await (await curve.connect(trader).buy(ethers.parseEther("1"), 0, trader.address, { value: ethers.parseEther("1") })).wait();
  const tb = await token.balanceOf(trader.address);
  await (await token.connect(trader).approve(info.curve, tb / 2n)).wait();
  await (await curve.connect(trader).sell(tb / 2n, 0, trader.address)).wait();
  const pending = await escrow.balanceOf(info.treasury);
  log("escrow pending", pending);
  await (await tr.connect(trader).pull()).wait();
  const fresh = (await tr.totalReceived()) - recv0;
  const h = (fresh * 8000n) / 10000n;
  const o = (fresh * 1500n) / 10000n;
  const checks = {
    freshEqualsEscrow: fresh === pending,
    ops: (await tr.operationsOwed()) - ops0 === o,
    vault: (await tr.vaultOwed()) - vault0 === fresh - h - o,
    holders: (await tr.totalToHolders()) - toH0 === h + w0,
    heldEqualsBalance: (await tr.held()) === (await ethers.provider.getBalance(info.treasury)),
  };
  console.log("split checks", checks);
  const ca = await tr.claimable(alice.address);
  const cb = await tr.claimable(bob.address);
  log("alice claimable", ca);
  log("bob claimable", cb);
  const sa = await tr.stakeOf(alice.address);
  const sb = await tr.stakeOf(bob.address);
  console.log("pro-rata check (cross-multiplied, ±1 wei per round)", { ratioAlice: Number((ca * 1_000_000n) / (ca + cb)), stakeShareAlice: Number((sa * 1_000_000n) / (sa + sb)) });
  await (await tr.connect(alice).claim()).wait();
  await (await tr.connect(bob).claim()).wait();
  await (await tr.connect(bob).unstake(sb / 2n)).wait();
  await (await tr.connect(trader).releaseOperations()).wait();
  await (await tr.connect(trader).releaseVault()).wait();
  log("paid to holders", await tr.totalPaidToHolders());
  log("rounds", await tr.rounds());
  log("stakers", await tr.stakers());
  log("ops paid", await tr.operationsPaid());
  log("vault paid", await tr.vaultPaid());
  log("treasury balance", await ethers.provider.getBalance(info.treasury));
  log("held", await tr.held());
  // more fees for the UI to claim
  await (await curve.connect(trader).buy(ethers.parseEther("0.5"), 0, trader.address, { value: ethers.parseEther("0.5") })).wait();
  console.log(JSON.stringify({ token: info.token, treasury: info.treasury, curve: info.curve }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
