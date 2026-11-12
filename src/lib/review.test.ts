import assert from "node:assert/strict";
import test from "node:test";
import { reviewTranslation } from "./review.ts";
import { translateDemo, detectLanguage } from "./translate.ts";
import { SAMPLE_EN, SAMPLE_TR } from "./samples.ts";

test("curated Turkish sample keeps numbers and reads as English", () => {
  const draft = translateDemo({
    text: SAMPLE_TR,
    source: "tr",
    target: "en",
    glossary: [{ source: "fatura", target: "invoice" }],
    tone: "plain",
  });
  assert.equal(draft.model, "lingualedger-demo-sample");
  assert.ok(draft.review.score >= 90);
  assert.match(draft.text, /Istanbul/);
  assert.match(draft.text, /invoice/);
  assert.match(draft.text, /\b12\b/);
  assert.match(draft.text, /0\.02/);
  assert.match(draft.text, /sha256/);
});

test("phrasebook keeps urls and numbers and applies a glossary", () => {
  const draft = translateDemo({
    text: "See https://near.org and 12 items",
    source: "en",
    target: "es",
    glossary: [{ source: "items", target: "artículos" }],
    tone: "plain",
  });
  assert.match(draft.text, /https:\/\/near\.org/);
  assert.match(draft.text, /\b12\b/);
  assert.match(draft.text, /artículos/);
  assert.ok(draft.review.score >= 70);
});

test("review flags a dropped number", () => {
  const review = reviewTranslation("Ship 12 boxes", "Ship the boxes", []);
  assert.ok(review.score < 100);
  assert.match(review.notes.join(" "), /12/);
});

test("detects the sample as Turkish", () => {
  assert.equal(detectLanguage(SAMPLE_TR), "tr");
  assert.equal(detectLanguage(SAMPLE_EN), "en");
});

test("review flags a translation that copies the source", () => {
  const review = reviewTranslation("Merhaba, bugün hava çok güzel.", "Merhaba, bugün hava çok güzel.", []);
  assert.ok(review.score < 70);
  assert.match(review.notes.join(" "), /matches the source/);
});
