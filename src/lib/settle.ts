import { agentCall, readChainOrders } from "@/lib/chain";
import { contractId, RPC_URL } from "@/lib/config";
import { explorerTx } from "@/lib/explorer";

export interface SettleInput {
  id: string;
  words: number;
  amountYocto: string;
  sha256: string;
  teeSigId: string;
  inferenceCostYocto: string;
}

export interface SettleResult {
  kind: "chain" | "local";
  pay: string | null;
  record: string | null;
  settle: string | null;
  payer: string | null;
  transferred: boolean;
  note: string;
}

export type SettleFn = (input: SettleInput) => Promise<SettleResult>;

let override: SettleFn | null = null;

export function setSettleFnForTests(fn: SettleFn | null): void {
  override = fn;
}

/** 0.05 NEAR kept on the guest so a job cannot spend the last of its gas. */
const GAS_RESERVE_YOCTO = BigInt("50000000000000000000000");

const localHits: number[] = [];

export function chainSettleConfigured(): boolean {
  if (process.env.LINGUALEDGER_OFFLINE === "1") return false;
  return Boolean(
    process.env.DEMO_PAYER_ACCOUNT_ID?.trim() &&
      process.env.DEMO_PAYER_PRIVATE_KEY?.trim() &&
      process.env.AGENT_FC_PRIVATE_KEY?.trim() &&
      contractId(),
  );
}

export function hourlyCap(): number {
  const parsed = Number(process.env.DEMO_MAX_SETTLEMENTS_PER_HOUR || "12");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 12;
}

export function resetLocalSettlementsForTests(): void {
  localHits.length = 0;
}

export function markLocalSettlement(at = Date.now()): void {
  localHits.push(at);
}

export function pruneLocalSettlements(now = Date.now()): number {
  const cutoff = now - 3_600_000;
  while (localHits.length && localHits[0]! < cutoff) localHits.shift();
  return localHits.length;
}

/** `ts` is the NEAR block timestamp in nanoseconds. */
export function countRecentOrders(
  rows: { payer: string; ts: number }[],
  payer: string,
  nowMs = Date.now(),
): number {
  const cutoffNs = (nowMs - 3_600_000) * 1_000_000;
  return rows.filter((row) => row.payer === payer && Number(row.ts) >= cutoffNs).length;
}

export function redactError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/ed25519:[A-Za-z0-9]+/g, "ed25519:[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 280);
}

async function guestBalanceYocto(accountId: string): Promise<bigint | null> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "guest",
        method: "query",
        params: { request_type: "view_account", finality: "final", account_id: accountId },
      }),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await response.json()) as { result?: { amount?: string } };
    if (!json.result?.amount) return null;
    return BigInt(json.result.amount);
  } catch {
    return null;
  }
}

function txHash(response: unknown): string {
  if (!response || typeof response !== "object") return "submitted";
  const record = response as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return record.transaction?.hash || record.transaction_outcome?.id || "submitted";
}

function hasFailure(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const record = response as {
    status?: { Failure?: unknown } | string;
    receipts_outcome?: { outcome?: { status?: { Failure?: unknown } } }[];
  };
  if (record.status && typeof record.status === "object" && record.status.Failure) return true;
  return Boolean(record.receipts_outcome?.some((row) => row.outcome?.status && "Failure" in row.outcome.status));
}

async function payerCall(methodName: string, args: Record<string, unknown>, deposit: bigint): Promise<string> {
  const key = process.env.DEMO_PAYER_PRIVATE_KEY;
  const signer = process.env.DEMO_PAYER_ACCOUNT_ID;
  const id = contractId();
  if (!key || !signer || !id) throw new Error("The sponsored guest payer is not configured.");
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
  if (hasFailure(response)) throw new Error(`${methodName} failed on testnet`);
  const hash = txHash(response);
  if (!hash || hash === "submitted") throw new Error(`${methodName} did not return a transaction hash`);
  return hash;
}

async function defaultSettle(input: SettleInput): Promise<SettleResult> {
  if (!chainSettleConfigured()) {
    return {
      kind: "local",
      pay: `demo:${input.id}`,
      record: `demo:${input.id}:record`,
      settle: `demo:${input.id}:settle`,
      payer: null,
      transferred: false,
      note: "Local receipt only. No testnet NEAR moved.",
    };
  }

  const payer = process.env.DEMO_PAYER_ACCOUNT_ID!.trim();
  const cap = hourlyCap();
  const localCount = pruneLocalSettlements();
  let chainCount = 0;
  try {
    const rows = await readChainOrders();
    chainCount = rows.filter((row) => {
      if (row.payer !== payer) return false;
      const at = Date.parse(row.createdAt);
      return Number.isFinite(at) && Date.now() - at < 3_600_000;
    }).length;
  } catch {
    chainCount = 0;
  }
  if (Math.max(localCount, chainCount) >= cap) {
    return {
      kind: "chain",
      pay: null,
      record: null,
      settle: null,
      payer,
      transferred: false,
      note: `The sponsored guest account reached its hourly cap of ${cap} testnet settlements. The translation above is still the real deliverable. No fake transaction hashes are shown.`,
    };
  }

  const amount = BigInt(input.amountYocto);
  const available = await guestBalanceYocto(payer);
  if (available !== null && available < amount + GAS_RESERVE_YOCTO) {
    return {
      kind: "chain",
      pay: null,
      record: null,
      settle: null,
      payer,
      transferred: false,
      note: "The sponsored guest account does not have enough testnet NEAR left for this quote. The translation above is still the real deliverable. No fake transaction hashes are shown.",
    };
  }

  let pay: string | null = null;
  let record: string | null = null;
  let settle: string | null = null;
  try {
    pay = await payerCall("pay_order", { order_id: input.id, words: input.words }, amount);
    record = await agentCall("record_sale", {
      order_id: input.id,
      channel: "storefront",
      amount: input.amountYocto,
      currency: "NEAR",
      words: input.words,
      deliverable_sha256: input.sha256,
      tee_sig_id: input.teeSigId,
      inference_cost: input.inferenceCostYocto,
      payer,
    });
    if (!record) throw new Error("record_sale did not return a transaction hash");
    settle = await agentCall("settle", { order_id: input.id });
    if (!settle) throw new Error("settle did not return a transaction hash");
    markLocalSettlement();
    const payLink = explorerTx(pay);
    const settleLink = explorerTx(settle);
    return {
      kind: "chain",
      pay,
      record,
      settle,
      payer,
      transferred: true,
      note: [
        "The quote was paid, recorded, and settled on NEAR testnet from a sponsored guest account.",
        "This is testnet NEAR, not mainnet.",
        payLink ? `Pay: ${payLink}.` : "",
        settleLink ? `Settle: ${settleLink}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (error) {
    return {
      kind: "chain",
      pay,
      record,
      settle,
      payer,
      transferred: false,
      note: `On-chain settlement was not completed: ${redactError(error)}. The translation above is still the real deliverable. No fake transaction hashes are shown for the steps that failed.`,
    };
  }
}

export async function settleJob(input: SettleInput): Promise<SettleResult> {
  if (override) return override(input);
  return defaultSettle(input);
}
