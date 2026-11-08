import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import type { StartSequence, StartBoxState } from '../../types/startBox';
import { getStartBoxEngine, destroyStartBoxEngine } from '../../utils/startBoxAudio';
import { getSequences } from '../../utils/startBoxStorage';
import { isNative } from '../../lib/native/platform';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';

const SEQ_KEY = 'alfie-m-race-timer-seq';
const VOL_KEY = 'startbox-volume';
const R = 136, C = 2 * Math.PI * R;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const elapsedStr = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600);
  return h ? `${h}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Keep the screen on while the timer runs (native plugin in the apps, Wake Lock in browsers). */
function useKeepAwake(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: any = null;
    if (isNative) {
      import('@capacitor-community/keep-awake').then(({ KeepAwake }) => KeepAwake.keepAwake()).catch(() => {});
    } else {
      (navigator as any).wakeLock?.request('screen').then((l: any) => { lock = l; }).catch(() => {});
    }
    return () => {
      if (isNative) import('@capacitor-community/keep-awake').then(({ KeepAwake }) => KeepAwake.allowSleep()).catch(() => {});
      else lock?.release?.().catch(() => {});
    };
  }, [on]);
}

/**
 * The stand-alone Race Timer: the club's start sequences played by the same StartBox
 * engine the race desk uses (sounds, beeps, minute callouts), big enough to read with
 * a transmitter in your hands.
 */
export const RaceTimerScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { tap } = useMobile();
  const engine = useRef(getStartBoxEngine()).current;
  const [sequences, setSequences] = useState<StartSequence[]>([]);
  const [seq, setSeq] = useState<StartSequence | null>(null);
  const [state, setState] = useState<StartBoxState>('idle');
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState(false);
  const [volume, setVolume] = useState(() => { try { return Number(localStorage.getItem(VOL_KEY) || 0.8); } catch { return 0.8; } });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    getSequences(currentClub?.clubId || null).then(list => {
      const usable = list.filter(s => s.sequence_type !== 'botw');
      setSequences(usable);
      let saved: string | null = null;
      try { saved = localStorage.getItem(SEQ_KEY); } catch { /* private mode */ }
      const pick = usable.find(s => s.id === saved) || usable.find(s => s.race_type_default === 'scratch') || usable.find(s => s.is_system_default) || usable[0];
      if (pick) choose(pick);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClub?.clubId]);

  useEffect(() => {
    engine.setVolume(volume);
    const offs = [
      engine.onStateChange(s => {
        setState(s);
        if (s === 'completed') { setDoneAt(Date.now()); tap('success'); }
      }),
      engine.onTick(d => { setRemaining(d.remainingMs); setTotal(d.totalDurationSeconds * 1000); setState(d.state); }),
      engine.onSoundFired(ss => { tap('medium'); if (ss.label) { setFlash(ss.label); setTimeout(() => setFlash(null), 2500); } }),
    ];
    return () => offs.forEach(f => f());
  }, [engine, volume, tap]);
  useEffect(() => () => destroyStartBoxEngine(), []);
  useEffect(() => {
    if (!doneAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [doneAt]);
  useKeepAwake(state === 'running' || !!doneAt);

  const choose = useCallback((s: StartSequence) => {
    setSeq(s);
    setDoneAt(null);
    try { localStorage.setItem(SEQ_KEY, s.id); } catch { /* private mode */ }
    engine.arm(s);
    const ms = (s.use_audio_only && s.countdown_start_seconds ? s.countdown_start_seconds : s.total_duration_seconds) * 1000;
    setRemaining(ms);
    setTotal(ms);
  }, [engine]);

  const signals = useMemo(() => {
    const ts = [...new Set((seq?.sounds || []).map(s => s.trigger_time_seconds).filter(t => t >= 0))].sort((a, b) => b - a);
    return ts.map(t => ({ t, label: (seq?.sounds || []).find(s => s.trigger_time_seconds === t && s.label)?.label || '' }));
  }, [seq]);
  const remS = remaining / 1000;
  const passed = signals.filter(s => s.t >= remS - 0.01 && (state === 'running' || state === 'paused' || state === 'completed'));
  const current = passed[passed.length - 1];
  const next = signals.find(s => s.t < remS - 0.01);
  const phase = flash || (state === 'armed' || state === 'idle' ? 'Ready when you are' : current?.label || (next ? `Next signal at ${mmss(next.t * 1000)}` : ''));

  const start = async () => { tap('medium'); await engine.initialize(); if (engine.getState() === 'idle' && seq) engine.arm(seq); setDoneAt(null); engine.start(); };
  const pause = () => { tap(); engine.pause(); };
  const resume = () => { tap(); engine.resume(); };
  const reset = () => { tap(); setDoneAt(null); if (seq) choose(seq); else engine.reset(); };
  const sync = () => { tap('medium'); engine.syncToMinute(); };
  const canSync = (state === 'running' || state === 'paused') && !seq?.use_audio_only && !seq?.audio_file_url;
  const progress = total ? Math.min(1, Math.max(0, remaining / total)) : 1;
  const running = state === 'running';

  return (
    <div className="m-stack m-timer" style={{ alignItems: 'center', minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <header className="m-top" style={{ alignSelf: 'stretch' }}>
        <button className="m-ibtn" aria-label="Close" onClick={() => { engine.stop(); window.history.length > 1 ? navigate(-1) : navigate('/me'); }}><Icon name="close" /></button>
        <button onClick={() => setPicking(true)} disabled={running} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 600, background: 'none', border: 0, color: 'var(--m-ink)' }}>
          {seq?.name || 'Choose a sequence'}{!running && <Icon name="down" size={16} />}
        </button>
        <button className="m-ibtn" aria-label="Sound settings" onClick={() => setSettings(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>
        </button>
      </header>

      <div style={{ position: 'relative', width: 300, height: 300, maxWidth: '82vw', maxHeight: '82vw', marginTop: 22 }} role="timer" aria-live="off" aria-label={doneAt ? `Racing ${elapsedStr(now - doneAt)}` : `${mmss(remaining)} to the start`}>
        <svg width="100%" height="100%" viewBox="0 0 300 300" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
          <defs><linearGradient id="m-spec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2E7BFF" /><stop offset=".4" stopColor="#8A4DFF" /><stop offset=".7" stopColor="#FF3E9A" /><stop offset="1" stopColor="#FF8A2B" /></linearGradient></defs>
          <circle cx="150" cy="150" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="14" />
          <circle cx="150" cy="150" r={R} fill="none" stroke={doneAt ? '#34C759' : 'url(#m-spec)'} strokeWidth="14" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={doneAt ? 0 : C * (1 - progress)} transform="rotate(-90 150 150)" style={{ transition: running ? 'stroke-dashoffset .1s linear' : undefined }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', padding: '0 30px' }}>
          <span className="m-lb" style={{ color: doneAt ? '#7DE39A' : '#FF8DC2' }}>{doneAt ? 'Racing' : 'To the start'}</span>
          <span className="m-disp m-num" style={{ fontSize: 'min(92px, 24vw)', fontWeight: 700, lineHeight: 1 }}>{doneAt ? elapsedStr(now - doneAt) : mmss(remaining)}</span>
          <span className="m-mut" style={{ fontSize: 14, minHeight: 20 }}>{doneAt ? 'Started' : phase}</span>
        </div>
      </div>

      {signals.length > 0 && !doneAt && (
        <div className="m-row" style={{ gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
          {signals.map(s => {
            const isNow = current?.t === s.t;
            const gone = passed.includes(s) && !isNow;
            return <span key={s.t} className={`m-chip ${isNow ? 'm-chip-on' : ''}`} style={gone ? { color: 'var(--m-dim)' } : undefined}>{mmss(s.t * 1000)}</span>;
          })}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 24 }} />
      <div className="m-row" style={{ gap: 24 }}>
        <button className="m-rb" aria-label="Sync to the nearest minute" onClick={sync} disabled={!canSync} style={{ width: 64, height: 64, background: 'var(--m-fill)', flexDirection: 'column', fontSize: 12, gap: 2, opacity: canSync ? 1 : .45 }}>
          <Icon name="clock" size={20} />Sync
        </button>
        {running ? (
          <button className="m-rb" aria-label="Pause" onClick={pause} style={{ width: 88, height: 88, background: '#FF9F0A', color: '#1A0E00' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
          </button>
        ) : state === 'paused' ? (
          <button className="m-rb" aria-label="Resume" onClick={resume} style={{ width: 88, height: 88, background: '#34C759', color: '#04210E' }}><Icon name="play" size={30} /></button>
        ) : (
          <button className="m-rb" aria-label="Start" onClick={doneAt ? reset : start} disabled={!seq} style={{ width: 88, height: 88, background: doneAt ? 'var(--m-fill)' : '#34C759', color: doneAt ? 'var(--m-ink)' : '#04210E', fontSize: 15, fontWeight: 700 }}>
            {doneAt ? 'Again' : <Icon name="play" size={30} />}
          </button>
        )}
        <button className="m-rb" aria-label="Reset" onClick={reset} style={{ width: 64, height: 64, background: 'var(--m-fill)', flexDirection: 'column', fontSize: 12, gap: 2 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" /></svg>Reset
        </button>
      </div>
      <div className="m-dim m-row" style={{ fontSize: 12.5, gap: 6, marginTop: 12 }}><Icon name="timer" size={14} />Screen stays on while the timer runs</div>

      {picking && (
        <>
          <div className="m-veil" onClick={() => setPicking(false)} />
          <div className="m-sheet" role="dialog" aria-label="Start sequences">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Start sequence</div>
            {sequences.length === 0 ? <div className="m-empty">No start sequences yet. Your club sets these up in StartBox on the desktop.</div> : (
              <div className="m-card">
                {sequences.map(s => (
                  <button key={s.id} className="m-li" onClick={() => { choose(s); setPicking(false); }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{s.name}</span>
                      <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{mmss(s.total_duration_seconds * 1000)}{s.club_id ? ' · your club' : ''}{s.description ? ` · ${s.description}` : ''}</span>
                    </span>
                    {seq?.id === s.id && <Icon name="check" className="m-dim" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {settings && (
        <>
          <div className="m-veil" onClick={() => setSettings(false)} />
          <div className="m-sheet" role="dialog" aria-label="Sound">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 14 }}>Sound</div>
            <label className="m-row" style={{ gap: 12 }}>
              <span className="m-mut" style={{ width: 60 }}>Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={volume} style={{ flex: 1, accentColor: '#0A84FF' }}
                onChange={e => { const v = Number(e.target.value); setVolume(v); engine.setVolume(v); try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ignore */ } }} />
              <span className="m-num" style={{ width: 36, textAlign: 'right' }}>{Math.round(volume * 100)}</span>
            </label>
            <button className="m-btn m-btn-g" style={{ width: '100%', marginTop: 16 }} onClick={async () => { await engine.initialize(); engine.playSynthBeep(1000, 200); }}>Test sound</button>
            <div className="m-dim" style={{ fontSize: 12.5, marginTop: 10 }}>Turn the ringer on: some phones mute app sounds in silent mode.</div>
          </div>
        </>
      )}
    </div>
  );
};

export default RaceTimerScreen;
