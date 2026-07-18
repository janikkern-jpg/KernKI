import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/login
 * Body: { email, password }
 *
 * Vergleicht gegen `APP_USER_EMAIL` + `APP_USER_PASSWORD_HASH`
 * aus der Server-ENV. Bei Erfolg wird ein signiertes JWT-Cookie
 * gesetzt (HttpOnly, Secure in Prod).
 */
export async function POST(req: Request) {
  const APP_USER_EMAIL = process.env.APP_USER_EMAIL?.trim().toLowerCase();
  const APP_USER_PASSWORD_HASH = process.env.APP_USER_PASSWORD_HASH;

  if (!APP_USER_EMAIL || !APP_USER_PASSWORD_HASH) {
    return NextResponse.json(
      {
        error:
          "Server nicht konfiguriert (APP_USER_EMAIL / APP_USER_PASSWORD_HASH fehlen).",
      },
      { status: 500 },
    );
  }

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  }

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const emailOk = emailNorm === APP_USER_EMAIL;
  const passwordOk = verifyPassword(
    parsed.data.password,
    APP_USER_PASSWORD_HASH,
  );

  if (!emailOk || !passwordOk) {
    // Kleines Delay gegen Brute-Force.
    await new Promise((r) => setTimeout(r, 500));
    return NextResponse.json(
      { error: "E-Mail oder Passwort falsch." },
      { status: 401 },
    );
  }

  const token = await createSessionToken({ email: APP_USER_EMAIL });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return NextResponse.json({ ok: true });
}
