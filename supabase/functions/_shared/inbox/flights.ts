import type { z } from 'zod';
import type { FlightSchema } from './schema.ts';
import type { OpportunityRow } from './opportunities.ts';

// Money a flight disruption can be worth, from the official rules in the catalog (verified on their pages):
//  - US DOT: flights to, from or within the US that are cancelled, or delayed / changed by 3+ hours
//    (domestic) or 6+ hours (international): a cash refund if you don't accept another option.
//  - EU261: flights leaving the EU (or arriving on an EU airline): €250–€600 when you arrive 3+ hours
//    late or for a late cancellation, unless the airline proves extraordinary circumstances.
// PerkScan never files anything: it says what you may be owed, how to ask, and drafts the request.
// Pure, so every rule is tested.

export type Flight = z.infer<typeof FlightSchema>;

/** EU and EEA countries plus Switzerland, where EU261 applies. */
const EU261 = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
]);

export interface RuleText {
  id: string;
  how_to: string;
  url: string;
}

export interface FlightClaim {
  rule: 'us_dot' | 'eu261';
  row: OpportunityRow;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * What a disrupted flight may be owed, if any rule covers it. `ticket` is the price paid, from the booking's
 * receipt, when PerkScan has it: a US refund is that amount; without it the refund has no number.
 */
export function flightClaim(
  f: Flight,
  rules: { usDot?: RuleText | null; eu261?: RuleText | null },
  ticket: { total: number; currency: string } | null,
): FlightClaim | null {
  if (!f.status) return null;
  const name = [f.airline, f.flight_number].filter(Boolean).join(' ') || 'Your flight';
  const when = f.flight_date ? ` on ${f.flight_date}` : '';
  const key = `flight:${slug(f.airline ?? '')}:${slug(f.flight_number ?? '')}:${f.flight_date ?? ''}`;
  const touchesUs = f.from_country === 'US' || f.to_country === 'US';
  const domestic = !!f.from_country && f.from_country === f.to_country;
  const late = (min: number) => f.status === 'cancelled' || (f.delay_minutes ?? 0) >= min;

  // US DOT: a refund, unless you took the rebooking or credit.
  if (rules.usDot && touchesUs && !f.accepted_alternative && late(domestic ? 180 : 360)) {
    const why = f.status === 'cancelled' ? 'was cancelled' : `was ${f.status === 'delayed' ? 'delayed' : 'moved'} ${Math.floor((f.delay_minutes ?? 0) / 60)}+ hours`;
    return {
      rule: 'us_dot',
      row: {
        type: 'refund',
        title: `Refund owed: ${name}${when} ${why}`,
        description: 'US rules: a cancelled or significantly changed flight means a cash refund if you don’t accept another option.',
        merchant: f.airline,
        code: f.booking_ref,
        value_estimate: ticket?.total ?? null,
        currency: ticket?.currency ?? 'USD',
        expires_at: null,
        dedupe_key: key,
        action_steps: [
          { step: rules.usDot.how_to },
          { step: 'Ask the airline for a refund to your original payment method. For card payments it’s due within 7 business days.' },
          { step: 'The official rules', url: rules.usDot.url },
        ],
        interest: 'travel',
        percent_off: null,
        min_spend: null,
        discount_amount: null,
      },
    };
  }

  // EU261: fixed compensation by distance, so "up to €600" without a number we can't know.
  const euFlight = (!!f.from_country && EU261.has(f.from_country)) || (!!f.to_country && EU261.has(f.to_country) && !!f.airline_country && EU261.has(f.airline_country));
  if (rules.eu261 && euFlight && late(180)) {
    return {
      rule: 'eu261',
      row: {
        type: 'refund',
        title: `Up to €600 compensation: ${name}${when} ${f.status === 'cancelled' ? 'was cancelled' : 'arrived 3+ hours late'}`,
        description: 'EU rules: €250–€600 depending on distance, unless the airline proves extraordinary circumstances (like severe weather). For a cancellation, only if you were told less than 14 days before.',
        merchant: f.airline,
        code: f.booking_ref,
        value_estimate: null,
        currency: 'EUR',
        expires_at: null,
        dedupe_key: key,
        action_steps: [
          { step: rules.eu261.how_to },
          { step: 'Ask the airline for EU261 compensation, with your booking code and flight number.' },
          { step: 'The official rules', url: rules.eu261.url },
        ],
        interest: 'travel',
        percent_off: null,
        min_spend: null,
        discount_amount: null,
      },
    };
  }
  return null;
}
