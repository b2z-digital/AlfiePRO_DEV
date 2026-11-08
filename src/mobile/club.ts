/**
 * Data for the phone Club screens: feed, chats, people, classifieds, news and media.
 * Everything reads and writes the same tables as desktop (and mostly through the same
 * storage helpers), so a post, message or listing made on the phone shows up on desktop.
 */
import { supabase } from '../utils/supabase';
import { socialStorage, SocialPost } from '../utils/socialStorage';
import { getArticles, getArticleById, Article } from '../utils/articleStorage';
import { getClassifieds, getClassifiedById, getUserFavorites, toggleClassifiedFavorite } from '../utils/classifiedStorage';
import { getEventMedia } from '../utils/mediaStorage';
import type { Classified } from '../types/classified';
import type { EventMedia } from '../types/media';

export type { SocialPost, Article, Classified, EventMedia };

/* ─────────────── Feed ─────────────── */

export async function loadFeed(groupId?: string): Promise<SocialPost[]> {
  return ((await socialStorage.getFeed({ limit: 30, groupId })) || []) as unknown as SocialPost[];
}

export interface MGroup { id: string; name: string }

/** Groups I belong to, used as the feed's chips. */
export async function loadMyGroups(userId: string | undefined): Promise<MGroup[]> {
  if (!userId) return [];
  try {
    const rows = (await socialStorage.getGroups({ userId })) || [];
    return rows
      .filter((g: any) => !g.user_membership?.[0] || g.user_membership[0].status === 'approved' || g.user_membership.status === 'approved')
      .map((g: any) => ({ id: g.id, name: g.name }));
  } catch {
    return [];
  }
}

/** Same insert as the desktop composer (PostCreationModal). */
export async function createPost(opts: { content: string; clubId?: string; groupId?: string; files: File[] }) {
  const post = await socialStorage.createPost({
    content: opts.content.trim(),
    privacy: opts.groupId ? 'group' : 'public',
    group_id: opts.groupId,
    club_id: opts.clubId,
    content_type: opts.files.length ? 'image' : 'text',
  });
  for (const file of opts.files) {
    const fileUrl = await socialStorage.uploadSocialMedia(file);
    await socialStorage.createMediaAttachment({
      post_id: post.id,
      file_url: fileUrl,
      file_type: file.type.startsWith('image/') ? 'image' : 'video',
      file_size: file.size,
    });
  }
  return post;
}

export const toggleLike = (postId: string) => socialStorage.toggleReaction(postId, 'like');

/* ─────────────── Chats (conversations tables, same as desktop Comms) ─────────────── */

export interface MChat {
  id: string;
  otherId: string;
  name: string;
  avatar?: string;
  lastText: string;
  lastAt: string | null;
  lastSenderId: string | null;
  unread: boolean;
  online: boolean;
}

const ONLINE_MS = 15 * 60 * 1000;
export const isOnline = (lastSeen?: string | null) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
export const fullName = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '';

