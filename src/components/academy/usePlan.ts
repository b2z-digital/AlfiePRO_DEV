// The signed-in skipper's Sailing Academy plan, and the ways to change it: a free week or a plan
// through Stripe's checkout, and Stripe's billing page to manage or stop it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { type Interval, type PlanRow, type PricePlan, type Tier, PRICES, tierOf, trialDaysLeft } from './plans';

export interface Quote {
  plan: PricePlan;
  club: { id: string; name: string } | null;
  trial: boolean;
  trialDays: number;
  prices: { month: number; year: number };
  status: string;
}

export interface AcademyPlan {
  loaded: boolean;
  tier: Tier;
  row: PlanRow | null;
  /** Days left of the free week, or null. */
  daysLeft: number | null;
  refresh: () => void;
  /** Which price applies and whether a free week is still there (null if it can't be told). */
  quote: () => Promise<Quote | null>;
  /** Off to Stripe's checkout; resolves with an error message if it couldn't go. */
  checkout: (interval: Interval) => Promise<string | null>;
  /** Off to Stripe's billing page; resolves with an error message if it couldn't go. */
  manage: () => Promise<string | null>;
}

const DEVICE_KEY = 'alfie-academy-device';

/** This device's id, for "one free week per device". */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return ''; }
}

/** Is this the Academy's own site (academy.alfiepro.com.au), rather than the app? */
export function onAcademySite(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.startsWith('academy.');
}

/** Where the Academy's site pages live on this host: '' on its own site, '/academy' inside the app. */
export function siteBase(): string {
  return onAcademySite() ? '' : '/academy';
}

/** A quote when the function can't be reached: the public price, no promises about the free week. */
export function fallbackQuote(): Quote {
  return { plan: 'academy', club: null, trial: true, trialDays: 7, prices: { ...PRICES.academy }, status: 'none' };
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) {
      let msg = 'Something went wrong. Please try again.';
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* plain error */ }
      return { data: null, error: msg };
    }
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) return { data: null, error: (data as { error: string }).error };
    return { data: data as T, error: null };
  } catch {
    return { data: null, error: 'Something went wrong. Please try again.' };
  }
}

export function useAcademyPlan(userId: string | null | undefined, superAdmin = false): AcademyPlan {
  const [row, setRow] = useState<PlanRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    if (!userId) { setRow(null); setLoaded(true); return; }
    void (async () => {
      const { data } = await supabase.from('academy_subscriptions')
        .select('status, plan, billing_interval, trial_end, current_period_end, cancel_at_period_end, member_club_id')
        .eq('user_id', userId).maybeSingle();
      if (!live) return;
      setRow((data as PlanRow | null) ?? null);
      setLoaded(true);
    })();
    return () => { live = false; };
  }, [userId, tick]);

  // Back from Stripe: look again (the webhook may land a moment later).
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => setTick(t => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const quote = useCallback(async () => {
    if (!userId) return null;
    const { data } = await invoke<Quote>('academy-checkout', { action: 'quote', deviceId: deviceId() });
    return data;
  }, [userId]);

  const checkout = useCallback(async (interval: Interval) => {
    const returnBase = `${window.location.origin}${siteBase()}`;
    const { data, error } = await invoke<{ url?: string; already?: boolean }>('academy-checkout', { action: 'checkout', interval, deviceId: deviceId(), returnBase });
    if (error) return error;
    if (data?.already) { setTick(t => t + 1); return 'You already have Academy.'; }
    if (!data?.url) return 'Something went wrong. Please try again.';
    window.location.assign(data.url);
    return null;
  }, []);

  const manage = useCallback(async () => {
    const { data, error } = await invoke<{ url?: string }>('academy-portal', { returnUrl: window.location.href });
    if (error) return error;
    if (!data?.url) return 'Something went wrong. Please try again.';
    window.location.assign(data.url);
    return null;
  }, []);

  return useMemo(() => ({ loaded, tier: tierOf(row, superAdmin), row, daysLeft: trialDaysLeft(row), refresh, quote, checkout, manage }), [loaded, row, superAdmin, refresh, quote, checkout, manage]);
}
