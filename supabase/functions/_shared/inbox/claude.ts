import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { ModelCall } from './parse.ts';
import { SYSTEM_PROMPT, userMessage } from './prompt.ts';
import { ModelOutputSchema } from './schema.ts';

/** Cheap and fast; extraction doesn't need a larger model. */
export const MODEL = 'claude-haiku-5-5';

/** The part of the client we use, so tests can fake it. */
export interface MessagesClient {
  messages: { create: (body: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message> };
}

/** The API can refuse a structured-output schema whose compiled grammar is too large. */
export const isGrammarTooLarge = (e: unknown) => /grammar is too large|simplify your (tool )?schemas?/i.test(e instanceof Error ? e.message : String(e));

/** The JSON shape, spelled out for the model when structured output isn't available. */
const JSON_INSTRUCTIONS = `\n\nReply with only one JSON object (no code fences, no other text) that matches this JSON schema exactly. Use null for anything not stated:\n${JSON.stringify(z.toJSONSchema(ModelOutputSchema, { io: 'input' }))}`;

/**
 * Model call backed by the Claude API, returning the raw JSON text for our own validation.
 * Structured output first, which keeps the JSON schema-valid. If the API refuses the schema
 * ("compiled grammar is too large"), the same request is sent asking for plain JSON instead —
 * every reply is validated against the schema anyway — and later calls skip structured output.
 */
export function claudeModelCall(
  apiKey: string,
  today: () => string = () => new Date().toISOString().slice(0, 10),
  client: MessagesClient = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }),
): ModelCall {
  let structured = true;
  return async (input) => {
    const base = { model: MODEL, max_tokens: 8000, messages: [{ role: 'user' as const, content: userMessage(input, today()) }] };
    let res: Anthropic.Message;
    try {
      res = structured
        ? // Low effort: this is extraction, not reasoning.
          await client.messages.create({ ...base, system: SYSTEM_PROMPT, output_config: { effort: 'low', format: zodOutputFormat(ModelOutputSchema) } })
        : await client.messages.create({ ...base, system: SYSTEM_PROMPT + JSON_INSTRUCTIONS, output_config: { effort: 'low' } });
    } catch (e) {
      if (!structured || !isGrammarTooLarge(e)) throw e;
      structured = false;
      res = await client.messages.create({ ...base, system: SYSTEM_PROMPT + JSON_INSTRUCTIONS, output_config: { effort: 'low' } });
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  };
}
