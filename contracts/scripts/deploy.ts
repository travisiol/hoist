import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

/** Pons V2 factory on Robinhood Chain (chain id 4663), verified on a fork. */
const PONS_FACTORY_ROBINHOOD = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

/**
 * Deploys the HoistRouter against the Pons V2 factory, with the immutable
 * OPERATIONS_ADDRESS and VAULT_ADDRESS. On the hardhat
 * network a MockPonsFactory stands in so the script can be rehearsed.
 *
 *   PONS_FACTORY_ADDRESS   factory (defaults to the Robinhood Chain one)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Network   : ${network.name} (chainId ${chainId})`);
  console.log(`Deployer  : ${deployer.address}`);

  let factory = env("PONS_FACTORY_ADDRESS");
  if (!factory) {
    if (network.name === "hardhat" || network.name === "localhost") {
      const mock = await (await ethers.getContractFactory("MockPonsFactory")).deploy(deployer.address);
      await mock.waitForDeployment();
      factory = await mock.getAddress();
      console.log(`MockPonsFactory : ${factory}`);
    } else if (chainId === 4663) {
      factory = PONS_FACTORY_ROBINHOOD;
    } else {
      throw new Error("PONS_FACTORY_ADDRESS is required on this network.");
    }
  }
  console.log(`Pons factory : ${factory}`);
  const operations = env("OPERATIONS_ADDRESS") ?? (network.name === "hardhat" || network.name === "localhost" ? deployer.address : undefined);
  const vault = env("VAULT_ADDRESS") ?? (network.name === "hardhat" || network.name === "localhost" ? deployer.address : undefined);
  if (!operations || !vault) throw new Error("OPERATIONS_ADDRESS and VAULT_ADDRESS are required (both immutable).");

  const router = await (await ethers.getContractFactory("HoistRouter")).deploy(factory, operations, vault);
  const receipt = await router.deploymentTransaction()?.wait();
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log(`HoistRouter : ${routerAddress}`);

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    operations,
    vault,
    ponsFactory: factory,
    feeEscrow: await router.feeEscrow(),
    router: routerAddress,
    deployedAt: new Date().toISOString(),
    txHash: receipt?.hash ?? null,
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`Saved ${file}`);
  console.log(`\nFront end: NEXT_PUBLIC_ROUTER_ADDRESS=${routerAddress}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
