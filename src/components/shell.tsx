import Link from "next/link";
import { KNOWN_CONTRACT_ID, nearAiConfigured } from "@/lib/config";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ledger-paper flex min-h-full flex-1 flex-col">
      <header className="border-b border-border/80 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="group">
            <span className="font-display text-2xl tracking-tight text-foreground">LinguaLedger</span>
            <span className="mt-0.5 block text-xs tracking-wide text-muted-foreground uppercase">
              Translation house · no employees
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 hover:bg-muted">
              Desk
            </Link>
            <Link href="/ledger" className="rounded-md px-3 py-2 hover:bg-muted">
              Ledger
            </Link>
            <a
              className="rounded-md px-3 py-2 font-mono text-xs hover:bg-muted"
              href={`https://testnet.nearblocks.io/address/${KNOWN_CONTRACT_ID}`}
            >
              {KNOWN_CONTRACT_ID}
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border/80 px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        Built during NEAR Hackathon 2026. Testnet only. A sponsored guest pays real testnet NEAR.{" "}
        {nearAiConfigured()
          ? "Translation uses NEAR AI Cloud when the call succeeds, with a free public translator as fallback. A receipt is TEE-verified only when the response signature matches the attested key."
          : "Translation uses a free public translator (not NEAR AI, and not a TEE)."}{" "}
        1Click quotes are a dry run.
      </footer>
    </div>
  );
}
