"use client";

import Link from "next/link";
import { useState } from "react";
import { decodeEventLog, parseEther, type Hex } from "viem";
import { useAccount, useConnect, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { ROUTER_ADDRESS, routerAbi } from "@/lib/contracts";
import { robinhoodChain, explorer } from "@/lib/chain";
import { formatWei } from "@/lib/format";
import { site } from "@/config/site";
import { splitPct } from "@/config/split";

type Errors = Partial<Record<"name" | "symbol" | "logo" | "buy", string>>;

function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

function validate(v: { name: string; symbol: string; logo: string; buy: string }): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = "Give the token a name.";
  else if (v.name.trim().length > 32) e.name = "32 characters at most.";
  if (!v.symbol.trim()) e.symbol = "Give the token a ticker.";
  else if (!/^[A-Za-z0-9]{1,10}$/.test(v.symbol.trim())) e.symbol = "Letters and digits, 10 at most.";
  if (v.logo.trim() && !/^(https:\/\/\S+|ipfs:\/\/[a-zA-Z0-9]+)$/.test(v.logo.trim())) e.logo = "Use an https:// or ipfs:// link.";
  if (v.buy.trim()) {
    try {
      parseEther(v.buy.trim());
    } catch {
      e.buy = "Enter an amount in ETH, like 0.01.";
    }
  }
  return e;
}

export function LaunchForm() {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [logo, setLogo] = useState("");
  const [tax, setTax] = useState<number>(site.defaultTaxBps);
  const [buy, setBuy] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState<{ token: string; hash: string } | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const fee = useReadContract({
    address: ROUTER_ADDRESS ?? undefined,
    abi: routerAbi,
    functionName: "ponsLaunchFee",
    chainId: robinhoodChain.id,
    query: { enabled: Boolean(ROUTER_ADDRESS) },
  });
  const ponsFee = typeof fee.data === "bigint" ? fee.data : null;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setMessage(null);
    const e = validate({ name, symbol, logo, buy });
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!ROUTER_ADDRESS) {
      setMessage("Launching is unavailable from this page right now. Your details stay filled in.");
      return;
    }
    if (!isConnected || !address) {
      const injected = connectors.find((c) => c.id !== "injected") ?? connectors[0];
      if (injected) connect({ connector: injected });
      setMessage("Connect your wallet to launch.");
      return;
    }
    setBusy(true);
    try {
      if (chainId !== robinhoodChain.id) await switchChainAsync({ chainId: robinhoodChain.id });
      const launchFee = ponsFee ?? ((await client?.readContract({ address: ROUTER_ADDRESS, abi: routerAbi, functionName: "ponsLaunchFee" })) as bigint);
      const developerBuy = buy.trim() ? parseEther(buy.trim()) : 0n;
      const hash = await writeContractAsync({
        address: ROUTER_ADDRESS,
        abi: routerAbi,
        functionName: "launch",
        chainId: robinhoodChain.id,
        value: launchFee + developerBuy,
        args: [
          {
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            logo: logo.trim(),
            description: "",
            creatorTaxBps: tax,
            salt: randomSalt(),
            developerBuy,
            minTokensOut: 0n,
          },
        ],
      });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      let token = "";
      for (const log of receipt.logs) {
        try {
          const d = decodeEventLog({ abi: routerAbi, data: log.data, topics: log.topics });
          if (d.eventName === "Launched") token = (d.args as unknown as { token: string }).token;
        } catch {
          /* not ours */
        }
      }
      if (receipt.status !== "success" || !token) throw new Error("The launch transaction did not go through.");
      setLaunched({ token, hash });
    } catch (err) {
      const text = (err as { shortMessage?: string; message?: string }).shortMessage ?? (err as Error).message;
      setMessage(text.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  }

  if (launched) {
    return (
      <div className="card p-8">
        <p className="text-[14px] font-bold text-up">Launched</p>
        <h2 className="mt-2 text-[32px] text-ink">${symbol.trim().toUpperCase()} is live.</h2>
        <p className="mt-2 text-[16px] text-ink-2">
          Its treasury is the creator-fee recipient. Holders who stake it share {splitPct.holders} of every fee that reaches the treasury.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/${launched.token}`} className="btn btn-primary">
            Open the token page
          </Link>
          <a href={explorer.tx(launched.hash)} target="_blank" rel="noreferrer" className="btn btn-ghost">
            Transaction ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Token name" error={errors.name}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="off" placeholder="Name" />
        </Field>
        <Field label="Ticker" error={errors.symbol}>
          <input className="field mono uppercase" value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={10} autoComplete="off" placeholder="TICKER" />
        </Field>
      </div>
      <Field label="Image URL" hint="Optional · https:// or ipfs://" error={errors.logo} className="mt-5">
        <input className="field" value={logo} onChange={(e) => setLogo(e.target.value)} autoComplete="off" inputMode="url" placeholder="https://" />
      </Field>

      <div className="mt-5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[15px] font-bold text-ink">Creator tax</span>
          <span className="text-[14px] text-ink-3">Charged on every trade, sent to the treasury</span>
        </span>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Creator tax">
          {site.taxChoices.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tax === t} onClick={() => setTax(t)} className={`btn btn-sm ${tax === t ? "btn-primary" : "btn-ghost"}`}>
              {t / 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3">
        <span className="text-[15px] font-bold text-ink">Reward currency</span>
        <span className="pill-eth">◆ ETH</span>
      </div>

      <Field label="First buy" hint="Optional · ETH · tokens go to your wallet" error={errors.buy} className="mt-5">
        <input className="field mono" value={buy} onChange={(e) => setBuy(e.target.value)} autoComplete="off" inputMode="decimal" placeholder="0" />
      </Field>

      <div className="mt-7 rounded-[18px] bg-[#f6f1e6] p-5">
        <p className="text-[15px] font-bold text-ink">Where this token&apos;s fees go</p>
        <dl className="mt-3 grid gap-2 text-[15px]">
          <Row k="Holders who stake it" v={splitPct.holders} />
          <Row k="Operations" v={splitPct.operations} />
          <Row k={`${site.name} platform vault`} v={splitPct.vault} />
          <Row k="Trade fees" v={`${tax / 100}% creator tax + ${site.ponsFeeBps / 100}% Pons fee`} />
          <Row k={`${site.venue} launch fee`} v={ponsFee !== null ? `${formatWei(ponsFee, 4)} ETH` : "Read at launch"} />
        </dl>
      </div>

      <button type="submit" className="btn btn-primary mt-7 w-full py-3.5" disabled={busy}>
        {busy ? "Launching…" : "Launch"}
      </button>
      {message ? (
        <p role="status" className="mt-4 text-center text-[15px] font-semibold text-ink">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function Field({ label, hint, error, className = "", children }: { label: string; hint?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{label}</span>
        {hint ? <span className="text-[14px] text-ink-3">{hint}</span> : null}
      </span>
      <span className="mt-2 block">{children}</span>
      {error ? <span className="mt-1.5 block text-[14px] font-semibold text-down">{error}</span> : null}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-2">{k}</dt>
      <dd className="shrink-0 text-right font-bold text-ink">{v}</dd>
    </div>
  );
}
