"use client";

import { useReadContracts } from "wagmi";
import { PriceChart } from "@/components/PriceChart";
import { useMarket } from "@/components/home/TokenTable";
import { robinhoodChain } from "@/lib/chain";
import { curveAbi } from "@/lib/ponsAbi";
import { curveStats, useCurveTrades } from "@/lib/useHoist";
import { ethAmount, ethPrice } from "@/lib/format";

const W = 800;
const H = 250;

/** Price per trade over time, from the curve's own buy/sell events. Real points only. */
function CurveChart({ points }: { points: { t: number; p: number }[] }) {
  const ps = points.map((x) => x.p);
  const min = Math.min(...ps);
  const max = Math.max(...ps);
  const pad = (max - min) * 0.12 || max * 0.05 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const span = t1 - t0 || 1;
  const x = (t: number) => (points.length === 1 ? W / 2 : ((t - t0) / span) * (W - 16) + 8);
  const y = (p: number) => H - ((p - lo) / (hi - lo)) * H;
  const d = points.map((pt, i) => `${i ? "L" : "M"}${x(pt.t).toFixed(1)},${y(pt.p).toFixed(1)}`).join(" ");
  const up = ps[ps.length - 1] >= ps[0];
  const color = up ? "#14845A" : "#B94A3A";
  const fmt = (t: number) => new Date(t * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[250px] w-full" aria-label="Price per trade on the curve">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#C9D9E1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${d} L${x(t1).toFixed(1)},${H} L${x(t0).toFixed(1)},${H} Z`} fill={color} opacity="0.07" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="mono absolute right-1 top-0 text-[13px] text-ink-3">{ethPrice(max)}</span>
      <span className="mono absolute bottom-0 right-1 text-[13px] text-ink-3">{ethPrice(min)}</span>
      <div className="mt-1 flex justify-between text-[13px] text-ink-3">
        <span>{fmt(t0)}</span>
        <span>{points.length} trades</span>
        <span>{fmt(t1)}</span>
      </div>
    </div>
  );
}

export function MarketPanel({ token, curve, launchBlock, reserves }: { token: `0x${string}`; curve: `0x${string}`; launchBlock: bigint; reserves: readonly [bigint, bigint] | null }) {
  const feed = useCurveTrades(curve, launchBlock);
  const stats = curveStats(feed.data);
  const gt = useMarket(token).data?.market ?? null;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: curve, abi: curveAbi, functionName: "realQuoteReserve", chainId: robinhoodChain.id },
      { address: curve, abi: curveAbi, functionName: "graduationThreshold", chainId: robinhoodChain.id },
    ],
    query: { refetchInterval: 15_000 },
  });
  const real = reads.data?.[0]?.status === "success" ? (reads.data[0].result as bigint) : null;
  const threshold = reads.data?.[1]?.status === "success" ? (reads.data[1].result as bigint) : null;
  const progress = real !== null && threshold && threshold > 0n ? Math.min(100, Number((real * 10_000n) / threshold) / 100) : null;
  const price = reserves && reserves[1] > 0n ? Number(reserves[0]) / Number(reserves[1]) : null;
  const mcap = reserves && reserves[1] > 0n ? (reserves[0] * 1_000_000_000n * 10n ** 18n) / reserves[1] : null;
  const change = stats.change24;

  const stat = (k: string, v: React.ReactNode) => (
    <div className="min-w-0">
      <p className="label">{k}</p>
      <p className="num mt-0.5 truncate text-[20px] text-ink">{v}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stat("Price", price !== null ? <>{ethPrice(price)} <span className="text-[14px] text-ink-3">ETH</span></> : "—")}
          {stat("Market cap", mcap !== null ? `${ethAmount(mcap)} ETH` : "—")}
          {stat("24h volume", stats.volume24 !== null ? `${ethAmount(stats.volume24)} ETH` : "…")}
          {stat(
            "24h change",
            change === null ? (
              "0.00%"
            ) : (
              <span className={change >= 0 ? "text-up" : "text-down"}>
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            ),
          )}
          {progress !== null ? (
            <div className="min-w-0">
              <p className="label">Curve progress</p>
              <p className="num mt-0.5 text-[20px] text-ink">{progress.toFixed(1)}%</p>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#E6EEF2]">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </span>
            </div>
          ) : null}
        </div>
        {gt ? null : (
          <div className="mt-5 min-h-[290px]">
            {stats.points.length > 0 ? (
              <CurveChart points={stats.points} />
            ) : (
              <div className="grid h-[280px] place-items-center rounded-[14px] bg-[#F7F3EA] text-center">
                <div>
                  <p className="text-[17px] font-extrabold text-ink">{feed.isLoading ? "Reading trades…" : "No trades yet"}</p>
                  <p className="mt-1 text-[14px] text-ink-3">Curve price now: {price !== null ? `${ethPrice(price)} ETH` : "—"}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {gt ? <PriceChart token={token} /> : null}
    </div>
  );
}
