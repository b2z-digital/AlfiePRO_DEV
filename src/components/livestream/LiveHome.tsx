import { useEffect, useMemo, useState } from 'react';
import { Plus, Radio, Trash2, Video, Check, Link2, Cloud, Youtube, FlaskConical } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import type { LivestreamSession } from '../../types/livestream';

/**
 * Live home (livestream board "Live: broadcasts home"): what's live, what's next,
 * what's scheduled and recent broadcasts with their race videos.
 */

type Session = LivestreamSession & { venueName?: string; engine?: string; broadcast_mode?: string };

interface LiveHomeProps {
  sessions: Session[];
  autoCreateForEvent?: { eventId: string; eventName: string };
  activating?: boolean;
  onOpen: (session: Session) => void;
  onNew: () => void;
  onDelete: (session: Session) => void;
}

const isOnAir = (s: Session) => s.status === 'live' || s.status === 'testing';

function when(s: Session): Date | null {
  const iso = s.scheduled_start_time || s.actual_start_time || null;
  return iso ? new Date(iso) : null;
}

function DateBlock({ date }: { date: Date | null }) {
  return (
    <span className="alv-date" aria-hidden="true">
      <small>{date ? date.toLocaleDateString([], { month: 'short' }).toUpperCase() : 'NOW'}</small>
      <b>{date ? date.getDate() : '●'}</b>
    </span>
  );
}

function relativeDay(d: Date | null): string {
  if (!d) return 'Not scheduled';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Tomorrow · ${time}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString([], { weekday: 'long' })} · ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function filming(s: Session): string {
  if (s.engine === 'cloud') return 'Cloud production';
  if (s.stream_input_mode === 'rtmp_external') return 'Pro encoder (RTMP)';
  return 'This device and phones';
}

