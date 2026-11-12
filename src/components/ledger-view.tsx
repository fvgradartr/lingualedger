"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { readLocalOrders } from "@/components/local-orders";
import { KNOWN_CONTRACT_ID } from "@/lib/config";
import { formatNear, parseYocto } from "@/lib/pricing";
import type { JobOrder, Policy } from "@/lib/types";

interface LedgerPayload {
  policy: Policy;
  desk: { orders: JobOrder[]; revenueYocto: string; costsYocto: string; distributedYocto: string };
  chain: {
    orders: JobOrder[];
    totals: { revenue: string; costs: string; distributed: string; daySpend: string } | null;
  };
}

export function LedgerView() {
  const [data, setData] = useState<LedgerPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/ledger");
    if (!response.ok) {
      setError("The ledger did not load.");
      return;
    }
    const payload = (await response.json()) as LedgerPayload;
    const local = readLocalOrders();
    const seen = new Set(payload.desk.orders.map((order) => order.id));
    const extra = Object.values(local).filter((order) => !seen.has(order.id));
    payload.desk.orders = [...extra, ...payload.desk.orders];
    setData(payload);
  }

  useEffect(() => {
    load().catch(() => setError("The ledger did not load."));
  }, []);

  async function flip() {
    if (!data) return;
    setBusy(true);
    await fetch("/api/policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: !data.policy.paused }),
    });
    await load();
    setBusy(false);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
        <p className="text-sm text-cream/60">Opening the books…</p>
      </div>
    );
  }

  const contract = data.policy.contractId || KNOWN_CONTRACT_ID;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Public ledger</p>
          <h1 className="font-display mt-3 text-4xl text-cream sm:text-5xl">The books</h1>
        </div>
        <span
          className={`border px-3 py-1 text-[0.68rem] tracking-[0.16em] uppercase ${
            data.policy.paused ? "border-destructive/50 text-destructive" : "border-copper/50 text-copper"
          }`}
        >
          {data.policy.paused ? "Paused" : "Taking work"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Desk revenue" value={`${formatNear(parseYocto(data.desk.revenueYocto))} NEAR`} />
        <Stat label="Inference cost" value={`${formatNear(parseYocto(data.desk.costsYocto))} NEAR`} />
        <Stat label="Split recorded" value={`${formatNear(parseYocto(data.desk.distributedYocto))} NEAR`} />
      </div>

      <div className="paper paper-sheet p-6 sm:p-9">
        <p className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">Policy</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {data.policy.source === "chain"
            ? `Read from ${contract} on NEAR testnet.`
            : "The chain view did not answer, so these are the contract defaults."}
        </p>
        <div className="mt-6 grid gap-4 border-y border-copper/20 py-5 text-sm sm:grid-cols-3">
          <p>
            Minimum{" "}
            <span className="font-mono">{formatNear(parseYocto(data.policy.minPriceYocto))} NEAR</span>
          </p>
          <p>
            Per 100 words{" "}
            <span className="font-mono">{formatNear(parseYocto(data.policy.pricePer100wYocto))} NEAR</span>
          </p>
          <p>
            Daily cap{" "}
            <span className="font-mono">{formatNear(parseYocto(data.policy.maxDailySpendYocto))} NEAR</span>
          </p>
        </div>
        <div className="mt-6 space-y-4">
          {data.policy.split.map((share) => (
            <div key={share.account}>
              <div className="mb-1.5 flex justify-between gap-3 text-xs">
                <span>{share.role}</span>
                <span className="font-mono">{share.bps / 100}%</span>
              </div>
              <div className="h-1 overflow-hidden bg-cream-soft">
                <div className="h-full bg-copper-deep" style={{ width: `${share.bps / 100}%` }} />
              </div>
              <a
                className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:underline"
                href={`https://testnet.nearblocks.io/address/${share.account}`}
              >
                {share.account}
              </a>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant={data.policy.paused ? "default" : "destructive"} className="rounded-sm" disabled={busy} onClick={flip}>
            {data.policy.paused ? "Resume this desk" : "Pause this desk"}
          </Button>
          <p className="text-xs text-muted-foreground">Local kill switch for the demo. The on-chain switch is the owner call below.</p>
        </div>
        <pre className="mt-5 overflow-x-auto bg-ink p-4 font-mono text-[11px] leading-relaxed text-cream/80">{`near contract call-function as-transaction ${contract} set_paused json-args '{"paused":true}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as ${contract} network-config testnet sign-with-keychain send`}</pre>
      </div>

      <OrderTable title="This desk" orders={data.desk.orders} empty="No jobs yet. The desk is open." />
      <div className="space-y-2">
        <OrderTable title="On testnet" orders={data.chain.orders} empty="No jobs on the contract yet." />
        {data.chain.totals ? (
          <p className="text-xs text-cream/50">
            Contract totals: revenue {formatNear(parseYocto(data.chain.totals.revenue))} NEAR · costs{" "}
            {formatNear(parseYocto(data.chain.totals.costs))} · distributed {formatNear(parseYocto(data.chain.totals.distributed))}{" "}
            · spent today {formatNear(parseYocto(data.chain.totals.daySpend))}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper paper-sheet p-5">
      <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <p className="font-display quote-figure mt-2 text-2xl sm:text-3xl">{value}</p>
    </div>
  );
}

function OrderTable({ title, orders, empty }: { title: string; orders: JobOrder[]; empty: string }) {
  return (
    <div className="paper paper-sheet p-6 sm:p-8">
      <p className="text-[0.68rem] tracking-[0.18em] text-copper-deep uppercase">{title}</p>
      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
              <tr>
                <th className="py-2 pr-3 font-medium">Job</th>
                <th className="py-2 pr-3 font-medium">Channel</th>
                <th className="py-2 pr-3 font-medium">Words</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">sha256</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={`${title}-${order.id}`} className="border-t border-copper/15">
                  <td className="py-3 pr-3 font-mono text-xs">
                    <Link className="underline-offset-4 hover:underline" href={`/order/${order.id}`}>
                      {order.id}
                    </Link>
                    {order.seed ? <span className="ml-2 text-muted-foreground">example</span> : null}
                  </td>
                  <td className="py-3 pr-3">{order.channel}</td>
                  <td className="py-3 pr-3">{order.words}</td>
                  <td className="py-3 pr-3 font-mono">
                    {formatNear(parseYocto(order.amountYocto))} {order.currency}
                  </td>
                  <td className="py-3 pr-3 font-mono text-xs">
                    {order.receipt.sha256 ? `${order.receipt.sha256.slice(0, 12)}…` : "pending"}
                  </td>
                  <td className="py-3 tracking-wide uppercase text-[0.7rem] text-copper-deep">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
