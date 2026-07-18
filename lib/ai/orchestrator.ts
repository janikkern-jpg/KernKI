import { MessageRole as DbMessageRole, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateCost } from "@/lib/billing/pricing";
import { recordUsage } from "@/lib/billing/tokenTracker";
import { anthropicClient } from "./providers/anthropic";
import { openaiClient } from "./providers/openai";
import { route } from "./router";
import type {
  AiProviderClient,
  ChatMessage,
  RouteDecision,
  SendMessageOptions,
  StreamChunk,
} from "./types";

/**
 * Verbindet Routing, Provider-Aufruf, Kostenberechnung und Persistenz.
 *
 * Es gibt zwei Einstiegspunkte:
 *
 *   1. `runChatCompletion` – nicht-streamend, sammelt Antwort komplett und
 *      liefert Text + Metadaten + Kosten zurück.
 *
 *   2. `runChatCompletionStream` – streamt Delta-Chunks an den Aufrufer
 *      und speichert am Ende Message + Usage in der DB. Wird von der
 *      Chat-Route (SSE) benutzt.
 *
 * `handleChatRequest` ist ein Alias für den Streaming-Pfad, entspricht der
 * Signatur aus dem Bau-Prompt.
 */

export interface HandleChatInput {
  userId: string;
  conversationId: string;
  /** Der komplette bisherige Verlauf inkl. der neuen User-Message am Ende. */
  history: ChatMessage[];
  /** Vorgefertigter System-Prompt (siehe /lib/ai/personalize.ts). */
  systemPrompt?: string;
  /** Optional: erzwungenes Modell/Provider – überspringt den Router. */
  override?: { provider: "anthropic" | "openai"; model: string };
  options?: SendMessageOptions;
}

export interface HandleChatResultMeta {
  messageId: string;
  provider: "anthropic" | "openai";
  model: string;
  routeReason: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function providerFor(name: "anthropic" | "openai"): AiProviderClient {
  return name === "anthropic" ? anthropicClient : openaiClient;
}

function lastUserMessage(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}

function pickRoute(input: HandleChatInput): RouteDecision {
  if (input.override) {
    return {
      provider: input.override.provider,
      model: input.override.model,
      category: "default",
      reason: "Explizit gewähltes Modell (Override).",
    };
  }
  const last = lastUserMessage(input.history);
  return route({ message: last });
}

/**
 * Streaming-Variante. Yields Delta-Chunks; am Ende genau ein `done`-Chunk,
 * ergänzt um `messageId` (persistierte Message in der DB).
 */
export async function* runChatCompletionStream(
  input: HandleChatInput,
): AsyncGenerator<
  | { type: "route"; decision: RouteDecision }
  | { type: "delta"; text: string }
  | { type: "done"; meta: HandleChatResultMeta },
  void,
  void
> {
  const decision = pickRoute(input);
  yield { type: "route", decision };

  const client = providerFor(decision.provider);
  const stream = client.sendMessage(
    decision.model,
    input.history,
    input.systemPrompt,
    input.options,
  );

  let full = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (chunk.type === "delta") {
        full += chunk.text;
        yield { type: "delta", text: chunk.text };
      } else if (chunk.type === "done") {
        inputTokens = chunk.inputTokens;
        outputTokens = chunk.outputTokens;
      }
    }
  } catch (err) {
    // Fehler nach oben durchreichen – die Route wandelt sie in ein
    // SSE-Error-Event um.
    throw err;
  }

  const costUsd = calculateCost(decision.model, inputTokens, outputTokens);

  const saved = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: DbMessageRole.assistant,
      content: full,
      modelUsed: decision.model,
      provider: decision.provider,
      inputTokens,
      outputTokens,
      costUsd: new Prisma.Decimal(costUsd),
    },
    select: { id: true },
  });

  // Conversation-updatedAt aktualisieren (für Sidebar-Sortierung).
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  await recordUsage({
    userId: input.userId,
    inputTokens,
    outputTokens,
    costUsd,
  });

  yield {
    type: "done",
    meta: {
      messageId: saved.id,
      provider: decision.provider,
      model: decision.model,
      routeReason: decision.reason,
      inputTokens,
      outputTokens,
      costUsd,
    },
  };
}

/**
 * Nicht-streamende Convenience-Variante. Nützlich für Tests und interne
 * Aufrufe (z. B. Memory-Extraction) ohne Streaming-Bedarf.
 */
export async function runChatCompletion(input: HandleChatInput): Promise<{
  text: string;
  meta: HandleChatResultMeta;
}> {
  let text = "";
  let meta: HandleChatResultMeta | null = null;
  for await (const evt of runChatCompletionStream(input)) {
    if (evt.type === "delta") text += evt.text;
    else if (evt.type === "done") meta = evt.meta;
  }
  if (!meta) throw new Error("Orchestrator: kein done-Event erhalten.");
  return { text, meta };
}

/** Alias gemäß Bau-Prompt. */
export const handleChatRequest = runChatCompletionStream;