/** Inbox: my conversations, newest first, skipping ones I've hidden (same rules as desktop). */
export async function loadChats(userId: string | undefined): Promise<MChat[]> {
  if (!userId) return [];
  const { data: mine } = await supabase
    .from('conversation_participants')
    .select('conversation_id, last_read_at, hidden_at')
    .eq('user_id', userId);
  if (!mine?.length) return [];
  const lastRead = new Map(mine.map((p: any) => [p.conversation_id, p.last_read_at]));
  const hiddenAt = new Map(mine.map((p: any) => [p.conversation_id, p.hidden_at]));

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, last_message_text, last_message_at, last_message_sender_id')
    .in('id', mine.map((p: any) => p.conversation_id))
    .order('last_message_at', { ascending: false, nullsFirst: false });
  const visible = (convs || []).filter((c: any) => {
    const h = hiddenAt.get(c.id);
    if (!h) return true;
    return !!c.last_message_at && new Date(c.last_message_at) > new Date(h);
  });
  if (!visible.length) return [];

  const { data: others } = await supabase
    .from('conversation_participants')
    .select('conversation_id, user_id')
    .in('conversation_id', visible.map((c: any) => c.id))
    .neq('user_id', userId);
  const otherOf = new Map<string, string>();
  (others || []).forEach((p: any) => otherOf.set(p.conversation_id, p.user_id));
  const ids = [...new Set((others || []).map((p: any) => p.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, first_name, last_name, avatar_url, last_seen').in('id', ids)
    : { data: [] as any[] };
  const prof = new Map((profiles || []).map((p: any) => [p.id, p]));

  return visible.map((c: any) => {
    const otherId = otherOf.get(c.id) || '';
    const p = prof.get(otherId);
    const lr = lastRead.get(c.id);
    return {
      id: c.id,
      otherId,
      name: fullName(p) || 'Unknown',
      avatar: p?.avatar_url || undefined,
      lastText: c.last_message_text || '',
      lastAt: c.last_message_at,
      lastSenderId: c.last_message_sender_id,
      unread: !!c.last_message_at && (!lr || new Date(c.last_message_at) > new Date(lr)) && c.last_message_sender_id !== userId,
      online: isOnline(p?.last_seen),
    };
  });
}

export interface MMessage { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; message_type?: string }

/** The one-to-one conversation between two people, if there is one. */
export async function findDirectConversation(me: string, them: string): Promise<string | null> {
  const { data: mine } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', me);
  if (!mine?.length) return null;
  const { data: theirs } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', them)
    .in('conversation_id', mine.map((c: any) => c.conversation_id));
  for (const c of theirs || []) {
    const { count } = await supabase
      .from('conversation_participants')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.conversation_id);
    if (count === 2) return c.conversation_id;
  }
  return null;
}

export async function loadMessages(convId: string): Promise<MMessage[]> {
  const { data } = await supabase.from('conversation_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
  return (data || []) as MMessage[];
}

export async function markChatRead(convId: string, me: string) {
  await supabase.from('conversation_participants')
    .update({ last_read_at: new Date().toISOString(), hidden_at: null, hidden_message_id: null })
    .eq('conversation_id', convId).eq('user_id', me);
}

/** Creates the conversation on first send, exactly like desktop ChatView. */
export async function sendChatMessage(convId: string | null, me: string, them: string, text: string): Promise<{ convId: string; message: MMessage }> {
  let id = convId;
  if (!id) {
    id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: e1 } = await supabase.from('conversations').insert({ id, last_message_text: '', last_message_sender_id: me, last_message_at: now });
    if (e1) throw e1;
    const { error: e2 } = await supabase.from('conversation_participants').insert([
      { conversation_id: id, user_id: me },
      { conversation_id: id, user_id: them },
    ]);
    if (e2) throw e2;
  }
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({ conversation_id: id, sender_id: me, content: text })
    .select('*')
    .single();
  if (error) throw error;
  const now = new Date().toISOString();
  await supabase.from('conversations')
    .update({ last_message_text: text, last_message_at: now, last_message_sender_id: me, updated_at: now })
    .eq('id', id);
  await markChatRead(id, me);
  return { convId: id, message: data as MMessage };
}

export function chatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', ' ');
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days < 7) return d.toLocaleDateString('en-AU', { weekday: 'short' });
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/* ─────────────── People ─────────────── */

export interface MPerson {
  userId: string;
  name: string;
  avatar?: string;
  online: boolean;
  memberIds: string[];
  clubName?: string;
  since?: string;
  boats: { type: string; sail?: string | null }[];
}

export async function loadPerson(userId: string, clubId?: string): Promise<MPerson | null> {
  const [{ data: p }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, avatar_url, last_seen').eq('id', userId).maybeSingle(),
    supabase.from('members').select('id, club_id, date_joined, created_at, first_name, last_name').eq('user_id', userId),
  ]);
  if (!p && !members?.length) return null;
  const ids = (members || []).map((m: any) => m.id);
  const here = (members || []).find((m: any) => m.club_id === clubId) || members?.[0];
  const [{ data: boats }, { data: club }] = await Promise.all([
    ids.length ? supabase.from('member_boats').select('boat_type, sail_number').in('member_id', ids) : Promise.resolve({ data: [] as any[] }),
    here?.club_id ? supabase.from('clubs').select('name').eq('id', here.club_id).maybeSingle() : Promise.resolve({ data: null as any }),
  ]);
  const seen = new Set<string>();
  return {
    userId,
    name: fullName(p) || fullName(here) || 'Skipper',
    avatar: p?.avatar_url || undefined,
    online: isOnline(p?.last_seen),
    memberIds: ids,
    clubName: club?.name,
    since: here?.date_joined || here?.created_at,
    boats: (boats || []).filter((b: any) => {
      const k = `${b.boat_type}-${b.sail_number}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((b: any) => ({ type: b.boat_type, sail: b.sail_number })),
  };
}

/** A member id (from a results sheet) to the person's user id. */
export async function userIdForMember(memberId: string): Promise<string | null> {
  const { data } = await supabase.from('members').select('user_id').eq('id', memberId).maybeSingle();
  return data?.user_id || null;
}

export type ConnectionState = 'none' | 'pending' | 'connected';

export async function connectionWith(me: string, them: string): Promise<ConnectionState> {
  const { data } = await supabase
    .from('social_connections')
    .select('status')
    .or(`and(user_id.eq.${me},connected_user_id.eq.${them}),and(user_id.eq.${them},connected_user_id.eq.${me})`);
  if ((data || []).some((c: any) => c.status === 'accepted')) return 'connected';
  if ((data || []).some((c: any) => c.status === 'pending')) return 'pending';
  return 'none';
}

export const requestConnection = (them: string) => socialStorage.sendConnectionRequest(them, 'friend');

/* ─────────────── Classifieds, news, media ─────────────── */

export async function loadClassifieds(clubId: string | undefined, userId: string | undefined): Promise<{ items: Classified[]; favourites: Set<string> }> {
  const [items, favs] = await Promise.all([
    getClassifieds(clubId, true).catch(() => [] as Classified[]),
    userId ? getUserFavorites(userId).catch(() => [] as any[]) : Promise.resolve([] as any[]),
  ]);
  return { items: (items || []) as Classified[], favourites: new Set((favs || []).map((f: any) => f.classified_id || f.id)) };
}

export const loadClassified = (id: string) => getClassifiedById(id) as Promise<Classified | null>;
export const toggleFavourite = (id: string, userId: string) => toggleClassifiedFavorite(id, userId);

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: Number(n) % 1 ? 2 : 0 });
}

export const sellerName = (c: Classified) =>
  c.user ? `${c.user.first_name || ''} ${c.user.last_name || ''}`.trim()
    : c.matched_member ? `${c.matched_member.first_name} ${c.matched_member.last_name}`.trim()
      : c.external_contact_name || 'Seller';

export const sellerUserId = (c: Classified) => (c.is_external || c.is_scraped ? c.matched_member?.user_id : c.user_id) || null;

export async function loadNews(clubId: string | undefined, org: { type: string; id: string } | null): Promise<Article[]> {
  const list = clubId
    ? await getArticles(clubId)
    : org && (org.type === 'state' || org.type === 'national') ? await getArticles(undefined, org.id, org.type as 'state' | 'national') : [];
  return (list || []).filter(a => a.status === 'published')
    .sort((a, b) => (b.published_at || b.created_at || '').localeCompare(a.published_at || a.created_at || ''));
}

export const loadArticle = (id: string) => getArticleById(id);

export function readMinutes(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export const loadMedia = (clubId: string) => getEventMedia(clubId);

export function youTubeThumb(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}
