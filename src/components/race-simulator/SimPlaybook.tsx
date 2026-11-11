// The Playbook: race strategy and tactics, a play at a time, each with the practice that goes with it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CHAPTERS, PLAYS, READING, playPicture, practiceLink, type Play } from './playbook';
import { drawDiagram, sceneDiagram } from './diagram';
import type { TrainLink } from './stats';
import { AlfieOrb, Btn, C, Cap, Chip, cx } from './ui';

/**
 * The play, drawn: Alfie sailing the drill that goes with it, run on the real engine and seen from
 * above. Worked out when the play is opened, not before.
 */
function PlayPicture({ p }: { p: Play }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pic = useMemo(() => playPicture(p), [p]);
  const data = useMemo(() => { try { return pic ? sceneDiagram(pic.scene, pic.plan, pic.seconds, { player: 'You' }, pic.seed) : null; } catch { return null; } }, [pic]);
  useEffect(() => {
    const cv = ref.current; if (!cv || !data) return;
    const draw = () => {
      const w = cv.clientWidth || 560, h = cv.clientHeight || 300;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const ctx = cv.getContext('2d'); if (ctx) drawDiagram(ctx, data, w, h, dpr);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [data]);
  if (!pic || !data) return null;
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <canvas ref={ref} className="block h-[260px] w-full rounded-2xl sm:h-[300px]" role="img" aria-label={`From above: Alfie sailing "${pic.of}", the practice for this play.`} />
      <figcaption className="text-[12.5px] leading-snug" style={{ color: C.faint }}>Alfie sailing "{pic.of}" ({pic.seconds} seconds of it), from above with the wind coming down the picture: each boat where it begins (solid), its track, and where it ends up (faint).</figcaption>
    </figure>
  );
}

function PlayCard({ p, n, open, onLink }: { p: Play; n: number; open: boolean; onLink: (l: TrainLink) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [open]);
  const [shown, setShown] = useState(open);
  const part = (label: string, body: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <Cap>{label}</Cap>
      {body}
    </div>
  );
  return (
    <details ref={ref} open={open || undefined} onToggle={e => setShown((e.currentTarget as HTMLDetailsElement).open)} className="group rounded-[18px] border border-white/[0.08] bg-white/[0.03] open:bg-white/[0.045]" style={{ scrollMarginTop: 16 }}>
      <summary className="flex cursor-pointer list-none items-start gap-3.5 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(77,163,255,0.14)] text-[12.5px] font-bold tabular-nums text-[#A9D2FF]">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold leading-snug">{p.title}</span>
          <span className="mt-0.5 block text-[13.5px] leading-snug" style={{ color: C.mute }}>{p.when}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0 opacity-60 transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
        {shown && <PlayPicture p={p} />}
        {part('The play', (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {p.how.map((x, i) => (
              <li key={x} className="flex items-start gap-2.5 text-[14.5px] leading-[1.5]">
                <span aria-hidden="true" className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[11px] font-bold tabular-nums">{i + 1}</span>
                <span>{x}</span>
              </li>
            ))}
          </ol>
        ))}
        {part('Why it works', <p className="m-0 text-[14.5px] leading-[1.5]">{p.why}</p>)}
        {part('The usual mistake', <p className="m-0 text-[14.5px] leading-[1.5] text-[#FFD7B0]">{p.mistake}</p>)}
        {p.radio && part('From the bank', <p className="m-0 text-[14.5px] leading-[1.5]">{p.radio}</p>)}
        <div className="flex items-center gap-2.5 rounded-xl border border-[rgba(77,163,255,0.28)] bg-[rgba(77,163,255,0.08)] px-3.5 py-2.5">
          <AlfieOrb size={22} />
          <p className="m-0 text-[14.5px] font-semibold">{p.remember}</p>
        </div>
        {part('Practise it', (
          <div className="flex flex-wrap gap-2">
            {p.practise.map((l, i) => { const t = practiceLink(l); return <Btn key={`${l.kind}:${l.id}`} small primary={i === 0} onClick={() => onLink(t)}>{t.label}</Btn>; })}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function SimPlaybook({ onBack, onLink, focus = null }: { onBack: () => void; onLink: (l: TrainLink) => void; focus?: string | null }) {
  let n = 0;
  return (
    <div className="sim-page min-h-full text-[14px] text-[#F1F4FA]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto flex max-w-[980px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-8">
        <header className="flex flex-wrap items-center gap-4">
          <Btn onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </Btn>
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 className="m-0 font-display text-[30px] font-bold tracking-[-0.02em]">The Playbook</h1>
            <p className="m-0 mt-1 text-[14px]" style={{ color: C.mute }}>Race strategy and tactics for radio sailing. Read a play, practise it here, then take the one line to the pond.</p>
          </div>
          <Chip tone="blue">{PLAYS.length} plays</Chip>
        </header>
        {CHAPTERS.map(c => {
          const plays = PLAYS.filter(p => p.chapter === c.id);
          return (
            <section key={c.id} aria-labelledby={`pb-${c.id}`} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id={`pb-${c.id}`} className="m-0 font-display text-[21px] font-bold tracking-[-0.01em]">{c.title}</h2>
                <p className="m-0 min-w-0 flex-1 basis-[260px] text-[13.5px]" style={{ color: C.mute }}>{c.text}</p>
              </div>
              <div className="flex flex-col gap-2.5">
                {plays.map(p => <PlayCard key={p.id} p={p} n={++n} open={focus === p.id} onLink={onLink} />)}
              </div>
            </section>
          );
        })}
        <section aria-labelledby="pb-reading" className={cx('flex flex-col gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-5 py-5')}>
          <h2 id="pb-reading" className="m-0 font-display text-[19px] font-bold">Go deeper</h2>
          <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>These plays are the established principles of fleet racing, written afresh for radio sailing. The works they come from:</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {READING.map(r => (
              <li key={r.title} className="text-[14px] leading-snug">
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="font-semibold text-[#7DBBFF] hover:text-[#A9D2FF]">{r.title}</a> : <span className="font-semibold">{r.title}</span>}
                <span style={{ color: C.mute }}> · {r.by}. {r.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
