import { createHash, randomBytes } from "node:crypto";
import { readPolicy } from "@/lib/chain";
import { MAX_CHARS, MAX_WORDS } from "@/lib/config";
import {
  allocateSplit,
  countWords,
  estimateInferenceYocto,
  formatNear,
  formatYocto,
  parseYocto,
  quoteParts,
} from "@/lib/pricing";
import { addDaySpend, currentDaySpend, isPaused, upsertOrder } from "@/lib/store";
import { curatedTranslation } from "@/lib/samples";
import { detectLanguage, looksUntranslated, translateDemo, translateWithFreeMt, translateWithNearAi } from "@/lib/translate";
import type { Channel, GlossaryPair, JobOrder, Lang, QuoteResponse, Tone } from "@/lib/types";

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const TONES = new Set<Tone>(["plain", "formal", "marketing"]);
const LANGS = new Set<Lang>(["tr", "en", "es"]);

export function newOrderId(): string {
  return `ll-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function cleanGlossary(input: unknown): GlossaryPair[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 12)
    .map((pair) => {
      const row = pair as { source?: unknown; target?: unknown };
      return { source: String(row.source ?? "").trim().slice(0, 48), target: String(row.target ?? "").trim().slice(0, 48) };
    })
    .filter((pair) => pair.source && pair.target);
}

export function assertBrief(text: string, source: Lang, target: Lang): void {
  if (!text.trim()) throw new LedgerError("Paste a text to translate.");
  if (text.length > MAX_CHARS) throw new LedgerError("That text is too long for one job.");
  if (!LANGS.has(source) || !LANGS.has(target)) throw new LedgerError("Choose Turkish, English, or Spanish.");
  if (source === target) throw new LedgerError("Pick two different languages.");
  const words = countWords(text);
  if (words > MAX_WORDS) throw new LedgerError(`Keep the job to ${MAX_WORDS} words or fewer.`);
}

export async function buildQuote(text: string, source: Lang, target: Lang): Promise<QuoteResponse> {
  assertBrief(text, source, target);
  const policy = await readPolicy();
  const words = countWords(text);
  const parts = quoteParts(words, parseYocto(policy.pricePer100wYocto), parseYocto(policy.minPriceYocto));
  const nearUsd = Number(process.env.NEAR_USD_PRICE || "3.5");
  const price = Number.isFinite(nearUsd) && nearUsd > 0 ? nearUsd : 3.5;
  const nearAmount = Number(parts.yocto / BigInt("10") ** BigInt("18")) / 1e6;
  const inference = estimateInferenceYocto(words, price);
  const spent = currentDaySpend();
  const cap = parseYocto(policy.maxDailySpendYocto);
  return {
    words,
    quoteYocto: formatYocto(parts.yocto),
    quoteNear: formatNear(parts.yocto),
    rawYocto: formatYocto(parts.raw),
    floored: parts.floored,
    blocks: parts.blocks,
    usdEstimate: nearAmount * price,
    nearUsd: price,
    inferenceCostYocto: formatYocto(inference),
    withinCap: spent + inference <= cap,
    daySpendYocto: formatYocto(spent),
    policy,
    detectedLang: detectLanguage(text),
  };
}

function receiptFooter(order: Omit<JobOrder, "deliverable">): string {
  return [
    order.translation.trim(),
    "",
    "---",
    "## Receipt",
    `Order: ${order.id}`,
    `sha256: ${order.receipt.sha256}`,
    `TEE signature: ${order.receipt.teeSigId}`,
    `Model: ${order.receipt.model}`,
    `Mode: ${order.receipt.mode}`,
    `QA: ${order.qaScore}`,
    `Inference cost: ${formatNear(parseYocto(order.receipt.inferenceCostYocto))} NEAR`,
    order.tx.record ? `Record tx: ${order.tx.record}` : "",
    order.tx.settle ? `Settle tx: ${order.tx.settle}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function createOrder(input: {
  text: string;
  source: Lang;
  target: Lang;
  tone?: Tone;
  glossary?: unknown;
  channel?: Channel;
  payer?: string;
  cookiePaused?: string | null;
}): Promise<JobOrder> {
  const tone = input.tone && TONES.has(input.tone) ? input.tone : "plain";
  const glossary = cleanGlossary(input.glossary);
  assertBrief(input.text, input.source, input.target);
  if (isPaused(input.cookiePaused)) throw new LedgerError("LinguaLedger is paused", 409);

  const quote = await buildQuote(input.text, input.source, input.target);
  if (quote.policy.paused) throw new LedgerError("LinguaLedger is paused", 409);
  if (!quote.withinCap) throw new LedgerError("This job would pass the daily inference cap.", 409);

  const brief = { text: input.text, source: input.source, target: input.target, glossary, tone };
  const near = await translateWithNearAi(brief).catch(() => null);
  const nearUsable = Boolean(near?.text.trim()) && !looksUntranslated(input.text, near!.text);
  const curated = curatedTranslation(input.text, input.source, input.target);
  const free = nearUsable || curated ? null : await translateWithFreeMt(brief).catch(() => null);
  const freeUsable = Boolean(free?.text.trim()) && !looksUntranslated(input.text, free!.text);
  const draft = nearUsable ? near! : curated ? translateDemo(brief) : freeUsable ? free! : null;
  if (!draft?.text.trim()) {
    throw new LedgerError("The translation service did not return a usable translation.", 502);
  }

  const sha256 = createHash("sha256").update(draft.text).digest("hex");
  const inference = parseYocto(quote.inferenceCostYocto);
  const amount = parseYocto(quote.quoteYocto);
  const parts = allocateSplit(amount, quote.policy.split.map((share) => share.bps));
  const id = newOrderId();
  const mode = draft.mode;
  const teeSigId = mode === "near-ai" && near ? near.teeSigId : `demo:${sha256.slice(0, 16)}`;

  const order: JobOrder = {
    id,
    channel: input.channel ?? "demo",
    payer: input.payer || "demo-desk",
    sourceLang: input.source,
    targetLang: input.target,
    tone,
    glossary,
    sourceText: input.text,
    words: quote.words,
    amountYocto: quote.quoteYocto,
    currency: "NEAR",
    quoteYocto: quote.quoteYocto,
    floored: quote.floored,
    status: "delivered",
    translation: draft.text,
    deliverable: "",
    qaScore: draft.review.score,
    qaNotes: draft.review.notes,
    retried: draft.retried,
    detectedLang: detectLanguage(input.text),
    receipt: {
      sha256,
      teeSigId,
      model: draft.model,
      mode,
      inferenceCostYocto: quote.inferenceCostYocto,
      promptTokens: mode === "near-ai" && near ? near.promptTokens : Math.ceil(quote.words * 1.3),
      completionTokens: mode === "near-ai" && near ? near.completionTokens : Math.ceil(draft.text.split(/\s+/).length * 1.3),
      verified: mode === "near-ai" && near ? near.verified : false,
      verificationNote:
        mode === "near-ai" && near
          ? near.verificationNote
          : draft.model.startsWith("lingualedger-demo")
            ? "Demo mode. This is a local sample translation. The signature id is local and not a TEE attestation."
            : `Demo mode used the free public translator ${draft.model}. This is not a NEAR AI call, and the signature id is local, not a TEE attestation.`,
    },
    payouts: quote.policy.split.map((share, index) => ({
      payee: share.account,
      role: share.role,
      bps: share.bps,
      amountYocto: formatYocto(parts[index] ?? BigInt("0")),
      kind: "split" as const,
      transferred: false,
    })),
    tx: {
      pay: `demo:${id}`,
      record: null,
      settle: null,
    },
    createdAt: new Date().toISOString(),
  };

  // Demo pay does not move testnet NEAR. Settling a NEAR order on chain
  // transfers real balance, so that path lives in scripts/smoke-testnet.mjs
  // after an actual pay_order deposit. Receipts here are local and labeled.
  order.tx.record = `demo:${id}:record`;
  order.tx.settle = `demo:${id}:settle`;
  order.status = "settled";
  order.deliverable = receiptFooter(order);
  addDaySpend(inference);
  upsertOrder(order);
  return order;
}
