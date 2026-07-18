import OpenAI from "openai";
import { getOpenAiApiKey } from "@/lib/ai/providers/openai";

/**
 * Embedding-Helper (server-only).
 *
 * Nutzt OpenAI `text-embedding-3-small` (1536 Dimensionen) – passt zum
 * `vector(1536)` im Prisma-Schema. Wenn Modell/Dimension geändert wird,
 * MUSS `MemoryEntry.embedding` im Schema angepasst und migriert werden.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

let clientSingleton: OpenAI | null = null;
function getClient(): OpenAI {
  if (!clientSingleton) {
    clientSingleton = new OpenAI({ apiKey: getOpenAiApiKey() });
  }
  return clientSingleton;
}

export async function embed(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("embed(): leerer Text.");
  const res = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `embed(): unerwartete Dimension ${vec?.length ?? 0} (erwartet ${EMBEDDING_DIM}).`,
    );
  }
  return vec;
}

/**
 * Rendert einen JS-Number-Array als Postgres-vector-Literal, z. B.
 * `[0.1, 0.2, ...]`. Für `INSERT ... ::vector` bzw. `WHERE ... <=> $1::vector`.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
