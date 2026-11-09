// Simulator home: set up a quick race, practise starts, and see your skipper profile
// (kept on this device for now).
import React, { useMemo, useState } from 'react';
import type { ClassId } from '@/sim/classes';
import type { SkipperLevel } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import type { CourseLength } from '@/sim/course';
import type { CoachMode } from './coach';
import { Profile, clearProfile, skills } from './profile';
import { Btn, C, Cap, Chip, CoachGlyph, Seg, Tile, cx, ordinal } from './ui';

export interface Setup {
  classId: ClassId; fleetSize: number; level: SkipperLevel;
  windStrength: WindStrength; windCharacter: WindCharacter;
  laps: number; length: CourseLength; sequenceSeconds: number;
  coach: CoachMode; autoTrim: boolean; forgetfulSkippers: boolean;
}

export const DEFAULT_SETUP: Setup = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'full', autoTrim: true, forgetfulSkippers: false,
};

const LEVEL_TEXT: Record<SkipperLevel, string> = {
  club: 'Learning the ropes: late starts, wide roundings, and the odd foul you can protest.',
  state: 'Solid starts, play the big shifts, rarely foul. The odd late tack on the layline.',
  national: 'Sharp starts and tight roundings. They tack on small shifts and give little away.',
  world: 'On the line at the gun and on the right side of every shift. One mistake and they are gone.',
};

function minutes(s: Setup) {
  const perLap = s.length === 'short' ? 2.2 : s.length === 'long' ? 4.2 : 3;
  const cls = s.classId === 'DF65' ? 1.25 : s.classId === '10R' ? 0.85 : s.classId === 'M' ? 0.92 : 1;
  const wind = s.windStrength === 'light' ? 1.35 : s.windStrength === 'fresh' ? 0.85 : 1;
  return Math.round(perLap * s.laps * cls * wind + 0.6);
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Cap>{label}</Cap>
      {children}
      {hint && <p className="m-0 text-[12.5px] leading-snug" style={{ color: C.mute }}>{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label, text }: { on: boolean; onChange: (v: boolean) => void; label: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
      <input type="checkbox" className="peer sr-only" checked={on} onChange={e => onChange(e.target.checked)} />
      <span aria-hidden="true" className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#4DA3FF]', on ? 'bg-[#2A8BFF]' : 'bg-white/15')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', on ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{label}</span>
        <span className="block text-[12.5px] leading-snug" style={{ color: C.mute }}>{text}</span>
      </span>
    </label>
  );
}

function SkillBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-3">
      <span className="text-[13px]" style={{ color: C.mute }}>{label}</span>
      <span className="relative h-1.5 rounded bg-white/[0.08]">
        <span className="absolute inset-y-0 left-0 rounded" style={{ width: `${v}%`, background: v < 45 ? '#FF9F43' : '#4DA3FF' }} />
      </span>
      <span className="text-right text-[13px] font-semibold tabular-nums">{v}</span>
    </div>
  );
}

function TrainCard({ title, text, icon, action, soon }: { title: string; text: string; icon: React.ReactNode; action?: () => void; soon?: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex items-center gap-2.5">
        <Tile size={36}>{icon}</Tile>
        <p className="m-0 text-[15px] font-semibold">{title}</p>
        {soon && <Chip className="ml-auto">Coming next</Chip>}
      </div>
      <p className="m-0 flex-1 text-[13.5px] leading-normal" style={{ color: C.mute }}>{text}</p>
      {action && <div><Btn small onClick={action}>Practise starts</Btn></div>}
    </div>
  );
}

