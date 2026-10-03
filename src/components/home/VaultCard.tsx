"use client";

import Link from "next/link";
import { useBalance, useReadContract } from "wagmi";
import { robinhoodChain } from "@/lib/chain";
import { ROUTER_ADDRESS, routerAbi } from "@/lib/contracts";
import { useTotals } from "@/lib/useHoist";
import { ethAmount } from "@/lib/format";
import { splitPct } from "@/config/split";
import { site } from "@/config/site";

/** The platform vault: 5% of every treasury's inflows. Balance and inflows only. */
export function VaultCard() {
  const t = useTotals();
  const vault = useReadContract({ address: ROUTER_ADDRESS ?? undefined, abi: routerAbi, functionName: "vault", chainId: robinhoodChain.id, query: { enabled: Boolean(ROUTER_ADDRESS) } });
  const vaultAddress = vault.data as `0x${string}` | undefined;
  const bal = useBalance({ address: vaultAddress, chainId: robinhoodChain.id, query: { enabled: Boolean(vaultAddress) } });
  const inflows = t.vaultOwed + t.vaultPaid;
  return (
    <section className="card mt-6 grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[1.3fr_1fr_1.6fr] lg:items-center">
      <div className="flex gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v12M7 8l5-5 5 5M5 21h14" /></svg>
        </span>
        <div>
          <p className="text-[14px] font-bold text-up">Platform vault</p>
          <h2 className="text-[19px] text-ink">{splitPct.vault} of every launch&apos;s fees</h2>
          <p className="mt-1 text-[14px] text-ink-3">
            Each token treasury sets aside {splitPct.vault} of what it receives for the {site.name} vault, paid out by
            pull payment to one fixed address. It funds the platform; it does not buy or burn tokens.
          </p>
        </div>
      </div>
      <div className="lg:border-l lg:border-line lg:pl-6">
        <p className="label">All launches → vault</p>
        <p className="kpi mt-1 text-up">{ethAmount(inflows)} ETH</p>
        <p className="text-[14px] text-ink-3">Set aside across all treasuries</p>
      </div>
      <div className="grid grid-cols-3 gap-4 lg:border-l lg:border-line lg:pl-6">
        <div>
          <p className="label">Paid to vault</p>
          <p className="num text-[20px] text-ink">{ethAmount(t.vaultPaid)} ETH</p>
        </div>
        <div>
          <p className="label">Waiting</p>
          <p className="num text-[20px] text-ink">{ethAmount(t.vaultOwed)} ETH</p>
        </div>
        <div>
          <p className="label">Vault balance</p>
          <p className="num text-[20px] text-ink">{vaultAddress ? ethAmount(bal.data?.value ?? 0n) : "0"} ETH</p>
        </div>
        <Link href="/vault" className="col-span-3 text-[14px] font-bold text-accent hover:underline">
          View the vault ↗
        </Link>
      </div>
    </section>
  );
}
