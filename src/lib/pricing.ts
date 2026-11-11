import {
  CONTRIBUTORS_ACCOUNT,
  OWNER_ACCOUNT,
  RESERVE_ACCOUNT,
  modelUsdPerMillion,
  nearUsdFallback,
} from "@/lib/config";

export const YOCTO = BigInt("10") ** BigInt("24");
/** 0.05 NEAR. Matches DEFAULT_MIN_PRICE_YOCTO in the contract. */
export const DEFAULT_MIN_PRICE_YOCTO = (BigInt("5") * YOCTO) / BigInt("100");
/** 0.02 NEAR per started 100-word block. */
export const DEFAULT_PRICE_PER_100_YOCTO = (BigInt("2") * YOCTO) / BigInt("100");
/** 0.5 NEAR per UTC day. */
export const DEFAULT_MAX_DAILY_SPEND_YOCTO = (BigInt("5") * YOCTO) / BigInt("10");

export interface SplitAccount {
  account: string;
  bps: number;
  role: string;
}

export const DEFAULT_SPLIT: SplitAccount[] = [
  { account: RESERVE_ACCOUNT, bps: 7000, role: "Operating reserve" },
  { account: OWNER_ACCOUNT, bps: 2000, role: "Owner" },
  { account: CONTRIBUTORS_ACCOUNT, bps: 1000, role: "Contributors" },
];

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** One charge per started block of 100 words, then the floor. Same math as the contract. */
export function quoteYocto(words: number, pricePer100 = DEFAULT_PRICE_PER_100_YOCTO, minPrice = DEFAULT_MIN_PRICE_YOCTO): bigint {
  if (!Number.isInteger(words) || words <= 0) return BigInt("0");
  const blocks = BigInt(Math.floor((words + 99) / 100));
  const raw = blocks * pricePer100;
  return raw > minPrice ? raw : minPrice;
}

export function quoteParts(words: number, pricePer100 = DEFAULT_PRICE_PER_100_YOCTO, minPrice = DEFAULT_MIN_PRICE_YOCTO) {
  const blocks = words <= 0 ? 0 : Math.floor((words + 99) / 100);
  const raw = BigInt(blocks) * pricePer100;
  const yocto = quoteYocto(words, pricePer100, minPrice);
  return { blocks, raw, yocto, floored: words > 0 && raw < minPrice };
}

/** Share 0 is the reserve and receives rounding dust. Parts sum to `amount`. */
export function allocateSplit(amount: bigint, bps: number[]): bigint[] {
  if (bps.length === 0) throw new Error("split is empty");
  const sum = bps.reduce((total, share) => total + share, 0);
  if (sum !== 10_000) throw new Error("split must sum to 10000");
  const out = bps.map(() => BigInt("0"));
  let allocated = BigInt("0");
  for (let index = 1; index < bps.length; index += 1) {
    const cut = (amount * BigInt(bps[index]!)) / BigInt("10000");
    out[index] = cut;
    allocated += cut;
  }
  out[0] = amount - allocated;
  return out;
}

export function formatNear(yocto: bigint, digits = 4): string {
  const negative = yocto < BigInt("0");
  const value = negative ? -yocto : yocto;
  const whole = value / YOCTO;
  const frac = value % YOCTO;
  const padded = frac.toString().padStart(24, "0");
  let fracStr = padded.slice(0, digits).replace(/0+$/, "");
  if (!fracStr && frac > BigInt("0")) {
    const significant = padded.replace(/0+$/, "");
    fracStr = significant.slice(0, Math.min(8, significant.length));
  }
  const text = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function formatYocto(yocto: bigint): string {
  return yocto.toString();
}

export function parseYocto(value: string | number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("yocto number is not a safe integer");
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) throw new Error("yocto amount is not an integer string");
  return BigInt(value);
}

export function estimateInferenceYocto(words: number, nearUsd = nearUsdFallback(), usdPerMillion = modelUsdPerMillion()): bigint {
  if (words <= 0 || nearUsd <= 0) return BigInt("0");
  const tokens = BigInt(words) * BigInt("4");
  const usdPerMillionMicros = BigInt(Math.round(usdPerMillion * 1_000_000));
  const nearUsdMicros = BigInt(Math.round(nearUsd * 1_000_000));
  if (nearUsdMicros === BigInt("0")) return BigInt("0");
  const usdMicros = (tokens * usdPerMillionMicros) / BigInt("1000000");
  return (usdMicros * YOCTO) / nearUsdMicros;
}

export function usdFromNear(yocto: bigint, nearUsd = nearUsdFallback()): number {
  const near = Number(yocto) / 1e24;
  return near * nearUsd;
}
