import { countryByCode, guessCountry, pickerCountries, startCountry } from '../countries';

describe('guessCountry', () => {
  it('maps Trinidad’s time zone to TT', () => {
    expect(guessCountry('America/Port_of_Spain')).toBe('TT');
    expect(countryByCode('TT')?.currency).toBe('TTD');
  });
  it('maps US and Canadian zones', () => {
    expect(guessCountry('America/New_York')).toBe('US');
    expect(guessCountry('America/Toronto')).toBe('CA');
  });
  it('returns null when unsure', () => {
    expect(guessCountry('Asia/Tokyo')).toBeNull();
    expect(guessCountry(null)).toBeNull();
  });
});

describe('US-first pickers', () => {
  it('offers the US to new users', () => {
    expect(pickerCountries(null).map((c) => c.code)).toEqual(['US']);
    expect(startCountry(null)).toBe('US');
  });
  it('keeps a country someone already chose', () => {
    expect(pickerCountries('TT').map((c) => c.code)).toEqual(['TT', 'US']);
    expect(startCountry('TT')).toBe('TT');
  });
});
