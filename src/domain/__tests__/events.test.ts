import { eventConfidence, eventWhen, relevantEvents, reminderFor, type LocalEvent } from '../events';

const event = (e: Partial<LocalEvent> & { id: string }): LocalEvent => ({
  title: e.id, summary: 's', category: 'free_day', countries: ['US'], regions: [], issuers: [], card_keywords: [], starts_on: '2026-10-27', ends_on: '2026-10-27',
  url: 'https://x.example', status: 'confirmed', based_on: null, last_verified: '2026-10-23', ...e,
});
const TODAY = '2026-10-23';

describe('relevantEvents', () => {
  const events = [
    event({ id: 'parks', starts_on: '2026-10-27', ends_on: '2026-10-27' }),
    event({ id: 'medicare', category: 'enrollment', starts_on: '2026-10-15', ends_on: '2026-12-07' }),
    event({ id: 'marketplace', category: 'enrollment', starts_on: '2026-11-01', ends_on: '2027-01-15' }),
    event({ id: 'florida_only', regions: ['FL'] }),
    event({ id: 'past', starts_on: '2026-10-01', ends_on: '2026-10-02' }),
    event({ id: 'far', starts_on: '2027-03-01', ends_on: '2027-03-01' }),
    event({ id: 'divali', category: 'bank_promo', countries: ['TT'], issuers: ['Scotiabank Trinidad & Tobago'], card_keywords: ['mastercard'], starts_on: '2026-10-16', ends_on: '2026-10-31', status: 'expected', based_on: 'Ran Oct 16–31, 2025.' }),
  ];

  it('shows what applies where you live: on now first, then by start date', () => {
    expect(relevantEvents(events, { country: 'US', cards: [], today: TODAY }).map((e) => e.id)).toEqual(['medicare', 'parks', 'marketplace']);
  });

  it('only shows state events in that state', () => {
    expect(relevantEvents(events, { country: 'US', region: 'FL', cards: [], today: TODAY }).map((e) => e.id)).toContain('florida_only');
    expect(relevantEvents(events, { country: 'US', region: 'NY', cards: [], today: TODAY }).map((e) => e.id)).not.toContain('florida_only');
  });

  it('only shows bank promotions to holders of that bank’s cards, of the right type', () => {
    const scotia = 'Scotiabank Trinidad & Tobago';
    expect(relevantEvents(events, { country: 'TT', cards: [], today: TODAY })).toEqual([]);
    expect(relevantEvents(events, { country: 'TT', cards: [{ issuer: scotia, product_name: 'Scotiabank No Fee Visa Classic' }], today: TODAY })).toEqual([]);
    expect(relevantEvents(events, { country: 'TT', cards: [{ issuer: scotia, product_name: 'Scotiabank Gold Mastercard (Cash Back)' }], today: TODAY }).map((e) => e.id)).toEqual(['divali']);
  });

  it('shows card-network promotions to anyone holding that kind of card', () => {
    const mc = event({ id: 'mc', category: 'bank_promo', countries: ['TT'], card_keywords: ['mastercard'], starts_on: '2026-10-20', ends_on: '2026-11-20' });
    expect(relevantEvents([mc], { country: 'TT', cards: [{ issuer: 'Republic Bank (Trinidad & Tobago)', product_name: 'Republic Bank Mastercard Gold' }], today: TODAY })).toHaveLength(1);
    expect(relevantEvents([mc], { country: 'TT', cards: [{ issuer: 'Scotiabank Trinidad & Tobago', product_name: 'Scotiabank No Fee Visa Classic' }], today: TODAY })).toHaveLength(0);
  });

  it('shows nothing without a country', () => {
    expect(relevantEvents(events, { country: null, cards: [], today: TODAY })).toEqual([]);
  });
});

describe('eventWhen', () => {
  it.each([
    [{ starts_on: '2026-10-27', ends_on: '2026-10-27' }, 'Oct 27'],
    [{ starts_on: '2026-10-24', ends_on: '2026-10-24' }, 'Tomorrow'],
    [{ starts_on: '2026-10-23', ends_on: '2026-10-23' }, 'Today'],
    [{ starts_on: '2026-10-16', ends_on: '2026-10-26' }, 'Ends in 3 days'],
    [{ starts_on: '2026-10-15', ends_on: '2026-12-07' }, 'Until Dec 7'],
    [{ starts_on: '2026-11-01', ends_on: '2027-01-15' }, 'Nov 1 – Jan 15, 2027'],
  ])('%j → %s', (e, label) => expect(eventWhen(e, TODAY)).toBe(label));
});

describe('confidence and reminders', () => {
  it('marks expected events as worth checking', () => {
    expect(eventConfidence({ status: 'confirmed' })).toBe('confirmed');
    expect(eventConfidence({ status: 'expected' })).toBe('check');
  });

  it('turns an event into a reminder that ends when it does', () => {
    expect(reminderFor(event({ id: 'divali', title: 'Divali cash back', category: 'bank_promo', ends_on: '2026-10-31' }))).toMatchObject({ type: 'promo', title: 'Divali cash back', expiresOn: '2026-10-31' });
    expect(reminderFor(event({ id: 'medicare', category: 'enrollment' })).type).toBe('benefit');
    expect(reminderFor(event({ id: 'x', status: 'expected', based_on: 'Ran last year.' })).unconfirmed).toBe(true);
    expect(reminderFor(event({ id: 'y' })).unconfirmed).toBe(false);
  });
});
