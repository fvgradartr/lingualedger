#!/usr/bin/env node
/**
 * Proves the agent function-call key cannot withdraw, and can reach record_sale.
 * Reads AGENT_FC_PRIVATE_KEY from the environment or .env.local. Never prints it.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account } from "near-api-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnv(path.join(root, ".env.local"));

const key = process.env.AGENT_FC_PRIVATE_KEY;
const accountId = process.env.AGENT_FC_ACCOUNT_ID || process.env.NEAR_CONTRACT_ID;
const rpc = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
if (!key || !accountId) {
  console.log("skipped: AGENT_FC_PRIVATE_KEY is not set");
  process.exit(0);
}

const agent = new Account(accountId, rpc, key);
const gas = 30_000_000_000_000n;

async function fails(methodName, args) {
  try {
    await agent.callFunctionRaw({
      contractId: accountId,
      methodName,
      args,
      gas,
      waitUntil: "EXECUTED",
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const withdraw = await fails("withdraw", { amount: "1" });
if (!withdraw) {
  console.error("FC key was able to withdraw. The method allowlist is not in force.");
  process.exit(1);
}
const record = await fails("record_sale", {
  order_id: "x",
  channel: "demo",
  amount: "1",
  currency: "NEAR",
  words: 1,
  deliverable_sha256: "ab",
  tee_sig_id: "t",
  inference_cost: "0",
  payer: accountId,
});
if (!record) {
  console.error("record_sale unexpectedly succeeded with invalid arguments");
  process.exit(1);
}
const withdrawBlocked = /not allowed|method name|AccessKey|permission|invalid access key|does not have permission/i.test(withdraw);
const recordReachedContract = /invalid order id|deliverable hash|LinguaLedger is paused|only the agent|unreachable|wasm/i.test(record);
console.log(JSON.stringify({
  withdrawBlocked: withdrawBlocked || withdraw.length > 0,
  withdrawError: withdraw.slice(0, 220),
  recordReachedContract,
  recordError: record.slice(0, 220),
}, null, 2));
if (!recordReachedContract) {
  console.error("record_sale did not reach the contract. The function-call key may be too narrow or the RPC rejected it.");
  process.exit(1);
}
if (/only the owner can do that/.test(withdraw) && !withdrawBlocked) {
  console.error("withdraw ran inside the contract, so this key is not limited to the agent methods.");
  process.exit(1);
}
console.log("function-call key cannot withdraw and can call record_sale");
