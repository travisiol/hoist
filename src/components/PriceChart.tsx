"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { formatChartPrice as formatPrice } from "@/lib/format";

/**
 * The token's price chart: candles + volume in plain SVG, no chart library and no
 * third-party embed. Data comes from our own `/api/candles` route, which reads
 * GeckoTerminal's public API server-side behind a 5-minute cache (one upstream read
 * per pool and timeframe, whatever the number of visitors).
 */

type Timeframe = "15m" | "1h" | "4h" | "1D";
const FRAMES: Timeframe[] = ["15m", "1h", "4h", "1D"];
const UP = "#14845A";
const DOWN = "#B94A3A";
const MONO = "var(--font-mono), ui-monospace, monospace";

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}
interface ChartData {
  market: { pool: string; name: string; priceUsd: number | null; change24h: number | null } | null;
  candles: Candle[];
  links: { label: string; href: string }[];
}

export function PriceChart({ token }: { token: string }) {
  const [tf, setTf] = useState<Timeframe>("1h");
  const q = useQuery({
    queryKey: ["candles", token.toLowerCase(), tf],
    queryFn: async (): Promise<ChartData> => {
      const r = await fetch(`/api/candles?token=${encodeURIComponent(token)}&tf=${encodeURIComponent(tf)}`);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as ChartData;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const data = q.data;
  const market = data?.market ?? null;
  const change = market?.change24h ?? null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div>
          <p className="text-[14px] font-semibold text-ink-2">Price</p>
          {market?.priceUsd ? (
            <p className="mono mt-1 text-[26px] font-semibold leading-none text-ink">
              {formatPrice(market.priceUsd)}
              {change !== null ? (
                <span className="ml-2 text-[14px] font-semibold" style={{ color: change >= 0 ? UP : DOWN }}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(1)}% 24h
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {market ? (
          <div role="tablist" aria-label="Timeframe" className="flex gap-1">
            {FRAMES.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={f === tf}
                onClick={() => setTf(f)}
                className={`mono h-8 rounded-full px-3 text-[13px] font-semibold transition-colors ${
                  f === tf ? "bg-rasp text-white" : "text-ink-3 hover:bg-blush hover:text-ink"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {market ? (
        <Candles candles={data?.candles ?? []} tf={tf} dim={q.isPlaceholderData} />
      ) : (
        <div className="px-6 pb-8 pt-4">
          <p className="text-[16px] font-semibold text-ink">
            {q.isPending ? "Loading the chart…" : q.isError ? "The chart could not load." : "No market for this coin yet."}
          </p>
          {q.isError ? <p className="mt-1 text-[14px] text-ink-3">The price source did not answer. Try again in a moment.</p> : null}
        </div>
      )}

      {data?.links.length ? (
        <div className="flex justify-end gap-4 px-6 pb-4 pt-2 text-[13px] font-medium text-ink-3">
          {data.links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="hover:text-ink">
              {l.label} ↗
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

function formatTime(t: number, tf: Timeframe): string {
  const iso = new Date(t * 1000).toISOString();
  // 15m spans a day: the hour is enough. 1h and 4h span days: date + hour. 1D: the date.
  return tf === "1D" ? iso.slice(5, 10) : tf === "15m" ? iso.slice(11, 16) : `${iso.slice(5, 10)} ${iso.slice(11, 13)}h`;
}

function Candles({ candles, tf, dim, height = 380 }: { candles: Candle[]; tf: Timeframe; dim: boolean; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(760);
  const box = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(Math.max(280, Math.round(entries[0].contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const W = width;
  const H = height;
  const longest = candles.length ? Math.max(...[...candles.map((k) => k.h), ...candles.map((k) => k.l)].map((p) => formatPrice(p).length)) : 8;
  const pad = { l: 8, r: Math.round(longest * 6.9 + 18), t: 12, b: 26 };
  const volH = Math.round((H - pad.t - pad.b) * 0.18);
  const priceBottom = H - pad.b - volH - 8;
  const plotW = W - pad.l - pad.r;
  const lo = candles.length ? Math.min(...candles.map((k) => k.l)) : 0;
  const hi = candles.length ? Math.max(...candles.map((k) => k.h)) : 1;
  const range = hi - lo || hi * 0.02 || 1;
  const yLo = lo - range * 0.06;
  const yHi = hi + range * 0.06;
  const maxV = Math.max(1, ...candles.map((k) => k.v));
  const step = plotW / Math.max(1, candles.length);
  const bodyW = Math.max(1, Math.min(14, step * 0.68));
  const x = (i: number) => pad.l + step * i + step / 2;
  const y = (p: number) => pad.t + (1 - (p - yLo) / (yHi - yLo)) * (priceBottom - pad.t);
  const ticks = Array.from({ length: 5 }, (_, i) => yLo + ((yHi - yLo) * (i + 0.5)) / 5);
  const nTime = Math.min(5, candles.length, Math.max(2, Math.floor(plotW / 110)));
  const timeTicks = candles.length ? Array.from({ length: nTime }, (_, i) => Math.round(((candles.length - 1) * i) / Math.max(1, nTime - 1))) : [];
  const shown = hover !== null ? candles[hover] : candles[candles.length - 1];
  const first = candles[0];
  const change = shown && first ? ((shown.c - first.o) / first.o) * 100 : null;

  return (
    <div>
      <div className="mono min-h-5 px-6 pb-1.5 pt-3 text-[12px] text-ink-3">
        {shown ? (
          <>
            {formatTime(shown.t, tf)} UTC · O {formatPrice(shown.o)} · H {formatPrice(shown.h)} · L {formatPrice(shown.l)} · C {formatPrice(shown.c)} · Vol{" "}
            {formatVolume(shown.v)}
            {change !== null && hover === null ? (
              <span style={{ color: change >= 0 ? UP : DOWN }}>
                {" "}
                · {change >= 0 ? "+" : ""}
                {change.toFixed(1)}% over the view
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <div ref={box} className="relative px-2 text-ink" style={{ height: H }}>
        {candles.length === 0 ? (
          <div className="grid h-full place-items-center text-[14px] text-ink-3">{dim ? "Loading candles…" : "No trades in this timeframe yet."}</div>
        ) : (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`Price candles, ${tf}`}
            style={{ display: "block", opacity: dim ? 0.5 : 1 }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const i = Math.floor((e.clientX - rect.left - pad.l) / step);
              setHover(i >= 0 && i < candles.length ? i : null);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {ticks.map((p) => (
              <g key={p}>
                <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="var(--color-line)" />
                <text x={W - pad.r + 8} y={y(p) + 4} fontSize={11} fill="var(--color-ink-3)" style={{ fontFamily: MONO }}>
                  {formatPrice(p)}
                </text>
              </g>
            ))}
            {timeTicks.map((i) => (
              <text
                key={i}
                x={Math.min(Math.max(x(i), pad.l + 36), W - pad.r - 36)}
                y={H - 8}
                fontSize={11}
                textAnchor="middle"
                fill="var(--color-ink-3)"
                style={{ fontFamily: MONO }}
              >
                {formatTime(candles[i].t, tf)}
              </text>
            ))}
            {candles.map((k, i) => {
              const color = k.c >= k.o ? UP : DOWN;
              const top = y(Math.max(k.o, k.c));
              const bodyH = Math.max(1, Math.abs(y(k.o) - y(k.c)));
              const vh = (k.v / maxV) * volH;
              return (
                <g key={k.t}>
                  <rect x={x(i) - bodyW / 2} y={H - pad.b - vh} width={bodyW} height={vh} fill={color} fillOpacity={0.22} />
                  <line x1={x(i)} x2={x(i)} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth={1} />
                  <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bodyH} fill={color} rx={bodyW > 4 ? 1 : 0} />
                </g>
              );
            })}
            {hover !== null && candles[hover] ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
                <line x1={pad.l} x2={W - pad.r} y1={y(candles[hover].c)} y2={y(candles[hover].c)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="3 3" />
              </g>
            ) : null}
            {shown ? (
              <g pointerEvents="none">
                <rect x={W - pad.r + 2} y={y(shown.c) - 9} width={pad.r - 4} height={18} rx={4} fill={shown.c >= shown.o ? UP : DOWN} />
                <text x={W - pad.r + 8} y={y(shown.c) + 4} fontSize={11} fill="#fff" style={{ fontFamily: MONO }}>
                  {formatPrice(shown.c)}
                </text>
              </g>
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}
