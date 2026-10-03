"use client";

import Link from "next/link";
import { useTotals } from "@/lib/useHoist";
import { ethAmount } from "@/lib/format";

/** The five platform numbers, read from the router's totals() view. */
export function Kpis() {
  const t = useTotals();
  const tiles = [
    { k: "Holder rewards paid", v: `${ethAmount(t.paidToHolders)} ETH`, sub: "Claimed by stakers, in ETH", tone: "up" },
    { k: "Total treasury", v: `${ethAmount(t.treasuryBalance)} ETH`, sub: "Held for stakers and the 80/15/5 split", tone: "up" },
    { k: "Tokens launched", v: t.tokensLaunched.toString(), sub: "Each with its own treasury" },
    { k: "Staking positions", v: t.stakers.toString(), sub: "Wallets staked across tokens" },
    { k: "Reward rounds", v: t.rounds.toString(), sub: "See the payouts", href: "/docs#evidence" },
  ];
  return (
    <section className="card mt-5 grid grid-cols-2 gap-y-6 px-5 py-6 sm:px-7 lg:grid-cols-5 lg:divide-x lg:divide-line">
      {tiles.map((x, i) => (
        <div key={x.k} className={`lg:px-6 ${i === 0 ? "lg:pl-0" : ""} ${i === 4 ? "col-span-2 lg:col-span-1" : ""}`}>
          <span className="block h-[3px] w-10 rounded-full bg-accent" />
          <p className="label mt-2">{x.k}</p>
          <p className={`kpi mt-1 ${x.tone === "up" ? "text-up" : "text-ink"}`}>{x.v}</p>
          {x.href ? (
            <Link href={x.href} className="text-[14px] font-semibold text-accent hover:underline">
              {x.sub} ↗
            </Link>
          ) : (
            <p className="text-[14px] text-ink-3">{x.sub}</p>
          )}
        </div>
      ))}
    </section>
  );
}
