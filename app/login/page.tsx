"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextUrl = search.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Cookie ist gesetzt – hart neuladen, damit die App die neue Session sieht.
      window.location.href = nextUrl;
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-white/10 bg-neutral-900 p-6 shadow-xl"
      >
        <div className="mb-6">
          <div className="text-lg font-semibold">KernKI</div>
          <div className="text-xs text-neutral-500">Anmelden</div>
        </div>

        <label className="mb-1 block text-xs text-neutral-400" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-white/10 bg-neutral-800 px-3 py-2 outline-none focus:border-white/20"
        />

        <label
          className="mb-1 block text-xs text-neutral-400"
          htmlFor="password"
        >
          Passwort
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-white/10 bg-neutral-800 px-3 py-2 outline-none focus:border-white/20"
        />

        {error && (
          <div className="mb-4 rounded border border-red-800 bg-red-950/60 p-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
        >
          {loading ? "…" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
