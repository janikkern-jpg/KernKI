import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/conversations – Liste aller Chats des Users (für Sidebar). */
export async function GET() {
  const userId = await getCurrentUserId();
  const conversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ conversations });
}
