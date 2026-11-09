/**
 * Community guidelines: members agree to the Terms of Service once before posting or chatting,
 * the same record the old app kept (terms_acceptance, version 'v1'), so anyone who agreed there
 * isn't asked again. The terms are the ones Super Admin keeps in Legal pages.
 */
import { supabase } from '../utils/supabase';

export const TERMS_VERSION = 'v1';
const key = (userId: string) => `alfie-m-terms:${userId}`;

export async function hasAcceptedTerms(userId: string): Promise<boolean> {
  try { if (localStorage.getItem(key(userId)) === TERMS_VERSION) return true; } catch { /* private mode */ }
  const { data, error } = await supabase.from('terms_acceptance').select('id').eq('user_id', userId).eq('terms_version', TERMS_VERSION).limit(1);
  if (error) return true; // no signal: don't lock someone out of their club; asked again next time
  const ok = !!data?.length;
  if (ok) try { localStorage.setItem(key(userId), TERMS_VERSION); } catch { /* private mode */ }
  return ok;
}

export async function acceptTerms(userId: string): Promise<void> {
  const { error } = await supabase.from('terms_acceptance').insert({ user_id: userId, terms_version: TERMS_VERSION });
  if (error) throw error;
  try { localStorage.setItem(key(userId), TERMS_VERSION); } catch { /* private mode */ }
}

export async function loadTerms(): Promise<{ title: string; html: string } | null> {
  const { data } = await supabase.from('global_legal_pages').select('title, html_content').eq('page_type', 'terms_of_service').maybeSingle();
  return data ? { title: data.title || 'Terms of Service', html: data.html_content || '' } : null;
}
