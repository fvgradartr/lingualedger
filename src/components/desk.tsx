"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
      <Card className="bg-card/95">
        <CardHeader>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Desk</p>
          <CardTitle className="font-display text-3xl font-medium tracking-tight">Paste the text. The floor is on chain.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-3" value={source} onChange={(event) => setSource(event.target.value as Lang)}>
                {LANGS.map((lang) => (
                  <option key={lang} value={lang}>{LANG_LABEL[lang]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-3" value={target} onChange={(event) => setTarget(event.target.value as Lang)}>
                {LANGS.map((lang) => (
                  <option key={lang} value={lang}>{LANG_LABEL[lang]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Tone</span>
              <select className="h-10 w-full rounded-lg border border-input bg-background px-3" value={tone} onChange={(event) => setTone(event.target.value as Tone)}>
                {TONES.map((item) => (
                  <option key={item} value={item}>{TONE_LABEL[item]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-text">Source</Label>
            <Textarea
              id="source-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-56 bg-background text-base leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{words} words{quote?.detectedLang ? ` · detected ${quote.detectedLang}` : ""}</span>
              <button type="button" className="underline underline-offset-4" onClick={() => { setText(SAMPLE_TR); setSource("tr"); setTarget("en"); }}>
                Load the Turkish sample
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Glossary</p>
            <div className="flex flex-wrap gap-2">
              {glossary.map((pair, index) => (
                <button
                  key={`${pair.source}-${index}`}
                  type="button"
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs"
                  onClick={() => setGlossary((current) => current.filter((_, item) => item !== index))}
                >
                  {pair.source} → {pair.target} ×
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={draftSource} placeholder="fatura" onChange={(event) => setDraftSource(event.target.value)} aria-label="Glossary source" />
              <input className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={draftTarget} placeholder="invoice" onChange={(event) => setDraftTarget(event.target.value)} aria-label="Glossary target" />
              <Button type="button" variant="outline" className="h-10" onClick={addGlossary}>Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/95 lg:sticky lg:top-4 lg:self-start">
        <CardHeader>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Quote slip</p>
          <CardTitle className="font-display text-5xl font-medium tracking-tight">
            {quote ? `${quote.quoteNear} NEAR` : quoting ? "Pricing" : "0.00 NEAR"}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {quote?.floored ? <Badge>Floored at the minimum</Badge> : null}
            {quote?.policy.paused ? <Badge variant="destructive">Paused</Badge> : <Badge variant="secondary">Open</Badge>}
            <Badge variant="outline">{quote?.policy.source === "chain" ? "Price read on testnet" : "Demo policy"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {quoteError ? <p className="text-sm text-destructive">{quoteError}</p> : null}
          {quote ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Blocks of 100</dt>
              <dd className="text-right font-mono">{quote.blocks}</dd>
              <dt className="text-muted-foreground">Before the floor</dt>
              <dd className="text-right font-mono">{quote.floored ? "under the minimum" : "already above it"}</dd>
              <dt className="text-muted-foreground">USD estimate</dt>
              <dd className="text-right font-mono">${quote.usdEstimate.toFixed(2)} · NEAR ${quote.nearUsd.toFixed(2)}</dd>
              <dt className="text-muted-foreground">Inference estimate</dt>
              <dd className="text-right">{quote.withinCap ? "inside the daily cap" : "over the daily cap"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">The sample is loaded. A quote appears as soon as the languages differ.</p>
          )}

          <Tabs defaultValue="demo">
            <TabsList className="grid h-auto w-full grid-cols-2">
              <TabsTrigger value="demo" className="h-9">{sponsoredPay ? "Sponsored testnet pay" : "Local demo pay"}</TabsTrigger>
              <TabsTrigger value="any" className="h-9">Pay with any token</TabsTrigger>
            </TabsList>
            <TabsContent value="demo" className="space-y-3 pt-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {sponsoredPay
                  ? "A shared guest account pays the quote in real testnet NEAR. You do not need a wallet. Translation uses a free public translator (not NEAR AI, and not a TEE). The 70/20/10 split actually transfers on testnet. This is testnet only — no real money. An hourly guest cap may apply."
                  : "This local path records the translation, QA, sha256 receipt, and the 70/20/10 split on this desk only. It does not move testnet NEAR. The live site, when keys are set, pays and settles on testnet."}
              </p>
              {quote?.policy.paused ? <p className="text-sm text-destructive">LinguaLedger is paused</p> : null}
              <Button className="h-11 w-full" disabled={!quote || paying || !quote.withinCap} onClick={pay}>
                {paying ? (sponsoredPay ? "Translating and settling…" : "Translating…") : sponsoredPay ? "Pay on testnet" : "Pay the local quote"}
              </Button>
              {payError ? <p className="text-sm text-destructive">{payError}</p> : null}
            </TabsContent>
            <TabsContent value="any" className="space-y-3 pt-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                NEAR Intents has no testnet. This tab asks 1Click for a dry EXACT_OUTPUT quote into native USDC on NEAR. Nothing is deposited.
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">Pay from</span>
                <select className="h-10 w-full rounded-lg border border-input bg-background px-3" value={origin} onChange={(event) => setOrigin(event.target.value)}>
                  <option value="sol-usdc">Solana USDC</option>
                  <option value="eth-usdc">Ethereum USDC</option>
                  <option value="base-eth">Base ETH</option>
                </select>
              </label>
              <Button variant="outline" className="h-11 w-full" disabled={!quote || drying} onClick={requestDryQuote}>
                {drying ? "Asking 1Click…" : "Request a dry quote"}
              </Button>
              {dryError ? <p className="text-sm text-destructive">{dryError}</p> : null}
              {dry ? (
                <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-background p-3 text-sm">
                  <p className="font-medium">{dry.labeled}</p>
                  <p>
                    Send about <span className="font-mono">{dry.dry.amountInFormatted} {dry.dry.origin.symbol}</span> to receive{" "}
                    <span className="font-mono">{dry.dry.amountOutFormatted} USDC</span> on NEAR.
                  </p>
                  <p className="text-muted-foreground">{dry.dry.note}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    in ${Number(dry.dry.amountInUsd).toFixed(2)} · out ${Number(dry.dry.amountOutUsd).toFixed(2)} · ~{dry.dry.timeEstimate}s · {dry.dry.correlationId.slice(0, 8)}
                  </p>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-3 lg:col-span-2">
        {[
          ["1", "Price", "A started block of 100 words, then the on-chain minimum. The agent cannot discount past it."],
          ["2", "Work", "A free public translator on the live desk (MyMemory, then MinT, then a public Google endpoint). This is not NEAR AI and not a TEE. A NEAR AI key would switch that path on. QA is local."],
          ["3", "Books", "A sponsored guest pays the quote in testnet NEAR. The agent records the hash and settles 70/20/10 on chain. Explorer links are on the receipt. Testnet only."],
        ].map(([step, title, body]) => (
          <div key={step} className="rounded-xl border border-border bg-card/80 p-4">
            <p className="font-mono text-xs text-primary">0{step}</p>
            <h2 className="font-display mt-1 text-xl">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
