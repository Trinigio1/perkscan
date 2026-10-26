import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { setHomeCurrency, shortCardName } from '@/domain/format';
import { domainStoreKey, storeKey, type Deal, type DealFeedback, type StorePair, type StoreStat } from '@/domain/deals';
import { relevantEvents, type LocalEvent } from '@/domain/events';
import type { Program } from '@/domain/programs';
import { domainsWithParents } from '@/domain/suggestions';
import { singleFlight } from '@/domain/singleFlight';
import type { CardSighting } from '@/domain/spottedCards';
import type { BenefitUsage, Card, CardBenefit, Opportunity, Profile, Receipt, Recovered, StudentOffer, University, UserCard, UserPerk } from '@/domain/types';
import { useAuth } from './auth';
import { deviceTimeZone } from './cards';
import { friendlyDbError } from './dbErrors';
import { syncReminders } from './notifications';
import { SCHOOL_COLUMNS } from './schools';
import { supabase } from './supabase';

export interface AppData {
  profile: Profile | null;
  cards: Card[];
  benefits: CardBenefit[];
  userCards: UserCard[];
  opportunities: Opportunity[];
  recovered: Recovered[];
  usage: BenefitUsage[];
  /** Matched and unmatched receipts from the last 180 days, newest first. */
  receipts: Receipt[];
  studentOffers: StudentOffer[];
  /** Ids of student offers the user marked as claimed. */
  studentClaims: string[];
  /** The user's school, if they picked one. */
  school: University | null;
  /** Perks the user added from their school. */
  myPerks: UserPerk[];
  /** The "hidden money" catalog: loyalty, unclaimed money, price adjustments, refunds, libraries. */
  programs: Program[];
  /** Domains that emailed the user in the last year (only the domain is ever stored). */
  senderDomains: string[];
  /** Schools whose email domains appear among those senders, for "Studying at …?". */
  schoolHints: University[];
  /** Upcoming and current events from the "Coming up near you" catalog (not yet filtered to the user). */
  events: LocalEvent[];
  /** Deals available in the user's country (ranking happens in the app). */
  deals: Deal[];
  /** What the user saved, hid or reported. */
  dealFeedback: DealFeedback[];
  /** Cards the user's email shows they hold (not hidden with "Not mine"). */
  cardSightings: CardSighting[];
  /** What the reader saw in each email lately, for memberships the user hasn't added. Never the email text. */
  memberEmails: { membership: string | null; summary: string | null; date: string }[];
  /** How many official pages PerkScan checks for the user's country, and when it last did. */
  scout: { sources: number; lastChecked: string | null };
  /** "People like you": how many people (5+, opted in) use the stores you use, and what else they use. */
  storeStats: StoreStat[];
  storePairs: StorePair[];
}

export interface RefreshResult {
  data: AppData | null;
  error: string | null;
}

interface DataState {
  data: AppData;
  loading: boolean;
  error: string | null;
  /** Reloads everything. Always reflects writes made before the call. */
  refresh: () => Promise<RefreshResult>;
}

const empty: AppData = { profile: null, cards: [], benefits: [], userCards: [], opportunities: [], recovered: [], usage: [], receipts: [], studentOffers: [], studentClaims: [], school: null, myPerks: [], programs: [], senderDomains: [], schoolHints: [], events: [], deals: [], dealFeedback: [], cardSightings: [], memberEmails: [], scout: { sources: 0, lastChecked: null }, storeStats: [], storePairs: [] };
const DataContext = createContext<DataState>({ data: empty, loading: true, error: null, refresh: async () => ({ data: null, error: null }) });

function must<T>(what: string, res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(friendlyDbError(what, res.error));
  return res.data as T;
}

