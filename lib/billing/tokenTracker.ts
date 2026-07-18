import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Aktualisiert das UsageMonthly-Aggregat für den aktuellen Monat
 * atomar (Upsert + increment). Wird nach jeder abgerechneten Message
 * aufgerufen.
 */

export interface UsageDelta {
  userId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** ISO-Datum – Default: jetzt. */
  at?: Date;
}

function monthKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export async function recordUsage(delta: UsageDelta): Promise<void> {
  const month = monthKey(delta.at ?? new Date());
  const cost = new Prisma.Decimal(delta.costUsd);

  await prisma.usageMonthly.upsert({
    where: { userId_month: { userId: delta.userId, month } },
    create: {
      userId: delta.userId,
      month,
      totalInputTokens: delta.inputTokens,
      totalOutputTokens: delta.outputTokens,
      totalCostUsd: cost,
    },
    update: {
      totalInputTokens: { increment: delta.inputTokens },
      totalOutputTokens: { increment: delta.outputTokens },
      totalCostUsd: { increment: cost },
    },
  });
}
