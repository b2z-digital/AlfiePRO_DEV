/**
 * Score together (Race Management board, "More hands on race day"): the scorer's phone hosts a
 * scoring session (the desktop's scoring_sessions PIN); spotters join by PIN with no account and
 * get the finish pad for the heat that's racing. Calls travel over a realtime channel named by
 * the session (only people who entered the PIN learn it); the scorer's phone keeps the finish
 * order and sends it back to everyone, and asks when two phones disagree about a place.
 */
import { supabase } from '../utils/supabase';
import { endScoringSession } from '../utils/scoringSessions';
import { applyRemoteCall, type RemoteCall } from './finishPad';
import { SESSION_EVENT, saveSession, storedSession, type PadInfo, type RaceSession } from './raceSession';

export interface SpotterState {
  eventName: string;
  hostName: string;
  pad: PadInfo;
  /** Finishers by pad index with their places, and letter scores. */
  order: { i: number; place: number | null; code?: string | null }[];
  nextPlace: number;
  conflict: boolean;
  gunAt: number | null;
}

type Msg =
  | { t: 'hello'; who: string }
  | { t: 'state'; state: SpotterState | null }
  | { t: 'call'; call: RemoteCall }
  | { t: 'ended' };

export interface Person { key: string; name: string; role: 'scorer' | 'spotter'; device: string }

export const deviceName = () => {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /iPhone|iPad/i.test(ua) ? 'iPhone' : /Android/i.test(ua) ? 'Android' : 'Phone';
};

const DEVICE_KEY = 'alfie-m-device-key';
export const deviceKey = (): string => {
  try {
    let k = localStorage.getItem(DEVICE_KEY);
    if (!k) { k = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; localStorage.setItem(DEVICE_KEY, k); }
    return k;
  } catch { return 'd-private'; }
};

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * One realtime channel per session, plus a same-browser channel (two tabs on one device, and the
 * test harness). Messages carry an id so a copy arriving both ways is handled once.
 */
class Link {
  private ch: ReturnType<typeof supabase.channel> | null = null;
  private bc: BroadcastChannel | null = null;
  private seen = new Set<string>();
  private handlers = new Set<(m: Msg) => void>();
  private peopleHandlers = new Set<(p: Person[]) => void>();
  private me: Person;
  connected = false;

  constructor(readonly sessionId: string, me: Omit<Person, 'key'>) {
    // one key per connection (two tabs on one device are two people)
    this.me = { ...me, key: `${deviceKey()}-${uid().slice(-4)}` };
    const name = `score-together:${sessionId}`;
    try {
      this.ch = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key: this.me.key } } });
      this.ch
        .on('broadcast', { event: 'msg' }, ({ payload }) => this.receive(payload))
        .on('presence', { event: 'sync' }, () => this.emitPeople())
        .subscribe(status => {
          this.connected = status === 'SUBSCRIBED';
          if (this.connected) void this.ch?.track(this.me);
        });
    } catch { this.ch = null; }
    try {
      this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
      if (this.bc) this.bc.onmessage = ev => this.receive(ev.data);
    } catch { this.bc = null; }
  }

  private receive(payload: any) {
    if (!payload?.mid || this.seen.has(payload.mid)) return;
    this.seen.add(payload.mid);
    if (payload.from === this.me.key) return;
    if (payload.t === 'presence') {
      const known = this.local.has(payload.person.key);
      this.local.set(payload.person.key, payload.person);
      this.emitPeople();
      if (!known) this.announce(); // let a newcomer know who's here
      return;
    }
    this.handlers.forEach(h => h(payload as Msg));
  }

  private local = new Map<string, Person>();

  send(m: Msg) {
    const payload = { ...m, mid: uid(), from: this.me.key };
    this.seen.add(payload.mid);
    void this.ch?.send({ type: 'broadcast', event: 'msg', payload }).catch?.(() => {});
    try { this.bc?.postMessage(payload); } catch { /* closed */ }
  }

  /** Same-browser presence (the realtime channel tracks its own). */
  announce() {
    const payload = { t: 'presence', person: this.me, mid: uid(), from: this.me.key };
    try { this.bc?.postMessage(payload); } catch { /* closed */ }
  }

  people(): Person[] {
    const out = new Map<string, Person>();
    out.set(this.me.key, this.me);
    const st = (this.ch?.presenceState?.() || {}) as Record<string, any[]>;
    for (const [k, metas] of Object.entries(st)) { const p = metas?.[0]; if (p?.name) out.set(k, { key: k, name: p.name, role: p.role, device: p.device }); }
    this.local.forEach((p, k) => out.set(k, p));
    return [...out.values()];
  }

  private emitPeople() { const p = this.people(); this.peopleHandlers.forEach(h => h(p)); }
  onMessage(h: (m: Msg) => void) { this.handlers.add(h); return () => { this.handlers.delete(h); }; }
  onPeople(h: (p: Person[]) => void) { this.peopleHandlers.add(h); h(this.people()); return () => { this.peopleHandlers.delete(h); }; }

  close() {
    try { if (this.ch) void supabase.removeChannel(this.ch); } catch { /* ignore */ }
    try { this.bc?.close(); } catch { /* ignore */ }
    this.handlers.clear(); this.peopleHandlers.clear();
  }
}

