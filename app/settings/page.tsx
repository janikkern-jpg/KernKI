"use client";

import { useEffect, useState } from "react";

/**
 * Einfache Einstellungsseite: Tonfall, Anrede, freies Feld für
 * Zusatzinstruktionen. Lädt & speichert über /api/settings.
 */

interface Prefs {
  tone: string | null;
  addressForm: string | null;
  customInstructions: string | null;
}

const EMPTY: Prefs = {
  tone: null,
  addressForm: null,
  customInstructions: null,
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) setPrefs((await res.json()) as Prefs);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone: emptyToNull(prefs.tone),
          addressForm: emptyToNull(prefs.addressForm),
          customInstructions: emptyToNull(prefs.customInstructions),
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setMessage("Gespeichert.");
    } catch (e) {
      setMessage(`Fehler: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Einstellungen</h1>

      {loading ? (
        <p className="text-gray-500">Lade …</p>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <Field label="Anrede">
            <select
              value={prefs.addressForm ?? ""}
              onChange={(e) =>
                setPrefs({ ...prefs, addressForm: e.target.value })
              }
              className="w-full rounded border border-gray-700 bg-transparent px-3 py-2"
            >
              <option value="">— keine Präferenz —</option>
              <option value="Du">Du</option>
              <option value="Sie">Sie</option>
            </select>
          </Field>

          <Field label="Tonfall">
            <input
              type="text"
              placeholder="z. B. sachlich, locker, direkt, ausführlich …"
              value={prefs.tone ?? ""}
              onChange={(e) => setPrefs({ ...prefs, tone: e.target.value })}
              className="w-full rounded border border-gray-700 bg-transparent px-3 py-2"
            />
          </Field>

          <Field label="Zusatzinstruktionen">
            <textarea
              rows={8}
              placeholder="Freier Text – wird jedem System-Prompt beigelegt."
              value={prefs.customInstructions ?? ""}
              onChange={(e) =>
                setPrefs({ ...prefs, customInstructions: e.target.value })
              }
              className="w-full rounded border border-gray-700 bg-transparent px-3 py-2 font-mono text-sm"
            />
          </Field>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Speichere …" : "Speichern"}
            </button>
            {message && (
              <span className="text-sm text-gray-400">{message}</span>
            )}
          </div>
        </form>
      )}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-300">
        {label}
      </span>
      {children}
    </label>
  );
}

function emptyToNull(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}
