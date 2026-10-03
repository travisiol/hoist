import type { Abi } from "viem";
import routerJson from "@/lib/abi/HoistRouter.json";
import treasuryJson from "@/lib/abi/Treasury.json";

/**
 * On-chain surface. The router address comes from the environment (or the
 * deploy record, see next.config.ts) and is null until set; the ABIs are
 * exported by `contracts/` on every compile.
 */
function envAddress(value: string | undefined): `0x${string}` | null {
  const v = value?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as `0x${string}`) : null;
}

export const ROUTER_ADDRESS = envAddress(process.env.NEXT_PUBLIC_ROUTER_ADDRESS);

export const routerAbi = routerJson as Abi;
export const treasuryAbi = treasuryJson as Abi;

export type LaunchInfo = {
  token: `0x${string}`;
  curve: `0x${string}`;
  treasury: `0x${string}`;
  creator: `0x${string}`;
  creatorTaxBps: number;
  launchedAt: bigint;
  launchBlock: bigint;
  name: string;
  symbol: string;
  logo: string;
};

export type Totals = {
  tokensLaunched: bigint;
  paidToHolders: bigint;
  sharedToHolders: bigint;
  treasuryBalance: bigint;
  rounds: bigint;
  stakers: bigint;
  vaultOwed: bigint;
  vaultPaid: bigint;
  received: bigint;
};

export type TreasuryStatus = {
  token: `0x${string}`;
  balance: bigint;
  pendingInEscrow: bigint;
  waiting: bigint;
  totalReceived: bigint;
  totalToHolders: bigint;
  totalPaidToHolders: bigint;
  rounds: bigint;
  stakers: bigint;
  totalStaked: bigint;
  operationsOwed: bigint;
  vaultOwed: bigint;
  operationsPaid: bigint;
  vaultPaid: bigint;
  lastPullAt: bigint;
  yourStake: bigint;
  yourClaimable: bigint;
};

export const ZERO_TOTALS: Totals = {
  tokensLaunched: 0n,
  paidToHolders: 0n,
  sharedToHolders: 0n,
  treasuryBalance: 0n,
  rounds: 0n,
  stakers: 0n,
  vaultOwed: 0n,
  vaultPaid: 0n,
  received: 0n,
};
