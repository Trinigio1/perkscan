import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ModelCall } from './parse.ts';
import { SYSTEM_PROMPT, userMessage } from './prompt.ts';
import { ParsedEmailSchema } from './schema.ts';

/** Cheap and fast; extraction doesn't need a larger model. */
export const MODEL = 'claude-haiku-5-5';

/** Model call backed by the Claude API, returning the raw JSON text for our own validation. */
export function claudeModelCall(apiKey: string, today: () => string = () => new Date().toISOString().slice(0, 10)): ModelCall {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return async (input) => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      // Low effort: this is extraction, not reasoning. Structured output keeps the JSON schema-valid.
      output_config: { effort: 'low', format: zodOutputFormat(ParsedEmailSchema) },
      messages: [{ role: 'user', content: userMessage(input, today()) }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  };
}
