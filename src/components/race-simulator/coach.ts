// The coach: reads the race the way a good skipper would and says one useful thing at a time,
// plus a "rule watch" on the boat that matters most right now. Also the numbers the HUD shows
// (start line bias, time to the line, point of sail, trim).
import type { Race } from '@/sim/engine';
import type { Boat } from '@/sim/types';
import { accelTau, bestSheet, lightEase, noGoAngle, overpowerEase, polarSpeed, vmgAngles } from '@/sim/classes';
import { bearing, dir, dist, n180, n360 } from '@/sim/math';
import { bankAhead, bow, hullGap, lineSide } from '@/sim/physics';
import { keepClear } from '@/sim/referee';
import { lineHit, timeToCover } from '@/sim/ai';
import { windwardBoat } from '@/sim/scene';
import { venueWindFor } from '@/sim/venue';

export type CoachMode = 'full' | 'hints' | 'off';

export interface Cue {
  topic: string; text: string; watch: string | null; tone: 'plain' | 'warn';
  /** The same advice as a coach would call it across the water: a few words, said aloud in Full coaching. */
  say?: string;
}

export interface LineInfo {
  favoured: 'pin' | 'starboard' | 'square';
  bias: number;            // degrees
  worth: number;           // hull lengths
  belowL: number;          // bow below the line, hull lengths (negative = over)
  ttl: number | null;      // seconds to the line at full speed
  to: { x: number; y: number } | null; // where she'd cross
}

export function lineInfo(race: Race, b: Boat | null): LineInfo {
  const c = race.course, L = c.L;
  const P = c.start.pin, S = c.start.stbd;
  const twd = race.wind.meanTwd(race.t);
  const sq = n360(bearing(P, S) - 90);
  const bias = n180(twd - sq); // + = starboard end favoured
  const len = dist(P, S);
  const worth = Math.abs(Math.sin((bias * Math.PI) / 180)) * len / L;
  const favoured = Math.abs(bias) < 1.5 ? 'square' : bias > 0 ? 'starboard' : 'pin';
  if (!b) return { favoured, bias: Math.abs(bias), worth, belowL: 0, ttl: null, to: null };
  const belowL = -lineSide(c, bow(b)) / L;
  // Time to the line: on her heading if it reaches the line between the ends at a sailable angle,
  // otherwise close-hauled on starboard.
  const up = vmgAngles(b.cls, b.tws).up + 1.5;
  const stbdCH = n360(b.twd - up);
  const hNow = lineHit(c, bow(b), b.hdg);
  const go = hNow && hNow.u > 0 && hNow.u < 1 && Math.abs(b.twa) >= up - 2 && lineSide(c, bow(b)) < 0 ? b.hdg : stbdCH;
  const gd = dir(go);
  const bowGo = { x: b.x + gd.x * b.cls.loa / 2, y: b.y + gd.y * b.cls.loa / 2 };
  const hit = lineHit(c, bowGo, go);
  if (!hit || lineSide(c, bowGo) > 0) return { favoured, bias: Math.abs(bias), worth, belowL, ttl: null, to: null };
  const goTwa = Math.abs(n180(b.twd - go));
  const turn = Math.abs(n180(go - b.hdg)) / Math.max(12, b.cls.maxRot * 0.6);
  const ttl = 0.5 * turn + timeToCover(hit.d, b.spd, polarSpeed(b.cls, b.tws, goTwa), accelTau(b.tws));
  const to = { x: bowGo.x + gd.x * hit.d, y: bowGo.y + gd.y * hit.d };
  return { favoured, bias: Math.abs(bias), worth, belowL, ttl, to };
}

export function pointOfSail(b: Boat): string {
  const a = Math.abs(b.twa);
  const up = vmgAngles(b.cls, b.tws).up;
  if (a < noGoAngle(b.tws)) return 'In irons';
  if (a < up - 4) return 'Pinching';
  if (a < up + 7) return 'Close-hauled';
  if (a < 70) return 'Close reach';
  if (a < 110) return 'Beam reach';
  if (a < 150) return 'Broad reach';
  return 'Running';
}

/** After the finish your boat sails herself clear: what the boat strip says then. */
export const SAILING_CLEAR = 'Finished · keeping clear of the boats still racing';

/**
 * The trim line under your boat. Upwind, radio sailors sail with the sail right in: ease only a touch
 * in very light air, or when a gust lays her over (then sheet back in as it passes).
 */
