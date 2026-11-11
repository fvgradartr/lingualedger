import { LedgerError } from "@/lib/pipeline";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof LedgerError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "The desk could not finish that request." }, 500);
}
