import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchCatalogCard, spottedCards, spottedLabel, type CardSighting } from '../spottedCards';
import type { Card } from '../types';

// The real catalog, so name matching is tested against the cards people actually have.
const seed = JSON.parse(readFileSync(resolve(__dirname, '../../../seed/card_benefits.json'), 'utf8')) as { cards: Card[] };
const catalog: Card[] = seed.cards.map((c, i) => ({ ...c, sort_order: i }));
const match = (product: string, issuer: string) => matchCatalogCard(product, issuer, catalog)?.id ?? null;

let n = 0;
const seen = (s: Partial<CardSighting>): CardSighting => ({ id: `s${++n}`, issuer: 'Chase', product: '', last_four: '', times_seen: 1, last_seen: '2026-10-20T00:00:00Z', ...s });

describe('matchCatalogCard', () => {
  it('finds the card a statement names, however it is written', () => {
    expect(match('Freedom Unlimited', 'Chase')).toBe('chase_freedom_unlimited');
    expect(match('Chase Sapphire Preferred®', 'Chase')).toBe('chase_sapphire_preferred');
    expect(match('Platinum Card', 'American Express')).toBe('amex_platinum');
    expect(match('Gold Card', 'Amex')).toBe('amex_gold');
    expect(match('Delta SkyMiles Gold Card', 'American Express')).toBe('amex_delta_gold');
    expect(match('Venture X', 'Capital One')).toBe('capital_one_venture_x');
    expect(match('Blue Cash Everyday', 'American Express')).toBe('amex_blue_cash_everyday');
    expect(match('Double Cash', 'Citi')).toBe('citi_double_cash');
  });

  it('gives no answer when the name fits several cards equally, or none', () => {
    expect(match('Freedom', 'Chase')).toBeNull(); // Freedom Unlimited or Freedom Flex
    expect(match('Sapphire', 'Chase')).toBeNull();
    expect(match('Freedom Unlimited', 'Citi')).toBeNull(); // wrong issuer
    expect(match('Card', 'Chase')).toBeNull();
  });
});

describe('spottedCards', () => {
  it('groups a card by issuer and last 4, and names it from any email that did', () => {
    const r = spottedCards(
      [seen({ last_four: '4821', times_seen: 3 }), seen({ product: 'Freedom Unlimited', last_four: '4821' }), seen({ issuer: 'American Express', last_four: '1007' })],
      [],
      catalog,
    );
    expect(r.map((s) => [s.issuer, s.lastFour, s.card?.id ?? null, s.timesSeen])).toEqual([
      ['Chase', '4821', 'chase_freedom_unlimited', 4],
      ['American Express', '1007', null, 1],
    ]);
    expect(spottedLabel(r[0]!)).toBe('Chase Freedom Unlimited ·· 4821');
    expect(spottedLabel(r[1]!)).toBe('an American Express card ending 1007');
    expect(r[1]!.candidates.every((c) => c.issuer === 'American Express')).toBe(true);
  });

  it('joins a benefits email without digits to the card it is about', () => {
    const r = spottedCards([seen({ product: 'Freedom Unlimited', last_four: '4821' }), seen({ product: 'Chase Freedom Unlimited' })], [], catalog);
    expect(r).toHaveLength(1);
    expect(r[0]!.sightingIds).toHaveLength(2);
  });

  it('leaves out cards you already added', () => {
    const sightings = [seen({ product: 'Freedom Unlimited', last_four: '4821' }), seen({ issuer: 'American Express', product: 'Gold Card' })];
    expect(spottedCards(sightings, [{ card_id: 'chase_freedom_unlimited', last_four: '4821' }, { card_id: 'amex_gold', last_four: '1111' }], catalog)).toEqual([]);
    // Same digits on another issuer's card doesn't count.
    expect(spottedCards([seen({ last_four: '4821' })], [{ card_id: 'amex_gold', last_four: '4821' }], catalog)).toHaveLength(1);
  });
});
