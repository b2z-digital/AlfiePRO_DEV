// Live Tracking's front page: the race on now, recent races to replay, the kit at a glance, and a
// demo race sailed by the simulator for anyone who wants to see how it works.
import type { ClubTracking, Kit, SessionRow } from './data';
import { Btn, C, Chip } from '../race-simulator/ui';

interface Props {
  tracking: ClubTracking | null;
  sessions: SessionRow[];
  kit: Kit | null;
  onWatch: (s: SessionRow) => void;
  onDemo: (mode: 'live' | 'replay') => void;
  onTab: (tab: string) => void;
}

const when = (s: SessionRow) => new Date(s.gun_at ?? s.started_at ?? s.created_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function HomeView({ tracking, sessions, kit, onWatch, onDemo, onTab }: Props) {
  const live = sessions.filter(s => s.is_live && s.status !== 'finished' && s.status !== 'abandoned');
  const recent = sessions.filter(s => s.status === 'finished').slice(0, 8);
  const officersOnly = tracking?.visibility === 'officers' && !tracking.can_run;
  const recentS = (iso: string | null) => !!iso && Date.now() - Date.parse(iso) < 90_000;
  const aOn = kit?.anchors.filter(a => recentS(a.last_seen_at)).length ?? 0;
  const low = kit?.tags.filter(t => t.is_active && t.battery_level != null && t.battery_level < (tracking?.alerts?.battery_pct ?? 20)).length ?? 0;
  const winner = (s: SessionRow) => s.scoring?.order?.find(o => o.place === 1)?.sail;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        <section aria-labelledby="h-now" className="min-w-0 flex-[2_1_420px] rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-[#10264A] to-[#0A0F1C] p-5">
          <div className="flex items-center gap-2">
            <h3 id="h-now" className="m-0 text-[16px] font-bold">On the water</h3>
            {live.length > 0 && <span className="inline-flex h-[24px] items-center gap-1.5 rounded-full bg-[#E11D38] px-2.5 text-[11.5px] font-bold tracking-[0.08em] text-white"><span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-white" />LIVE</span>}
          </div>
          {!tracking ? (
            <p className="m-0 mt-2 text-[14px]" style={{ color: C.mute }}>Tracking isn't set up at this club. The demo below shows what members see once it is.</p>
          ) : officersOnly ? (
            <p className="m-0 mt-2 text-[14px]" style={{ color: C.mute }}>Your club shows live races to the race officers only. Replays open here once a race is scored.</p>
          ) : live.length ? (
            <ul className="m-0 mt-3 list-none p-0">
              {live.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] py-3 first:border-t-0 first:pt-0">
                  <span className="min-w-0 flex-1"><b className="block text-[18px]">{s.name}</b><span className="text-[13px]" style={{ color: C.mute }}>{s.status === 'pre_start' ? 'Starting sequence' : 'Racing'}{s.gun_at ? ` · gun ${new Date(s.gun_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}</span></span>
                  <Btn primary onClick={() => onWatch(s)}>Watch live</Btn>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-2 text-[14px]" style={{ color: C.mute }}>No race on right now. When the race officer starts the sequence in the scoring screen, it goes live here.</p>
          )}
        </section>
        <section aria-labelledby="h-demo" className="min-w-0 flex-[1_1_280px] rounded-[22px] border border-white/[0.08] bg-[#0A0F1C] p-5">
          <h3 id="h-demo" className="m-0 text-[16px] font-bold">Demo race</h3>
          <p className="m-0 mt-1.5 text-[13.5px]" style={{ color: C.mute }}>Twelve IOMs sailed by the race simulator, tracked the way the real system tracks your fleet. Nothing in it touches your club's results.</p>
          <div className="mt-3 flex flex-wrap gap-2"><Btn primary onClick={() => onDemo('live')}>Watch it live</Btn><Btn onClick={() => onDemo('replay')}>Open the replay</Btn></div>
        </section>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        {tracking && (
          <section aria-labelledby="h-recent" className="min-w-0 flex-[2_1_420px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
            <h3 id="h-recent" className="m-0 text-[15px] font-bold">Recent races</h3>
            {!recent.length && <p className="m-0 mt-2 text-[13px]" style={{ color: C.mute }}>No tracked races yet.</p>}
            <ul className="m-0 mt-1 list-none p-0">
              {recent.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 border-t border-white/[0.05] py-2.5 text-[13.5px] first:border-t-0">
                  <span className="min-w-0 flex-1"><b className="block truncate">{s.name}</b><span className="text-[12.5px]" style={{ color: C.mute }}>{when(s)}{winner(s) ? ` · won by ${winner(s)}` : ''}</span></span>
                  {s.scoring && <Chip tone="good">Scored</Chip>}
                  <Btn small onClick={() => onWatch(s)}>Replay</Btn>
                </li>
              ))}
            </ul>
          </section>
        )}
        {tracking?.can_run && kit && (
          <section aria-labelledby="h-kit" className="min-w-0 flex-[1_1_280px] rounded-[20px] border border-white/[0.08] bg-[#0A0F1C] p-4">
            <h3 id="h-kit" className="m-0 text-[15px] font-bold">The kit</h3>
            <dl className="m-0 mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-[12px]" style={{ color: C.mute }}>Anchors heard</dt><dd className="m-0 font-mono text-[18px] font-semibold">{aOn} / {kit.anchors.length}</dd></div>
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-[12px]" style={{ color: C.mute }}>Low batteries</dt><dd className="m-0 font-mono text-[18px] font-semibold" style={low ? { color: '#FFB224' } : undefined}>{low}</dd></div>
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-[12px]" style={{ color: C.mute }}>Tags</dt><dd className="m-0 font-mono text-[18px] font-semibold">{kit.tags.filter(t => t.is_active).length}</dd></div>
              <div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-[12px]" style={{ color: C.mute }}>Finish order</dt><dd className="m-0 text-[14px] font-semibold">{tracking.scoring_mode === 'off' ? 'Off' : tracking.scoring_mode === 'auto' ? 'Automatic' : 'Officer confirms'}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2"><Btn small onClick={() => onTab('kit')}>Kit</Btn><Btn small onClick={() => onTab('course')}>Course</Btn><Btn small onClick={() => onTab('settings')}>Settings</Btn></div>
          </section>
        )}
      </div>
    </div>
  );
}
