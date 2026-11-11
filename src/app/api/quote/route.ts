import { errorResponse, json } from "@/lib/http";
import { nearPriceUsd } from "@/lib/oneclick";
import { buildQuote } from "@/lib/pipeline";
import { isPaused } from "@/lib/store";
import type { Lang } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; source?: Lang; target?: Lang };
    const quote = await buildQuote(body.text ?? "", body.source ?? "tr", body.target ?? "en");
    const live = await nearPriceUsd();
    const nearAmount = Number(BigInt(quote.quoteYocto) / BigInt("10") ** BigInt("18")) / 1e6;
    if (isPaused()) quote.policy = { ...quote.policy, paused: true };
    return json({ ...quote, nearUsd: live, usdEstimate: nearAmount * live });
  } catch (error) {
    return errorResponse(error);
  }
}
