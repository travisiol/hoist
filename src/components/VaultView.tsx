"use client";

import { useMemo } from "react";
import { useBalance, useReadContract } from "wagmi";
import { robinhoodChain, explorer } from "@/lib/chain";
import { ROUTER_ADDRESS, routerAbi } from "@/lib/contracts";
import { useLaunches, useTotals, useTreasuryEvents, age } from "@/lib/useHoist";
import { ethAmount, shortAddress } from "@/lib/format";
import { splitPct } from "@/config/split";
import { site } from "@/config/site";

/** The platform vault: what every treasury set aside for it, what was paid, what it holds. */
export function VaultView() {
  const t = useTotals();
  const { launches } = useLaunches();
  const vault = useReadContract({ address: ROUTER_ADDRESS ?? undefined, abi: routerAbi, functionName: "vault", chainId: robinhoodChain.id, query: { enabled: Boolean(ROUTER_ADDRESS) } });
  const vaultAddress = vault.data as `0x${string}` | undefined;
  const bal = useBalance({ address: vaultAddress, chainId: robinhoodChain.id, query: { enabled: Boolean(vaultAddress) } });
  const treasuries = useMemo(() => launches.map((l) => l.treasury), [launches]);
  const fromBlock = launches.reduce((m, l) => (l.launchBlock < m ? l.launchBlock : m), launches[0]?.launchBlock ?? 0n);
  const events = useTreasuryEvents(treasuries, fromBlock);
  const inflows = (events.data ?? []).filter((e) => e.kind === "Inflow");
  const symbolOf = (tr: string) => launches.find((l) => l.treasury.toLowerCase() === tr.toLowerCase())?.symbol ?? "";

  return (
    <div className="shell pt-8">
      <p className="text-[14px] font-bold text-accent">Platform vault</p>
      <h1 className="mt-1 text-[36px] text-ink">{splitPct.vault} of every launch&apos;s fees</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-ink-2">
        Each token treasury sets aside {splitPct.vault} of every inflow for the {site.name} vault, plus the rounding
        remainder of the split. Anyone can trigger the payment; it always goes to the one vault address fixed in the
        router. The vault funds the platform. It does not buy back or burn tokens, and holders have no claim on it.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { k: "Set aside, all launches", v: `${ethAmount(t.vaultOwed + t.vaultPaid)} ETH`, up: true },
          { k: "Paid to the vault", v: `${ethAmount(t.vaultPaid)} ETH` },
          { k: "Waiting in treasuries", v: `${ethAmount(t.vaultOwed)} ETH` },
          { k: "Vault balance", v: `${vaultAddress ? ethAmount(bal.data?.value ?? 0n) : "0"} ETH` },
        ].map((x) => (
          <div key={x.k} className="card p-5">
            <p className="label">{x.k}</p>
            <p className={`kpi mt-1 ${x.up ? "text-up" : "text-ink"}`}>{x.v}</p>
          </div>
        ))}
      </section>
      {vaultAddress ? (
        <p className="mt-3 text-[14px] text-ink-3">
          Vault address{" "}
          <a href={explorer.address(vaultAddress)} target="_blank" rel="noreferrer" className="mono link">
            {shortAddress(vaultAddress, 6)} ↗
          </a>
        </p>
      ) : null}

      <h2 className="mt-10 text-[22px] text-ink">Inflows</h2>
      <div className="card mt-3 p-5">
        {inflows.length === 0 ? (
          <p className="text-[15px] text-ink-3">{events.isLoading ? "Reading inflows…" : "No fees have reached a treasury yet."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {inflows.map((e, i) => (
              <li key={`${e.tx}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[14px]">
                <span className="font-bold text-ink">{symbolOf(e.treasury)}</span>
                <span className="text-ink-3">{ethAmount(e.amount)} ETH in</span>
                <span className="mono text-up">{ethAmount(e.extra ?? 0n)} ETH to vault</span>
                <a href={explorer.tx(e.tx)} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-accent">
                  {e.time ? `${age(e.time)} ago` : "tx"} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
