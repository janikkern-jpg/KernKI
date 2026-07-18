"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate as globalMutate } from "swr";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

/**
 * Chat-Fenster mit Streaming, Markdown-Rendering und Code-Highlighting.
 *
 * Verwendet die SSE-API unter /api/chat. Parser ist bewusst schlank
 * (keine EventSource, weil POST nötig ist – wir lesen den ReadableStream
 * direkt).
 */

type Role = "user" | "assistant";

interface UIMessage {
  id: string;
  role: Role;
  content: string;
  routeReason?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
}

interface SseParsed {
  event: string;
  data: unknown;
}

export function Chat() {
  const router = useRouter();
  const search = useSearchParams();
  const urlConvId = search.get("c");

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    urlConvId,
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // History laden, wenn sich die URL-Conversation ändert.
  useEffect(() => {
    setConversationId(urlConvId);
    setError(null);
    if (!urlConvId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingHistory(true);
    fetch(`/api/conversations/${urlConvId}/messages`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as {
          messages: Array<{
            id: string;
            role: "user" | "assistant";
            content: string;
            provider: string | null;
            modelUsed: string | null;
          }>;
        };
      })
      .then((d) => {
        if (cancelled) return;
        setMessages(
          d.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            provider: m.provider ?? undefined,
            model: m.modelUsed ?? undefined,
          })),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlConvId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const submit = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    setSending(true);

    const userMsg: UIMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: UIMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((m) => [...m, userMsg, assistantMsg]);
    setInput("");

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE-Frames sind durch \n\n getrennt.
        let sep = buffer.indexOf("\n\n");
        while (sep !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf("\n\n");
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          handleEvent(
            parsed,
            assistantId,
            setMessages,
            (id) => {
              setConversationId(id);
              // Wenn wir gerade einen neuen Chat gestartet haben,
              // die URL auf ?c=<id> aktualisieren, ohne Rerender/Scroll.
              if (id && id !== urlConvId) {
                router.replace(`/?c=${id}`, { scroll: false });
              }
            },
            setError,
          );
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setSending(false);
      abortRef.current = null;
      // Sidebar-Liste + Verbrauchsanzeige aktualisieren.
      void globalMutate("/api/conversations");
      void globalMutate("/api/usage/monthly");
    }
  }, [conversationId, input, router, sending, urlConvId]);

  const stop = () => abortRef.current?.abort();

  return (
    <section className="flex h-screen flex-1 flex-col bg-neutral-950 text-neutral-100">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {loadingHistory && (
            <div className="mt-8 text-center text-xs text-neutral-500">
              Verlauf wird geladen…
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="mt-20 text-center text-neutral-500">
              Beginne ein Gespräch.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {error && (
            <div className="rounded border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
              Fehler: {error}
            </div>
          )}
        </div>
      </div>

      <form
        className="border-t border-white/5 bg-neutral-950 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={2}
            placeholder="Nachricht … (Shift+Enter für neue Zeile)"
            className="flex-1 resize-none rounded-lg border border-white/10 bg-neutral-900 p-3 text-sm outline-none focus:border-white/20"
            disabled={sending}
          />
          {sending ? (
            <button
              type="button"
              onClick={stop}
              className="h-11 rounded-lg bg-red-600 px-4 text-sm font-medium hover:bg-red-500"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
            >
              Senden
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

// --- Message-Rendering ----------------------------------------------------

function MessageBubble({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-white/10 bg-neutral-900 text-neutral-100"
        }`}
      >
        <div className="prose prose-sm prose-invert max-w-none prose-pre:border prose-pre:border-white/10 prose-pre:bg-neutral-950">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {msg.content || (isUser ? "" : "…")}
          </ReactMarkdown>
        </div>
        {!isUser && (msg.provider || msg.routeReason) && (
          <div className="mt-2 border-t border-white/10 pt-2 text-[11px] text-neutral-500">
            {msg.provider} · {msg.model}
            {typeof msg.costUsd === "number" && (
              <> · ${msg.costUsd.toFixed(6)}</>
            )}
            {msg.routeReason && <> · {msg.routeReason}</>}
          </div>
        )}
      </div>
    </div>
  );
}

// --- SSE-Handling ---------------------------------------------------------

function parseSseFrame(frame: string): SseParsed | null {
  const lines = frame.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

type MessagesSetter = React.Dispatch<React.SetStateAction<UIMessage[]>>;
type ConvSetter = (id: string | null) => void;
type ErrSetter = React.Dispatch<React.SetStateAction<string | null>>;

function handleEvent(
  evt: SseParsed,
  assistantId: string,
  setMessages: MessagesSetter,
  setConversationId: ConvSetter,
  setError: ErrSetter,
) {
  switch (evt.event) {
    case "meta": {
      const d = evt.data as {
        conversationId?: string;
        route?: {
          reason?: string;
          provider?: string;
          model?: string;
        };
      };
      if (d.conversationId) setConversationId(d.conversationId);
      if (d.route) {
        setMessages((ms) =>
          ms.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  routeReason: d.route?.reason,
                  provider: d.route?.provider,
                  model: d.route?.model,
                }
              : m,
          ),
        );
      }
      break;
    }
    case "delta": {
      const d = evt.data as { text?: string };
      if (typeof d.text !== "string") return;
      setMessages((ms) =>
        ms.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + d.text } : m,
        ),
      );
      break;
    }
    case "done": {
      const d = evt.data as {
        provider?: string;
        model?: string;
        costUsd?: number;
      };
      setMessages((ms) =>
        ms.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                provider: d.provider ?? m.provider,
                model: d.model ?? m.model,
                costUsd: d.costUsd,
              }
            : m,
        ),
      );
      break;
    }
    case "error": {
      const d = evt.data as { message?: string };
      setError(d.message ?? "Unbekannter Streaming-Fehler.");
      break;
    }
    default:
      break;
  }
}
