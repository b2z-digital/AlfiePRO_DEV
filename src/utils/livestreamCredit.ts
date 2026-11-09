/**
 * Livestream credit: clubs prepay (Alfie's Stripe) for live broadcasts in AlfieTV.
 * Recording races is free. Prices and the on/off switch live in livestream_billing_settings.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface CreditSettings {
  enforce: boolean;
  currency: string;
  device_hour_cents: number;
  cloud_hour_cents: number;
  viewer_unit_minutes: number;
  viewer_unit_cents: number;
  free_test_minutes: number;
  min_balance_cents: number;
  low_balance_cents: number;
  packs_cents: number[];
}

export interface CreditEntry {
  id: string;
  amount_cents: number;
  kind: 'topup' | 'usage' | 'adjustment';
  description: string | null;
  live_minutes: number | null;
  viewer_minutes: number | null;
  is_test: boolean;
  created_at: string;
}

export interface CreditSummary {
  balance_cents: number;
  exempt: boolean;
  test_minutes_used: number;
  settings: CreditSettings;
  history: CreditEntry[];
}

export const money = (cents: number) => {
  const v = Math.abs(cents) / 100;
  return `${cents < 0 ? '−' : ''}$${v.toFixed(v % 1 === 0 && v >= 10 ? 0 : 2)}`;
};

/** True when going live needs more credit than the club has (record races is always allowed). */
export const needsCredit = (c: CreditSummary | null, isTest = false) => {
  if (!c || !c.settings.enforce || c.exempt) return false;
  if (isTest && c.test_minutes_used < c.settings.free_test_minutes) return false;
  return c.balance_cents < c.settings.min_balance_cents;
};

export async function getCreditSummary(clubId: string): Promise<CreditSummary | null> {
  const { data, error } = await supabase.rpc('livestream_credit_summary', { p_club: clubId });
  if (error) {
    // Not set up yet (migration not run) or no access: hide credit rather than break the board
    if (!/does not exist|not have access|schema cache/i.test(error.message)) console.warn('[Credit]', error.message);
    return null;
  }
  return data as CreditSummary;
}

async function callCredit<T>(body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again');
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livestream-credit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Payments are unavailable right now');
  return json as T;
}

/** Opens Stripe Checkout for a top-up; comes back to the same page. */
export async function startTopUp(clubId: string, amountCents: number): Promise<void> {
  const returnPath = window.location.pathname + window.location.search.replace(/[?&](credit|checkout)=[^&]*/g, '');
  const { url } = await callCredit<{ url: string }>({ action: 'checkout', clubId, amountCents, returnPath });
  window.location.assign(url);
}

/** Credits any paid checkouts for the club (safe to call any time). */
export async function confirmTopUps(clubId: string): Promise<{ credited: number; balanceCents: number }> {
  return callCredit({ action: 'confirm', clubId });
}

export async function adjustCredit(clubId: string, cents: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('livestream_credit_adjust', { p_club: clubId, p_cents: cents, p_note: note });
  if (error) throw error;
  return data as number;
}

export async function saveCreditSettings(patch: Partial<CreditSettings>): Promise<void> {
  const { error } = await supabase.from('livestream_billing_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', true);
  if (error) throw error;
}

/** Live summary for a club; re-checks Stripe when the person comes back from paying. */
export function useLivestreamCredit(clubId?: string | null) {
  const [credit, setCredit] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!clubId) { setCredit(null); return null; }
    setLoading(true);
    try {
      const c = await getCreditSummary(clubId);
      setCredit(c);
      return c;
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => { reload(); }, [reload]);

  return { credit, loading, reload };
}

/** Plain-language estimate, e.g. for 3 hours and 20 viewers on average. */
export function estimateCents(s: CreditSettings, hours: number, avgViewers: number, cloud = false) {
  const hourly = cloud ? s.cloud_hour_cents : s.device_hour_cents;
  return Math.ceil(hours * hourly + (hours * 60 * avgViewers) / Math.max(s.viewer_unit_minutes, 1) * s.viewer_unit_cents);
}

/** Turns the database's credit refusal into the sentence for the person. */
export function creditErrorMessage(err: unknown): string | null {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : String(err || '');
  const m = msg.match(/LIVESTREAM_CREDIT:\s*(.*)$/s);
  return m ? m[1].trim() : null;
}
