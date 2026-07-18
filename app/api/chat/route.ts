import { NextResponse } from "next/server";
import { z } from "zod";
import { MessageRole as DbMessageRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUserId } from "@/lib/auth/currentUser";
import { buildSystemPrompt } from "@/lib/ai/personalize";
import { runChatCompletionStream } from "@/lib/ai/orchestrator";
import type { ChatMessage } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 * Body: { conversationId?: string, message: string }
 *
 * - Legt bei fehlender conversationId eine neue Conversation an.
 * - Persistiert die User-Message.
 * - Baut den System-Prompt (Personalisierung + Memory).
 * - Streamt die Assistant-Antwort als SSE (`text/event-stream`).
 *
 * SSE-Events:
 *   event: meta   → { conversationId, route: { provider, model, reason } }
 *   event: delta  → { text: "..." }
 *   event: done   → { messageId, inputTokens, outputTokens, costUsd, provider, model }
 *   event: error  → { message: "..." }
 */

const BodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  message: z.string().min(1).max(20_000),
});

export async function POST(req: Request) {
  const userId = await getCurrentUserId();

  const json = (await req.json().catch(() => ({}))) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { message } = parsed.data;
  let { conversationId } = parsed.data;

  // 1) Conversation sicherstellen (existiert & gehört dem User)
  if (conversationId) {
    const owned = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }
  } else {
    const conv = await prisma.conversation.create({
      data: { userId, title: deriveTitle(message) },
      select: { id: true },
    });
    conversationId = conv.id;
  }

  // 2) User-Message speichern
  await prisma.message.create({
    data: {
      conversationId,
      role: DbMessageRole.user,
      content: message,
    },
  });

  // 3) Verlauf laden (aufsteigend)
  const dbMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const history: ChatMessage[] = dbMessages.map((m) => ({
    role: m.role === DbMessageRole.assistant ? "assistant" : "user",
    content: m.content,
  }));

  // 4) System-Prompt
  const systemPrompt = await buildSystemPrompt({
    userId,
    history,
    conversationId,
  });

  // 5) SSE-Stream aufbauen
  const encoder = new TextEncoder();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  const capturedConvId = conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("meta", { conversationId: capturedConvId });

        const iter = runChatCompletionStream({
          userId,
          conversationId: capturedConvId,
          history,
          systemPrompt,
          options: { signal: abort.signal },
        });

        for await (const evt of iter) {
          if (evt.type === "route") {
            send("meta", { route: evt.decision });
          } else if (evt.type === "delta") {
            send("delta", { text: evt.text });
          } else if (evt.type === "done") {
            send("done", evt.meta);
          }
        }
      } catch (err) {
        // Fehler *nach* Response-Header können nicht mehr per HTTP-Status
        // transportiert werden – nur noch als SSE-Event.
        const msg =
          err instanceof Error ? err.message : "Unbekannter Fehler im Stream.";
        // eslint-disable-next-line no-console
        console.error("[api/chat] stream error:", err);
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`,
            ),
          );
        } catch {
          /* controller evtl. schon closed */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* noop */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function deriveTitle(msg: string): string {
  const clean = msg.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
