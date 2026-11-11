// A virtual race event: its races (each open for a while, the same race for everyone), your next
// race, each race's results and ghosts, and the series standings, scored like a regatta with drops.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChallengeEntry } from './challenges';
import type { EventRace, SimEvent as VirtualEvent } from './events';
import { breezeText, eventEntries, eventLine, eventState, eventStatusText, seriesRaces, whenText } from './events';
import { Score, dropsText, raceResults, scoreText, standings } from './series';
import { fmt } from './stats';
import { AlfieOrb, Btn, C, Chip, compassName, cx, ordinal, Page } from './ui';

export interface SimEventProps {
  event: VirtualEvent;
  /** Your user id, to find you in the results. */
  me: string | null;
  /** Can you run this event (its club's admins, and super admins)? */
  admin?: boolean;
  /** Sail a race: for real, or for practice (your first try is used); against nobody's ghost or an entry's. */
  onSail: (race: EventRace, opts: { practice: boolean; ghost: ChallengeEntry | null }) => void;
  onBack: () => void;
  onDelete?: () => void;
  /** Where the results come from (the database, unless a test says otherwise). */
  load?: (ev: VirtualEvent) => Promise<ChallengeEntry[] | null>;
  now?: number;
}

const card = 'sim-card';
const CARD_TINT = 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))';
const HIGHLIGHT = 'rgba(42,147,255,0.06)';
/** A cell that stays put while the races scroll: the card's own colour, so the races pass beneath it. */
const solid = (mine: boolean) => ({ background: `${mine ? `linear-gradient(${HIGHLIGHT}, ${HIGHLIGHT}), ` : ''}${CARD_TINT}, ${C.bg}` });

function cellTone(s: Score | null): string {
  if (!s || s.pending || !s.counted) return 'text-[rgba(235,240,255,0.45)]';
  if (s.dropped) return 'text-[rgba(235,240,255,0.5)]';
  if (s.place === 1) return 'font-bold text-[#FCD34D]';
  return '';
}

