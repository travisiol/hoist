import Image from "next/image";
import Link from "next/link";
import { site } from "@/config/site";
import { split, splitPct } from "@/config/split";

/** The banner: our canvas-letter render on the right, the promise and the two actions on the left, in real text. */
export function Hero() {
  return (
    <>
      <section className="card relative overflow-hidden !rounded-[24px] !bg-[#fff7e8] lg:h-[370px]">
        <div className="relative aspect-[3/1] w-full lg:absolute lg:inset-y-0 lg:right-0 lg:h-full lg:w-auto">
          <Image
            src="/hero-hoist.png"
            alt={`${site.name}: canvas letters lifted by pulleys`}
            fill
            priority
            sizes="(max-width: 1200px) 100vw, 1110px"
            className="object-contain object-right"
          />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-6 pt-2 lg:absolute lg:inset-y-0 lg:left-0 lg:w-[40%] lg:justify-center lg:pl-9 lg:pr-0 lg:py-8">
          <h1 className="text-[40px] font-black leading-[0.95] tracking-[-0.04em] text-ink sm:text-[48px] lg:text-[56px]">{site.hook}</h1>
          <p className="max-w-[420px] text-[16px] font-semibold text-ink-2 sm:text-[17px]">{site.tagline}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/launch" className="btn bg-[#2B6F8F] px-6 py-3 text-white hover:bg-[#235d78]">
              Launch a coin
            </Link>
            <a href="#tokens" className="btn border border-[#BFD3DD] bg-white/70 px-6 py-3 text-ink hover:border-accent">
              Explore tokens
            </a>
          </div>
        </div>
        <p className="absolute bottom-4 right-5 hidden w-fit rounded-full bg-[#fff7e8]/90 px-3 py-1 text-[14px] font-semibold text-ink-3 sm:block">
          Built on {site.chain}
        </p>
      </section>

      <div
        className="mt-4 flex h-11 w-full overflow-hidden rounded-full border border-line bg-surface font-mono text-[13px] font-semibold sm:text-[14px]"
        role="img"
        aria-label={`Every fee: ${splitPct.holders} to stakers, ${splitPct.operations} to operations, ${splitPct.vault} to the ${site.name} vault`}
      >
        <span className="flex items-center justify-center bg-accent px-3 text-white" style={{ width: `${split.holderBps / 100}%` }}>
          {splitPct.holders} stakers
        </span>
        <span className="flex items-center justify-center border-l border-line bg-[#E6EEF2] px-2 text-ink" style={{ width: `${split.operationsBps / 100}%` }}>
          <span className="truncate">{splitPct.operations}<span className="hidden sm:inline"> operations</span></span>
        </span>
        <span className="flex items-center justify-center border-l border-line bg-[#F3F0E8] px-1 text-ink" style={{ width: `${split.vaultBps / 100}%` }}>
          <span className="truncate">{splitPct.vault}</span>
        </span>
      </div>
      <p className="mt-1.5 text-center text-[13px] text-ink-3 sm:text-right">
        Every fee a token earns: {splitPct.holders} stakers · {splitPct.operations} operations · {splitPct.vault} {site.name} vault
      </p>
    </>
  );
}
