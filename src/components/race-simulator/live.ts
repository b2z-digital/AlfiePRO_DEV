// Live races between members.
//
// One person opens a race room and gets a short code; the others join with it (or pick the room
// from their club's list of open races), everyone readies up and the host starts. Every device then
// sails the whole race itself: AI skippers fill the fleet, the same on every device, and the only
// thing that travels is each person's helm. Each helm movement is stamped with the step it applies
// from, a little ahead (INPUT_DELAY) so it reaches everyone in time, and a device takes a step only
// once everyone's helm for it is in (lockstep). So the race is identical on every device, boat for
// boat. If someone's connection drops, the host hands her boat to an AI skipper from the first step
// she sent nothing for, and every device does the same at that step.
//
// The room is a realtime channel named by its code (only people given the code, or at the club,
// learn it), plus a same-browser channel so two tabs on one device can race each other.

import { Race, type PlayerAct } from '@/sim/engine';
import type { ClassId } from '@/sim/classes';
import type { CrewMember, RaceSettings } from '@/sim/types';

/** Steps (of 50 ms) a helm movement is stamped ahead of the race: the time it has to reach everyone. */
export const INPUT_DELAY = 6;
/** Steps between ticks of helm sent to the others. */
export const TICK = 3;
/** How long someone can hold the race up before the host hands her boat to an AI skipper. */
export const HANDOVER_MS = 6000;
/** Every this many steps the devices check that their races are still the same. */
export const CHECK_EVERY = 100;

/** You, as the room sees you. */
export interface LiveMe { id: string; name: string; sails: Partial<Record<ClassId, string>>; autoTrim: boolean }

/** Someone in the room. */
export interface LivePerson extends LiveMe { key: string; ready: boolean; host: boolean; at: number }

/** What the host has chosen to race: everything but the crew and the seed, which come at the start. */
export type RoomSettings = Omit<RaceSettings, 'crew' | 'seat' | 'seed' | 'player'>;

/** An open room, as it shows in the club's list. */
export interface OpenRoom { code: string; host: string; title: string; people: number; at: number }

export type LiveMsg =
  | { t: 'room'; settings: RoomSettings }
  | { t: 'start'; settings: RaceSettings; keys: string[] }
  | { t: 'in'; s: number; f: number; u: number; i: [number, number, number][]; a: [number, PlayerAct][]; h?: [number, string] }
  | { t: 'resend'; s: number; from: number }
  | { t: 'gone'; s: number; at: number; i: [number, number, number][]; a: [number, PlayerAct][] }
  | { t: 'bye'; s: number };

// ───────────────────────── transport ─────────────────────────

/** How a room talks: broadcast to everyone else in it, and who's in it (presence). */
export interface Transport {
  send(m: LiveMsg): void;
  /** Say who you are (again, when something about you changes). */
  track(p: LivePerson): void;
  onMessage(fn: (m: LiveMsg) => void): void;
  onPeople(fn: (people: LivePerson[]) => void): void;
  close(): void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * A room over the realtime channel `sim-live:<code>` and, for tabs on this device, a
 * BroadcastChannel of the same name (which has no presence, so tabs say "here" every second).
 * Messages carry an id, so one arriving both ways is handled once.
 */
export class ChannelTransport implements Transport {
  private ch: { send: (x: unknown) => unknown; track: (x: unknown) => unknown; presenceState: () => Record<string, unknown[]>; unsubscribe: () => unknown } | null = null;
  private bc: BroadcastChannel | null = null;
  private seen: string[] = [];
  private seenSet = new Set<string>();
  private msgFns: ((m: LiveMsg) => void)[] = [];
  private peopleFns: ((p: LivePerson[]) => void)[] = [];
  private me: LivePerson | null = null;
  private local = new Map<string, { p: LivePerson; t: number }>();
  private beat: number | null = null;
  private closed = false;

