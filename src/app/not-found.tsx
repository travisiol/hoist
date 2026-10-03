import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <p className="text-[14px] font-bold text-accent">404</p>
      <h1 className="text-[44px] text-ink">Nothing at this address.</h1>
      <p className="max-w-md text-[16px] text-ink-2">Token pages take the 0x address of a token launched here.</p>
      <div className="mt-2 flex gap-3">
        <Link href="/" className="btn btn-primary">Home</Link>
        <Link href="/launch" className="btn btn-ghost">Launch a coin</Link>
      </div>
    </section>
  );
}
