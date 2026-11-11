"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readLocalOrders } from "@/components/local-orders";
import { explorerTx } from "@/lib/explorer";
import { formatNear, parseYocto } from "@/lib/pricing";
import type { JobOrder } from "@/lib/types";

const STEPS = ["Quote", "Paid", "Translating", "QA", "Delivered", "Recorded", "Settled"];

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
      <Card>
        <CardHeader>
          <CardTitle>No such job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Link className={buttonVariants({ variant: "outline" })} href="/">Back to the desk</Link>
        </CardContent>
      </Card>
    );
  }

  if (!order) {
    return <p className="text-sm text-muted-foreground">Opening the job…</p>;
  }

  const showText = step >= STEPS.length;
  const payLink = explorerTx(order.tx.pay);
  const recordLink = explorerTx(order.tx.record);
  const settleLink = explorerTx(order.tx.settle);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Job {order.id}</p>
          <h1 className="font-display text-4xl tracking-tight">
            {order.sourceLang.toUpperCase()} → {order.targetLang.toUpperCase()}
          </h1>
        </div>
        <Badge variant={order.receipt.mode === "near-ai" ? "default" : "secondary"}>
          {order.receipt.mode === "near-ai" ? "NEAR AI Cloud" : "Demo inference"}
        </Badge>
      </div>

      <ol className="grid gap-2 sm:grid-cols-7">
        {STEPS.map((label, index) => {
          const done = index < step;
          return (
            <li key={label} className={`rounded-lg border px-2 py-2 text-center text-xs ${done ? "border-primary/40 bg-primary/10" : "border-border bg-card/70 text-muted-foreground"}`}>
              {label}
            </li>
          );
        })}
      </ol>

      {showText ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Deliverable</CardTitle>
              <Button variant="outline" size="sm" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
            </CardHeader>
            <CardContent>
              <article className="font-mono text-sm leading-relaxed whitespace-pre-wrap">{order.deliverable || order.translation || "Hash only. The source text was not stored on chain."}</article>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>QA {order.qaScore}{order.retried ? " · retried once" : ""}</p>
              <ul className="space-y-1 text-muted-foreground">
                {order.qaNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
              <p className="font-mono text-xs break-all">sha256 {order.receipt.sha256 || "pending"}</p>
              <p className="font-mono text-xs break-all">TEE {order.receipt.teeSigId || "pending"}</p>
              <p className="text-muted-foreground">{order.receipt.verificationNote}</p>
              <p>Price {formatNear(parseYocto(order.amountYocto))} NEAR{order.floored ? " · floored" : ""}</p>
              <p>Model {order.receipt.model}</p>
              <div className="space-y-1 font-mono text-xs">
                <TxLine label="Pay" hash={order.tx.pay} href={payLink} />
                <TxLine label="Record" hash={order.tx.record} href={recordLink} />
                <TxLine label="Settle" hash={order.tx.settle} href={settleLink} />
              </div>
              {order.payouts.length > 0 ? (
                <ul className="space-y-1">
                  {order.payouts.map((payout) => (
                    <li key={payout.payee} className="flex justify-between gap-3">
                      <span>{payout.role} · {payout.bps / 100}%</span>
                      <span className="font-mono">{formatNear(parseYocto(payout.amountYocto))}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link className={buttonVariants({ variant: "outline" })} href="/ledger">Open the ledger</Link>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">The house is working the job. The deliverable appears when the receipt is closed.</p>
      )}
    </div>
  );
}

function TxLine({ label, hash, href }: { label: string; hash: string | null; href: string | null }) {
  if (!hash) return null;
  return (
    <p>
      {label}{" "}
      {href ? (
        <a className="underline" href={href}>{hash}</a>
      ) : (
        <span>{hash}</span>
      )}
    </p>
  );
}
