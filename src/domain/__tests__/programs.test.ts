import { itemTitle, parseAmount, parseDay, programSections, type Program } from '../programs';

const program = (p: Partial<Program> & { id: string }): Program => ({
  kind: 'loyalty', name: p.id, provider: 'X', countries: [], summary: 's', how_to: 'h', url: 'https://x.example', merchants: [],
  window_days: null, status: 'active', last_verified: '2026-10-22', sort_order: 0, ...p,
});

describe('programSections', () => {
  const programs = [
    program({ id: 'massy', countries: ['TT'], status: 'TODO_VERIFY', sort_order: 1 }),
    program({ id: 'aadvantage', sort_order: 2 }),
    program({ id: 'target', kind: 'price_adjust', countries: ['US'] }),
    program({ id: 'missing_money', kind: 'unclaimed', countries: ['US'] }),
    program({ id: 'cbtt', kind: 'unclaimed', countries: ['TT'] }),
    program({ id: 'libby', kind: 'library' }),
  ];

  it('shows what applies where you live, in a fixed order, verified first', () => {
    expect(programSections(programs, 'TT').map((s) => [s.kind, s.programs.map((p) => p.id)])).toEqual([
      ['unclaimed', ['cbtt']],
      ['loyalty', ['aadvantage', 'massy']],
      ['library', ['libby']],
    ]);
  });

  it('shows everything when the country is unknown', () => {
    expect(programSections(programs, null).flatMap((s) => s.programs)).toHaveLength(6);
    expect(programSections(programs, 'ZZ').flatMap((s) => s.programs)).toHaveLength(6);
  });
});

describe('itemTitle', () => {
  it('puts the points count in front of the program name', () => {
    expect(itemTitle('points', '', 12000, { name: 'Massy Card' })).toBe('12,000 Massy Card');
    expect(itemTitle('points', 'Caribbean Miles', 5000, null)).toBe('5,000 Caribbean Miles');
    expect(itemTitle('points', '', null, { name: 'Hilton Honors' })).toBe('Hilton Honors');
  });

  it('uses your own words for everything else', () => {
    expect(itemTitle('benefit', '  FSA balance ', null, null)).toBe('FSA balance');
  });
});

describe('form parsing', () => {
  it('reads dates that exist', () => {
    expect(parseDay(' 2026-12-31 ')).toBe('2026-12-31');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('31/12/2026')).toBeNull();
  });

  it('reads amounts with symbols and commas', () => {
    expect(parseAmount('TT$1,250.50')).toBe(1250.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNaN();
  });
});
