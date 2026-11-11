#!/usr/bin/env node
/**
 * Deploy lingualedger-treasury to NEAR testnet and add the agent's
 * function-call key. The owner secret stays in the NEAR credentials file
 * or in OWNER_PRIVATE_KEY. This script never prints private keys.
 *
 * Usage:
 *   node scripts/deploy-testnet.mjs [account.testnet]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, KeyPairEd25519, actions } from "near-api-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpc = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
const accountId = process.argv[2] || process.env.NEAR_CONTRACT_ID || "lingualedger584b.testnet";
const wasmPath =
  process.env.WASM_PATH ||
  path.join(root, "contract/target/wasm32-unknown-unknown/release/lingualedger_treasury.wasm");

function loadOwnerKey() {
  if (process.env.OWNER_PRIVATE_KEY) return process.env.OWNER_PRIVATE_KEY;
  const file = path.join(homedir(), ".near-credentials/testnet", `${accountId}.json`);
  if (!existsSync(file)) {
    throw new Error(
      `No owner key. Create the account with the faucet, or set OWNER_PRIVATE_KEY.\n  near account create-account sponsor-by-faucet-service ${accountId} autogenerate-new-keypair save-to-keychain network-config testnet create`,
    );
  }
  const cred = JSON.parse(readFileSync(file, "utf8"));
  if (!cred.private_key) throw new Error(`Credentials file for ${accountId} has no private_key.`);
  return cred.private_key;
}

function owner() {
  return new Account(accountId, rpc, loadOwnerKey());
}

async function exists(id) {
  try {
    await new Account(id, rpc).getState();
    return true;
  } catch {
    return false;
  }
}

async function ensureSub(parent, prefix) {
  const id = `${prefix}.${accountId}`;
  if (await exists(id)) {
    console.log(`account ${id} already exists`);
    return id;
  }
  const key = KeyPairEd25519.fromRandom();
  console.log(`creating ${id}`);
  await parent.createSubAccount({
    accountOrPrefix: prefix,
    publicKey: key.getPublicKey().toString(),
    nearToTransfer: 200_000_000_000_000_000_000_000n,
  });
  const dir = path.join(homedir(), ".near-credentials/testnet");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({ account_id: id, public_key: key.getPublicKey().toString(), private_key: key.toString() }, null, 2),
  );
  console.log(`saved ${id} key under ~/.near-credentials (not in the repo)`);
  return id;
}

async function viewPolicy() {
  const body = {
    jsonrpc: "2.0",
    id: "policy",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: accountId,
      method_name: "get_policy",
      args_base64: Buffer.from("{}").toString("base64"),
    },
  };
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (json.error || json.result?.error) return null;
  const bytes = json.result?.result;
  if (!Array.isArray(bytes)) return null;
  return JSON.parse(Buffer.from(bytes).toString("utf8"));
}

async function main() {
  if (!existsSync(wasmPath)) {
    throw new Error(`Missing wasm at ${wasmPath}. Run: npm run contract:build`);
  }
  const parent = owner();
  const reserve = await ensureSub(parent, "reserve");
  const contributors = await ensureSub(parent, "contributors");
  const wasm = new Uint8Array(readFileSync(wasmPath));
  const policy = await viewPolicy();
  const deployActions = [actions.deployContract(wasm)];
  if (!policy) {
    deployActions.push(
      actions.functionCall(
        "new",
        {
          owner: accountId,
          agent: accountId,
          reserve,
          contributors,
        },
        80_000_000_000_000n,
        0n,
      ),
    );
    console.log("deploying contract and calling new");
  } else {
    console.log("contract state already initialized; deploying code only");
  }
  const deployed = await parent.signAndSendTransaction({
    receiverId: accountId,
    actions: deployActions,
    waitUntil: "EXECUTED",
  });
  console.log(`deploy tx ${deployed.transaction?.hash ?? "submitted"}`);

  const agentKey = KeyPairEd25519.fromRandom();
  await parent.addFunctionCallAccessKey({
    publicKey: agentKey.getPublicKey().toString(),
    contractId: accountId,
    methodNames: ["record_sale", "request_spend", "settle"],
    allowance: 2_000_000_000_000_000_000_000_000n,
  });
  console.log(`agent function-call key ${agentKey.getPublicKey().toString()}`);
  console.log("methods: record_sale, request_spend, settle");

  const envPath = path.join(root, ".env.local");
  const lines = [
    `NEXT_PUBLIC_CONTRACT_ID=${accountId}`,
    `NEAR_CONTRACT_ID=${accountId}`,
    `NEAR_RPC_URL=${rpc}`,
    `NEAR_NETWORK_ID=testnet`,
    `AGENT_FC_ACCOUNT_ID=${accountId}`,
    `AGENT_FC_PRIVATE_KEY=${agentKey.toString()}`,
    `DEMO_OPEN_KILL_SWITCH=1`,
    "",
  ];
  writeFileSync(envPath, lines.join("\n"));
  console.log("wrote .env.local (gitignored). It holds the agent function-call key, not the owner key.");

  const live = await viewPolicy();
  if (!live) throw new Error("get_policy did not return after deploy");
  console.log(
    `policy min=${live.min_price_yocto} per100=${live.price_per_100w_yocto} paused=${live.paused}`,
  );
  console.log(`contract ${accountId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
