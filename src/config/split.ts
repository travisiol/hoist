/**
 * The split every treasury applies to each inflow. Mirrors the constants in
 * contracts/contracts/Treasury.sol (a contract test checks they match).
 */
export const split = {
  holderBps: 8_000,
  operationsBps: 1_500,
  vaultBps: 500,
} as const;

export const splitPct = {
  holders: `${split.holderBps / 100}%`,
  operations: `${split.operationsBps / 100}%`,
  vault: `${split.vaultBps / 100}%`,
} as const;
