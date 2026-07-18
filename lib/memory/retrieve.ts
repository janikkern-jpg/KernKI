import { prisma } from "@/lib/db/prisma";
import { embed, toVectorLiteral } from "./embeddings";

/**
 * Ruft die zur `query` relevantesten Memory-Einträge eines Users ab.
 *
 * Nutzt pgvector-Cosine-Distance (`<=>`). Ergebnis ist aufsteigend nach
 * Distanz sortiert (kleiner = ähnlicher).
 */

export interface RelevantMemory {
  id: string;
  content: string;
  category: string | null;
  createdAt: Date;
  /** Cosine-Distance in [0..2]. */
  distance: number;
}

export interface RetrieveOptions {
  /** Obergrenze für zurückgegebene Einträge (default 5). */
  limit?: number;
  /**
   * Maximale Cosine-Distance, ab der Einträge ignoriert werden (default 0.6).
   * Sehr distanzierte Treffer wären für den System-Prompt eher schädlich
   * (thematisches Rauschen).
   */
  maxDistance?: number;
}

export async function retrieveRelevantMemories(
  userId: string,
  query: string,
  options: RetrieveOptions = {},
): Promise<RelevantMemory[]> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 5));
  const maxDistance = options.maxDistance ?? 0.6;
  const trimmed = query.trim();
  if (!trimmed) return [];

  const vec = await embed(trimmed);
  const lit = toVectorLiteral(vec);

  const rows = await prisma.$queryRaw<
    {
      id: string;
      content: string;
      category: string | null;
      createdAt: Date;
      distance: number;
    }[]
  >`
    SELECT "id", "content", "category", "createdAt",
           ("embedding" <=> ${lit}::vector) AS "distance"
    FROM "MemoryEntry"
    WHERE "userId" = ${userId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${lit}::vector
    LIMIT ${limit}
  `;

  return rows.filter((r) => r.distance <= maxDistance);
}
