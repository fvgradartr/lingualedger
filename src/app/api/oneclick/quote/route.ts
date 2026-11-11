import { errorResponse, json } from "@/lib/http";
import { dryQuote, nearPriceUsd } from "@/lib/oneclick";
import { buildQuote } from "@/lib/pipeline";
import type { Lang } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { origin?: string; text?: string; source?: Lang; target?: Lang };
    const quote = await buildQuote(body.text ?? "", body.source ?? "tr", body.target ?? "en");
    const nearUsd = await nearPriceUsd();
    const nearAmount = Number(BigInt(quote.quoteYocto) / BigInt("10") ** BigInt("18")) / 1e6;
    const dry = await dryQuote(body.origin ?? "sol-usdc", nearAmount * nearUsd);
    return json({ dry, jobUsd: nearAmount * nearUsd, labeled: "DRY RUN. No funds move." });
  } catch (error) {
    return errorResponse(error);
  }
}
