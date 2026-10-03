/**
 * Where to load a logo from, in order. `ipfs://` goes to the Pons gateway
 * first (it serves what Pons pinned), then to public gateways for images
 * pinned elsewhere; https URLs pass through.
 */
export function logoCandidates(logo: string | null | undefined): string[] {
  if (!logo) return [];
  if (logo.startsWith("ipfs://")) {
    const cid = logo.slice("ipfs://".length).replace(/^ipfs\//, "");
    if (!/^[a-zA-Z0-9]+$/.test(cid)) return [];
    return [
      `https://www.ponsfamily.com/api/ipfs/content/${cid}?variant=card`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
    ];
  }
  if (/^https:\/\/\S+$/.test(logo)) return [logo];
  return [];
}

/** The first candidate, for places that only take one URL. */
export function logoUrl(logo: string | null | undefined): string | null {
  return logoCandidates(logo)[0] ?? null;
}
