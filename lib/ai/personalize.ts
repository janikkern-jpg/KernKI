import { prisma } from "@/lib/db/prisma";
import { retrieveRelevantMemories } from "@/lib/memory/retrieve";
import type { ChatMessage } from "./types";

/**
 * Baut den finalen System-Prompt aus:
 *   1. Basis-Anweisungen (Ton, Sprache)
 *   2. UserPreferences (Tonfall, Anrede, customInstructions)
 *   3. Relevante Memory-Einträge (per Ähnlichkeit zur aktuellen Anfrage)
 *
 * Der Prompt hat ein weiches Token-Budget – Memory-Einträge werden nach
 * Zeichenlänge grob budgetiert (Approx.: 1 Token ≈ 4 Zeichen), damit der
 * System-Prompt nicht unkontrolliert wächst.
 */

export interface BuildSystemPromptInput {
  userId: string;
  /** Der aktuelle Verlauf inkl. neuer User-Message – für die Memory-Query wird
   *  die letzte User-Message verwendet. */
  history: ChatMessage[];
  /** Optional: Conversation, aus der ggf. das Projekt und dessen Instructions
   *  geladen werden. */
  conversationId?: string;
  /** Optional harte Obergrenze für den finalen Prompt (Zeichen). */
  maxChars?: number;
}

const DEFAULT_MAX_CHARS = 4000;

export async function buildSystemPrompt(
  input: BuildSystemPromptInput,
): Promise<string> {
  const { userId, history, conversationId } = input;
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;

  const [prefs, project] = await Promise.all([
    prisma.userPreferences.findUnique({
      where: { userId },
      select: { tone: true, addressForm: true, customInstructions: true },
    }),
    conversationId
      ? prisma.conversation
          .findFirst({
            where: { id: conversationId, userId },
            select: {
              project: { select: { name: true, instructions: true } },
            },
          })
          .then((c) => c?.project ?? null)
      : Promise.resolve(null),
  ]);

  const parts: string[] = [];

  parts.push(
    "Du bist ein persönlicher KI-Assistent. Antworte auf Deutsch, es sei denn, der Nutzer wechselt die Sprache.",
  );

  if (prefs?.addressForm) {
    parts.push(`Anrede: ${prefs.addressForm}.`);
  }
  if (prefs?.tone) {
    parts.push(`Tonfall: ${prefs.tone}.`);
  }
  if (prefs?.customInstructions?.trim()) {
    parts.push(
      `Zusätzliche Nutzer-Instruktionen:\n${prefs.customInstructions.trim()}`,
    );
  }

  if (project?.instructions?.trim()) {
    parts.push(
      `Projekt-Kontext („${project.name}“):\n${project.instructions.trim()}`,
    );
  }

  // Memory-Einträge einbinden – nur die relevantesten, unter Budget.
  const query = lastUserContent(history);
  if (query) {
    try {
      const memories = await retrieveRelevantMemories(userId, query, {
        limit: 8,
        maxDistance: 0.6,
      });
      if (memories.length > 0) {
        const header = "Bekannte Fakten über den Nutzer (Langzeitgedächtnis):";
        const lines: string[] = [header];
        let used =
          parts.join("\n\n").length + header.length + 4; /* separator */
        for (const m of memories) {
          const line = `- ${m.category ? `[${m.category}] ` : ""}${m.content}`;
          if (used + line.length + 1 > maxChars) break;
          lines.push(line);
          used += line.length + 1;
        }
        parts.push(lines.join("\n"));
      }
    } catch (err) {
      // Memory-Fehler dürfen den Chat nicht blockieren.
      // eslint-disable-next-line no-console
      console.warn("[personalize] Memory-Retrieval fehlgeschlagen:", err);
    }
  }

  const full = parts.join("\n\n");
  return full.length > maxChars ? full.slice(0, maxChars) : full;
}

function lastUserContent(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === "user") return history[i].content;
  }
  return "";
}
