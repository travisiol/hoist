import { dexScreenerUrl, geckoTerminalUrl, isTimeframe, poolCandles, tokenMarket } from "@/lib/geckoterminal";

export const dynamic = "force-dynamic";

// The token page's price chart: the token's main pool on Robinhood Chain and its candles for one
// timeframe (`tf`, default 1h). Served from the 5-minute cache in lib/geckoterminal, so
// visitors never cause one upstream call each.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const tf = url.searchParams.get("tf") ?? "1h";
  if (!/^0x[0-9a-fA-F]{40}$/.test(token) || !isTimeframe(tf)) {
    return Response.json({ error: "unknown token or timeframe" }, { status: 400 });
  }
  const market = await tokenMarket(token);
  const candles = market ? await poolCandles(market.pool, tf) : [];
  const links = market
    ? [
        { label: "DexScreener", href: dexScreenerUrl(market.pool) },
        { label: "GeckoTerminal", href: geckoTerminalUrl(market.pool) },
      ]
    : [];
  return Response.json({ market, candles, links }, { headers: { "cache-control": "public, max-age=60" } });
}
