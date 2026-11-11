// The Scenario Lab: boat-speed runs, boat-handling drills and classic race moments, each a real scene
// on the engine. Play one until you win it, or watch Alfie's way through it.
import { LAB, LAB_GROUPS, LabMoment } from '@/sim/training';
import type { TrainingProgress } from './progress';
import { Btn, C, Cap, Chip, Page } from './ui';

function MomentCard({ m, progress, onPlay }: { m: LabMoment; progress: TrainingProgress; onPlay: (id: string, watch: boolean) => void }) {
  const r = progress.lab[m.id];
  return (
    <div className="flex flex-col gap-3 sim-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Cap>{m.skill}</Cap>
          <p className="m-0 mt-1 text-[16px] font-semibold leading-snug">{m.title}</p>
        </div>
        {r?.won ? <Chip tone="good">Won</Chip> : r ? <Chip>{r.tries} {r.tries === 1 ? 'try' : 'tries'}</Chip> : null}
      </div>
      <p className="m-0 flex-1 text-[13.5px] leading-normal" style={{ color: C.mute }}>{m.blurb}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Btn small primary onClick={() => onPlay(m.id, false)}>{r ? 'Play again' : 'Play'}</Btn>
        {m.solution && <Btn small onClick={() => onPlay(m.id, true)}>Watch Alfie's way</Btn>}
      </div>
    </div>
  );
}

export default function SimLab({ progress, onPlay, onBack }: { progress: TrainingProgress; onPlay: (id: string, watch: boolean) => void; onBack: () => void }) {
  const won = LAB.filter(m => progress.lab[m.id]?.won).length;
  return (
    <Page onBack={onBack} title="Scenario Lab" text="Boat speed, boat handling and classic racing moments, set up mid-race in real wind. Replay each one until you win it."
      side={<Chip tone={won === LAB.length ? 'good' : 'blue'}>{won} of {LAB.length} won</Chip>}>
        {LAB_GROUPS.map(g => {
          const ms = LAB.filter(m => m.group === g.id);
          const done = ms.filter(m => progress.lab[m.id]?.won).length;
          return (
            <section key={g.id} aria-labelledby={`lab-${g.id}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id={`lab-${g.id}`} className="sim-h2">{g.title}</h2>
                <p className="m-0 min-w-0 flex-1 basis-[260px] text-[13.5px]" style={{ color: C.mute }}>{g.text}</p>
                <span className="text-[12.5px] font-semibold" style={{ color: C.faint }}>{done} of {ms.length} won</span>
              </div>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
                {ms.map(m => <MomentCard key={m.id} m={m} progress={progress} onPlay={onPlay} />)}
              </div>
            </section>
          );
        })}
    </Page>
  );
}
