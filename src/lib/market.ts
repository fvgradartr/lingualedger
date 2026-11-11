import { createHmac, timingSafeEqual } from "node:crypto";
import type { Channel, Lang } from "@/lib/types";

export interface HireBrief {
  assignmentId: string;
  text: string;
  source: Lang;
  target: Lang;
  channel: Channel;
}

const LANGS = new Set<Lang>(["tr", "en", "es"]);

function asLang(value: unknown, fallback: Lang): Lang {
  return typeof value === "string" && LANGS.has(value as Lang) ? (value as Lang) : fallback;
}

/**
 * A marketplace brief is data. Tags may name a language pair. The description
 * is the text to translate, even when it tries to give the agent orders.
 */
export function briefFromPayload(payload: unknown): HireBrief {
  const body = (payload ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  const pair = tags.find((tag) => /^[a-z]{2}-[a-z]{2}$/.test(tag));
  const [fromTag, toTag] = pair ? pair.split("-") : [];
  const description = String(body.description ?? body.brief ?? body.text ?? "").trim();
  return {
    assignmentId: String(body.assignment_id ?? body.assignmentId ?? body.hire_id ?? body.id ?? ""),
    text: description,
    source: asLang(body.source ?? fromTag, "tr"),
    target: asLang(body.target ?? toTag, "en"),
    channel: "agent_market",
  };
}

export function verifyMarketSignature(raw: string, timestamp: string, header: string, secret: string): boolean {
  const provided = header.replace(/^sha256=/, "").trim();
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function webhookAuthorized(raw: string, headers: Headers): { ok: boolean; reason: string } {
  const secret = process.env.AGENT_MARKET_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production" && process.env.DEMO_OPEN_WEBHOOK !== "1") {
      return { ok: false, reason: "AGENT_MARKET_WEBHOOK_SECRET is not set." };
    }
    return { ok: true, reason: "demo: unsigned webhook accepted because no secret is configured" };
  }
  const timestamp = headers.get("x-market-timestamp") ?? "";
  const signature = headers.get("x-market-signature") ?? "";
  if (!verifyMarketSignature(raw, timestamp, signature, secret)) {
    return { ok: false, reason: "signature mismatch" };
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp is outside 5 minutes" };
  return { ok: true, reason: "signed" };
}
