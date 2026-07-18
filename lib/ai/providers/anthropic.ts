import Anthropic from "@anthropic-ai/sdk";
import { withRetry } from "../retry";
import type {
  AiProviderClient,
  ChatMessage,
  SendMessageOptions,
  StreamChunk,
} from "../types";

/**
 * Anthropic Provider Client (server-only).
 *
 * API-Key ausschließlich über process.env.ANTHROPIC_API_KEY.
 * Streaming via `messages.stream()`, Token-Zählung aus dem finalen
 * `Message`-Objekt (usage.input_tokens / usage.output_tokens).
 */

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  }
  return key;
}

let clientSingleton: Anthropic | null = null;
function getClient(): Anthropic {
  if (!clientSingleton) {
    clientSingleton = new Anthropic({ apiKey: getAnthropicApiKey() });
  }
  return clientSingleton;
}

function toAnthropicMessages(
  messages: ChatMessage[],
): Anthropic.Messages.MessageParam[] {
  // System-Prompt wird bei Anthropic separat übergeben, hier filtern.
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
}

async function* streamAnthropic(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  options: SendMessageOptions = {},
): AsyncIterable<StreamChunk> {
  const client = getClient();

  const stream = await withRetry(
    () =>
      Promise.resolve(
        client.messages.stream(
          {
            model,
            system: systemPrompt,
            messages: toAnthropicMessages(messages),
            max_tokens: options.maxTokens ?? 1024,
            temperature: options.temperature,
          },
          { signal: options.signal },
        ),
      ),
    { signal: options.signal },
  );

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield { type: "delta", text: event.delta.text };
    }
  }

  const final = await stream.finalMessage();
  yield {
    type: "done",
    inputTokens: final.usage.input_tokens ?? 0,
    outputTokens: final.usage.output_tokens ?? 0,
  };
}

export const anthropicClient: AiProviderClient = {
  provider: "anthropic",
  sendMessage(model, messages, systemPrompt, options) {
    return streamAnthropic(model, messages, systemPrompt, options);
  },
};
