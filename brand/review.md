1. **Token page is missing the core launchpad object: a live chart + current price.**  
   Fix: replace the “Price / No market for this coin yet.” card with a live market panel: `height: 360px`, full left column width. Header must show: `Price`, `Market cap`, `24h volume`, `24h change`, `Curve progress`. Do not show “No market” when trades and market cap exist; bind it to the bonding-curve quote and display the current ETH price.

2. **Buy / stake actions are too far down and feel secondary.**  
   Fix: on the token page, move `Trade on the curve` to the top-right immediately beside the chart, starting under the token title. Set right column width to `360px`, make it `position: sticky; top: 92px`. Put `Stake & claim` directly under it in the same sticky column.

3. **Home token table looks unfinished because most market fields are dashes.**  
   Fix: remove any column that is not populated. Replace the table columns with:  
   `Token | Price | Market cap | 24h volume | 24h | Treasury | Rewards paid | Stakers | Trade`.  
   Populate `Price`, `24h volume`, and `24h` from the curve/trade feed; no `—` values in the first screen.

4. **Four rows are duplicate placeholder tokens, which makes the product look like a demo.**  
   Fix: replace the repeated `UI Hoisted / UIH` rows with five distinct seeded tokens, each with a different ticker, icon, age, market cap, volume, treasury, and reward amount. Example values: `LIFT`, `HOOD`, `VAULT`, `ROPE`, `PULLEY`. No repeated name/ticker in the visible list.

5. **Hero hierarchy is wrong: the decorative HOIST object dominates, while the product promise and action are small.**  
   Fix: set hero to a two-column layout: left `42%`, right `58%`. Change headline to `56px / 0.95`, weight `900`, letter-spacing `-0.04em`. Add two hero buttons directly under the body: primary `Launch a coin`, background `#2B6F8F`, text `#FFFFFF`; secondary `Explore tokens`, border `1px solid #BFD3DD`.

6. **The 80/15/5 fee mechanism is not visible at the point where users decide whether to trust it.**  
   Fix: add a compact split bar inside the hero or immediately below it:  
   `80% stakers` / `15% operations` / `5% HOIST vault`.  
   Use one horizontal pill, height `44px`, accent segment `#2B6F8F`, labels in Roboto Mono `12px`.

7. **Copy uses unexplained protocol jargon: “Pons” appears before the user knows what it is.**  
   Fix: replace `Pons` labels with plain product text.  
   Change `Pons ↗` to `Bonding curve ↗`.  
   Change `Same market on Pons ↗` to `Open bonding-curve contract ↗`.  
   Change `In Pons escrow` to `In curve escrow`.

8. **The visual system is too soft and low-contrast for trading data.**  
   Fix: keep the palette but harden the data UI: body text `#1F3340`, secondary text `#5F7280`, borders `#C9D9E1`, card background `#FFFFFF`, page background `#FFF7E8`. Increase all metric numbers to `32px`, weight `900`; table row height to `72px`; mono numeric cells to Roboto Mono `14px`, weight `600`.