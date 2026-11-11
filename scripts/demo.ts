import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createOrder } from "../src/lib/pipeline";
import { formatNear, parseYocto } from "../src/lib/pricing";
import { SAMPLE_TR } from "../src/lib/samples";

function loadEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnv(path.join(process.cwd(), ".env"));
loadEnv(path.join(process.cwd(), ".env.local"));

async function main() {
  const started = Date.now();
  const order = await createOrder({
    text: SAMPLE_TR,
    source: "tr",
    target: "en",
    tone: "plain",
    glossary: [{ source: "fatura", target: "invoice" }],
    channel: "demo",
  });

  console.log("LinguaLedger demo");
  console.log(`order     ${order.id}`);
  console.log(`words     ${order.words}`);
  console.log(`price     ${formatNear(parseYocto(order.amountYocto))} NEAR${order.floored ? " (floored)" : ""}`);
  console.log(`qa        ${order.qaScore}`);
  console.log(`mode      ${order.receipt.mode}`);
  console.log(`model     ${order.receipt.model}`);
  console.log(`sha256    ${order.receipt.sha256}`);
  console.log(`tee       ${order.receipt.teeSigId}`);
  console.log(`record    ${order.tx.record}`);
  console.log(`settle    ${order.tx.settle}`);
  for (const payout of order.payouts) {
    console.log(`split     ${payout.bps / 100}%  ${payout.role}  ${formatNear(parseYocto(payout.amountYocto))} NEAR  ${payout.payee}`);
  }
  console.log("");
  console.log(order.translation);
  console.log("");
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