async function load(userId: string): Promise<AppData> {
  // Keep the profile's time zone in step with the phone so periods reset at local midnight.
  // No-op when unchanged; ignored if Postgres doesn't recognise the zone.
  const tz = deviceTimeZone();
  await supabase.from('profiles').update({ timezone: tz }).eq('id', userId).neq('timezone', tz);

  // Creates/expires card-credit rows for today before reading them.
  const sync = await supabase.rpc('sync_my_card_credits');
  if (sync.error) throw new Error(friendlyDbError('sync_my_card_credits', sync.error));
  // Matches receipts against known settlements. Not essential: never block loading on it.
  await supabase.rpc('sync_my_settlements').then(({ error }) => error && console.warn('sync_my_settlements', error.message));

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const [profile, cards, benefits, userCards, opportunities, recovered, usage, receipts, studentOffers, studentClaims, myPerks, programs, senders, events, dealFeedback, cardSightings] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single(),
    supabase.from('cards').select('*').order('sort_order'),
    supabase.from('card_benefits').select('*').order('sort_order'),
    supabase.from('user_cards').select('*').order('created_at'),
    supabase.from('opportunities').select('*, inbound_messages(from_domain)').or(`status.eq.open,expires_at.gte.${yearStart}`).order('expires_at', { ascending: true }),
    supabase.from('recovered').select('id, opportunity_id, amount, currency, recovered_at'),
    supabase.from('benefit_usage').select('id, user_card_id, benefit_id, period_start, amount_used, is_used, marked_by'),
    supabase
      .from('receipts')
      .select('id, merchant, total, currency, purchase_date, last_four, purchase_type, matched_user_card_id, kind, pending, travel_date, order_number')
      .or(`purchase_date.gte.${since},purchase_date.is.null`)
      .order('purchase_date', { ascending: false, nullsFirst: false })
      .limit(300),
    supabase.from('student_offers').select('*').order('sort_order'),
    supabase.from('student_offer_claims').select('offer_id'),
    supabase.from('user_perks').select('id, university_id, title, details, url, suggest, created_at').order('created_at'),
    supabase.from('perk_programs').select('id, kind, name, provider, countries, summary, how_to, url, merchants, window_days, status, last_verified, sort_order').order('sort_order'),
    supabase.from('inbound_messages').select('from_domain, summary, membership_seen, received_at').not('from_domain', 'is', null).gte('received_at', yearAgo).limit(1000),
    supabase
      .from('local_events')
      .select('id, title, summary, category, countries, regions, issuers, card_keywords, starts_on, ends_on, url, status, based_on, last_verified')
      .gte('ends_on', today)
      .order('starts_on'),
    supabase.from('deal_feedback').select('deal_id, action'),
    supabase.from('card_sightings').select('id, issuer, product, last_four, times_seen, last_seen').is('dismissed_at', null).order('last_seen', { ascending: false }).limit(50),
  ]);

  // numeric columns arrive as numbers from PostgREST; normalize defensively.
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const prof = must<Profile>('profile', profile);
  // Only the user's own school: there are thousands, and the picker searches them on demand.
  const school = prof.university_id
    ? ((await supabase.from('universities').select(SCHOOL_COLUMNS).eq('id', prof.university_id).maybeSingle()).data as University | null)
    : null;
  // Before the membership column exists (database not updated yet), read the senders without it.
  const sent = (senders.error ? (await supabase.from('inbound_messages').select('from_domain, summary, received_at').not('from_domain', 'is', null).gte('received_at', yearAgo).limit(1000)).data : senders.data) ?? [];
  const sentRows = sent as { from_domain: string; summary: string | null; membership_seen?: string | null; received_at: string }[];
  const senderDomains = [...new Set(sentRows.map((m) => m.from_domain))];
  // A school emailing you hints you study there. Only looked up until a school is picked.
  const parents = domainsWithParents(senderDomains);
  const schoolHints =
    !prof.university_id && parents.length
      ? (((await supabase.from('universities').select(SCHOOL_COLUMNS).overlaps('email_domains', parents).limit(3)).data ?? []) as University[])
      : [];
  // Deals and the pages behind them, for the user's country only.
  const [deals, sources] = prof.country
    ? await Promise.all([
        supabase
          .from('deals')
          .select('id, source, merchant, merchant_keys, title, summary, category, amount, percent_off, currency, code, min_spend, countries, regions, starts_on, ends_on, url, evidence, confidence, seen_by, saves')
          .contains('countries', [prof.country])
          .or(`ends_on.is.null,ends_on.gte.${today}`)
          .limit(500),
        supabase.from('deal_sources').select('last_checked').contains('countries', [prof.country]).eq('active', true),
      ])
    : [{ data: [] }, { data: [] }];
  // Store statistics only for the stores this user deals with (they're counts, never people).
  const myStores = [
    ...new Set([
      ...((receipts.data ?? []) as { merchant: string }[]).map((r) => storeKey(r.merchant)),
      ...senderDomains.map(domainStoreKey),
      ...((opportunities.data ?? []) as { merchant: string | null }[]).map((o) => (o.merchant ? storeKey(o.merchant) : null)),
    ]),
  ].filter((k): k is string => !!k && k.length >= 3).slice(0, 150);
  const [storeStats, storePairs] = prof.country && myStores.length
    ? await Promise.all([
        supabase.from('store_stats').select('store_key, people').eq('country', prof.country).in('store_key', myStores),
        supabase.from('store_pairs').select('store_a, store_b, people').eq('country', prof.country).in('store_a', myStores).limit(1000),
      ])
    : [{ data: [] }, { data: [] }];
  const checked = ((sources.data ?? []) as { last_checked: string | null }[]).map((x) => x.last_checked).filter((x): x is string => !!x).sort();
  setHomeCurrency(prof.home_currency?.trim() || 'USD');
  return {
    profile: prof,
    cards: must('cards', cards).map((c: Card) => ({ ...c, annual_fee: num(c.annual_fee) })),
    benefits: must('card_benefits', benefits).map((b: CardBenefit) => ({ ...b, amount: num(b.amount), max_coverage: num(b.max_coverage) })),
    userCards: must('user_cards', userCards),
    opportunities: must('opportunities', opportunities).map(({ inbound_messages: msg, ...o }: Opportunity & { inbound_messages?: { from_domain: string | null } | null }) => ({
      ...o,
      value_estimate: num(o.value_estimate),
      percent_off: num(o.percent_off),
      min_spend: num(o.min_spend),
      // Where the email came from: the store a code or gift card gets used at.
      sender_domain: msg?.from_domain ?? null,
    })),
    recovered: must('recovered', recovered).map((r: Recovered) => ({ ...r, amount: Number(r.amount) })),
    usage: must('benefit_usage', usage).map((u: BenefitUsage) => ({ ...u, amount_used: num(u.amount_used) })),
    receipts: must('receipts', receipts).map((r: Receipt) => ({ ...r, total: num(r.total) })),
    // Student mode is optional; a missing table (database not updated yet) just means no offers.
    studentOffers: (studentOffers.data ?? []) as StudentOffer[],
    studentClaims: ((studentClaims.data ?? []) as { offer_id: string }[]).map((c) => c.offer_id),
    school,
    // Optional like the rest of Student mode: missing table (database not updated) just means none.
    myPerks: (myPerks.data ?? []) as UserPerk[],
    // Optional too: a database without the catalog yet just means no hidden-money suggestions.
    programs: (programs.data ?? []) as Program[],
    senderDomains,
    schoolHints,
    // Optional: a database without the events table yet just means nothing coming up.
    events: (events.data ?? []) as LocalEvent[],
    // Optional like the rest: a database without deals yet just means none.
    deals: ((deals.data ?? []) as Deal[]).map((d) => ({ ...d, amount: num(d.amount), percent_off: num(d.percent_off), min_spend: num(d.min_spend) })),
    dealFeedback: (dealFeedback.data ?? []) as DealFeedback[],
    // Optional: a database without this table yet just means no spotted cards.
    cardSightings: (cardSightings.data ?? []) as CardSighting[],
    memberEmails: sentRows.map((m) => ({ membership: m.membership_seen ?? null, summary: m.summary, date: m.received_at })),
    scout: { sources: (sources.data ?? []).length, lastChecked: checked[checked.length - 1] ?? null },
    // Optional: a database without these yet just means no "people like you".
    storeStats: (storeStats.data ?? []) as StoreStat[],
    storePairs: (storePairs.data ?? []) as StorePair[],
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<AppData>(empty);
  // Loading until data for the current user (or signed-out state) has been fetched once.
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const loading = loadedFor !== (userId ?? null);
  const [error, setError] = useState<string | null>(null);
  const currentUser = useRef<string | null>(null);
  useEffect(() => {
    currentUser.current = userId ?? null;
  }, [userId]);

  // One loader per signed-in user. Calls during a load queue one more load, so a
  // refresh after a write (e.g. finishing onboarding) never returns stale data.
  const refresh = useMemo(() => {
    const forUser = userId ?? null;
    return singleFlight(async (): Promise<RefreshResult> => {
      try {
        const next = forUser ? await load(forUser) : empty;
        if (currentUser.current !== forUser) return { data: null, error: null }; // user changed while loading
        setData(next);
        setError(null);
        if (forUser) syncReminders(next.opportunities, next.recovered, myEvents(next)).catch(() => {});
        return { data: next, error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (currentUser.current === forUser) setError(message);
        return { data: null, error: message };
      } finally {
        if (currentUser.current === forUser) setLoadedFor(forUser);
      }
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Periods roll over at midnight; refresh whenever the app comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(() => ({ data, loading, error, refresh }), [data, loading, error, refresh]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

/** Lookup helpers used across screens. */
export function useLookups() {
  const { data } = useData();
  return useMemo(() => {
    const cardById = new Map(data.cards.map((c) => [c.id, c]));
    const benefitById = new Map(data.benefits.map((b) => [b.id, b]));
    const userCardById = new Map(data.userCards.map((u) => [u.id, u]));
    const recoveredByOpp = new Map<string, number>();
    for (const r of data.recovered) {
      if (r.opportunity_id) recoveredByOpp.set(r.opportunity_id, (recoveredByOpp.get(r.opportunity_id) ?? 0) + r.amount);
    }
    const userCardLabel = (id: string | null) => {
      const uc = id ? userCardById.get(id) : undefined;
      if (!uc) return '';
      const name = shortCardName(cardById.get(uc.card_id)?.product_name ?? 'Card');
      // Memberships have no card number.
      return uc.nickname || (uc.last_four ? `${name} ·· ${uc.last_four}` : name);
    };
    return { cardById, benefitById, userCardById, recoveredByOpp, userCardLabel };
  }, [data]);
}

/** The events that apply to this user: their country, and promotions for banks whose cards they hold. */
export function myEvents(d: AppData): LocalEvent[] {
  const cards = d.userCards.map((uc) => d.cards.find((c) => c.id === uc.card_id)).filter((c): c is Card => !!c);
  return relevantEvents(d.events, { country: d.profile?.country ?? null, region: d.profile?.region ?? null, cards, today: new Date().toISOString().slice(0, 10) });
}
