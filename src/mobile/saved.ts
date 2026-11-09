/**
 * Saved stories, kept on the member's account (user_article_bookmarks, as the old app did), so
 * they follow them to any phone. A copy is kept on the phone for no signal. Stories saved on this
 * phone before saving moved to the account are moved across the first time.
 */
import { supabase } from '../utils/supabase';

const LOCAL = 'alfie-m-saved-articles';
const MOVED = 'alfie-m-saved-moved';
const read = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What this phone last knew (instant, and all there is with no signal). */
export const savedOnPhone = (): string[] => read(LOCAL);

export async function loadSaved(userId: string | undefined): Promise<string[]> {
  if (!userId) return savedOnPhone();
  const { data, error } = await supabase.from('user_article_bookmarks').select('article_id').eq('user_id', userId);
  if (error) return savedOnPhone();
  let ids = (data || []).map((r: any) => r.article_id as string);
  // Move stories saved on this phone (before they were kept on the account) across, once
  let moved = false;
  try { moved = localStorage.getItem(`${MOVED}:${userId}`) === '1'; } catch { /* private mode */ }
  if (!moved) {
    const extra = savedOnPhone().filter(id => UUID.test(id) && !ids.includes(id));
    if (extra.length) {
      const { error: e } = await supabase.from('user_article_bookmarks').upsert(extra.map(article_id => ({ user_id: userId, article_id })), { onConflict: 'user_id,article_id', ignoreDuplicates: true });
      if (!e) ids = [...ids, ...extra];
      else {
        // a story that has since been deleted can't be saved; move the rest one by one
        for (const article_id of extra) {
          const { error: one } = await supabase.from('user_article_bookmarks').insert({ user_id: userId, article_id });
          if (!one) ids.push(article_id);
        }
      }
    }
    try { localStorage.setItem(`${MOVED}:${userId}`, '1'); } catch { /* private mode */ }
  }
  write(LOCAL, ids);
  return ids;
}

/** Save or unsave; the phone's copy changes straight away, the account follows. */
export async function setSaved(userId: string | undefined, articleId: string, on: boolean): Promise<boolean> {
  const before = savedOnPhone();
  write(LOCAL, on ? [...new Set([...before, articleId])] : before.filter(x => x !== articleId));
  if (!userId) return true;
  const { error } = on
    ? await supabase.from('user_article_bookmarks').upsert({ user_id: userId, article_id: articleId }, { onConflict: 'user_id,article_id', ignoreDuplicates: true })
    : await supabase.from('user_article_bookmarks').delete().eq('user_id', userId).eq('article_id', articleId);
  if (error) { write(LOCAL, before); return false; }
  return true;
}
