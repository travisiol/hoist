import { ethers } from "hardhat";

/**
 * Local rig only (hardhat node on 8901, mock Pons): deploys the router with
 * operations = signer 5 and vault = signer 6. Never run against a real network.
 * Prints the addresses as JSON.
 */
async function main() {
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 31337n) throw new Error("local hardhat node only");
  const signers = await ethers.getSigners();
  const [deployer] = signers;
  const factory = await (await ethers.getContractFactory("MockPonsFactory")).deploy(deployer.address);
  const router = await (await ethers.getContractFactory("HoistRouter")).deploy(await factory.getAddress(), signers[5].address, signers[6].address);
  await router.waitForDeployment();
  console.log(JSON.stringify({ router: await router.getAddress(), factory: await factory.getAddress(), escrow: await factory.feeEscrow(), operations: signers[5].address, vault: signers[6].address }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
