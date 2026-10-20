import { normalizeParsed, ParsedEmailSchema, type ParsedEmail } from './schema.ts';

/** The model call, injected so tests (and the local harness) can use a fake. */
export type ModelCall = (input: string) => Promise<{
  text: string | null;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type ParseResult =
  | { ok: true; data: ParsedEmail; attempts: number; usage: Usage }
  | { ok: false; error: string; retryable: boolean; attempts: number; usage: Usage };

/** Claude Haiku 5.5 list prices (prompts up to 100K tokens), USD per million tokens. */
export const PRICE_PER_MTOK = { input: 0.1, output: 0.5 } as const;

export function costUsd(u: Usage): number {
  return (u.inputTokens * PRICE_PER_MTOK.input + u.outputTokens * PRICE_PER_MTOK.output) / 1_000_000;
}

function validate(text: string | null): { ok: true; data: ParsedEmail } | { ok: false; error: string } {
  if (!text) return { ok: false, error: 'Empty response' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Response was not valid JSON' };
  }
  const r = ParsedEmailSchema.safeParse(json);
  if (!r.success) return { ok: false, error: `Response didn't match the schema: ${r.error.issues[0]?.path.join('.') ?? ''} ${r.error.issues[0]?.message ?? ''}`.trim() };
  return { ok: true, data: normalizeParsed(r.data) };
}

/**
 * Calls the model, validates the JSON with Zod, and retries once on invalid
 * output. Refusals and API errors are not retried here.
 */
export async function parseEmail(input: string, call: ModelCall): Promise<ParseResult> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Awaited<ReturnType<ModelCall>>;
    try {
      res = await call(input);
    } catch (e) {
      // Network/API errors: leave for a later retry rather than burning the second attempt now.
      return { ok: false, error: `Model request failed: ${e instanceof Error ? e.message : String(e)}`, retryable: true, attempts: attempt, usage };
    }
    usage.inputTokens += res.inputTokens;
    usage.outputTokens += res.outputTokens;
    if (res.stopReason === 'refusal') {
      return { ok: false, error: 'The model declined to process this email', retryable: false, attempts: attempt, usage };
    }
    const v = validate(res.text);
    if (v.ok) return { ok: true, data: v.data, attempts: attempt, usage };
    lastError = res.stopReason === 'max_tokens' ? 'Response was cut off' : v.error;
  }
  return { ok: false, error: lastError, retryable: false, attempts: 2, usage };
}
