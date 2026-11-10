// Live race (and the same layout for a replay's moment): the leaderboard by distance to go, the map,
// the boat you're following, the battle for the lead and the race feed.
import { useMemo, useState } from 'react';
import { standingsAt, stateAt, windFromFleet, type Standing } from './core/analyse';
import { compass, gapText, kn, rt } from './format';
import { feedFrom } from './feed';
import TrackMap, { type Orient } from './TrackMap';
import { useAnalysis, type TrackedRace } from './source';
import { Btn, C, Cap, Chip, Seg, cx } from '../race-simulator/ui';

const TONE: Record<string, string> = { mark: '#FF9F43', warn: '#FFB224', bad: '#F87171', info: '#D5C2FF', good: '#34D399' };

export default function LiveView({ race, onTv, onStart, onOfficer }: { race: TrackedRace; onTv?: () => void; onStart?: () => void; onOfficer?: () => void }) {
  const [orient, setOrient] = useState<Orient>('wind');
  const [follow, setFollow] = useState<string | null>(null);
  const [back, setBack] = useState(0);
  const [speed, setSpeed] = useState(1);
  const t = race.now - back;
  const { a, standings } = useAnalysis(race, race.live ? undefined : race.t1);
  const st = useMemo(() => (a && race.course ? standingsAt(race.boats, race.course, a, Math.min(t, a.now)) : standings), [a, race, t, standings]);
  // Slower things are worked out on coarser steps: the order a minute ago every 2 s, the wind every 10 s.
  const t2 = Math.floor(t / 2) * 2, t10 = Math.floor(t / 10) * 10;
  const minuteAgo = useMemo(() => (a && race.course ? standingsAt(race.boats, race.course, a, Math.max(race.t0, Math.min(t2, a.now) - 60)) : []), [a, race, t2]);
  const wind = useMemo(() => (a && race.course ? windFromFleet(race.boats, race.course, a, Math.min(t10, a.now)) : null), [a, race, t10]);
  const windAgo = useMemo(() => (a && race.course ? windFromFleet(race.boats, race.course, a, Math.min(t10, a.now) - 60) : null), [a, race, t10]);

  if (race.status !== 'ready' || !race.course) {
    return <div className="p-8 text-[14px]" style={{ color: C.mute }}>{race.status === 'error' ? race.error : 'Loading the race…'}</div>;
  }
  const boat = (id: string) => race.boats.find(b => b.id === id)!;
  const gun = race.gun;
  const clock = gun != null ? t - gun : null;
  const lead = st[0];
  const pick = follow ?? lead?.boatId ?? null;
  const me = st.find(s => s.boatId === pick) ?? null;
  const feed = a ? feedFrom(a, race.boats, race.course, t).slice(0, 8) : [];
  const legsTotal = race.course.waypoints.length + 1;
  const second = st[1];
  const battleNow = second && !second.finished ? second.gapM : null;
  const battleThen = (() => {
    if (!second || !a || !race.course) return null;
    const then = standingsAt(race.boats, race.course, a, Math.min(t, a.now) - 30);
    const p1 = then.find(x => x.boatId === lead.boatId), p2 = then.find(x => x.boatId === second.boatId);
    return p1 && p2 ? p1.progress - p2.progress : null;
  })();
  const placeAgo = (s: Standing) => minuteAgo.find(x => x.boatId === s.boatId)?.place ?? s.place;
  const stNow = pick ? stateAt(boat(pick), t) : null;
  const shift = wind != null && windAgo != null ? ((wind - windAgo + 540) % 360) - 180 : null;
  const events = a ? [
    ...(gun != null ? [{ t: gun, c: '#F1F4FA', k: 'Gun' }] : []),
    ...a.encounters.filter(e => e.contact && (gun == null || e.t >= gun)).map(e => ({ t: e.t, c: '#FFB224', k: 'Possible contact' })),
    ...Object.values(a.roundings.reduce<Record<number, number>>((o, r) => { o[r.wp] = Math.min(o[r.wp] ?? Infinity, r.t); return o; }, {})).map(tt => ({ t: tt, c: '#FF9F43', k: 'Rounding' })),
  ] : [];
  const span = Math.max(1, race.now - (gun ?? race.t0));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[22px] font-bold tracking-[-0.01em]">{race.name}</h2>
          <p className="m-0 text-[13px]" style={{ color: C.mute }}>
            {lead && !lead.finished && lead.leg > 0 ? `Leader on leg ${lead.leg} of ${legsTotal} · ${lead.nextName}` : lead?.finished ? 'Finished' : 'Before the start'} · {race.boats.length} boats
          </p>
        </div>
        {race.live ? (
          <span className="inline-flex h-[28px] items-center gap-2 rounded-full bg-[#E11D38] px-3 text-[12px] font-bold tracking-[0.08em] text-white"><span className="h-[7px] w-[7px] rounded-full bg-white" aria-hidden="true" />LIVE</span>
        ) : <Chip>Replay</Chip>}
        {clock != null && <span className="font-mono text-[28px] font-semibold tabular-nums tracking-[-0.02em]" aria-label="Race time">{rt(clock)}</span>}
        {race.demo && race.live && (
          <Seg size="sm" label="Demo speed" value={speed} onChange={v => { setSpeed(v); race.setSpeed?.(v); }} options={[{ value: 1, label: '1×' }, { value: 3, label: '3×' }, { value: 10, label: '10×' }]} />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Seg label="Map view" value={orient} onChange={setOrient} options={[{ value: 'wind', label: 'Wind up' }, { value: 'north', label: 'North up' }, ...(race.venue ? [{ value: 'bank' as Orient, label: 'From the bank' }] : [])]} />
          {onStart && gun != null && <Btn onClick={onStart}>The start</Btn>}
          {onOfficer && <Btn onClick={onOfficer}>Race officer</Btn>}
          {onTv && <Btn onClick={onTv}>Club TV</Btn>}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <section aria-labelledby="lb-h" className="min-w-0 max-w-[420px] flex-[1_1_320px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] px-3 pb-2 pt-3">
          <div className="flex items-center gap-2 px-1 pb-2">
            <h3 id="lb-h" className="m-0 text-[15px] font-bold">Leaderboard</h3>
            <span className="ml-auto text-[12px]" style={{ color: C.mute }}>by distance to go</span>
          </div>
          <div aria-hidden="true" className="grid grid-cols-[24px_minmax(0,1fr)_70px_40px_40px] gap-2 px-1.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: C.faint }}>
            <span /><span>Boat</span><span className="text-right">Behind</span><span className="text-right">VMG</span><span className="whitespace-nowrap text-right">1 min</span>
          </div>
          <ol className="m-0 list-none p-0">
            {st.map(s => {
              const b = boat(s.boatId);
              const g = gapText(s);
              const d = placeAgo(s) - s.place;
              return (
                <li key={s.boatId}>
                  <button type="button" onClick={() => setFollow(f => (f === s.boatId ? null : s.boatId))} aria-pressed={pick === s.boatId}
                    className={cx('grid w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_70px_40px_40px] items-center gap-2 rounded-[10px] border-0 border-t border-white/[0.05] px-1.5 py-[7px] text-left text-[#F1F4FA]', pick === s.boatId ? 'bg-white/[0.08]' : 'bg-transparent hover:bg-white/[0.04]')}>
                    <span className="text-center font-display text-[16px] font-bold">{s.place}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true" className="h-[30px] w-1 shrink-0 rounded-sm" style={{ background: b.color }} />
                      <span className="min-w-0"><span className="block font-bold">{b.sail}</span><span className="block truncate text-[12px]" style={{ color: C.mute }}>{b.name}</span></span>
                    </span>
                    <span className="text-right"><span className="block font-mono text-[13px] font-semibold">{g.s}</span><span className="block text-[11.5px]" style={{ color: C.faint }}>{g.m}</span></span>
                    <span className="text-right font-mono text-[13px]">{s.finished || !s.started ? '–' : (s.vmg * 1.9438).toFixed(1)}</span>
                    <span className="text-right text-[12.5px] font-bold" style={{ color: d > 0 ? '#7DDC97' : d < 0 ? '#FFC062' : C.faint }}>{d > 0 ? `↑${d}` : d < 0 ? `↓${-d}` : '–'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="m-1 text-[12px]" style={{ color: C.faint }}>Seconds behind at this leg's pace. VMG in knots. Tap a boat to follow her.</p>
        </section>

        <section aria-label="Race map" className="relative min-w-0 flex-[3_1_520px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0A1A33]" style={{ aspectRatio: '1.12' }}>
          <TrackMap race={race} t={t} orient={orient} wind={wind} follow={follow} onPick={id => setFollow(id)} label="Live map: boats, trails, the course, ladder rungs and laylines" />
          <div className="absolute left-3 top-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.86)] py-2 pl-2 pr-3">
            <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9CCBFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${wind != null && race.course.windDeg != null && orient === 'wind' ? wind - race.course.windDeg : 0}deg)` }}><path d="M12 3v18M6 15l6 6 6-6" /></svg>
            </span>
            <span>
              <span className="block font-mono text-[15px] font-semibold">{wind != null ? compass(wind + race.rot) : race.course.windDeg != null ? compass(race.course.windDeg + race.rot) : 'Wind –'}</span>
              <span className="block text-[12px]" style={{ color: C.blueSoft }}>{shift != null && Math.abs(shift) >= 3 ? `Swung ${Math.abs(Math.round(shift))}° ${shift > 0 ? 'right' : 'left'} in the last minute` : wind != null ? 'Read from the fleet' : 'As laid'}</span>
            </span>
          </div>
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-[rgba(6,11,22,0.88)] px-2.5 py-2">
            <Btn small onClick={() => setBack(b => Math.min(b + 30, race.now - race.t0))} aria-label="Back 30 seconds">−30 s</Btn>
            <div className="relative h-[30px] flex-1" aria-label="Race timeline">
              <div aria-hidden="true" className="absolute inset-x-0 top-[13px] h-1 rounded-sm bg-gradient-to-r from-[#2E7BFF] via-[#8A4DFF] to-[#FF3E9A]" />
              {events.map((e, i) => (
                <span key={i} title={e.k} aria-hidden="true" className="absolute top-[7px] h-4 w-[3px] rounded-sm" style={{ left: `${Math.max(0, Math.min(100, ((e.t - (gun ?? race.t0)) / span) * 100))}%`, background: e.c }} />
              ))}
              <span aria-hidden="true" className="absolute top-[7px] h-4 w-4 -translate-x-1/2 rounded-full bg-white" style={{ left: `${Math.max(0, Math.min(100, ((t - (gun ?? race.t0)) / span) * 100))}%` }} />
            </div>
            {back > 0 ? <Btn small primary onClick={() => setBack(0)}>Back to live</Btn> : race.live ? <Chip tone="warn">Live</Chip> : <Chip>End</Chip>}
          </div>
        </section>

        <div className="flex min-w-0 max-w-[420px] flex-[1_1_300px] flex-col gap-3">
          {me && (
            <section aria-labelledby="boat-h" className="rounded-[20px] border bg-[#0A0F1C] p-4" style={{ borderColor: boat(me.boatId).color + '88' }}>
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl text-[14px] font-extrabold text-[#060B16]" style={{ background: boat(me.boatId).color }}>{boat(me.boatId).sail}</span>
                <div className="min-w-0 flex-1">
                  <h3 id="boat-h" className="m-0 truncate text-[16px] font-bold">{boat(me.boatId).name || `Boat ${boat(me.boatId).sail}`}</h3>
                  <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{me.place}{['st', 'nd', 'rd'][me.place - 1] ?? 'th'} · {gapText(me).s}{follow ? ' · following' : ''}</p>
                </div>
              </div>
              <dl className="m-0 mt-3 grid grid-cols-3 gap-2">
                {[
                  ['Speed', kn(me.speed)], ['VMG', me.started && !me.finished ? kn(me.vmg) : '–'], ['Heading', stNow ? compass(stNow.h + race.rot) : '–'],
                  ['To go', me.toGo != null ? `${Math.round(me.toGo)} m` : '–'], ['Next', me.finished ? 'Done' : me.nextName.replace(/^Mark /, '')], ['Leg', me.leg > 0 && !me.finished ? `${me.leg} of ${legsTotal}` : '–'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/[0.04] p-2.5"><dt className="text-[11.5px]" style={{ color: C.mute }}>{k}</dt><dd className="m-0 mt-0.5 truncate font-mono text-[15px] font-semibold">{v}</dd></div>
                ))}
              </dl>
            </section>
          )}
          {battleNow != null && lead && second && (
            <section aria-labelledby="battle-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
              <div className="flex items-baseline gap-2"><h3 id="battle-h" className="m-0 text-[15px] font-bold">Battle for the lead</h3><span className="ml-auto font-mono font-semibold" style={{ color: '#F3B5FB' }}>{battleNow.toFixed(1)} m</span></div>
              <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>
                {boat(second.boatId).sail} {battleThen != null && battleThen - battleNow > 0.2 ? `has taken ${(battleThen - battleNow).toFixed(1)} m out of` : battleThen != null && battleNow - battleThen > 0.2 ? `has lost ${(battleNow - battleThen).toFixed(1)} m to` : 'is holding station on'} {boat(lead.boatId).sail} in the last 30 s.
              </p>
            </section>
          )}
          <section aria-labelledby="feed-h" className="rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
            <h3 id="feed-h" className="m-0 text-[15px] font-bold">Race feed</h3>
            {!feed.length && <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>Nothing yet.</p>}
            <ol className="m-0 mt-2 list-none p-0">
              {feed.map((f, i) => (
                <li key={i} className="grid grid-cols-[44px_10px_minmax(0,1fr)] items-baseline gap-2 border-t border-white/[0.05] py-[7px]">
                  <span className="font-mono text-[12.5px]" style={{ color: C.mute }}>{gun != null ? rt(f.t - gun) : ''}</span>
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: TONE[f.tone] }} />
                  <span className="text-[13px]">{f.text}</span>
                </li>
              ))}
            </ol>
          </section>
          <Cap className="px-1">{race.demo ? 'Demo race: sailed by the race simulator' : race.live ? 'Fixes arrive live from the coordinator' : 'Recorded race'}</Cap>
        </div>
      </div>
    </div>
  );
}
