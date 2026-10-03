import * as fs from "fs";
import * as path from "path";
import hre from "hardhat";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

/** Verifies the router on the explorer from the record deploy.ts wrote. */
async function main() {
  const file = path.join(deploymentsDir, `${hre.network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployment record at ${file} — run deploy first.`);
  const record = JSON.parse(fs.readFileSync(file, "utf8")) as DeploymentRecord;
  try {
    await hre.run("verify:verify", {
      address: record.router,
      constructorArguments: [record.ponsFactory, record.operations, record.vault],
      contract: "contracts/HoistRouter.sol:HoistRouter",
    });
    console.log(`verified HoistRouter at ${record.router}`);
  } catch (e) {
    console.log(`HoistRouter: ${(e as Error).message.split("\n")[0]}`);
  }
  console.log("Each Treasury is created by the router; constructor args are (feeEscrow, operations, vault).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
