"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { site } from "@/config/site";

const LINKS = [
  { href: "/", label: "Explore" },
  { href: "/launch", label: "Launch a coin" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/vault", label: "Vault" },
  { href: "/docs", label: "Docs" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[#fffaf1]/95 backdrop-blur">
      <div className="shell flex h-[68px] items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-ink" aria-label={`${site.name} home`}>
            <Image src="/logo.png" alt="" width={36} height={36} className="rounded-[10px]" priority />
            <span className="text-[21px] font-extrabold tracking-tight">{site.name}</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="nav-pill" aria-current={active(l.href) ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[14px] font-semibold text-ink-3 sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-up" />
            Robinhood Chain
          </span>
          <ConnectButton />
        </div>
      </div>
      <nav className="shell flex gap-1 overflow-x-auto pb-2 lg:hidden" aria-label="Primary mobile">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="nav-pill shrink-0" aria-current={active(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
