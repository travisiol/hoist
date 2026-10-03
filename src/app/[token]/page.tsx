import { notFound } from "next/navigation";
import { TokenView } from "@/components/TokenView";

export default async function TokenPage({ params }: PageProps<"/[token]">) {
  const { token } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) notFound();
  return <TokenView token={token as `0x${string}`} />;
}
