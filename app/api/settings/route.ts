import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tone: z.string().max(200).nullable().optional(),
  addressForm: z.string().max(50).nullable().optional(),
  customInstructions: z.string().max(4000).nullable().optional(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { tone: true, addressForm: true, customInstructions: true },
  });
  return NextResponse.json(
    prefs ?? { tone: null, addressForm: null, customInstructions: null },
  );
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const saved = await prisma.userPreferences.upsert({
    where: { userId },
    create: {
      userId,
      tone: data.tone ?? null,
      addressForm: data.addressForm ?? null,
      customInstructions: data.customInstructions ?? null,
    },
    update: {
      tone: data.tone ?? null,
      addressForm: data.addressForm ?? null,
      customInstructions: data.customInstructions ?? null,
    },
    select: { tone: true, addressForm: true, customInstructions: true },
  });

  return NextResponse.json(saved);
}