  constructor(readonly name: string) {
    void import('@/utils/supabase').then(({ supabase }) => {
      if (this.closed) return;
      try {
        const ch = supabase.channel(name, { config: { broadcast: { self: false }, presence: { key: uid() } } });
        ch.on('broadcast', { event: 'm' }, ({ payload }) => this.receive(payload as { id: string; m: LiveMsg }))
          .on('presence', { event: 'sync' }, () => this.emitPeople())
          .subscribe(status => { if (status === 'SUBSCRIBED' && this.me) void ch.track(this.me); });
        this.ch = ch as unknown as ChannelTransport['ch'];
      } catch { this.ch = null; }
    }).catch(() => { /* no realtime: tabs on this device can still race */ });
    try {
      this.bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
      if (this.bc) this.bc.onmessage = ev => this.receive(ev.data as { id: string; m: LiveMsg } | { here: LivePerson } | { gone: string });
    } catch { this.bc = null; }
    if (typeof window !== 'undefined') {
      this.beat = window.setInterval(() => {
        if (this.me) this.bc?.postMessage({ here: this.me });
        const now = Date.now();
        let changed = false;
        for (const [k, v] of this.local) if (now - v.t > 3500) { this.local.delete(k); changed = true; }
        if (changed) this.emitPeople();
      }, 1000);
    }
  }

  send(m: LiveMsg) {
    const env = { id: uid(), m };
    this.remember(env.id);
    try { void this.ch?.send({ type: 'broadcast', event: 'm', payload: env }); } catch { /* the other way may still get there */ }
    try { this.bc?.postMessage(env); } catch { /* ignore */ }
  }

  track(p: LivePerson) {
    this.me = p;
    try { void this.ch?.track(p); } catch { /* ignore */ }
    try { this.bc?.postMessage({ here: p }); } catch { /* ignore */ }
    this.emitPeople();
  }

  onMessage(fn: (m: LiveMsg) => void) { this.msgFns.push(fn); }
  onPeople(fn: (p: LivePerson[]) => void) { this.peopleFns.push(fn); }

  close() {
    this.closed = true;
    if (this.beat !== null) window.clearInterval(this.beat);
    try { if (this.me) this.bc?.postMessage({ gone: this.me.key }); } catch { /* ignore */ }
    try { void this.ch?.unsubscribe(); } catch { /* ignore */ }
    try { this.bc?.close(); } catch { /* ignore */ }
    this.ch = null; this.bc = null;
  }

  private remember(id: string) {
    this.seenSet.add(id); this.seen.push(id);
    if (this.seen.length > 4000) for (const old of this.seen.splice(0, 2000)) this.seenSet.delete(old);
  }

  private receive(data: { id: string; m: LiveMsg } | { here: LivePerson } | { gone: string } | null) {
    if (!data || this.closed) return;
    if ('here' in data) { this.local.set(data.here.key, { p: data.here, t: Date.now() }); this.emitPeople(); return; }
    if ('gone' in data) { this.local.delete(data.gone); this.emitPeople(); return; }
    if (!data.id || this.seenSet.has(data.id)) return;
    this.remember(data.id);
    for (const fn of this.msgFns) fn(data.m);
  }