/* ─────────────── the scorer's phone ─────────────── */

export interface HostInfo { sessionId: string; pin: string; eventId: string; eventName: string; hostName: string }
const HOST_KEY = (eventId: string) => `alfie-m-together:${eventId}`;

export function hostInfo(eventId: string): HostInfo | null {
  try { const raw = localStorage.getItem(HOST_KEY(eventId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function stateFor(s: RaceSession | null, info: HostInfo): SpotterState | null {
  if (!s?.pad) return null;
  const order = (s.finish || []).map(e => ({ i: e.skipperIndex, place: e.letterScore ? null : e.position, code: e.letterScore || null }));
  return {
    eventName: info.eventName,
    hostName: info.hostName,
    pad: s.pad,
    order,
    nextPlace: order.filter(o => o.place !== null).length + 1,
    conflict: (s.conflicts || []).length > 0,
    gunAt: s.gunAt || null,
  };
}

class Host {
  link: Link;
  private offSession: () => void;
  private offMsg: () => void;
  private listeners = new Set<(e: { kind: 'conflict' | 'call'; who: string }) => void>();

  constructor(readonly info: HostInfo) {
    this.link = new Link(info.sessionId, { name: info.hostName, role: 'scorer', device: deviceName() });
    this.link.announce();
    this.offMsg = this.link.onMessage(m => {
      if (m.t === 'hello') { this.link.announce(); this.broadcast(); }
      if (m.t === 'call') this.apply(m.call);
    });
    const onSession = (ev: Event) => { const s = (ev as CustomEvent).detail as RaceSession; if (s?.eventId === info.eventId) this.broadcast(s); };
    window.addEventListener(SESSION_EVENT, onSession);
    this.offSession = () => window.removeEventListener(SESSION_EVENT, onSession);
  }

  broadcast(s: RaceSession | null = storedSession(this.info.eventId)) {
    this.link.send({ t: 'state', state: stateFor(s, this.info) });
  }

  private apply(call: RemoteCall) {
    const s = storedSession(this.info.eventId);
    if (!s) return;
    const r = applyRemoteCall(s, call);
    if (r.outcome === 'added' || r.outcome === 'conflict') {
      saveSession(r.session); // screens reload and everyone gets the new order
      this.listeners.forEach(l => l({ kind: r.outcome === 'conflict' ? 'conflict' : 'call', who: call.who }));
    } else {
      this.broadcast(s);
    }
  }

  onCall(l: (e: { kind: 'conflict' | 'call'; who: string }) => void) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  close() { this.offSession(); this.offMsg(); this.link.close(); }
}

const hosts = new Map<string, Host>();

/** The running session for an event on this phone (started from Score together), if any. */
export function hostFor(eventId: string): Host | null {
  const info = hostInfo(eventId);
  if (!info) return null;
  let h = hosts.get(eventId);
  if (!h || h.info.sessionId !== info.sessionId) { h?.close(); h = new Host(info); hosts.set(eventId, h); }
  return h;
}

export function startHosting(info: HostInfo): Host {
  try { localStorage.setItem(HOST_KEY(info.eventId), JSON.stringify(info)); } catch { /* private mode */ }
  return hostFor(info.eventId)!;
}

export async function stopHosting(eventId: string) {
  const info = hostInfo(eventId);
  const h = hosts.get(eventId);
  h?.link.send({ t: 'ended' });
  h?.close();
  hosts.delete(eventId);
  try { localStorage.removeItem(HOST_KEY(eventId)); } catch { /* ignore */ }
  if (info) await endScoringSession(info.sessionId).catch(() => {});
}

/* ─────────────── a spotter's phone ─────────────── */

export interface Spotter {
  link: Link;
  call: (g: number, place: number) => void;
  close: () => void;
}

export function joinAsSpotter(sessionId: string, name: string, onState: (s: SpotterState | null) => void, onEnded: () => void): Spotter {
  const link = new Link(sessionId, { name, role: 'spotter', device: deviceName() });
  link.onMessage(m => {
    if (m.t === 'state') onState(m.state);
    if (m.t === 'ended') onEnded();
  });
  link.announce();
  const hello = () => link.send({ t: 'hello', who: name });
  hello();
  // ask again until the scorer answers (their phone may be waking up)
  const timer = setInterval(hello, 4000);
  const stopAsking = link.onMessage(m => { if (m.t === 'state') { clearInterval(timer); stopAsking(); } });
  return {
    link,
    call: (g, place) => link.send({ t: 'call', call: { id: uid(), g, place, who: name, at: Date.now() } }),
    close: () => { clearInterval(timer); link.close(); },
  };
}
