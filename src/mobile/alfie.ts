/**
 * Ask Alfie on the phone. Talks to the same `ask-alfie` function as the live app, so a skipper's
 * conversations carry on from the old app: history, quota, "take me there" links, rig settings
 * to save and race cards. Answers stream in; the function's control blocks (```nav, ```rig_settings,
 * ```find_races) are hidden while they arrive and arrive parsed in the final `done`.
 * Read aloud uses the `text-to-speech` function (Alfie's voice), sentence by sentence.
 */
import { supabase } from '../utils/supabase';
import { RIG_FIELDS } from './me';

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface AlfieConversation { id: string; title: string; created_at: string; updated_at: string }
export interface AlfieNav { route: string; label: string }
export interface RigOffer { boat_type: string; design_name?: string; rig_name: string; source_guide?: string; settings: Record<string, unknown> }
export interface RaceCard { id: string; title: string; date: string; venue: string; race_class: string; race_format: string; club_name: string; club_id: string | null; event_type: string; city?: string; state?: string }
export interface AlfieDone {
  conversation_id: string;
  message: string;
  quota: { used: number; limit: number };
  navigation?: AlfieNav | null;
  rig_settings_offer?: RigOffer | null;
  race_results?: RaceCard[] | null;
  race_search_meta?: { total_found: number } | null;
}
export interface AlfieMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_url?: string | null;
  /** extras that came with the answer (not kept in history by the function) */
  nav?: AlfieNav | null;
  rig?: RigOffer | null;
  races?: RaceCard[] | null;
  racesFound?: number;
  streaming?: boolean;
}

async function headers(refresh = false): Promise<Record<string, string>> {
  let token: string | undefined;
  if (!refresh) {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s && (s.expires_at ?? 0) > Date.now() / 1000 + 60) token = s.access_token;
  }
  if (!token) token = (await supabase.auth.refreshSession()).data.session?.access_token;
  if (!token) throw new Error('Sign in again to ask Alfie.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', apikey: ANON };
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  let r = await fetch(`${BASE}/${path}`, { ...init, headers: await headers() });
  if (r.status === 401) r = await fetch(`${BASE}/${path}`, { ...init, headers: await headers(true) });
  return r;
}

/* ─────────────── Streaming ─────────────── */

const BLOCK = /```(nav|rig_settings|find_races)[\s\S]*?```/g;
/**
 * What to show of an answer while it streams: the control blocks are taken out, and a block
 * that has started but not finished is cut off (as is a lone ``` that may be one starting).
 */
export function visibleText(raw: string): string {
  let t = raw.replace(BLOCK, '');
  const fences = [...t.matchAll(/```/g)];
  if (fences.length % 2 === 1) t = t.slice(0, fences[fences.length - 1].index);
  return t.replace(/`{1,2}$/, '').replace(/\s+$/, '');
}

export interface StreamHandlers { onToken: (text: string) => void; onDone: (d: AlfieDone) => void; onError: (msg: string) => void }

/** Reads `data: {...}` lines out of an SSE body, however the bytes are split. */
export function sseReader(onEvent: (e: any) => void) {
  let buf = '';
  return (chunk: string, end = false) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = end ? '' : lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      try { onEvent(JSON.parse(t.slice(6))); } catch { /* keep-alive or partial */ }
    }
  };
}

