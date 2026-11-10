// Club TV: the race full screen for the clubhouse screen or a projector. The map from the bank (when
// the venue is known), big sail numbers, the order and the clock. Esc or the button leaves.
import { useEffect } from 'react';
import TrackMap from './TrackMap';
import { useAnalysis, type TrackedRace } from './source';
import { gapText, rt } from './format';
import { feedFrom } from './feed';
import { Btn } from '../race-simulator/ui';

export default function TvView({ race, onClose }: { race: TrackedRace; onClose: () => void }) {
  const { a, standings } = useAnalysis(race, race.live ? undefined : race.t1);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const gun = race.gun;
  const last = a && race.course ? feedFrom(a, race.boats, race.course, race.now)[0] : null;
  const boat = (id: string) => race.boats.find(b => b.id === id)!;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#060B16] text-[#F1F4FA]" role="dialog" aria-modal="true" aria-label="Club TV">
      <div className="flex items-center gap-4 px-6 py-3">
        <h2 className="m-0 font-display text-[clamp(20px,2.2vw,34px)] font-bold">{race.name}</h2>
        {race.live && <span className="rounded-full bg-[#E11D38] px-3 py-1 text-[clamp(12px,1vw,16px)] font-bold tracking-[0.08em]">LIVE</span>}
        {gun != null && <span className="ml-auto font-mono text-[clamp(28px,3.4vw,56px)] font-semibold tabular-nums">{rt(race.now - gun)}</span>}
        <Btn small onClick={onClose} className={gun != null ? '' : 'ml-auto'}>Exit</Btn>
      </div>
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4">
        {race.status === 'ready' && race.course && (
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-[22px]"><TrackMap race={race} t={race.now} orient={race.venue ? 'bank' : 'wind'} trails={30} ladder={false} scale={1.5} className="absolute inset-0" label="The race, from the bank" />{last && <div className="absolute bottom-4 right-4 max-w-[min(560px,60vw)] rounded-[18px] border border-white/10 bg-[rgba(6,11,22,0.86)] px-4 py-3 text-[clamp(14px,1.4vw,24px)]">{last.text}</div>}</div>
        )}
        <ol className="order-first m-0 flex w-[clamp(220px,22vw,380px)] shrink-0 list-none flex-col gap-1 self-start overflow-hidden rounded-[22px] border border-white/10 bg-[rgba(6,11,22,0.82)] p-3">
          {standings.slice(0, 12).map(s => (
            <li key={s.boatId} className="grid grid-cols-[1.6em_6px_minmax(0,1fr)_auto] items-center gap-2.5 text-[clamp(15px,1.5vw,26px)]">
              <b className="text-center">{s.place}</b>
              <span aria-hidden="true" className="h-[1.2em] rounded-sm" style={{ background: boat(s.boatId).color }} />
              <b className="truncate">{boat(s.boatId).sail} <span className="font-normal opacity-70">{boat(s.boatId).name.split(' ')[0]}</span></b>
              <span className="font-mono opacity-80">{gapText(s).s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
