import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  instructions: z.string().max(4000).optional().nullable(),
  color: z.string().regex(HEX_COLOR).optional(),
});

/** GET /api/projects – Liste aller Projekte des Users (mit Chat-Anzahl). */
export async function GET() {
  const userId = await getCurrentUserId();
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      instructions: true,
      color: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { conversations: true } },
    },
  });
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      instructions: p.instructions,
      color: p.color,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      conversationCount: p._count.conversations,
    })),
  });
}

/** POST /api/projects – neues Projekt anlegen. */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name: parsed.data.name.trim(),
      instructions: parsed.data.instructions?.trim() || null,
      color: parsed.data.color ?? "#22c55e",
    },
    select: {
      id: true,
      name: true,
      instructions: true,
      color: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
