import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { BenefitUsage, Card, CardBenefit, Opportunity, Profile, Recovered, UserCard } from '@/domain/types';
import { useAuth } from './auth';
import { deviceTimeZone } from './cards';
import { syncReminders } from './notifications';
import { supabase } from './supabase';

export interface AppData {
  profile: Profile | null;
  cards: Card[];
  benefits: CardBenefit[];
  userCards: UserCard[];
  opportunities: Opportunity[];
  recovered: Recovered[];
  usage: BenefitUsage[];
}

interface DataState {
  data: AppData;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const empty: AppData = { profile: null, cards: [], benefits: [], userCards: [], opportunities: [], recovered: [], usage: [] };
const DataContext = createContext<DataState>({ data: empty, loading: true, error: null, refresh: async () => {} });

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

async function load(userId: string): Promise<AppData> {
  // Keep the profile's time zone in step with the phone so periods reset at local midnight.
  // No-op when unchanged; ignored if Postgres doesn't recognise the zone.
  const tz = deviceTimeZone();
  await supabase.from('profiles').update({ timezone: tz }).eq('id', userId).neq('timezone', tz);

  // Creates/expires card-credit rows for today before reading them.
  const sync = await supabase.rpc('sync_my_card_credits');
  if (sync.error) throw new Error(sync.error.message);

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const [profile, cards, benefits, userCards, opportunities, recovered, usage] = await Promise.all([
    supabase.from('profiles').select('id, display_name, forwarding_address, is_student, timezone, onboarded_at').eq('id', userId).single(),
    supabase.from('cards').select('*').order('sort_order'),
    supabase.from('card_benefits').select('*').order('sort_order'),
    supabase.from('user_cards').select('*').order('created_at'),
    supabase.from('opportunities').select('*').or(`status.eq.open,expires_at.gte.${yearStart}`).order('expires_at', { ascending: true }),
    supabase.from('recovered').select('id, opportunity_id, amount, recovered_at'),
    supabase.from('benefit_usage').select('id, user_card_id, benefit_id, period_start, amount_used, is_used, marked_by'),
  ]);

  // numeric columns arrive as numbers from PostgREST; normalize defensively.
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    profile: must(profile),
    cards: must(cards).map((c: Card) => ({ ...c, annual_fee: num(c.annual_fee) })),
    benefits: must(benefits).map((b: CardBenefit) => ({ ...b, amount: num(b.amount), max_coverage: num(b.max_coverage) })),
    userCards: must(userCards),
    opportunities: must(opportunities).map((o: Opportunity) => ({ ...o, value_estimate: num(o.value_estimate) })),
    recovered: must(recovered).map((r: Recovered) => ({ ...r, amount: Number(r.amount) })),
    usage: must(usage).map((u: BenefitUsage) => ({ ...u, amount_used: num(u.amount_used) })),
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
  const inflight = useRef<{ userId: string | null; promise: Promise<void>; token: object } | null>(null);
  const currentUser = useRef<string | null>(null);
  useEffect(() => {
    currentUser.current = userId ?? null;
  }, [userId]);

  const refresh = useCallback(async () => {
    const forUser = userId ?? null;
    if (inflight.current?.userId === forUser) return inflight.current.promise;
    const token = {};
    const promise = (async () => {
      try {
        const next = forUser ? await load(forUser) : empty;
        if (currentUser.current !== forUser) return; // user changed while loading
        setData(next);
        setError(null);
        if (forUser) syncReminders(next.opportunities, next.recovered).catch(() => {});
      } catch (e) {
        if (currentUser.current === forUser) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (currentUser.current === forUser) setLoadedFor(forUser);
        if (inflight.current?.token === token) inflight.current = null;
      }
    })();
    inflight.current = { userId: forUser, promise, token };
    return promise;
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
      return uc.nickname || `${(cardById.get(uc.card_id)?.product_name ?? 'Card').replace(/®/g, '')} ·· ${uc.last_four}`;
    };
    return { cardById, benefitById, userCardById, recoveredByOpp, userCardLabel };
  }, [data]);
}
