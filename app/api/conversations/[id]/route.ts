import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    /** null → aus Projekt entfernen */
    projectId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld erforderlich.",
  });

interface Ctx {
  params: { id: string };
}

/** GET /api/conversations/[id] – Metadaten + Projekt-Info. */
export async function GET(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  const conv = await prisma.conversation.findFirst({
    where: { id: params.id, userId },
    select: {
      id: true,
      title: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
      project: { select: { id: true, name: true, color: true } },
    },
  });
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}

/**
 * PATCH /api/conversations/[id]
 *   - title umbenennen
 *   - projectId setzen (Projekt zuweisen) oder null (aus Projekt entfernen)
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  const id = params.id;

  const owned = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Wenn projectId gesetzt → prüfen ob es dem User gehört
  if (parsed.data.projectId) {
    const proj = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, userId },
      select: { id: true },
    });
    if (!proj) {
      return NextResponse.json({ error: "Project not found" }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.projectId !== undefined)
    data.projectId = parsed.data.projectId;

  const conv = await prisma.conversation.update({
    where: { id },
    data,
    select: {
      id: true,
      title: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ conversation: conv });
}

/**
 * DELETE /api/conversations/[id] – Chat löschen (Messages via Cascade).
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  const id = params.id;

  const owned = await prisma.conversation.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
