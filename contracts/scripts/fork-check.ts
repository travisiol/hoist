import { ethers, network } from "hardhat";

/**
 * Exercises the router and a treasury against the REAL Pons V2 factory on an
 * in-process fork of Robinhood Chain (FORK_URL=https://rpc.mainnet.chain.robinhood.com):
 * launch with a developer buy, the curve's fee recipient is the treasury, the
 * launcher stakes, a trade, pull and claim. Nothing is broadcast.
 */
const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

const CURVE_ABI = [
  "function deployer() view returns (address)",
  "function buy(uint256,uint256,address) payable returns (uint256)",
  "function quoteFeeBalance() view returns (uint256)",
  "function protocolFeeRecipient() view returns (address)",
  "function sweepFees(uint256)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function approve(address,uint256) returns (bool)"];

async function trySweep(curve: import("ethers").Contract): Promise<boolean> {
  const candidates = new Set<string>();
  try {
    candidates.add(await curve.protocolFeeRecipient());
  } catch {
    /* no such view */
  }
  try {
    const factory = new ethers.Contract(PONS_FACTORY, ["function owner() view returns (address)"], ethers.provider);
    candidates.add(await factory.owner());
  } catch {
    /* no owner() */
  }
  for (const who of candidates) {
    if (!ethers.isAddress(who) || who === ethers.ZeroAddress) continue;
    await network.provider.send("hardhat_impersonateAccount", [who]);
    await network.provider.send("hardhat_setBalance", [who, "0x56BC75E2D63100000"]);
    const signer = await ethers.getSigner(who);
    for (const arg of [0n, ethers.MaxUint256]) {
      try {
        await (await curve.connect(signer).getFunction("sweepFees")(arg)).wait();
        await network.provider.send("hardhat_stopImpersonatingAccount", [who]);
        return true;
      } catch {
        /* try the next one */
      }
    }
    await network.provider.send("hardhat_stopImpersonatingAccount", [who]);
  }
  return false;
}

async function main() {
  const [launcher, operations, trader] = await ethers.getSigners();
  console.log(`network ${network.name} block ${await ethers.provider.getBlockNumber()}`);
  if ((await ethers.provider.getCode(PONS_FACTORY)) === "0x") throw new Error("Not a Robinhood Chain fork");

  const router = await (await ethers.getContractFactory("HoistRouter")).deploy(PONS_FACTORY, operations.address, trader.address);
  await router.waitForDeployment();
  console.log("router", await router.getAddress(), "canLaunchHere", await router.canLaunchHere());
  const ponsFee = await router.ponsLaunchFee();
  const devBuy = ethers.parseEther("0.01");

  const tx = await router.connect(launcher).launch(
    {
      name: "Fork Hoist",
      symbol: "FHST",
      logo: "",
      description: "Fork rehearsal, never broadcast.",
      creatorTaxBps: 500,
      salt: ethers.hexlify(ethers.randomBytes(32)),
      developerBuy: devBuy,
      minTokensOut: 0n,
    },
    { value: ponsFee + devBuy },
  );
  const receipt = await tx.wait();
  const ev = receipt!.logs
    .map((l) => {
      try {
        return router.interface.parseLog({ topics: [...l.topics], data: l.data });
      } catch {
        return null;
      }
    })
    .find((e) => e?.name === "Launched")!;
  const { token, curve, treasury } = ev.args as unknown as { token: string; curve: string; treasury: string };
  console.log("[1] launched", token, "curve", curve, "treasury", treasury, "gas", receipt?.gasUsed.toString());

  const erc20 = new ethers.Contract(token, ERC20_ABI, launcher);
  const curveC = new ethers.Contract(curve, CURVE_ABI, ethers.provider);
  const bal = await erc20.balanceOf(launcher.address);
  console.log("  launcher token balance", ethers.formatEther(bal));
  const recipient = await curveC.deployer();
  console.log("  curve fee recipient", recipient, "== treasury", recipient.toLowerCase() === treasury.toLowerCase());

  const tr = await ethers.getContractAt("Treasury", treasury);
  await (await erc20.approve(treasury, bal)).wait();
  await (await tr.connect(launcher).stake(bal)).wait();
  console.log("[2] launcher staked", ethers.formatEther(await tr.stakeOf(launcher.address)));

  const spend = ethers.parseEther("0.05");
  await (await (curveC.connect(trader) as import("ethers").Contract).buy(spend, 0, trader.address, { value: spend })).wait();
  const swept = await trySweep(curveC);
  console.log("[3] trader bought 0.05 ETH; swept:", swept, "treasury pending in escrow", ethers.formatEther(await tr.pendingInEscrow()));
  if ((await tr.pendingInEscrow()) === 0n) {
    await (await trader.sendTransaction({ to: treasury, value: ethers.parseEther("0.003") })).wait();
    console.log("  (no sweep on this fork) sent 0.003 ETH to the treasury to stand in for swept fees");
  }
  await (await tr.pull()).wait();
  const s = await tr.status(launcher.address);
  console.log("[4] received", ethers.formatEther(s.totalReceived), "to holders", ethers.formatEther(s.totalToHolders), "claimable", ethers.formatEther(s.yourClaimable));
  await (await tr.connect(launcher).claim()).wait();
  console.log("  paid to holders", ethers.formatEther(await tr.totalPaidToHolders()));
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
