// A challenge: the race everyone sails the same way, its leaderboard, and the ghosts to race. Each
// row's ghost is that member's best race, sailed again alongside yours.
import { useEffect, useState } from 'react';
import { CLASSES } from '@/sim/classes';
import { VENUES } from '@/sim/venues';
import { Challenge, ChallengeEntry, closesText, isOpen, leaderboard } from './challenges';
import { fmt } from './stats';
import { AlfieOrb, Btn, C, Cap, Chip, compassName, cx, ordinal } from './ui';

/** "IOM · 8 boats · State skippers · LMRYC · Booragul · ENE breeze". */
export function challengeLine(c: Challenge): string {
  const s = c.settings;
  const parts = [CLASSES[s.classId]?.name ?? s.classId, `${s.fleetSize} boats`, `${s.level[0].toUpperCase()}${s.level.slice(1)} skippers`];
  const v = s.venue ? VENUES[s.venue] : undefined;
  if (v) parts.push(v.short);
  parts.push(`${s.windKnots != null ? `${Math.round(s.windKnots)} kn` : `${s.windStrength} wind`}${v && s.windFrom != null ? ` from the ${compassName(s.windFrom)}` : ''}`);
  parts.push(`${s.laps} lap${s.laps > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

export default function SimChallenge({ challenge, me, onSail, onBack, load = leaderboard }: {
  challenge: Challenge;
  /** Your user id, to find you on the board. */
  me: string | null;
  /** Sail it, against nobody's ghost or against an entry's. */
  onSail: (ghost: ChallengeEntry | null) => void;
  onBack: () => void;
  /** Where the leaderboard comes from (the database, unless a test says otherwise). */
  load?: (id: string) => Promise<ChallengeEntry[] | null>;
}) {
  const [board, setBoard] = useState<ChallengeEntry[] | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    void load(challenge.id).then(b => { if (live) setBoard(b); });
    return () => { live = false; };
  }, [challenge.id, load]);
  const open = isOpen(challenge);
  const rows = board === 'loading' || !board ? [] : board;
  const leader = rows[0] ?? null;
  const mine = rows.findIndex(e => e.user_id === me);

  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <Btn onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Simulator
          </Btn>
          <div className="min-w-0 flex-[1_1_320px]">
            <Cap>{challenge.club_id ? 'Club challenge' : 'Open challenge'}</Cap>
            <h1 className="m-0 mt-1 font-display text-[30px] font-bold tracking-[-0.02em]">{challenge.title}</h1>
            <p className="m-0 mt-1 text-[14px]" style={{ color: C.mute }}>{challengeLine(challenge)}</p>
          </div>
          <Chip tone={open ? 'blue' : 'plain'}>{closesText(challenge)}</Chip>
        </header>

        {challenge.description && <p className="m-0 max-w-[720px] text-[15px] leading-normal">{challenge.description}</p>}

        <section className="flex flex-wrap items-center gap-3 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
          <AlfieOrb size={30} />
          <p className="m-0 min-w-0 flex-[1_1_300px] text-[14px] leading-normal">
            Everyone sails exactly the same race: the same fleet, the same wind and the same shifts. {leader ? <>Race <b>{leader.user_id === me ? 'your own best' : `${leader.display_name}'s`}</b> ghost to see where the time is.</> : 'Be the first on the board.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {open && <Btn primary onClick={() => onSail(null)}>Sail it</Btn>}
            {open && leader && <Btn onClick={() => onSail(leader)}>Race the leader's ghost</Btn>}
          </div>
        </section>

        <section className="flex flex-col rounded-[20px] border border-white/[0.07] bg-white/[0.025] px-5 py-4" aria-labelledby="lb-title">
          <div className="flex items-center gap-2 pb-2">
            <h2 id="lb-title" className="m-0 text-[16px] font-semibold">Leaderboard</h2>
            {mine >= 0 && <Chip tone="good">You're {ordinal(mine + 1)}</Chip>}
            <span className="ml-auto text-[12.5px]" style={{ color: C.mute }}>{rows.length ? `${rows.length} ${rows.length === 1 ? 'skipper' : 'skippers'}` : ''}</span>
          </div>
          {board === 'loading' && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>Loading the leaderboard…</p>}
          {board === null && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>Couldn't load the leaderboard just now.</p>}
          {board !== 'loading' && board && !rows.length && <p className="m-0 border-t border-white/[0.055] py-3 text-[13.5px]" style={{ color: C.mute }}>No one has sailed it yet.</p>}
          {rows.map((e, k) => (
            <div key={e.id} className={cx('grid grid-cols-[34px_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-white/[0.055] py-2.5', e.user_id === me && 'bg-[rgba(42,147,255,0.06)]')}>
              <span className="font-display text-[15px] font-bold tabular-nums">{k + 1}</span>
              <div className="min-w-0">
                <p className="m-0 truncate text-[14px] font-semibold">{e.display_name}{e.user_id === me ? ' (you)' : ''}</p>
                <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{e.sail_number ? `Sail ${e.sail_number} · ` : ''}{e.place ? `${ordinal(e.place)} of the fleet` : e.status.toUpperCase()} · {new Date(e.sailed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p>
              </div>
              <span className="font-display text-[15px] tabular-nums">{e.status === 'finished' && e.elapsed_s != null ? fmt(e.elapsed_s) : e.status.toUpperCase()}</span>
              {open ? <Btn small quiet onClick={() => onSail(e)}>Race ghost</Btn> : <span />}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
