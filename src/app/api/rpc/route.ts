import { NextResponse } from "next/server";
import { RPC_URL } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Same-origin JSON-RPC relay for the browser: the public Robinhood RPC's
 * rate-limit answers carry a doubled CORS header that browsers refuse.
 * One request in, one request out, nothing kept.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const res = await fetch(RPC_URL, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: (e as Error).message } }, { status: 502 });
  }
}
