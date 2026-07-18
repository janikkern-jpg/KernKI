import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const PatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    instructions: z.string().max(4000).nullable().optional(),
    color: z.string().regex(HEX_COLOR).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld erforderlich.",
  });

interface Ctx {
  params: { id: string };
}

/** PATCH /api/projects/[id] – Name / Instructions / Farbe ändern. */
export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  const id = params.id;

  const owned = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.instructions !== undefined) {
    data.instructions = parsed.data.instructions?.trim() || null;
  }
  if (parsed.data.color !== undefined) data.color = parsed.data.color;

  const project = await prisma.project.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      instructions: true,
      color: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({ project });
}

/**
 * DELETE /api/projects/[id] – Projekt löschen.
 * Conversations bleiben erhalten (FK ON DELETE SET NULL).
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await getCurrentUserId();
  const id = params.id;

  const owned = await prisma.project.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
