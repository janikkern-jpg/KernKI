import { SignJWT, jwtVerify } from "jose";

/**
 * Session-Cookies via signiertem JWT (HS256).
 * Läuft sowohl im Node- als auch im Edge-Runtime (jose ist Edge-kompatibel),
 * deshalb kann die Middleware es direkt verifizieren.
 */

const ALG = "HS256";
const enc = new TextEncoder();

export const SESSION_COOKIE = "kernki_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

export interface SessionPayload {
  email: string;
}

function key(): Uint8Array {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "APP_SESSION_SECRET fehlt – bitte in .env.local / Netlify-ENV eintragen.",
    );
  }
  return enc.encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: [ALG] });
    if (typeof payload.email !== "string") return null;
    return { email: payload.email };
  } catch {
    return null;
  }
}
