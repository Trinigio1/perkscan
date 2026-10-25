import { canonicalIssuer, cardSighting, issuerFromDomain } from '../cards.ts';
import type { ParsedEmail } from '../schema.ts';

const email = (p: Partial<ParsedEmail>): ParsedEmail => ({ kind: 'other', merchant: null, summary: '', receipt: null, offers: [], ...p });
const alert = (lastFour: string | null): ParsedEmail['receipt'] => ({
  total: 12, currency: 'USD', purchase_type: 'other', travel_date: null, purchase_date: '2026-10-20', card_last_four: lastFour,
  order_number: null, return_by: null, return_window_days: null, items: [], alert_status: 'approved',
});

describe('issuers', () => {
  it('knows issuers by their email domains, including subdomains', () => {
    expect(issuerFromDomain('alerts.chase.com')).toBe('Chase');
    expect(issuerFromDomain('welcome.americanexpress.com')).toBe('American Express');
    expect(issuerFromDomain('aexp.com')).toBe('American Express');
    expect(issuerFromDomain('notification.capitalone.com')).toBe('Capital One');
    expect(issuerFromDomain('target.com')).toBeNull();
    expect(issuerFromDomain('notchase.com')).toBeNull();
  });

  it('writes issuer names one way', () => {
    expect(canonicalIssuer('AMEX')).toBe('American Express');
    expect(canonicalIssuer('JPMorgan Chase Bank, N.A.')).toBe('Chase');
    expect(canonicalIssuer('Citibank')).toBe('Citi');
    expect(canonicalIssuer('Navy Federal')).toBe('Navy Federal');
  });
});

describe('cardSighting', () => {
  it('takes the card a statement names', () => {
    const p = email({ card: { issuer: 'Chase', product: 'Freedom Unlimited', last_four: '1234' } });
    expect(cardSighting(p, 'chase.com')).toEqual({ issuer: 'Chase', product: 'Freedom Unlimited', last_four: '1234' });
  });

  it('gets the issuer of a bank alert from its domain', () => {
    expect(cardSighting(email({ kind: 'card_alert', receipt: alert('9876') }), 'alerts.chase.com')).toEqual({ issuer: 'Chase', product: '', last_four: '9876' });
  });

  it('ignores a store email mentioning "your card ending 1234", and anything without a name or digits', () => {
    expect(cardSighting(email({ kind: 'receipt', receipt: alert('1234') }), 'target.com')).toBeNull();
    expect(cardSighting(email({ kind: 'card_alert', receipt: alert('1234') }), 'target.com')).toBeNull();
    expect(cardSighting(email({ card: { issuer: 'Chase', product: null, last_four: null } }), 'chase.com')).toBeNull();
    expect(cardSighting(email({}), 'chase.com')).toBeNull();
  });
});
