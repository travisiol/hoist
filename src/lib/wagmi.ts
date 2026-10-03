import { createConfig, http, injected } from "wagmi";
import { BROWSER_RPC_URL, RPC_URL, robinhoodChain } from "@/lib/chain";

const isBrowser = typeof window !== "undefined";

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [robinhoodChain.id]: http(isBrowser ? BROWSER_RPC_URL : RPC_URL, { batch: true }),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