function duration(s: Session): string | null {
  if (!s.actual_start_time || !s.end_time) return null;
  const secs = Math.max(0, Math.round((new Date(s.end_time).getTime() - new Date(s.actual_start_time).getTime()) / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), sec = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function LiveHome({ sessions, autoCreateForEvent, activating, onOpen, onNew, onDelete }: LiveHomeProps) {
  const [raceVideos, setRaceVideos] = useState<Record<string, number>>({});
  const [cameraCounts, setCameraCounts] = useState<Record<string, number>>({});

  const ids = useMemo(() => sessions.map((s) => s.id), [sessions]);
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const [{ data: segs }, { data: cams }] = await Promise.all([
        supabase.from('livestream_race_segments').select('session_id, upload_status').in('session_id', ids),
        supabase.from('livestream_cameras').select('livestream_session_id').in('livestream_session_id', ids),
      ]);
      if (cancelled) return;
      const v: Record<string, number> = {};
      (segs || []).forEach((r: { session_id: string; upload_status: string }) => {
        if (r.upload_status === 'uploaded' || r.upload_status === 'cleanup_complete') v[r.session_id] = (v[r.session_id] || 0) + 1;
      });
      const c: Record<string, number> = {};
      (cams || []).forEach((r: { livestream_session_id: string }) => { c[r.livestream_session_id] = (c[r.livestream_session_id] || 0) + 1; });
      setRaceVideos(v);
      setCameraCounts(c);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [ids]);

  const now = Date.now();
  const live = sessions.filter(isOnAir);
  const upcoming = sessions
    .filter((s) => !isOnAir(s) && s.status !== 'ended' && s.status !== 'archived')
    .sort((a, b) => (when(a)?.getTime() ?? now) - (when(b)?.getTime() ?? now));
  const next = upcoming[0] ?? null;
  const later = upcoming.slice(1);
  const recent = sessions.filter((s) => s.status === 'ended').slice(0, 6);

  const scoringContext = !!autoCreateForEvent;
  const forThisEvent = scoringContext ? sessions.filter((s) => s.event_id && s.event_id === autoCreateForEvent?.eventId) : [];

  const header = (
    <div className="alv-home-head">
      <div style={{ minWidth: 0 }}>
        <div className="alv-eyebrow">{scoringContext ? 'Livestream' : 'Broadcasts'}</div>
        <p className="alv-mute" style={{ margin: '6px 0 0', fontSize: 14 }}>
          {scoringContext
            ? `Broadcast ${autoCreateForEvent?.eventName} live in AlfieTV. Each race goes to YouTube once it's scored.`
            : 'Nothing goes public until you press Go live.'}
        </p>
      </div>
      <button type="button" className="alv-btn alv-btn-p" onClick={onNew} disabled={activating}>
        <Plus size={16} aria-hidden="true" />
        {activating ? 'Setting up…' : scoringContext ? 'Set up livestream' : 'New broadcast'}
      </button>
    </div>
  );

  const heroCard = (s: Session, kind: 'live' | 'next') => {
    const d = when(s);
    const cams = cameraCounts[s.id] || 0;
    return (
      <div className={`alv-card alv-hero ${kind === 'live' ? 'is-live' : ''}`} key={s.id}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <DateBlock date={kind === 'live' ? null : d} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="alv-eyebrow" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {kind === 'live'
                ? <span className={`alv-live-badge ${s.status === 'live' ? '' : 'is-preview'}`}><span className="pulse" />{s.status === 'live' ? 'LIVE' : 'PREVIEW'}</span>
                : <span>Next up · {relativeDay(d)}</span>}
              {s.is_public === false && <span className="alv-chip is-test" style={{ height: 22 }}><FlaskConical size={12} aria-hidden="true" />Test</span>}
            </div>
            <h3 className="alv-disp" style={{ margin: '6px 0 2px', fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.title}</h3>
            <div className="alv-mute" style={{ fontSize: 13.5 }}>{[s.venueName, filming(s)].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <span className="alv-chip">{s.event_id ? <><Check size={13} className="ok" aria-hidden="true" />Linked to scoring</> : <><Link2 size={13} aria-hidden="true" />Not linked to an event</>}</span>
              <span className="alv-chip">{cams > 0 ? <><Check size={13} className="ok" aria-hidden="true" />{cams} camera{cams === 1 ? '' : 's'} paired</> : 'No cameras yet'}</span>
              <span className="alv-chip"><Check size={13} className="ok" aria-hidden="true" />{s.broadcast_mode === 'races_only' ? 'Race videos only' : 'Race videos to YouTube'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className="alv-btn alv-btn-p" onClick={() => onOpen(s)}>
            {kind === 'live' ? 'Open control room' : 'Open control room'}
          </button>
          {kind !== 'live' && (
            <button type="button" className="alv-btn" onClick={() => onDelete(s)} aria-label={`Delete ${s.title}`}>
              <Trash2 size={15} aria-hidden="true" />Delete
            </button>
          )}
        </div>
      </div>
    );
  };

  const rows = (list: Session[], label: string) => (
    <div className="alv-card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px' }}>
        <span className="alv-disp" style={{ fontSize: 18, fontWeight: 700 }}>{label}</span>
        <span className="alv-mute" style={{ fontSize: 13 }}>{list.length} {label === 'Upcoming' ? 'scheduled' : 'broadcasts'}</span>
      </div>
      {list.map((s) => {
        const d = when(s);
        const vids = raceVideos[s.id] || 0;
        const dur = duration(s);
        return (
          <div key={s.id} className="alv-row">
            <DateBlock date={d} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div className="alv-mute" style={{ fontSize: 13 }}>
                {s.status === 'ended'
                  ? [d ? d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : null, dur, vids ? `${vids} race video${vids === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
                  : [relativeDay(d), filming(s)].join(' · ')}
              </div>
            </div>
            <span className="alv-chip" style={{ justifySelf: 'end' }}>
              {s.status === 'ended' ? 'Ended' : s.status === 'scheduled' ? 'Scheduled' : 'Draft'}
              {s.is_public === false ? ' · Test' : ''}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="alv-btn is-small" onClick={() => onOpen(s)}>Open</button>
              <button type="button" className="alv-ib" onClick={() => onDelete(s)} aria-label={`Delete ${s.title}`}><Trash2 size={16} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="alv alv-home">
      {header}

      <div className={`alv-home-grid ${scoringContext ? 'is-narrow' : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {live.map((s) => heroCard(s, 'live'))}
          {scoringContext && forThisEvent.filter((s) => !isOnAir(s) && s.status !== 'ended').map((s) => heroCard(s, 'next'))}
          {!scoringContext && next && heroCard(next, 'next')}

          {sessions.length === 0 && (
            <div className="alv-card" style={{ padding: 28, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(225,29,56,0.14)' }}>
                <Video size={26} color="#FF8796" aria-hidden="true" />
              </div>
              <div className="alv-disp" style={{ fontSize: 20, fontWeight: 700 }}>No broadcasts yet</div>
              <p className="alv-mute" style={{ margin: '6px auto 16px', maxWidth: 420, fontSize: 14 }}>
                Set one up for your next race day. Nothing goes public until you press Go live.
              </p>
              <button type="button" className="alv-btn alv-btn-p" onClick={onNew}><Plus size={16} aria-hidden="true" />{scoringContext ? 'Set up livestream' : 'New broadcast'}</button>
            </div>
          )}

          {!scoringContext && later.length > 0 && rows(later, 'Upcoming')}
          {!scoringContext && recent.length > 0 && rows(recent, 'Recent')}
          {scoringContext && sessions.filter((s) => !forThisEvent.includes(s) && !isOnAir(s)).length > 0 &&
            rows(sessions.filter((s) => !forThisEvent.includes(s) && !isOnAir(s)).slice(0, 8), 'Other broadcasts')}
        </div>

        {!scoringContext && (
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <div className="alv-card" style={{ padding: '16px 18px' }}>
              <span className="alv-disp" style={{ fontSize: 18, fontWeight: 700 }}>Where it goes</span>
              <div className="alv-dest">
                <span className="alv-dot" style={{ background: 'rgba(225,29,56,0.14)' }}><Radio size={17} color="#FF8796" aria-hidden="true" /></span>
                <div><div style={{ fontWeight: 600 }}>Live in AlfieTV and event pages</div><div className="alv-mute" style={{ fontSize: 12.5 }}>Cloudflare · while you're live</div></div>
                <span className="ok" style={{ fontWeight: 600, fontSize: 13 }}>On</span>
              </div>
              <div className="alv-dest">
                <span className="alv-dot" style={{ background: 'rgba(255,0,0,0.12)' }}><Youtube size={17} color="#FF6B6B" aria-hidden="true" /></span>
                <div><div style={{ fontWeight: 600 }}>YouTube · AUS RC Yachting</div><div className="alv-mute" style={{ fontSize: 12.5 }}>A video per race · playlist per event</div></div>
                <span className="ok" style={{ fontWeight: 600, fontSize: 13 }}>Connected</span>
              </div>
              <div className="alv-dest">
                <span className="alv-dot" style={{ background: 'rgba(42,147,255,0.14)' }}><Cloud size={17} color="#8CC4FF" aria-hidden="true" /></span>
                <div><div style={{ fontWeight: 600 }}>Replays in AlfieTV</div><div className="alv-mute" style={{ fontSize: 12.5 }}>Played from YouTube, free to watch</div></div>
                <span className="ok" style={{ fontWeight: 600, fontSize: 13 }}>On</span>
              </div>
            </div>

            <div className="alv-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span className="alv-disp" style={{ fontSize: 18, fontWeight: 700 }}>Overlay look</span>
              <div className="alv-look" aria-hidden="true">
                <span className="lb">LIVE</span>
                <span className="bar"><b>RACE 5</b><span style={{ color: '#FF8796' }}>● Racing</span><span>12:42</span></span>
                <span className="fl">{['07 K. Ashby', '51 R. Malone', '12 T. Nguyen', '88 D. Fraser'].map((t, i) => <span key={t}><i>{i + 1}</i>{t}</span>)}</span>
              </div>
              <span className="alv-mute" style={{ fontSize: 13 }}>Fleet list, race bar, hold and results cards. Set how see-through they are in the control room's Overlays tab.</span>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
