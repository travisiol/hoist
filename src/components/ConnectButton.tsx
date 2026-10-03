"use client";

import { useState, useSyncExternalStore } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

const noop = () => () => {};
/** false during SSR and hydration, true once the client owns the tree. */
export const useMounted = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/**
 * Browser-wallet connect (EIP-1193 injected). States: disconnected, wrong
 * chain, connected. Nothing here sends a transaction.
 */
export function ConnectButton({ className = "" }: { className?: string }) {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const mounted = useMounted();
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  if (!mounted || !isConnected || !address) {
    const onClick = () => {
      // A wallet announced over EIP-6963 first, the generic injected one otherwise.
      const injected = connectors.find((c) => c.id !== "injected") ?? (typeof window !== "undefined" && "ethereum" in window ? connectors[0] : undefined);
      if (!injected) {
        setNote("No browser wallet found. Install MetaMask or Rabby, then try again.");
        return;
      }
      setNote(null);
      connect({ connector: injected });
    };
    const message = note ?? (error ? error.message.split("\n")[0] : null);
    return (
      <div className={`relative ${className}`}>
        <button type="button" className="btn btn-ink btn-sm" onClick={onClick} disabled={isPending}>
          {isPending ? "Connecting…" : "Connect wallet"}
        </button>
        {message ? (
          <p role="status" className="card absolute right-0 top-full z-30 mt-2 w-64 p-4 text-[13px] text-ink-2">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  const wrongChain = chainId !== robinhoodChain.id;
  if (wrongChain) {
    return (
      <button
        type="button"
        className={`btn btn-primary btn-sm ${className}`}
        disabled={switching}
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
      >
        {switching ? "Switching…" : "Switch network"}
      </button>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button type="button" className="btn btn-ghost btn-sm mono" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
        <span className="inline-block h-2 w-2 rounded-full bg-ok" />
        {shortAddress(address)}
      </button>
      {menu ? (
        <div className="card absolute right-0 top-full z-30 mt-2 w-48 p-2">
          <button
            type="button"
            className="w-full rounded-full px-4 py-2 text-left text-[14px] font-medium text-ink hover:bg-accent-soft"
            onClick={() => {
              setMenu(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