  private emitPeople() {
    const all = new Map<string, LivePerson>();
    if (this.me) all.set(this.me.key, this.me);
    for (const [k, v] of this.local) all.set(k, v.p);
    try {
      const st = this.ch?.presenceState() ?? {};
      for (const list of Object.values(st)) for (const p of list as LivePerson[]) if (p && p.key) all.set(p.key, p);
    } catch { /* ignore */ }
    const people = [...all.values()].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
    for (const fn of this.peopleFns) fn(people);
  }
}

/** Rooms in one process (tests): every transport on a hub hears the others, with an optional delay. */
export class MemoryHub {
  private ends: MemoryTransport[] = [];
  /** Deliver messages after this many calls to flush() (0 = on the next flush). */
  constructor(public delay: (from: MemoryTransport, to: MemoryTransport) => number = () => 0) {}
  private queue: { at: number; to: MemoryTransport; m: LiveMsg }[] = [];
  private clock = 0;
  connect(): MemoryTransport { const t = new MemoryTransport(this); this.ends.push(t); return t; }
  /** @internal */ post(from: MemoryTransport, m: LiveMsg) {
    for (const to of this.ends) if (to !== from && !to.closed) this.queue.push({ at: this.clock + this.delay(from, to), to, m: JSON.parse(JSON.stringify(m)) as LiveMsg });
  }
  /** @internal */ people() { return this.ends.filter(e => !e.closed && e.me).map(e => e.me!).sort((a, b) => a.at - b.at || a.key.localeCompare(b.key)); }
  /** @internal */ peopleChanged() { const p = this.people(); for (const e of this.ends) if (!e.closed) e.emitPeople(p); }
  /** Deliver what's due. */
  flush() {
    this.clock++;
    const due = this.queue.filter(q => q.at <= this.clock);
    this.queue = this.queue.filter(q => q.at > this.clock);
    for (const q of due) if (!q.to.closed) q.to.deliver(q.m);
  }
}

export class MemoryTransport implements Transport {
  closed = false;
  me: LivePerson | null = null;
  private msgFns: ((m: LiveMsg) => void)[] = [];
  private peopleFns: ((p: LivePerson[]) => void)[] = [];
  constructor(private hub: MemoryHub) {}
  send(m: LiveMsg) { if (!this.closed) this.hub.post(this, m); }
  track(p: LivePerson) { this.me = p; this.hub.peopleChanged(); }
  onMessage(fn: (m: LiveMsg) => void) { this.msgFns.push(fn); }
  onPeople(fn: (p: LivePerson[]) => void) { this.peopleFns.push(fn); }
  close() { this.closed = true; this.hub.peopleChanged(); }
  /** @internal */ deliver(m: LiveMsg) { for (const fn of this.msgFns) fn(m); }
  /** @internal */ emitPeople(p: LivePerson[]) { for (const fn of this.peopleFns) fn(p); }
}

// ───────────────────────── the room ─────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A room code: six letters and digits, none that look alike. */
export function newCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 6);
export const roomChannel = (code: string) => `sim-live:${cleanCode(code)}`;

/**
 * A race room: who's in it, what the host has chosen to race, and (once the host starts) the race.
 * The host is whoever opened it; if they leave before the start, the next person in becomes host.
 */
export class LiveRoom {
  people: LivePerson[] = [];
  settings: RoomSettings | null;
  race: LiveRace | null = null;
  /** Something went wrong starting or joining (shown in the room). */
  note: string | null = null;
  private me: LivePerson;
  private fns = new Set<() => void>();

  constructor(readonly code: string, me: LiveMe, host: boolean, settings: RoomSettings | null, readonly link: Transport, private now: () => number = () => Date.now()) {
    this.me = { ...me, key: uid(), ready: host, host, at: now() };
    this.settings = settings;
    link.onPeople(p => {
      this.people = p;
      // A newcomer needs to know the race: the host says it again whenever someone arrives.
      if (this.isHost && this.settings && !this.race) link.send({ t: 'room', settings: this.settings });
      this.changed();
    });
    link.onMessage(m => this.receive(m));
    link.track(this.me);
    if (host && settings) link.send({ t: 'room', settings });
  }

  get key() { return this.me.key; }
  get ready() { return this.me.ready; }
  /** The host: whoever opened the room, or the first person in once they've gone. */
  get isHost(): boolean {
    if (this.me.host) return true;
    const hosts = this.people.filter(p => p.host);
    return hosts.length === 0 && this.people[0]?.key === this.me.key;
  }
  /** Everyone's ready and there's someone to race: the host can start. */
  get canStart(): boolean { return this.isHost && !!this.settings && this.people.length >= 1 && this.people.every(p => p.ready || p.key === this.me.key); }

