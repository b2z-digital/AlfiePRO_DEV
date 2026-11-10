// Set up a virtual race event (club admins): a title, how many races, the conditions, when the races
// open, whether the first or the best try counts, and the drops. The boats, fleet and venue are the
// race set up on the simulator home.
import { useState } from 'react';
import { SCHEDULES, Schedule } from './events';
import { Btn, C, Cap, Seg, cx } from './ui';

export interface EventChoice {
  title: string;
  description: string;
  races: number;
  mixed: boolean;
  schedule: Schedule;
  /** The day the first race opens (local midnight; today means now). */
  start: Date;
  tries: 'first' | 'best';
  drops: boolean;
  everyone: boolean;
}

const field = 'w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[14px] text-[#F1F4FA] placeholder:text-[rgba(235,240,255,0.4)] focus:border-[rgba(77,163,255,0.6)] focus:outline-none';

const dayInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function EventForm({ line, canEveryone, onCreate, onDone }: {
  /** The race set up on the home page, which every race of the event uses. */
  line: string;
  canEveryone: boolean;
  onCreate: (c: EventChoice) => Promise<string | null>;
  onDone: () => void;
}) {
  const today = dayInput(new Date());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [races, setRaces] = useState(5);
  const [mixed, setMixed] = useState(true);
  const [schedule, setSchedule] = useState<Schedule>('weekly');
  const [start, setStart] = useState(today);
  const [tries, setTries] = useState<'first' | 'best'>('best');
  const [drops, setDrops] = useState(true);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form className="flex flex-col gap-4 rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5" onSubmit={async e => {
      e.preventDefault();
      if (title.trim().length < 3) { setErr('Give it a title of at least three letters.'); return; }
      const [y, m, d] = start.split('-').map(Number);
      const day = start === today || !y ? new Date() : new Date(y, m - 1, d);
      setBusy(true); setErr(null);
      const r = await onCreate({ title, description, races, mixed, schedule, start: day, tries, drops, everyone });
      setBusy(false);
      if (r) setErr(r); else onDone();
    }}>
      <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>
        Every race uses the race set up above: <span className="text-[#F1F4FA]">{line}</span>. Everyone sails the same race, with the same fleet, wind and shifts, any time it's open.
      </p>
      <label className="flex flex-col gap-1.5"><Cap>Title</Cap><input className={field} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Winter series, IOM" /></label>
      <label className="flex flex-col gap-1.5"><Cap>About it (optional)</Cap><textarea className={cx(field, 'min-h-[64px]')} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000} placeholder="Five races over the winter, one a week. Sail each one when it suits you." /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Cap>Races</Cap><Seg size="sm" label="Races" value={races} onChange={setRaces} options={[3, 4, 5, 6, 8, 10].map(n => ({ value: n, label: String(n) }))} /></div>
        <div className="flex flex-col gap-1.5">
          <Cap>Conditions</Cap>
          <Seg size="sm" label="Conditions" value={mixed ? 'mixed' : 'same'} onChange={v => setMixed(v === 'mixed')} options={[{ value: 'mixed', label: 'A mix' }, { value: 'same', label: 'As set up' }]} />
          <span className="text-[12.5px]" style={{ color: C.mute }}>{mixed ? 'Light, medium and fresh races, with the breeze from different directions.' : 'The wind set up above for every race, with its own shifts each time.'}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Cap>When the races open</Cap>
          <Seg size="sm" label="When the races open" value={schedule} onChange={setSchedule} options={(Object.keys(SCHEDULES) as Schedule[]).map(k => ({ value: k, label: SCHEDULES[k].label }))} />
          <span className="text-[12.5px]" style={{ color: C.mute }}>{SCHEDULES[schedule].hint}.</span>
        </div>
        <label className="flex flex-col gap-1.5">
          <Cap>First race opens</Cap>
          <input type="date" className={cx(field, '[color-scheme:dark]')} value={start} min={today} onChange={e => setStart(e.target.value || today)} />
        </label>
        <div className="flex flex-col gap-1.5">
          <Cap>Tries at each race</Cap>
          <Seg size="sm" label="Tries at each race" value={tries} onChange={setTries} options={[{ value: 'best', label: 'Best counts' }, { value: 'first', label: 'First counts' }]} />
          <span className="text-[12.5px]" style={{ color: C.mute }}>{tries === 'best' ? 'Sail each race as often as you like: your best result counts.' : 'One shot at each race, like real racing: it counts from the starting signal.'}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Cap>Drops</Cap>
          {races < 4
            ? <span className="text-[13.5px]" style={{ color: C.mute }}>With {races} races, every race counts.</span>
            : (
              <>
                <Seg size="sm" label="Drops" value={drops ? 'yes' : 'no'} onChange={v => setDrops(v === 'yes')} options={[{ value: 'yes', label: 'One after 4 races' }, { value: 'no', label: 'None' }]} />
                <span className="text-[12.5px]" style={{ color: C.mute }}>{drops ? `Each skipper's worst race drops out once four are sailed${races >= 8 ? ', two after eight' : ''}.` : 'Every race counts.'}</span>
              </>
            )}
        </div>
        {canEveryone && <div className="flex flex-col gap-1.5"><Cap>For</Cap><Seg size="sm" label="Who it's for" value={everyone ? 'all' : 'club'} onChange={v => setEveryone(v === 'all')} options={[{ value: 'club', label: 'This club' }, { value: 'all', label: 'Every club' }]} /></div>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="ml-auto" />
        <Btn type="button" quiet onClick={onDone}>Cancel</Btn>
        <Btn type="submit" primary disabled={busy}>{busy ? 'Setting it up…' : 'Set up the event'}</Btn>
      </div>
      {err && <p className="m-0 text-[13px] text-[#FCA5A5]">{err}</p>}
    </form>
  );
}
