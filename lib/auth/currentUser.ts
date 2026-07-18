import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Liefert die User-ID des angemeldeten Nutzers (aus dem Session-Cookie).
 * Wenn zur E-Mail noch keine User-Row existiert, wird sie automatisch
 * angelegt – Passwort-Hash bleibt leer (das eigentliche Passwort liegt
 * nur in `APP_USER_PASSWORD_HASH`).
 *
 * Der `middleware.ts`-Gate stellt sicher, dass diese Funktion nie ohne
 * gültige Session aufgerufen werden kann; trotzdem wirft sie defensiv.
 */

interface CachedEntry {
  id: string;
}
const cache = new Map<string, CachedEntry>();

export async function getCurrentUserId(): Promise<string> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) throw new Error("Unauthenticated");

  const session = await verifySessionToken(token);
  if (!session) throw new Error("Unauthenticated");

  const cached = cache.get(session.email);
  if (cached) return cached.id;

  const user = await prisma.user.upsert({
    where: { email: session.email },
    create: { email: session.email, passwordHash: "" },
    update: {},
    select: { id: true },
  });
  cache.set(session.email, { id: user.id });
  return user.id;
}
