// Live Tracking. Shown only when the club's tracking system is set up and switched on (club_tracking
// says active); super admins can also open the demo. Members watch live and replay; race officers
// also get the officer's desk, the course, the kit and the settings.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listSessions, loadKit, myMemberIds, setupFrom, updateSession, type ClubTracking, type Kit, type SessionRow } from './data';
import { useTrackedRace, type RaceSpec } from './source';
import HomeView from './HomeView';
import LiveView from './LiveView';
import StartView from './StartView';
import ReplayView from './ReplayView';
import OfficerView from './OfficerView';
import MyRacesView from './MyRacesView';
import CourseView from './CourseView';
import KitView from './KitView';
import SettingsView from './SettingsView';
import TvView from './TvView';
import { Btn, C, cx } from '../race-simulator/ui';

export interface TrackingAccount { userId: string | null; clubId: string | null; superAdmin: boolean }
interface Props { account: TrackingAccount; tracking: ClubTracking | null; onTrackingChanged: () => void }

type Tab = 'home' | 'live' | 'start' | 'replay' | 'officer' | 'mine' | 'course' | 'kit' | 'settings';

function NoRace({ onDemo, onHome }: { onDemo: () => void; onHome: () => void }) {
  return (
    <div className="max-w-[560px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-5">
      <h3 className="m-0 text-[16px] font-bold">No race open</h3>
      <p className="m-0 mt-1.5 text-[13.5px]" style={{ color: C.mute }}>Pick a live race or a replay on the home page, or open the demo race.</p>
      <div className="mt-3 flex gap-2"><Btn onClick={onHome}>Home</Btn><Btn primary onClick={onDemo}>Demo race</Btn></div>
    </div>
  );
}

