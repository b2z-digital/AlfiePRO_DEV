/**
 * Pieces shared by the stand-alone Race Timer and the race desk StartBox: keep the screen on,
 * the Spectrum dial, and the sound sheet. All sound goes through the desktop StartBox engine.
 */
import React, { useEffect, useState } from 'react';
import type { StartBoxAudioEngine } from '../utils/startBoxAudio';
import { getSoundById } from '../utils/startBoxStorage';
import { isNative } from '../lib/native/platform';
import { Icon } from './icons';

export const VOL_KEY = 'startbox-volume';

/** The StartBox system sounds (start_box_sounds). */
export const SOUND = {
  startHorn: 'a0000001-0000-0000-0000-000000000002',
  whistle: 'a0000001-0000-0000-0000-000000000003',
  bell: 'a0000001-0000-0000-0000-000000000004',
  doubleHorn: 'a0000001-0000-0000-0000-000000000006',
} as const;

const urlCache = new Map<string, string | null>();

/** Plays a StartBox system sound (a synth tone if it can't be loaded). */
export async function playSystemSound(engine: StartBoxAudioEngine, id: string, fallbackHz = 880, fallbackMs = 400) {
  await engine.initialize();
  if (!urlCache.has(id)) urlCache.set(id, (await getSoundById(id).catch(() => null))?.file_url || null);
  const url = urlCache.get(id);
  if (url) engine.playSound(url); else engine.playSynthBeep(fallbackHz, fallbackMs);
}

export function readVolume(): number {
  try { return Number(localStorage.getItem(VOL_KEY) || 0.8); } catch { return 0.8; }
}

/** Keep the screen on while the timer runs (native plugin in the apps, Wake Lock in browsers). */
export function useKeepAwake(on: boolean) {
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

/** The round Spectrum dial: progress runs down with the countdown; green once racing. */
export const StartDial: React.FC<{ size: number; progress: number; racing?: boolean; animate?: boolean; label?: string; children: React.ReactNode }> = ({ size, progress, racing, animate, label, children }) => {
  const R = size / 2 - 14, C = 2 * Math.PI * R, c = size / 2;
  return (
    <div style={{ position: 'relative', width: size, height: size, maxWidth: '82vw', maxHeight: '82vw' }} role="timer" aria-live="off" aria-label={label}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
        <defs><linearGradient id={`m-spec-${size}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2E7BFF" /><stop offset=".4" stopColor="#8A4DFF" /><stop offset=".7" stopColor="#FF3E9A" /><stop offset="1" stopColor="#FF8A2B" /></linearGradient></defs>
        <circle cx={c} cy={c} r={R} fill="none" stroke="var(--m-dial-track, rgba(255,255,255,.07))" strokeWidth="14" />
        <circle cx={c} cy={c} r={R} fill="none" stroke={racing ? '#34C759' : `url(#m-spec-${size})`} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={racing ? 0 : C * (1 - Math.min(1, Math.max(0, progress)))} transform={`rotate(-90 ${c} ${c})`} style={{ transition: animate ? 'stroke-dashoffset .1s linear' : undefined }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center', padding: '0 30px' }}>
        {children}
      </div>
    </div>
  );
};

/** Volume, a test tone and (on the race desk) the whistle, bell and horn. */
/** Whistle and Bell for the race officer at any time, as on the desktop StartBox (its sounds, same fallbacks). */
export const SignalButtons: React.FC<{ engine: StartBoxAudioEngine; onTap?: () => void }> = ({ engine, onTap }) => (
  <div className="m-signals" role="group" aria-label="Signals">
    <button className="m-signal" onClick={() => { onTap?.(); void playSystemSound(engine, SOUND.whistle, 1200, 300); }}><Icon name="whistle" size={19} />Whistle</button>
    <button className="m-signal" onClick={() => { onTap?.(); void playSystemSound(engine, SOUND.bell, 660, 500); }}><Icon name="bell" size={19} />Bell</button>
  </div>
);

export const SoundSheet: React.FC<{ engine: StartBoxAudioEngine; volume: number; onVolume: (v: number) => void; onClose: () => void; horns?: boolean }> = ({ engine, volume, onVolume, onClose, horns }) => {
  const [busy, setBusy] = useState(false);
  const play = async (id: string, hz: number, ms: number) => { setBusy(true); await playSystemSound(engine, id, hz, ms); setBusy(false); };
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Sound">
        <span className="m-grab" />
        <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 14 }}>Sound</div>
        <label className="m-row" style={{ gap: 12 }}>
          <span className="m-mut" style={{ width: 60 }}>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} style={{ flex: 1, accentColor: '#0A84FF' }}
            onChange={e => { const v = Number(e.target.value); onVolume(v); engine.setVolume(v); try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ignore */ } }} />
          <span className="m-num" style={{ width: 36, textAlign: 'right' }}>{Math.round(volume * 100)}</span>
        </label>
        {horns ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
            <button className="m-btn m-btn-g" disabled={busy} onClick={() => play(SOUND.startHorn, 440, 900)}>Horn</button>
            <button className="m-btn m-btn-g" disabled={busy} onClick={() => play(SOUND.whistle, 1200, 300)}>Whistle</button>
            <button className="m-btn m-btn-g" disabled={busy} onClick={() => play(SOUND.bell, 660, 500)}>Bell</button>
          </div>
        ) : (
          <button className="m-btn m-btn-g" style={{ width: '100%', marginTop: 16 }} onClick={async () => { await engine.initialize(); engine.playSynthBeep(1000, 200); }}>Test sound</button>
        )}
        <div className="m-dim" style={{ fontSize: 12.5, marginTop: 10 }}>Turn the ringer on: some phones mute app sounds in silent mode. A Bluetooth speaker or horn plays everything too.</div>
      </div>
    </>
  );
};
