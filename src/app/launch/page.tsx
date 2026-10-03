import type { Metadata } from "next";
import { LaunchForm } from "@/components/LaunchForm";
import { site } from "@/config/site";
import { splitPct } from "@/config/split";

export const metadata: Metadata = { title: "Launch a coin" };

export default function LaunchPage() {
  return (
    <section className="shell grid gap-10 pt-10 md:grid-cols-[0.8fr_1.2fr] md:pt-14">
      <div>
        <p className="text-[14px] font-bold text-accent">Launch a coin</p>
        <h1 className="mt-2 text-[40px] leading-[1.05] text-ink sm:text-[52px]">{site.hook}</h1>
        <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-ink-2">
          Your token goes live on {site.venue} with its own treasury as the creator-fee recipient. Every fee that reaches
          the treasury is split on chain: {splitPct.holders} to the holders who stake the token, {splitPct.operations} to
          operations, {splitPct.vault} to the platform vault.
        </p>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-3">
          The split is fixed in the contract. Nobody, including you and {site.name}, can change it or move the
          holders&apos; share. Rewards depend on trading: no volume, no fees.
        </p>
      </div>
      <LaunchForm />
    </section>
  );
}
