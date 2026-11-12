"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Evidence } from "@/components/evidence";
import { saveLocalOrder } from "@/components/local-orders";
import { SAMPLE_TR } from "@/lib/samples";
import { countWords } from "@/lib/pricing";
import { LANG_LABEL, TONE_LABEL, type GlossaryPair, type JobOrder, type Lang, type QuoteResponse, type Tone } from "@/lib/types";

const LANGS: Lang[] = ["tr", "en", "es"];
const TONES: Tone[] = ["plain", "formal", "marketing"];

interface DryView {
  labeled: string;
  jobUsd: number;
  dry: {
    note: string;
    origin: { label: string; symbol: string };
    amountInFormatted: string;
    amountOutFormatted: string;
    amountInUsd: string;
    amountOutUsd: string;
    timeEstimate: number;
    correlationId: string;
  };
}

function Segment<T extends string>({
  value,
  onChange,
  options,
  labels,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: T[];
  labels: Record<T, string>;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Desk() {
  const router = useRouter();
  const [text, setText] = useState(SAMPLE_TR);
  const [source, setSource] = useState<Lang>("tr");
  const [target, setTarget] = useState<Lang>("en");
  const [tone, setTone] = useState<Tone>("plain");
  const [glossary, setGlossary] = useState<GlossaryPair[]>([]);
  const [draftSource, setDraftSource] = useState("fatura");
  const [draftTarget, setDraftTarget] = useState("invoice");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("sol-usdc");
  const [dry, setDry] = useState<DryView | null>(null);
  const [dryError, setDryError] = useState<string | null>(null);
  const [drying, setDrying] = useState(false);
  const [payTab, setPayTab] = useState<"demo" | "any">("demo");

  const words = useMemo(() => countWords(text), [text]);

  useEffect(() => {
    if (!text.trim() || source === target) {
      setQuote(null);
      setQuoteError(source === target ? "Pick two different languages." : null);
      return;
    }
    const handle = setTimeout(async () => {
      setQuoting(true);
      setQuoteError(null);
      try {
        const response = await fetch("/api/quote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, source, target }),
        });
        const payload = (await response.json()) as QuoteResponse & { error?: string };
        if (!response.ok) {
          setQuote(null);
          setQuoteError(payload.error ?? "Could not price this text.");
          return;
        }
        setQuote(payload);
      } catch {
        setQuoteError("The quote service did not answer.");
      } finally {
        setQuoting(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [text, source, target]);

  const sponsoredPay = quote?.chainSettleEnabled ?? true;

  function addGlossary() {
    if (!draftSource.trim() || !draftTarget.trim()) return;
    setGlossary((current) => [...current, { source: draftSource.trim(), target: draftTarget.trim() }].slice(0, 12));
    setDraftSource("");
    setDraftTarget("");
  }

  async function pay() {
    setPaying(true);
    setPayError(null);
    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, source, target, tone, glossary, channel: "demo" }),
      });
      const payload = (await response.json()) as { order?: JobOrder; error?: string };
      if (!response.ok || !payload.order) {
        setPayError(payload.error ?? "Payment failed.");
        return;
      }
      saveLocalOrder(payload.order);
      router.push(`/order/${payload.order.id}?fresh=1`);
    } catch {
      setPayError("The desk could not reach the order service.");
    } finally {
      setPaying(false);
    }
  }

  async function requestDryQuote() {
    setDrying(true);
    setDryError(null);
    try {
      const response = await fetch("/api/oneclick/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ origin, text, source, target }),
      });
      const payload = (await response.json()) as DryView & { error?: string };
      if (!response.ok) {
        setDry(null);
        setDryError(payload.error ?? "1Click did not return a quote.");
        return;
      }
      setDry(payload);
    } catch {
      setDryError("1Click did not answer.");
    } finally {
      setDrying(false);
    }
  }

  const workCopy = quote?.nearAiConfigured
    ? "NEAR AI Cloud translates custom text when the call succeeds. A receipt is marked TEE-verified only after the response signature checks against the attested signing address. If that call fails, the desk falls back to a free public translator (MyMemory, then MinT, then a public Google endpoint). QA is local."
    : "A free public translator on the live desk (MyMemory, then MinT, then a public Google endpoint). This is not NEAR AI and not a TEE. A NEAR AI key would switch that path on. QA is local.";

  const payCopy = sponsoredPay
    ? quote?.nearAiConfigured
      ? "A shared guest account pays the quote in real testnet NEAR. You do not need a wallet. Translation uses NEAR AI Cloud when that call succeeds (private inference; a receipt is marked verified only if the response signature matches the attested TEE key). If the NEAR AI call fails, a free public translator is the fallback. The 70/20/10 split actually transfers on testnet. This is testnet only — no real money. An hourly guest cap may apply."
      : "A shared guest account pays the quote in real testnet NEAR. You do not need a wallet. Translation uses a free public translator (not NEAR AI, and not a TEE). The 70/20/10 split actually transfers on testnet. This is testnet only — no real money. An hourly guest cap may apply."
    : "This local path records the translation, QA, sha256 receipt, and the 70/20/10 split on this desk only. It does not move testnet NEAR. The live site, when keys are set, pays and settles on testnet.";

  return (
    <>
      <section className="mx-auto max-w-6xl px-5 pt-14 pb-8 sm:px-6 sm:pt-20 sm:pb-12">
        <p className="eyebrow ink-in">Translation house · Turkish · English · Spanish</p>
        <h1 className="mt-5 max-w-4xl ink-in ink-in-delay">
          <span className="font-display-italic block text-[2.7rem] leading-[1.05] text-cream sm:text-6xl lg:text-7xl">
            Paste the text.
          </span>
          <span className="font-display mt-1 block text-[2.7rem] leading-[1.05] text-cream sm:text-6xl lg:text-7xl">
            The floor is on chain.
          </span>
        </h1>
        <p className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-cream/65 ink-in ink-in-delay-2">
          A guest account pays. The job is recorded. The treasury settles. The owner key never sits on the host.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="paper paper-sheet ink-in ink-in-delay-2">
          <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)]">
            <div className="min-w-0 space-y-6 p-6 sm:p-8 lg:p-10">
              <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                <Segment label="From" value={source} onChange={setSource} options={LANGS} labels={LANG_LABEL} />
                <Segment label="To" value={target} onChange={setTarget} options={LANGS} labels={LANG_LABEL} />
                <Segment label="Tone" value={tone} onChange={setTone} options={TONES} labels={TONE_LABEL} />
              </div>
              <div className="space-y-2">
                <label htmlFor="source-text" className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Source
                </label>
                <textarea
                  id="source-text"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-56 w-full resize-y border-0 border-b border-copper/25 bg-transparent px-0 py-3 text-[1.05rem] leading-[1.7] text-foreground outline-none transition-colors focus:border-copper-deep"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {words} words{quote?.detectedLang ? ` · detected ${LANG_LABEL[quote.detectedLang as Lang] ?? quote.detectedLang}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-copper-deep underline-offset-4 hover:underline"
                    onClick={() => {
                      setText(SAMPLE_TR);
                      setSource("tr");
                      setTarget("en");
                    }}
                  >
                    Load the Turkish sample
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">Glossary</p>
                {glossary.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {glossary.map((pair, index) => (
                      <button
                        key={`${pair.source}-${index}`}
                        type="button"
                        className="border border-border bg-cream px-3 py-1 text-xs text-foreground hover:border-copper-deep"
                        onClick={() => setGlossary((current) => current.filter((_, item) => item !== index))}
                      >
                        {pair.source} → {pair.target} ×
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <input
                    className="h-10 border-0 border-b border-input bg-transparent px-0 text-sm outline-none focus:border-copper-deep"
                    value={draftSource}
                    placeholder="fatura"
                    onChange={(event) => setDraftSource(event.target.value)}
                    aria-label="Glossary source"
                  />
                  <input
                    className="h-10 border-0 border-b border-input bg-transparent px-0 text-sm outline-none focus:border-copper-deep"
                    value={draftTarget}
                    placeholder="invoice"
                    onChange={(event) => setDraftTarget(event.target.value)}
                    aria-label="Glossary target"
                  />
                  <Button type="button" variant="ghost" className="h-10 rounded-sm px-3 text-copper-deep" onClick={addGlossary}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="relative border-t border-copper/20 bg-[color-mix(in_oklch,var(--cream)_70%,var(--cream-soft))] p-6 sm:p-8 lg:border-t-0 lg:border-l lg:p-10">
              <p className="text-[0.68rem] tracking-[0.2em] text-copper-deep uppercase">Quote slip</p>
              <p className="font-display quote-figure mt-4 text-5xl text-foreground sm:text-6xl">
                {quote ? `${quote.quoteNear}` : quoting ? "—" : "0.00"}
                <span className="font-display ml-2 text-2xl text-muted-foreground">NEAR</span>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {quote?.floored ? (
                  <span className="border border-copper-deep/30 px-2 py-0.5 text-[0.65rem] tracking-[0.12em] text-copper-deep uppercase">
                    Floored at the minimum
                  </span>
                ) : null}
                {quote?.policy.paused ? (
                  <span className="border border-destructive/40 px-2 py-0.5 text-[0.65rem] tracking-[0.12em] text-destructive uppercase">
                    Paused
                  </span>
                ) : (
                  <span className="border border-border px-2 py-0.5 text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase">
                    Open
                  </span>
                )}
                <span className="border border-border px-2 py-0.5 text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase">
                  {quote?.policy.source === "chain" ? "Price read on testnet" : "Demo policy"}
                </span>
              </div>

              {quoteError ? <p className="mt-5 text-sm text-destructive">{quoteError}</p> : null}
              {quote ? (
                <dl className="mt-6 space-y-0 border-y border-copper/20 text-sm">
                  {[
                    ["Blocks of 100", String(quote.blocks)],
                    ["Before the floor", quote.floored ? "under the minimum" : "already above it"],
                    ["USD estimate", `$${quote.usdEstimate.toFixed(2)} · NEAR $${quote.nearUsd.toFixed(2)}`],
                    ["Inference estimate", quote.withinCap ? "inside the daily cap" : "over the daily cap"],
                  ].map(([dt, dd]) => (
                    <div key={dt} className="flex items-baseline justify-between gap-4 border-b border-copper/10 py-2.5 last:border-0">
                      <dt className="text-muted-foreground">{dt}</dt>
                      <dd className="font-mono text-right text-[0.8rem]">{dd}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  The sample is loaded. A quote appears as soon as the languages differ.
                </p>
              )}

              <div className="mt-6 flex gap-4 border-b border-copper/20 text-[0.68rem] tracking-[0.14em] uppercase">
                <button
                  type="button"
                  className={`pb-2 transition-colors ${payTab === "demo" ? "text-foreground border-b-2 border-copper-deep" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setPayTab("demo")}
                >
                  {sponsoredPay ? "Sponsored testnet pay" : "Local demo pay"}
                </button>
                <button
                  type="button"
                  className={`pb-2 transition-colors ${payTab === "any" ? "text-foreground border-b-2 border-copper-deep" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setPayTab("any")}
                >
                  Pay with any token
                </button>
              </div>

              {payTab === "demo" ? (
                <div className="mt-5 space-y-4">
                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{payCopy}</p>
                  {quote?.policy.paused ? <p className="text-sm text-destructive">LinguaLedger is paused</p> : null}
                  <Button
                    className="h-12 w-full rounded-sm bg-copper-deep text-[0.95rem] tracking-[0.04em] text-cream hover:bg-copper"
                    disabled={!quote || paying || !quote.withinCap}
                    onClick={pay}
                  >
                    {paying ? (sponsoredPay ? "Translating and settling…" : "Translating…") : sponsoredPay ? "Pay on testnet" : "Pay the local quote"}
                  </Button>
                  {payError ? <p className="text-sm text-destructive">{payError}</p> : null}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                    NEAR Intents has no testnet. This tab asks 1Click for a dry EXACT_OUTPUT quote into native USDC on NEAR. Nothing is deposited.
                  </p>
                  <label className="block space-y-1.5 text-sm">
                    <span className="text-[0.68rem] tracking-[0.16em] text-muted-foreground uppercase">Pay from</span>
                    <select
                      className="h-10 w-full border-0 border-b border-input bg-transparent px-0 outline-none focus:border-copper-deep"
                      value={origin}
                      onChange={(event) => setOrigin(event.target.value)}
                    >
                      <option value="sol-usdc">Solana USDC</option>
                      <option value="eth-usdc">Ethereum USDC</option>
                      <option value="base-eth">Base ETH</option>
                    </select>
                  </label>
                  <Button variant="outline" className="h-12 w-full rounded-sm" disabled={!quote || drying} onClick={requestDryQuote}>
                    {drying ? "Asking 1Click…" : "Request a dry quote"}
                  </Button>
                  {dryError ? <p className="text-sm text-destructive">{dryError}</p> : null}
                  {dry ? (
                    <div className="space-y-2 border border-dashed border-copper-deep/40 bg-cream p-4 text-sm">
                      <p className="font-medium">{dry.labeled}</p>
                      <p>
                        Send about{" "}
                        <span className="font-mono">
                          {dry.dry.amountInFormatted} {dry.dry.origin.symbol}
                        </span>{" "}
                        to receive <span className="font-mono">{dry.dry.amountOutFormatted} USDC</span> on NEAR.
                      </p>
                      <p className="text-muted-foreground">{dry.dry.note}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        in ${Number(dry.dry.amountInUsd).toFixed(2)} · out ${Number(dry.dry.amountOutUsd).toFixed(2)} · ~
                        {dry.dry.timeEstimate}s · {dry.dry.correlationId.slice(0, 8)}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Evidence />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
        <p className="eyebrow">How the house works</p>
        <div className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {[
            ["01", "Price", "A started block of 100 words, then the on-chain minimum. The agent cannot discount past it."],
            ["02", "Work", workCopy],
            ["03", "Books", "A sponsored guest pays the quote in testnet NEAR. The agent records the hash and settles 70/20/10 on chain. Explorer links are on the receipt. Testnet only."],
          ].map(([step, title, body]) => (
            <div key={step} className="border-t border-copper/30 pt-6">
              <p className="font-mono text-[0.68rem] tracking-[0.18em] text-copper">{step}</p>
              <h2 className="font-display-italic mt-3 text-3xl text-cream">{title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-cream/60">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
