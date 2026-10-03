"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type PublicClient } from "viem";
import { useAccount, usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { robinhoodChain } from "@/lib/chain";
import { ROUTER_ADDRESS, routerAbi, treasuryAbi, ZERO_TOTALS, type LaunchInfo, type Totals, type TreasuryStatus } from "@/lib/contracts";
import { curveAbi } from "@/lib/ponsAbi";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const PAGE = 500n;

/** Every launch, newest first. Empty when the router address is unset. */
export function useLaunches() {
  const q = useReadContract({
    address: ROUTER_ADDRESS ?? undefined,
    abi: routerAbi,
    functionName: "launches",
    args: [0n, PAGE],
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(ROUTER_ADDRESS), refetchInterval: 20_000 },
  });
  return { launches: (q.data as LaunchInfo[] | undefined) ?? [], loading: Boolean(ROUTER_ADDRESS) && q.isLoading };
}

export function useTotals(): Totals {
  const q = useReadContract({
    address: ROUTER_ADDRESS ?? undefined,
    abi: routerAbi,
    functionName: "totals",
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(ROUTER_ADDRESS), refetchInterval: 20_000 },
  });
  return (q.data as Totals | undefined) ?? ZERO_TOTALS;
}

export type Row = LaunchInfo & { status: TreasuryStatus | null; mcapWei: bigint | null; graduated: boolean };

/** Treasury status (for the connected wallet) and curve reserves for each launch. */
export function useRows(launches: LaunchInfo[]): Row[] {
  const { address } = useAccount();
  const who = address ?? ZERO;
  const q = useReadContracts({
    allowFailure: true,
    contracts: launches.flatMap((l) => [
      { address: l.treasury, abi: treasuryAbi, functionName: "status", args: [who], chainId: robinhoodChain.id },
      { address: l.curve, abi: curveAbi, functionName: "getReserves", chainId: robinhoodChain.id },
      { address: l.curve, abi: curveAbi, functionName: "graduated", chainId: robinhoodChain.id },
    ]),
    query: { enabled: launches.length > 0, refetchInterval: 20_000 },
  });
  return launches.map((l, i) => {
    const s = q.data?.[i * 3];
    const r = q.data?.[i * 3 + 1];
    const g = q.data?.[i * 3 + 2];
    let mcapWei: bigint | null = null;
    if (r?.status === "success") {
      const [quote, tokens] = r.result as readonly [bigint, bigint];
      // Spot price times the 1e9 launch supply, in wei.
      if (tokens > 0n) mcapWei = (quote * 1_000_000_000n * 10n ** 18n) / tokens;
    }
    return {
      ...l,
      status: s?.status === "success" ? (s.result as TreasuryStatus) : null,
      mcapWei,
      graduated: g?.status === "success" ? Boolean(g.result) : false,
    };
  });
}

export type TreasuryEvent = {
  kind: "Paid" | "Round" | "Staked" | "Unstaked" | "Inflow" | "Released";
  account?: `0x${string}`;
  amount: bigint;
  extra?: bigint;
  block: bigint;
  tx: `0x${string}`;
  time: number;
  treasury: `0x${string}`;
};

const EVENTS = [
  parseAbiItem("event Paid(address indexed account, uint256 amount)"),
  parseAbiItem("event Round(uint256 indexed index, uint256 amount, uint256 totalStaked)"),
  parseAbiItem("event Staked(address indexed account, uint256 amount)"),
  parseAbiItem("event Unstaked(address indexed account, uint256 amount)"),
  parseAbiItem("event Inflow(uint256 amount, uint256 holders, uint256 operations, uint256 vault)"),
  parseAbiItem("event Released(address indexed to, uint256 amount)"),
];
const CHUNK = 400_000n;

async function readEvents(client: PublicClient, treasuries: `0x${string}`[], fromBlock: bigint): Promise<TreasuryEvent[]> {
  if (treasuries.length === 0) return [];
  const latest = await client.getBlockNumber();
  const out: TreasuryEvent[] = [];
  for (let from = fromBlock; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await client.getLogs({ address: treasuries, events: EVENTS, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const a = log.args as Record<string, unknown>;
      const kind = log.eventName as TreasuryEvent["kind"];
      out.push({
        kind,
        account: (a.account ?? a.to) as `0x${string}` | undefined,
        amount: (a.amount as bigint) ?? 0n,
        extra: (kind === "Round" ? a.totalStaked : kind === "Inflow" ? a.vault : undefined) as bigint | undefined,
        block: log.blockNumber ?? 0n,
        tx: log.transactionHash ?? "0x",
        time: 0,
        treasury: log.address,
      });
    }
  }
  const blocks = [...new Set(out.map((e) => e.block))].slice(-200);
  const times = new Map<bigint, number>();
  await Promise.all(blocks.map(async (b) => times.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))));
  for (const e of out) e.time = times.get(e.block) ?? 0;
  return out.sort((x, y) => (y.block === x.block ? 0 : y.block > x.block ? 1 : -1));
}

