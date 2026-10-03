# HOIST

- **Name**: HOIST (set in `src/config/site.ts` and `package.json`)
- **Hook**: Launch it. Holders get paid.
- **Tagline**: A launchpad whose fees pay the holders who stake.
- **Palette**: background `#FFF7E8`, surface `#FFFFFF`, ink `#1F3340`, muted `#71808A`, accent `#2B6F8F`, positive `#14845A`, negative `#B94A3A`, dividers `#D9E2E7`
- **Type**: Nunito Sans (800/700/600/400) + Roboto Mono 500 for numbers, via `next/font/google`
- **Hero**: `public/hero-hoist.png` (canvas letters on pulleys), tagline set over it in real text
- **Port**: 3901 (`npm run dev` / `npm start`); local hardhat node: 8901

Structure mirrors a reference launchpad (home: banner, five KPIs, platform-vault card, token table; token page with
cards and tabs; docs; portfolio; vault), rebuilt with our own mechanic, contracts, copy and visuals.

## What it does

`HoistRouter.launch()` creates a fresh `Treasury`, launches the token on Pons V2 with that treasury as the
creator-fee recipient and the creator tax the launcher picked (0–10%, the UI offers 1–10%, default 5%), and records
the launch. Rewards are paid in ETH.

Each `Treasury` (no owner):

- `pull()` (anyone; also run inside `stake`, `unstake`, `claim`, `release*`) claims the treasury's fees from the Pons
  escrow and splits every new wei once: **80% stakers / 15% operations / 5% platform vault** (holders and operations
  rounded down, the vault takes the remainder). Constants mirrored in `src/config/split.ts`, checked by a test.
- `stake(amount)` / `unstake(amount)`: holders stake the token; the stakers' 80% is shared pro rata to stake at the
  moment of each split (accumulator; sub-wei remainder carried to the next round).
- `claim()` pays the caller's ETH. Rounds = splits that shared > 0 (`Round(index, amount, totalStaked)`).
- If fees arrive while nobody is staked, the holders' part waits and goes to the stakers present at the next pull.
- `releaseOperations()` / `releaseVault()`: pull payments to the two addresses fixed in the router's constructor; a
  receiver that refuses ETH never blocks stakers.
- Events: `Inflow`, `Round`, `Staked`, `Unstaked`, `Paid`, `Released`; router `Launched`; views `status(account)`,
  `claimable`, router `totals()`.

## Go live (owner)

1. `cd contracts && cp .env.example .env`, set `DEPLOYER_PRIVATE_KEY`, `OPERATIONS_ADDRESS`, `VAULT_ADDRESS`
   (both immutable), then `npm run deploy:robinhood` (writes `deployments/robinhood.json`).
2. Set `NEXT_PUBLIC_ROUTER_ADDRESS` (or keep the deploy record; `next.config.ts` reads it) and build.

Until the router address is set the site shows its normal UI with zeros and empty tables.

## Run

```bash
npm install && (cd contracts && npm install)
npm test             # 13 contract tests
npm run build && npm start   # http://localhost:3901
```

Local rig: `cd contracts && npx hardhat node --port 8901`, `npx hardhat run scripts/seed-local.ts --network local`,
`ROUTER=<router> npx hardhat run scripts/play-local.ts --network local`, then build the site with
`NEXT_PUBLIC_ROUTER_ADDRESS=<router> NEXT_PUBLIC_ROBINHOOD_CHAIN_ID=31337 NEXT_PUBLIC_ROBINHOOD_RPC_URL=http://127.0.0.1:8901`
and drive it with `node scripts/play-ui.mjs http://localhost:3901 <account> <token>` (EIP-6963 test wallet stub).
Screenshots: `node scripts/capture.mjs http://localhost:3901`.
