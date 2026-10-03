"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TokenLogo } from "@/components/TokenLogo";
import { useLaunches, useRows, useCurveTrades, curveStats, age, type Row } from "@/lib/useHoist";
import { ethAmount, ethPrice, formatUsdCompact } from "@/lib/format";

const PER_PAGE = 12;
const SORTS = [
  { id: "mcap", label: "Market cap" },
  { id: "rewards", label: "Rewards paid" },
  { id: "stakers", label: "Stakers" },
  { id: "newest", label: "Newest" },
] as const;
type SortId = (typeof SORTS)[number]["id"];

type Market = { change24h: number | null; volume24hUsd: number | null } | null;
type Candles = { market: Market; candles: { t: number; c: number }[] };

/** 24h change, volume and a sparkline from GeckoTerminal (server-cached). Empty when the token has no indexed pool. */
export function useMarket(token: string) {
  return useQuery({
    queryKey: ["spark", token.toLowerCase()],
    queryFn: async (): Promise<Candles> => {
      const r = await fetch(`/api/candles?token=${token}&tf=15m`);
      if (!r.ok) return { market: null, candles: [] };
      return (await r.json()) as Candles;
    },
    staleTime: 5 * 60_000,
  });
}

function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-ink-4">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 90;
  const h = 24;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const color = last > first ? "#14845A" : last < first ? "#B94A3A" : "#71808A";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

const COLS = "md:grid-cols-[minmax(230px,2.3fr)_1fr_1fr_1.1fr_1fr_1fr_1fr_0.7fr_20px]";

