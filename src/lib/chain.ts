import { contractId, RPC_URL } from "@/lib/config";
import { explorerAccount, explorerTx } from "@/lib/explorer";
import { DEFAULT_MAX_DAILY_SPEND_YOCTO, DEFAULT_MIN_PRICE_YOCTO, DEFAULT_PRICE_PER_100_YOCTO, DEFAULT_SPLIT, formatYocto } from "@/lib/pricing";
import type { JobOrder, Policy } from "@/lib/types";

interface ChainPolicy {
  min_price_yocto: string;
  price_per_100w_yocto: string;
  max_daily_spend_yocto: string;
  split_bps: { account: string; bps: number }[];
  allow_payees: string[];
  paused: boolean;
}

interface ChainOrder {
  id: string;
  channel: string;
  payer: string;
  amount_yocto: string;
  currency: string;
  words: number;
  deliverable_sha256: string;
  tee_sig_id: string;
  inference_cost_yocto: string;
  status: "Paid" | "Delivered" | "Settled";
  ts: number;
}

const ROLE = ["Operating reserve", "Owner", "Contributors"];

function demoPolicy(): Policy {
  return {
    minPriceYocto: formatYocto(DEFAULT_MIN_PRICE_YOCTO),
    pricePer100wYocto: formatYocto(DEFAULT_PRICE_PER_100_YOCTO),
    maxDailySpendYocto: formatYocto(DEFAULT_MAX_DAILY_SPEND_YOCTO),
    split: DEFAULT_SPLIT,
    allowPayees: [DEFAULT_SPLIT[0]!.account],
    paused: false,
    source: "demo",
    contractId: contractId(),
  };
}

async function rpcView<T>(method: string, args: Record<string, unknown>): Promise<T | null> {
  const id = contractId();
  if (!id) return null;
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: method,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: id,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { result?: { result?: number[] }; error?: unknown };
  if (!payload.result?.result || payload.error) return null;
  const text = Buffer.from(payload.result.result).toString("utf8");
  return JSON.parse(text) as T;
}

export function mapChainPolicy(raw: ChainPolicy, id: string | null): Policy {
  return {
    minPriceYocto: String(raw.min_price_yocto),
    pricePer100wYocto: String(raw.price_per_100w_yocto),
    maxDailySpendYocto: String(raw.max_daily_spend_yocto),
    split: raw.split_bps.map((share, index) => ({
      account: share.account,
      bps: share.bps,
      role: ROLE[index] ?? `Share ${index + 1}`,
    })),
    allowPayees: raw.allow_payees,
    paused: raw.paused,
    source: "chain",
    contractId: id,
  };
}

export async function readPolicy(): Promise<Policy> {
  try {
    const raw = await rpcView<ChainPolicy>("get_policy", {});
    if (!raw) return demoPolicy();
    return mapChainPolicy(raw, contractId());
  } catch {
    return demoPolicy();
  }
}

export async function readChainOrders(): Promise<JobOrder[]> {
  try {
    const rows = await rpcView<ChainOrder[]>("get_orders", { from: 0, limit: 50 });
    if (!rows) return [];
    return rows.map(chainOrderToJob);
  } catch {
    return [];
  }
}

export async function readChainTotals(): Promise<{ revenue: string; costs: string; distributed: string; daySpend: string } | null> {
  try {
    const totals = await rpcView<{
      revenue_yocto: string;
      costs_yocto: string;
      distributed_yocto: string;
      day_spend_yocto: string;
    }>("get_totals", {});
    if (!totals) return null;
    return {
      revenue: String(totals.revenue_yocto),
      costs: String(totals.costs_yocto),
      distributed: String(totals.distributed_yocto),
      daySpend: String(totals.day_spend_yocto),
    };
  } catch {
    return null;
  }
}

function chainOrderToJob(row: ChainOrder): JobOrder {
  const status = row.status === "Settled" ? "settled" : row.status === "Delivered" ? "delivered" : "paid";
  const created = Number.isFinite(row.ts) ? new Date(row.ts / 1_000_000).toISOString() : new Date().toISOString();
  return {
    id: row.id,
    channel: row.channel === "agent_market" || row.channel === "storefront" || row.channel === "demo" ? row.channel : "storefront",
    payer: row.payer,
    sourceLang: "tr",
    targetLang: "en",
    tone: "plain",
    glossary: [],
    sourceText: "",
    words: row.words,
    amountYocto: String(row.amount_yocto),
    currency: row.currency === "USDC" || row.currency === "other" ? row.currency : "NEAR",
    quoteYocto: String(row.amount_yocto),
    floored: false,
    status,
    translation: "",
    deliverable: row.deliverable_sha256
      ? `On-chain receipt only. The source text stays off chain.\n\nsha256 ${row.deliverable_sha256}\nTEE ${row.tee_sig_id || "none"}`
      : "Paid on testnet. The deliverable hash is written when the agent records the sale.",
    qaScore: 0,
    qaNotes: ["Read from the treasury contract."],
    retried: false,
    detectedLang: "unknown",
    receipt: {
      sha256: row.deliverable_sha256,
      teeSigId: row.tee_sig_id,
      model: "on-chain record",
      mode: "demo",
      inferenceCostYocto: String(row.inference_cost_yocto || "0"),
      promptTokens: 0,
      completionTokens: 0,
      verified: false,
      verificationNote: "This row was read from NEAR testnet. The hash is the public commitment.",
    },
    payouts: [],
    tx: { pay: null, record: null, settle: null },
    createdAt: created,
    onChain: true,
  };
}

export { explorerAccount, explorerTx };

function txHash(response: unknown): string {
  if (!response || typeof response !== "object") return "submitted";
  const record = response as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return record.transaction?.hash || record.transaction_outcome?.id || "submitted";
}

export async function agentCall(methodName: string, args: Record<string, unknown>, deposit = BigInt("0")): Promise<string | null> {
  const key = process.env.AGENT_FC_PRIVATE_KEY;
  const id = contractId();
  const signer = process.env.AGENT_FC_ACCOUNT_ID || id;
  if (!key || !id || !signer) return null;
  const { Account } = await import("near-api-js");
  const account = new Account(signer, RPC_URL, key as `ed25519:${string}`);
  const response = await account.callFunctionRaw({
    contractId: id,
    methodName,
    args,
    deposit,
    gas: BigInt("80000000000000"),
    waitUntil: "EXECUTED",
  });
  return txHash(response);
}
