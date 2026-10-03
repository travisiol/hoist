import type { Metadata } from "next";
import { VaultView } from "@/components/VaultView";

export const metadata: Metadata = { title: "Platform vault" };

export default function VaultPage() {
  return <VaultView />;
}
