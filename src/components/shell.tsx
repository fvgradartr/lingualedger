import Link from "next/link";
import { KNOWN_CONTRACT_ID, nearAiConfigured } from "@/lib/config";
import { Mark } from "@/components/mark";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ink-shell flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-cream/10 bg-[color-mix(in_oklch,var(--ink)_78%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <Mark className="size-8 shrink-0 ring-1 ring-copper/40" />
            <span className="leading-tight">
              <span className="font-display block text-[1.65rem] text-cream">LinguaLedger</span>
              <span className="mt-0.5 block text-[0.65rem] tracking-[0.18em] text-cream/55 uppercase">
                Translation house · no employees
              </span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-[0.72rem] tracking-[0.16em] uppercase">
            <Link href="/" className="px-3 py-2 text-cream/70 transition-colors hover:text-cream">
              Desk
            </Link>
            <Link href="/ledger" className="px-3 py-2 text-cream/70 transition-colors hover:text-cream">
              Ledger
            </Link>
            <a
              className="px-3 py-2 font-mono text-[0.68rem] tracking-normal text-copper/90 normal-case transition-colors hover:text-copper-bright"
              href={`https://testnet.nearblocks.io/address/${KNOWN_CONTRACT_ID}`}
            >
              {KNOWN_CONTRACT_ID}
            </a>
          </nav>
        </div>
      </header>
      <main className="relative z-10 flex-1">{children}</main>
      <footer className="relative z-10 border-t border-cream/10 px-5 py-8 text-center text-[0.8rem] leading-relaxed text-cream/50 sm:px-6">
        Built during NEAR Hackathon 2026. Testnet only. A sponsored guest pays real testnet NEAR.{" "}
        {nearAiConfigured()
          ? "Translation uses NEAR AI Cloud when the call succeeds, with a free public translator as fallback. A receipt is TEE-verified only when the response signature matches the attested key."
          : "Translation uses a free public translator — not NEAR AI, and not a TEE."}{" "}
        1Click quotes are a dry run.
      </footer>
    </div>
  );
}
