// The Start Trainer: twelve drills in four groups, each with your best stars and score, plus a full
// start against your chosen fleet.
import { DRILLS, Drill, DrillGroup } from '@/sim/training';
import type { TrainingProgress } from './progress';
import { drillStars } from './progress';
import { Btn, C, Cap, Chip, Tile } from './ui';

const GROUPS: { id: DrillGroup; text: string }[] = [
  { id: 'Timing', text: 'Time on distance: when to go, and how to arrive at full speed.' },
  { id: 'Position', text: 'The favoured end, and getting the spot you want.' },
  { id: 'Tactics', text: 'Port-tack starts and crowded lines.' },
  { id: 'Recovery', text: 'When it goes wrong at the gun.' },
];

function StarRow({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map(i => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill={i < n ? '#FFC94A' : 'rgba(255,255,255,0.12)'} />
        </svg>
      ))}
    </span>
  );
}

function DrillCard({ d, progress, onPlay }: { d: Drill; progress: TrainingProgress; onPlay: (d: Drill) => void }) {
  const r = progress.drills[d.id];
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-start gap-2">
        <p className="m-0 flex-1 text-[15px] font-semibold leading-snug">{d.title}</p>
        <StarRow n={r?.stars ?? 0} />
      </div>
      <p className="m-0 flex-1 text-[13.5px] leading-normal" style={{ color: C.mute }}>{d.blurb}</p>
      <div className="flex items-center gap-2">
        <Btn small primary onClick={() => onPlay(d)}>{r ? 'Go again' : 'Start drill'}</Btn>
        {r?.best != null && <span className="text-[12.5px]" style={{ color: C.mute }}>Best: {d.scoreText(r.best)}</span>}
        {r && r.best == null && <span className="text-[12.5px]" style={{ color: C.mute }}>{r.tries} {r.tries === 1 ? 'try' : 'tries'}</span>}
      </div>
    </div>
  );
}

export default function SimTrainer({ progress, onPlay, onFullStart, onBack }: {
  progress: TrainingProgress; onPlay: (d: Drill) => void; onFullStart: () => void; onBack: () => void;
}) {
  const stars = drillStars(progress);
  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center gap-4">
          <Btn onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Simulator
          </Btn>
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="m-0 font-display text-[30px] font-bold tracking-[-0.02em]">Start Trainer</h1>
            <p className="m-0 mt-1 text-[14px]" style={{ color: C.mute }}>Twelve short drills on the real engine. Each one changes a little every time, so a good score means you've got it.</p>
          </div>
          <Chip>{stars.got} of {stars.of} stars</Chip>
        </header>

        <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-5">
          <Tile size={40}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
          </Tile>
          <div className="min-w-0 flex-[1_1_260px]">
            <p className="m-0 text-[15px] font-semibold">Full start practice</p>
            <p className="m-0 mt-0.5 text-[13.5px]" style={{ color: C.mute }}>The whole start sequence against your chosen fleet, then a start report: how late, how fast, and how far from the favoured end.</p>
          </div>
          <Btn onClick={onFullStart}>Practise a full start</Btn>
        </section>

        {GROUPS.map(g => (
          <section key={g.id} className="flex flex-col gap-3" aria-labelledby={`grp-${g.id}`}>
            <div>
              <Cap>{g.id}</Cap>
              <p id={`grp-${g.id}`} className="m-0 mt-1 text-[13.5px]" style={{ color: C.mute }}>{g.text}</p>
            </div>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
              {DRILLS.filter(d => d.group === g.id).map(d => <DrillCard key={d.id} d={d} progress={progress} onPlay={onPlay} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
