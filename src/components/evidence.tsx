import Link from "next/link";
import { explorerAccount, explorerTx } from "@/lib/explorer";

const JOB = "ll-mwd1336h-3238c5";
const PAY = "3YH5pRPVvAP7573PDDTu52Gr9QWXf1pQ1wbykGHqsTou";
const RECORD = "Go67dFcudAhCahaSGTr9qUaXjbYmd16q7MKT8qVzoyT2";
const SETTLE = "3MJndu8H7Y2ek2yerRhBwQ2eZYpXnGFq1j1ou4H2GZ49";
const TREASURY = "lingualedger-hq.testnet";
const GUEST = "guest.lingualedger-hq.testnet";

function shortHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function Evidence() {
  const rows = [
    ["Pay", PAY, explorerTx(PAY)],
    ["Record", RECORD, explorerTx(RECORD)],
    ["Settle", SETTLE, explorerTx(SETTLE)],
  ] as const;

  return (
    <section className="mx-auto max-w-6xl px-5 pt-16 sm:px-6 sm:pt-24">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">On testnet</p>
          <h2 className="font-display mt-3 text-3xl text-cream sm:text-4xl">A job already settled.</h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-cream/60">
          Anyone can check these three transactions. A guest paid, the treasury settled, and the owner key never touched the host.
        </p>
      </div>
      <div className="paper paper-sheet">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col justify-between gap-8 border-b border-copper/20 p-7 sm:p-9 lg:border-r lg:border-b-0">
            <div>
              <p className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">Job</p>
              <Link href={`/order/${JOB}`} className="font-mono mt-2 block text-lg text-foreground underline-offset-4 hover:underline">
                {JOB}
              </Link>
              <p className="mt-4 font-display text-4xl tracking-tight">0.05 NEAR</p>
              <p className="mt-2 text-sm text-muted-foreground">Turkish → English · 15 words · settled</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Paid by{" "}
              <a className="font-mono text-xs text-foreground underline-offset-4 hover:underline" href={explorerAccount(GUEST)}>
                {GUEST}
              </a>
              {" "}into{" "}
              <a className="font-mono text-xs text-foreground underline-offset-4 hover:underline" href={explorerAccount(TREASURY)}>
                {TREASURY}
              </a>
              .
            </p>
          </div>
          <ol className="divide-y divide-copper/15 p-2 sm:p-3">
            {rows.map(([label, hash, href]) => (
              <li key={label} className="flex items-center justify-between gap-4 px-5 py-5">
                <span className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">{label}</span>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    {shortHash(hash)}
                  </a>
                ) : (
                  <span className="font-mono text-sm">{shortHash(hash)}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
