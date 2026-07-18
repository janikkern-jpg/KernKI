import { prisma } from "@/lib/db/prisma";

/**
 * Liefert die aktuelle User-ID.
 *
 * Diese App ist ein rein privates Single-User-Setup ohne Login.
 * Beim ersten Aufruf wird automatisch ein lokaler DEV-User angelegt
 * (Email `dev@localhost`), alle Chats/Projects/Memories hängen an ihm.
 *
 * Wenn du später doch eine echte Anmeldung willst: `middleware.ts`
 * wiederherstellen und diese Funktion durch `requireSession()` aus
 * `lib/auth.ts` ersetzen.
 */

const DEV_USER_EMAIL = "dev@localhost";

let cachedUserId: string | null = null;

export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    create: { email: DEV_USER_EMAIL, passwordHash: "" },
    update: {},
    select: { id: true },
  });
  cachedUserId = user.id;
  return user.id;
}
