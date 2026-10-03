import Image from "next/image";
import Link from "next/link";
import { ROUTER_ADDRESS } from "@/lib/contracts";
import { explorer } from "@/lib/chain";
import { site } from "@/config/site";

export function Footer() {
  return (
    <footer className="shell mt-24 pb-10">
      <div className="flex flex-col gap-6 border-t border-line pt-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="flex items-center gap-2 text-ink">
            <Image src="/logo.png" alt="" width={32} height={32} className="rounded-[9px]" />
            <span className="text-[20px] font-extrabold tracking-tight">{site.name}</span>
          </Link>
          <p className="mt-2 text-[14px] text-ink-3">{site.footer}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] font-semibold text-ink-3">
          <Link href="/vault" className="hover:text-ink">Vault</Link>
          <Link href="/docs" className="hover:text-ink">Docs</Link>
          <Link href="/docs#addresses" className="hover:text-ink">Public addresses</Link>
          {ROUTER_ADDRESS ? (
            <a href={explorer.address(ROUTER_ADDRESS)} target="_blank" rel="noreferrer" className="hover:text-ink">
              Router contract ↗
            </a>
          ) : null}
          <span className="text-ink-4">Built on {site.chain}</span>
        </div>
      </div>
    </footer>
  );
}
