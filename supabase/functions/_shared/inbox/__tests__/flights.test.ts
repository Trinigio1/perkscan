import { flightClaim, type Flight } from '../flights.ts';

const rules = {
  usDot: { id: 'us_dot_flight_refunds', how_to: 'Decline the rebooking or credit if you want the money back.', url: 'https://www.transportation.gov/individuals/aviation-consumer-protection/refunds' },
  eu261: { id: 'eu261', how_to: 'Claim from the airline first.', url: 'https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm' },
};
const flight = (f: Partial<Flight>): Flight => ({
  status: 'cancelled', delay_minutes: null, airline: 'Caribbean Airlines', airline_country: 'TT', flight_number: 'BW 484', flight_date: '2026-11-03',
  from_country: 'US', to_country: 'TT', booking_ref: 'XKQ7PL', accepted_alternative: null, ...f,
});

describe('flightClaim', () => {
  it('a cancelled US flight: a cash refund of the ticket price', () => {
    const c = flightClaim(flight({}), rules, { total: 669.23, currency: 'USD' })!;
    expect(c.rule).toBe('us_dot');
    expect(c.row).toMatchObject({ type: 'refund', value_estimate: 669.23, currency: 'USD', code: 'XKQ7PL', dedupe_key: 'flight:caribbeanairlines:bw484:2026-11-03' });
    expect(c.row.title).toBe('Refund owed: Caribbean Airlines BW 484 on 2026-11-03 was cancelled');
  });
  it('without the receipt, the refund has no number', () => {
    expect(flightClaim(flight({}), rules, null)!.row.value_estimate).toBeNull();
  });
  it('delays need 3+ hours on domestic US flights and 6+ hours on international ones', () => {
    const domestic = (min: number) => flightClaim(flight({ status: 'delayed', delay_minutes: min, to_country: 'US' }), rules, null);
    expect(domestic(170)).toBeNull();
    expect(domestic(190)?.rule).toBe('us_dot');
    const intl = (min: number) => flightClaim(flight({ status: 'schedule_change', delay_minutes: min }), rules, null);
    expect(intl(300)).toBeNull();
    expect(intl(400)!.row.title).toMatch(/was moved 6\+ hours/);
  });
  it('no US refund if you already took the rebooking or credit', () => {
    expect(flightClaim(flight({ accepted_alternative: true }), rules, null)).toBeNull();
  });
  it('EU flights: up to €600, never a made-up number', () => {
    const c = flightClaim(flight({ from_country: 'ES', to_country: 'GB', airline: 'Iberia', airline_country: 'ES', status: 'delayed', delay_minutes: 200 }), rules, null)!;
    expect(c.rule).toBe('eu261');
    expect(c.row).toMatchObject({ value_estimate: null, currency: 'EUR' });
    expect(c.row.title).toMatch(/^Up to €600 compensation/);
    // Into the EU on a non-EU airline: not covered.
    expect(flightClaim(flight({ from_country: 'TT', to_country: 'GB', airline_country: 'TT' }), { eu261: rules.eu261 }, null)).toBeNull();
  });
  it('nothing for flights the rules don’t cover', () => {
    expect(flightClaim(flight({ from_country: 'TT', to_country: 'JM' }), rules, null)).toBeNull();
    expect(flightClaim(flight({ status: null }), rules, null)).toBeNull();
  });
});
