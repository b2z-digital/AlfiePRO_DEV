// Tracking in the scoring screen. Nothing shows unless the club's tracking is on, scoring from it
// isn't switched off, and the person scoring runs races. Then:
//  · Starting the StartBox sequence opens a tracking session for this race; the gun marks it.
//  · A "Tracking" button in the top bar shows the finish order as boats cross, matched to the
//    entries, with OCS boats and too-close-to-call finishes flagged.
//  · Officer confirms: the officer sends the order to the results. Automatic: each finisher goes in
//    as she crosses (only for entries the officer hasn't scored), and the officer can still change it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStartBoxEngine } from '@/utils/startBoxAudio';
import { loadKit, openRaceSession, sessionForRace, setupFrom, updateSession, useClubTracking, type Kit, type SessionRow, type TagRow } from './data';
import { useAnalysis, useTrackedRace } from './source';
import { rt1 } from './format';

export interface ScoringEntry { skipperIndex: number; position: number | null; letterScore?: 'OCS' }
interface SkipperLite { name: string; sailNo: string; memberId?: string; boatId?: string }
interface Props {
  clubId: string | null | undefined;
  eventId: string | null | undefined;
  eventName: string;
  raceNo: number;
  skippers: SkipperLite[];
  /** Skipper indexes that already have a result in this race. */
  scored: number[];
  onApply: (race: number, entries: ScoringEntry[]) => void;
  /** Bumps when the StartBox opens, so the panel listens to the engine that's running. */
  startBoxKey: number;
  darkMode?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string | null | undefined) => (s ?? '').toString().trim().toUpperCase().replace(/^0+(?=\d)/, '');

function matchSkipper(tag: TagRow | undefined, skippers: SkipperLite[]): number {
  if (!tag) return -1;
  let i = tag.boat_id ? skippers.findIndex(s => s.boatId && s.boatId === tag.boat_id) : -1;
  if (i < 0 && tag.member_id) i = skippers.findIndex(s => s.memberId && s.memberId === tag.member_id);
  if (i < 0 && tag.sail_number) i = skippers.findIndex(s => norm(s.sailNo) === norm(tag.sail_number));
  return i;
}

