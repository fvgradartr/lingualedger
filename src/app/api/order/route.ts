import { cookies } from "next/headers";
import { errorResponse, json } from "@/lib/http";
import { createOrder } from "@/lib/pipeline";
import type { Channel, Lang, Tone } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      source?: Lang;
      target?: Lang;
      tone?: Tone;
      glossary?: unknown;
      channel?: Channel;
    };
    const jar = await cookies();
    const order = await createOrder({
      text: body.text ?? "",
      source: body.source ?? "tr",
      target: body.target ?? "en",
      tone: body.tone,
      glossary: body.glossary,
      channel: body.channel ?? "demo",
      cookiePaused: jar.get("ll_paused")?.value,
    });
    return json({ order });
  } catch (error) {
    return errorResponse(error);
  }
}