  subscribe(fn: () => void): () => void { this.fns.add(fn); return () => this.fns.delete(fn); }
  private changed() { for (const fn of this.fns) fn(); }

  setReady(ready: boolean) { this.me = { ...this.me, ready }; this.link.track(this.me); }

  setSettings(s: RoomSettings) {
    if (!this.isHost) return;
    this.settings = s;
    this.link.send({ t: 'room', settings: s });
    this.changed();
  }

  /** The host starts the race: the crew in the order they joined, a fresh seed, everyone at once. */
  start(seed = Math.floor(Math.random() * 1e9) + 1) {
    if (!this.canStart || !this.settings) return;
    const crew: CrewMember[] = this.people.map(p => ({ id: p.id, name: p.name, sail: p.sails[this.settings!.classId] ?? '', autoTrim: p.autoTrim }));
    const settings: RaceSettings = { ...this.settings, fleetSize: Math.max(this.settings.fleetSize, crew.length), crew, seed };
    const keys = this.people.map(p => p.key);
    this.link.send({ t: 'start', settings, keys });
    this.begin(settings, keys);
  }

  leave() {
    this.race?.leave();
    this.link.close();
    this.fns.clear();
  }

  private receive(m: LiveMsg) {
    if (m.t === 'room') { if (!this.isHost || !this.me.host) { this.settings = m.settings; this.changed(); } return; }
    if (m.t === 'start') { if (!this.race) this.begin(m.settings, m.keys); return; }
    this.race?.receive(m);
  }

  private begin(settings: RaceSettings, keys: string[]) {
    const seat = keys.indexOf(this.me.key);
    if (seat < 0) { this.note = 'The race started without you.'; this.changed(); return; }
    this.race = new LiveRace(this.link, settings, seat, keys, () => this.people, this.now);
    this.changed();
  }
}

// ───────────────────────── the race ─────────────────────────

