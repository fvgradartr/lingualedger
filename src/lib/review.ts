import type { GlossaryPair } from "@/lib/types";

export interface Review {
  score: number;
  notes: string[];
}

function numbers(text: string): string[] {
  return (text.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).map((value) => value.replace(",", "."));
}

function urls(text: string): string[] {
  return text.match(/https?:\/\/[^\s)]+/g) ?? [];
}

export function reviewTranslation(source: string, translation: string, glossary: GlossaryPair[]): Review {
  const notes: string[] = [];
  let score = 100;
  const translated = translation.trim();
  if (!translated) {
    return { score: 0, notes: ["The translation is empty."] };
  }

  const missingNumbers = numbers(source).filter((value) => !numbers(translated).includes(value));
  if (missingNumbers.length > 0) {
    score -= Math.min(75, missingNumbers.length * 25);
    notes.push(`Missing numbers: ${missingNumbers.join(", ")}.`);
  } else {
    notes.push("Numbers match.");
  }

  const missingUrls = urls(source).filter((url) => !translated.includes(url));
  if (missingUrls.length > 0) {
    score -= 30;
    notes.push("A URL from the source is missing.");
  }

  const missingTerms = glossary
    .map((pair) => pair.target.trim())
    .filter((term) => term.length > 0 && !translated.toLowerCase().includes(term.toLowerCase()));
  if (missingTerms.length > 0) {
    score -= Math.min(40, missingTerms.length * 20);
    notes.push(`Glossary terms missing: ${missingTerms.join(", ")}.`);
  } else if (glossary.length > 0) {
    notes.push("Glossary terms are present.");
  }

  const ratio = translated.length / Math.max(source.trim().length, 1);
  if (ratio < 0.35 || ratio > 3) {
    score -= 15;
    notes.push("Length is far from the source.");
  }

  const norm = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
  if (norm(source) === norm(translated)) {
    score -= 80;
    notes.push("Translation matches the source text.");
  }

  return { score: Math.max(0, score), notes };
}

export function restoreMissingNumbers(source: string, translation: string): string {
  const missing = numbers(source).filter((value) => !numbers(translation).includes(value));
  if (missing.length === 0) return translation;
  return `${translation}\n\nKept from the source: ${missing.join(", ")}.`;
}

export function ensureGlossary(translation: string, glossary: GlossaryPair[]): string {
  const missing = glossary.filter(
    (pair) => pair.target.trim() && !translation.toLowerCase().includes(pair.target.trim().toLowerCase()),
  );
  if (missing.length === 0) return translation;
  const line = missing.map((pair) => `${pair.source} → ${pair.target}`).join("; ");
  return `${translation}\n\nGlossary: ${line}.`;
}
