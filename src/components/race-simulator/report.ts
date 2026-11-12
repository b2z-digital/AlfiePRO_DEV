// Alfie's report on an event of the Circuit, written when it ends: how it went, your races, where the
// lengths went (from the races you sailed), your rival, and what's next. Pure: it's kept with the
// season (career.reports) and shown at the end of the day and on the Circuit screen.
import { CAUSE_WORDS, type Cause, type Ledger } from './ledger';
import { causeLink } from './stats';
import type { StandingRow } from './series';
import { ME, TIER_NAME, castOf, eventWind, seasonOf, tierOf, type Career, type CareerEvent, type DayResult, type Medal, type Report } from './career';

const ORD = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`; };
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n: number) => WORDS[n] ?? String(n);
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;
const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} point${n === 1 ? '' : 's'}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const first = (name: string) => name.split(' ')[0];

/**
 * Alfie's report on the event that has just ended.
 * @param before the season as it was with the day complete (before it was closed)
 * @param after the season once the day was closed (next event, new season, ticket)
 * @param rows the day's final standings
 * @param result where you came
 */
export function regattaReport(before: Career, after: Career, rows: StandingRow[], result: DayResult, medal: Medal | null): Report {
  const event: CareerEvent = seasonOf(before)[result.event];
  const tier = tierOf(before);
  const mine = rows.find(r => r.userId === ME);
  const of = rows.length, rank = result.rank;
  const paras: string[] = [];
  const where = eventWind(event, 0)?.water;

  // How it went.
  const win = rows[0], second = rows[1], third = rows[2];
  let headline: string;
  if (rank === 1) {
    const by = second ? second.net - (mine?.net ?? 0) : 0;
    headline = event.kind === 'championship' ? `${event.name.replace('Championship', 'Champion')}` : `A win at ${event.name}`;
    paras.push(`You won ${event.name}${where ? ` at ${where}` : ''}${second ? (by === 0 ? `, on countback from ${second.name}` : ` by ${pts(by)} from ${second.name}`) : ''}. ${mine ? `${pts(mine.net)} net.` : ''}`.trim());
  } else {
    const toPodium = third && mine ? mine.net - third.net : 0;
    headline = medal ? `${medal.kind === 'silver' ? 'Silver' : 'Bronze'} at ${event.name}` : `${ORD(rank)} at ${event.name}`;
    paras.push(`${ORD(rank)} of ${of} at ${event.name}${where ? ` at ${where}` : ''}, ${mine ? pts(mine.net) : ''} net. ${win ? `${win.name} won it on ${win.net}` : ''}${rank > 3 && toPodium > 0 ? `; you were ${pts(toPodium)} off the podium` : ''}.`.replace(/\s+/g, ' ').trim());
  }

  // Your races: the ones you sailed, the best, the drop.
  const day = before.day;
  if (mine && day && !day.heat) {
    const sailed = day.races.map(r => r.sailed);
    const yours = mine.scores.map((s, k) => ({ s, k, sailed: sailed[k] !== false })).filter(x => x.s);
    const own = yours.filter(x => x.sailed);
    const label = (x: (typeof yours)[number]) => (x.s!.code ? x.s!.code : ORD(x.s!.place ?? 0));
    const best = [...own].filter(x => x.s!.place).sort((a, b) => a.s!.place! - b.s!.place!)[0];
    const drop = yours.find(x => x.s!.dropped);
    const simulated = yours.length - own.length;
    paras.push([
      `You sailed ${own.length === yours.length ? `all ${count(own.length)}` : `${count(own.length)} of the ${count(yours.length)}`} race${yours.length === 1 ? '' : 's'}: ${list(own.map(label))}.`,
      simulated ? `The other ${count(simulated)} ${simulated === 1 ? 'was' : 'were'} simulated from those.` : '',
      best && best.s!.place === 1 ? `Race ${best.k + 1} was a win.` : best ? `Your best was race ${best.k + 1}, ${ORD(best.s!.place!)}.` : '',
      drop ? `Race ${drop.k + 1} is your drop.` : '',
    ].filter(Boolean).join(' '));
  } else if (mine && day?.heat) {
    paras.push(`Sailed in heats: ${plural(day.heat.sails.filter(s => s.me).length, 'round')} sailed yourself, the rest simulated.`);
  }

  // Where the lengths went, from the races you sailed (their ledgers), and the start.
  const notes = day?.notes ?? [];
  let work: Report['work'];
  if (notes.length) {
    const sum = new Map<Cause, number>();
    let speedUp = 0, tacks = 0;
    const withLedger = notes.filter(n => n.parts?.length);
    for (const n of withLedger) {
      for (const p of n.parts!) sum.set(p.cause, (sum.get(p.cause) ?? 0) + p.lengths);
      speedUp += n.speedUp ?? 0; tacks += n.tacks ?? 0;
    }
    const ocs = notes.filter(n => n.ocs).length, pens = notes.reduce((a, n) => a + n.penalties, 0);
    const lates = notes.map(n => n.late).filter((x): x is number => x !== null);
    const late = lates.length ? lates.reduce((a, x) => a + x, 0) / lates.length : null;
    const lines: string[] = [];
    if (withLedger.length) {
      const [cause, total] = [...sum.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      if (cause && total / withLedger.length >= 1.5) {
        const each = total / withLedger.length;
        lines.push(`Most of what you gave away was ${CAUSE_WORDS[cause].name.toLowerCase()}: about ${each < 3 ? each.toFixed(1) : Math.round(each)} lengths a race. ${CAUSE_WORDS[cause].what}`);
        const led: Ledger = { total, parts: [...sum.entries()].map(([c, l]) => ({ cause: c, lengths: l })), worst: [], speedUp, tacks, tacksMade: 0, gybesMade: 0, marks: 0, minutes: 0 };
        const link = causeLink(cause, led);
        work = { cause, text: `${CAUSE_WORDS[cause].name}: ${link.label.replace(/^Practise: /, '')}`, link };
      }
    }
    if (ocs) lines.push(`You were over the line at ${plural(ocs, 'start')}.`);
    else if (late !== null && late > 3) lines.push(`You crossed the line about ${Math.round(late)} seconds after the gun on average: the front row goes at the gun.`);
    else if (late !== null && late <= 1.5) lines.push('Your starts were sharp: on the line at the gun.');
    if (pens) lines.push(`You took ${plural(pens, 'penalty turn')}.`);
    else if (!ocs) lines.push('Clean racing: no penalties.');
    if (lines.length) paras.push(lines.join(' '));
  }

  // Your rival, and your record together.
  const rid = after.rivalId;
  const rv = rid ? castOf(rid) : null;
  const rec = rid ? after.h2h?.[rid] : undefined;
  if (rv && rec) {
    const them = rows.findIndex(r => r.userId === rid) + 1;
    const n = first(rv.name);
    const record = rec.w === rec.l ? `level at ${rec.w}–${rec.l}` : rec.w > rec.l ? `${rec.w}–${rec.l} to you` : `${rec.l}–${rec.w} to ${n}`;
    if (them > 0) paras.push(`${rv.name} was ${ORD(them)}, ${them < rank ? `${plural(rank - them, 'place')} ahead of you` : `${plural(them - rank, 'place')} behind you`}. Your meetings stand ${record}.`);
  }

  // What's next.
  const nextEvents = seasonOf(after);
  if (after.season !== before.season) {
    const up = after.ticket && after.ticket !== before.ticket ? after.ticket : null;
    paras.push(up ? `That's the ${TIER_NAME[tier]} season done, and your finish puts you into the ${TIER_NAME[up]} season.` : `That's the season done. A new one begins${tier === 'club' ? '' : ' with the calendar redrawn'}.`);
  } else {
    const nx = nextEvents[Math.min(after.done.length, nextEvents.length - 1)];
    const w = eventWind(nx, 0);
    paras.push(`Next: ${nx.name}${w ? ` at ${w.water}, ${w.name.toLowerCase()} expected` : ''}.`);
  }

  return { season: before.season, tier, event: event.name, at: result.at, rank, of, headline, paras, work };
}
