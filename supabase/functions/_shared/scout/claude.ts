import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL } from '../inbox/claude.ts';
import type { ModelCall } from '../inbox/parse.ts';
import { FoundPageSchema, SCOUT_SYSTEM_PROMPT } from './extract.ts';

/** Model call for the scout: one page in, the promotions on it out, as schema-valid JSON. */
export function claudeScoutCall(apiKey: string): ModelCall {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  return async (input) => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SCOUT_SYSTEM_PROMPT,
      output_config: { effort: 'low', format: zodOutputFormat(FoundPageSchema) },
      messages: [{ role: 'user', content: input }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  };
}
