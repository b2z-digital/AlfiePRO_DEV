// A live race room: the code to share, the race the host has set up, who's in and who's ready, and
// the host's Start. Everyone's screen goes to the race together when the host starts it.
import { useEffect, useReducer, useState } from 'react';
import { VENUES } from '@/sim/venues';
import { CLASSES } from '@/sim/classes';
import { cleanLook } from '@/sim/look';
import type { LiveRoom, RoomSettings } from './live';
import { Btn, C, Cap, Chip, cx, Page } from './ui';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** One line for the race the host has set up. */
export function roomTitle(s: RoomSettings): string {
  const where = s.venue && VENUES[s.venue] ? VENUES[s.venue].short : 'Practice pond';
  return `${CLASSES[s.classId].name} at ${where}`;
}

function details(s: RoomSettings): string[] {
  const wind = s.windKnots != null ? `${Math.round(s.windKnots)} kn` : `${cap(s.windStrength)} wind`;
  const sea = s.seaState === 'rough' ? 'rough water' : s.seaState === 'chop' ? 'choppy water' : 'flat water';
  return [
    `${wind}, ${s.windCharacter}`,
    cap(sea),
    `${s.laps} lap${s.laps === 1 ? '' : 's'}, ${s.length} course`,
    `${s.fleetSize} boats, AI skippers at ${cap(s.level)} level`,
    `${s.sequenceSeconds >= 120 ? `${Math.round(s.sequenceSeconds / 60)} minute` : `${s.sequenceSeconds} second`} start`,
  ];
}

export default function SimLive({ room, myId, onLeave, water = 'ok' }: {
  room: LiveRoom; myId: string; onLeave: () => void;
  /** Is the race's water on this device? A club's own water is fetched when the host's race arrives. */
  water?: 'ok' | 'loading' | 'missing';
}) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => room.subscribe(bump), [room]);
  const [copied, setCopied] = useState(false);
  // Joined with a code nobody's using: say so after a few seconds.
  const [lonely, setLonely] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setLonely(true), 6000); return () => window.clearTimeout(id); }, []);

  // Without the race's water you can't be ready.
  useEffect(() => { if (water !== 'ok' && room.ready && !room.isHost) room.setReady(false); }, [water, room, room.ready]);

  const s = room.settings;
  const host = room.isHost;
  const others = room.people.filter(p => p.key !== room.key);
  const notReady = room.people.filter(p => !p.ready && p.key !== room.key);
  const copy = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* the code is on screen to read out */ }
  };
  const startHint = !s ? null
    : notReady.length ? `Waiting for ${notReady.map(p => p.name).join(', ')} to be ready.`
      : others.length ? "Everyone's ready." : 'Nobody else is in yet. You can race on your own, or wait for others.';

  return (
    <Page onBack={onLeave} backLabel="Leave" backAria="Leave the room" title="Live race" text="Each of you sails your own boat from your own device. AI skippers fill the rest of the fleet.">

        <div className="flex flex-wrap items-start gap-5">
          <section className="flex min-w-0 flex-[1_1_380px] flex-col gap-5 sim-card p-5 sm:p-6" aria-labelledby="room-code">
            <div className="flex flex-col gap-2">
              <Cap>Room code</Cap>
              <div className="flex flex-wrap items-center gap-3">
                <p id="room-code" className="m-0 font-display text-[40px] font-bold tracking-[0.18em] tabular-nums">{room.code}</p>
                <Btn small onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</Btn>
              </div>
              <p className="m-0 text-[13.5px] leading-snug" style={{ color: C.mute }}>Give this code to the members you're racing. They join from the Sailing Academy, under Race members live.{host ? " The room also shows in your club's open races until you start." : ''}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <Cap>The race</Cap>
              {s ? (
                <>
                  <p className="m-0 text-[17px] font-semibold">{roomTitle(s)}</p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13.5px]" style={{ color: C.mute }}>
                    {details(s).map(d => <li key={d}>{d}</li>)}
                  </ul>
                  {host && <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>It's the race you set up on the Sailing Academy home page. To change it, leave and open a new room.</p>}
                </>
              ) : (
                <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>
                  {lonely && others.length === 0 ? "Nobody's in this room yet. Check the code with whoever opened it." : 'Waiting for the host…'}
                </p>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-4 sim-card p-5 sm:p-6" aria-labelledby="crew-title">
            <div className="flex items-center gap-2">
              <h2 id="crew-title" className="sim-h3">Who's racing</h2>
              <Chip className="ml-auto">{room.people.length} {room.people.length === 1 ? 'person' : 'people'}</Chip>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {room.people.map(p => {
                const sail = s ? p.sails[s.classId] : undefined;
                const hull = (s ? cleanLook(p.looks?.[s.classId]) : undefined)?.hull;
                const you = p.key === room.key;
                return (
                  <li key={p.key} className={cx('flex items-center gap-3 rounded-[14px] px-3.5 py-3', you ? 'bg-[rgba(30,108,255,.12)]' : 'bg-white/[0.035]')}>
                    <span className="inline-flex h-9 min-w-[44px] items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.07] px-2 font-display text-[15px] font-bold tabular-nums">
                      {hull && <span aria-hidden="true" className="h-3 w-3 shrink-0" style={{ borderRadius: '50%', background: hull, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.35)' }} />}
                      {sail || '—'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[14.5px] font-semibold">{p.name}{you && p.id === myId ? ' (you)' : ''}</p>
                      <p className="m-0 text-[12.5px]" style={{ color: C.mute }}>{p.host ? 'Opened the room' : 'Joined'}{p.autoTrim ? ' · auto-trim' : ''}</p>
                    </div>
                    {p.host ? <Chip tone="blue">Host</Chip> : p.ready ? <Chip tone="good">Ready</Chip> : <Chip>Not ready</Chip>}
                  </li>
                );
              })}
            </ul>
            {room.note && <p className="m-0 text-[13.5px]" style={{ color: '#FFB86B' }}>{room.note}</p>}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {host ? (
                <Btn primary disabled={!room.canStart} onClick={() => room.start()} className="!h-11 !px-5 !text-[14.5px]">Start the race</Btn>
              ) : (
                <Btn primary={!room.ready} disabled={water !== 'ok'} onClick={() => room.setReady(!room.ready)} className="!h-11 !px-5 !text-[14.5px]" aria-pressed={room.ready}>{room.ready ? "I'm not ready" : "I'm ready"}</Btn>
              )}
              <p className="m-0 min-w-0 flex-1 text-[13px]" style={{ color: water === 'missing' ? '#FFB86B' : C.mute }}>
                {water === 'loading' ? "Getting this race's water…"
                  : water === 'missing' ? "This race is on a club's water this device can't load (it may still be a draft). Ask the host to pick another venue."
                    : host ? startHint : room.ready ? 'The host starts the race when everyone is ready.' : 'Tap Ready when you are, then the host starts the race.'}
              </p>
            </div>
          </section>
        </div>
    </Page>
  );
}