export default function SimEvent({ event: ev, me, admin = false, onSail, onBack, onDelete, load = eventEntries, now: nowProp }: SimEventProps) {
  const [entries, setEntries] = useState<ChallengeEntry[] | null | 'loading'>('loading');
  const [shown, setShown] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Open at the top, wherever the page you came from was scrolled to.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [ev.id]);
  useEffect(() => {
    let live = true;
    void load(ev).then(es => { if (live) setEntries(es); });
    return () => { live = false; };
  }, [ev, load]);
  // The time as of the results coming in (so the standings, scored by the club's results engine,
  // aren't worked out again on every render).
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  useEffect(() => { setLoadedAt(Date.now()); }, [entries]);
  const now = nowProp ?? loadedAt;
  const st = eventState(ev, now);
  const all = useMemo(() => (entries === 'loading' || !entries ? [] : entries), [entries]);
  const races = useMemo(() => [...ev.races].sort((a, b) => a.race_no - b.race_no), [ev.races]);
  const table = useMemo(() => standings(seriesRaces(ev, all, now), ev.drops), [ev, all, now]);
  const mineIn = (r: EventRace) => all.find(e => e.challenge_id === r.id && e.user_id === me) ?? null;
  const firstTry = ev.tries === 'first';
  const pendingAny = table.some(r => r.scores.some(s => s?.pending));
  const notCountedAny = table.some(r => r.scores.some(s => s && !s.counted && s.place !== null));
  const cellTitle = (sc: Score | null) => !sc ? undefined
    : sc.pending ? (sc.counted ? `Not sailed yet: counts as not sailed (${sc.points}) until it is` : 'Not sailed yet')
      : !sc.counted && sc.place !== null ? "Doesn't count yet: a race counts once at least half the skippers have sailed it, or when it closes"
        : undefined;
  const opened = races.filter(r => Date.parse(r.opens_at) <= now);
  const myRow = table.find(r => r.userId === me) ?? null;

  // Your next race: the first open one you haven't sailed (or, best try, any open one).
  const todo = st.open.find(r => !mineIn(r)) ?? null;
  const again = !todo ? st.open[0] ?? null : null;
  const mineAgain = again ? mineIn(again) : null;
  const resultText = (e: ChallengeEntry | null) => !e ? null : e.status === 'started' ? 'Started, not finished' : e.status === 'finished' && e.elapsed_s != null ? `${fmt(e.elapsed_s)}` : e.status.toUpperCase();

  return (
    <Page rootRef={top} onBack={onBack} kicker={ev.club_id ? 'Club event' : 'Open event'} title={ev.title} text={eventLine(ev)}
      side={<Chip tone={st.open.length ? 'blue' : 'plain'}>{eventStatusText(ev, now)}</Chip>}>

        {ev.description && <p className="m-0 max-w-[720px] text-[15px] leading-normal">{ev.description}</p>}

        <div className="flex flex-wrap gap-2">
          <Chip tone={firstTry ? 'warn' : 'plain'}>{firstTry ? 'Your first try at each race counts' : 'Your best try at each race counts'}</Chip>
          <Chip>{dropsText(ev.drops, races.length)}</Chip>
          <Chip>The same fleet, wind and shifts for everyone</Chip>
        </div>

        {/* Your next race. */}
        <section className={cx(card, 'flex flex-wrap items-center gap-3 p-5')} aria-label="Your next race">
          <AlfieOrb size={30} />
          <p className="m-0 min-w-0 flex-[1_1_320px] text-[15px] leading-normal">
            {todo ? (
              <>
                <b>Race {todo.race_no}</b> is open{todo.closes_at ? <> until <b>{new Date(todo.closes_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</b></> : null}: {breezeText(todo.settings).toLowerCase()}.{' '}
                {firstTry ? 'Your first try counts, from the starting signal, so get ready before you go.' : 'Sail it as often as you like: your best result counts.'}
              </>
            ) : again ? (
              firstTry
                ? <>You've had your try at <b>race {again.race_no}</b>{mineAgain ? <> ({resultText(mineAgain)})</> : null}. {st.next ? `Race ${st.next.race_no} opens ${whenText(st.next.opens_at, now)}.` : ''} You can sail it again for practice.</>
                : <>Race {again.race_no} is open {again.closes_at ? `until ${new Date(again.closes_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}. Your best so far: {resultText(mineAgain)}. Sail it again to better it.</>
            ) : st.done ? (
              <>The event is over. {table[0] ? <><b>{table[0].name}</b> won it{table[0].userId === me ? ': that’s you' : ''}.</> : 'Nobody sailed it.'}{myRow && table[0]?.userId !== me ? ` You were ${ordinal(myRow.rank)} of ${table.length}.` : ''}</>
            ) : st.next ? (
              <>Race {st.next.race_no} opens {whenText(st.next.opens_at, now)}.</>
            ) : <>No race is open just now.</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {todo && <Btn primary onClick={() => onSail(todo, { practice: false, ghost: null })}>Sail race {todo.race_no}</Btn>}
            {!todo && again && <Btn primary={!firstTry} onClick={() => onSail(again, { practice: firstTry, ghost: null })}>{firstTry ? 'Sail it for practice' : `Sail race ${again.race_no} again`}</Btn>}
          </div>
        </section>

        {/* The races. */}
        <section className={cx(card, 'flex flex-col px-5 py-4')} aria-labelledby="races-title">
          <h2 id="races-title" className="sim-h3 pb-2">Races</h2>
          {races.map(r => {
            const open = st.open.includes(r);
            const closed = r.closes_at != null && Date.parse(r.closes_at) <= now;
            const notYet = Date.parse(r.opens_at) > now;
            const mine = mineIn(r);
            const res = raceResults(all.filter(e => e.challenge_id === r.id).map(e => ({ userId: e.user_id, name: e.display_name, sail: e.sail_number, status: e.status, elapsed: e.elapsed_s, sailedAt: e.sailed_at })));
            const myPlace = res.find(x => x.entry.userId === me)?.place ?? null;
            const s = r.settings;
            return (
              <div key={r.id} className="border-t border-white/[0.055] py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-[74px] font-display text-[16px] font-bold">Race {r.race_no}</span>
                  <div className="min-w-0 flex-[1_1_240px]">
                    <p className="m-0 text-[14px]">{breezeText(s)}{s.venue && s.windFrom != null ? `, from the ${compassName(s.windFrom)}` : ''}</p>
                    <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>
                      {notYet ? `Opens ${whenText(r.opens_at, now)}` : open ? `Open · closes ${r.closes_at ? whenText(r.closes_at, now) : 'later'}` : 'Closed'}
                      {res.length ? ` · ${res.length} sailed` : ''}
                    </p>
                  </div>
                  {mine && <Chip tone={myPlace === 1 ? 'good' : 'blue'}>{myPlace ? `You: ${ordinal(myPlace)}` : `You: ${resultText(mine)}`}</Chip>}
                  {open && (!mine || !firstTry) && <Btn small primary onClick={() => onSail(r, { practice: false, ghost: null })}>{mine ? 'Sail again' : 'Sail it'}</Btn>}
                  {!notYet && res.length > 0 && <Btn small quiet aria-expanded={shown === r.id} onClick={() => setShown(v => (v === r.id ? null : r.id))}>{shown === r.id ? 'Hide results' : 'Results'}</Btn>}
                </div>
                {shown === r.id && (
                  <div className="mt-2 flex flex-col rounded-2xl bg-black/20 px-3 py-1">
                    {open && <p className="m-0 py-2 text-[12.5px]" style={{ color: C.mute }}>Ghosts open once the race closes, so nobody can follow the leader while it still counts.</p>}
                    {res.map(({ entry: e, place }) => (
                      <div key={e.userId} className={cx('grid grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-white/[0.055] py-2 first:border-t-0', e.userId === me && 'bg-[rgba(42,147,255,0.06)]')}>
                        <span className="font-display text-[14px] font-bold tabular-nums">{place ?? '–'}</span>
                        <span className="min-w-0 truncate text-[14px]">{e.name}{e.userId === me ? ' (you)' : ''}{e.sail ? <span style={{ color: C.mute }}> · {e.sail}</span> : null}</span>
                        <span className="font-display text-[14px] tabular-nums">{e.status === 'finished' && e.elapsed != null ? fmt(e.elapsed) : e.status === 'started' ? (open ? 'Racing' : 'DNF') : e.status.toUpperCase()}</span>
                        {(closed || e.userId === me) && e.status === 'finished'
                          ? <Btn small quiet onClick={() => onSail(r, { practice: !open || firstTry, ghost: all.find(x => x.challenge_id === r.id && x.user_id === e.userId) ?? null })}>Race ghost</Btn>
                          : <span />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* The standings. */}
        <section className={cx(card, 'flex flex-col px-5 py-4')} aria-labelledby="standings-title">
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <h2 id="standings-title" className="sim-h3">Standings</h2>
            {myRow && <Chip tone="good">You're {ordinal(myRow.rank)}</Chip>}
            {!st.done && opened.length > 0 && <span className="ml-auto text-[12.5px]" style={{ color: C.mute }}>Provisional</span>}
          </div>
          {entries === 'loading' && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>Loading the results…</p>}
          {entries === null && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>Couldn't load the results just now.</p>}
          {entries !== 'loading' && entries && !table.length && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>{opened.length ? 'No one has sailed a race yet.' : 'The standings start when the first race opens.'}</p>}
          {table.length > 0 && (
            // On a phone the races scroll sideways, with who and their net score kept in view.
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-[0.06em]" style={{ color: C.mute }}>
                    <th className="sticky left-0 z-[1] py-2 pr-3 font-semibold" style={solid(false)}>Skipper</th>
                    {races.map(r => <th key={r.id} className="px-1.5 py-2 text-center font-semibold">R{r.race_no}</th>)}
                    <th className="sticky right-0 z-[1] py-2 pl-3 text-right font-semibold" style={solid(false)}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(row => {
                    const mine = row.userId === me;
                    return (
                      <tr key={row.userId} className="border-t border-white/[0.055]" style={mine ? { background: HIGHLIGHT } : undefined}>
                        <td className="sticky left-0 z-[1] max-w-[46vw] py-2.5 pr-3 sm:max-w-[260px]" style={solid(mine)}>
                          <span className="flex items-baseline gap-2.5">
                            <span className="w-5 shrink-0 font-display font-bold tabular-nums">{row.rank}</span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{row.name}{mine ? ' (you)' : ''}</span>
                              {row.sail && <span className="block text-[12px]" style={{ color: C.mute }}>Sail {row.sail}</span>}
                            </span>
                          </span>
                        </td>
                        {row.scores.map((sc, k) => (
                          <td key={k} className={cx('whitespace-nowrap px-1.5 py-2.5 text-center tabular-nums', cellTone(sc))} title={cellTitle(sc)}>{scoreText(sc)}</td>
                        ))}
                        <td className="sticky right-0 z-[1] py-2.5 pl-3 text-right font-display font-bold tabular-nums" style={solid(mine)}>{Number.isInteger(row.net) ? row.net : row.net.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {table.length > 0 && (
            <p className="m-0 mt-2 text-[12.5px] leading-normal" style={{ color: C.mute }}>
              Scored with AlfiePRO's race results, as for real racing: points for your place in each race, and a race not finished or not sailed scores {table.length + 1}, one more than the skippers in the event. Brackets: a race dropped.
              {pendingAny ? ' –: not sailed yet.' : ''}
              {notCountedAny ? ' Faint: a race still open, which counts once at least half the skippers have sailed it.' : ''}
            </p>
          )}
        </section>

        {admin && onDelete && (
          <div className="flex flex-wrap items-center gap-3">
            {!confirmDelete
              ? <Btn quiet small onClick={() => setConfirmDelete(true)}>Remove this event</Btn>
              : (
                <>
                  <span className="text-[13.5px]">Remove the event, its races and everyone's results? This can't be undone.</span>
                  <Btn small onClick={() => setConfirmDelete(false)}>Keep it</Btn>
                  <Btn small primary onClick={onDelete}>Remove it</Btn>
                </>
              )}
          </div>
        )}
    </Page>
  );
}
