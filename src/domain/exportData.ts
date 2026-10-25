// "Export my data": everything PerkScan keeps about the user, as one JSON document.

export const EXPORT_TABLES = [
  'profiles', 'user_cards', 'benefit_usage', 'opportunities', 'recovered', 'receipts', 'inbound_messages',
  'ingest_tokens', 'parse_feedback', 'student_offer_claims', 'user_perks', 'deal_feedback', 'deal_sightings', 'card_sightings', 'perk_feedback',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Columns never exported: secrets and internal bookkeeping. */
const HIDDEN: Partial<Record<ExportTable, string[]>> = { ingest_tokens: ['token_hash'] };

export function buildExport(rows: Partial<Record<ExportTable, Record<string, unknown>[]>>, email: string | null, now: Date) {
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of EXPORT_TABLES) {
    const hidden = HIDDEN[t] ?? [];
    data[t] = (rows[t] ?? []).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !hidden.includes(k))));
  }
  return {
    app: 'PerkScan',
    exported_at: now.toISOString(),
    account_email: email,
    note:
      'Everything PerkScan stores about you. Email and text contents are deleted once read, so only what was extracted is here. ' +
      'Token secrets are never stored in readable form. AI usage records (token counts per message) are internal and deleted with your account.',
    data,
  };
}

export const exportFileName = (now: Date) => `perkscan-export-${now.toISOString().slice(0, 10)}.json`;
