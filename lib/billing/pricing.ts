/**
 * Preisberechnung
 *
 * Preistabelle pro Modell in USD **pro 1.000.000 Tokens**.
 * ⚠️  Preise ändern sich regelmäßig. Diese Tabelle ist die einzige Quelle
 *     der Wahrheit für die Kostenberechnung – bitte periodisch mit den
 *     offiziellen Preisseiten abgleichen:
 *       - Anthropic: https://www.anthropic.com/pricing
 *       - OpenAI:    https://openai.com/api/pricing/
 *
 * Für Modelle mit "-latest"-Alias tragen wir den Alias ein. Wenn ein neuer
 * Snapshot released wird, greift automatisch der neue Preis, sobald das
 * Modell tatsächlich einen anderen Namen bekommt.
 */

export interface Pricing {
  provider: "anthropic" | "openai";
  /** USD pro 1M Input-Tokens. */
  inputPer1M: number;
  /** USD pro 1M Output-Tokens. */
  outputPer1M: number;
  /** USD pro generiertem Bild (falls Bildmodell). */
  perImageUsd?: number;
}

export const PRICING: Record<string, Pricing> = {
  // --- Anthropic ---
  "claude-3-5-haiku-latest": {
    provider: "anthropic",
    inputPer1M: 0.8,
    outputPer1M: 4.0,
  },
  "claude-3-5-sonnet-latest": {
    provider: "anthropic",
    inputPer1M: 3.0,
    outputPer1M: 15.0,
  },
  "claude-opus-4-latest": {
    provider: "anthropic",
    inputPer1M: 15.0,
    outputPer1M: 75.0,
  },

  // --- OpenAI (Chat) ---
  "gpt-4o-mini": {
    provider: "openai",
    inputPer1M: 0.15,
    outputPer1M: 0.6,
  },
  "gpt-4o": {
    provider: "openai",
    inputPer1M: 2.5,
    outputPer1M: 10.0,
  },

  // --- OpenAI (Embeddings) ---
  "text-embedding-3-small": {
    provider: "openai",
    inputPer1M: 0.02,
    outputPer1M: 0,
  },

  // --- OpenAI (Bilder) ---
  // Preise für gpt-image-1 sind größenabhängig; hier grober Fixpreis
  // für 1024x1024 "medium". Bei anderen Größen manuell nachrechnen.
  "gpt-image-1": {
    provider: "openai",
    inputPer1M: 0,
    outputPer1M: 0,
    perImageUsd: 0.042,
  },
};

/**
 * Kostenberechnung in USD. Unbekannte Modelle → 0 (aber Warnung im Log),
 * damit die Anwendung nicht abstürzt, sondern nur die Statistik unpräziser
 * wird.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  if (!p) {
    // eslint-disable-next-line no-console
    console.warn(`[pricing] Kein Preis für Modell "${model}" hinterlegt.`);
    return 0;
  }
  const input = (inputTokens / 1_000_000) * p.inputPer1M;
  const output = (outputTokens / 1_000_000) * p.outputPer1M;
  return round6(input + output);
}

export function calculateImageCost(model: string, count = 1): number {
  const p = PRICING[model];
  if (!p?.perImageUsd) return 0;
  return round6(p.perImageUsd * count);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