export default function ScoringLink(p: Props) {
  const { tracking, on } = useClubTracking(p.clubId);
  const usable = on && !!tracking && tracking.scoring_mode !== 'off' && tracking.can_run && !!p.eventId && UUID.test(p.eventId);
  const [kit, setKit] = useState<Kit | null>(null);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const configId = usable ? tracking!.config_id : null;

  useEffect(() => {
    if (!configId) return;
    let live = true;
    void loadKit(configId).then(k => { if (live) setKit(k); });
    return () => { live = false; };
  }, [configId]);
  // This race's session, if there is one (and again every 20 s, in case another device opened it).
  useEffect(() => {
    if (!configId || !p.eventId) return;
    let live = true;
    setSession(null); setSent(null);
    const look = () => void sessionForRace(configId, p.eventId!, p.raceNo).then(s => { if (live) setSession(s); });
    look();
    const id = window.setInterval(look, 20_000);
    return () => { live = false; window.clearInterval(id); };
  }, [configId, p.eventId, p.raceNo]);

  // The StartBox: starting the sequence opens the session; the gun marks it. (A sequence with a
  // warning phase completes twice: the last completion is the gun.)
  const ref = useRef({ configId, eventId: p.eventId, raceNo: p.raceNo, name: `${p.eventName} · Race ${p.raceNo}`, layout: kit?.layouts.find(l => l.is_default)?.id ?? kit?.layouts[0]?.id ?? null });
  ref.current = { configId, eventId: p.eventId, raceNo: p.raceNo, name: `${p.eventName} · Race ${p.raceNo}`, layout: kit?.layouts.find(l => l.is_default)?.id ?? kit?.layouts[0]?.id ?? null };
  useEffect(() => {
    if (!configId) return;
    const engine = getStartBoxEngine();
    let opening: Promise<SessionRow | null> | null = null;
    return engine.onStateChange(state => {
      const c = ref.current;
      if (!c.configId || !c.eventId) return;
      if (state === 'running' && !opening) {
        opening = openRaceSession(c.configId, c.eventId, c.raceNo, c.name, c.layout).then(s => { if (s) setSession(s); return s; });
      }
      if (state === 'completed') {
        const at = new Date().toISOString();
        void (opening ?? sessionForRace(c.configId, c.eventId, c.raceNo)).then(async s => {
          if (!s) return;
          const patch = { gun_at: at, started_at: at, status: 'racing' as const, is_live: true };
          if (await updateSession(s.id, patch)) setSession({ ...s, ...patch });
        });
      }
      if (state === 'idle') opening = null;
    });
  }, [configId, p.startBoxKey]);

  const spec = useMemo(() => (usable && kit && session && session.gun_at ? { kind: 'session' as const, session, kit, tracking: tracking! } : null), [usable, kit, session, tracking]);
  const setup = useMemo(() => setupFrom(tracking), [tracking]);
  const race = useTrackedRace(spec, setup);
  const { a } = useAnalysis(race);

  const rows = useMemo(() => {
    if (!a || !kit) return [];
    return a.finishes.map((f, i) => {
      const tag = kit.tags.find(t => t.id === f.boatId);
      return { place: i + 1, tagId: f.boatId, sail: tag?.sail_number ?? tag?.tag_hardware_id ?? '?', skipper: matchSkipper(tag, p.skippers), t: f.t, tooClose: f.tooClose.map(id => kit.tags.find(t => t.id === id)?.sail_number ?? '?') };
    });
  }, [a, kit, p.skippers]);
  const ocs = useMemo(() => {
    if (!a || !kit) return [];
    return a.starts.filter(s => s.call === 'over' && s.startedAt == null).map(s => ({ tagId: s.boatId, skipper: matchSkipper(kit.tags.find(t => t.id === s.boatId), p.skippers), sail: kit.tags.find(t => t.id === s.boatId)?.sail_number ?? '?' }));
  }, [a, kit, p.skippers]);
  const close = a?.starts.filter(s => s.call === 'close').length ?? 0;

  const entries = useCallback((onlyNew: boolean): ScoringEntry[] => {
    const out: ScoringEntry[] = [];
    for (const r of rows) if (r.skipper >= 0 && (!onlyNew || !p.scored.includes(r.skipper))) out.push({ skipperIndex: r.skipper, position: r.place });
    for (const o of ocs) if (o.skipper >= 0 && !rows.some(r => r.skipper === o.skipper) && (!onlyNew || !p.scored.includes(o.skipper))) out.push({ skipperIndex: o.skipper, position: null, letterScore: 'OCS' });
    return out;
  }, [rows, ocs, p.scored]);
  const record = useCallback((mode: 'confirm' | 'auto') => {
    if (!session) return;
    const order = [
      ...rows.map(r => ({ tag_id: r.tagId, sail: r.sail, place: r.place, finish_s: a?.gun != null ? r.t - a.gun : null })),
      ...ocs.map(o => ({ tag_id: o.tagId, sail: o.sail, place: 0, finish_s: null, code: 'OCS' as const })),
    ];
    void updateSession(session.id, { scoring: { sent_at: new Date().toISOString(), by: null, mode, order } });
  }, [session, rows, ocs, a]);

  // Automatic: each new finisher goes in as she crosses.
  const autoDone = useRef(0);
  useEffect(() => { autoDone.current = 0; }, [session?.id]);
  useEffect(() => {
    if (tracking?.scoring_mode !== 'auto' || rows.length <= autoDone.current) return;
    autoDone.current = rows.length;
    const e = entries(true);
    if (e.length) { p.onApply(p.raceNo, e); record('auto'); }
  }, [rows.length, tracking?.scoring_mode, entries, p, record]);

  if (!usable) return null;
  const dk = p.darkMode !== false;
  const unmatched = rows.filter(r => r.skipper < 0).length + ocs.filter(o => o.skipper < 0).length;
  const live = session?.is_live && session.status !== 'finished';
  const label = !session ? 'Tracking' : !session.gun_at ? 'Tracking · ready' : rows.length ? `Tracking · ${rows.length} in` : 'Tracking · racing';

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold ${dk ? 'border-white/15 bg-white/[0.06] text-white hover:bg-white/10' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${live && session?.gun_at ? 'bg-[#E11D38]' : session ? 'bg-[#34D399]' : 'bg-slate-400'}`} />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Finish order from tracking" className={`absolute right-0 top-11 z-50 w-[min(380px,calc(100vw-24px))] rounded-2xl border p-4 shadow-2xl ${dk ? 'border-white/10 bg-[#0B1222] text-[#F1F4FA]' : 'border-slate-200 bg-white text-slate-900'}`}>
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-[15px] font-bold">Race {p.raceNo} from tracking</h3>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${dk ? 'bg-white/10' : 'bg-slate-100'}`}>{tracking!.scoring_mode === 'auto' ? 'Automatic' : 'Officer confirms'}</span>
          </div>
          {!session && <p className="m-0 mt-2 text-[13px] opacity-75">Start the sequence in the StartBox and tracking opens this race. The gun marks the start.</p>}
          {session && !session.gun_at && <p className="m-0 mt-2 text-[13px] opacity-75">Tracking is on for this race. Waiting for the gun.</p>}
          {session?.gun_at && (
            <>
              {(ocs.length > 0 || close > 0) && (
                <p className="m-0 mt-2 text-[13px]">
                  {ocs.length > 0 && <span className="font-semibold text-[#F87171]">OCS, not back: {ocs.map(o => o.sail).join(', ')}. </span>}
                  {close > 0 && <span className="text-[#FFB224]">{close} too close to call at the gun: check them in Live Tracking.</span>}
                </p>
              )}
              {!rows.length ? <p className="m-0 mt-2 text-[13px] opacity-75">{race.status === 'ready' ? 'Nobody has finished yet.' : 'Loading the race…'}</p> : (
                <ol className="m-0 mt-2 max-h-[46vh] list-none overflow-y-auto p-0">
                  {rows.map(r => (
                    <li key={r.tagId} className={`flex items-center gap-2 border-t py-1.5 text-[13px] ${dk ? 'border-white/[0.06]' : 'border-slate-100'}`}>
                      <b className="w-6 text-center">{r.place}</b>
                      <b className="w-10">{r.sail}</b>
                      <span className={`min-w-0 flex-1 truncate ${r.skipper < 0 ? 'text-[#F87171]' : ''}`}>{r.skipper >= 0 ? p.skippers[r.skipper].name : 'Not in this event'}</span>
                      {r.tooClose.length > 0 && <span className="text-[11.5px] font-semibold text-[#FFB224]">close: {r.tooClose.join(', ')}</span>}
                      <span className="font-mono text-[12px] opacity-70">{a?.gun != null ? rt1(r.t - a.gun) : ''}</span>
                      {p.scored.includes(r.skipper) && <span className="text-[11px] opacity-60" title="Already scored">✓</span>}
                    </li>
                  ))}
                </ol>
              )}
              {unmatched > 0 && <p className="m-0 mt-2 text-[12px] text-[#F87171]">{unmatched} tag{unmatched > 1 ? 's' : ''} didn't match an entry. Set the tag's sail number in Live Tracking › Kit.</p>}
              <p className="m-0 mt-2 text-[12px] opacity-60">Judged on the hull from each tag's bow offset. Finishes within {Math.round(tracking!.accuracy_m * 100)} cm are flagged close: check them before sending.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {sent && <span className="text-[12.5px] text-[#34D399]" role="status">{sent}</span>}
                {live && <button type="button" className={`h-9 rounded-xl border px-3 text-[13px] font-semibold ${dk ? 'border-white/15 bg-transparent text-white' : 'border-slate-300 bg-white'}`} onClick={() => void updateSession(session.id, { status: 'finished', is_live: false, finished_at: new Date().toISOString() }).then(ok => ok && setSession({ ...session, status: 'finished', is_live: false }))}>End tracking</button>}
                {tracking!.scoring_mode === 'confirm' && (
                  <button type="button" disabled={!entries(false).length}
                    className="ml-auto h-9 rounded-xl border-0 bg-[#2E7BFF] px-3.5 text-[13px] font-bold text-white disabled:opacity-40"
                    onClick={() => {
                      const e = entries(false);
                      p.onApply(p.raceNo, e); record('confirm');
                      setSent(`Sent ${e.length} to race ${p.raceNo}.`);
                    }}>
                    Send to results
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
