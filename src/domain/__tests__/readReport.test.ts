import { opp } from '../__fixtures__/opportunities';
import { readReport } from '../readReport';
import type { InboundMessage } from '../types';

const msg = (m: Partial<InboundMessage> & { id: string }): InboundMessage => ({
  source: 'email', received_at: '2026-10-20T12:00:00Z', parse_status: 'parsed', parse_error: null, kind: 'promo', summary: null, from_domain: 'nike.com', ...m,
});

describe('readReport', () => {
  it('says what each message gave, or why it gave nothing', () => {
    const r = readReport(
      [
        msg({ id: 'm1' }),
        msg({ id: 'm2' }),
        msg({ id: 'm3', kind: 'receipt' }),
        msg({ id: 'm4', kind: 'loyalty' }),
        msg({ id: 'm5', parse_status: 'ignored', kind: null }),
        msg({ id: 'm6', parse_status: 'failed', parse_error: 'Timed out' }),
        msg({ id: 'm7', parse_status: 'pending' }),
      ],
      [
        opp({ source_message_id: 'm1', type: 'promo', title: 'Sitewide sale', percent_off: 20, value_estimate: null }),
        opp({ source_message_id: 'm1', type: 'store_credit', title: '$10 reward', value_estimate: 10, currency: 'USD' }),
        opp({ source_message_id: 'mX', title: 'Other' }),
      ],
    );
    expect(r.lines.map((l) => [l.message.id, l.outcome])).toEqual([
      ['m1', 'found'], ['m2', 'nothing'], ['m3', 'receipt'], ['m4', 'nothing'], ['m5', 'nothing'], ['m6', 'failed'], ['m7', 'waiting'],
    ]);
    expect(r.lines[0]!.detail).toBe('Sitewide sale (20% off) · $10 reward');
    expect(r.lines[1]!.detail).toMatch(/no code, amount or end date/);
    expect(r.lines[3]!.detail).toMatch(/nothing expiring/);
    expect(r.lines[5]!.detail).toBe('Couldn’t read this one');
    expect(r.counts).toEqual({ found: 1, receipt: 1, nothing: 3, failed: 1, waiting: 1 });
    expect(r).toMatchObject({ offers: 2, money: { USD: 10 } });
  });
});

describe('readReport reasons', () => {
  it('uses the reader’s own reason, and explains failures in plain words', () => {
    const r = readReport(
      [
        msg({ id: 'a', read_note: 'Already found in an earlier email' }),
        msg({ id: 'b', parse_status: 'failed', parse_error: 'Model request failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"The compiled grammar is too large, which would cause performance issues."}}' }),
        msg({ id: 'c', read_note: '1 expired before it arrived' }),
      ],
      [opp({ source_message_id: 'c', title: '$7 off' })],
    );
    expect(r.lines.map((l) => l.detail)).toEqual([
      'Already found in an earlier email',
      'PerkScan couldn’t read this one because of a problem on our side (The compiled grammar is too large, which would cause performance issues). Send it again with the Gmail script’s resendUnread.',
      '$7 off (also: 1 expired before it arrived)',
    ]);
  });
});
