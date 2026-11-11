import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_TR } from "./samples.ts";
import {
  DEFAULT_MIN_PRICE_YOCTO,
  DEFAULT_PRICE_PER_100_YOCTO,
  allocateSplit,
  countWords,
  formatNear,
  quoteParts,
  quoteYocto,
} from "./pricing.ts";

test("sample paragraph is 41 words and floors at 0.05 NEAR", () => {
  assert.equal(countWords(SAMPLE_TR), 41);
  const parts = quoteParts(41);
  assert.equal(parts.floored, true);
  assert.equal(parts.yocto, DEFAULT_MIN_PRICE_YOCTO);
  assert.equal(formatNear(parts.yocto), "0.05");
  assert.equal(parts.raw, DEFAULT_PRICE_PER_100_YOCTO);
});

test("quote bills each started block of 100 words", () => {
  assert.equal(quoteYocto(0), 0n);
  assert.equal(quoteYocto(100), DEFAULT_MIN_PRICE_YOCTO);
  assert.equal(quoteYocto(101), DEFAULT_MIN_PRICE_YOCTO);
  assert.equal(quoteYocto(500), 5n * DEFAULT_PRICE_PER_100_YOCTO);
  assert.equal(formatNear(quoteYocto(500)), "0.1");
});

test("split sends rounding dust to the reserve", () => {
  assert.deepEqual(allocateSplit(10_000n, [7000, 2000, 1000]).map(String), ["7000", "2000", "1000"]);
  assert.deepEqual(allocateSplit(1n, [7000, 2000, 1000]).map(String), ["1", "0", "0"]);
  assert.deepEqual(allocateSplit(10n, [7000, 2000, 1000]).map(String), ["7", "2", "1"]);
  const priced = allocateSplit(DEFAULT_MIN_PRICE_YOCTO, [7000, 2000, 1000]);
  assert.equal(priced.reduce((sum, part) => sum + part, 0n), DEFAULT_MIN_PRICE_YOCTO);
});
