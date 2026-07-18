/**
 * Retry-Wrapper mit exponentiellem Backoff für transiente API-Fehler
 * (429/5xx, Netzwerk-Aussetzer). Persistente Fehler (400/401/403/404) werden
 * sofort weitergereicht.
 */

export interface RetryOptions {
  /** Anzahl Wiederholungsversuche zusätzlich zum ersten Versuch. Default: 3. */
  retries?: number;
  /** Basis-Delay in ms. Default: 500. */
  baseDelayMs?: number;
  /** Maximales Delay in ms. Default: 8000. */
  maxDelayMs?: number;
  /** AbortSignal – bricht Wartezeiten & den Loop ab. */
  signal?: AbortSignal;
}

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isTransientError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { status?: number; code?: string; name?: string };
  if (
    typeof anyErr.status === "number" &&
    TRANSIENT_STATUS.has(anyErr.status)
  ) {
    return true;
  }
  const code = anyErr.code ?? anyErr.name;
  if (typeof code === "string") {
    return [
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "APIConnectionError",
    ].includes(code);
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const base = options.baseDelayMs ?? 500;
  const max = options.maxDelayMs ?? 8000;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isTransientError(err)) {
        throw err;
      }
      const delay = Math.min(max, base * 2 ** attempt) + Math.random() * 100;
      await sleep(delay, options.signal);
      attempt += 1;
    }
  }
}
