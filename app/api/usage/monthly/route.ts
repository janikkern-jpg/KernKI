import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/monthly
 *
 * Response:
 *   {
 *     month: "YYYY-MM",
 *     totalInputTokens: number,
 *     totalOutputTokens: number,
 *     totalCostUsd: number,
 *     byProvider: {
 *       anthropic: { inputTokens, outputTokens, costUsd },
 *       openai:    { inputTokens, outputTokens, costUsd }
 *     }
 *   }
 *
 * Der Provider-Split kommt live aus der Message-Tabelle (kleines Aggregat,
 * indexed auf conversationId+createdAt). Wenn das später zu teuer wird, kann
 * dieser Split in eine separate Aggregat-Tabelle wandern.
 */
export async function GET() {
  const userId = await getCurrentUserId();

  const now = new Date();
  const month = monthKey(now);
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [total, perProvider] = await Promise.all([
    prisma.usageMonthly.findUnique({
      where: { userId_month: { userId, month } },
      select: {
        totalInputTokens: true,
        totalOutputTokens: true,
        totalCostUsd: true,
      },
    }),
    prisma.message.groupBy({
      by: ["provider"],
      where: {
        conversation: { userId },
        createdAt: { gte: monthStart, lt: nextMonth },
        provider: { not: null },
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
      },
    }),
  ]);

  const byProvider = {
    anthropic: emptySplit(),
    openai: emptySplit(),
  } as Record<"anthropic" | "openai", ProviderSplit>;

  for (const row of perProvider) {
    const key = row.provider as "anthropic" | "openai" | null;
    if (key !== "anthropic" && key !== "openai") continue;
    byProvider[key] = {
      inputTokens: row._sum.inputTokens ?? 0,
      outputTokens: row._sum.outputTokens ?? 0,
      costUsd: Number(row._sum.costUsd ?? 0),
    };
  }

  return NextResponse.json({
    month,
    totalInputTokens: total?.totalInputTokens ?? 0,
    totalOutputTokens: total?.totalOutputTokens ?? 0,
    totalCostUsd: Number(total?.totalCostUsd ?? 0),
    byProvider,
  });
}

interface ProviderSplit {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function emptySplit(): ProviderSplit {
  return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function monthKey(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}
