import { Hero } from "@/components/home/Hero";
import { Kpis } from "@/components/home/Kpis";
import { VaultCard } from "@/components/home/VaultCard";
import { TokenTable } from "@/components/home/TokenTable";

export default function Home() {
  return (
    <div className="shell pt-6">
      <Hero />
      <Kpis />
      <VaultCard />
      <div id="tokens" className="scroll-mt-20">
        <TokenTable />
      </div>
    </div>
  );
}
