import type { Lang } from "@/lib/types";

/** Canonical desk sample. 41 words. The quote floors at the on-chain minimum. */
export const SAMPLE_TR =
  "LinguaLedger 12 Kasım 2026'da İstanbul'da üç dilde açılıyor. Küçük ekipler ve yapay zekâ ajanları artık Türkçe, İngilizce ve İspanyolca metinlerini banka faturası beklemeden çevirebilir. 100 kelime 0,02 NEAR; asgari fiyat zincirde kilitli. Her teslimat zincirde görülen bir sha256 makbuzu ile gelir.";

export const SAMPLE_EN =
  "LinguaLedger opens in three languages in Istanbul on 12 November 2026. Small teams and AI agents can now translate Turkish, English, and Spanish texts without waiting for a bank invoice. 100 words cost 0.02 NEAR; the minimum price is locked on chain. Every delivery comes with a sha256 receipt you can check on chain.";

export const SAMPLE_ES =
  "LinguaLedger abre en tres idiomas en Estambul el 12 de noviembre de 2026. Los equipos pequeños y los agentes de IA ya pueden traducir textos en turco, inglés y español sin esperar una factura bancaria. 100 palabras cuestan 0,02 NEAR; el precio mínimo está fijado en la cadena. Cada entrega llega con un recibo sha256 que se puede ver en la cadena.";

const PAIRS: Record<string, string> = {
  "tr>en": SAMPLE_EN,
  "tr>es": SAMPLE_ES,
  "en>tr": SAMPLE_TR,
  "en>es": SAMPLE_ES,
  "es>en": SAMPLE_EN,
  "es>tr": SAMPLE_TR,
};

const CANONICAL: Record<Lang, string> = {
  tr: SAMPLE_TR,
  en: SAMPLE_EN,
  es: SAMPLE_ES,
};

export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function curatedTranslation(text: string, source: Lang, target: Lang): string | null {
  if (source === target) return text.trim();
  const normalized = normalizeText(text);
  if (normalized !== normalizeText(CANONICAL[source])) return null;
  return PAIRS[`${source}>${target}`] ?? null;
}
