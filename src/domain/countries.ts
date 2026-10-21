// Countries PerkScan has cards for (or is likely to soon). "ZZ" = somewhere else.

export interface Country {
  code: string;
  name: string;
  currency: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'TT', name: 'Trinidad & Tobago', currency: 'TTD', flag: '🇹🇹' },
  { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', currency: 'CAD', flag: '🇨🇦' },
  { code: 'JM', name: 'Jamaica', currency: 'JMD', flag: '🇯🇲' },
  { code: 'BB', name: 'Barbados', currency: 'BBD', flag: '🇧🇧' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', flag: '🇬🇧' },
];

export const OTHER_COUNTRY = 'ZZ';

/** Currencies offered when the country isn't listed. */
export const CURRENCIES = ['USD', 'TTD', 'CAD', 'JMD', 'BBD', 'GBP', 'EUR'];

const BY_ZONE: Record<string, string> = {
  'America/Port_of_Spain': 'TT',
  'America/Jamaica': 'JM',
  'America/Barbados': 'BB',
  'Europe/London': 'GB',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/St_Johns': 'CA',
  'America/Regina': 'CA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
};

/** A first guess from the phone's time zone; the user always confirms it. */
export function guessCountry(timeZone: string | null | undefined): string | null {
  return (timeZone && BY_ZONE[timeZone]) || null;
}

export function countryByCode(code: string | null | undefined): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}