export async function ask(
  q: { message: string; conversationId?: string | null; imageUrl?: string | null; courseMode?: boolean },
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await call('ask-alfie', {
      method: 'POST',
      signal,
      body: JSON.stringify({ message: q.message, conversation_id: q.conversationId || null, image_url: q.imageUrl || null, include_audio: false, ...(q.courseMode ? { course_mode: true } : {}) }),
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    h.onError(navigator.onLine ? 'Alfie couldn\'t be reached. Try again.' : 'No signal. Alfie needs a connection.');
    return;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    h.onError(body?.error === 'quota_exceeded' ? (body.message || 'You\'ve used all your questions for this month.') : (body?.message || body?.error || 'Something went wrong. Try again.'));
    return;
  }
  let raw = '';
  let finished = false;
  const read = sseReader(e => {
    if (e.type === 'token' && typeof e.content === 'string') { raw += e.content; h.onToken(raw); }
    else if (e.type === 'done') { finished = true; h.onDone(e as AlfieDone); }
    else if (e.type === 'error') { finished = true; h.onError(e.error || 'Alfie stopped part way. Try again.'); }
  });
  try {
    if (res.body && 'getReader' in res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        read(dec.decode(value, { stream: true }));
      }
      read('', true);
    } else {
      read(await res.text(), true);
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
  }
  if (!finished) h.onError('Alfie stopped part way. Try again.');
}

/* ─────────────── History ─────────────── */

export async function loadConversations(): Promise<AlfieConversation[]> {
  const r = await call('ask-alfie?action=conversations');
  return r.ok ? r.json() : [];
}

export async function loadHistory(id: string): Promise<AlfieMsg[]> {
  const r = await call(`ask-alfie?action=history&conversation_id=${encodeURIComponent(id)}`);
  if (!r.ok) return [];
  const rows: any[] = await r.json();
  return rows.map(m => ({ id: m.id, role: m.role, content: m.role === 'assistant' ? visibleText(m.content || '') : m.content, image_url: m.image_url }));
}

export async function deleteConversation(id: string): Promise<boolean> {
  const { error } = await supabase.from('alfie_conversations').delete().eq('id', id);
  return !error;
}

export async function loadQuota(): Promise<{ allowed: boolean; used: number; limit: number } | null> {
  try {
    const r = await call('ask-alfie?action=quota');
    return r.ok ? r.json() : null;
  } catch { return null; }
}

export async function saveRig(offer: RigOffer, wind: string, water: string): Promise<{ boat: string; rig: string; was_update: boolean }> {
  const r = await call('ask-alfie?action=save-rig-settings', {
    method: 'POST',
    body: JSON.stringify({ boat_type: offer.design_name || offer.boat_type, rig_name: offer.rig_name, settings: offer.settings, wind_condition: wind, water_condition: water, source_guide: offer.source_guide }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Couldn\'t save those settings.');
  return d;
}

/* ─────────────── What an answer carries ─────────────── */

const DF_LABELS: Record<string, string> = {
  gate: 'Gate', headsailFootDepth: 'Headsail foot depth', headsailBoomAngle: 'Headsail boom angle', headsailTwist: 'Headsail twist',
  mainsailFootDepth: 'Mainsail foot depth', cunham: 'Cunningham', mainsailBoomAngle: 'Mainsail boom angle', mainsailTwist: 'Mainsail twist',
};
const fmtVal = (v: unknown, unit: string) => (typeof v === 'number' ? `${v}${unit ? (unit === '°' ? '°' : ` ${unit}`) : ''}` : String(v));

/** The rig table under an answer, labelled as the boat shed labels them. */
export function rigRows(offer: RigOffer): { label: string; value: string }[] {
  const s = offer.settings || {};
  const rows: { label: string; value: string }[] = [];
  const known = new Set<string>();
  for (const f of RIG_FIELDS) if (s[f.key] != null && s[f.key] !== '') { rows.push({ label: f.label, value: fmtVal(s[f.key], f.unit) }); known.add(f.key); }
  for (const [k, label] of Object.entries(DF_LABELS)) if (s[k] != null && s[k] !== '') { rows.push({ label, value: fmtVal(s[k], /Angle|Twist/.test(k) ? '°' : /Depth|gate/i.test(k) ? 'mm' : '') }); known.add(k); }
  const custom = (s.customFields || {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(custom)) if (v != null && v !== '') rows.push({ label: k, value: String(v) });
  for (const [k, v] of Object.entries(s)) if (!known.has(k) && k !== 'customFields' && v != null && typeof v !== 'object') rows.push({ label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), value: String(v) });
  return rows;
}

/** Where a "take me there" from Alfie goes in the phone app (the function names the old app's routes). */
const NAV: [RegExp, string][] = [
  [/^\/\(tabs\)\/?$/, '/'], [/calendar|events/, '/calendar'], [/my-stats|stats/, '/my-stats'], [/results/, '/results'],
  [/rigs/, '/my-garage'], [/classifieds/, '/classifieds'], [/media/, '/media'], [/news/, '/news'], [/weather/, '/weather'],
  [/membership/, '/my-membership'], [/notifications/, '/notifications'], [/tasks/, '/tasks'], [/start-box/, '/race-timer'],
  [/find-racing/, '/find-racing'], [/privacy/, '/settings'], [/alfie-tv/, '/alfie-tv'], [/community/, '/club'], [/messages/, '/comms'],
  [/profile/, '/me'],
];
export function navPath(nav: AlfieNav): string | null {
  const r = nav.route || '';
  for (const [re, to] of NAV) if (re.test(r)) return to;
  return null;
}

/* ─────────────── Showing an answer ─────────────── */

export type Inline = { t: 'text' | 'b' | 'i'; s: string } | { t: 'a'; s: string; href: string };
export type Block = { t: 'p' | 'h'; c: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] };

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', s: s.slice(last, m.index) });
    if (m[1]) out.push({ t: 'b', s: m[1] });
    else if (m[2]) out.push({ t: 'i', s: m[2] });
    else if (m[3]) out.push({ t: 'a', s: m[3], href: m[4] });
    else out.push({ t: 'text', s: m[5] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last) });
  return out;
}

