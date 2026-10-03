/**
 * Brand and the words the site repeats. A rename is a one-file change
 * (plus package.json).
 */
export const site = {
  name: "HOIST",
  hook: "Launch it. Holders get paid.",
  tagline: "A launchpad whose fees pay the holders who stake.",
  footer: "Token launch infrastructure on Robinhood Chain.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://hoist.example",
  description:
    "Launch a token on Pons V2. Its creator fees land in its own treasury on Robinhood Chain: 80% is paid in ETH to the holders who stake it, pro rata to their stake.",
  keywords: ["HOIST", "launchpad", "Robinhood Chain", "Pons V2", "holder rewards", "staking", "creator fees"],
  venue: "Pons V2",
  chain: "Robinhood Chain",
  /** Creator tax choices offered at launch, in basis points (Pons accepts 0 to 10%). */
  taxChoices: [100, 200, 300, 400, 500, 750, 1000],
  defaultTaxBps: 500,
  /** Pons' own trade fee on the curve. */
  ponsFeeBps: 100,
  rewardCurrency: "ETH",
} as const;