/** A cheap fingerprint of the race at this step: every boat's position, heading and speed. */
export function raceHash(race: Race): string {
  let h = 2166136261 >>> 0;
  for (const b of race.boats) {
    const s = `${b.x},${b.y},${b.hdg},${b.spd},${b.legIndex};`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h.toString(36);
}

/**
 * This device's part in a live race: it stamps your helm a little ahead and sends it to the others,
 * feeds everyone's helm into the race as it arrives, and (as host) hands a boat to an AI skipper
 * when her person has gone. Drive it from the frame loop: input() before each step, afterStep()
 * after it, pump() once a frame.
 */
export class LiveRace {
  readonly race: Race;
  /** This device's helm reached the others up to this step. */
  private sent = 0;
  private fed = 0;
  private pend: { i: [number, number, number][]; a: [number, PlayerAct][] } = { i: [], a: [] };
  private last: [number, number] | null = null;
  private sentAt = 0;
  private heard: number[];
  private stalledSince: number | null = null;
  private asked = new Map<number, number>();
  private mine = new Map<number, string>();
  private theirs: [number, string][] = [];
  private lastCheck = -1;
  /** The races on two devices have come apart (shouldn't happen): shown, so it can be reported. */
  desync = false;
  /** Your boat was handed to an AI skipper (your connection dropped): you're watching now. */
  dropped = false;
  /** Seats whose person has left, and when. */
  left = new Map<number, number>();

  constructor(private link: Transport, settings: RaceSettings, readonly seat: number, readonly keys: string[], private people: () => LivePerson[], private now: () => number = () => Date.now()) {
    this.race = new Race({ ...settings, seat });
    this.heard = keys.map(() => this.now());
  }

  /** Before each step: your helm, for the step INPUT_DELAY ahead. */
  input(rudder: number, sheet: number) {
    if (this.dropped) return;
    const st = this.race.step_ + INPUT_DELAY;
    const q = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000;
    const r = q(rudder), s = q(Math.max(0, sheet));
    if (!this.last || this.last[0] !== r || this.last[1] !== s) { this.pend.i.push([Math.max(st, this.fed), r, s]); this.last = [r, s]; }
    this.feedSelf(st + 1);
  }

  /** You tack, gybe or hail: it happens INPUT_DELAY steps from now, on every device. */
  act(a: PlayerAct) {
    if (this.dropped) return;
    this.pend.a.push([Math.max(this.race.step_ + INPUT_DELAY, this.fed), a]);
  }

  /** After each step: the check against everyone else's race. */
  afterStep() {
    const st = this.race.step_;
    if (st % CHECK_EVERY === 0 && st !== this.lastCheck) {
      this.lastCheck = st;
      const h = raceHash(this.race);
      this.mine.set(st, h);
      if (this.mine.size > 20) this.mine.delete(this.mine.keys().next().value as number);
      this.theirs = this.theirs.filter(([s, x]) => { if (!this.mine.has(s)) return s > st; if (this.mine.get(s) !== x) this.desync = true; return false; });
    }
  }

  /** Once a frame: send your helm, and look after anyone holding the race up. */
  pump() {
    const t = this.now();
    if (!this.dropped && (this.fed - this.sent >= TICK || (this.fed > this.sent && t - this.sentAt > 120))) this.sendFrom(this.sent);
    // Who's holding the race up.
    const waiting = this.race.waitingFor().filter(k => k !== this.seat);
    if (waiting.length) this.stalledSince ??= t; else this.stalledSince = null;
    if (!this.isHost()) return;
    const here = new Set(this.people().map(p => p.key));
    for (const k of waiting) {
      const c = this.race.crew[k];
      if (!c || c.aiFrom !== Infinity) continue;
      const gone = !here.has(this.keys[k]) || this.left.has(k);
      if ((gone && t - this.heard[k] > 1500) || t - this.heard[k] > HANDOVER_MS) this.handOver(k);
    }
  }

  /** The names holding the race up, once it's been held a moment (for the screen). */
  waiting(): string[] {
    if (this.stalledSince === null || this.now() - this.stalledSince < 400) return [];
    return this.race.waitingFor().filter(k => k !== this.seat).map(k => this.race.boats[this.race.crew[k].boat].name);
  }

  /** You're leaving: say so, so the host hands your boat over straight away. */
  leave() { if (!this.dropped) this.link.send({ t: 'bye', s: this.seat }); }

  /** A message from the room. */
  receive(m: LiveMsg) {
    const race = this.race;
    if (m.t === 'in') {
      if (m.s === this.seat) return;
      this.heard[m.s] = this.now();
      const c = race.crew[m.s];
      if (!c) return;
      if (m.h) this.theirHash(m.h);
      if (m.f > c.upTo) {
        // A tick went missing: ask her device to send again from where we are.
        const lastAsk = this.asked.get(m.s) ?? 0;
        if (this.now() - lastAsk > 500) { this.asked.set(m.s, this.now()); this.link.send({ t: 'resend', s: m.s, from: c.upTo }); }
        return;
      }
      race.feed(m.s, m.u, m.i, m.a);
      return;
    }
    if (m.t === 'resend') { if (m.s === this.seat && !this.dropped) this.sendFrom(Math.max(0, m.from)); return; }
    if (m.t === 'gone') {
      const c = race.crew[m.s];
      if (!c || c.aiFrom !== Infinity) return;
      race.feed(m.s, m.at, m.i, m.a);
      race.handOver(m.s, m.at);
      this.left.set(m.s, m.at);
      if (m.s === this.seat) this.dropped = true;
      return;
    }
    if (m.t === 'bye') { this.left.set(m.s, this.race.step_); return; }
  }

  /** The host: the first person still in the room and still racing. */
  private isHost(): boolean {
    const here = new Set(this.people().map(p => p.key));
    for (let k = 0; k < this.keys.length; k++) {
      if (this.race.crew[k]?.aiFrom !== Infinity || this.left.has(k) || !here.has(this.keys[k])) continue;
      return k === this.seat;
    }
    return false;
  }

  /** Hand seat k's boat to an AI skipper from the first step she sent nothing for, on every device. */
  private handOver(k: number) {
    const c = this.race.crew[k];
    const at = c.upTo;
    const i = c.log.input.filter(e => e[0] < at).map(e => [e[0], e[1], e[2]] as [number, number, number]);
    const a = c.log.acts.filter(e => e[0] < at);
    this.link.send({ t: 'gone', s: k, at, i, a });
    this.race.handOver(k, at);
    this.left.set(k, at);
  }

  private feedSelf(upTo: number) {
    if (this.dropped || upTo <= this.fed) return;
    this.race.feed(this.seat, upTo, this.pend.i, this.pend.a);
    this.pend = { i: [], a: [] };
    this.fed = upTo;
  }

  private sendFrom(from: number) {
    const log = this.race.crew[this.seat]?.log;
    if (!log) return;
    const u = this.fed;
    const i = log.input.filter(e => e[0] >= from && e[0] < u).map(e => [e[0], e[1], e[2]] as [number, number, number]);
    const a = log.acts.filter(e => e[0] >= from && e[0] < u);
    const h = this.lastCheck >= 0 ? ([this.lastCheck, this.mine.get(this.lastCheck)!] as [number, string]) : undefined;
    this.link.send({ t: 'in', s: this.seat, f: from, u, i, a, ...(h ? { h } : {}) });
    if (from === this.sent) this.sent = u;
    this.sentAt = this.now();
  }

  private theirHash(h: [number, string]) {
    const [s, x] = h;
    if (this.mine.has(s)) { if (this.mine.get(s) !== x) this.desync = true; }
    else if (s > this.lastCheck && this.theirs.length < 50) this.theirs.push(h);
  }
}

// ───────────────────────── the club's open rooms ─────────────────────────

/**
 * The club's list of open races: rooms waiting to start show here (a presence channel per club), so
 * members can join without being sent the code.
 */
export class ClubRooms {
  rooms: OpenRoom[] = [];
  private ch: { track: (x: unknown) => unknown; untrack: () => unknown; presenceState: () => Record<string, unknown[]>; unsubscribe: () => unknown } | null = null;
  private fns = new Set<() => void>();
  private mine: OpenRoom | null = null;
  private closed = false;

  constructor(readonly clubId: string) {
    void import('@/utils/supabase').then(({ supabase }) => {
      if (this.closed) return;
      try {
        const ch = supabase.channel(`sim-lobby:${clubId}`, { config: { presence: { key: uid() } } });
        ch.on('presence', { event: 'sync' }, () => this.read())
          .subscribe(status => { if (status === 'SUBSCRIBED' && this.mine) void ch.track(this.mine); });
        this.ch = ch as unknown as ClubRooms['ch'];
      } catch { this.ch = null; }
    }).catch(() => { /* no realtime */ });
  }

  subscribe(fn: () => void): () => void { this.fns.add(fn); return () => this.fns.delete(fn); }

  /** Show your room in the list (null to take it off). */
  advertise(room: OpenRoom | null) {
    this.mine = room;
    try { if (room) void this.ch?.track(room); else void this.ch?.untrack(); } catch { /* ignore */ }
  }

  close() { this.closed = true; try { void this.ch?.unsubscribe(); } catch { /* ignore */ } this.ch = null; this.fns.clear(); }

  private read() {
    const out: OpenRoom[] = [];
    try {
      for (const list of Object.values(this.ch?.presenceState() ?? {})) for (const r of list as OpenRoom[]) if (r && r.code) out.push(r);
    } catch { /* ignore */ }
    const seen = new Set<string>();
    this.rooms = out.filter(r => (seen.has(r.code) ? false : (seen.add(r.code), true))).sort((a, b) => b.at - a.at);
    for (const fn of this.fns) fn();
  }
}
