import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SAMPLE_EN, SAMPLE_TR } from "./samples.ts";
import { looksUntranslated, translateWithFreeMt } from "./translate.ts";

process.env.LINGUALEDGER_OFFLINE = "1";
process.env.LINGUALEDGER_DATA = path.join(mkdtempSync(path.join(tmpdir(), "ll-free-")), "ledger.json");
delete process.env.NEAR_AI_API_KEY;
delete process.env.NEARAI_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("looksUntranslated detects identity and accepts a real pair", () => {
  assert.equal(looksUntranslated("Merhaba, bugün hava çok güzel.", "Merhaba, bugün hava çok güzel."), true);
  assert.equal(
    looksUntranslated(
      "Merhaba, bugün hava çok güzel. Toplantıyı saat üçte yapmak istiyorum.",
      "Hi, the weather is very nice today. I want to hold the meeting at three o'clock.",
    ),
    false,
  );
});

test("free MT uses the first provider and applies the glossary", async () => {
  const draft = await translateWithFreeMt(
    {
      text: "The treasury holds 12 items.",
      source: "en",
      target: "es",
      glossary: [{ source: "items", target: "artículos" }],
      tone: "plain",
    },
    async (input) => {
      const url = String(input);
      assert.match(url, /mymemory\.translated\.net/);
      return jsonResponse({
        responseData: { translatedText: "El tesoro guarda 12 items." },
        responseStatus: 200,
        quotaFinished: false,
      });
    },
  );
  assert.ok(draft);
  assert.equal(draft.model, "mymemory-public");
  assert.match(draft.text, /12/);
  assert.match(draft.text, /artículos/);
});

test("free MT falls back when the first provider fails", async () => {
  const seen: string[] = [];
  const draft = await translateWithFreeMt(
    {
      text: "The weather is nice today.",
      source: "en",
      target: "tr",
      glossary: [],
      tone: "plain",
    },
    async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("mymemory")) {
        return jsonResponse({ responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY." }, responseStatus: 200, quotaFinished: true });
      }
      if (url.includes("translate.wmcloud.org")) {
        return jsonResponse({ translation: "Bugün hava güzel." });
      }
      throw new Error(`unexpected ${url}`);
    },
  );
  assert.ok(draft);
  assert.equal(draft.model, "wikimedia-mint");
  assert.equal(draft.text, "Bugün hava güzel.");
  assert.ok(seen.some((url) => url.includes("mymemory")));
});

test("free MT returns null when every provider copies the source", async () => {
  const source = "Merhaba, bugün hava çok güzel.";
  const draft = await translateWithFreeMt(
    { text: source, source: "tr", target: "en", glossary: [], tone: "plain" },
    async (input) => {
      const url = String(input);
      if (url.includes("mymemory")) {
        return jsonResponse({ responseData: { translatedText: source }, responseStatus: 200, quotaFinished: false });
      }
      if (url.includes("wmcloud")) {
        return jsonResponse({ translation: source });
      }
      if (url.includes("googleapis")) {
        return jsonResponse([[ [source, source] ]]);
      }
      throw new Error(`unexpected ${url}`);
    },
  );
  assert.equal(draft, null);
});

test("createOrder translates custom text via free MT and keeps the canned sample local", async () => {
  const { createOrder, LedgerError } = await import("./pipeline.ts");
  const { resetStoreForTests, setPaused, debugSetDaySpend } = await import("./store.ts");
  resetStoreForTests();
  setPaused(false);
  debugSetDaySpend(0n);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network should not be used for the canned sample");
  }) as typeof fetch;
  try {
    const sample = await createOrder({ text: SAMPLE_TR, source: "tr", target: "en", channel: "demo" });
    assert.equal(sample.receipt.model, "lingualedger-demo-sample");
    assert.match(sample.translation, /Istanbul/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("mymemory")) {
      return jsonResponse({
        responseData: { translatedText: "Hi, the weather is very nice today." },
        responseStatus: 200,
        quotaFinished: false,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  try {
    const custom = await createOrder({
      text: "Merhaba, bugün hava çok güzel.",
      source: "tr",
      target: "en",
      channel: "demo",
    });
    assert.equal(custom.translation, "Hi, the weather is very nice today.");
    assert.equal(custom.receipt.model, "mymemory-public");
    assert.equal(custom.receipt.mode, "demo");
    assert.match(custom.receipt.verificationNote, /mymemory-public/);
    assert.match(custom.receipt.teeSigId, /^demo:/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = (async () => {
    return jsonResponse({
      responseData: { translatedText: "Merhaba, bu metin çevrilmedi." },
      responseStatus: 503,
      quotaFinished: true,
    }, 503);
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        createOrder({
          text: "Bu cümle özel bir deneme metnidir ve örnek paragrafla aynı değildir.",
          source: "tr",
          target: "en",
          channel: "demo",
        }),
      (error: unknown) =>
        error instanceof LedgerError &&
        error.message === "The translation service did not return a usable translation." &&
        error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  void SAMPLE_EN;
});
