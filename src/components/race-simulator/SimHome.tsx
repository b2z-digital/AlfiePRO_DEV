// Simulator home: set up a quick race, open the Start Trainer, Rules Academy or Scenario Lab, and
// see your skipper profile (kept on this device for now).
import React, { useMemo, useState } from 'react';
import type { ClassId } from '@/sim/classes';
import type { SkipperLevel } from '@/sim/types';
import type { WindCharacter, WindStrength } from '@/sim/wind';
import type { CourseLength } from '@/sim/course';
import type { CoachMode } from './coach';
import type { SeaKind } from '@/sim/sea';
import { LAB } from '@/sim/training';
import { Profile, clearProfile, skills } from './profile';
import { TrainingProgress, drillStars, licence } from './progress';
import type { SimView } from './SimRace';
import { AlfieOrb, Btn, C, Cap, Chip, CoachGlyph, Seg, Tile, compassName, cx, ordinal } from './ui';
import { DEFAULT_VENUE, VENUES } from '@/sim/venues';
import type { VenueWind } from './venueWind';
import type { SimIdentity } from './identity';
import { Challenge, closesText, isOpen } from './challenges';
import { challengeLine } from './SimChallenge';
import type { SimSequence } from './startbox';

export interface Setup {
  classId: ClassId; fleetSize: number; level: SkipperLevel;
  windStrength: WindStrength; windCharacter: WindCharacter;
  laps: number; length: CourseLength; sequenceSeconds: number;
  coach: CoachMode; autoTrim: boolean; forgetfulSkippers: boolean;
  seaState: SeaKind; view: SimView;
  /** A venue id, or 'pond' for the practice pond. */
  venue: string;
  /** At a venue: its usual breeze, today's wind there, or any direction. */
  windDir: 'usual' | 'today' | 'any';
  /** The StartBox sequence to start with (an id); null for the simulator's own calls; unset, the club's. */
  startSeq?: string | null;
}

/** The default race: an IOM against 8 State-level skippers at Lake Macquarie RYC in its sea breeze,
 *  on choppy water, seen from the club's control area, with the 1-minute scratch sequence clubs use
 *  in StartBox and the sails on your stick (no auto-trim). */
export const DEFAULT_SETUP: Setup = {
  classId: 'IOM', fleetSize: 8, level: 'state', windStrength: 'medium', windCharacter: 'oscillating',
  laps: 2, length: 'medium', sequenceSeconds: 60, coach: 'full', autoTrim: false, forgetfulSkippers: false,
  seaState: 'chop', view: 'bank', venue: DEFAULT_VENUE, windDir: 'usual',
};

const CLASS_LABEL: Record<ClassId, string> = { IOM: 'IOM', DF95: 'DF95', DF65: 'DF65', '10R': '10 Rater', M: 'Marblehead' };

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

