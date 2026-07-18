import type {
  AiProvider,
  RouteDecision,
  RouteInput,
  TaskCategory,
} from "./types";

/**
 * MODEL_MAP — zentrale Zuordnung von Aufgaben-Kategorien zu Provider/Modell.
 *
 * Modelle & Preise ändern sich regelmäßig. Diese Konstante ist der einzige
 * Ort, an dem die Auswahl gepflegt wird. Preise leben separat in
 * /lib/billing/pricing.ts und müssen dort synchron gehalten werden.
 *
 * Konvention "cheap|balanced|strong":
 *   - cheap    → schnell & günstig, für triviale/short-form Anfragen
 *   - balanced → Standardarbeitspferd
 *   - strong   → tiefste Analyse, teuerste Option
 *
 * Anthropic-Aliase mit "-latest" folgen ihrem offiziellen Suffix-Schema.
 * OpenAI-Modelle sind konkrete Snapshots. Beide bitte periodisch
 * gegen die offiziellen Docs abgleichen.
 */
export const MODEL_MAP = {
  anthropic: {
    cheap: "claude-3-5-haiku-latest",
    balanced: "claude-3-5-sonnet-latest",
    strong: "claude-opus-4-latest",
  },
  openai: {
    cheap: "gpt-4o-mini",
    balanced: "gpt-4o",
    strong: "gpt-4o",
    image: "gpt-image-1",
  },
} as const;

// --- Heuristik-Regeln ------------------------------------------------------

const IMAGE_TRIGGERS = [
  /\berstelle?\s+(mir\s+)?ein(en)?\s+bild(es)?\b/i,
  /\bgeneriere?\s+(mir\s+)?ein(en)?\s+bild\b/i,
  /\bmale?\s+(mir\s+)?ein(en)?\s+bild\b/i,
  /\bzeichne?\s+(mir\s+)?ein(en)?\s+bild\b/i,
  /\bcreate\s+an?\s+image\b/i,
  /\bgenerate\s+an?\s+image\b/i,
  /\bdraw\s+(me\s+)?an?\s+(image|picture)\b/i,
];

const CODE_KEYWORDS = [
  "bug",
  "debug",
  "debuggen",
  "stack trace",
  "exception",
  "funktion",
  "function",
  "typescript",
  "javascript",
  "python",
  "regex",
  "refactor",
  "compile",
  "kompilier",
  "unit test",
];

const ANALYSIS_KEYWORDS = [
  "vergleiche",
  "vergleich",
  "analysiere",
  "analyse",
  "erkläre ausführlich",
  "detaillierte analyse",
  "bewerte",
  "diskutiere",
  "pro und contra",
  "abwägen",
  "compare",
  "analyze",
  "evaluate",
];

const CODE_BLOCK_RE = /```/;

// --- Helper ----------------------------------------------------------------

function containsAny(text: string, needles: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function looksLikeImageRequest(text: string): boolean {
  return IMAGE_TRIGGERS.some((re) => re.test(text));
}

function isCodeRelated(
  text: string,
  hasCodeBlock: boolean | undefined,
): boolean {
  if (hasCodeBlock) return true;
  if (CODE_BLOCK_RE.test(text)) return true;
  return containsAny(text, CODE_KEYWORDS);
}

function isAnalysisRequest(text: string): boolean {
  return containsAny(text, ANALYSIS_KEYWORDS);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// --- Public API ------------------------------------------------------------

/**
 * Regelbasierte Routing-Entscheidung.
 *
 * Reihenfolge der Regeln (höchste Priorität zuerst):
 *   1. Bildgenerierung  → OpenAI Bildmodell
 *   2. Code-bezogen     → Anthropic strong
 *   3. Analyse/komplex  → Anthropic strong
 *   4. Kurzanfrage      → cheap Modell (Anthropic)
 *   5. Default          → Anthropic balanced
 */
export function route(input: RouteInput): RouteDecision {
  const { message, hasCodeBlock, attachments } = input;

  if (looksLikeImageRequest(message)) {
    return decide(
      "openai",
      MODEL_MAP.openai.image,
      "image",
      "Bildgenerierungs-Anfrage erkannt → OpenAI-Bildmodell.",
    );
  }

  if (isCodeRelated(message, hasCodeBlock)) {
    return decide(
      "anthropic",
      MODEL_MAP.anthropic.strong,
      "code",
      "Code-bezogene Anfrage → starkes Anthropic-Modell.",
    );
  }

  if (isAnalysisRequest(message)) {
    return decide(
      "anthropic",
      MODEL_MAP.anthropic.strong,
      "analysis",
      "Analyse-/Vergleichs-Anfrage → stärkstes Modell für hohe Qualität.",
    );
  }

  const hasAttachments = (attachments?.length ?? 0) > 0;
  if (!hasAttachments && wordCount(message) < 20) {
    return decide(
      "anthropic",
      MODEL_MAP.anthropic.cheap,
      "short",
      "Kurze, einfache Anfrage → schnelles & günstiges Modell.",
    );
  }

  return decide(
    "anthropic",
    MODEL_MAP.anthropic.balanced,
    "default",
    "Standardanfrage → ausgewogenes Modell.",
  );
}

function decide(
  provider: AiProvider,
  model: string,
  category: TaskCategory,
  reason: string,
): RouteDecision {
  return { provider, model, category, reason };
}
