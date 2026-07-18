import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Session-Gate für die gesamte App.
 *
 * Öffentlich (kein Cookie nötig):
 *   - /login                 Login-Formular
 *   - /api/login             POST → Cookie setzen
 *   - /api/logout            POST → Cookie löschen
 *   - Statische Assets, PWA-Manifest, Service-Worker, Icons
 *
 * Alle anderen Pfade:
 *   - Ohne / mit ungültigem Cookie → HTML-Requests werden auf /login umgeleitet,
 *     API-Requests bekommen 401 (JSON).
 */

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/login",
  "/api/logout",
  "/manifest.json",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/sw.js",
]);

const PUBLIC_PREFIXES = [
  "/_next/",
  "/icons/",
  "/workbox-",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Alles außer Next-internen Static/Image-Handlern.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
