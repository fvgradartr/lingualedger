import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SAMPLE_EN, SAMPLE_TR } from "@/lib/samples";
import { DEFAULT_MIN_PRICE_YOCTO, allocateSplit, formatYocto } from "@/lib/pricing";
import { DEFAULT_SPLIT } from "@/lib/pricing";
import type { JobOrder } from "@/lib/types";

export interface LedgerFile {
  paused: boolean;
  orders: JobOrder[];
  dayIndex: number;
  daySpendYocto: string;
}

const globalStore = globalThis as unknown as { __ll?: LedgerFile; __llPath?: string };

export function utcDay(date = new Date()): number {
  return Math.floor(date.getTime() / 86_400_000);
}

function dataPath(): string {
  return process.env.LINGUALEDGER_DATA || path.join(process.cwd(), "data", "ledger.json");
}

function readLedger(file: string): string | null {
  if (process.env.LINGUALEDGER_DATA) {
    if (!existsSync(/* turbopackIgnore: true */ file)) return null;
    return readFileSync(/* turbopackIgnore: true */ file, "utf8");
  }
  const stable = path.join(process.cwd(), "data", "ledger.json");
  if (!existsSync(stable)) return null;
  return readFileSync(stable, "utf8");
}

function writeLedger(file: string, contents: string): void {
  if (process.env.LINGUALEDGER_DATA) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(/* turbopackIgnore: true */ file, contents);
    return;
  }
  const stable = path.join(process.cwd(), "data", "ledger.json");
  mkdirSync(path.dirname(stable), { recursive: true });
  writeFileSync(stable, contents);
}

export function resetStoreForTests(): void {
  globalStore.__ll = undefined;
  globalStore.__llPath = undefined;
}

function seedOrder(): JobOrder {
  const body = SAMPLE_EN;
  const sha256 = createHash("sha256").update(body).digest("hex");
  const amount = DEFAULT_MIN_PRICE_YOCTO;
  const parts = allocateSplit(amount, DEFAULT_SPLIT.map((share) => share.bps));
  const deliverable = `${body}\n\n---\nReceipt (seeded example, not a customer job)\nsha256 ${sha256}\n`;
  return {
    id: "ll-seed-example",
    channel: "demo",
    payer: "desk.demo",
    sourceLang: "tr",
    targetLang: "en",
    tone: "plain",
    glossary: [],
    sourceText: SAMPLE_TR,
    words: 41,
    amountYocto: formatYocto(amount),
    currency: "NEAR",
    quoteYocto: formatYocto(amount),
    floored: true,
    status: "settled",
    translation: body,
    deliverable,
    qaScore: 100,
    qaNotes: ["Seeded worked example of the 70/20/10 split."],
    retried: false,
    detectedLang: "tr",
    receipt: {
      sha256,
      teeSigId: "demo:seed",
      model: "lingualedger-demo-sample",
      mode: "demo",
      inferenceCostYocto: "0",
      promptTokens: 0,
      completionTokens: 0,
      verified: false,
      verificationNote: "Seeded locally so the ledger is readable before the first job.",
    },
    payouts: DEFAULT_SPLIT.map((share, index) => ({
      payee: share.account,
      role: share.role,
      bps: share.bps,
      amountYocto: formatYocto(parts[index] ?? BigInt("0")),
      kind: "split" as const,
      transferred: false,
    })),
    tx: { pay: "demo:seed-pay", record: "demo:seed-record", settle: "demo:seed-settle" },
    createdAt: "2026-11-11T12:00:00.000Z",
    seed: true,
  };
}

function emptyState(): LedgerFile {
  return {
    paused: false,
    orders: [seedOrder()],
    dayIndex: utcDay(),
    daySpendYocto: "0",
  };
}

function persist(state: LedgerFile): void {
  globalStore.__ll = state;
  globalStore.__llPath = dataPath();
  try {
    writeLedger(dataPath(), JSON.stringify(state, null, 2));
  } catch {
    // The serverless filesystem is read-only. Memory still serves this instance.
  }
}

export function loadState(): LedgerFile {
  const file = dataPath();
  if (globalStore.__ll && globalStore.__llPath === file) return globalStore.__ll;
  const raw = readLedger(file);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as LedgerFile;
      globalStore.__ll = parsed;
      globalStore.__llPath = file;
      return parsed;
    } catch {
      // Fall through to a fresh book if the file is unreadable.
    }
  }
  const state = emptyState();
  persist(state);
  return state;
}

export function saveState(state: LedgerFile): void {
  persist(state);
}

export function isPaused(cookie?: string | null): boolean {
  const state = loadState();
  if (state.paused) return true;
  if (process.env.LINGUALEDGER_DATA) return cookie === "1";
  return cookie === "1" && !existsSync(path.join(process.cwd(), "data", "ledger.json"));
}

export function setPaused(paused: boolean): void {
  const state = loadState();
  state.paused = paused;
  persist(state);
}

export function upsertOrder(order: JobOrder): void {
  const state = loadState();
  const index = state.orders.findIndex((existing) => existing.id === order.id);
  if (index >= 0) state.orders[index] = order;
  else state.orders.unshift(order);
  persist(state);
}

export function getOrder(id: string): JobOrder | null {
  return loadState().orders.find((order) => order.id === id) ?? null;
}

export function listOrders(): JobOrder[] {
  return loadState().orders;
}

export function currentDaySpend(): bigint {
  const state = loadState();
  if (state.dayIndex !== utcDay()) return BigInt("0");
  return BigInt(state.daySpendYocto || "0");
}

export function addDaySpend(amount: bigint): void {
  const state = loadState();
  const today = utcDay();
  const spent = state.dayIndex === today ? BigInt(state.daySpendYocto || "0") : BigInt("0");
  state.dayIndex = today;
  state.daySpendYocto = (spent + amount).toString();
  persist(state);
}

export function debugSetDaySpend(amount: bigint): void {
  const state = loadState();
  state.dayIndex = utcDay();
  state.daySpendYocto = amount.toString();
  persist(state);
}
