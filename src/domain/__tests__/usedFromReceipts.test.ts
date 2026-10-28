import { opp } from '../__fixtures__/opportunities';
import { orderPhrase, usedFromReceiptNote, usedQuestions } from '../usedFromReceipts';

const receipts = [
  { id: 'r1', merchant: 'Uber Eats', purchase_date: '2026-10-20' },
  { id: 'r2', merchant: 'Kohl’s', purchase_date: '2026-10-24' },
];

describe('used from receipts', () => {
  it('asks about open items a receipt might have used, newest receipt first', () => {
    const a = opp({ type: 'promo', used_guess_receipt_id: 'r1', used_guess_amount: 6.2 });
    const b = opp({ type: 'store_credit', used_guess_receipt_id: 'r2', used_guess_amount: 4 });
    const answered = opp({ type: 'promo', status: 'claimed', used_guess_receipt_id: 'r1' });
    const gone = opp({ type: 'promo', used_guess_receipt_id: 'missing' });
    expect(usedQuestions([a, b, answered, gone], receipts).map((q) => [q.opp.id, q.receipt.id, q.amount])).toEqual([
      [b.id, 'r2', 4],
      [a.id, 'r1', 6.2],
    ]);
  });

  it('says which order', () => {
    expect(orderPhrase(receipts[0]!)).toBe('on your Oct 20 Uber Eats order');
    expect(orderPhrase({ merchant: 'Target', purchase_date: null })).toBe('on your Target order');
  });

  it('says where a used item was spotted', () => {
    const recovered = [
      { opportunity_id: 'o1', marked_by: 'auto' as const, source_receipt_id: 'r1' },
      { opportunity_id: 'o2', marked_by: 'user' as const, source_receipt_id: 'r2' },
      { opportunity_id: 'o3', marked_by: 'user' as const, source_receipt_id: null },
    ];
    expect(usedFromReceiptNote('o1', recovered, receipts)).toBe('Spotted on your Oct 20 Uber Eats receipt');
    expect(usedFromReceiptNote('o2', recovered, receipts)).toBe('Used on your Oct 24 Kohl’s order');
    expect(usedFromReceiptNote('o3', recovered, receipts)).toBeNull();
  });
});
