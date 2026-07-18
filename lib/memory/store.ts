import { prisma } from "@/lib/db/prisma";
import { embed, toVectorLiteral } from "./embeddings";

/**
 * Speichert einen Memory-Eintrag.
 *
 * Vor dem Insert prüfen wir per Cosine-Ähnlichkeit, ob bereits ein sehr
 * ähnlicher Eintrag existiert (Schwelle konfigurierbar). Dadurch bleibt
 * die Tabelle frei von Duplikaten.
 *
 * `embedding` wird per Raw-SQL geschrieben, weil Prisma den
 * `Unsupported("vector(1536)")`-Typ nicht direkt setzen kann.
 */

export interface SaveMemoryOptions {
  /**
   * Cosine-Distance-Schwelle für Duplikaterkennung.
   * pgvector `<=>` liefert Cosine-Distance in [0..2].
   * 0.0 = identisch, 1.0 = orthogonal, 2.0 = maximaler Gegensatz.
   * Default 0.08 ≈ ~96 % Ähnlichkeit.
   */
  duplicateThreshold?: number;
}

export interface SavedMemory {
  id: string;
  created: boolean;
}

export async function saveMemory(
  userId: string,
  content: string,
  category: string | null,
  options: SaveMemoryOptions = {},
): Promise<SavedMemory> {
  const threshold = options.duplicateThreshold ?? 0.08;
  const trimmed = content.trim();
  if (!trimmed) throw new Error("saveMemory(): leerer Content.");

  const vec = await embed(trimmed);
  const lit = toVectorLiteral(vec);

  // 1) Duplikat-Check via Cosine-Distance
  const near = await prisma.$queryRaw<{ id: string; distance: number }[]>`
    SELECT "id", ("embedding" <=> ${lit}::vector) AS "distance"
    FROM "MemoryEntry"
    WHERE "userId" = ${userId} AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${lit}::vector
    LIMIT 1
  `;

  if (near[0] && near[0].distance <= threshold) {
    return { id: near[0].id, created: false };
  }

  // 2) Insert – wir erzeugen die id in JS, damit wir sie zurückgeben können.
  //    (Ein CUID-Default wird von Prisma nur bei prisma.create() angewandt.)
  const id = generateCuidLikeId();
  await prisma.$executeRaw`
    INSERT INTO "MemoryEntry" ("id", "userId", "content", "embedding", "category", "createdAt")
    VALUES (${id}, ${userId}, ${trimmed}, ${lit}::vector, ${category}, NOW())
  `;

  return { id, created: true };
}

/**
 * Kleiner ID-Generator im CUID-Stil (kein echter CUID, aber ausreichend
 * kollisionssicher für Single-User).  Läuft in Node ohne extra Dep.
 */
function generateCuidLikeId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 10);
  return `c${t}${r}${r2}`;
}
