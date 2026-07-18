/**
 * Gemeinsame AI-Typen.
 * Ziel: Provider (Anthropic, OpenAI, ...) sind unter einer einheitlichen
 * Schnittstelle austauschbar.
 */

export type AiProvider = "anthropic" | "openai";

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/** Grobe Aufgabenklassen, die der Router unterscheidet. */
export type TaskCategory = "image" | "code" | "short" | "analysis" | "default";

/** Router-Input. */
export interface RouteInput {
  message: string;
  hasCodeBlock?: boolean;
  attachments?: string[];
}

/** Router-Output. */
export interface RouteDecision {
  provider: AiProvider;
  model: string;
  /** Ein-Satz-Begründung fürs UI ("Warum wurde dieses Modell gewählt"). */
  reason: string;
  /** Interne Kategorie – nützlich für Logging & Analytics. */
  category: TaskCategory;
}

/** Optionen für einen Provider-Call. */
export interface SendMessageOptions {
  /** Maximale Output-Tokens. */
  maxTokens?: number;
  /** Sampling-Temperatur (0..2). */
  temperature?: number;
  /** AbortSignal zum vorzeitigen Abbrechen des Streams. */
  signal?: AbortSignal;
}

/** Ein Streaming-Chunk – vereinheitlicht zwischen Anbietern. */
export type StreamChunk =
  | { type: "delta"; text: string }
  | { type: "done"; inputTokens: number; outputTokens: number };

/** Nicht-streamendes Ergebnis. */
export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Gemeinsames Provider-Interface. */
export interface AiProviderClient {
  readonly provider: AiProvider;
  sendMessage(
    model: string,
    messages: ChatMessage[],
    systemPrompt: string | undefined,
    options?: SendMessageOptions,
  ): AsyncIterable<StreamChunk>;
}

/** Bildgenerierungs-Ergebnis. */
export interface ImageResult {
  /** Data-URL oder http(s)-URL. */
  url: string;
  model: string;
}