function Field({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
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

function TrainCard({ title, text, icon, action, actionLabel, soon, badge }: { title: string; text: string; icon: React.ReactNode; action?: () => void; actionLabel?: string; soon?: boolean; badge?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
      <div className="flex items-center gap-2.5">
        <Tile size={36}>{icon}</Tile>
        <p className="m-0 text-[15px] font-semibold">{title}</p>
        {soon ? <Chip className="ml-auto">Coming next</Chip> : badge ? <span className="ml-auto">{badge}</span> : null}
      </div>
      <p className="m-0 flex-1 text-[13.5px] leading-normal" style={{ color: C.mute }}>{text}</p>
      {action && <div><Btn small primary onClick={action}>{actionLabel ?? 'Open'}</Btn></div>}
    </div>
  );
}

/** Set a challenge: a title, a line about it, when it closes, and (super admins) who it's for. Uses the setup above. */
function SetChallenge({ canEveryone, onCreate, onDone }: { canEveryone: boolean; onCreate: (c: { title: string; description: string; days: number | null; everyone: boolean }) => Promise<string | null>; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState<number>(7);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[14px] text-[#F1F4FA] placeholder:text-[rgba(235,240,255,0.4)] focus:border-[rgba(77,163,255,0.6)] focus:outline-none';
  return (
    <form className="flex flex-col gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4" onSubmit={async e => {
      e.preventDefault();
      if (title.trim().length < 3) { setErr('Give it a title of at least three letters.'); return; }
      setBusy(true); setErr(null);
      const r = await onCreate({ title, description, days: days || null, everyone });
      setBusy(false);
      if (r) setErr(r); else onDone();
    }}>
      <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>The challenge is the race set up above (class, fleet, skippers, venue and wind), with its own shifts that everyone gets the same.</p>
      <label className="flex flex-col gap-1.5"><Cap>Title</Cap><input className={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Sunday sea breeze, IOM" /></label>
      <label className="flex flex-col gap-1.5"><Cap>About it (optional)</Cap><textarea className={cx(field, 'min-h-[64px]')} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Practise the start before Sunday's racing." /></label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5"><Cap>Open for</Cap><Seg size="sm" label="Open for" value={days} onChange={setDays} options={[{ value: 3, label: '3 days' }, { value: 7, label: 'A week' }, { value: 14, label: 'Two weeks' }, { value: 0, label: 'No end' }]} /></div>
        {canEveryone && <div className="flex flex-col gap-1.5"><Cap>For</Cap><Seg size="sm" label="Who it's for" value={everyone ? 'all' : 'club'} onChange={v => setEveryone(v === 'all')} options={[{ value: 'club', label: 'This club' }, { value: 'all', label: 'Every club' }]} /></div>}
        <span className="ml-auto" />
        <Btn type="button" quiet onClick={onDone}>Cancel</Btn>
        <Btn type="submit" primary disabled={busy}>{busy ? 'Setting it…' : 'Set the challenge'}</Btn>
      </div>
      {err && <p className="m-0 text-[13px] text-[#FCA5A5]">{err}</p>}
    </form>
  );
}

/**
 * The starts to offer: the club's own sequences (or StartBox's defaults if it has none) and the one
 * chosen, then the simulator calling a 1, 2 or 3 minute start for the lengths they don't cover.
 */
function startOptions(sequences: SimSequence[], chosen: SimSequence | null, seconds: number): { value: string; label: string }[] {
  const own = sequences.filter(q => q.club);
  let shown = own.length ? own.slice(0, 3) : sequences.slice(0, 2);
  if (chosen && !shown.some(q => q.id === chosen.id)) shown = [...shown, chosen];
  const called = [60, 120, 180].filter(n => !shown.some(q => q.seconds === n) || (!chosen && seconds === n));
  return [
    ...shown.map(q => ({ value: q.id, label: q.name })),
    ...called.map(n => ({ value: `b${n}`, label: sequences.length ? `${n / 60} min` : `${n / 60} minute${n > 60 ? 's' : ''}` })),
  ];
}

export default function SimHome({ setup, onSetup, onStart, profile, onProfileCleared, training, onOpen, today, me = null, synced = false, challenges = null, onChallenge, canSet = null, onCreateChallenge, sequences = [], startSeq = null }: {
  setup: Setup; onSetup: (s: Setup) => void; onStart: (mode: 'race' | 'start', s: Setup) => void; profile: Profile; onProfileCleared: () => void;
  training: TrainingProgress; onOpen: (where: 'trainer' | 'academy' | 'lab') => void;
  /** Today's wind at the venue, when you've asked for it: loading, got it, or couldn't get it. */
  today: VenueWind | 'loading' | 'failed' | null;
  /** The signed-in member: their name and sail numbers. */
  me?: SimIdentity | null;
  /** Races and training are being kept in the member's account. */
  synced?: boolean;
  /** Challenges you can see (null when you're not signed in, or they couldn't be loaded). */
  challenges?: Challenge[] | null;
  onChallenge?: (c: Challenge) => void;
  /** Can you set challenges, and for every club? */
  canSet?: { everyone: boolean } | null;
  onCreateChallenge?: (c: { title: string; description: string; days: number | null; everyone: boolean }) => Promise<string | null>;
  /** The club's StartBox sequences, and the one this race will use (null: the simulator calls it). */
  sequences?: SimSequence[];
  startSeq?: SimSequence | null;
}) {
  const [setting, setSetting] = useState(false);
  const stars = drillStars(training);
  const lic = licence(training);
  const labWon = LAB.filter(m => training.lab[m.id]?.won).length;
  const [s, setS] = useState<Setup>(setup);
  const set = (patch: Partial<Setup>) => { const n = { ...s, ...patch }; setS(n); onSetup(n); };
  const sk = useMemo(() => skills(profile), [profile]);
  const venue = s.venue !== 'pond' ? VENUES[s.venue] ?? null : null;
  const windHint = !venue ? null
    : s.windDir === 'usual' ? `The club's usual breeze, from ${String(venue.usualWind).padStart(3, '0')}°.`
      : s.windDir === 'any' ? 'A different direction every race, so you learn the whole lake.'
        : today === 'loading' ? 'Getting the wind at the club now…'
          : today === 'failed' || !today ? `Couldn't get today's wind, so it's the ${venue.usualWindName} for now.`
            : `Now at the club: ${Math.round(today.kn)} kn from the ${compassName(today.from)} (${String(Math.round(today.from)).padStart(3, '0')}°). It sets the wind strength too.`;
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
              <Field label="Where" hint={venue ? `${venue.place}, from the club's control area. The course is laid for the wind, with every mark well off the bank. Map data ${venue.credit}.` : 'A sheltered practice pond, lined with trees.'}>
                <Seg label="Where" value={s.venue} onChange={v => set({ venue: v })} options={[...Object.values(VENUES).map(d => ({ value: d.id, label: d.short })), { value: 'pond', label: 'Practice pond' }]} />
              </Field>
              {venue ? (
                <Field label="Wind direction" hint={windHint}>
                  <Seg label="Wind direction" value={s.windDir} onChange={v => set({ windDir: v })} options={[{ value: 'usual', label: `${venue.usualWindName[0].toUpperCase()}${venue.usualWindName.slice(1)}` }, { value: 'today', label: "Today's wind" }, { value: 'any', label: 'Any direction' }]} />
                </Field>
              ) : <div className="hidden md:block" />}
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
              <Field label="Water" hint={s.seaState === 'flat' ? 'Glassy water and clear reflections.' : s.seaState === 'chop' ? 'Waves 4 cm high: a little slower upwind, a little surfing downwind.' : 'Waves 10 cm high with whitecaps: she slams upwind and surfs downwind.'}>
                <Seg label="Water" value={s.seaState} onChange={v => set({ seaState: v })} options={[{ value: 'flat', label: 'Flat' }, { value: 'chop', label: 'Choppy' }, { value: 'rough', label: 'Rough' }]} />
              </Field>
              <Field label="Start" hint={startSeq
                ? `${startSeq.club ? "Your club's" : 'The StartBox'} ${startSeq.name} sequence${startSeq.audio ? ', the recording you hear at the pond' : ''}, in step with the race clock.`
                : 'Called by the simulator: each minute, every 10 s in the last minute and every second in the last 10 (Appendix E).'}>
                <Seg label="Start sequence" value={startSeq ? startSeq.id : `b${s.sequenceSeconds}`}
                  onChange={v => { const q = sequences.find(x => x.id === v); set(q ? { startSeq: q.id, sequenceSeconds: q.seconds } : { startSeq: null, sequenceSeconds: Number(String(v).slice(1)) }); }}
                  options={startOptions(sequences, startSeq, s.sequenceSeconds)} />
              </Field>
              <Field label="View" hint={s.view === 'bank' ? 'From the control area on the bank, the way you see a race. Press V to switch.' : 'From above, with laylines. Press V to switch.'}>
                <Seg label="View" value={s.view} onChange={v => set({ view: v })} options={[{ value: 'bank', label: 'From the bank' }, { value: 'top', label: 'From above' }]} />
              </Field>
              <Field label={<span className="inline-flex items-center gap-2"><AlfieOrb size={18} />Alfie's coaching</span>} hint={s.coach === 'full' ? 'Alfie talks you through the race as you sail, and pauses it to explain any rules incident you are in.' : s.coach === 'hints' ? 'Alfie gives tips as you sail; rules incidents show as a banner without pausing.' : 'No tips. Incidents still show briefly.'}>
                <Seg label="Alfie's coaching" value={s.coach} onChange={v => set({ coach: v })} options={[{ value: 'full', label: 'Full' }, { value: 'hints', label: 'Hints only' }, { value: 'off', label: 'Off' }]} />
              </Field>
              <div className="flex flex-col gap-2">
                <Cap>Options</Cap>
                <Toggle on={s.autoTrim} onChange={v => set({ autoTrim: v })} label="Auto-trim" text="Off: the sails go where your stick puts them, like the real thing. On: they trim themselves with the stick right in." />
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
                  <h2 id="pf-title" className="m-0 text-[16px] font-semibold">{me ? me.name : 'Your skipper profile'}</h2>
                  <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{sk ? `From your last ${sk.races} race${sk.races > 1 ? 's' : ''}${synced ? '' : ' on this device'}` : synced ? 'Saved to your account' : 'Kept on this device'}</p>
                </div>
              </div>
              {me && (
                <p className="m-0 rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] leading-snug" style={{ color: C.mute }}>
                  {me.sails[s.classId]
                    ? <>You're sailing <b className="text-[#F1F4FA]">{CLASS_LABEL[s.classId]} {me.sails[s.classId]}</b>, from your boats in My Garage.</>
                    : <>Add your {CLASS_LABEL[s.classId]} in My Garage to race with your own sail number. Until then you're <b className="text-[#F1F4FA]">01</b>.</>}
                </p>
              )}
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

        {challenges && (challenges.length > 0 || canSet) && (
          <section className="flex flex-col gap-3.5" aria-labelledby="ch-title">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="ch-title" className="m-0 font-display text-[22px] font-bold">Challenges</h2>
                <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>The same race for everyone, with a leaderboard. Race the leader's ghost to find the time.</p>
              </div>
              {canSet && !setting && <Btn onClick={() => setSetting(true)}>Set a challenge</Btn>}
            </div>
            {setting && canSet && onCreateChallenge && <SetChallenge canEveryone={canSet.everyone} onCreate={onCreateChallenge} onDone={() => setSetting(false)} />}
            {challenges.length === 0 && !setting && <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>No challenges yet. Set the first one from the race you've set up above.</p>}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
              {challenges.slice(0, 6).map(c => (
                <button key={c.id} type="button" onClick={() => onChallenge?.(c)} className="flex cursor-pointer flex-col gap-2 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5 text-left hover:bg-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <Cap>{c.club_id ? 'Club challenge' : 'Open challenge'}</Cap>
                    <Chip tone={isOpen(c) ? 'blue' : 'plain'} className="ml-auto">{closesText(c)}</Chip>
                  </div>
                  <p className="m-0 text-[16px] font-semibold text-[#F1F4FA]">{c.title}</p>
                  <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>{challengeLine(c)}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3.5" aria-labelledby="train-title">
          <div>
            <h2 id="train-title" className="m-0 font-display text-[22px] font-bold">Train</h2>
            <p className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>Short, focused sessions. Each one feeds your skipper profile.</p>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
            <TrainCard title="Start Trainer" text="Twelve start drills: time on distance, the favoured end, port-tack starts, crowded lines and getting back after a recall." action={() => onOpen('trainer')} actionLabel="Open the drills"
              badge={<Chip tone={stars.got ? 'blue' : 'plain'}>{stars.got} of {stars.of} stars</Chip>}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>} />
            <TrainCard title="Rules Academy" text="Six modules and 26 situations from the Racing Rules of Sailing with Appendix E. Answer each one, then sail it." action={() => onOpen('academy')} actionLabel="Open the Academy"
              badge={<Chip tone={lic.level ? 'blue' : 'plain'}>Licence level {lic.level} of 6</Chip>}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13" /></svg>} />
            <TrainCard title="Scenario Lab" text="Port-tack approaches, crowded roundings, gate choices. Replay a moment until you win it." action={() => onOpen('lab')} actionLabel="Open the Lab"
              badge={<Chip tone={labWon ? 'blue' : 'plain'}>{labWon} of {LAB.length} won</Chip>}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 001.3 2h13.4a1.5 1.5 0 001.3-2L14 9V3" /></svg>} />
            <TrainCard title="Venue practice" text={`${VENUES[DEFAULT_VENUE].name}'s real water from the control area, in the wind blowing there today. Rehearse the shifts before you get to the club.`}
              action={() => { set({ venue: DEFAULT_VENUE, windDir: 'today' }); document.getElementById('qr-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} actionLabel="Use today's wind"
              badge={s.venue === DEFAULT_VENUE && s.windDir === 'today' ? <Chip tone="blue">Set up</Chip> : undefined}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>} />
          </div>
        </section>
      </div>
    </div>
  );
}
