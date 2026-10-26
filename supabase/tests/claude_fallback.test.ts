import { claudeModelCall, isGrammarTooLarge, type MessagesClient } from '../functions/_shared/inbox/claude.ts';
import { parseEmail } from '../functions/_shared/inbox/parse.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const REPLY = JSON.stringify({
  kind: 'promo', merchant: 'Uber Eats', summary: '$7 off', interest: 'delivery', card: null, receipt: null,
  offers: [{ type: 'promo', currency: 'USD', title: '$7 off', amount: 7, percent_off: null, code: 'EATS7', expires_on: '2099-01-01', min_spend: null, points: null, claim_url: null, details: null, after_cancellation: null }],
});

Deno.test('falls back to plain JSON when the API refuses the schema, and stays there', async () => {
  const calls: { structured: boolean; mentionsSchema: boolean }[] = [];
  const client: MessagesClient = {
    messages: {
      create: async (body) => {
        const structured = !!(body.output_config as { format?: unknown } | undefined)?.format;
        calls.push({ structured, mentionsSchema: String(body.system).includes('JSON schema') });
        if (structured) throw new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools."}}');
        // Plain JSON replies sometimes come fenced.
        return { content: [{ type: 'text', text: '```json\n' + REPLY + '\n```' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as never;
      },
    },
  };
  const call = claudeModelCall('k', () => '2026-10-27', client);
  const first = await parseEmail('email one', call);
  assert(first.ok && first.data.offers[0]?.code === 'EATS7' && first.data.interest === 'delivery', `read with plain JSON: ${JSON.stringify(first)}`);
  const second = await parseEmail('email two', call);
  assert(second.ok, 'second email read too');
  assert(JSON.stringify(calls) === JSON.stringify([
    { structured: true, mentionsSchema: false },
    { structured: false, mentionsSchema: true },
    { structured: false, mentionsSchema: true },
  ]), `structured once, then plain JSON only: ${JSON.stringify(calls)}`);
});

Deno.test('other API errors are not swallowed', async () => {
  const client: MessagesClient = { messages: { create: async () => { throw new Error('529 overloaded'); } } };
  const r = await parseEmail('x', claudeModelCall('k', () => '2026-10-27', client));
  assert(!r.ok && r.retryable && /overloaded/.test(r.error), `left for a retry: ${JSON.stringify(r)}`);
  assert(isGrammarTooLarge(new Error('The compiled grammar is too large')) && !isGrammarTooLarge(new Error('overloaded')), 'detects only the grammar error');
});