export function trimAdvice(b: Boat): string {
  const a = Math.abs(b.twa);
  if (b.dive > 0.85) return 'Nose-diving: steer out of it';
  if (b.dive > 0.35) return 'Bow going down: weave her gently';
  if (a < noGoAngle(b.tws)) return 'Bear away to fill the sail';
  if (a < vmgAngles(b.cls, b.tws).up - 4) return 'Bear away a touch: she’s slowing';
  const upwind = a <= 55;
  const gust = overpowerEase(b.heel);
  const e = b.sheet - (bestSheet(a, b.tws) - gust);
  if (e > 0.06 && gust > 0.03) return 'Overpowered: ease a touch through the gust';
  if (e > 0.05 && upwind && lightEase(b.tws) > 0.02) return 'Very light: ease a touch for power';
  if (e > 0.09) return 'Trim: ease the sail a touch';
  if (e < -0.09) return upwind ? 'Upwind: sheet right in' : 'Trim: sheet in a touch';
  return 'Trim: good';
}

/** A call across the water: what Alfie says aloud. `urgent` ones are said at once, over anything else. */
export interface Call { key: string; say: string; urgent?: boolean; again?: number }

/**
 * Boat-handling calls, as a coach standing next to you would make them, the moment they're needed:
 * she's nose-diving, in irons, pinching, overpowered, or the sails are wrong for the course. Only
 * once you've started (before the gun you're luffing and easing on purpose), and trim calls only
 * when you're trimming yourself.
 */
export function handlingCall(p: Boat, autoTrim: boolean): Call | null {
  if (!p.started || p.finished || p.disabled) return null;
  if (p.dive > 0.85) return { key: 'dive-hard', say: 'Nose-diving! Steer out of it.', urgent: true, again: 6 };
  if (p.dive > 0.35) return { key: 'dive', say: "Bow's going down. Weave her gently, side to side.", again: 9 };
  if (p.penalty.active) return null; // turning for a penalty: every point of sail goes by
  const a = Math.abs(p.twa);
  if (a < noGoAngle(p.tws)) return { key: 'irons', say: "You're in irons. Bear away to fill the sails.", again: 7 };
  if (a < vmgAngles(p.cls, p.tws).up - 4) return { key: 'pinch', say: 'Pinching. Bear away a touch.', again: 9 };
  if (autoTrim) return null;
  const upwind = a <= 55;
  const gust = overpowerEase(p.heel);
  const e = p.sheet - (bestSheet(a, p.tws) - gust);
  if (e > 0.06 && gust > 0.03) return { key: 'gust', say: 'Overpowered. Ease through the gust.', again: 9 };
  if (e > 0.11) return { key: 'ease', say: upwind ? 'Ease a touch.' : 'Ease the sails.', again: 9 };
  if (e < -0.11) return { key: 'sheet', say: upwind ? 'Sheet right in.' : 'Sheet in a touch.', again: 9 };
  return null;
}

