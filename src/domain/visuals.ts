// Presentation helpers that don't depend on React: card colors and benefit icons.
// Colors only evoke each card; no issuer logos or trademarks are reproduced.

export interface CardArt {
  /** Gradient stops, top-left to bottom-right. */
  colors: readonly [string, string, ...string[]];
  text: string;
  subtle: string;
}

const ART: Record<string, CardArt> = {
  amex_platinum: { colors: ['#E9ECEF', '#C3C8CE', '#9AA1A9'], text: '#1C2228', subtle: '#4B535C' },
  amex_gold: { colors: ['#F3D58A', '#D4A84A', '#A97A22'], text: '#2B1F07', subtle: '#5C4511' },
  chase_sapphire_reserve: { colors: ['#1B2A4A', '#0F1B33', '#070D1C'], text: '#EAF0FF', subtle: '#9FB0D6' },
  chase_sapphire_preferred: { colors: ['#2F5FB3', '#1F4590', '#14306A'], text: '#F0F5FF', subtle: '#B9CCF2' },
  capital_one_venture_x: { colors: ['#2C3138', '#1A1E23', '#0D0F12'], text: '#F2F4F7', subtle: '#A3ABB5' },
  capital_one_savor: { colors: ['#8C3B2E', '#6B2A20', '#471A13'], text: '#FFF2EE', subtle: '#E3B2A8' },
  citi_strata_premier: { colors: ['#2B4C7E', '#1D3A66', '#10254A'], text: '#EEF4FF', subtle: '#AFC4E6' },
  chase_freedom_unlimited: { colors: ['#4A90D9', '#2F74C0', '#1D5A9E'], text: '#F4F9FF', subtle: '#CFE2F7' },
  discover_it: { colors: ['#F7A35C', '#EE7E2D', '#C95F14'], text: '#2A1406', subtle: '#5E2F0F' },
  apple_card: { colors: ['#FFFFFF', '#F1F2F4', '#DCDFE4'], text: '#16181C', subtle: '#6A707A' },
  scotiabank_tt_visa_classic: { colors: ['#D9343A', '#B0222A', '#7E141B'], text: '#FFF3F3', subtle: '#F2B9BB' },
  scotiabank_tt_aero_platinum_visa: { colors: ['#DADDE1', '#B4B9C0', '#8C939C'], text: '#1C2026', subtle: '#4A5059' },
  scotiabank_tt_gold_mastercard_cashback: { colors: ['#E8C46A', '#C99B3A', '#9A7020'], text: '#2A1E06', subtle: '#5B4512' },
  scotiabank_tt_mastercard: { colors: ['#3A3F47', '#24282E', '#121418'], text: '#F3F4F6', subtle: '#A6ACB4' },
};

const FALLBACK: CardArt = { colors: ['#3A4A42', '#26332C', '#151D19'], text: '#F2FFF7', subtle: '#A9BDB2' };

export function cardArt(cardId: string): CardArt {
  return ART[cardId] ?? FALLBACK;
}

/** Ionicons names used for benefits; kept as a union so the UI layer can type-check them. */
export type BenefitIconName =
  | 'restaurant' | 'car' | 'tv' | 'bed' | 'airplane' | 'bag-handle' | 'ticket' | 'barbell'
  | 'cafe' | 'cart' | 'id-card' | 'shield-checkmark' | 'umbrella' | 'phone-portrait'
  | 'construct' | 'briefcase' | 'star' | 'pricetag' | 'musical-notes' | 'fast-food' | 'refresh';

export type IconTone = 'green' | 'blue' | 'orange' | 'purple' | 'pink' | 'teal' | 'gray';

