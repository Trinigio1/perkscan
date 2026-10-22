import { buildExport, EXPORT_TABLES, exportFileName } from '../exportData';

describe('buildExport', () => {
  const now = new Date('2026-10-22T10:00:00Z');
  it('includes every table, even empty ones, and never token secrets', () => {
    const out = buildExport({ ingest_tokens: [{ id: 't1', label: 'Gmail', token_hash: 'secret' }], user_cards: [{ id: 'c1' }] }, 'me@example.com', now);
    expect(Object.keys(out.data)).toEqual([...EXPORT_TABLES]);
    expect(out.data.ingest_tokens).toEqual([{ id: 't1', label: 'Gmail' }]);
    expect(out.data.user_cards).toEqual([{ id: 'c1' }]);
    expect(out.data.receipts).toEqual([]);
    expect(out).toMatchObject({ app: 'PerkScan', exported_at: '2026-10-22T10:00:00.000Z', account_email: 'me@example.com' });
  });
  it('names the file by date', () => {
    expect(exportFileName(now)).toBe('perkscan-export-2026-10-22.json');
  });
});