export default function SimHome({ setup, onSetup, onStart, profile, onProfileCleared }: {
  setup: Setup; onSetup: (s: Setup) => void; onStart: (mode: 'race' | 'start', s: Setup) => void; profile: Profile; onProfileCleared: () => void;
}) {
  const [s, setS] = useState<Setup>(setup);
  const set = (patch: Partial<Setup>) => { const n = { ...s, ...patch }; setS(n); onSetup(n); };
  const sk = useMemo(() => skills(profile), [profile]);
  const weakest = sk ? (Object.entries({ starts: sk.starts, upwind: sk.upwind, roundings: sk.roundings, downwind: sk.downwind, rules: sk.rules }) as [string, number][]).sort((a, b) => a[1] - b[1])[0] : null;

  const surprise = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const n: Setup = {
      ...s,
      classId: pick(['IOM', 'IOM', 'DF95', 'DF65', '10R', 'M'] as ClassId[]),
      fleetSize: pick([6, 8, 8, 12]),
      level: pick(['club', 'state', 'state', 'national'] as SkipperLevel[]),
      windStrength: pick(['light', 'medium', 'medium', 'fresh'] as WindStrength[]),
      windCharacter: pick(['steady', 'oscillating', 'oscillating', 'puffy', 'persistent'] as WindCharacter[]),
    };
    setS(n); onSetup(n); onStart('race', n);
  };

  return (
    <div className="min-h-full text-[14px] text-[#F1F4FA]" style={{ backgroundColor: C.bg, backgroundImage: 'radial-gradient(1100px 700px at 12% -10%, rgba(30,108,255,.2), transparent 60%)', fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[1360px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <Tile size={52}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v14M12 3l7 11h-7M12 6L6 14h6M4 19c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 4 0" /></svg>
          </Tile>
          <div className="min-w-0 flex-1">
            <h1 className="m-0 font-display text-[32px] font-bold tracking-[-0.02em]">Race Simulator</h1>
            <p className="m-0 mt-1 text-[15px]" style={{ color: C.mute }}>Race AI skippers who sail like real radio sailors, and learn the rules as you go.</p>
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-5">
          {/* Quick race */}
          <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-5 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6" aria-labelledby="qr-title">
            <div>
              <Cap>Quick race</Cap>
              <h2 id="qr-title" className="m-0 mt-1 font-display text-[24px] font-bold">Set up a race</h2>
              <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Every skipper in the fleet has a game plan, a personality and the rules in their head. Pick who you race and in what.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Class">
                <Seg label="Class" value={s.classId} onChange={v => set({ classId: v })} options={[{ value: 'IOM', label: 'IOM' }, { value: 'DF95', label: 'DF95' }, { value: 'DF65', label: 'DF65' }, { value: '10R', label: '10 Rater' }, { value: 'M', label: 'Marblehead' }]} />
              </Field>
              <Field label="Fleet" hint="boats including you">
                <Seg label="Fleet size" value={s.fleetSize} onChange={v => set({ fleetSize: v })} options={[6, 8, 12, 16].map(n => ({ value: n, label: String(n) }))} />
              </Field>
              <Field label="Skippers" hint={LEVEL_TEXT[s.level]}>
                <Seg label="Skipper level" value={s.level} onChange={v => set({ level: v })} options={[{ value: 'club', label: 'Club' }, { value: 'state', label: 'State' }, { value: 'national', label: 'National' }, { value: 'world', label: 'World' }]} />
              </Field>
              <Field label="Wind">
                <Seg label="Wind strength" value={s.windStrength} onChange={v => set({ windStrength: v })} options={[{ value: 'light', label: 'Light 3–6 kn' }, { value: 'medium', label: 'Medium 7–12 kn' }, { value: 'fresh', label: 'Fresh 13–18 kn' }]} />
                <Seg label="Wind character" value={s.windCharacter} onChange={v => set({ windCharacter: v })} options={[{ value: 'steady', label: 'Steady' }, { value: 'oscillating', label: 'Oscillating' }, { value: 'puffy', label: 'Puffy' }, { value: 'persistent', label: 'Persistent shift' }]} />
              </Field>
              <Field label="Course" hint={`Windward–leeward with offset and gate · finish upwind · about ${minutes(s)} minutes`}>
                <div className="flex flex-wrap gap-2">
                  <Seg label="Laps" value={s.laps} onChange={v => set({ laps: v })} options={[1, 2, 3].map(n => ({ value: n, label: `${n} lap${n > 1 ? 's' : ''}` }))} />
                  <Seg label="Course length" value={s.length} onChange={v => set({ length: v })} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'long', label: 'Long' }]} />
                </div>
              </Field>
              <Field label="Start" hint="Calls each minute, every 10 s in the last minute and every second in the last 10 s (Appendix E)">
                <Seg label="Start sequence" value={s.sequenceSeconds} onChange={v => set({ sequenceSeconds: v })} options={[{ value: 60, label: '1 minute' }, { value: 120, label: '2 minutes' }, { value: 180, label: '3 minutes' }]} />
              </Field>
              <Field label="Coaching" hint={s.coach === 'full' ? 'Advice as you sail, and the race pauses to explain any rules incident you are in.' : s.coach === 'hints' ? 'Advice as you sail; rules incidents show as a banner without pausing.' : 'No coach. Incidents still show briefly.'}>
                <Seg label="Coaching" value={s.coach} onChange={v => set({ coach: v })} options={[{ value: 'full', label: 'Full coach' }, { value: 'hints', label: 'Hints only' }, { value: 'off', label: 'Off' }]} />
              </Field>
              <div className="flex flex-col gap-2">
                <Cap>Options</Cap>
                <Toggle on={s.autoTrim} onChange={v => set({ autoTrim: v })} label="Auto-trim" text="The sail trims itself when the stick is fully in. Ease it to slow down." />
                <Toggle on={s.forgetfulSkippers} onChange={v => set({ forgetfulSkippers: v })} label="Forgetful skippers" text="Some skippers forget their penalty, so hail a protest when they foul you." />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Btn primary onClick={() => onStart('race', s)} className="!h-11 !px-5 !text-[14.5px]">Start race</Btn>
              <Btn onClick={surprise} className="!h-11">Surprise me</Btn>
              <span className="ml-auto text-[12.5px]" style={{ color: C.mute }}>Keyboard, touch, or a USB transmitter</span>
            </div>
          </section>

          {/* Profile */}
          <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
            <section className="flex flex-col gap-4 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5 sm:p-6" aria-labelledby="pf-title">
              <div className="flex items-center gap-2.5">
                <Tile size={36}><CoachGlyph size={18} /></Tile>
                <div className="min-w-0">
                  <h2 id="pf-title" className="m-0 text-[16px] font-semibold">Your skipper profile</h2>
                  <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{sk ? `From your last ${sk.races} race${sk.races > 1 ? 's' : ''} on this device` : 'Kept on this device'}</p>
                </div>
              </div>
              {!sk ? (
                <p className="m-0 text-[13.5px] leading-normal" style={{ color: C.mute }}>Sail a race and your profile starts here: starts, upwind, roundings, downwind and rules, worked out from how you race.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2.5">
                    <SkillBar label="Starts" v={sk.starts} />
                    <SkillBar label="Upwind" v={sk.upwind} />
                    <SkillBar label="Roundings" v={sk.roundings} />
                    <SkillBar label="Downwind" v={sk.downwind} />
                    <SkillBar label="Rules" v={sk.rules} />
                  </div>
                  <p className="m-0 text-[13px] leading-normal" style={{ color: C.mute }}>
                    {weakest && `${weakest[0][0].toUpperCase()}${weakest[0].slice(1)} is where you have most to gain.`}
                    {sk.avgPlace !== null && ` Average finish: top ${Math.round(sk.avgPlace * 100)}% of the fleet.`}
                    {sk.wins > 0 && ` ${sk.wins} win${sk.wins > 1 ? 's' : ''}.`}
                  </p>
                  <div className="flex flex-col">
                    {profile.races.slice(0, 5).map(r => (
                      <div key={r.at} className="flex items-center gap-3 border-t border-white/[0.055] py-2 text-[13px]">
                        <span className="w-12 font-semibold tabular-nums">{r.mode === 'start' ? 'Start' : r.place ? ordinal(r.place) : r.status.toUpperCase()}</span>
                        <span className="min-w-0 flex-1 truncate" style={{ color: C.mute }}>{r.cls} · {r.level} · {r.wind}</span>
                        <span className="tabular-nums" style={{ color: C.mute }}>{new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                      </div>
                    ))}
                  </div>
                  <div><Btn quiet small onClick={() => { clearProfile(); onProfileCleared(); }}>Clear my history</Btn></div>
                </>
              )}
            </section>
          </aside>
        </div>

        <section className="flex flex-col gap-3.5" aria-labelledby="train-title">
          <div>
            <h2 id="train-title" className="m-0 font-display text-[22px] font-bold">Train</h2>
            <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Short, focused sessions. Each one feeds your skipper profile.</p>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
            <TrainCard title="Start Trainer" text="The pre-start and the first seconds of the race against your chosen fleet, then a start report: how late, how fast, and how far from the favoured end." action={() => onStart('start', s)}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>} />
            <TrainCard title="Rules Academy" soon text="Every Part 2 rule, played out on the water, with the radio sailing changes from Appendix E."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13" /></svg>} />
            <TrainCard title="Scenario Lab" soon text="Port-tack approaches, crowded roundings, gate choices. Replay a situation until you win it."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 001.3 2h13.4a1.5 1.5 0 001.3-2L14 9V3" /></svg>} />
            <TrainCard title="Venue practice" soon text="Your club's course in today's forecast, so you can rehearse the shifts before you get to the pond."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>} />
          </div>
        </section>
      </div>
    </div>
  );
}
