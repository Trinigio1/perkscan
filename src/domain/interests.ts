import type { Interest } from './deals';
import type { Opportunity } from './types';

// What a store, deal or offer is about, as interest tags ("fitness", "beauty"), so deals and
// offers can be grouped under the interests people pick. From three things, in order of trust:
// the category it was filed under, the store (a list of well-known stores), then words in its
// title. Pure, so every rule is tested.

const STORES: Record<Exclude<Interest, 'shopping'> | 'shopping', string[]> = {
  fitness: [
    'planet fitness', 'la fitness', 'equinox', 'peloton', 'orangetheory', 'crunch fitness', 'anytime fitness', '24 hour fitness',
    "gold's gym", 'life time', 'lifetime fitness', 'classpass', 'strava', 'fitbit', 'whoop', 'oura', 'gnc', 'vitamin shoppe',
    'myprotein', "dick's sporting goods", 'dicks sporting goods', 'academy sports', 'rei', 'lululemon', 'gymshark', 'fabletics',
    'alo yoga', 'under armour', 'new balance', 'asics', 'hoka', 'brooks running', 'on running', 'nike', 'adidas', 'puma', 'ymca',
    'f45', 'barry', 'soulcycle', 'xponential', 'pure barre', 'club pilates', 'beachbody', 'nordictrack',
  ],
  beauty: [
    'sephora', 'ulta', 'sally beauty', 'bath & body works', 'bath and body works', 'glossier', 'fenty', 'mac cosmetics', 'lush',
    'the body shop', 'ipsy', 'birchbox', "kiehl's", 'clinique', 'estee lauder', 'maybelline', 'olaplex', 'nyx', 'elf cosmetics',
    'e.l.f.', 'charlotte tilbury', 'rare beauty', 'dermstore', 'skin+me', 'credo beauty', 'benefit cosmetics', 'great clips',
    'supercuts', 'european wax center', 'drybar',
  ],
  groceries: [
    'kroger', 'safeway', 'whole foods', "trader joe's", 'aldi', 'publix', 'h-e-b', 'heb', 'wegmans', 'albertsons', 'food lion',
    'giant eagle', 'stop & shop', 'meijer', 'sprouts', 'harris teeter', 'ralphs', 'vons', 'jewel-osco', 'winn-dixie', 'hannaford',
    'costco', "sam's club", "bj's wholesale", 'massy', 'pricesmart', 'hi-lo', 'xtra foods', 'pennywise', 'tru valu',
  ],
  dining: [
    'starbucks', "mcdonald's", 'mcdonalds', 'chipotle', 'panera', 'dunkin', 'subway', 'chick-fil-a', 'taco bell', "wendy's",
    'burger king', "domino's", 'dominos', 'pizza hut', "papa john's", 'kfc', 'popeyes', 'shake shack', 'sweetgreen',
    'olive garden', "applebee's", "chili's", 'tim hortons', 'royal castle', "church's", 'five guys', 'panda express',
    'jersey mike', 'jimmy john', 'wingstop', 'buffalo wild wings', 'cheesecake factory', 'red lobster', 'ihop', "denny's",
    'cracker barrel', 'texas roadhouse', 'outback', 'krispy kreme', 'cava', "raising cane's", "culver's", 'sonic drive',
    "arby's", "carl's jr", 'jack in the box', 'whataburger', 'dutch bros', 'resy', 'opentable', 'tock',
  ],
  delivery: ['uber eats', 'doordash', 'grubhub', 'postmates', 'instacart', 'gopuff', 'caviar', 'shipt', 'seamless', 'menulog'],
  electronics: [
    'best buy', 'apple', 'samsung', 'dell', 'hp', 'lenovo', 'microsoft', 'newegg', 'b&h photo', 'micro center', 'bose', 'sony',
    'google store', 'verizon', 'at&t', 't-mobile', 'digicel', 'flow', 'bmobile', 'courts', 'logitech', 'anker', 'garmin',
    'gamestop',
  ],
  fashion: [
    'nike', 'adidas', 'h&m', 'zara', 'gap', 'old navy', 'uniqlo', 'shein', "macy's", 'macys', 'nordstrom', "kohl's", 'kohls', 'tj maxx',
    'tjmaxx', 'marshalls', 'ross', "levi's", 'american eagle', 'aerie', 'abercrombie', 'hollister', 'foot locker', 'asos',
    'j.crew', 'banana republic', 'express', 'forever 21', 'urban outfitters', 'anthropologie', 'free people', 'skechers',
    'vans', 'converse', 'dsw', 'famous footwear', 'zappos', 'ann taylor', 'loft', 'madewell', 'everlane', 'quince',
    'stitch fix', 'rent the runway', 'coach', 'michael kors', 'kate spade', 'ralph lauren', 'tommy hilfiger', 'calvin klein',
    'victoria', 'torrid', 'lane bryant', 'burlington', 'nordstrom rack', 'saks', 'bloomingdale',
  ],
  home: [
    'home depot', "lowe's", 'lowes', 'ikea', 'wayfair', 'bed bath', 'crate & barrel', 'crate and barrel', 'williams sonoma',
    'pottery barn', 'west elm', 'cb2', 'pier 1', 'at home', 'homegoods', 'overstock', 'ashley', 'rooms to go', 'ace hardware',
    'menards', 'sherwin-williams', 'container store', 'brooklinen', 'casper', 'purple', 'tempur', 'mattress firm', 'dyson',
    'ninja', 'shark', 'kitchenaid', 'le creuset', 'pricesmart', 'courts',
  ],
  travel: [
    'american airlines', 'aadvantage', 'delta air lines', 'delta airlines', 'united airlines', 'southwest', 'jetblue', 'alaska airlines', 'spirit airlines',
    'frontier airlines', 'caribbean airlines', 'interjet', 'air canada', 'british airways', 'virgin atlantic', 'copa',
    'marriott', 'hilton', 'hyatt', 'ihg', 'holiday inn', 'wyndham', 'choice hotels', 'best western', 'radisson', 'airbnb',
    'vrbo', 'expedia', 'booking.com', 'hotels.com', 'kayak', 'priceline', 'hopper', 'orbitz', 'travelocity', 'tripadvisor',
    'hertz', 'avis', 'enterprise', 'national car', 'budget car', 'sixt', 'turo', 'amtrak', 'greyhound', 'carnival',
    'royal caribbean', 'norwegian cruise', 'disney cruise', 'clear', 'tsa precheck', 'priority pass',
  ],
  entertainment: [
    'netflix', 'hulu', 'disney', 'spotify', 'apple music', 'apple tv', 'amc', 'regal', 'cinemark', 'fandango', 'ticketmaster',
    'stubhub', 'live nation', 'seatgeek', 'vivid seats', 'xbox', 'playstation', 'steam', 'nintendo', 'peacock', 'paramount',
    'max', 'hbo', 'youtube', 'sirius', 'pandora', 'tidal', 'crunchyroll', 'audible', 'twitch', 'dave & buster', 'topgolf',
    'six flags', 'cedar fair', 'universal studios', 'caribbean cinemas', 'movietowne', 'imax',
  ],
  fuel: [
    'shell', 'exxon', 'mobil', 'chevron', 'bp', 'speedway', 'wawa', 'sheetz', 'circle k', 'marathon', 'sunoco', 'texaco',
    'citgo', 'valero', 'phillips 66', 'quiktrip', "casey's", 'murphy usa', 'gasbuddy', 'unipet', 'national petroleum',
  ],
  kids: [
    "carter's", "the children's place", "childrens place", 'toys r us', 'lego', 'buy buy baby', 'oshkosh', 'janie and jack',
    'gymboree', 'pottery barn kids', 'primary', 'kiwico', 'melissa & doug', 'fisher-price', 'build-a-bear',
  ],
  pets: ['petco', 'petsmart', 'chewy', 'barkbox', 'bark', 'rover', 'pet supplies plus', 'wag', 'banfield', 'petsense', 'tractor supply'],
  education: [
    'barnes & noble', 'barnes and noble', 'chegg', 'coursera', 'udemy', 'kindle', 'duolingo', 'books-a-million', 'scribd',
    'masterclass', 'skillshare', 'khan academy', 'brilliant', 'babbel', 'rosetta stone', 'grammarly', 'quizlet', 'thriftbooks',
    'half price books', 'bookshop', 'staples', 'office depot', 'officemax',
  ],
  shopping: ['amazon', 'target', 'walmart', 'ebay', 'etsy', 'temu', 'aliexpress', 'wish', 'qvc', 'hsn', 'dollar general', 'dollar tree', 'five below', 'big lots', 'cvs', 'walgreens', 'rite aid'],
};

