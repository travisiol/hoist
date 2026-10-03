"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { TokenLogo } from "@/components/TokenLogo";
import { MarketPanel } from "@/components/MarketPanel";
import { TradePanel } from "@/components/TradePanel";
import { StakePanel } from "@/components/StakePanel";
import { useMarket } from "@/components/home/TokenTable";
import { explorer, ponsTradeUrl, robinhoodChain } from "@/lib/chain";
import { ROUTER_ADDRESS, routerAbi, treasuryAbi, type LaunchInfo, type TreasuryStatus } from "@/lib/contracts";
import { curveAbi } from "@/lib/ponsAbi";
import { age, useCurveTrades, useTreasuryEvents, type TreasuryEvent } from "@/lib/useHoist";
import { ethAmount, formatUsdCompact, shortAddress, tokenCompact } from "@/lib/format";
import { splitPct } from "@/config/split";
import { site } from "@/config/site";

const TABS = ["Overview", "Payouts", "Stakers", "About"] as const;
type Tab = (typeof TABS)[number];
const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function TokenView({ token }: { token: `0x${string}` }) {
  const { address } = useAccount();
  const infoQ = useReadContract({
    address: ROUTER_ADDRESS ?? undefined,
    abi: routerAbi,
    functionName: "infoOf",
    args: [token],
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(ROUTER_ADDRESS) },
  });
  const info = infoQ.data as LaunchInfo | undefined;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: info
      ? [
          { address: info.treasury, abi: treasuryAbi, functionName: "status", args: [address ?? ZERO], chainId: robinhoodChain.id },
          { address: info.curve, abi: curveAbi, functionName: "getReserves", chainId: robinhoodChain.id },
          { address: info.curve, abi: curveAbi, functionName: "graduated", chainId: robinhoodChain.id },
        ]
      : [],
    query: { enabled: Boolean(info), refetchInterval: 10_000 },
  });
  const status = reads.data?.[0]?.status === "success" ? (reads.data[0].result as TreasuryStatus) : null;
  const reserves = reads.data?.[1]?.status === "success" ? (reads.data[1].result as readonly [bigint, bigint]) : null;
  const graduated = reads.data?.[2]?.status === "success" ? Boolean(reads.data[2].result) : false;
  const mcap = reserves && reserves[1] > 0n ? (reserves[0] * 1_000_000_000n * 10n ** 18n) / reserves[1] : null;
  const refetch = reads.refetch;
  const onDone = useCallback(() => {
    refetch();
  }, [refetch]);

  const treasuries = useMemo(() => (info ? [info.treasury] : []), [info]);
  const events = useTreasuryEvents(treasuries, info?.launchBlock ?? 0n);
  const market = useMarket(token).data?.market ?? null;
  const [tab, setTab] = useState<Tab>("Overview");
  const [win, setWin] = useState<6 | 24 | 168>(24);
  const [now] = useState(() => Math.floor(Date.now() / 1000));

  if (!ROUTER_ADDRESS || infoQ.isError) {
    return (
      <div className="shell pt-10">
        <Link href="/" className="text-[14px] font-bold text-accent">← All tokens</Link>
        <div className="card mt-5 px-6 py-14 text-center">
          <p className="text-[20px] font-extrabold text-ink">This token was not launched on {site.name}.</p>
          <p className="mt-2 text-[15px] text-ink-3 mono break-all">{token}</p>
        </div>
      </div>
    );
  }
  if (!info) {
    return (
      <div className="shell pt-10">
        <p className="text-[15px] text-ink-3">Reading the token…</p>
      </div>
    );
  }

  const all = events.data ?? [];
  const paid = all.filter((e) => e.kind === "Paid");
  const recent = paid.filter((e) => e.time >= now - win * 3600);
  const recentSum = recent.reduce((s, e) => s + e.amount, 0n);
  const wallets = new Set(paid.map((e) => e.account)).size;
  const combined = info.creatorTaxBps / 100 + site.ponsFeeBps / 100;

  return (
    <div className="shell pt-6">
      <Link href="/" className="text-[14px] font-bold text-accent">← All tokens</Link>

      <header className="mt-4 flex flex-wrap items-center gap-4">
        <TokenLogo logo={info.logo} symbol={info.symbol} size={60} />
        <div className="min-w-0">
          <h1 className="text-[30px] leading-tight text-ink">
            {info.name} <span className="text-ink-3">{info.symbol}</span> <span className="text-[18px] font-bold text-ink-3">/ ETH</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-ink-3">
            <span className="pill-eth">◆ Rewards ETH</span>
            <span className="chip">{info.creatorTaxBps / 100}% creator tax</span>
            <span className="chip">{graduated ? "Graduated" : "Bonding curve"}</span>
            <span>{age(info.launchedAt)} old</span>
            <a href={explorer.token(token)} target="_blank" rel="noreferrer" className="mono hover:text-ink">{shortAddress(token)} ↗</a>
            <a href={ponsTradeUrl(token)} target="_blank" rel="noreferrer" className="link">Pons ↗</a>
            <span>{site.chain}</span>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <p className="label">All-time paid to holders</p>
          <p className="text-[14px] font-semibold text-up">Confirmed on chain</p>
          <p className="kpi mt-2 text-ink">{ethAmount(status?.totalPaidToHolders ?? 0n)} ETH</p>
          <p className="mt-1 text-[14px] text-ink-3">{wallets} wallets paid · {paid.length} payments · {(status?.rounds ?? 0n).toString()} rounds</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="label">Recent payouts</p>
            <div className="seg" role="tablist" aria-label="Window">
              {([6, 24, 168] as const).map((h) => (
                <button key={h} type="button" role="tab" aria-selected={win === h} className="seg-opt !px-2.5 !py-1" onClick={() => setWin(h)}>
                  {h === 168 ? "7d" : `${h}h`}
                </button>
              ))}
            </div>
          </div>
          <p className="kpi mt-3 text-ink">{ethAmount(recentSum)} ETH</p>
          <p className="mt-1 text-[14px] text-ink-3">
            {recent.length} payments in this period{paid[0] ? ` · last ${age(paid[0].time)} ago` : ""} ·{" "}
            <button type="button" className="link" onClick={() => setTab("Payouts")}>View payouts</button>
          </p>
        </div>
        <div className="card p-5">
          <p className="label">Holder treasury</p>
          <dl className="mt-2 grid grid-cols-2 gap-y-2 text-[14px]">
            <dt className="text-ink-3">Treasury balance</dt>
            <dd className="mono text-right text-ink">{ethAmount(status?.balance ?? 0n)} ETH</dd>
            <dt className="text-ink-3">In Pons escrow</dt>
            <dd className="mono text-right text-ink">{ethAmount(status?.pendingInEscrow ?? 0n)} ETH</dd>
            <dt className="text-ink-3">Last pull</dt>
            <dd className="text-right text-ink">{status && status.lastPullAt > 0n ? `${age(status.lastPullAt)} ago` : "—"}</dd>
            <dt className="text-ink-3">Stakers</dt>
            <dd className="mono text-right text-ink">{(status?.stakers ?? 0n).toString()}</dd>
            {status && status.waiting > 0n ? (
              <>
                <dt className="text-ink-3">Waiting for stakers</dt>
                <dd className="mono text-right text-ink">{ethAmount(status.waiting)} ETH</dd>
              </>
            ) : null}
          </dl>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="label">Market cap</p>
          <p className="num text-[22px] text-ink">{mcap !== null ? `${ethAmount(mcap)} ETH` : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="label">24h volume</p>
          <p className="num text-[22px] text-ink">{market?.volume24hUsd != null ? formatUsdCompact(market.volume24hUsd) : "—"}</p>
        </div>
        <div className="card p-4">
          <p className="label">Total staked</p>
          <p className="num text-[22px] text-ink">{tokenCompact(status?.totalStaked ?? 0n)}</p>
        </div>
      </section>
      <p className="mt-2 text-[14px] text-ink-3">Amounts in ETH, read from the contracts. Payouts are made in ETH.</p>

      <nav className="mt-6 flex gap-6 border-b border-line" role="tablist" aria-label="Token sections">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === "Overview" ? (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-5">
            <MarketPanel token={token} curve={info.curve} launchBlock={info.launchBlock} reserves={reserves} />
            <Activity events={all.filter((e) => e.kind !== "Inflow").slice(0, 8)} title="Payout activity" />
            <Trades curve={info.curve} launchBlock={info.launchBlock} symbol={info.symbol} />
          </div>
          <div className="flex flex-col gap-5 lg:sticky lg:top-[92px]">
            <TradePanel token={token} curve={info.curve} symbol={info.symbol} graduated={graduated} />
            <StakePanel token={token} treasury={info.treasury} symbol={info.symbol} status={status} onDone={onDone} />
            <p className="text-[14px] text-ink-3">Creator tax {info.creatorTaxBps / 100}% · Pons fee {site.ponsFeeBps / 100}% · Combined {combined}%</p>
          </div>
        </div>
      ) : null}
      {tab === "Payouts" ? <Activity events={paid} title="Payouts" full /> : null}
      {tab === "Stakers" ? <Stakers events={all} /> : null}
      {tab === "About" ? (
        <div className="card mt-5 max-w-3xl p-6 text-[15px] leading-relaxed text-ink-2">
          <h2 className="text-[20px] text-ink">How {info.symbol} pays its holders</h2>
          <p className="mt-2">
            {info.name} launched on {site.venue} through {site.name}. Its creator-fee recipient is its own treasury contract.
            Every wei that reaches the treasury is split once: {splitPct.holders} to the holders who stake {info.symbol} there,
            {" "}{splitPct.operations} to operations, {splitPct.vault} to the platform vault. Stakers share their part pro rata to
            their stake at the moment the fees are split, and claim it in ETH whenever they want.
          </p>
          <p className="mt-2">
            Holding without staking earns nothing. When fees arrive and nobody is staked, the holders&apos; part waits in the
            treasury and goes to the stakers present at the next pull.
          </p>
          <dl className="mt-4 grid gap-2 text-[14px] sm:grid-cols-2">
            <Addr k="Token" a={token} />
            <Addr k="Treasury" a={info.treasury} />
            <Addr k="Curve" a={info.curve} />
            <Addr k="Creator" a={info.creator} />
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function Addr({ k, a }: { k: string; a: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-[12px] bg-[#f6f1e6] px-3 py-2">
      <dt className="text-ink-3">{k}</dt>
      <dd>
        <a href={explorer.address(a)} target="_blank" rel="noreferrer" className="mono text-ink hover:text-accent">{shortAddress(a, 6)} ↗</a>
      </dd>
    </div>
  );
}

const LABEL: Record<TreasuryEvent["kind"], string> = { Paid: "Claimed", Round: "Round shared", Staked: "Staked", Unstaked: "Unstaked", Inflow: "Fees in", Released: "Released" };

function Activity({ events, title, full = false }: { events: TreasuryEvent[]; title: string; full?: boolean }) {
  return (
    <div className={`card p-5 ${full ? "mt-5" : ""}`}>
      <h2 className="text-[18px] text-ink">{title}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-3">Nothing yet. Rounds appear when fees reach the treasury and someone is staked.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {events.map((e, i) => (
            <li key={`${e.tx}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
              <span className="font-bold text-ink">{LABEL[e.kind]}</span>
              <span className="mono text-ink-3">{e.kind === "Round" ? "to stakers" : e.account ? shortAddress(e.account) : ""}</span>
              <span className={`mono ${e.kind === "Paid" ? "text-up" : "text-ink"}`}>
                {e.kind === "Staked" || e.kind === "Unstaked" ? tokenCompact(e.amount) : `${ethAmount(e.amount)} ETH`}
              </span>
              <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-accent">{e.time ? `${age(e.time)} ago` : "tx"} ↗</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stakers({ events }: { events: TreasuryEvent[] }) {
  const rows = useMemo(() => {
    const m = new Map<string, bigint>();
    for (const e of [...events].reverse()) {
      if (!e.account) continue;
      if (e.kind === "Staked") m.set(e.account, (m.get(e.account) ?? 0n) + e.amount);
      if (e.kind === "Unstaked") m.set(e.account, (m.get(e.account) ?? 0n) - e.amount);
    }
    return [...m.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : -1));
  }, [events]);
  const total = rows.reduce((s, [, v]) => s + v, 0n);
  return (
    <div className="card mt-5 p-5">
      <h2 className="text-[18px] text-ink">Stakers</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-3">Nobody has staked this token yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map(([a, v]) => (
            <li key={a} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
              <a href={explorer.address(a)} target="_blank" rel="noreferrer" className="mono text-ink hover:text-accent">{shortAddress(a, 6)}</a>
              <span className="mono text-ink">{tokenCompact(v)}</span>
              <span className="mono text-ink-3">{total > 0n ? (Number((v * 10_000n) / total) / 100).toFixed(2) : "0"}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Trades({ curve, launchBlock, symbol }: { curve: `0x${string}`; launchBlock: bigint; symbol: string }) {
  const q = useCurveTrades(curve, launchBlock);
  const trades = [...(q.data?.trades ?? [])].reverse().slice(0, 10);
  return (
    <div className="card p-5">
      <h2 className="text-[18px] text-ink">Recent trading activity</h2>
      {trades.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-3">{q.isLoading ? "Reading trades…" : "No trades on the curve yet."}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[14px]">
            <thead className="text-ink-3">
              <tr>
                <th className="py-2 font-semibold">Side</th>
                <th className="py-2 font-semibold">Wallet</th>
                <th className="py-2 text-right font-semibold">ETH</th>
                <th className="py-2 text-right font-semibold">{symbol}</th>
                <th className="py-2 text-right font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {trades.map((t) => (
                <tr key={t.tx + t.side}>
                  <td className={`py-2 font-bold ${t.side === "Buy" ? "text-up" : "text-down"}`}>{t.side}</td>
                  <td className="mono py-2 text-ink">{shortAddress(t.wallet)}</td>
                  <td className="mono py-2 text-right text-ink">{ethAmount(t.eth)}</td>
                  <td className="mono py-2 text-right text-ink">{tokenCompact(t.tokens)}</td>
                  <td className="py-2 text-right">
                    <a href={explorer.tx(t.tx)} target="_blank" rel="noreferrer" className="link">{age(t.time, q.data?.now)} ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
