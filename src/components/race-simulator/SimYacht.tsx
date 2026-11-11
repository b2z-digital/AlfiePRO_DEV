// Design your yacht: your boat on the water in front of you, your saved yachts down one side and
// the paint locker down the other. Start a new one, name her, pick her class, then her hull and
// deck patches, the tape up her jib, the patches at the corners of her sails and her number. Every change
// is on the boat as you make it and saved as you go; the one you race in each class is yours to pick.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, type ClassId } from '@/sim/classes';
import { patchShapes } from './boat3d';
import type { SimIdentity } from './identity';
import { Btn, C, Cap, cx } from './ui';
import { COUNTRIES, DECK_COLOURS, HULL_COLOURS, MAX_YACHTS, SAIL_COLOURS, cleanName, dropYacht, lookOf, newYacht, paintName, putYacht, raceYacht, sailOf, surprise, yachtFor, type Paint, type Yacht, type Yard } from './yacht';
import YachtStage, { type StagePart } from './YachtStage';

const CLASS_ORDER: ClassId[] = ['IOM', '10R', 'M', 'DF95', 'DF65'];
const CLASS_NOTE: Record<ClassId, string> = { IOM: 'One Metre', '10R': 'Ten Rater', M: 'Marblehead', DF95: 'DragonFlite 95', DF65: 'DragonForce 65' };
type Part = 'boat' | Exclude<StagePart, 'all'>;
const PARTS: { id: Part; label: string }[] = [{ id: 'boat', label: 'Boat' }, { id: 'hull', label: 'Hull' }, { id: 'tapes', label: 'Jib tape' }, { id: 'patches', label: 'Patches' }, { id: 'number', label: 'Number' }];

/** A pot of paint: round, glossy, ringed when it's the one in use. */
function Pot({ paint, on, onPick, size = 44 }: { paint: Paint | null; on: boolean; onPick: () => void; size?: number }) {
  const hex = paint?.hex ?? null;
  return (
    <button type="button" aria-pressed={on} aria-label={paint ? paint.name : 'None'} title={paint ? paint.name : 'None'} onClick={onPick}
      // (Round by its own style, not the rounded-full class: the app theme turns a row of
      // rounded-full buttons into a segmented control.)
      className={cx('relative shrink-0 cursor-pointer border-0 p-0 transition-transform duration-150 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7EB6FF]', on && 'scale-110')}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: hex ? `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 34%), ${hex}` : 'repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 5px, rgba(255,255,255,0.02) 5px 10px)',
        boxShadow: on ? `0 0 0 3px #0B1226, 0 0 0 5.5px #7EB6FF, 0 6px 18px ${hex ?? '#000000'}66` : 'inset 0 0 0 1.5px rgba(255,255,255,0.22), 0 3px 8px rgba(0,0,0,0.45)',
      }}>
      {!hex && <span aria-hidden="true" className="absolute inset-0 m-auto block h-[2px] w-[62%] rotate-45 rounded bg-white/55" />}
    </button>
  );
}

/** A shelf of paint pots with the name of the one in use. `none`: a pot for "no colour". */
function Shelf({ label, paints, value, onPick, none }: { label: string; paints: Paint[]; value: string | null; onPick: (hex: string | null) => void; none?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Cap>{label}</Cap>
        <span className="text-[13px] font-semibold text-[#DCE7FA]">{value ? paintName(value) : none ?? 'None'}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {none && <Pot paint={null} on={value === null} onPick={() => onPick(null)} />}
        {paints.map(p => <Pot key={p.hex} paint={p} on={value === p.hex} onPick={() => onPick(p.hex)} />)}
      </div>
    </div>
  );
}

