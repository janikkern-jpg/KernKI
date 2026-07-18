import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

/**
 * GET /api/conversations/[id]/messages
 * Lädt den Chat-Verlauf zum Wiederherstellen im UI.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();

  const owned = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      provider: true,
      modelUsed: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ messages });
}
