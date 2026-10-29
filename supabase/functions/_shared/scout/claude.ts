import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { MODEL } from '../inbox/claude.ts';
import type { ModelCall } from '../inbox/parse.ts';
import type { z } from 'zod';
import { PERK_SYSTEM_PROMPT, PerkPageSchema } from '../perkscout/extract.ts';
import { FoundPageSchema, SCOUT_SYSTEM_PROMPT } from './extract.ts';

/** Model call for the scout: one page in, the promotions on it out, as schema-valid JSON. */
export const claudeScoutCall = (apiKey: string): ModelCall => pageCall(apiKey, SCOUT_SYSTEM_PROMPT, FoundPageSchema);

/** Model call for the perk scout: a store's rewards page in, its free program out. */
export const claudePerkCall = (apiKey: string): ModelCall => pageCall(apiKey, PERK_SYSTEM_PROMPT, PerkPageSchema);

function pageCall(apiKey: string, system: string, schema: z.ZodType): ModelCall {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
  return async (input) => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system,
      output_config: { effort: 'low', format: zodOutputFormat(schema) },
      messages: [{ role: 'user', content: input }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return { text, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  };
}