/** The clew of a sail with its patch, drawn from the same outlines the boat uses. */
function PatchPicture({ style, one, two }: { style: 'solid' | 'fingers'; one: string; two: string | null }) {
  const foot = 0.36, luff = 1.6, win = 0.115;
  const shapes = useMemo(() => patchShapes({ style, one, two }, foot, luff).filter(s => s.pts[0][0] === 0 && s.pts[0][1] === 1), [style, one, two]);
  const xy = ([f, g]: [number, number]) => `${(((g * foot - (foot - win)) / win) * 100).toFixed(1)},${(100 - ((f * luff) / win) * 100).toFixed(1)}`;
  return (
    <svg viewBox="0 0 100 100" className="h-[74px] w-[74px]" aria-hidden="true">
      <polygon points="0,100 100,100 78,0 0,0" fill="#DDE3EC" />
      <line x1="0" y1="100" x2="100" y2="100" stroke="#8D97A8" strokeWidth="2.5" />
      {shapes.map((s, i) => <polygon key={i} points={s.pts.map(xy).join(' ')} fill={s.color} stroke="rgba(10,16,32,0.25)" strokeWidth="0.8" strokeLinejoin="round" />)}
    </svg>
  );
}

function StyleCard({ on, label, note, onPick, children }: { on: boolean; label: string; note: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick}
      className={cx('flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors', on ? 'border-[#7EB6FF] bg-[rgba(46,123,255,0.20)]' : 'border-white/12 bg-white/[0.05] hover:bg-white/[0.10]')}>
      <span className="shrink-0 overflow-hidden rounded-xl">{children}</span>
      <span className="min-w-0">
        <span className="block font-display text-[16px] font-bold leading-tight text-[#F1F4FA]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: C.mute }}>{note}</span>
      </span>
    </button>
  );
}

/** Keys for a sail number: two digits, as the sail carries them. No keyboard needed. */
function NumberPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (k === 'clr') onChange('');
    else if (value.length < 2) onChange(value + k);
  };
  const key = 'h-12 cursor-pointer rounded-xl border border-white/12 bg-white/[0.06] font-display text-[20px] font-bold text-[#F1F4FA] transition-colors hover:bg-white/[0.14] active:bg-[rgba(46,123,255,0.35)]';
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Sail number keys">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => <button key={k} type="button" className={key} onClick={() => press(k)}>{k}</button>)}
      <button type="button" className={cx(key, 'text-[13px] font-semibold')} onClick={() => press('clr')}>Clear</button>
      <button type="button" className={key} onClick={() => press('0')}>0</button>
      <button type="button" className={cx(key, 'text-[13px] font-semibold')} aria-label="Delete the last digit" onClick={() => press('del')}>Delete</button>
    </div>
  );
}

