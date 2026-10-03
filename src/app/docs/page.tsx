import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/config/site";
import { splitPct } from "@/config/split";
import { ROUTER_ADDRESS } from "@/lib/contracts";
import { explorer } from "@/lib/chain";

export const metadata: Metadata = { title: "Docs" };

const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const PONS_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";

const SECTIONS = [
  { id: "idea", label: "The idea" },
  { id: "launching", label: "Launching a coin" },
  { id: "staking", label: "Staking and claiming" },
  { id: "fees", label: "Where fees go" },
  { id: "evidence", label: "Payout evidence" },
  { id: "permissions", label: "Treasury permissions" },
  { id: "addresses", label: "Public addresses" },
];

export default function DocsPage() {
  return (
    <div className="shell pt-8">
      <p className="text-[14px] font-bold text-accent">Docs</p>
      <h1 className="mt-1 text-[40px] text-ink">Understand the flow.</h1>
      <p className="mt-2 max-w-2xl text-[17px] text-ink-2">
        How a {site.name} token is launched, where its fees go, and how stakers get paid. Everything here is enforced by
        the contracts; nothing on this page is a promise of income.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { t: "I hold a token", d: "Stake it in its treasury to share 80% of its fees. Claim ETH any time.", href: "#staking" },
          { t: "I am launching", d: "Pick a name, a ticker and a creator tax. The treasury is created with the token.", href: "#launching" },
          { t: "I want to verify", d: "Every round, payout and stake is an event on Robinhood Chain.", href: "#evidence" },
        ].map((c) => (
          <a key={c.t} href={c.href} className="card block p-5 transition hover:border-accent">
            <p className="text-[18px] font-extrabold text-ink">{c.t}</p>
            <p className="mt-1 text-[15px] text-ink-3">{c.d}</p>
            <p className="mt-3 text-[14px] font-bold text-accent">Read →</p>
          </a>
        ))}
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block" aria-label="On this page">
          <ul className="sticky top-24 space-y-2 text-[14px] font-semibold text-ink-3">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="hover:text-ink">{s.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-3xl space-y-12 text-[16px] leading-relaxed text-ink-2">
          <Section id="idea" title="The idea">
            <p>
              Pons is the launchpad whose curve the tokens trade on. A token launched on {site.name} trades on {site.venue} like any other. The difference is who receives its
              creator fees: not the launcher&apos;s wallet, but a treasury contract created for that token. The treasury
              pays {splitPct.holders} of what it receives to the people who stake the token in it.
            </p>
            <p>Holding the token is not enough: only staked tokens earn. Rewards come from trading fees, so they depend entirely on volume.</p>
          </Section>

          <Section id="launching" title="Launching a coin">
            <p>
              You choose a name, a ticker, an image and a creator tax between 1% and 10% (Pons accepts up to 10%; 5% is the
              default). The router creates the treasury, launches the token on {site.venue} with that treasury as the
              creator-fee recipient, and records the launch. The only cost is Pons&apos; own launch fee, read live; an
              optional first buy is made in the same transaction and the tokens go to you.
            </p>
            <p>Rewards are paid in ETH. The creator tax and the split cannot be changed after launch.</p>
          </Section>

          <Section id="staking" title="Staking and claiming">
            <p>
              Approve and stake any amount of the token in its treasury. Each time new fees are split, the holders&apos;
              part is shared among stakers pro rata to their stake at that moment (one &ldquo;round&rdquo;). Staking later
              does not earn from earlier rounds. Your earnings accumulate until you claim; unstaking does not cancel them.
            </p>
            <p>
              If fees arrive while nobody is staked, the holders&apos; part waits in the treasury and is shared among the
              stakers present at the next pull. Staking, unstaking and claiming each pull pending fees from the Pons escrow first.
            </p>
          </Section>

          <Section id="fees" title="Where fees go">
            <p>Follow the fees:</p>
            <div className="card grid gap-3 p-5 text-[15px] sm:grid-cols-4">
              {[
                ["Trading", "Every buy and sell on the curve pays the creator tax and Pons' fee."],
                ["Pons fee escrow", "Pons credits the token's creator fees to its treasury."],
                ["Token treasury", "pull() claims them; anyone can call it."],
                ["The split", `${splitPct.holders} stakers · ${splitPct.operations} operations · ${splitPct.vault} platform vault`],
              ].map(([t, d], i) => (
                <div key={t} className="rounded-[14px] bg-[#f6f1e6] p-4">
                  <p className="text-[14px] font-bold text-accent">{i + 1}</p>
                  <p className="font-extrabold text-ink">{t}</p>
                  <p className="mt-1 text-[14px] text-ink-3">{d}</p>
                </div>
              ))}
            </div>
            <p>
              The split is exact to the wei: holders get floor(80%), operations floor(15%), and the vault the rest, so
              nothing is lost to rounding. Sharing among stakers rounds down by at most a wei per staker; that remainder is
              carried into the next round. Pons decides when fees move from the curve to its escrow; until then they are
              not in the treasury.
            </p>
          </Section>

          <Section id="evidence" title="Payout evidence">
            <p>
              Each treasury emits <code className="mono">Inflow</code> (amount and split), <code className="mono">Round</code>{" "}
              (amount shared and total staked), <code className="mono">Staked</code>, <code className="mono">Unstaked</code>{" "}
              and <code className="mono">Paid</code> (wallet and ETH claimed). Token pages list them with links to the
              explorer; the home page totals come from the router&apos;s <code className="mono">totals()</code> view.
            </p>
          </Section>

          <Section id="permissions" title="Treasury permissions">
            <ul className="list-disc space-y-1 pl-5">
              <li>No owner and no admin, on the router or on any treasury. No upgrade, no pause.</li>
              <li>Only a staker can unstake its own tokens or claim its own rewards.</li>
              <li>Operations and vault shares can only be paid to the two addresses fixed when the router was deployed.</li>
              <li>A failing payment to operations or the vault never blocks stakers.</li>
              <li>The treasury cannot sell, swap or move the staked tokens.</li>
            </ul>
          </Section>

          <Section id="addresses" title="Public addresses">
            <dl className="grid gap-2 text-[14px]">
              <AddrRow k={`${site.name} router`} a={ROUTER_ADDRESS} />
              <AddrRow k="Pons V2 factory" a={PONS_FACTORY} />
              <AddrRow k="Pons fee escrow" a={PONS_ESCROW} />
            </dl>
            <p className="text-[14px] text-ink-3">Each token&apos;s treasury address is on its token page, under About.</p>
          </Section>

          <p>
            <Link href="/launch" className="btn btn-primary">Launch a coin</Link>
          </p>
        </article>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <h2 className="text-[26px] text-ink">{title}</h2>
      {children}
    </section>
  );
}

function AddrRow({ k, a }: { k: string; a: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 rounded-[12px] border border-line bg-surface px-4 py-3">
      <dt className="font-semibold text-ink">{k}</dt>
      <dd className="mono break-all text-ink-2">
        {a ? (
          <a href={explorer.address(a)} target="_blank" rel="noreferrer" className="hover:text-accent">{a} ↗</a>
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}
