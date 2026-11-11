import { ONECLICK_BASE } from "@/lib/config";
import { json } from "@/lib/http";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("depositAddress");
  if (!address) {
    return json({
      status: "dry",
      message: "Dry quotes do not create a deposit address. LinguaLedger does not submit live 1Click swaps.",
    });
  }
  if (address.startsWith("demo:")) {
    return json({ status: "dry", message: "That is a local demo id, not a 1Click deposit address." });
  }
  const response = await fetch(`${ONECLICK_BASE}/v0/status?depositAddress=${encodeURIComponent(address)}`, {
    headers: {
      accept: "application/json",
      "user-agent": "LinguaLedger/0.1",
      ...(process.env.ONECLICK_JWT ? { authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => ({ message: "status unavailable" }));
  return json(payload, response.ok ? 200 : response.status);
}
