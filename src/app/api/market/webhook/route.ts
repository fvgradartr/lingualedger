import { errorResponse, json } from "@/lib/http";
import { briefFromPayload, webhookAuthorized } from "@/lib/market";
import { createOrder, LedgerError } from "@/lib/pipeline";

export async function POST(request: Request) {
  const raw = await request.text();
  const auth = webhookAuthorized(raw, request.headers);
  if (!auth.ok) return json({ error: auth.reason }, 401);
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: "Webhook body is not JSON." }, 400);
  }
  const event = String((payload as { event?: string }).event ?? request.headers.get("x-market-event") ?? "");
  if (event && event !== "hire.created") {
    return json({ ok: true, ignored: event, auth: auth.reason });
  }
  const brief = briefFromPayload(payload);
  if (!brief.text) return json({ ok: true, ignored: "empty brief", auth: auth.reason });
  try {
    const order = await createOrder({
      text: brief.text,
      source: brief.source,
      target: brief.target,
      channel: "agent_market",
      payer: brief.assignmentId || "agent-market",
    });
    return json({ ok: true, orderId: order.id, qaScore: order.qaScore, auth: auth.reason });
  } catch (error) {
    if (error instanceof LedgerError) return json({ ok: false, error: error.message }, error.status);
    return errorResponse(error);
  }
}
