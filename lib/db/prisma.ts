import { PrismaClient } from "@prisma/client";

/**
 * Prisma-Client-Singleton.
 *
 * In Development erzeugt Next.js bei Hot-Reload wiederholt neue Instanzen,
 * was schnell zu "too many connections" führt. Wir cachen den Client
 * daher am globalThis-Objekt.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