const RULES: { match: RegExp; icon: BenefitIconName; tone: IconTone }[] = [
  { match: /uber|lyft|rideshare|rental car|auto rental|car rental/i, icon: 'car', tone: 'blue' },
  { match: /dunkin|coffee|starbucks/i, icon: 'cafe', tone: 'orange' },
  { match: /doordash|grubhub|dashpass|uber eats/i, icon: 'fast-food', tone: 'orange' },
  { match: /resy|dining|restaurant|opentable|exclusive tables/i, icon: 'restaurant', tone: 'orange' },
  { match: /apple music|music/i, icon: 'musical-notes', tone: 'pink' },
  { match: /entertainment|streaming|apple tv|disney|hulu|peacock/i, icon: 'tv', tone: 'purple' },
  { match: /stubhub|ticket|event/i, icon: 'ticket', tone: 'pink' },
  { match: /hotel|the edit|resorts|stay/i, icon: 'bed', tone: 'teal' },
  { match: /airline|travel credit|flight|lounge|priority pass|trip|global entry|tsa|clear/i, icon: 'airplane', tone: 'blue' },
  { match: /lululemon|saks|shopping/i, icon: 'bag-handle', tone: 'pink' },
  { match: /walmart|grocery|supermarket/i, icon: 'cart', tone: 'green' },
  { match: /peloton|equinox|fitness/i, icon: 'barbell', tone: 'purple' },
  { match: /cell phone/i, icon: 'phone-portrait', tone: 'teal' },
  { match: /baggage|luggage/i, icon: 'briefcase', tone: 'blue' },
  { match: /warranty/i, icon: 'construct', tone: 'gray' },
  { match: /purchase protection|return protection/i, icon: 'shield-checkmark', tone: 'green' },
  { match: /cancellation|interruption|delay/i, icon: 'umbrella', tone: 'blue' },
  { match: /status|elite|membership/i, icon: 'star', tone: 'orange' },
  { match: /cashback|cash back|daily cash|5%|rotating/i, icon: 'refresh', tone: 'green' },
];

export function benefitIcon(name: string, type?: 'credit' | 'protection' | 'perk'): { icon: BenefitIconName; tone: IconTone } {
  for (const r of RULES) if (r.match.test(name)) return { icon: r.icon, tone: r.tone };
  if (type === 'protection') return { icon: 'shield-checkmark', tone: 'green' };
  if (type === 'perk') return { icon: 'star', tone: 'orange' };
  return { icon: 'pricetag', tone: 'green' };
}

export type OfferIconName = 'ticket' | 'gift' | 'wallet' | 'star' | 'airplane' | 'bed' | 'hourglass' | 'return-down-back' | 'document-text' | 'trending-down' | 'school' | 'shield-checkmark' | 'pricetags' | 'cash' | 'briefcase';

/** Icon for a non-credit opportunity type. */
export function offerIcon(type: string): { icon: OfferIconName; tone: IconTone } {
  switch (type) {
    case 'promo': return { icon: 'ticket', tone: 'orange' };
    case 'gift_card': return { icon: 'gift', tone: 'pink' };
    case 'store_credit': return { icon: 'wallet', tone: 'pink' };
    case 'points': return { icon: 'star', tone: 'purple' };
    case 'free_trial': return { icon: 'hourglass', tone: 'blue' };
    case 'return_window': return { icon: 'return-down-back', tone: 'gray' };
    case 'settlement': return { icon: 'document-text', tone: 'teal' };
    case 'price_drop': return { icon: 'trending-down', tone: 'green' };
    case 'student': return { icon: 'school', tone: 'purple' };
    case 'protection': return { icon: 'shield-checkmark', tone: 'blue' };
    case 'refund': return { icon: 'cash', tone: 'green' };
    case 'benefit': return { icon: 'briefcase', tone: 'purple' };
    case 'travel_credit': return { icon: 'airplane', tone: 'blue' };
    case 'certificate': return { icon: 'bed', tone: 'teal' };
    default: return { icon: 'pricetags', tone: 'green' };
  }
}

export const OFFER_TYPE_LABELS: Record<string, string> = {
  promo: 'Promo code',
  gift_card: 'Gift card',
  store_credit: 'Store credit',
  points: 'Points',
  free_trial: 'Free trial',
  return_window: 'Return window',
  settlement: 'Settlement',
  price_drop: 'Price drop',
  student: 'Student offer',
  protection: 'Protection',
  refund: 'Refund',
  benefit: 'Benefit',
  travel_credit: 'Travel credit',
  certificate: 'Certificate',
};

/** "Good morning" etc. for the home greeting. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
