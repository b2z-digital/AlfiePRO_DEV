// The one-screen card before you sail a drill, made for a skipper holding a transmitter: a picture of
// the idea, a transmitter with each stick where it should be (and moving as it should), up to three
// cues in big type, and a button on the transmitter (or Space) to go. No scrolling, no mouse needed.
// The longer step-by-step text is one press away ("More detail") for anyone who wants it.
import { usePadGo } from './padGo';
import type { CardPicture, CardRudder, CardSail, DrillCard } from '@/sim/training/common';
import { AlfieOrb, Btn, C, Cap, Hud, cx } from './ui';

const BLUE = '#4DA3FF', GOLD = '#FFD27A', INK = '#F1F4FA', FAINT = 'rgba(214,224,240,0.55)', LINE = 'rgba(255,255,255,0.22)';
const rad = (d: number) => (d * Math.PI) / 180;
/** A point `d` along heading `h` (degrees clockwise from straight up the page, into the wind) from (x, y). */
const along = (x: number, y: number, h: number, d: number) => ({ x: x + Math.sin(rad(h)) * d, y: y - Math.cos(rad(h)) * d });

function reducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** A boat from above, heading `h`, her sail in (`sheet` 1) or out (0), the boom to leeward. */
function Boat({ x, y, h, sheet = 1, tone = INK, faint }: { x: number; y: number; h: number; sheet?: number; tone?: string; faint?: boolean }) {
  // The wind comes down the page: with her bow right of up, the wind is on her left and the boom goes right.
  const side = ((h % 360) + 360) % 360 < 180 ? 1 : -1;
  const b = rad(8 + (1 - sheet) * 70);
  return (
    <g transform={`translate(${x} ${y}) rotate(${h})`} opacity={faint ? 0.4 : 1}>
      <path d="M0,-15 C5,-9 6,4 4,12 L-4,12 C-6,4 -5,-9 0,-15 Z" fill={tone} />
      <line x1={0} y1={-5} x2={Math.sin(b) * side * 12} y2={-5 + Math.cos(b) * 12} stroke={BLUE} strokeWidth={2.4} strokeLinecap="round" />
    </g>
  );
}

