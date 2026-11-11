import { NEAR_USDC_ASSET, ONECLICK_BASE, nearUsdFallback } from "@/lib/config";

export interface OriginChoice {
  id: string;
  label: string;
  chain: string;
  asset: string;
  refundTo: string;
  decimals: number;
  symbol: string;
}

export const ORIGINS: OriginChoice[] = [
  {
    id: "sol-usdc",
    label: "Solana USDC",
    chain: "sol",
    symbol: "USDC",
    decimals: 6,
    asset: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
    refundTo: process.env.ONECLICK_REFUND_SOL || "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  },
  {
    id: "eth-usdc",
    label: "Ethereum USDC",
    chain: "eth",
    symbol: "USDC",
    decimals: 6,
    asset: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
    refundTo: process.env.ONECLICK_REFUND_EVM || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  },
  {
    id: "base-eth",
    label: "Base ETH",
    chain: "base",
    symbol: "ETH",
    decimals: 18,
    asset: "nep141:base.omft.near",
    refundTo: process.env.ONECLICK_REFUND_EVM || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  },
];

export interface DryQuote {
  dry: true;
  origin: OriginChoice;
  amountIn: string;
  amountInFormatted: string;
  amountOutFormatted: string;
  amountInUsd: string;
  amountOutUsd: string;
  timeEstimate: number;
  correlationId: string;
  note: string;
}

let nearPriceCache: { at: number; usd: number } | null = null;

export async function nearPriceUsd(): Promise<number> {
  if (nearPriceCache && Date.now() - nearPriceCache.at < 10 * 60_000) return nearPriceCache.usd;
  try {
    const response = await fetch(`${ONECLICK_BASE}/v0/tokens`, {
      headers: { accept: "application/json", "user-agent": "LinguaLedger/0.1" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return nearUsdFallback();
    const tokens = (await response.json()) as { symbol?: string; blockchain?: string; price?: number }[];
    const near = tokens.find((token) => token.symbol === "wNEAR" && token.blockchain === "near");
    const price = near?.price && near.price > 0 ? near.price : nearUsdFallback();
    nearPriceCache = { at: Date.now(), usd: price };
    return price;
  } catch {
    return nearUsdFallback();
  }
}

export async function dryQuote(originId: string, outputUsd: number): Promise<DryQuote> {
  const origin = ORIGINS.find((item) => item.id === originId) ?? ORIGINS[0]!;
  const wanted = Math.max(outputUsd, 2);
  const note =
    outputUsd < 2
      ? "Dry quote for 2 USDC out. This job is under the usual Intents minimum, so the preview uses 2 USDC. No deposit address is created and no funds move."
      : "Dry quote. No deposit address is created and no funds move.";
  const amount = BigInt(Math.round(wanted * 1_000_000)).toString();
  const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
  const recipient = process.env.ONECLICK_RECIPIENT || "wrap.near";
  const response = await fetch(`${ONECLICK_BASE}/v0/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; LinguaLedger/0.1)",
      ...(process.env.ONECLICK_JWT ? { authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}),
    },
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      originAsset: origin.asset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: NEAR_USDC_ASSET,
      amount,
      recipient,
      recipientType: "DESTINATION_CHAIN",
      refundTo: origin.refundTo,
      refundType: "ORIGIN_CHAIN",
      deadline,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json()) as {
    message?: string;
    correlationId?: string;
    quote?: {
      amountIn?: string;
      amountInFormatted?: string;
      amountOutFormatted?: string;
      amountInUsd?: string;
      amountOutUsd?: string;
      timeEstimate?: number;
    };
  };
  if (!response.ok || !payload.quote) {
    throw new Error(payload.message || `1Click dry quote failed (${response.status})`);
  }
  return {
    dry: true,
    origin,
    amountIn: payload.quote.amountIn ?? "",
    amountInFormatted: payload.quote.amountInFormatted ?? "",
    amountOutFormatted: payload.quote.amountOutFormatted ?? "",
    amountInUsd: payload.quote.amountInUsd ?? "",
    amountOutUsd: payload.quote.amountOutUsd ?? "",
    timeEstimate: payload.quote.timeEstimate ?? 0,
    correlationId: payload.correlationId ?? "",
    note,
  };
}
