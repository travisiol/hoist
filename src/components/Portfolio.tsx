"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton, useMounted } from "@/components/ConnectButton";
import { TokenLogo } from "@/components/TokenLogo";
import { useLaunches, useRows, useTreasuryEvents, age } from "@/lib/useHoist";
import { explorer } from "@/lib/chain";
import { ethAmount, tokenCompact } from "@/lib/format";

/** Your launches, your stakes, what you can claim and what you were paid. */
export function Portfolio() {
  const mounted = useMounted();
  const { address } = useAccount();
  const { launches } = useLaunches();
  const rows = useRows(launches);
  const me = address?.toLowerCase();
  const mine = rows.filter((r) => me && r.creator.toLowerCase() === me);
  const stakes = rows.filter((r) => (r.status?.yourStake ?? 0n) > 0n || (r.status?.yourClaimable ?? 0n) > 0n);
  const treasuries = useMemo(() => launches.map((l) => l.treasury), [launches]);
  const fromBlock = launches.reduce((m, l) => (l.launchBlock < m ? l.launchBlock : m), launches[0]?.launchBlock ?? 0n);
  const events = useTreasuryEvents(me ? treasuries : [], fromBlock);
  const payouts = (events.data ?? []).filter((e) => e.kind === "Paid" && e.account?.toLowerCase() === me);
  const claimable = stakes.reduce((s, r) => s + (r.status?.yourClaimable ?? 0n), 0n);
  const received = payouts.reduce((s, e) => s + e.amount, 0n);
  const symbolOf = (treasury: string) => launches.find((l) => l.treasury.toLowerCase() === treasury.toLowerCase())?.symbol ?? "";

  return (
    <div className="shell pt-8">
      <h1 className="text-[36px] text-ink">Portfolio</h1>
      <p className="mt-1 text-[16px] text-ink-3">Your launches, your stakes, what you can claim and what you were paid.</p>
      {!mounted || !address ? (
        <div className="card mt-6 flex flex-col items-start gap-4 p-6">
          <p className="text-[16px] text-ink-2">Connect a wallet to see its positions.</p>
          <ConnectButton />
        </div>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { k: "Claimable now", v: `${ethAmount(claimable)} ETH`, up: true },
              { k: "Payouts received", v: `${ethAmount(received)} ETH` },
              { k: "Staking positions", v: String(stakes.length) },
              { k: "Your launches", v: String(mine.length) },
            ].map((x) => (
              <div key={x.k} className="card p-5">
                <p className="label">{x.k}</p>
                <p className={`kpi mt-1 ${x.up ? "text-up" : "text-ink"}`}>{x.v}</p>
              </div>
            ))}
          </section>

          <h2 className="mt-10 text-[22px] text-ink">Stakes</h2>
          <List
            empty="You have no stake yet. Open a token and stake it to share its fees."
            rows={stakes.map((r) => ({ r, right: `${tokenCompact(r.status?.yourStake ?? 0n)} staked · ${ethAmount(r.status?.yourClaimable ?? 0n)} ETH to claim` }))}
          />

          <h2 className="mt-10 text-[22px] text-ink">Your launches</h2>
          <List
            empty="You have not launched a coin here."
            rows={mine.map((r) => ({ r, right: `${ethAmount(r.status?.totalPaidToHolders ?? 0n)} ETH paid to holders` }))}
          />

          <h2 className="mt-10 text-[22px] text-ink">Payouts received</h2>
          <div className="card mt-3 p-5">
            {payouts.length === 0 ? (
              <p className="text-[15px] text-ink-3">{events.isLoading ? "Reading payouts…" : "No payouts to this wallet yet."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {payouts.map((e) => (
                  <li key={e.tx} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                    <span className="font-bold text-ink">{symbolOf(e.treasury)}</span>
                    <span className="mono text-up">{ethAmount(e.amount)} ETH</span>
                    <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-accent">
                      {e.time ? `${age(e.time)} ago` : "tx"} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function List({ rows, empty }: { rows: { r: ReturnType<typeof useRows>[number]; right: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="card mt-3 p-5 text-[15px] text-ink-3">{empty}</p>;
  return (
    <div className="mt-3">
      {rows.map(({ r, right }) => (
        <Link key={r.token} href={`/${r.token}`} className="trow flex items-center justify-between gap-3 px-3 py-3">
          <span className="flex items-center gap-3">
            <TokenLogo logo={r.logo} symbol={r.symbol} size={40} />
            <span>
              <span className="block font-bold text-ink">{r.name}</span>
              <span className="text-[14px] text-ink-3">{r.symbol}</span>
            </span>
          </span>
          <span className="mono text-right text-[14px] text-ink">{right}</span>
        </Link>
      ))}
    </div>
  );
}
