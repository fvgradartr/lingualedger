import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SAMPLE_TR } from "./samples.ts";
import {
  chainSettleConfigured,
  countRecentOrders,
  hourlyCap,
  redactError,
  resetLocalSettlementsForTests,
  setSettleFnForTests,
} from "./settle.ts";

process.env.LINGUALEDGER_OFFLINE = "1";
process.env.LINGUALEDGER_DATA = path.join(mkdtempSync(path.join(tmpdir(), "ll-settle-")), "ledger.json");
delete process.env.NEAR_AI_API_KEY;
delete process.env.NEARAI_API_KEY;
delete process.env.AGENT_FC_PRIVATE_KEY;
delete process.env.DEMO_PAYER_PRIVATE_KEY;
delete process.env.DEMO_PAYER_ACCOUNT_ID;

test("hourly cap counts only this payer's last hour", () => {
  const now = 1_700_000_000_000;
  const ns = (ms: number) => ms * 1_000_000;
  const rows = [
    { payer: "guest.example.testnet", ts: ns(now - 60_000) },
    { payer: "guest.example.testnet", ts: ns(now - 3_500_000) },
    { payer: "guest.example.testnet", ts: ns(now - 3_700_000) },
    { payer: "someone-else.testnet", ts: ns(now - 10_000) },
  ];
  assert.equal(countRecentOrders(rows, "guest.example.testnet", now), 2);
  assert.equal(countRecentOrders(rows, "nobody.testnet", now), 0);
});

test("redactError strips private-key material", () => {
  const hidden = redactError(new Error("fail ed25519:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqr0123456789abcd and done"));
  assert.equal(hidden.includes("ABCDEF"), false);
  assert.match(hidden, /ed25519:\[redacted\]/);
});

test("offline or missing keys means chain settle is off", () => {
  assert.equal(chainSettleConfigured(), false);
  process.env.DEMO_MAX_SETTLEMENTS_PER_HOUR = "9";
  assert.equal(hourlyCap(), 9);
  delete process.env.DEMO_MAX_SETTLEMENTS_PER_HOUR;
  assert.equal(hourlyCap(), 12);
});

test("createOrder on a successful chain settle uses real hashes and marks payouts transferred", async () => {
  const { createOrder } = await import("./pipeline.ts");
  const { resetStoreForTests, setPaused, debugSetDaySpend } = await import("./store.ts");
  resetStoreForTests();
  setPaused(false);
  debugSetDaySpend(0n);
  resetLocalSettlementsForTests();
  setSettleFnForTests(async () => ({
    kind: "chain",
    pay: "PayHash11111111111111111111111111",
    record: "RecHash11111111111111111111111111",
    settle: "SetHash11111111111111111111111111",
    payer: "guest.lingualedger-hq.testnet",
    transferred: true,
    note: "The quote was paid, recorded, and settled on NEAR testnet from a sponsored guest account.",
  }));
  try {
    const order = await createOrder({ text: SAMPLE_TR, source: "tr", target: "en", channel: "demo" });
    assert.equal(order.status, "settled");
    assert.equal(order.settledOnChain, true);
    assert.equal(order.tx.pay, "PayHash11111111111111111111111111");
    assert.equal(order.tx.record, "RecHash11111111111111111111111111");
    assert.equal(order.tx.settle, "SetHash11111111111111111111111111");
    assert.ok(order.payouts.every((line) => line.transferred));
    assert.equal(order.payer, "guest.lingualedger-hq.testnet");
    assert.equal(order.channel, "storefront");
    assert.match(order.receipt.verificationNote, /settled on NEAR testnet/);
    assert.match(order.deliverable, /Signature id:/);
    assert.doesNotMatch(order.deliverable, /TEE signature:/);
    assert.match(order.translation, /Istanbul/);
  } finally {
    setSettleFnForTests(null);
  }
});

test("a capped or failed settle still returns the translation and invents no hashes", async () => {
  const { createOrder } = await import("./pipeline.ts");
  const { resetStoreForTests, setPaused, debugSetDaySpend } = await import("./store.ts");
  resetStoreForTests();
  setPaused(false);
  debugSetDaySpend(0n);
  setSettleFnForTests(async () => ({
    kind: "chain",
    pay: null,
    record: null,
    settle: null,
    payer: "guest.lingualedger-hq.testnet",
    transferred: false,
    note: "The sponsored guest account reached its hourly cap of 12 testnet settlements.",
  }));
  try {
    const order = await createOrder({ text: SAMPLE_TR, source: "tr", target: "en" });
    assert.equal(order.status, "delivered");
    assert.equal(order.settledOnChain, false);
    assert.equal(order.tx.pay, null);
    assert.equal(order.tx.record, null);
    assert.equal(order.tx.settle, null);
    assert.ok(order.payouts.every((line) => !line.transferred));
    assert.match(order.translation, /Istanbul/);
    assert.match(order.receipt.verificationNote, /hourly cap/);
    assert.doesNotMatch(order.tx.pay ?? "", /^demo:/);
  } finally {
    setSettleFnForTests(null);
  }
});
