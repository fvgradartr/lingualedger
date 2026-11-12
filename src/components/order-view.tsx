"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { readLocalOrders } from "@/components/local-orders";
import { explorerTx } from "@/lib/explorer";
import { formatNear, parseYocto } from "@/lib/pricing";
import type { JobOrder } from "@/lib/types";

const STEPS = ["Quote", "Paid", "Translating", "QA", "Delivered", "Recorded", "Settled"];

const KNOWN_TX: Record<string, { pay: string; record: string; settle: string }> = {
  "ll-mwd1336h-3238c5": {
    pay: "3YH5pRPVvAP7573PDDTu52Gr9QWXf1pQ1wbykGHqsTou",
    record: "Go67dFcudAhCahaSGTr9qUaXjbYmd16q7MKT8qVzoyT2",
    settle: "3MJndu8H7Y2ek2yerRhBwQ2eZYpXnGFq1j1ou4H2GZ49",
  },
};


export function OrderView({ id, fresh }: { id: string; fresh: boolean }) {
  const [order, setOrder] = useState<JobOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(fresh ? 1 : STEPS.length);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const local = readLocalOrders()[id];
    if (local) setOrder(local);
    fetch(`/api/order/${id}`)
      .then(async (response) => {
        const payload = (await response.json()) as { order?: JobOrder; error?: string };
        if (cancelled) return;
        if (payload.order) setOrder(payload.order);
        else if (!local) setError(payload.error ?? "Job not found.");
      })
      .catch(() => {
        if (!local && !cancelled) setError("Could not load this job.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!fresh || !order) return;
    if (step >= STEPS.length) return;
    const timer = setTimeout(() => setStep((current) => current + 1), 380);
    return () => clearTimeout(timer);
  }, [fresh, order, step]);

  async function copy() {
    if (!order) return;
    await navigator.clipboard.writeText(order.deliverable);
    setCopied(true);
  }

  if (error && !order) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
        <div className="paper paper-sheet p-8">
          <h1 className="font-display text-3xl">No such job</h1>
          <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          <Link className={`${buttonVariants({ variant: "outline" })} mt-6 rounded-sm`} href="/">
            Back to the desk
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
        <p className="text-sm text-cream/60">Opening the job…</p>
      </div>
    );
  }

  const showText = step >= STEPS.length;
  const known = KNOWN_TX[order.id];
  const payHash = order.tx.pay ?? known?.pay ?? null;
  const recordHash = order.tx.record ?? known?.record ?? null;
  const settleHash = order.tx.settle ?? known?.settle ?? null;
  const payLink = explorerTx(payHash);
  const recordLink = explorerTx(recordHash);
  const settleLink = explorerTx(settleHash);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Job {order.id}</p>
          <h1 className="font-display mt-3 text-4xl text-cream sm:text-5xl">
            <span className="font-display-italic">{order.sourceLang.toUpperCase()}</span>
            {" → "}
            {order.targetLang.toUpperCase()}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Flag>
            {order.receipt.mode === "near-ai" ? "NEAR AI Cloud" : "Public translator"}
          </Flag>
          {order.receipt.mode === "near-ai" ? (
            order.receipt.verified ? (
              <Flag>TEE signature verified</Flag>
            ) : (
              <Flag>NEAR AI, not TEE-verified</Flag>
            )
          ) : null}
          {order.settledOnChain ? <Flag accent>Settled on testnet</Flag> : <Flag>Local receipt</Flag>}
        </div>
      </div>

      <ol className="grid grid-cols-2 gap-px bg-copper/25 sm:grid-cols-7">
        {STEPS.map((label, index) => {
          const done = index < step;
          return (
            <li
              key={label}
              className={`px-2 py-3 text-center text-[0.65rem] tracking-[0.14em] uppercase ${
                done ? "bg-copper/20 text-cream" : "bg-ink-deep text-cream/35"
              }`}
            >
              {label}
            </li>
          );
        })}
      </ol>

      {showText ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="paper paper-sheet relative p-7 sm:p-9">
            {order.settledOnChain ? <span className="stamp">Settled</span> : null}
            <div className="flex items-center justify-between gap-3 pr-24">
              <p className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">Deliverable</p>
              <Button variant="outline" size="sm" className="rounded-sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <article className="mt-6 text-[1.05rem] leading-[1.75] whitespace-pre-wrap">
              {order.deliverable || order.translation || "Hash only. The source text was not stored on chain."}
            </article>
          </div>
          <div className="paper paper-sheet p-7 sm:p-9">
            <p className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">Receipt</p>
            <div className="mt-6 space-y-3 text-sm">
              <p>
                QA {order.qaScore}
                {order.retried ? " · retried once" : ""}
              </p>
              <ul className="space-y-1 text-muted-foreground">
                {order.qaNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p className="font-mono text-xs break-all">sha256 {order.receipt.sha256 || "pending"}</p>
              <p className="font-mono text-xs break-all">Signature id {order.receipt.teeSigId || "pending"}</p>
              {order.receipt.teeSigId?.startsWith("demo:") ? (
                <p className="text-xs text-muted-foreground">Local id, not a TEE attestation.</p>
              ) : order.receipt.mode === "near-ai" && order.receipt.verified ? (
                <p className="text-xs text-muted-foreground">
                  Chat id from NEAR AI Cloud. The TEE signature on this receipt verified against the attested signing address.
                </p>
              ) : order.receipt.mode === "near-ai" ? (
                <p className="text-xs text-muted-foreground">
                  Chat id from NEAR AI Cloud. The TEE signature was not verified for this receipt.
                </p>
              ) : null}
              <p className="text-muted-foreground">{order.receipt.verificationNote}</p>
              <p>
                Price {formatNear(parseYocto(order.amountYocto))} NEAR
                {order.floored ? " · floored" : ""}
              </p>
              <p>Model {order.receipt.model}</p>
              <div className="space-y-2 border-t border-copper/20 pt-3 font-mono text-xs">
                <TxLine label="Pay" hash={payHash} href={payLink} />
                <TxLine label="Record" hash={recordHash} href={recordLink} />
                <TxLine label="Settle" hash={settleHash} href={settleLink} />
              </div>
              {order.payouts.length > 0 ? (
                <ul className="space-y-1 border-t border-copper/20 pt-3">
                  {order.payouts.map((payout) => (
                    <li key={payout.payee} className="flex justify-between gap-3">
                      <span>
                        {payout.role} · {payout.bps / 100}%
                      </span>
                      <span className="font-mono">
                        {formatNear(parseYocto(payout.amountYocto))}
                        {payout.transferred ? " · sent" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className="mt-2 inline-block text-sm text-copper-deep underline-offset-4 hover:underline" href="/ledger">
                Open the ledger
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-cream/60">The house is working the job. The deliverable appears when the receipt is closed.</p>
      )}
    </div>
  );
}

function Flag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`border px-2.5 py-1 text-[0.65rem] tracking-[0.14em] uppercase ${
        accent ? "border-copper/60 text-copper" : "border-cream/20 text-cream/70"
      }`}
    >
      {children}
    </span>
  );
}

function TxLine({ label, hash, href }: { label: string; hash: string | null; href: string | null }) {
  if (!hash) return null;
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="tracking-[0.14em] text-muted-foreground uppercase">{label}</span>
      {href ? (
        <a className="underline-offset-4 hover:underline" href={href} target="_blank" rel="noreferrer">
          {hash}
        </a>
      ) : (
        <span>{hash}</span>
      )}
    </p>
  );
}