/** Treasury events (payouts, rounds, stakes, inflows) for one or more treasuries, newest first. */
export function useTreasuryEvents(treasuries: `0x${string}`[], fromBlock: bigint) {
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const key = treasuries.join(",");
  return useQuery({
    queryKey: ["hoist-events", key, fromBlock.toString()],
    queryFn: () => readEvents(client as PublicClient, treasuries, fromBlock),
    enabled: Boolean(client) && treasuries.length > 0,
    refetchInterval: 30_000,
  });
}

/** Ages like "3h", "2d", "5m". */
export function age(unixSeconds: number | bigint, now = Date.now() / 1000): string {
  const s = Math.max(0, now - Number(unixSeconds));
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 7))}w`;
}

const CURVE_BUY = parseAbiItem("event CurveBuy(address indexed sender, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 snipeTax)");
const CURVE_SELL = parseAbiItem("event CurveSell(address indexed sender, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 snipeTax)");

export type CurveTrade = {
  side: "Buy" | "Sell";
  wallet: `0x${string}`;
  eth: bigint;
  tokens: bigint;
  /** ETH per whole token paid or received in this trade. */
  price: number;
  time: number;
  block: bigint;
  tx: `0x${string}`;
};

export type CurveFeed = { trades: CurveTrade[]; now: number };

async function readCurveTrades(client: PublicClient, curve: `0x${string}`, fromBlock: bigint): Promise<CurveFeed> {
  const latestBlock = await client.getBlock();
  const latest = latestBlock.number;
  const floor = latest > 2_000_000n ? latest - 2_000_000n : 0n;
  const start = fromBlock > floor ? fromBlock : floor;
  const trades: CurveTrade[] = [];
  for (let from = start; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await client.getLogs({ address: curve, events: [CURVE_BUY, CURVE_SELL], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const a = l.args as Record<string, unknown>;
      const buy = l.eventName === "CurveBuy";
      const eth = (buy ? a.quoteIn : a.quoteOut) as bigint;
      const tokens = (buy ? a.tokensOut : a.tokensIn) as bigint;
      trades.push({
        side: buy ? "Buy" : "Sell",
        wallet: a.recipient as `0x${string}`,
        eth,
        tokens,
        price: tokens > 0n ? Number(eth) / Number(tokens) : 0,
        time: 0,
        block: l.blockNumber ?? 0n,
        tx: l.transactionHash ?? "0x",
      });
    }
  }
  const blocks = [...new Set(trades.map((t) => t.block))].slice(-300);
  const times = new Map<bigint, number>();
  await Promise.all(blocks.map(async (b) => times.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp))));
  for (const t of trades) t.time = times.get(t.block) ?? 0;
  return { trades: trades.filter((t) => t.time > 0), now: Number(latestBlock.timestamp) };
}

/** Every buy and sell on a Pons curve since `fromBlock` (oldest first), with the chain's current time. */
export function useCurveTrades(curve: `0x${string}` | undefined, fromBlock: bigint) {
  const client = usePublicClient({ chainId: robinhoodChain.id });
  return useQuery({
    queryKey: ["curve-trades", curve, fromBlock.toString()],
    queryFn: () => readCurveTrades(client as PublicClient, curve!, fromBlock),
    enabled: Boolean(client && curve),
    refetchInterval: 20_000,
  });
}

/** 24h volume (ETH, wei), 24h change (first vs last trade price in the window) and the window's prices. */
export function curveStats(feed: CurveFeed | undefined) {
  if (!feed) return { volume24: null as bigint | null, change24: null as number | null, points: [] as { t: number; p: number }[] };
  const day = feed.trades.filter((t) => t.time >= feed.now - 86_400);
  const volume24 = day.reduce((s, t) => s + t.eth, 0n);
  const change24 = day.length >= 2 && day[0].price > 0 ? ((day[day.length - 1].price - day[0].price) / day[0].price) * 100 : day.length === 1 ? 0 : null;
  return { volume24, change24, points: feed.trades.map((t) => ({ t: t.time, p: t.price })) };
}
