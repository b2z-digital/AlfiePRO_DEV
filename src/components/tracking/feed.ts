// The race feed: what happened, newest first, in words, from the analysis.
import type { RaceAnalysis, TrackedBoat, TrackedCourse } from './core/analyse';
import { rt } from './format';

export interface FeedItem { t: number; tone: 'mark' | 'warn' | 'bad' | 'info' | 'good'; text: string }

export function feedFrom(a: RaceAnalysis, boats: TrackedBoat[], course: TrackedCourse, upTo: number): FeedItem[] {
  const sail = (id: string) => boats.find(b => b.id === id)?.sail ?? '?';
  const gun = a.gun;
  const out: FeedItem[] = [];
  if (gun != null && upTo >= gun) {
    const over = a.starts.filter(s => s.call === 'over').map(s => sail(s.boatId));
    const close = a.starts.filter(s => s.call === 'close').map(s => sail(s.boatId));
    const parts = ['Gun.'];
    if (over.length) parts.push(`Over: ${over.join(', ')}.`);
    if (close.length) parts.push(`Too close to call: ${close.join(', ')}.`);
    if (!over.length && !close.length) parts.push('Clean start.');
    out.push({ t: gun, tone: over.length ? 'bad' : close.length ? 'warn' : 'info', text: parts.join(' ') });
  }
  // The first boat round each waypoint, and the last.
  const byWp: Record<number, typeof a.roundings> = {};
  for (const r of a.roundings) if (r.t <= upTo) (byWp[r.wp] ||= []).push(r);
  for (const [wp, rs] of Object.entries(byWp)) {
    rs.sort((x, y) => x.t - y.t);
    const name = course.waypoints[Number(wp)]?.name ?? 'the mark';
    const second = rs[1];
    out.push({ t: rs[0].t, tone: 'mark', text: `${sail(rs[0].boatId)} first round ${name.replace(/^Mark /, 'mark ')}${second ? `, ${(second.t - rs[0].t).toFixed(1)} s clear of ${sail(second.boatId)}` : ''}` });
    if (rs.length === boats.length && rs.length > 1) out.push({ t: rs[rs.length - 1].t, tone: 'info', text: `${sail(rs[rs.length - 1].boatId)} rounds ${name.replace(/^Mark /, 'mark ')}, the last boat round` });
  }
  for (const r of a.roundings) if (r.wrongSide && r.t <= upTo) out.push({ t: r.t, tone: 'bad', text: `${sail(r.boatId)} left ${r.markId} on the wrong side` });
  for (const m of a.missed) if (m.t <= upTo) out.push({ t: m.t, tone: 'bad', text: `${sail(m.boatId)} hasn't rounded ${course.waypoints[m.wp]?.name ?? 'a mark'}` });
  for (const e of a.encounters) {
    if (e.t > upTo || (gun != null && e.t < gun)) continue;
    if (!e.contact) continue;
    out.push({ t: e.t, tone: 'warn', text: `Possible contact: ${sail(e.a)} and ${sail(e.b)}, hulls within ${Math.max(1, Math.round(e.closest * 100))} cm` });
  }
  for (const tn of a.turns) {
    if (tn.t > upTo) continue;
    const e = tn.encounter != null ? a.encounters[tn.encounter] : null;
    const other = e ? sail(e.a === tn.boatId ? e.b : e.a) : null;
    out.push({ t: tn.t, tone: 'info', text: `${sail(tn.boatId)} spun a penalty turn${e && gun != null ? `, after the ${rt(e.t - gun)} encounter with ${other}` : ''}` });
  }
  const fins = a.finishes.filter(f => f.t <= upTo);
  fins.forEach((f, i) => {
    out.push({ t: f.t, tone: i === 0 ? 'good' : 'info', text: i === 0 ? `${sail(f.boatId)} wins` : `${sail(f.boatId)} finishes ${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'}${f.tooClose.length ? ' (too close to call)' : ''}` });
  });
  for (const al of a.alerts) out.push({ t: a.now, tone: 'bad', text: al.kind === 'lost' ? `Lost ${sail(al.boatId)}'s tag` : `${sail(al.boatId)} has stopped` });
  return out.sort((x, y) => y.t - x.t);
}
