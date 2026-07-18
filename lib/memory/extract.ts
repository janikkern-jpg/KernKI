import { MODEL_MAP } from "@/lib/ai/router";
import { anthropicClient } from "@/lib/ai/providers/anthropic";
import type { ChatMessage, StreamChunk } from "@/lib/ai/types";
import { saveMemory } from "./store";

/**
 * Extrahiert nach einem Gespräch dauerhaft relevante Fakten über den User
 * aus dem Verlauf und legt sie via `saveMemory` ab.
 *
 * Bewusst über das GÜNSTIGE Modell (MODEL_MAP.anthropic.cheap), damit die
 * Extraktion im Hintergrund kaum Kosten verursacht.
 */

const EXTRACT_SYSTEM_PROMPT = `Du bist ein Assistent, der aus Chatverläufen dauerhaft relevante Fakten \
über den Nutzer extrahiert – Präferenzen, Kontext, wiederkehrende Themen, \
persönliche Details, Projekte, technische Setups.

Regeln:
- Nur Aussagen, die auch in Wochen/Monaten noch nützlich sind. Kein Small-Talk.
- Jede Zeile: ein Fakt in einem prägnanten Satz, deutsch, aus Nutzer-Perspektive
  formuliert ("Nutzer arbeitet mit ..." / "Nutzer bevorzugt ...").
- Optionaler Kategorie-Tag in eckigen Klammern am Zeilenanfang, z. B.
  [profil], [technik], [präferenz], [projekt]. Wenn unsicher, weglassen.
- Keine Einleitung, keine Nummerierung, keine Erklärungen.
- Wenn NICHTS Merkenswertes im Verlauf ist, exakt das Wort NONE ausgeben.`;

export interface ExtractOptions {
  /** Maximale Anzahl neu gespeicherter Fakten pro Extraktion. */
  maxFacts?: number;
}

export interface ExtractedFact {
  content: string;
  category: string | null;
}

/**
 * Führt die Extraktion durch und speichert direkt. Liefert die Anzahl neu
 * angelegter Memory-Einträge (Duplikate werden von saveMemory heraus-
 * gefiltert).
 */
export async function extractAndStoreMemories(
  userId: string,
  history: ChatMessage[],
  options: ExtractOptions = {},
): Promise<{ candidates: ExtractedFact[]; savedNew: number }> {
  const facts = await extractFacts(history);
  const limited = facts.slice(0, options.maxFacts ?? 20);

  let savedNew = 0;
  for (const f of limited) {
    try {
      const res = await saveMemory(userId, f.content, f.category);
      if (res.created) savedNew += 1;
    } catch (err) {
      // eine Extraktion darf den ganzen Vorgang nicht abbrechen
      // eslint-disable-next-line no-console
      console.warn("[memory.extract] saveMemory fehlgeschlagen:", err);
    }
  }
  return { candidates: limited, savedNew };
}

async function extractFacts(history: ChatMessage[]): Promise<ExtractedFact[]> {
  if (history.length === 0) return [];

  const transcript = history
    .filter((m) => m.role !== "system")
    .map(
      (m) => `${m.role === "assistant" ? "Assistent" : "Nutzer"}: ${m.content}`,
    )
    .join("\n");

  const userMsg: ChatMessage = {
    role: "user",
    content: `Verlauf:\n\n${transcript}\n\nExtrahiere die Fakten:`,
  };

  const stream = anthropicClient.sendMessage(
    MODEL_MAP.anthropic.cheap,
    [userMsg],
    EXTRACT_SYSTEM_PROMPT,
    { maxTokens: 512, temperature: 0 },
  );

  let text = "";
  for await (const chunk of stream as AsyncIterable<StreamChunk>) {
    if (chunk.type === "delta") text += chunk.text;
  }

  return parseFacts(text);
}

function parseFacts(raw: string): ExtractedFact[] {
  const trimmed = raw.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return [];

  const out: ExtractedFact[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) continue;
    // Optionaler [kategorie]-Prefix
    const match = /^\[([^\]]+)\]\s*(.+)$/.exec(l);
    if (match) {
      out.push({
        content: match[2].trim(),
        category: match[1].trim().toLowerCase(),
      });
    } else {
      out.push({ content: l.replace(/^[-*•]\s+/, ""), category: null });
    }
  }
  return out;
}
