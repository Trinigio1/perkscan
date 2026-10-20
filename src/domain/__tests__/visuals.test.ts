import { benefitIcon, cardArt, greeting } from '../visuals';

describe('benefitIcon', () => {
  it.each([
    ['Uber Cash', 'car'],
    ['Resy dining credit', 'restaurant'],
    ['Digital entertainment credit', 'tv'],
    ['Hotel credit (Fine Hotels + Resorts / The Hotel Collection)', 'bed'],
    ['Annual travel credit', 'airplane'],
    ["Dunkin' credit", 'cafe'],
    ['DoorDash promos', 'fast-food'],
    ['StubHub / viagogo credit', 'ticket'],
    ['Cell phone protection', 'phone-portrait'],
    ['Extended warranty', 'construct'],
    ['Lost / delayed baggage', 'briefcase'],
  ])('%s -> %s', (name, icon) => expect(benefitIcon(name).icon).toBe(icon));

  it('falls back by benefit type', () => {
    expect(benefitIcon('Something new', 'protection').icon).toBe('shield-checkmark');
    expect(benefitIcon('Something new', 'perk').icon).toBe('star');
    expect(benefitIcon('Something new').icon).toBe('pricetag');
  });
});

describe('cardArt', () => {
  it('has art for every launch card and a fallback', () => {
    expect(cardArt('amex_gold').colors.length).toBeGreaterThanOrEqual(2);
    expect(cardArt('unknown_card').colors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 14))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening');
  });
});