const URGENT = /^(Go now|You're over|You were over|Take your penalty|Not finished)/;
const RARELY = /^(Lifted|The line|The (pin|starboard) end|Leave it|Take the)/;

/** A coaching line as a call: the same words count as the same call, whatever numbers are in them. */
export function cueCall(c: Cue | null): Call | null {
  if (!c?.say) return null;
  return { key: c.say.replace(/\d+/g, '#'), say: c.say, urgent: URGENT.test(c.say), again: RARELY.test(c.say) ? 45 : URGENT.test(c.say) ? 7 : 14 };
}

/**
 * When Alfie speaks. A coach who never stops talking is worse than none, so:
 * - a call has to still be true a second after it came up (urgent ones are said at once);
 * - there's a gap after every call (shorter before an urgent one);
 * - the same call isn't repeated until it has had time to sink in;
 * - and he doesn't talk over a hail or the start sequence's own calls unless it's urgent.
 * `now` is real seconds. Returns the words to say now, or null.
 */
export class CoachVoice {
  private said = new Map<string, number>();
  private pending: { key: string; since: number } | null = null;
  private lastAt = -99;

  pick(now: number, call: Call | null, busy: boolean): string | null {
    if (!call) { this.pending = null; return null; }
    if (!this.pending || this.pending.key !== call.key) this.pending = { key: call.key, since: now };
    if (!call.urgent && now - this.pending.since < 1) return null;
    if (busy && !call.urgent) return null;
    if (now - this.lastAt < (call.urgent ? 1.2 : 3.5)) return null;
    const before = this.said.get(call.key);
    if (before !== undefined && now - before < (call.again ?? 14)) return null;
    this.said.set(call.key, now);
    this.lastAt = now;
    return call.say;
  }
}

/** Running mean of the wind the player sees, for lifts and headers. */
export class WindMemory {
  mean = 0; init = false;
  samples: { t: number; twd: number }[] = [];
  update(t: number, twd: number) {
    if (!this.init) { this.mean = twd; this.init = true; }
    this.mean = n360(this.mean + n180(twd - this.mean) * 0.012);
    const last = this.samples[this.samples.length - 1];
    if (!last || t - last.t >= 1) {
      this.samples.push({ t, twd });
      if (this.samples.length > 121) this.samples.shift();
    }
  }
  /** Degrees the wind swung in the last `secs` (+ = right, clockwise). */
  swing(secs: number): number {
    const n = this.samples.length;
    if (n < 3) return 0;
    const now = this.samples[n - 1];
    const then = this.samples.find(s => s.t >= now.t - secs) ?? this.samples[0];
    return n180(now.twd - then.twd);
  }
}

const tackName = (b: Boat) => (b.tack === 'stbd' ? 'starboard' : 'port');

/** The boat that matters most to the player right now, and what the rules say about it. */
export function ruleWatch(race: Race, p: Boat): string | null {
  const L = p.cls.loa;
  let best: Boat | null = null, bestG = 3.5 * L, bestJ = -1;
  race.boats.forEach((o, j) => {
    if (o === p || o.finished || o.retired) return;
    const g = hullGap(p, o);
    if (g < bestG) { best = o; bestG = g; bestJ = j; }
  });
  const pi = race.boats.indexOf(p);
  // Rule 20: a boat has hailed us for room to tack, or we're running out of water at the bank.
  const r2t = race.referee.pendingRoomToTack(pi);
  if (r2t) return `${race.boats[r2t.from].sail} hailed "Room to tack". Tack as soon as you can (T), or reply "You tack" (H) and then give her room to tack and keep clear (Rule 20.2).`;
  const upA = vmgAngles(p.cls, p.tws).up;
  if (p.started && Math.abs(p.twa) <= upA + 12 && bankAhead(p, race.course) < 3.5 * L) {
    const w = windwardBoat(race, p, 2.2 * L);
    if (w) return `You're running out of water at the bank with ${w.sail} to windward. Hail "Room to tack" (H): she must tack or reply "You tack" (Rule 20.1).`;
  }
  if (!best) return null;
  const o = best as Boat;
  if (o.disabled) return `${o.sail} is out of control. Steer well clear of her: if possible you must avoid a disabled boat, whatever the right of way (Rule 22).`;
  if (race.referee.restricted17(pi, bestJ)) return `You overlapped ${o.sail} to leeward from clear astern, within two lengths: you have right of way, but you may not luff above your proper course (Rule 17).`;
  const mr = race.referee.markRoom(pi, bestJ);
  if (mr?.iEntitled) return `You're inside ${o.sail} at the zone, so she must give you mark-room (Rule 18.2). Take only the room you need to round.`;
  if (mr?.iOwes) return `${o.sail} is inside you at the zone: give her room to round the mark (Rule 18.2), even if you have right of way.`;
  const kc = keepClear(p, o, race.t);
  const pre = race.t < race.gunT;
  if (kc.keeper === 0) {
    switch (kc.rule) {
      case '10': return `You're on port: ${o.sail} on starboard has right of way (Rule 10). Duck behind her, or tack away in good time.`;
      case '11': return `${o.sail} is overlapped to leeward, so she has right of way (Rule 11)${pre ? ' and can luff you before the start' : ''}. Keep clear.`;
      case '12': return `You're clear astern of ${o.sail}: keep clear of her (Rule 12).`;
      case '13': return `You're tacking: until you're close-hauled you must keep clear of everyone (Rule 13).`;
      case '21': return p.ocs ? `You're returning to start: keep clear of every boat that isn't (Rule 21).` : `You're taking a penalty: keep clear of everyone while you turn (Rule 21).`;
      default: return `Keep clear of ${o.sail} (Rule ${kc.rule}).`;
    }
  }
  if (kc.keeper === 1) {
    switch (kc.rule) {
      case '10': return `You're on starboard: ${o.sail} on port must keep clear (Rule 10). Hold your course; if you change it, leave her room to keep clear (Rule 16.1).`;
      case '11': return `You're to leeward of ${o.sail}, so she must keep clear (Rule 11). If you luff, do it slowly enough for her to respond (Rule 16.1).`;
      case '12': return `${o.sail} is clear astern of you, so she must keep clear (Rule 12).`;
      case '13': return `${o.sail} is tacking, so she must keep clear of you (Rule 13).`;
      case '21': return `${o.sail} is ${o.ocs ? 'returning to start' : 'taking a penalty'}, so she must keep clear of you (Rule 21).`;
      default: return null;
    }
  }
  return null;
}

/**
 * What the club knows about today's wind on its own water, for the opening of the sequence: the
 * club's note on this wind, and which side of the beat it makes pay. Null on the practice pond, or
 * in a wind the club has said nothing about.
 */
export function localKnowledge(race: Race): { text: string; say?: string } | null {
  const v = race.venue;
  if (!v) return null;
  const w = venueWindFor(v.def, race.course.rot);
  if (!w || (!w.note && !w.pays)) return null;
  let side = '', say: string | undefined;
  // The bank the skippers stand on is to one side of the course, looking upwind (the same test the
  // wind itself uses: with the bank dead up or down the course, neither side is the bank side).
  const bankX = (v.control[0].x + v.control[1].x) / 2;
  if (w.pays && Math.abs(bankX) > 0.25 * race.course.bounds.across) {
    const bankRight = bankX > 0;
    const pays = (w.pays === 'bank') === bankRight ? 'right' : 'left';
    side = w.pays === 'bank' ? ` There's more breeze along your bank, so the ${pays} of the beat should pay.` : ` There's more breeze out from your bank, so the ${pays} of the beat should pay.`;
    say = `Local knowledge: the ${pays} side should pay.`;
  }
  return { text: `${w.name[0].toUpperCase()}${w.name.slice(1)} here: ${w.note ?? ''}${side}`.replace(/\s+/g, ' ').trim(), say };
}

/** One coaching line for this moment. */
export function coachCue(race: Race, p: Boat, mem: WindMemory, li: LineInfo): Cue {
  const c = race.course, L = p.cls.loa;
  const T = race.gunT - race.t;
  const watch = ruleWatch(race, p);
  const cue = (topic: string, text: string, tone: Cue['tone'] = 'plain', say?: string): Cue => ({ topic, text, watch, tone, say });

  // ── Before the gun ──
  if (T > 0) {
    if (li.belowL < 0 && T > 2.5) return cue('The start', `You're over the line with ${Math.ceil(T)} s to go. Bear away and dip back below it now.`, 'warn', "You're over the line. Dip back below it.");
    // As the sequence opens at a real venue: what the club knows about this wind on its water.
    const local = race.t < 9 && T > 30 ? localKnowledge(race) : null;
    if (local) return cue('This water', local.text, 'plain', local.say);
    if (T > 40) {
      const end = li.favoured === 'pin' ? 'pin' : 'starboard';
      return li.favoured === 'square'
        ? cue('The start', 'The line is square to the wind, so start where you can get clear air and a gap to leeward.', 'plain', 'The line is square. The starboard end gives you clear wind, if you can win it.')
        : cue('The start', `The ${end} end is favoured by ${Math.round(li.bias)}°, worth about ${li.worth.toFixed(1)} lengths. Plan to start near it, with a gap to leeward.`, 'plain', `The ${end} end is favoured. Set up near it, with a gap to leeward.`);
    }
    if (p.tack === 'port' && T > 15) return cue('The start', 'Get onto starboard for the last 20 seconds: port boats have to keep clear of everyone on starboard (Rule 10).', 'plain', 'Get onto starboard for the start.');
    if (li.ttl === null) return cue('The start', 'Get below the line on starboard and find your spot, about one to two lengths back.', 'plain', 'Get below the line on starboard and find your spot.');
    const early = T - li.ttl;
    if (T > 15 && early > 6) return cue('The start', `You're ${li.belowL.toFixed(1)} lengths back, ${li.ttl.toFixed(1)} s from the line at full speed. Hold your spot: luff and ease to stay slow.`, 'plain', 'Hold your spot. Luff and ease to stay slow.');
    if (early > 2.5) return cue('The start', `Burn ${Math.round(early - 0.8)} seconds, then pull the trigger at 0:${String(Math.max(1, Math.round(li.ttl + 0.4))).padStart(2, '0')}: bear away to close-hauled and sheet in. You'll cross at full speed just after the gun.`, 'plain', `Hold. Go in ${Math.max(1, Math.round(early - 0.8))}.`);
    if (early > 0.7) return cue('The start', `Nearly: pull the trigger at 0:${String(Math.max(1, Math.round(li.ttl))).padStart(2, '0')}. Bear away and sheet in.`, 'plain', 'Get ready.');
    if (early >= -0.8) return cue('The start', 'Go now: bear away to close-hauled and sheet in hard.', 'plain', 'Go now! Bear away and sheet in.');
    return cue('The start', `You're ${(-early).toFixed(1)} s late. Foot off a few degrees and sheet in to build speed.`, 'warn', "You're late. Foot off and sheet in.");
  }

  // ── After the gun, not started ──
  if (!p.started) {
    if (p.ocs && !p.returning) return cue('The start', 'Recall: you were over at the gun. Bear away, dip right back below the line, then start again. Keep clear of everyone while you return (Rule 21).', 'warn', 'You were over. Go back below the line and start again.');
    return cue('The start', 'Cross the line between the pin and the start mark to start.');
  }
  if (p.finished) return cue('Finish', 'Finished. Your boat sails clear of the line, out of the way of boats still racing. Watch the rest come in.');

  // ── Penalty owed ──
  const finishing = c.legs[p.legIndex]?.kind === 'finish';
  if (p.penalty.owed > 0 && finishing) return cue('Rules', `You can't finish with a penalty outstanding. Take your One-Turn Penalty now (one tack and one gybe), ${p.reFinish ? 'get your hull right back behind the line' : 'clear of other boats'}, then finish (Rule 44.2).`, 'warn', 'Take your penalty turn before you finish.');
  if (p.reFinish) return cue('Finish', 'Penalty done. Get your whole hull back behind the finishing line, then cross it to finish (Rule 44.2).', 'warn', 'Get right back behind the line, then finish.');
  if (p.penalty.owed > 0) return cue('Rules', `You owe a One-Turn Penalty: get clear of other boats, then turn right round the same way, through one tack and one gybe.`, 'warn', 'You owe a penalty turn. Get clear, then one tack and one gybe.');

  const leg = c.legs[p.legIndex];
  if (!leg) return cue('Racing', '');
  const upwind = leg.upwind;
  const markId = leg.kind === 'mark' ? leg.rounding.markId : null;
  const M = markId ? c.byId[markId] : null;

  // ── Rounding ──
  if (M && dist(M.p, p) < 4.5 * L) {
    const side = leg.kind === 'mark' ? leg.rounding.side : 'port';
    return cue('Rounding', `${M.name[0].toUpperCase()}${M.name.slice(1)} is left to ${side}. Wide in, tight out: start your turn early and finish it close to the mark.`, 'plain', `Leave it to ${side}. Wide in, tight out.`);
  }
  if (leg.kind === 'gate') {
    const a = c.byId[leg.options[0].markId], bm = c.byId[leg.options[1].markId];
    const da = dist(a.p, p), db = dist(bm.p, p);
    if (Math.min(da, db) < 14 * L) {
      const busy = (m: { p: { x: number; y: number } }) => race.boats.filter(o => o !== p && !o.finished && dist(o, m.p) < 4 * L).length;
      const pick = da + busy(a) * 1.5 * L <= db + busy(bm) * 1.5 * L ? 'right-hand' : 'left-hand';
      return cue('Downwind', `Pick your gate mark: the ${pick} one is closer or less crowded. Either counts; round it wide in, tight out.`, 'plain', `Take the ${pick} gate mark.`);
    }
  }

  // ── Upwind ──
  if (upwind) {
    const target = M ? M.p : { x: (c.finish.pin.x + c.finish.stbd.x) / 2, y: (c.finish.pin.y + c.finish.stbd.y) / 2 };
    const shift = n180(p.twd - mem.mean);
    const lifted = p.tack === 'stbd' ? shift : -shift;
    if (p.shadow > 0.12) return cue('Upwind', `You're in dirty air (${Math.round(p.shadow * 100)}% less wind). Tack, or bear off a little to get clear air.`, 'plain', 'Dirty air. Tack, or foot off for clear wind.');
    // Trim upwind: right in, except in a gust that lays her over, in very light air, and through a
    // tack in a strong breeze.
    const kn = p.tws / 0.514444;
    if (race.t - p.lastHtwT < 8 && kn >= 14 && Math.abs(p.heel) > 30 && p.spd < 0.65 * p.targetSpd) return cue('Upwind', 'In this breeze, ease the sail a touch as you tack, let her build speed on the new tack, then sheet right in again.', 'plain', 'Ease a touch through the tack, then sheet in.');
    if (overpowerEase(p.heel) > 0.04 && p.sheet > bestSheet(Math.abs(p.twa), p.tws) - 0.03) return cue('Upwind', 'Overpowered in this gust: ease the sail a touch so she stands up and drives, then sheet right in again as it passes.', 'plain', 'Overpowered. Ease through the gust.');
    if (lightEase(p.tws) > 0.03 && p.sheet > 0.99) return cue('Upwind', "It's very light: ease the sail a touch off fully in for more power, and steer gently so she keeps moving.", 'plain', 'Very light. Ease a touch for power.');
    const up = vmgAngles(p.cls, p.tws).up + 1.5;
    const brg = bearing(p, target);
    const other = p.tack === 'stbd' ? n360(p.twd + up) : n360(p.twd - up);
    const fetchOther = p.tack === 'stbd' ? n180(brg - other) >= 0 : n180(other - brg) >= 0;
    const d = dist(p, target);
    if (fetchOther && d > 3 * L) return cue('Upwind', `You're on the ${p.tack === 'stbd' ? 'port' : 'starboard'}-tack layline for ${M ? M.name : 'the finish'}. Tack now so you don't overstand.`, 'plain', 'Layline. Tack now.');
    if (M && M.kind === 'windward' && p.tack === 'port' && d < 8 * L) return cue('Upwind', `${M.name[0].toUpperCase()}${M.name.slice(1)} is left to port: get onto the starboard layline before the zone. Tacking inside it puts you under Rule 18.3.`, 'plain', 'Get onto the starboard layline before the zone.');
    if (-lifted > 5) return cue('Upwind', `You're headed ${Math.round(-lifted)}° on ${tackName(p)}. Tack and you'll be on the lifted tack, pointing closer to ${M ? M.name : 'the finish'}.`, 'plain', 'Headed. Tack now.');
    if (lifted > 5) return cue('Upwind', `You're lifted ${Math.round(lifted)}° on ${tackName(p)}. Stay on this tack while it lasts.`, 'plain', 'Lifted. Hold this tack.');
    if (!M) return cue('Finish', `The finish is upwind on the start line: the ${li.favoured === 'pin' ? 'pin' : li.favoured === 'starboard' ? 'starboard' : 'nearer'} end is closer.`);
    return cue('Upwind', 'Sail close-hauled and keep the boat moving. Watch the wind graph: tack when you\'re headed more than 5°.');
  }

  // ── Downwind ──
  if (p.dive > 0.3) return cue('Downwind', "She's pressed, and her bow is going down. Keep her moving in a gentle weave from side to side, and sheet in a little to show the wind less sail. Left to run straight she'll bury her bow, lift her rudder out and broach.", 'warn');
  const target = M ? M.p : leg.kind === 'gate' ? { x: (c.byId[leg.options[0].markId].p.x + c.byId[leg.options[1].markId].p.x) / 2, y: (c.byId[leg.options[0].markId].p.y + c.byId[leg.options[1].markId].p.y) / 2 } : p;
  const dn = vmgAngles(p.cls, p.tws).down;
  const brg = bearing(p, target);
  const cur = p.tack === 'stbd' ? n360(p.twd - dn) : n360(p.twd + dn);
  const oth = p.tack === 'stbd' ? n360(p.twd + dn) : n360(p.twd - dn);
  const dCur = Math.abs(n180(cur - brg)), dOth = Math.abs(n180(oth - brg));
  if (dOth + 12 < dCur && dist(p, target) > 4 * L) return cue('Downwind', `Gybe: the other gybe points ${Math.round(dCur - dOth)}° closer to ${M ? M.name : 'the gate'}.`, 'plain', 'Gybe now. The other gybe is closer.');
  return cue('Downwind', 'Sail deep and fast, and gybe on the big shifts. Look upwind for the dark patches of pressure coming down.');
}
