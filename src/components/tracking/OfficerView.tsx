// The race officer's desk: what needs a decision. Calls at the gun, marks missed or left on the
// wrong side, contacts and whether a turn followed, boats stopped or lost, and the finish order with
// the crossings too close to split. The system flags; the officer decides.
import React, { useMemo } from 'react';
import { stateAt } from './core/analyse';
import { useAnalysis, type TrackedRace } from './source';
import { rt, rt1 } from './format';
import { Btn, C, Chip } from '../race-simulator/ui';

interface Props {
  race: TrackedRace;
  lowBattery?: { sail: string; pct: number }[];
  onEnd?: () => void;
  ending?: boolean;
}

function Card({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0 flex-[1_1_320px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
      <div className="flex items-center gap-2"><h3 id={id} className="m-0 text-[15px] font-bold">{title}</h3>{count != null && <span className="ml-auto rounded-full bg-white/[0.08] px-2 py-0.5 text-[12px] font-bold">{count}</span>}</div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
function Row({ color, sail, children, tone }: { color: string; sail: string; children: React.ReactNode; tone?: string }) {
  return (
    <li className="flex items-center gap-2 border-t border-white/[0.05] py-[7px] text-[13px]">
      <span aria-hidden="true" className="h-[22px] w-1 shrink-0 rounded-sm" style={{ background: color }} />
      <b className="w-[34px] shrink-0">{sail}</b>
      <span className="min-w-0 flex-1" style={tone ? { color: tone } : undefined}>{children}</span>
    </li>
  );
}
function None({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[13px]" style={{ color: C.mute }}>{children}</p>;
}

export default function OfficerView({ race, lowBattery = [], onEnd, ending }: Props) {
  const { a } = useAnalysis(race, race.live ? undefined : race.t1);
  const gun = race.gun;
  const sail = (id: string) => race.boats.find(b => b.id === id)?.sail ?? '?';
  const color = (id: string) => race.boats.find(b => b.id === id)?.color ?? '#888';
  const incidents = useMemo(() => (a ? a.encounters.filter(e => e.contact && (gun == null || e.t >= gun)) : []), [a, gun]);
  if (race.status !== 'ready' || !race.course || !a) return <p className="p-6" style={{ color: C.mute }}>{race.status === 'error' ? race.error : 'Loading the race…'}</p>;
  const T = (t: number) => (gun != null ? rt(t - gun) : '');
  const fresh = race.boats.filter(b => stateAt(b, race.now, race.setup.lostS)?.fresh).length;
  const over = a.starts.filter(s => s.call === 'over'), close = a.starts.filter(s => s.call === 'close');
  const wrong = a.roundings.filter(r => r.wrongSide);
  const todo = over.length + close.length + wrong.length + a.missed.length + incidents.filter(e => !e.turns.length).length + a.alerts.length + a.finishes.filter(f => f.tooClose.length).length;

  const R = (id: string) => ({ color: color(id), sail: sail(id) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] px-4 py-3">
        <div>
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: C.faint }}>Needs a look</p>
          <p className="m-0 font-display text-[26px] font-bold">{todo}</p>
        </div>
        <div className="h-10 w-px bg-white/10" aria-hidden="true" />
        <div><p className="m-0 text-[12px]" style={{ color: C.mute }}>Tags reporting</p><p className="m-0 font-mono text-[18px] font-semibold">{fresh} / {race.boats.length}</p></div>
        <div><p className="m-0 text-[12px]" style={{ color: C.mute }}>Race time</p><p className="m-0 font-mono text-[18px] font-semibold">{gun != null ? rt(race.now - gun) : 'Before the gun'}</p></div>
        <div><p className="m-0 text-[12px]" style={{ color: C.mute }}>Finished</p><p className="m-0 font-mono text-[18px] font-semibold">{a.finishes.length} / {race.boats.length}</p></div>
        {onEnd && race.live && <Btn className="ml-auto" onClick={onEnd} disabled={ending}>{ending ? 'Ending…' : 'End the race'}</Btn>}
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Card id="o-start" title="The start" count={over.length + close.length}>
          {gun == null || race.now < gun ? <None>Calls appear at the gun.</None> : !over.length && !close.length ? <None>Clean start: every hull was behind the line by more than {Math.round(race.setup.accuracy * 100)} cm.</None> : (
            <ul className="m-0 list-none p-0">
              {over.map(s => <Row key={s.boatId} {...R(s.boatId)} tone="#FCA5A5">Over by {Math.round(s.atGun * 100)} cm. {s.startedAt != null ? `Came back and started at ${rt1(s.startedAt - gun)}.` : 'Hasn’t come back.'}</Row>)}
              {close.map(s => <Row key={s.boatId} {...R(s.boatId)} tone="#FFD48A">{s.atGun > 0 ? '+' : ''}{Math.round(s.atGun * 100)} cm at the gun: too close to call. Your call.</Row>)}
            </ul>
          )}
        </Card>
        <Card id="o-marks" title="Marks" count={wrong.length + a.missed.length}>
          {!wrong.length && !a.missed.length ? <None>Every boat has rounded every mark the right way so far.</None> : (
            <ul className="m-0 list-none p-0">
              {a.missed.map((m, i) => <Row key={`m${i}`} {...R(m.boatId)} tone="#FCA5A5">Hasn’t rounded {race.course!.waypoints[m.wp]?.name ?? 'a mark'} (seen going on at {T(m.t)}).</Row>)}
              {wrong.map((r, i) => <Row key={`w${i}`} {...R(r.boatId)} tone="#FCA5A5">Left {r.markId} to {r.side} at {T(r.t)}: wrong side.</Row>)}
            </ul>
          )}
        </Card>
        <Card id="o-inc" title="Possible contacts" count={incidents.length}>
          {!incidents.length ? <None>No hulls within {Math.round(race.setup.accuracy * 100)} cm of each other since the gun.</None> : (
            <ul className="m-0 list-none p-0">
              {incidents.slice().reverse().map((e, i) => (
                <li key={i} className="border-t border-white/[0.05] py-[8px] text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono" style={{ color: C.mute }}>{T(e.t)}</span>
                    <b><span style={{ color: color(e.a) }}>■</span> {sail(e.a)} and <span style={{ color: color(e.b) }}>■</span> {sail(e.b)}</b>
                    <span style={{ color: C.mute }}>{e.situation === 'unknown' ? '' : e.situation}</span>
                    {e.turns.length ? <Chip tone="good">{e.turns.map(x => sail(x.boatId)).join(', ')} turned</Chip> : <Chip tone="warn">No turn seen</Chip>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-2 text-[12px]" style={{ color: C.faint }}>Hulls overlapping within the system's accuracy. Contact can't be proven from positions alone: use it with what you saw and the replay.</p>
        </Card>
        <Card id="o-alerts" title="Boats and tags" count={a.alerts.length + lowBattery.length}>
          {!a.alerts.length && !lowBattery.length ? <None>Every tag is reporting and nobody has stopped.</None> : (
            <ul className="m-0 list-none p-0">
              {a.alerts.map((al, i) => <Row key={i} {...R(al.boatId)} tone={al.kind === 'lost' ? '#FCA5A5' : '#FFD48A'}>{al.kind === 'lost' ? `No fix for ${Math.round(race.now - al.since)} s: check the tag.` : `Stopped for ${Math.round(race.now - al.since)} s: aground, fouled or retired?`}</Row>)}
              {lowBattery.map(l => <li key={l.sail} className="border-t border-white/[0.05] py-[7px] text-[13px]" style={{ color: '#FFD48A' }}><b className="text-[#F1F4FA]">{l.sail}</b> tag battery {l.pct}%</li>)}
            </ul>
          )}
        </Card>
        <Card id="o-fin" title="Finish order" count={a.finishes.length}>
          {!a.finishes.length ? <None>Nobody has finished yet.</None> : (
            <ol className="m-0 list-none p-0">
              {a.finishes.map((f, i) => (
                <Row key={f.boatId} {...R(f.boatId)} tone={f.tooClose.length ? '#FFD48A' : undefined}>
                  <span className="font-bold">{i + 1}</span> · <span className="font-mono">{gun != null ? rt1(f.t - gun) : ''}</span>
                  {f.tooClose.length ? ` · too close to call with ${f.tooClose.map(sail).join(', ')}` : f.margin != null && i < a.finishes.length - 1 ? ` · ${f.margin < 1 ? `${Math.round(f.margin * 100)} cm` : `${f.margin.toFixed(1)} m`} clear` : ''}
                </Row>
              ))}
            </ol>
          )}
          <p className="m-0 mt-2 text-[12px]" style={{ color: C.faint }}>Provisional. It goes to the results when you send it from the scoring screen.</p>
        </Card>
      </div>
    </div>
  );
}