/** Words in a title or summary that say what it's for. Only clear ones: a wrong tag is worse than none. */
const WORDS: [Interest, RegExp][] = [
  ['fitness', /\b(gym|fitness|workout|yoga|pilates|spin class|protein|supplements?|running shoes?|athletic|sportswear|activewear|trainers|treadmill|dumbbells?|personal train(er|ing)|marathon|5k)\b/i],
  ['beauty', /\b(beauty|makeup|make-up|skincare|skin care|cosmetics?|fragrance|perfume|haircut|salon|spa|manicure|pedicure|lipstick|mascara|serum|moisturi[sz]er|nails?)\b/i],
  ['groceries', /\b(grocer(y|ies)|supermarket|produce|fresh food)\b/i],
  ['dining', /\b(restaurant|dine|dining|dinner|lunch|breakfast|brunch|burger|pizza|coffee|latte|tacos?|sushi|wings|entr[ée]e|appetizer|happy hour)\b/i],
  ['delivery', /\b(food delivery|delivery fee|free delivery on|order in)\b/i],
  ['electronics', /\b(laptop|phone|iphone|android|tablet|ipad|headphones?|earbuds|tv|television|camera|smartwatch|console|computer|monitor|gadget|electronics)\b/i],
  ['fashion', /\b(clothing|clothes|apparel|shoes?|sneakers|boots|dress(es)?|jeans|shirts?|jackets?|handbags?|outfit|wardrobe|fashion|denim)\b/i],
  ['home', /\b(furniture|mattress|bedding|sofa|couch|kitchen|appliances?|d[ée]cor|home improvement|hardware|garden|patio|rugs?)\b/i],
  ['travel', /\b(flights?|airfare|hotel|resort|vacation|cruise|car rental|rental car|airline|miles|getaway|trip|lounge|check-in)\b/i],
  ['entertainment', /\b(movies?|cinema|theat(er|re)|concert|tickets?|streaming|music|gaming|video games?|show|festival|amusement park|bowling)\b/i],
  ['fuel', /\b(gas|fuel|gallon|petrol|gas station|car wash)\b/i],
  ['kids', /\b(kids|children'?s?|toddler|baby|toys?|back to school|school supplies)\b/i],
  ['pets', /\b(pets?|dogs?|cats?|puppy|kitten|vet|veterinar(y|ian)|grooming)\b/i],
  ['education', /\b(books?|textbooks?|courses?|classes|tutoring|learning|e-?books?|audiobooks?|tuition)\b/i],
];

/** "Bath & Body Works" -> ["bath", "and", "body", "works"]; "Kohl's" -> ["kohls"]. */
const words = (s: string) =>
  s.toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ').replace(/\b(ltd|limited|inc|llc|corp|co|company)\b/g, ' ').split(/[^a-z0-9+.]+/).map((w) => w.replace(/\.(com|net|co|tt)$/, '').replace(/^\.+|\.+$/g, '')).filter(Boolean);
const squash = (s: string) => words(s).join('');

// Every store name with its interest, longest first, so "applebees" beats "apple".
const KEYS: { w: string[]; key: string; interest: Interest }[] = Object.entries(STORES)
  .flatMap(([i, names]) => names.map((n) => ({ w: words(n), key: squash(n), interest: i as Interest })))
  .sort((a, b) => b.key.length - a.key.length);

/** Does the store's name appear as whole words in the merchant name? */
function named(merchant: string[], store: string[]): boolean {
  for (let at = 0; at + store.length <= merchant.length; at++) {
    // Short one-word names ("bp", "gap", "rei") only as the first word: "TST* BP" is rare, "Gap Kids" isn't.
    if (at > 0 && store.length === 1 && store[0]!.length < 5) return false;
    if (store.every((w, k) => merchant[at + k] === w)) return true;
  }
  return false;
}

/**
 * The interests a store is known for, e.g. "PLANET FITNESS #1123" -> ["fitness"], "Nike" -> ["fitness",
 * "fashion"]. Whole words only, so "Clearance Outlet" isn't CLEAR and "Applebee's" isn't Apple.
 */
export function storeInterests(merchant: string | null | undefined): Interest[] {
  const m = words(merchant ?? '');
  if (!m.length) return [];
  const joined = m.join('');
  const hit = KEYS.find((k) => k.key === joined || named(m, k.w));
  return hit ? [...new Set(KEYS.filter((k) => k.key === hit.key).map((k) => k.interest))] : [];
}

export interface Taggable {
  merchant?: string | null;
  title?: string | null;
  summary?: string | null;
  /** The interest it was already filed under (a deal's category, an email's interest), if any. */
  category?: string | null;
}

/**
 * Its interest tags, most certain first: the category it was filed under, then what the store is
 * known for, then clear words in its title and summary. "Everything else" only when nothing else fits.
 */
export function interestsFor(x: Taggable): Interest[] {
  const out: Interest[] = [];
  const add = (i: string | null | undefined) => {
    if (i && !out.includes(i as Interest)) out.push(i as Interest);
  };
  add(x.category);
  storeInterests(x.merchant).forEach(add);
  const text = `${x.title ?? ''} ${x.summary ?? ''}`;
  for (const [i, re] of WORDS) if (re.test(text)) add(i);
  const specific = out.filter((i) => i !== 'shopping');
  return specific.length ? specific : out;
}

/** Offers from email that are about things you can go and use: codes, credit, rewards, points. */
const USABLE = new Set<Opportunity['type']>(['promo', 'gift_card', 'store_credit', 'points', 'travel_credit', 'certificate']);

/** An email offer's interests: what the reader saw, else what its store and title say. */
export function offerInterests(o: Pick<Opportunity, 'interest' | 'merchant' | 'title'>): Interest[] {
  const tags = interestsFor({ category: o.interest ?? null, merchant: o.merchant ?? null, title: o.title });
  return tags;
}

/** Open offers from your own email about one interest, soonest to expire first. */
export function emailOffersFor(interest: string, opportunities: Opportunity[], now: Date): Opportunity[] {
  const at = now.toISOString();
  return opportunities
    .filter((o) => o.status === 'open' && USABLE.has(o.type) && (!o.expires_at || o.expires_at >= at) && offerInterests(o).includes(interest as Interest))
    .sort((a, b) => (a.expires_at ?? '9999').localeCompare(b.expires_at ?? '9999'));
}
