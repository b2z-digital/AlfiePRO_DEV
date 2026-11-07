import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Video, X, ChevronRight, ChevronLeft, Pause, Play, Type } from 'lucide-react';
import { LivestreamControlPanel } from './LivestreamControlPanel';
import type { OnAirControls, OnAirSnapshot } from './onAirTypes';

/** A muted, inline video showing a live MediaStream (program picture or a camera). */
function StreamVideo({ stream, label }: { stream: MediaStream | null; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      if (stream) v.play().catch(() => {});
    }
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline aria-label={label} />;
}

function formatElapsed(fromIso: string | null, now: number): string {
  if (!fromIso) return '00:00';
  const total = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatClock(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

type View = 'closed' | 'console' | 'dock';

interface ScoringOnAirProps {
  clubId: string;
  eventId?: string;
  eventName?: string;
}

/**
 * Livestream controls inside the scoring screens (livestream design board:
 * "Scoring: on-air tab collapsed" and "Scoring: on-air dock expanded").
 *
 * - Off air: the Stream tab opens the full Livestream Console, as before.
 * - On air: a slim On-air tab sits on the right edge. Tap it to expand the dock
 *   (program, status, Hold, cameras, race recording), then collapse it to score.
 * - The console stays mounted the whole time, so collapsing never stops the
 *   broadcast. It is faded out rather than moved off screen, because browsers
 *   pause a muted video that leaves the screen, which would freeze the stream.
 */
export function ScoringOnAir({ clubId, eventId, eventName }: ScoringOnAirProps) {
  const [view, setView] = useState<View>('closed');
  const [mounted, setMounted] = useState(false);
  const [snap, setSnap] = useState<OnAirSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [dockTop, setDockTop] = useState(0);
  const [busy, setBusy] = useState(false);
  const controlsRef = useRef<OnAirControls | null>(null);
  const sentinelRef = useRef<HTMLSpanElement>(null);

  const onAir = !!snap && (snap.status === 'live' || snap.status === 'testing');
  const isLive = snap?.status === 'live';

  const open = (next: View) => {
    setMounted(true);
    setView(next);
  };

  // The dock only makes sense while on air
  useEffect(() => {
    if (!onAir && view === 'dock') setView('closed');
  }, [onAir, view]);

  // Clock for the elapsed time
  useEffect(() => {
    if (!onAir) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [onAir]);

  // Scoring makes room for the tab or dock
  useEffect(() => {
    document.body.classList.remove('alv-onair-dock', 'alv-onair-tab');
    if (view === 'dock') document.body.classList.add('alv-onair-dock');
    else if (view === 'closed' && onAir) document.body.classList.add('alv-onair-tab');
    return () => document.body.classList.remove('alv-onair-dock', 'alv-onair-tab');
  }, [view, onAir]);

  // The dock sits beside scoring, below the scoring bar
  useLayoutEffect(() => {
    if (view !== 'dock') return;
    const host = sentinelRef.current?.closest('.alv-onair-host') as HTMLElement | null;
    const update = () => setDockTop(host ? Math.max(0, Math.round(host.getBoundingClientRect().top)) : 0);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [view]);

  const run = async (fn?: () => Promise<void> | void) => {
    if (!fn || busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const elapsed = isLive ? formatElapsed(snap?.startedAt ?? null, now) : 'Preview';
  const modeLabel = !snap ? '' :
    snap.isPaused ? 'On hold' :
    snap.status === 'testing' ? 'Preview' :
    snap.recordingRace ? `Race ${snap.recordingRace}` : 'Live';

  const linkChip = (() => {
    if (!snap) return null;
    if (snap.status === 'testing') return { cls: 'is-warn', text: 'Preview only, not sending' };
    if (snap.isPaused) return { cls: 'is-warn', text: 'Holding, viewers see the hold screen' };
    if (snap.link === 'connected') return { cls: '', text: 'Stream healthy' };
    if (snap.link === 'connecting') return { cls: 'is-warn', text: 'Connecting' };
    if (snap.link === 'error') return { cls: 'is-bad', text: 'Stream stalled, reconnecting' };
    return { cls: 'is-bad', text: 'Not sending' };
  })();

  return (
    <>
      <span ref={sentinelRef} hidden />

      {/* Off air: the Stream tab, as before */}
      {view === 'closed' && !onAir && (
        <motion.button
          type="button"
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => open('console')}
          aria-label="Open livestream console"
          className="a-edge-tab alv-stream-tab fixed right-0 z-40"
        >
          <Video size={16} aria-hidden="true" />
          <span className="a-edge-tab-l" aria-hidden="true">STREAM</span>
        </motion.button>
      )}

      {/* On air, collapsed: the slim On-air tab */}
      {view === 'closed' && onAir && snap && (
        <button
          type="button"
          className={`alv alv-tab ${isLive ? '' : 'is-preview'}`}
          onClick={() => open('dock')}
          aria-label={`Expand on-air controls. ${isLive ? 'Live' : 'Preview'}${snap.isPaused ? ', on hold' : ''}.`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          <span className={`alv-live-badge ${isLive ? '' : 'is-preview'}`}>
            <span className="pulse" />{isLive ? (snap.isTest ? 'TEST' : 'LIVE') : 'PREV'}
          </span>
          <span className="thumb"><StreamVideo stream={snap.programStream} /></span>
          <span className="time alv-mono">{elapsed}</span>
          <span className="mode">{modeLabel}</span>
          <span className="foot">ON AIR</span>
        </button>
      )}

      {/* On air, expanded: the On-air dock */}
      {view === 'dock' && snap && (
        <aside className="alv alv-dock" style={{ top: dockTop }} aria-label="On-air controls">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="alv-disp" style={{ fontSize: 18, fontWeight: 700 }}>On air</span>
            <button type="button" className="alv-btn is-small" onClick={() => setView('closed')} aria-label="Collapse on-air controls">
              Collapse<ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className={`alv-program ${isLive ? '' : 'is-preview'}`} style={{ aspectRatio: '16 / 9', flexShrink: 0 }}>
            <StreamVideo stream={snap.programStream} label="Program picture" />
            {!snap.programStream && <div className="alv-program-empty">No picture yet</div>}
            <span className={`alv-live-badge ${isLive ? '' : 'is-preview'}`}>
              <span className="pulse" />{isLive ? (snap.isTest ? 'LIVE · TEST' : 'LIVE') : 'PREVIEW'}
            </span>
            <div style={{
              position: 'absolute', left: 8, right: 8, bottom: 8, height: 24, borderRadius: 6,
              background: 'rgba(6,11,22,0.78)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{snap.title || eventName || 'Broadcast'}</span>
              <span style={{ flex: 1 }} />
              <span className="alv-mono">{elapsed}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {linkChip && <span className={`alv-chip ${linkChip.cls}`}><span className="dot" />{linkChip.text}</span>}
            {isLive && <span className="alv-chip">{snap.viewerCount} watching</span>}
            {snap.isTest && <span className="alv-chip is-test">Test broadcast</span>}
            {snap.autoRecord && isLive && <span className="alv-chip is-mode">Auto · {snap.recordingRace ? `Race ${snap.recordingRace}` : 'waiting for a race'}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {snap.isPaused ? (
              <button type="button" className="alv-qa is-hold" disabled={busy || !isLive} onClick={() => run(controlsRef.current?.resume)}>
                <Play size={18} aria-hidden="true" />Resume
              </button>
            ) : (
              <button type="button" className="alv-qa is-hold" disabled={busy || !isLive} onClick={() => run(controlsRef.current?.hold)}
                title="Viewers see the hold screen until you resume">
                <Pause size={18} aria-hidden="true" />Hold
              </button>
            )}
            <button type="button" className="alv-qa" disabled={busy} onClick={() => controlsRef.current?.showTitle()}
              title="Show the event title card on the stream">
              <Type size={18} aria-hidden="true" />Title card
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="alv-eyebrow">Cameras · press to cut</span>
            {snap.cameras.length === 0 ? (
              <span className="alv-mute" style={{ fontSize: 13 }}>No cameras yet. Add one in the control room.</span>
            ) : (
              <div className="alv-cams">
                {snap.cameras.map((cam, i) => (
                  <button
                    key={cam.id}
                    type="button"
                    className={`alv-cam ${cam.isProgram ? 'is-program' : ''}`}
                    aria-pressed={cam.isProgram}
                    aria-label={`Camera ${i + 1}, ${cam.name}${cam.isProgram ? ', on program' : ''}`}
                    disabled={busy || cam.isProgram}
                    onClick={() => run(() => controlsRef.current?.cutTo(cam.id))}
                  >
                    <StreamVideo stream={cam.stream} />
                    <span className="num">{i + 1}</span>
                    <span className="name">{cam.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isLive && (
            <div className="alv-note">
              <span style={{ color: snap.recordingRace ? 'var(--alv-live-ink)' : 'var(--alv-dim)', fontWeight: 700 }} aria-hidden="true">●</span>
              <span style={{ flex: 1 }}>
                {!snap.autoRecord ? 'Race recording is off'
                  : snap.recordingRace ? `Recording race ${snap.recordingRace} since ${formatClock(snap.recordingSince)}`
                  : 'Recording starts when a race starts'}
              </span>
              {snap.uploading && <span style={{ color: '#8CC4FF', whiteSpace: 'nowrap' }}>Uploading</span>}
            </div>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button type="button" className="alv-btn" onClick={() => open('console')}>Open control room</button>
            <span className="alv-mute" style={{ fontSize: 12.5, lineHeight: 1.45, textAlign: 'center' }}>
              Collapse this any time. Collapsing it doesn't stop the broadcast.
            </span>
          </div>
        </aside>
      )}

      {/* The full Livestream Console: mounted on first open, then kept running */}
      {mounted && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={`fixed right-0 top-0 bottom-0 w-[75vw] max-w-[1200px] shadow-2xl z-[9995] flex flex-col bg-[#060B16] text-white transition-opacity duration-200 ${view === 'console' ? '' : 'alv-console-hidden'}`}
          aria-hidden={view !== 'console'}
          {...({ inert: view !== 'console' ? '' : undefined } as Record<string, unknown>)}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-rose-900/50 to-slate-900 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
                <Video size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Control room</h3>
                <p className="text-xs text-slate-400">{eventName || 'Live Broadcast'}</p>
              </div>
            </div>
            {onAir ? (
              <button
                type="button"
                onClick={() => setView('closed')}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold flex items-center gap-1.5 transition-colors"
                title="Collapse to the On-air tab. The broadcast keeps running."
              >
                Collapse<ChevronRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView('closed')}
                aria-label="Close livestream console"
                className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <LivestreamControlPanel
              clubId={clubId}
              autoCreateForEvent={eventId ? { eventId, eventName: eventName || 'Live Broadcast' } : undefined}
              onSnapshot={setSnap}
              controlsRef={controlsRef}
            />
          </div>
        </motion.div>
      )}
    </>
  );
}