/** Alfie answers in light markdown: paragraphs, headings, bullet and numbered lists, bold, links. */
export function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', c: inline(para.join(' ')) }); para = []; } };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (h) { flush(); out.push({ t: 'h', c: inline(h[1].replace(/\*\*/g, '')) }); continue; }
    if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const prev = out[out.length - 1];
      const item = inline((ul || ol)![1]);
      if (prev && prev.t === kind) prev.items.push(item);
      else out.push({ t: kind, items: [item] });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** Plain words for reading aloud and copying. */
export function plainText(text: string): string {
  return visibleText(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*•]\s+/gm, '').replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, '\n').trim();
}

/** Splits words already arrived into sentences ready to speak, keeping the unfinished tail
 * (a full stop with nothing after it yet may be "3." of a number still arriving). */
export function takeSentences(buffer: string): { ready: string[]; rest: string } {
  const ready: string[] = [];
  let rest = buffer;
  for (let m = rest.match(/[.!?](?=\s)|\n/); m && m.index !== undefined; m = rest.match(/[.!?](?=\s)|\n/)) {
    const end = m.index + m[0].length;
    const s = plainText(rest.slice(0, end));
    rest = rest.slice(end).replace(/^\s+/, '');
    if (s.length > 1) ready.push(s);
  }
  return { ready, rest };
}

/* ─────────────── Alfie's voice ─────────────── */

/**
 * Speaks text sentence by sentence in Alfie's voice, fetching the next sentence while one plays.
 * Feed it as an answer streams in, then `finish()`. Falls back to the phone's own voice when
 * the voice service can't be reached.
 */
export class Speaker {
  private queue: string[] = [];
  private buffer = '';
  private ended = false;
  private stopped = false;
  private playing = false;
  private audio: HTMLAudioElement | null = null;
  private next: Promise<string | null> | null = null;
  private nextFor: string | null = null;
  private abort = new AbortController();
  private seen = 0;
  constructor(private onEnd: () => void) {}

  /** Give it the whole answer so far; it speaks whatever is new. */
  feed(textSoFar: string) {
    if (this.stopped) return;
    const t = visibleText(textSoFar);
    if (t.length <= this.seen) return;
    this.buffer += t.slice(this.seen);
    this.seen = t.length;
    const { ready, rest } = takeSentences(this.buffer);
    this.buffer = rest;
    if (ready.length) { this.queue.push(...ready); this.pump(); }
  }

  finish() {
    const rest = plainText(this.buffer);
    this.buffer = '';
    if (rest.length > 1) this.queue.push(rest);
    this.ended = true;
    this.pump();
  }

  stop() {
    this.stopped = true;
    this.abort.abort();
    this.queue = [];
    if (this.audio) { this.audio.pause(); this.audio.src = ''; this.audio = null; }
    try { window.speechSynthesis?.cancel(); } catch { /* none */ }
  }

  private fetchVoice(text: string): Promise<string | null> {
    return (async () => {
      try {
        const r = await fetch(`${BASE}/text-to-speech`, { method: 'POST', headers: await headers(), body: JSON.stringify({ text, voice: 'fable' }), signal: this.abort.signal });
        if (!r.ok) return null;
        return URL.createObjectURL(await r.blob());
      } catch { return null; }
    })();
  }

  private prefetch() {
    const n = this.queue[0];
    if (n && this.nextFor !== n) { this.nextFor = n; this.next = this.fetchVoice(n); }
  }

  private async pump() {
    if (this.playing || this.stopped) return;
    const text = this.queue.shift();
    if (!text) { if (this.ended) this.onEnd(); return; }
    this.playing = true;
    const url = this.nextFor === text && this.next ? await this.next : await this.fetchVoice(text);
    this.next = null; this.nextFor = null;
    this.prefetch();
    if (this.stopped) { if (url) URL.revokeObjectURL(url); return; }
    await (url ? this.playUrl(url) : this.sayLocally(text));
    this.playing = false;
    void this.pump();
  }

  private playUrl(url: string): Promise<void> {
    return new Promise(resolve => {
      const a = new Audio(url);
      this.audio = a;
      const done = () => { URL.revokeObjectURL(url); if (this.audio === a) this.audio = null; resolve(); };
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
    });
  }

  private sayLocally(text: string): Promise<void> {
    return new Promise(resolve => {
      const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (!synth) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-AU';
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  }
}

/* ─────────────── Photos ─────────────── */

/** A photo made small enough to send (longest side 1280px, JPEG). */
export function photoToDataUrl(file: File, max = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo couldn\'t be opened.')); };
    img.src = url;
  });
}