function Wind() {
  return (
    <g aria-hidden="true">
      <text x={18} y={18} fontSize="10" fontWeight="700" letterSpacing="1.5" fill={FAINT}>WIND</text>
      <line x1={30} y1={24} x2={30} y2={48} stroke={FAINT} strokeWidth={2} />
      <path d="M25,43 L30,50 L35,43" fill="none" stroke={FAINT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

function Label({ x, y, children, anchor = 'start', tone = INK, size = 12 }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' | 'end'; tone?: string; size?: number }) {
  return <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight="600" fill={tone}>{children}</text>;
}

const Mark = ({ x, y, tone = '#FF9F43' }: { x: number; y: number; tone?: string }) => <circle cx={x} cy={y} r={6} fill={tone} />;

/** The picture of the drill's idea. */
function Idea({ p }: { p: CardPicture }) {
  let body: React.ReactNode = null;
  if (p.kind === 'upwind') {
    const O = { x: 120, y: 190 }, ch = 43, mine = 43 + p.lower * 2.4;
    const a = along(O.x, O.y, ch, 165), b = along(O.x, O.y, -ch, 120), m = along(O.x, O.y, mine, 165), boat = along(O.x, O.y, mine, 78);
    body = (
      <>
        <path d={`M${O.x},${O.y} L${a.x},${a.y} A165,165 0 0 0 ${along(O.x, O.y, -ch, 165).x},${along(O.x, O.y, -ch, 165).y} Z`} fill="rgba(255,120,120,0.07)" />
        <Label x={O.x - 18} y={O.y - 132} anchor="middle" tone="rgba(255,180,168,0.8)" size={11}>too close: the sail flaps</Label>
        <line x1={O.x} y1={O.y} x2={b.x} y2={b.y} stroke={LINE} strokeDasharray="5 5" />
        <line x1={O.x} y1={O.y} x2={a.x} y2={a.y} stroke={GOLD} strokeWidth={1.6} strokeDasharray="6 5" />
        <Label x={a.x - 12} y={a.y + 14} anchor="end" tone={GOLD} size={11.5}>close-hauled</Label>
        <line x1={O.x} y1={O.y} x2={m.x} y2={m.y} stroke={BLUE} strokeWidth={2.4} />
        <Boat x={boat.x} y={boat.y} h={mine} />
        <Label x={274} y={O.y - 38} anchor="end" tone="#A9D2FF">{p.label}</Label>
        {p.chop && [0, 1, 2, 3].map(i => <path key={i} d={`M${40 + (i % 2) * 34},${150 + (i >> 1) * 22} q6,-6 12,0 q6,6 12,0`} fill="none" stroke="rgba(169,210,255,0.35)" strokeWidth={1.6} />)}
        {p.gusts && [[220, 150], [60, 150]].map(([gx, gy]) => <ellipse key={gx} cx={gx} cy={gy} rx={26} ry={14} fill="rgba(77,130,220,0.22)" />)}
        {p.gusts && <Label x={220} y={154} anchor="middle" tone="#A9D2FF" size={10.5}>gust: ease</Label>}
      </>
    );
  } else if (p.kind === 'downwind') {
    const O = { x: 120, y: 40 }, mine = 180 - p.up * 1.6, end = along(O.x, O.y, mine, 165), boat = along(O.x, O.y, mine, 70);
    body = (
      <>
        <line x1={O.x} y1={O.y} x2={O.x} y2={O.y + 165} stroke={GOLD} strokeWidth={1.6} strokeDasharray="6 5" />
        <Label x={O.x - 6} y={O.y + 160} anchor="end" tone={GOLD} size={11.5}>dead downwind</Label>
        {p.weave
          ? <path d={`M${O.x},${O.y} ${[1, 2, 3, 4, 5, 6].map(i => { const q = along(O.x, O.y, mine, i * 27); return `L${q.x + (i % 2 ? 7 : -7)},${q.y}`; }).join(' ')}`} fill="none" stroke={BLUE} strokeWidth={2.2} />
          : <line x1={O.x} y1={O.y} x2={end.x} y2={end.y} stroke={BLUE} strokeWidth={2.4} />}
        <Boat x={boat.x} y={boat.y} h={mine} sheet={0} />
        <Label x={272} y={end.y + 2} anchor="end" tone="#A9D2FF">{p.label}</Label>
      </>
    );
  } else if (p.kind === 'tack') {
    body = (
      <>
        <path d="M182,198 L136,108 Q126,84 146,82 L190,36" fill="none" stroke={BLUE} strokeWidth={2.2} />
        <Boat x={168} y={170} h={-28} />
        <Boat x={134} y={90} h={0} sheet={0.3} faint />
        <Boat x={174} y={54} h={40} />
        <Label x={120} y={84} anchor="end" tone="#A9D2FF">firm, through the wind</Label>
        <Label x={274} y={84} anchor="end">centre the rudder</Label>
        <Label x={274} y={98} anchor="end" tone={C.mute}>as the sail fills</Label>
        <Label x={274} y={206} anchor="end" tone={C.mute}>go in at full speed</Label>
      </>
    );
  } else if (p.kind === 'gybe') {
    body = (
      <>
        <path d="M92,36 L140,116 Q150,136 140,152 L112,200" fill="none" stroke={BLUE} strokeWidth={2.2} />
        <Boat x={106} y={60} h={152} sheet={0} />
        <Boat x={146} y={132} h={180} sheet={0} faint />
        <Boat x={124} y={180} h={208} sheet={0} />
        <Label x={164} y={124} tone="#A9D2FF">half rudder, smooth</Label>
        <Label x={164} y={150} tone={C.mute}>centre it as the</Label>
        <Label x={164} y={164} tone={C.mute}>boom comes across</Label>
      </>
    );
  } else if (p.kind === 'gate') {
    body = (
      <>
        <Mark x={150} y={140} /><Mark x={210} y={140} />
        <Label x={180} y={168} anchor="middle" tone={C.mute} size={11}>the gate</Label>
        <path d="M118,22 L114,110 Q118,172 156,152 L212,70" fill="none" stroke={BLUE} strokeWidth={2.2} />
        <Boat x={116} y={60} h={180} sheet={0} />
        <Boat x={196} y={92} h={35} />
        <Label x={106} y={112} anchor="end" tone="#A9D2FF">in wide</Label>
        <Label x={106} y={126} anchor="end" tone={C.mute} size={11}>a length off</Label>
        <Label x={150} y={196} anchor="middle" tone="#A9D2FF">out tight, sail coming in</Label>
      </>
    );
  } else if (p.kind === 'bear-away') {
    body = (
      <>
        <Mark x={150} y={52} /><Mark x={96} y={66} tone="#F2C230" />
        <Label x={96} y={88} anchor="middle" tone={C.mute} size={11}>offset</Label>
        <path d="M222,196 L163,66 Q150,34 132,56 L104,64 Q86,72 96,104 L112,198" fill="none" stroke={BLUE} strokeWidth={2.2} />
        <Boat x={200} y={150} h={-26} />
        <Boat x={104} y={160} h={168} sheet={0} />
        <Label x={160} y={30} anchor="middle" tone="#A9D2FF">ease as you turn</Label>
        <Label x={120} y={190} tone="#A9D2FF">right out on the run</Label>
      </>
    );
  } else if (p.kind === 'start') {
    const v = p.v;
    const pin = { x: 62, y: 74 }, cb = { x: 234, y: 74 };
    const me = v === 'ring' ? { x: 140, y: 128, h: 0 } : v === 'back' ? { x: 140, y: 172, h: -20 } : v === 'trigger' ? { x: 140, y: 104, h: -20 }
      : v === 'pin' ? { x: 96, y: 104, h: -20 } : v === 'boat' ? { x: 204, y: 100, h: -20 } : v === 'port' ? { x: 70, y: 120, h: 40 }
        : v === 'gap' ? { x: 150, y: 100, h: -25 } : v === 'recall' ? { x: 150, y: 44, h: 180 } : { x: 168, y: 132, h: 140 };
    body = (
      <>
        <line x1={pin.x} y1={pin.y} x2={cb.x} y2={cb.y} stroke={GOLD} strokeWidth={1.6} strokeDasharray="6 5" />
        <circle cx={pin.x} cy={pin.y} r={6} fill="#F2C230" stroke={v === 'pin' || v === 'port' ? '#FFFFFF' : 'none'} strokeWidth={2} />
        <rect x={cb.x - 9} y={cb.y - 6} width={18} height={12} rx={3} fill={INK} stroke={v === 'boat' ? BLUE : 'none'} strokeWidth={2.5} />
        <Label x={pin.x} y={pin.y - 12} anchor="middle" tone={C.mute} size={10.5}>pin</Label>
        <Label x={cb.x} y={cb.y - 12} anchor="middle" tone={C.mute} size={10.5}>committee boat</Label>
        {v === 'ring' && <circle cx={140} cy={128} r={26} fill="none" stroke="#A9D2FF" strokeDasharray="4 4" />}
        {(v === 'back' || v === 'trigger') && <path d={`M${me.x - 3},${me.y - 18} L${me.x - 10},${84}`} stroke={BLUE} strokeWidth={2} strokeDasharray="4 4" markerEnd="url(#dc-arrow)" />}
        {v === 'back' && <Label x={me.x + 16} y={130} tone="#A9D2FF">6 lengths</Label>}
        {v === 'port' && [176, 200, 224].map(x => <Boat key={x} x={x} y={96} h={-35} tone="rgba(241,244,250,0.55)" />)}
        {v === 'port' && <path d="M84,106 L120,82" stroke={BLUE} strokeWidth={2} strokeDasharray="4 4" markerEnd="url(#dc-arrow)" />}
        {v === 'gap' && <><Boat x={196} y={100} h={-25} tone="rgba(241,244,250,0.55)" /><Boat x={86} y={104} h={-25} tone="rgba(241,244,250,0.55)" />
          <path d="M104,124 L136,124" stroke="#A9D2FF" strokeWidth={1.5} /><Label x={120} y={140} anchor="middle" tone="#A9D2FF" size={11}>gap</Label></>}
        {v === 'recall' && <path d="M150,58 Q150,120 120,118 Q100,112 112,80" fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="4 4" markerEnd="url(#dc-arrow)" />}
        {v === 'run' && <path d="M120,86 Q196,116 176,168 Q146,198 116,150 L106,88" fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="4 4" markerEnd="url(#dc-arrow)" />}
        <Boat x={me.x} y={me.y} h={me.h} sheet={v === 'ring' ? 0.2 : 1} />
        <Label x={140} y={206} anchor="middle" tone="#A9D2FF">{p.label}</Label>
      </>
    );
  }
  return (
    <svg viewBox="0 0 280 212" className="block h-full max-h-full w-full" role="img" aria-label="How the drill works, from above">
      <defs><marker id="dc-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={BLUE} /></marker></defs>
      <Wind />
      {body}
    </svg>
  );
}

const SAIL_Y: Record<CardSail['at'], number> = { in: 104, 'nearly-in': 96, half: 72, out: 40 };
const SAIL_SAY: Record<CardSail['at'], string> = { in: 'Right in', 'nearly-in': 'A hair off in', half: 'Half out', out: 'Right out' };
const SAIL_MOVE: Record<NonNullable<CardSail['move']>, string> = { gusts: 'ease in each gust', 'to-in': 'in as she turns', 'to-out': 'out as she turns', go: 'in when you go' };
const RUDDER_SAY: Record<CardRudder, string> = { still: 'Almost still', nudge: 'Small nudges', firm: 'Firm to turn, then centre', weave: 'A gentle weave', smooth: 'One smooth turn', hold: 'Small moves to hold' };
const RUDDER_X: Record<CardRudder, string> = { still: '180;183;180;177;180', nudge: '180;190;180;170;180', firm: '180;180;212;212;180;180', weave: '180;198;162;198;180', smooth: '180;202;202;180', hold: '180;188;172;180' };

/** A transmitter, each stick where it should be in this drill and moving as it should. */
function Transmitter({ sail, rudder }: { sail: CardSail; rudder: CardRudder }) {
  const still = reducedMotion();
  const y = SAIL_Y[sail.at];
  const sailFrom = sail.move === 'to-in' || sail.move === 'go' ? SAIL_Y.out : sail.move === 'to-out' ? SAIL_Y.in : sail.move === 'gusts' ? y - 18 : y;
  const sailVals = sail.move === 'gusts' ? `${y};${y};${y - 18};${y};${y}` : sail.move ? `${sailFrom};${sailFrom};${y};${y}` : `${y}`;
  return (
    <svg viewBox="0 0 260 150" className="block h-full max-h-full w-full" role="img" aria-label={`Sail stick: ${SAIL_SAY[sail.at]}${sail.move ? `, ${SAIL_MOVE[sail.move]}` : ''}. Rudder stick: ${RUDDER_SAY[rudder]}.`}>
      <rect x={6} y={6} width={248} height={138} rx={26} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.14)" />
      {/* Sail stick: up and down, OUT at the top, IN at the bottom */}
      <rect x={42} y={24} width={56} height={98} rx={14} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />
      <line x1={70} y1={36} x2={70} y2={110} stroke="rgba(255,255,255,0.18)" strokeWidth={6} strokeLinecap="round" />
      <text x={70} y={20} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={FAINT}>OUT</text>
      <text x={70} y={134} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={FAINT}>IN</text>
      <circle cx={70} cy={still ? y : sailFrom} r={11} fill={BLUE} stroke="#FFFFFF" strokeWidth={2}>
        {!still && sail.move && <animate attributeName="cy" values={sailVals} dur="2.6s" repeatCount="indefinite" />}
      </circle>
      {/* Rudder stick: left and right, springing back to the middle */}
      <rect x={146} y={46} width={98} height={56} rx={14} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" />
      <line x1={160} y1={74} x2={230} y2={74} stroke="rgba(255,255,255,0.18)" strokeWidth={6} strokeLinecap="round" />
      <text x={154} y={40} fontSize="9.5" fontWeight="700" fill={FAINT}>LEFT</text>
      <text x={236} y={40} textAnchor="end" fontSize="9.5" fontWeight="700" fill={FAINT}>RIGHT</text>
      <circle cx={180} cy={74} r={11} fill={GOLD} stroke="#FFFFFF" strokeWidth={2} transform="translate(15 0)">
        {!still && <animate attributeName="cx" values={RUDDER_X[rudder]} dur={rudder === 'firm' || rudder === 'smooth' ? '2.4s' : '2s'} repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}

export interface DrillCardProps {
  title: string; group: string; goal: string; card: DrillCard;
  /** A transmitter is plugged in (the card then says to press one of its buttons). */
  pad: boolean; rudderAxis: number;
  onStart: () => void; onWatch?: () => void; onMore: () => void; onBack: () => void; compact?: boolean;
}

export function DrillCardView({ title, group, goal, card, pad, rudderAxis, onStart, onWatch, onMore, onBack, compact }: DrillCardProps) {
  usePadGo(onStart, rudderAxis, true);
  return (
    <Hud role="dialog" aria-modal="true" aria-label={`Your turn: ${title}`} className={cx('flex max-h-full flex-col overflow-hidden', compact ? 'gap-2.5 px-4 py-3.5' : 'gap-4 px-7 py-6')}
      style={{ width: compact ? '100%' : 'min(940px, calc(100vw - 32px))' }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <AlfieOrb size={compact ? 28 : 36} />
        <div className="min-w-0 flex-1">
          <Cap>{group} · your turn</Cap>
          <p className={cx('m-0 font-display font-bold leading-tight', compact ? 'text-[19px]' : 'text-[24px]')}>{title}</p>
        </div>
        <span className="rounded-full bg-[rgba(77,163,255,0.16)] px-3 py-1 text-[13px] font-semibold text-[#A9D2FF]">{goal}</span>
      </div>
      <div className={cx('grid min-h-0 gap-3', compact ? 'grid-cols-1' : 'grid-cols-[1.1fr_1fr]')}>
        <div className="flex min-h-0 items-center justify-center rounded-2xl bg-[#0E2A4A]/70 p-2" style={{ height: compact ? 'min(30vh, 230px)' : 'min(46vh, 330px)' }}>
          <Idea p={card.picture} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1" style={{ height: compact ? 'min(16vh, 120px)' : 'min(22vh, 170px)' }}>
              <Transmitter sail={card.sail} rudder={card.rudder} />
            </div>
            <div className="flex w-[42%] flex-col gap-2 text-[13.5px] leading-snug">
              <p className="m-0"><b className="text-[#A9D2FF]">Sail:</b> {SAIL_SAY[card.sail.at]}{card.sail.move ? `, ${SAIL_MOVE[card.sail.move]}` : ''}</p>
              <p className="m-0"><b className="text-[#FFD27A]">Rudder:</b> {RUDDER_SAY[card.rudder]}</p>
            </div>
          </div>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {card.cues.slice(0, 3).map((x, i) => (
              <li key={x} className={cx('flex items-center gap-3 font-semibold leading-snug', compact ? 'text-[15px]' : 'text-[17px]')}>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.1] text-[13px] font-bold tabular-nums">{i + 1}</span>{x}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn primary onClick={onStart} autoFocus={!compact}>Start sailing</Btn>
        {onWatch && <Btn onClick={onWatch}>Watch Alfie do it first</Btn>}
        <Btn quiet onClick={onMore}>More detail</Btn>
        <Btn quiet onClick={onBack}>Back</Btn>
        {!compact && <span className="ml-auto text-[13px] font-semibold" style={{ color: C.mute }}>{pad ? 'Press any button on your transmitter, or push the rudder stick right over, to start' : 'Space to start'}</span>}
      </div>
    </Hud>
  );
}
