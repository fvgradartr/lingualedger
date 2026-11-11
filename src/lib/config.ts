export const APP_NAME = "LinguaLedger";

/** Public testnet treasury. Override with NEAR_CONTRACT_ID or NEXT_PUBLIC_CONTRACT_ID. */
export const KNOWN_CONTRACT_ID = "lingualedger584b.testnet";

export const RPC_URL = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
export const EXPLORER = "https://testnet.nearblocks.io";

export const RESERVE_ACCOUNT = "reserve.lingualedger584b.testnet";
export const OWNER_ACCOUNT = "lingualedger584b.testnet";
export const CONTRIBUTORS_ACCOUNT = "contributors.lingualedger584b.testnet";

export const ONECLICK_BASE = process.env.ONECLICK_BASE_URL || "https://1click.chaindefuser.com";
export const NEAR_USDC_ASSET =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export const MAX_WORDS = 1500;
export const MAX_CHARS = 12_000;

export function contractId(): string | null {
  if (process.env.LINGUALEDGER_OFFLINE === "1") return null;
  if (process.env.NEAR_CONTRACT_ID === "off") return null;
  const fromEnv = process.env.NEAR_CONTRACT_ID || process.env.NEXT_PUBLIC_CONTRACT_ID;
  if (fromEnv) return fromEnv;
  return KNOWN_CONTRACT_ID;
}

export function nearUsdFallback(): number {
  const parsed = Number(process.env.NEAR_USD_PRICE || "3.5");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3.5;
}

export function modelUsdPerMillion(): number {
  const parsed = Number(process.env.MODEL_USD_PER_MILLION || "0.15");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.15;
}
