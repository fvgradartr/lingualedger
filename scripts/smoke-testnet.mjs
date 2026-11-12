#!/usr/bin/env node
/**
 * One paid job on testnet: pay_order, record_sale, settle.
 * Uses the owner key in ~/.near-credentials. Does not print secrets.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Account } from "near-api-js";

const accountId = process.env.NEAR_CONTRACT_ID || "lingualedger-hq.testnet";
const rpc = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const file = path.join(homedir(), ".near-credentials/testnet", `${accountId}.json`);
if (!existsSync(file) && !process.env.OWNER_PRIVATE_KEY) {
  console.error("No owner key. Smoke test skipped.");
  process.exit(0);
}
const secret = process.env.OWNER_PRIVATE_KEY || JSON.parse(readFileSync(file, "utf8")).private_key;
const account = new Account(accountId, rpc, secret);
const orderId = `ll-smoke-${Date.now().toString(36)}`;
const translation =
  "LinguaLedger opens in three languages in Istanbul on 12 November 2026. Smoke receipt.";
const sha = createHash("sha256").update(translation).digest("hex");
const deposit = 50_000_000_000_000_000_000_000n;
const gas = 80_000_000_000_000n;

function hashOf(response) {
  return response?.transaction?.hash || response?.transaction_outcome?.id || "submitted";
}

const pay = await account.callFunctionRaw({
  contractId: accountId,
  methodName: "pay_order",
  args: { order_id: orderId, words: 41 },
  deposit,
  gas,
  waitUntil: "EXECUTED",
});
const record = await account.callFunctionRaw({
  contractId: accountId,
  methodName: "record_sale",
  args: {
    order_id: orderId,
    channel: "demo",
    amount: deposit.toString(),
    currency: "NEAR",
    words: 41,
    deliverable_sha256: sha,
    tee_sig_id: `demo:${sha.slice(0, 16)}`,
    inference_cost: "1",
    payer: accountId,
  },
  gas,
  waitUntil: "EXECUTED",
});
const settle = await account.callFunctionRaw({
  contractId: accountId,
  methodName: "settle",
  args: { order_id: orderId },
  gas,
  waitUntil: "EXECUTED",
});
console.log(JSON.stringify({ orderId, sha, pay: hashOf(pay), record: hashOf(record), settle: hashOf(settle) }, null, 2));
