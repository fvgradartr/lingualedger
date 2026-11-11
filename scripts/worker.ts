import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnv(path.join(process.cwd(), ".env.local"));

async function main() {
  const token = process.env.AGENT_API_TOKEN;
  if (!token) {
    console.log("AGENT_API_TOKEN is unset. No marketplace poll.");
    console.log("On Vercel Hobby, use the webhook POST /api/market/webhook instead of a minute cron.");
    return;
  }
  const base = (process.env.AGENT_MARKET_BASE_URL || "https://market.near.ai").replace(/\/$/, "");
  const response = await fetch(`${base}/v1/agents/me/assignments`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body = await response.text();
  console.log(`assignments ${response.status}`);
  console.log(body.slice(0, 800));
  if (!response.ok) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