/** One of your saved yachts, in the list: her hull colour, her name, her class and number. */
function YachtCard({ y, sail, on, racing, unsaved, onPick, compact }: { y: Yacht; sail: string; on: boolean; racing: boolean; unsaved: boolean; onPick: () => void; compact: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick}
      className={cx('flex shrink-0 cursor-pointer items-center gap-3 rounded-2xl border text-left backdrop-blur-md transition-all duration-150', compact ? 'px-3 py-2' : 'px-3.5 py-3',
        on ? 'border-[#7EB6FF] bg-[rgba(46,123,255,0.28)] shadow-[0_8px_28px_rgba(46,123,255,0.35)]' : 'border-white/12 bg-[rgba(10,18,40,0.55)] hover:border-white/30 hover:bg-[rgba(20,32,66,0.7)]')}>
      <span aria-hidden="true" className={cx('shrink-0', compact ? 'h-6 w-6' : 'h-9 w-9')} style={{ borderRadius: '50%', background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 36%), ${y.hull}`, boxShadow: `inset 0 0 0 1.5px rgba(255,255,255,0.25), 0 0 0 2.5px ${y.patch.one}` }} />
      <span className="min-w-0">
        <span className={cx('block font-display font-extrabold leading-tight text-[#F1F4FA]', compact ? 'whitespace-nowrap text-[15px]' : 'text-[17px]')}>{y.name}</span>
        {!compact && <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: on ? '#CFE2FF' : C.mute }}>{CLASSES[y.cls].name} · {y.country ?? 'AUS'} {sail}{unsaved ? ' · not saved yet' : ''}</span>}
      </span>
      {!compact && racing && <span className="ml-auto shrink-0 rounded-lg bg-[rgba(52,211,153,0.18)] px-2 py-1 text-[11.5px] font-bold uppercase tracking-wide text-[#9CE5BD]">Racing</span>}
    </button>
  );
}

function ClassChip({ id, on, onPick }: { id: ClassId; on: boolean; onPick: () => void }) {
  const c = CLASSES[id];
  return (
    <button type="button" aria-pressed={on} onClick={onPick}
      className={cx('flex min-w-[96px] cursor-pointer flex-col rounded-xl border px-3 py-2 text-left transition-colors', on ? 'border-[#7EB6FF] bg-[rgba(46,123,255,0.28)]' : 'border-white/12 bg-white/[0.05] hover:bg-white/[0.12]')}>
      <span className="font-display text-[16px] font-extrabold leading-tight text-[#F1F4FA]">{c.name}</span>
      <span className="text-[12px]" style={{ color: on ? '#CFE2FF' : C.mute }}>{c.loa.toFixed(2)} m</span>
    </button>
  );
}

export default function SimYacht({ yard, me, classId, signedIn, onChange, onBack, onRace }: {
  yard: Yard; me: SimIdentity | null;
  /** The class set up to race: her yacht is on the stage when the screen opens. */
  classId: ClassId;
  /** Signed in: the yachts are saved to the account as well as this device. */
  signedIn: boolean;
  onChange: (yard: Yard) => void; onBack: () => void;
  /** Done: race this class. */
  onRace: (cls: ClassId) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const el = root.current; if (!el) return;
    const fit = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const wide = box.w >= 1000;

  // The yacht on the stage: one of your saved ones, or a new one that's saved with her first change.
  const [sel, setSel] = useState<string | null>(() => yachtFor(yard, classId)?.id ?? yard.yachts[0]?.id ?? null);
  const [draft, setDraft] = useState<Yacht>(() => newYacht(yard, classId));
  const [part, setPart] = useState<Part>(() => (yard.yachts.length ? 'hull' : 'boat'));
  const [asking, setAsking] = useState(false);
  const saved = yard.yachts.find(y => y.id === sel) ?? null;
  const yacht = saved ?? draft;
  const full = yard.yachts.length >= MAX_YACHTS;
  const num = sailOf(yacht, me);
  const alfie = me?.sails[yacht.cls] ?? null;
  const racing = !!saved && yard.racing[yacht.cls] === yacht.id;
  const change = (next: Yacht) => { onChange(putYacht(yard, next)); setSel(next.id); };
  const set = (p: Partial<Yacht>) => change({ ...yacht, ...p });
  // The number being keyed in (an empty pad shows as a blank sail until a digit goes on).
  const [typing, setTyping] = useState<string | null>(null);
  // The name as it's being typed (kept tidy when it's saved, left alone while you type).
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => { setTyping(null); setNaming(null); setAsking(false); }, [yacht.id]);
  const keyed = (v: string) => {
    setTyping(v);
    const { number: _old, ...rest } = yacht;
    void _old;
    change(v ? { ...rest, number: v.padStart(2, '0') } : rest);
  };
  /** Back to the number on your boat in Alfie. */
  const useAlfie = () => { setTyping(null); const { number: _old, ...rest } = yacht; void _old; change(rest); };
  const shown = typing !== null ? (typing ? typing.padStart(2, '0') : '') : num.sail;
  const pick = (id: string) => { setSel(id); };
  const add = () => {
    if (full) return;
    const y = newYacht(yard, yacht.cls);
    onChange(putYacht(yard, y)); setSel(y.id); setPart('boat');
  };
  const copy = () => {
    if (full) return;
    const base = newYacht(yard, yacht.cls);
    const y: Yacht = { ...yacht, id: base.id, name: cleanName(`${yacht.name} copy`) };
    onChange(putYacht(yard, y)); setSel(y.id);
  };
  const remove = () => {
    const next = dropYacht(yard, yacht.id);
    onChange(next);
    setAsking(false);
    setDraft(newYacht(next, yacht.cls));
    setSel(yachtFor(next, yacht.cls)?.id ?? next.yachts[0]?.id ?? null);
    if (!next.yachts.length) setPart('boat');
  };
  /** Another class: and if she still has the name she was given for her old one, the new class's. */
  const reclass = (id: ClassId) => {
    if (id === yacht.cls) return;
    const auto = new RegExp(`^My ${CLASSES[yacht.cls].name}( \\d+)?$`).test(yacht.name);
    setNaming(null);
    set(auto ? { cls: id, name: newYacht({ ...yard, yachts: yard.yachts.filter(y => y.id !== yacht.id) }, id).name } : { cls: id });
  };
  const race = () => { onChange(raceYacht(putYacht(yard, yacht), yacht.id)); onRace(yacht.cls); };

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
      {part === 'boat' && (
        <>
          <label className="flex flex-col gap-2.5">
            <Cap>Her name</Cap>
            <input type="text" value={naming ?? yacht.name} maxLength={24} spellCheck={false} autoComplete="off"
              onChange={e => { setNaming(e.target.value); const n = cleanName(e.target.value); if (n) set({ name: n }); }}
              onBlur={() => setNaming(null)}
              className="h-14 w-full select-text rounded-2xl border border-white/15 bg-white/[0.06] px-4 font-display text-[22px] font-extrabold text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#7EB6FF] focus:bg-white/[0.10]" placeholder="Name her" />
          </label>
          <div className="flex flex-col gap-2.5">
            <Cap>Class</Cap>
            <div className="flex flex-wrap gap-2">
              {CLASS_ORDER.map(id => <ClassChip key={id} id={id} on={yacht.cls === id} onPick={() => reclass(id)} />)}
            </div>
          </div>
          <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
            {racing ? <p className="m-0 text-[14px] font-semibold text-[#9CE5BD]">She's the yacht you race in {CLASSES[yacht.cls].name} races.</p>
              : saved ? <div className="flex flex-wrap items-center gap-3"><Btn small onClick={() => onChange(raceYacht(yard, yacht.id))}>Race her in {CLASSES[yacht.cls].name} races</Btn><span className="text-[13px]" style={{ color: C.mute }}>Another of yours has that job now.</span></div>
                : <p className="m-0 text-[13.5px]" style={{ color: C.mute }}>A new yacht. She's saved as soon as you change anything.</p>}
            {saved && !asking && (
              <div className="flex flex-wrap gap-2">
                <Btn small disabled={full} onClick={copy} className="disabled:cursor-default disabled:opacity-45">Copy her</Btn>
                <Btn small quiet onClick={() => setAsking(true)}>Delete her</Btn>
              </div>
            )}
            {saved && asking && (
              <div className="flex flex-col gap-2" role="alert">
                <span className="text-[13.5px] font-semibold text-[#FFCB96]">Delete {yacht.name} for good?</span>
                <div className="flex flex-wrap gap-2">
                  <Btn small onClick={remove}>Yes, delete her</Btn>
                  <Btn small quiet onClick={() => setAsking(false)}>Keep her</Btn>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {part === 'hull' && (
        <>
          <Shelf label="Hull colour" paints={HULL_COLOURS} value={yacht.hull} onPick={h => h && set({ hull: h })} />
          <Shelf label="Deck patches" paints={DECK_COLOURS} value={yacht.deckPatch ?? '#262C36'} onPick={h => h && set({ deckPatch: h })} />
          <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>Deck patches are the film over the hatches in her deck.</p>
        </>
      )}

      {part === 'tapes' && (
        <>
          <Shelf label="Jib luff tape" paints={SAIL_COLOURS} value={yacht.jibLuff} onPick={h => h && set({ jibLuff: h })} />
          <p className="m-0 text-[13px] leading-snug" style={{ color: C.mute }}>The tape up the front of the jib: the one strip of colour on her sails.</p>
        </>
      )}

      {part === 'patches' && (
        <>
          <div className="flex flex-col gap-2.5">
            <Cap>Style</Cap>
            <div className="flex gap-2.5">
              <StyleCard on={yacht.patch.style === 'fingers'} label="Fingers" note="Fanned out from each corner, foot and head" onPick={() => set({ patch: { ...yacht.patch, style: 'fingers' } })}>
                <PatchPicture style="fingers" one={yacht.patch.one} two={yacht.patch.two} />
              </StyleCard>
              <StyleCard on={yacht.patch.style === 'solid'} label="Plain" note="A solid corner patch" onPick={() => set({ patch: { ...yacht.patch, style: 'solid' } })}>
                <PatchPicture style="solid" one={yacht.patch.one} two={yacht.patch.two} />
              </StyleCard>
            </div>
          </div>
          <Shelf label="Colour one" paints={SAIL_COLOURS} value={yacht.patch.one} onPick={h => h && set({ patch: { ...yacht.patch, one: h, two: yacht.patch.two === h ? null : yacht.patch.two } })} />
          <Shelf label="Colour two" paints={SAIL_COLOURS.filter(p => p.hex !== yacht.patch.one)} value={yacht.patch.two} none="One colour" onPick={h => set({ patch: { ...yacht.patch, two: h } })} />
        </>
      )}

      {part === 'number' && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex h-[76px] min-w-[132px] items-center justify-center rounded-2xl border border-white/12 bg-[#DDE3EC] px-4">
              <span className="font-display text-[46px] font-extrabold leading-none tabular-nums text-[#14327A]">{shown || '\u00A0'}</span>
            </div>
            <div className="min-w-0 text-[13.5px] leading-snug">
              {num.from === 'alfie' && typing === null && <p className="m-0 font-semibold text-[#9CE5BD]">From your {CLASSES[yacht.cls].name} in Alfie</p>}
              {num.from === 'yours' && alfie && alfie !== num.sail && (
                <p className="m-0" style={{ color: C.mute }}>Your {CLASSES[yacht.cls].name} in Alfie is <b className="text-[#F1F4FA]">{alfie}</b>.</p>
              )}
              {num.from === 'none' && typing === null && <p className="m-0" style={{ color: C.mute }}>No {CLASSES[yacht.cls].name} of yours in Alfie yet, so she sails as 01 until you give her a number.</p>}
              {alfie && (num.from === 'yours' || typing !== null) && <div className="mt-1.5"><Btn small onClick={useAlfie}>Use {alfie}</Btn></div>}
            </div>
          </div>
          <NumberPad value={typing ?? (num.from === 'yours' ? num.sail : '')} onChange={keyed} />
          <div className="flex flex-col gap-2.5">
            <Cap>Country</Cap>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRIES.map(k => (
                <button key={k} type="button" aria-pressed={(yacht.country ?? 'AUS') === k} onClick={() => set({ country: k })}
                  className={cx('h-9 cursor-pointer rounded-lg border px-2.5 font-display text-[13.5px] font-bold tracking-wide transition-colors', (yacht.country ?? 'AUS') === k ? 'border-[#7EB6FF] bg-[rgba(46,123,255,0.28)] text-white' : 'border-white/12 bg-white/[0.05] text-[#C6D2E6] hover:bg-white/[0.12]')}>{k}</button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const tabs = (
    <div className="grid shrink-0 grid-cols-5 gap-1.5 px-3 pt-3" role="tablist" aria-label="What to work on">
      {PARTS.map(p => (
        <button key={p.id} type="button" role="tab" aria-selected={part === p.id} onClick={() => setPart(p.id)}
          className={cx('h-11 cursor-pointer rounded-xl border px-0.5 font-display text-[13.5px] font-bold transition-colors', part === p.id ? 'border-transparent bg-[#2E7BFF] text-white shadow-[0_6px_18px_rgba(46,123,255,0.45)]' : 'border-white/10 bg-white/[0.05] text-[#C6D2E6] hover:bg-white/[0.12]')}>
          {p.label}
        </button>
      ))}
    </div>
  );

  const plate = (
    <div className="pointer-events-none flex flex-col items-center gap-1 text-center">
      <span className={cx('font-display font-extrabold leading-none text-white [text-shadow:0_4px_24px_rgba(0,0,0,0.6)]', wide ? 'text-[34px]' : 'text-[23px]')}>{naming ?? yacht.name}</span>
      <span className="font-display text-[13px] font-bold uppercase tracking-[0.2em] text-[#9DB7E6]">{CLASS_NOTE[yacht.cls]} · {yacht.country ?? 'AUS'} {shown || '··'}</span>
    </div>
  );
  const list = [...yard.yachts, ...(saved ? [] : [draft])];
  const where = signedIn ? 'Saved to your account as you go.' : 'Saved on this device as you go. Sign in to keep them in your account.';

  return (
    <div ref={root} className="relative h-full w-full select-none overflow-hidden bg-[#060B1C] text-[#F1F4FA]">
      {/* The stage: all of the screen on a wide one, the top of it on a phone. */}
      <div className={cx('absolute inset-x-0 top-0', wide ? 'bottom-0' : 'h-[44%]')}>
        <YachtStage className="block h-full w-full" cls={yacht.cls} look={lookOf(yacht)} sail={shown || ' '} part={part === 'boat' ? 'all' : part}
          inset={wide ? { left: 270, right: 440, top: 76, bottom: 132 } : { top: 58, bottom: 118 }} />
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-4 sm:px-6">
        <div className="pointer-events-auto"><Btn small onClick={onBack} aria-label="Back to the Sailing Academy">← Sailing Academy</Btn></div>
        <h1 className={cx('m-0 min-w-0 font-display font-extrabold leading-none tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]', wide ? 'text-[30px]' : 'sr-only')}>Design your yacht</h1>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <Btn small onClick={() => change({ ...yacht, ...surprise(), country: yacht.country })}>Surprise me</Btn>
          <Btn small primary onClick={race}>Race her</Btn>
        </div>
      </div>

      {wide ? (
        <>
          {/* Your yachts, down the left. */}
          <div className="absolute bottom-6 left-6 top-[84px] flex w-[238px] flex-col gap-2.5 overflow-y-auto pr-1">
            <Cap className="pl-1">Your yachts</Cap>
            <div className="flex flex-col gap-2.5" role="group" aria-label="Your yachts">
              {list.map(y => <YachtCard key={y.id} y={y} sail={sailOf(y, me).sail} on={y.id === yacht.id} racing={yard.racing[y.cls] === y.id} unsaved={y === draft && !saved} compact={false} onPick={() => pick(y.id)} />)}
            </div>
            <Btn onClick={add} disabled={full || !saved} className="mt-1 self-start disabled:cursor-default disabled:opacity-45">+ New yacht</Btn>
            <p className="m-0 pl-1 text-[12.5px] leading-snug" style={{ color: C.faint }}>{full ? `That's all ${MAX_YACHTS} berths taken. ` : ''}{where}</p>
          </div>
          {/* The paint locker, down the right. */}
          <div className="absolute bottom-6 right-6 top-[84px] flex w-[400px] flex-col overflow-hidden rounded-[26px] border border-white/12 bg-[rgba(9,15,34,0.78)] shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            {tabs}
            {panel}
          </div>
          <div className="absolute bottom-7 flex flex-col items-center gap-2" style={{ left: 270, right: 440 }}>
            {plate}
            <span className="pointer-events-none text-[12.5px]" style={{ color: C.faint }}>Drag to turn her</span>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-x-0 flex flex-col items-center px-4" style={{ top: 'calc(44% - 112px)' }}>{plate}</div>
          <div className="absolute inset-x-0 flex items-center gap-2 overflow-x-auto px-4 pb-1" style={{ top: 'calc(44% - 54px)' }} role="group" aria-label="Your yachts">
            {list.map(y => <YachtCard key={y.id} y={y} sail={sailOf(y, me).sail} on={y.id === yacht.id} racing={false} unsaved={false} compact onPick={() => pick(y.id)} />)}
            <Btn small onClick={add} disabled={full || !saved} className="shrink-0 disabled:cursor-default disabled:opacity-45">+ New</Btn>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-[44%] flex flex-col rounded-t-[24px] border-t border-white/12 bg-[#0A1128]">
            {tabs}
            {panel}
            <p className="m-0 shrink-0 px-5 pb-3 text-[12px] leading-snug" style={{ color: C.faint }}>{where}</p>
          </div>
        </>
      )}
    </div>
  );
}
