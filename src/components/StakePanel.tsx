"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { ConnectButton, useMounted } from "@/components/ConnectButton";
import { explorer, robinhoodChain } from "@/lib/chain";
import { treasuryAbi, type TreasuryStatus } from "@/lib/contracts";
import { erc20Abi } from "@/lib/ponsAbi";
import { formatUnitsTrim, parseDecimal } from "@/lib/curvemath";
import { ethAmount, shortAddress } from "@/lib/format";
import { split, splitPct } from "@/config/split";

type Mode = "stake" | "unstake";

/**
 * Stake the token into its treasury, unstake it, claim ETH. Every call goes
 * straight to the treasury contract, which pulls pending fees from the Pons
 * escrow first.
 */
export function StakePanel({ token, treasury, symbol, status, onDone }: { token: `0x${string}`; treasury: `0x${string}`; symbol: string; status: TreasuryStatus | null; onDone: () => void }) {
  const [mode, setMode] = useState<Mode>("stake");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<`0x${string}` | undefined>();
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === robinhoodChain.id;
  const who = address ?? "0x0000000000000000000000000000000000000000";

  const { data: reads, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [who], chainId: robinhoodChain.id },
      { address: token, abi: erc20Abi, functionName: "allowance", args: [who, treasury], chainId: robinhoodChain.id },
    ],
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  });
  const wallet = reads?.[0]?.status === "success" ? (reads[0].result as bigint) : 0n;
  const allowance = reads?.[1]?.status === "success" ? (reads[1].result as bigint) : 0n;
  const staked = status?.yourStake ?? 0n;
  const claimable = status?.yourClaimable ?? 0n;
  // Fees still in the Pons escrow are pulled and split by the claim itself; this is your part of them.
  const incoming =
    status && status.totalStaked > 0n ? (((status.pendingInEscrow * BigInt(split.holderBps)) / 10_000n) * staked) / status.totalStaked : 0n;
  const share = status && status.totalStaked > 0n ? Number((staked * 10_000n) / status.totalStaked) / 100 : 0;

  const { writeContractAsync, isPending } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({ hash: pending, chainId: robinhoodChain.id, query: { enabled: Boolean(pending) } });
  const inFlight = Boolean(pending) && !receipt;
  useEffect(() => {
    if (!receipt) return;
    refetch();
    onDone();
  }, [receipt, refetch, onDone]);

  const value = parseDecimal(amount);
  const max = mode === "stake" ? wallet : staked;
  const tooMuch = value !== null && value > max;
  const needsApproval = mode === "stake" && value !== null && value > 0n && allowance < value;

  async function send(fn: "approve" | "stake" | "unstake" | "claim") {
    setNote(null);
    try {
      let hash: `0x${string}`;
      if (fn === "approve") hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [treasury, value!], chainId: robinhoodChain.id });
      else if (fn === "claim") hash = await writeContractAsync({ address: treasury, abi: treasuryAbi, functionName: "claim", chainId: robinhoodChain.id });
      else hash = await writeContractAsync({ address: treasury, abi: treasuryAbi, functionName: fn, args: [value!], chainId: robinhoodChain.id });
      setPending(hash);
      setNote({ kind: "info", text: `${fn === "approve" ? "Approval" : fn[0].toUpperCase() + fn.slice(1)} submitted · ${shortAddress(hash, 6)}` });
      if (fn !== "approve") setAmount("");
    } catch (err) {
      const e = err as { shortMessage?: string; message?: string };
      setNote({ kind: "error", text: (e.shortMessage ?? e.message ?? "Transaction failed").split("\n")[0] });
    }
  }

  const status2 = receipt
    ? { kind: receipt.status === "success" ? ("info" as const) : ("error" as const), text: receipt.status === "success" ? `Confirmed · ${shortAddress(receipt.transactionHash, 6)}` : "The transaction reverted." }
    : note;
  const ready = mounted && onChain;
  const busy = isPending || inFlight;

  return (
    <div className="card p-6" id="stake">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[20px] font-extrabold text-ink">Stake &amp; claim</h2>
        <div className="seg" role="tablist" aria-label="Stake or unstake">
          {(["stake", "unstake"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className="seg-opt" onClick={() => { setMode(m); setAmount(""); }}>
              {m === "stake" ? "Stake" : "Unstake"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[14px] text-ink-3">
        Stakers share {splitPct.holders} of every fee this treasury receives, pro rata to their stake at that moment.
        Unstake any time; tokens come back as they went in.
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 rounded-[14px] bg-[#f6f1e6] p-4">
        <div>
          <dt className="label">Your stake</dt>
          <dd className="mono text-[15px] text-ink">{formatUnitsTrim(staked, 18, 0)}</dd>
        </div>
        <div>
          <dt className="label">Your share</dt>
          <dd className="mono text-[15px] text-ink">{share.toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="label">Claimable</dt>
          <dd className="mono text-[15px] text-up">{ethAmount(claimable)} ETH</dd>
          {incoming > 0n ? <dd className="text-[14px] text-ink-3">+ ≈{ethAmount(incoming)} on claim</dd> : null}
        </div>
      </dl>

      <label className="mt-4 block">
        <span className="mb-2 flex items-baseline justify-between gap-2">
          <span className="label">{mode === "stake" ? `Stake (${symbol})` : `Unstake (${symbol})`}</span>
          <button type="button" className="text-[14px] text-ink-3 hover:text-ink" onClick={() => setAmount(formatUnitsTrim(max, 18, 18))}>
            {formatUnitsTrim(max, 18, 0)} {mode === "stake" ? "in wallet" : "staked"} · max
          </button>
        </span>
        <input className="field mono" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount && (value === null || tooMuch))} />
      </label>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {!ready ? (
          <div className="sm:col-span-2">
            <ConnectButton />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || value === null || value <= 0n || tooMuch}
              onClick={() => send(needsApproval ? "approve" : mode)}
            >
              {tooMuch ? `Not enough ${symbol}` : needsApproval ? `Approve ${symbol}` : mode === "stake" ? `Stake ${symbol}` : `Unstake ${symbol}`}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy || claimable + incoming === 0n} onClick={() => send("claim")}>
              Claim {incoming > 0n ? "≈" : ""}{ethAmount(claimable + incoming)} ETH
            </button>
          </>
        )}
      </div>
      {status2 ? (
        <p className={`mt-3 break-words text-[14px] ${status2.kind === "error" ? "text-down" : "text-ink-3"}`}>
          {status2.text}
          {pending ? (
            <>
              {" · "}
              <a href={explorer.tx(pending)} target="_blank" rel="noreferrer" className="link">
                explorer
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