function TokenRow({ row }: { row: Row }) {
  const m = useMarket(row.token);
  const gt = m.data?.market ?? null;
  const feed = useCurveTrades(row.curve, row.launchBlock);
  const curve = curveStats(feed.data);
  const candles = m.data?.candles ?? [];
  const latest = candles.length ? candles[candles.length - 1].t : 0;
  const now = feed.data?.now ?? 0;
  const pts = gt
    ? candles.filter((c) => c.t >= latest - 86400).map((c) => c.c)
    : curve.points.filter((x) => x.t >= now - 86400).map((x) => x.p);
  const change = gt?.change24h ?? curve.change24;
  const price = row.mcapWei !== null ? Number(row.mcapWei) / 1e18 / 1e9 : null;
  const volume = gt?.volume24hUsd != null ? formatUsdCompact(gt.volume24hUsd) : curve.volume24 !== null ? `${ethAmount(curve.volume24)} ETH` : "…";
  return (
    <Link href={`/${row.token}`} className={`trow grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 ${COLS}`}>
      <span className="flex min-w-0 items-center gap-3">
        <TokenLogo logo={row.logo} symbol={row.symbol} size={42} />
        <span className="min-w-0">
          <span className="block truncate text-[16px] font-bold text-ink">{row.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[14px] text-ink-3">
            <span className="font-semibold">{row.symbol}</span>
            <span aria-hidden>·</span>
            <span>{age(row.launchedAt)}</span>
            <span className="pill-eth">◆ Pays ETH</span>
            <span className="chip">{row.creatorTaxBps / 100}% tax</span>
          </span>
        </span>
      </span>
      <span className="cell-num text-right">
        {price !== null ? ethPrice(price) : "…"}
        <span className="block text-[13px] font-normal text-ink-3 md:hidden">{row.mcapWei !== null ? `${ethAmount(row.mcapWei)} ETH cap` : ""}</span>
      </span>
      <span className="cell-num hidden text-right md:block">{row.mcapWei !== null ? `${ethAmount(row.mcapWei)} ETH` : "…"}</span>
      <span className="hidden flex-col items-end md:flex">
        <span className={`cell-num ${change === null ? "text-ink-3" : change >= 0 ? "text-up" : "text-down"}`}>
          {change === null ? "…" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        </span>
        {pts.length >= 2 ? <Spark points={pts} /> : null}
      </span>
      <span className="cell-num hidden text-right md:block">{volume}</span>
      <span className="cell-num hidden text-right md:block">{ethAmount(row.status?.balance ?? 0n)} ETH</span>
      <span className="cell-num hidden text-right text-up md:block">{ethAmount(row.status?.totalPaidToHolders ?? 0n)} ETH</span>
      <span className="cell-num hidden text-right md:block">{(row.status?.stakers ?? 0n).toString()}</span>
      <span className="hidden text-ink-3 md:block" aria-hidden>
        ↗
      </span>
    </Link>
  );
}

export function TokenTable() {
  const { launches, loading } = useLaunches();
  const rows = useRows(launches);
  const [q, setQ] = useState("");
  const [currency, setCurrency] = useState<"all" | "eth">("all");
  const [sort, setSort] = useState<SortId>("mcap");
  const [page, setPage] = useState(0);

  // Every HOIST token pays its holders in ETH, so both currency choices keep the whole list.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter(
      (r) => !needle || r.name.toLowerCase().includes(needle) || r.symbol.toLowerCase().includes(needle) || r.token.toLowerCase().includes(needle),
    );
    const val = (r: Row): bigint =>
      sort === "mcap" ? (r.mcapWei ?? 0n) : sort === "rewards" ? (r.status?.totalPaidToHolders ?? 0n) : sort === "stakers" ? (r.status?.stakers ?? 0n) : r.launchedAt;
    return [...list].sort((a, b) => (val(b) > val(a) ? 1 : val(b) < val(a) ? -1 : 0));
  }, [rows, q, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const slice = shown.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search</span>
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="field !pl-10"
            placeholder="Search name, ticker, or address"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-[14px] font-semibold text-ink-2">
          Reward currency
          <select className="bg-transparent font-bold text-accent outline-none" value={currency} onChange={(e) => setCurrency(e.target.value as "all" | "eth")}>
            <option value="all">All</option>
            <option value="eth">ETH</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5 text-[14px] font-semibold text-ink-2">
          Sort
          <select className="bg-transparent font-bold text-ink outline-none" value={sort} onChange={(e) => setSort(e.target.value as SortId)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Link href="/launch" className="btn btn-primary">
          Launch a coin
        </Link>
      </div>

      <div className={`mt-5 hidden gap-3 border-b border-line px-3 pb-3 text-[14px] font-semibold text-ink-3 md:grid ${COLS}`}>
        <span>Token</span>
        <span className="text-right">Price (ETH)</span>
        <span className="text-right">Market cap</span>
        <span className="text-right">24h</span>
        <span className="text-right">24h volume</span>
        <span className="text-right">Treasury</span>
        <span className="text-right">Rewards paid</span>
        <span className="text-right">Stakers</span>
        <span />
      </div>
      <div className="mt-2 md:mt-0">
        {slice.map((r) => (
          <TokenRow key={r.token} row={r} />
        ))}
        {slice.length === 0 ? (
          <div className="card mt-3 px-6 py-12 text-center">
            <p className="text-[18px] font-extrabold text-ink">{loading ? "Reading launches…" : q ? "No token matches that search." : "No tokens launched yet"}</p>
            {!loading && !q ? (
              <p className="mt-1 text-[15px] text-ink-3">
                The first coin launched here shows up in this table.{" "}
                <Link href="/launch" className="link">
                  Launch a coin
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between px-3 text-[14px] text-ink-3">
        <span>{shown.length === 0 ? "0 coins" : `${current * PER_PAGE + 1}–${current * PER_PAGE + slice.length} of ${shown.length} coins`}</span>
        <span className="flex items-center gap-3">
          <button type="button" className="px-2 disabled:opacity-40" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Previous page">
            ←
          </button>
          <span className="font-bold text-ink">{current + 1}</span>
          <button type="button" className="px-2 disabled:opacity-40" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Next page">
            →
          </button>
        </span>
      </div>
    </section>
  );
}
