import OpenAI from "openai";
import { withRetry } from "../retry";
import type {
  AiProviderClient,
  ChatMessage,
  ImageResult,
  SendMessageOptions,
  StreamChunk,
} from "../types";

/**
 * OpenAI Provider Client (server-only).
 *
 * API-Key ausschließlich über process.env.OPENAI_API_KEY.
 * Chat-Streaming über die Chat-Completions-API mit `stream: true` und
 * `stream_options.include_usage: true`, damit wir am Ende Token-Zahlen
 * bekommen. Bildgenerierung über `images.generate` (b64_json → data-URL).
 */

export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY ist nicht gesetzt.");
  }
  return key;
}

let clientSingleton: OpenAI | null = null;
function getClient(): OpenAI {
  if (!clientSingleton) {
    clientSingleton = new OpenAI({ apiKey: getOpenAiApiKey() });
  }
  return clientSingleton;
}

function toOpenAiMessages(
  messages: ChatMessage[],
  systemPrompt: string | undefined,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (m.role === "system") {
      out.push({ role: "system", content: m.content });
    } else if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content });
    } else {
      out.push({ role: "user", content: m.content });
    }
  }
  return out;
}

async function* streamOpenAi(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  options: SendMessageOptions = {},
): AsyncIterable<StreamChunk> {
  const client = getClient();

  const stream = await withRetry(
    () =>
      client.chat.completions.create(
        {
          model,
          messages: toOpenAiMessages(messages, systemPrompt),
          max_tokens: options.maxTokens ?? 1024,
          temperature: options.temperature,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: options.signal },
      ),
    { signal: options.signal },
  );

  let inputTokens = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      yield { type: "delta", text: delta };
    }
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0;
      outputTokens = chunk.usage.completion_tokens ?? 0;
    }
  }

  yield { type: "done", inputTokens, outputTokens };
}

export const openaiClient: AiProviderClient = {
  provider: "openai",
  sendMessage(model, messages, systemPrompt, options) {
    return streamOpenAi(model, messages, systemPrompt, options);
  },
};

/**
 * Bildgenerierung. Gibt eine data-URL zurück (base64), damit sie ohne
 * separate Storage-Anbindung direkt im Chat angezeigt werden kann.
 */
export async function generateImage(
  prompt: string,
  options: {
    model?: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    signal?: AbortSignal;
  } = {},
): Promise<ImageResult> {
  const client = getClient();
  const model = options.model ?? "gpt-image-1";

  const res = await withRetry(
    () =>
      client.images.generate(
        {
          model,
          prompt,
          size: options.size ?? "1024x1024",
          n: 1,
        },
        { signal: options.signal },
      ),
    { signal: options.signal },
  );

  const first = res.data?.[0];
  if (!first) {
    throw new Error("OpenAI Bildgenerierung: keine Daten in der Antwort.");
  }
  if (first.b64_json) {
    return { url: `data:image/png;base64,${first.b64_json}`, model };
  }
  if (first.url) {
    return { url: first.url, model };
  }
  throw new Error("OpenAI Bildgenerierung: weder b64_json noch url vorhanden.");
}