export default function TrackingPage({ account, tracking, onTrackingChanged }: Props) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'home';
  const setTab = useCallback((t: string) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true }), [setParams]);
  const on = !!tracking?.active;
  const officer = on && !!tracking?.can_run;

  const [kit, setKit] = useState<Kit | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [spec, setSpec] = useState<RaceSpec | null>(null);
  const [tv, setTv] = useState(false);
  const [ending, setEnding] = useState(false);
  const configId = on ? tracking!.config_id : null;

  useEffect(() => {
    if (!configId) return;
    let live = true;
    void loadKit(configId).then(k => { if (live && k) setKit(k); });
    const poll = () => void listSessions(configId).then(s => { if (live && s) setSessions(s); });
    poll();
    const id = window.setInterval(poll, 30_000);
    return () => { live = false; window.clearInterval(id); };
  }, [configId]);
  useEffect(() => {
    if (!account.userId || !account.clubId || !on) return;
    let live = true;
    void myMemberIds(account.userId, account.clubId).then(m => { if (live) setMine(m); });
    return () => { live = false; };
  }, [account.userId, account.clubId, on]);

  const setup = useMemo(() => setupFrom(tracking), [tracking]);
  const race = useTrackedRace(spec, setup);
  const watch = useCallback((s: SessionRow) => {
    if (!kit || !tracking) return;
    setSpec({ kind: 'session', session: s, kit, tracking });
    setTab(s.is_live ? 'live' : 'replay');
  }, [kit, tracking, setTab]);
  const demo = useCallback((mode: 'live' | 'replay') => {
    setSpec({ kind: 'demo', seed: 5, venue: 'lmryc', mode, speed: 1 });
    setTab(mode === 'live' ? 'live' : 'replay');
  }, [setTab]);
  const endRace = useCallback(async () => {
    if (spec?.kind !== 'session') return;
    setEnding(true);
    const ok = await updateSession(spec.session.id, { status: 'finished', is_live: false, finished_at: new Date().toISOString() });
    setEnding(false);
    if (ok && configId) void listSessions(configId).then(s => s && setSessions(s));
  }, [spec, configId]);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'home', label: 'Home', show: true },
    { id: 'live', label: race.live ? 'Live' : 'Race', show: true },
    { id: 'start', label: 'The start', show: true },
    { id: 'replay', label: 'Replay', show: true },
    { id: 'officer', label: 'Race officer', show: officer || (!!spec && spec.kind === 'demo' && account.superAdmin) },
    { id: 'mine', label: 'My races', show: on },
    { id: 'course', label: 'Course', show: officer },
    { id: 'kit', label: 'Kit', show: officer },
    { id: 'settings', label: 'Settings', show: officer },
  ];
  const visible = tabs.filter(t => t.show);
  const active: Tab = visible.some(t => t.id === tab) ? tab : 'home';
  const needsRace = active === 'live' || active === 'start' || active === 'replay' || active === 'officer';
  const lowBattery = (kit?.tags ?? []).filter(t => t.is_active && t.battery_level != null && t.battery_level < (tracking?.alerts?.battery_pct ?? 20)).map(t => ({ sail: t.sail_number ?? t.tag_hardware_id, pct: t.battery_level! }));

  return (
    <div className="sim-page min-h-full px-4 pb-10 pt-4 font-sans text-[#F1F4FA] sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="m-0 font-display text-[26px] font-bold tracking-[-0.01em]">Live Tracking</h1>
          <p className="m-0 text-[13px]" style={{ color: C.mute }}>{on ? 'Every boat on the water, to the centimetre' : 'Demo: tracking isn’t switched on at this club'}</p>
        </div>
        {spec && <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[12.5px]" style={{ color: C.mute }}>{race.name || 'Loading…'}{race.live ? ' · live' : ''}</span>}
      </header>
      <nav aria-label="Live Tracking" className="-mx-1 mt-3 overflow-x-auto pb-1">
        <div role="tablist" className="flex w-max gap-1 px-1">
          {visible.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={active === t.id} onClick={() => setTab(t.id)}
              className={cx('h-9 cursor-pointer whitespace-nowrap rounded-xl border px-3.5 text-[13.5px] font-semibold', active === t.id ? 'border-[#4DA3FF]/60 bg-[#4DA3FF]/15 text-white' : 'border-white/10 bg-white/[0.03] text-[rgba(235,240,255,.75)] hover:bg-white/[0.07]')}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="mt-3" role="tabpanel">
        {active === 'home' && <HomeView tracking={on ? tracking : null} sessions={sessions} kit={kit} onWatch={watch} onDemo={demo} onTab={setTab} />}
        {needsRace && !spec && <NoRace onDemo={() => demo(active === 'replay' ? 'replay' : 'live')} onHome={() => setTab('home')} />}
        {needsRace && spec && active === 'live' && <LiveView race={race} onTv={() => setTv(true)} onStart={() => setTab('start')} onOfficer={officer ? () => setTab('officer') : undefined} />}
        {needsRace && spec && active === 'start' && <StartView race={race} />}
        {needsRace && spec && active === 'replay' && <ReplayView race={race} />}
        {needsRace && spec && active === 'officer' && <OfficerView race={race} lowBattery={spec.kind === 'session' ? lowBattery : []} onEnd={spec.kind === 'session' ? () => void endRace() : undefined} ending={ending} />}
        {active === 'mine' && kit && <MyRacesView sessions={sessions} kit={kit} mine={mine} onOpen={watch} />}
        {active === 'course' && kit && tracking && <CourseView kit={kit} tracking={tracking} onChange={setKit} />}
        {active === 'kit' && kit && tracking && <KitView kit={kit} tracking={tracking} onChange={setKit} />}
        {active === 'settings' && tracking && <SettingsView tracking={tracking} onSaved={onTrackingChanged} />}
        {(active === 'mine' || active === 'course' || active === 'kit') && !kit && <p style={{ color: C.mute }}>Loading the kit…</p>}
      </div>
      {tv && spec && <TvView race={race} onClose={() => setTv(false)} />}
    </div>
  );
}
