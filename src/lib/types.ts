export type Lang = "tr" | "en" | "es";
export type Tone = "plain" | "formal" | "marketing";
export type Channel = "storefront" | "agent_market" | "demo";
export type Currency = "NEAR" | "USDC" | "other";

export interface GlossaryPair {
  source: string;
  target: string;
}

export interface SplitAccount {
  account: string;
  bps: number;
  role: string;
}

export interface Policy {
  minPriceYocto: string;
  pricePer100wYocto: string;
  maxDailySpendYocto: string;
  split: SplitAccount[];
  allowPayees: string[];
  paused: boolean;
  source: "chain" | "demo";
  contractId: string | null;
}

export interface Receipt {
  sha256: string;
  teeSigId: string;
  model: string;
  mode: "near-ai" | "demo";
  inferenceCostYocto: string;
  promptTokens: number;
  completionTokens: number;
  verified: boolean;
  verificationNote: string;
}

export interface PayoutLine {
  payee: string;
  role: string;
  bps: number;
  amountYocto: string;
  kind: "split" | "spend";
  transferred: boolean;
}

export interface JobOrder {
  id: string;
  channel: Channel;
  payer: string;
  sourceLang: Lang;
  targetLang: Lang;
  tone: Tone;
  glossary: GlossaryPair[];
  sourceText: string;
  words: number;
  amountYocto: string;
  currency: Currency;
  quoteYocto: string;
  floored: boolean;
  status: "paid" | "delivered" | "settled" | "failed";
  translation: string;
  deliverable: string;
  qaScore: number;
  qaNotes: string[];
  retried: boolean;
  detectedLang: Lang | "unknown";
  receipt: Receipt;
  payouts: PayoutLine[];
  tx: { pay: string | null; record: string | null; settle: string | null };
  createdAt: string;
  seed?: boolean;
  onChain?: boolean;
}

export interface QuoteResponse {
  words: number;
  quoteYocto: string;
  quoteNear: string;
  rawYocto: string;
  floored: boolean;
  blocks: number;
  usdEstimate: number;
  nearUsd: number;
  inferenceCostYocto: string;
  withinCap: boolean;
  daySpendYocto: string;
  policy: Policy;
  detectedLang: Lang | "unknown";
}

export const LANG_LABEL: Record<Lang, string> = {
  tr: "Turkish",
  en: "English",
  es: "Spanish",
};

export const TONE_LABEL: Record<Tone, string> = {
  plain: "Plain",
  formal: "Formal",
  marketing: "Marketing",
};
