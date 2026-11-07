import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  BarChart3, Calendar, ChevronLeft, Copy, Eye, FlaskConical, Link2, Loader2, Maximize2, Minimize2,
  PanelRight, Plus, QrCode, Scissors, Send, Smartphone, Square, Trash2, Video, X, Zap,
} from 'lucide-react';
import type { LivestreamRaceSegment, LivestreamSession } from '../../types/livestream';
import type { OnAirControls, OnAirSnapshot } from './onAirTypes';
import {
  CAMERA_PRESET, ENDED_MESSAGE, HOLD_MESSAGE, NOTE_MESSAGE, PROGRAM_MESSAGE, RESULTS_MESSAGE, TITLE_MESSAGE,
  liveCloud, loadRealtimeKit, type RtkMeeting,
} from '../../utils/liveCloud';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { getRaceStatusEventId } from '../../utils/livestreamEventIds';
import { subscribeToRaceStatus } from '../../utils/liveTrackingStorage';
import { loadRaceCompanion } from '../../utils/liveRaceCompanion';
import { useNotification } from '../../contexts/NotificationContext';
import { LivestreamOverlayRenderer, type OverlayScoringSummary } from './LivestreamOverlayRenderer';
import { OverlaysManager } from './OverlaysManager';
import { SelectRaceHeatModal } from './SelectRaceHeatModal';
import { ScheduleStreamModal } from './ScheduleStreamModal';
import { StreamAnalyticsModal } from './StreamAnalyticsModal';
import { TestBroadcastLinkModal } from './TestBroadcastLinkModal';

/**
 * Control room for a cloud broadcast (livestream board "Control room"), the cloud twin
 * of the device studio. Phones and iPads join a RealtimeKit room from the camera link;
 * this room watches them, picks the program camera, and drives the cloud program page
 * (which Cloudflare records and streams to AlfieTV). Each race records as its own video
 * from scoring, and goes to YouTube once it's saved.
 */

type CloudCam = { id: string; name: string; videoEnabled: boolean };
type SessionWithVenue = LivestreamSession & { venueName?: string; venueImage?: string };

const AUTO_DIRECTOR_MS = 45000;
/** The club's time zone (this browser's), so the cloud program's clock matches the venue */
const TIME_ZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney'; } catch { return 'Australia/Sydney'; } })();
const HEARTBEAT_MS = 5000;

interface Props {
  session: SessionWithVenue;
  clubId: string;
  onBack: () => void;
  onSessionChange: (session: LivestreamSession) => void;
  onDelete: () => void;
  onSnapshot?: (snapshot: OnAirSnapshot) => void;
  controlsRef?: React.MutableRefObject<OnAirControls | null>;
}

/** A camera in the room: its live picture, registered with RealtimeKit */
function CamVideo({ meeting, participantId, audio = false }: { meeting: RtkMeeting; participantId: string; audio?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const p = meeting.participants.joined.get(participantId);
    const el = ref.current;
    if (!p || !el) return;
    meeting.participants.subscribe([participantId], audio ? ['video', 'audio'] : ['video']).catch(() => {});
    p.registerVideoElement(el);
    return () => { try { p.deregisterVideoElement(el); } catch { /* left */ } };
  }, [meeting, participantId, audio]);
  return <video ref={ref} autoPlay playsInline muted={!audio} />;
}

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CloudControlRoom({ session, clubId, onBack, onSessionChange, onDelete, onSnapshot, controlsRef }: Props) {
  const { addNotification } = useNotification();
  const [meeting, setMeeting] = useState<RtkMeeting | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [cams, setCams] = useState<CloudCam[]>([]);
  const [programId, setProgramId] = useState<string | null>(session.program_participant_id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inputState, setInputState] = useState<string>('');
  const [raceVideos, setRaceVideos] = useState<LivestreamRaceSegment[]>([]);
  const [scoring, setScoring] = useState<OverlayScoringSummary | null>(null);
  const [titleCardTrigger, setTitleCardTrigger] = useState(0);
  const [resultsTrigger, setResultsTrigger] = useState(0);
  const [autoDirector, setAutoDirector] = useState(false);
  const [nextCutAt, setNextCutAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sideTab, setSideTab] = useState<'overlays' | 'output' | 'settings'>('overlays');
  const [roomWidth, setRoomWidth] = useState(0);
  const [showSide, setShowSide] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraUrl, setCameraUrl] = useState<string | null>(null);
  const [showCameraLink, setShowCameraLink] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteTo, setNoteTo] = useState('all');
  const [showSelectRace, setShowSelectRace] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTestLink, setShowTestLink] = useState(false);
  const [manualRace, setManualRace] = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const fullscreenApiRef = useRef(false);
  const raceBusyRef = useRef(false);
  const processAttemptsRef = useRef<Record<string, { at: number; count: number }>>({});
  const streamsRef = useRef<Record<string, { trackId: string; stream: MediaStream }>>({});

  const isLive = session.status === 'live';
  const isEnded = session.status === 'ended';
  const racesOnly = session.broadcast_mode === 'races_only';
  const isPaused = !!session.is_paused;
  const isTest = session.is_public === false;
  const overlaysOn = session.enable_overlays !== false;

  // ── Join the room as the control room ──
  useEffect(() => {
    if (isEnded) return;
    let cancelled = false;
    let joined: RtkMeeting | null = null;
    (async () => {
      try {
        const { token } = await liveCloud<{ token: string }>('director_token', { sessionId: session.id });
        const RealtimeKitClient = await loadRealtimeKit();
        const m = await RealtimeKitClient.init({ authToken: token, defaults: { audio: false, video: false } });
        await m.join();
        if (cancelled) { m.leave().catch(() => {}); return; }
        joined = m;
        setMeeting(m);
      } catch (e) {
        setJoinError(e instanceof Error ? e.message : 'Could not open the control room');
      }
    })();
    return () => { cancelled = true; joined?.leave().catch(() => {}); };
  }, [session.id, isEnded]);

  // Cameras in the room
  useEffect(() => {
    if (!meeting) return;
    const refresh = () => {
      const list: CloudCam[] = [];
      meeting.participants.joined.forEach((p) => {
        if (p.presetName === CAMERA_PRESET || !p.presetName) list.push({ id: p.id, name: p.name, videoEnabled: p.videoEnabled });
      });
      setCams(list);
    };
    refresh();
    const joined = meeting.participants.joined;
    const events = ['participantJoined', 'participantLeft', 'videoUpdate'] as const;
    events.forEach((ev) => joined.on(ev as any, refresh as any));
    return () => { events.forEach((ev) => joined.off(ev as any, refresh as any)); };
  }, [meeting]);

  const airCams = cams.filter(c => c.videoEnabled);
  const programIndex = airCams.findIndex(c => c.id === programId);
  const nextCam = airCams.length === 0 || (airCams.length === 1 && programIndex === 0)
    ? null
    : airCams[(programIndex + 1) % airCams.length];
  const programCam = cams.find(c => c.id === programId) || null;

  // Tell cameras and the program page who's on program and who's next (repeated for late joiners)
  const sendProgram = useCallback((pid: string | null, nid: string | null) => {
    if (!meeting || !pid) return;
    meeting.participants.broadcastMessage(PROGRAM_MESSAGE, nid ? { participantId: pid, nextId: nid } : { participantId: pid }).catch(() => {});
  }, [meeting]);
  useEffect(() => {
    if (!meeting || !programId || isEnded) return;
    sendProgram(programId, nextCam?.id ?? null);
    const t = setInterval(() => sendProgram(programId, nextCam?.id ?? null), HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [meeting, programId, nextCam?.id, isEnded, sendProgram]);

  // First camera with a picture goes on program if none is chosen
  useEffect(() => {
    if (!programId && airCams[0] && meeting) cut(airCams[0].id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, airCams[0]?.id, meeting]);

  const cut = async (participantId: string, quiet = false) => {
    setProgramId(participantId);
    sendProgram(participantId, null);
    try {
      await liveCloud('set_program', { sessionId: session.id, participantId });
      if (!quiet) addNotification('success', `${cams.find(c => c.id === participantId)?.name || 'Camera'} on program`, 1500);
    } catch (e) {
      addNotification('error', e instanceof Error ? e.message : 'Could not change camera', 5000);
    }
  };
  const cutRef = useRef(cut);
  cutRef.current = cut;

  // ── Broadcast actions ──
  const act = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    try {
      return await fn();
    } catch (e) {
      addNotification('error', `${label}: ${e instanceof Error ? e.message : 'failed'}`, 7000);
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const goLive = async () => {
    const ok = await act('Go live', () => liveCloud('program_start', { sessionId: session.id, timeZone: TIME_ZONE }));
    if (ok !== undefined) {
      onSessionChange({ ...session, status: racesOnly ? session.status : 'live', actual_start_time: session.actual_start_time || new Date().toISOString() });
      addNotification('success', racesOnly ? 'Recording races' : 'You\'re live in AlfieTV', 3000);
    }
  };

  const setHold = async (paused: boolean) => {
    meeting?.participants.broadcastMessage(HOLD_MESSAGE, { paused }).catch(() => {});
    const ok = await act(paused ? 'Hold' : 'Resume', () => liveCloud('program_hold', { sessionId: session.id, paused }));
    if (ok !== undefined) onSessionChange({ ...session, is_paused: paused });
  };

  const endBroadcast = async () => {
    if (!confirm('End the broadcast? It stops for everyone watching, and the cameras stop.')) return;
    const ok = await act('End broadcast', () => liveCloud('program_stop', { sessionId: session.id, end: true }));
    if (ok === undefined) return;
    meeting?.participants.broadcastMessage(ENDED_MESSAGE, { sessionId: session.id }).catch(() => {});
    setTimeout(() => { meeting?.leave().catch(() => {}); setMeeting(null); setCams([]); }, 1500);
    onSessionChange({ ...session, status: 'ended', end_time: new Date().toISOString(), is_paused: false });
    addNotification('success', 'Broadcast ended. Race videos keep uploading to YouTube.', 5000);
  };

  const showTitle = () => {
    setTitleCardTrigger(n => n + 1);
    meeting?.participants.broadcastMessage(TITLE_MESSAGE, {}).catch(() => {});
  };
  const showResults = () => {
    setResultsTrigger(n => n + 1);
    meeting?.participants.broadcastMessage(RESULTS_MESSAGE, {}).catch(() => {});
  };

  const toggleTest = async () => {
    const makeTest = !isTest;
    try {
      const updated = await livestreamStorage.updateSession(session.id, { is_public: !makeTest });
      onSessionChange({ ...session, ...updated, is_public: !makeTest });
    } catch {
      addNotification('error', 'Could not change test mode', 5000);
    }
  };

  // ── Race videos ──
  const loadRaceVideos = useCallback(async () => {
    try { setRaceVideos(await livestreamStorage.getSegments(session.id)); } catch { /* keep the last list */ }
  }, [session.id]);
  useEffect(() => {
    loadRaceVideos();
    const t = setInterval(loadRaceVideos, 15000);
    return () => clearInterval(t);
  }, [loadRaceVideos]);

  const openRace = raceVideos.find(v => v.rtk_recording_id && !v.segment_end_time) || null;

  // Ask the race-video function to upload a race (once at a time per race)
  const processSoon = (segmentId: string, delayMs: number) => {
    processAttemptsRef.current[segmentId] = { at: Date.now() + delayMs, count: (processAttemptsRef.current[segmentId]?.count || 0) + 1 };
    setTimeout(() => {
      livestreamStorage.triggerSegmentProcessing(segmentId).catch(() => {}).finally(() => loadRaceVideos());
    }, delayMs);
  };

  const startRace = async (raceNumber: number, trigger: 'race_scored' | 'manual') => {
    if (raceBusyRef.current) return;
    raceBusyRef.current = true;
    try {
      const res = await liveCloud<{ segment?: LivestreamRaceSegment; alreadyRecording?: boolean }>('race_start', {
        sessionId: session.id, raceNumber, heatNumber: session.heat_number || undefined, trigger, timeZone: TIME_ZONE,
      });
      if (!res.alreadyRecording) addNotification('success', `Recording race ${raceNumber}`, 3000);
      await loadRaceVideos();
    } catch (e) {
      addNotification('error', `Race ${raceNumber} didn't start recording: ${e instanceof Error ? e.message : 'failed'}`, 7000);
    } finally {
      raceBusyRef.current = false;
    }
  };

  const stopRace = async () => {
    if (raceBusyRef.current) return;
    raceBusyRef.current = true;
    try {
      const res = await liveCloud<{ segmentId?: string }>('race_stop', { sessionId: session.id });
      if (res.segmentId) {
        addNotification('info', 'Race recording saved. It goes to YouTube in a few minutes.', 4000);
        processSoon(res.segmentId, 25000);
      }
      await loadRaceVideos();
    } catch (e) {
      addNotification('error', `Race recording didn't stop: ${e instanceof Error ? e.message : 'failed'}`, 7000);
    } finally {
      raceBusyRef.current = false;
    }
  };

  // Races that have ended but aren't on YouTube yet: ask again every 90 s (the recording may
  // still be saving); give up after 15 tries and leave it for the next visit
  useEffect(() => {
    raceVideos.forEach(v => {
      if (!v.rtk_recording_id || !v.segment_end_time || v.upload_status !== 'pending') return;
      const attempt = processAttemptsRef.current[v.id];
      if (attempt && (Date.now() - attempt.at < 90000 || attempt.count >= 15)) return;
      processSoon(v.id, 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceVideos]);

  // ── Scoring runs the race recordings ──
  // A race starts recording when scoring sets the race live (a fresh status since the last
  // race video ended) and stops when it's scored, put on hold or racing is done for the day.
  const armed = !!session.event_id && !isEnded && (isLive || racesOnly);
  const reconcileRef = useRef<() => Promise<void>>(async () => {});
  reconcileRef.current = async () => {
    if (!armed || !session.event_id || raceBusyRef.current) return;
    const c = await loadRaceCompanion(session.event_id).catch(() => null);
    if (!c) return;
    const list = await livestreamStorage.getSegments(session.id).catch(() => raceVideos);
    const open = list.find(v => v.rtk_recording_id && !v.segment_end_time);
    const racing = c.status === 'live' || c.status === 'in_progress';
    if (open) {
      if (!racing || c.racesDone >= open.race_number) await stopRace();
      return;
    }
    if (!racing) return;
    const lastEnded = list.filter(v => v.segment_end_time).map(v => new Date(v.segment_end_time as string).getTime()).sort((a, b) => b - a)[0] || 0;
    const statusAt = c.statusUpdatedAt ? new Date(c.statusUpdatedAt).getTime() : 0;
    const alreadyHasRace = list.some(v => v.race_number === c.race && (v.heat_number || null) === (session.heat_number || null));
    if (!alreadyHasRace && (!lastEnded || statusAt > lastEnded)) await startRace(c.race, 'race_scored');
  };
  useEffect(() => {
    if (!armed || !session.event_id) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    getRaceStatusEventId(session.event_id).then(statusId => {
      if (cancelled) return;
      unsubscribe = subscribeToRaceStatus(statusId, () => { reconcileRef.current(); });
    });
    reconcileRef.current();
    const t = setInterval(() => reconcileRef.current(), 10000);
    return () => { cancelled = true; unsubscribe?.(); clearInterval(t); };
  }, [armed, session.event_id, session.id]);

  // ── Stream health (Cloudflare input) ──
  useEffect(() => {
    if (!isLive || racesOnly) { setInputState(''); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await liveCloud<{ liveInput?: { status?: { current?: { state?: string } } | string } }>('status', { sessionId: session.id });
        const raw = st.liveInput?.status as any;
        if (!cancelled) setInputState(typeof raw === 'string' ? raw : (raw?.current?.state || ''));
      } catch { /* keep the last */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isLive, racesOnly, session.id]);

  // Clock for the LIVE time and the auto director countdown
  useEffect(() => {
    if (!isLive && !autoDirector) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLive, autoDirector]);

  // ── Auto director: while racing, the next camera every 45 seconds (off by default) ──
  const racingNow = !session.event_id || !scoring || scoring.status === 'live' || scoring.status === 'in_progress';
  const autoOn = autoDirector && isLive && !isPaused && racingNow && !!nextCam;
  const nextCamRef = useRef(nextCam);
  nextCamRef.current = nextCam;
  useEffect(() => {
    if (!autoOn) { setNextCutAt(null); return; }
    let due = Date.now() + AUTO_DIRECTOR_MS;
    setNextCutAt(due);
    const t = setInterval(() => {
      if (Date.now() < due) return;
      due = Date.now() + AUTO_DIRECTOR_MS;
      setNextCutAt(due);
      if (nextCamRef.current) cutRef.current(nextCamRef.current.id, true);
    }, 1000);
    return () => clearInterval(t);
  }, [autoOn, programId]);

  // Number keys 1-9 cut to that camera, only while this room is on screen and nothing is being typed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !/^[1-9]$/.test(e.key)) return;
      const root = rootRef.current;
      if (!root || root.closest('[inert]') || root.closest('.alv-console-hidden')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target && target !== document.body && !root.contains(target)) return;
      const cam = cams[Number(e.key) - 1];
      if (!cam || cam.id === programId || !cam.videoEnabled) return;
      e.preventDefault();
      cutRef.current(cam.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cams, programId]);

  // Width, for the settings drawer below 1200px
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setRoomWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const drawerMode = roomWidth > 0 && roomWidth <= 1200;
  const sideOpen = drawerMode ? drawerOpen : showSide;

  // Full screen program
  useEffect(() => {
    const onChange = () => {
      if (fullscreenApiRef.current && !document.fullscreenElement) { fullscreenApiRef.current = false; setIsFullscreen(false); }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = async () => {
    if (isFullscreen) {
      if (fullscreenApiRef.current && document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      fullscreenApiRef.current = false;
      setIsFullscreen(false);
      return;
    }
    const el = stageRef.current;
    try { if (el?.requestFullscreen) { await el.requestFullscreen(); fullscreenApiRef.current = true; } } catch { fullscreenApiRef.current = false; }
    setIsFullscreen(true);
  };

  // ── Camera link ──
  const showLink = async () => {
    setShowCameraLink(true);
    if (cameraUrl) return;
    const res = await act('Camera link', () => liveCloud<{ cameraLink: { url: string } }>('camera_link', { sessionId: session.id }));
    if (res?.cameraLink?.url) setCameraUrl(res.cameraLink.url);
  };
  useEffect(() => {
    if (!showCameraLink) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCameraLink(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCameraLink]);
  useEffect(() => {
    if (!showCameraLink || !cameraUrl || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, cameraUrl, { width: 220, margin: 1 }).catch(() => {});
  }, [showCameraLink, cameraUrl]);

  const sendNote = async () => {
    const text = noteText.trim();
    if (!meeting || !text) return;
    await meeting.participants.broadcastMessage(NOTE_MESSAGE, { to: noteTo, text }).catch(() => {});
    addNotification('success', `Note sent to ${noteTo === 'all' ? 'all cameras' : cams.find(c => c.id === noteTo)?.name || 'the camera'}`, 2000);
    setNoteText('');
  };

  // ── Scoring dock: snapshot and controls ──
  const streamFor = useCallback((participantId: string): MediaStream | null => {
    const p = meeting?.participants.joined.get(participantId) as unknown as { videoTrack?: MediaStreamTrack } | undefined;
    const track = p?.videoTrack;
    if (!track) return null;
    const cached = streamsRef.current[participantId];
    if (cached && cached.trackId === track.id) return cached.stream;
    const stream = new MediaStream([track]);
    streamsRef.current[participantId] = { trackId: track.id, stream };
    return stream;
  }, [meeting]);

  if (controlsRef) {
    controlsRef.current = {
      hold: () => setHold(true),
      resume: () => setHold(false),
      cutTo: (id: string) => cut(id),
      showTitle,
    };
  }
  useEffect(() => {
    if (!onSnapshot) return;
    onSnapshot({
      sessionId: session.id,
      title: session.title,
      status: isLive ? 'live' : 'offline',
      isPaused,
      isTest,
      startedAt: session.actual_start_time ?? null,
      viewerCount: 0,
      link: !isLive ? 'disconnected' : inputState === 'connected' ? 'connected' : inputState ? 'error' : 'connecting',
      programStream: programId ? streamFor(programId) : null,
      cameras: cams.map(c => ({
        id: c.id, name: c.name, type: 'mobile', status: c.videoEnabled ? 'connected' : 'connecting',
        isProgram: c.id === programId, stream: c.videoEnabled ? streamFor(c.id) : null,
      })),
      autoRecord: !!session.event_id,
      recordingRace: openRace?.race_number ?? null,
      recordingSince: openRace?.segment_start_time ?? null,
      uploading: raceVideos.some(v => v.upload_status === 'uploading'),
    });
  }, [onSnapshot, session.id, session.title, isLive, isPaused, isTest, session.actual_start_time, inputState,
      programId, cams, openRace?.id, raceVideos, streamFor]);

  // ── View ──
  const elapsed = isLive && session.actual_start_time ? Math.max(0, Math.floor((now - new Date(session.actual_start_time).getTime()) / 1000)) : 0;
  const cutIn = nextCutAt ? Math.max(0, Math.ceil((nextCutAt - now) / 1000)) : null;
  const nextIndex = nextCam ? cams.findIndex(c => c.id === nextCam.id) + 1 : 0;
  const subtitle = [session.venueName, cams.length ? `${cams.length} ${cams.length === 1 ? 'camera' : 'cameras'} · cloud` : 'Cloud', isTest ? 'Test broadcast' : null, racesOnly ? 'Race videos only' : null].filter(Boolean).join(' · ');
  const health = !isLive || racesOnly ? null
    : isPaused ? { tone: 'is-warn', text: 'On hold' }
    : inputState === 'connected' ? { tone: '', text: 'Stream healthy' }
    : inputState ? { tone: 'is-bad', text: 'Stream not reaching AlfieTV' }
    : { tone: 'is-warn', text: 'Starting the stream' };
  const playlistId = raceVideos.find(v => v.youtube_playlist_id)?.youtube_playlist_id;

  return (
    <div ref={rootRef} className="alv alv-crq">
      <div className="alv-cr">
        <header className="alv-cr-top">
          <button type="button" className="alv-cr-back" onClick={onBack} aria-label="Back to broadcasts" title="Back to broadcasts">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="alv-cr-title">
            <h2 className="alv-disp" title={session.title}>{session.title}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="alv-cr-state">
            {isLive ? (
              <span className="alv-cr-onair"><span className="pulse" aria-hidden="true" />{isTest ? 'LIVE · TEST' : 'LIVE'}<span className="alv-mono">{formatDuration(elapsed)}</span></span>
            ) : (
              <span className="alv-cr-onair is-idle">{isEnded ? 'ENDED' : racesOnly ? 'RACES ONLY' : 'STANDBY'}</span>
            )}
            {health && <span className={`alv-cr-chip ${health.tone}`}><span className="dot" />{health.text}</span>}
            {session.event_id && scoring && (
              <span className="alv-cr-chip is-scoring">Scoring: {scoring.race}{scoring.label ? ` · ${scoring.label.toLowerCase()}` : ''}</span>
            )}
          </div>

          <div className="alv-cr-actions">
            {!isEnded && (
              <button type="button" onClick={toggleTest} aria-pressed={isTest} className={`alv-btn is-small ${isTest ? 'is-test' : ''}`}
                title={isTest ? 'Test mode: hidden from AlfieTV and events, race videos unlisted. Click to make it public.' : 'Run as a test: hidden from AlfieTV and events.'}>
                <FlaskConical className="w-4 h-4" aria-hidden="true" />
                {isTest ? 'Test on' : 'Test'}
              </button>
            )}
            {!isEnded && isTest && (
              <button type="button" onClick={() => setShowTestLink(true)} className="alv-btn is-small">
                <Eye className="w-4 h-4" aria-hidden="true" />
                Watch
              </button>
            )}
            {isLive && (
              <span className="alv-cr-auto" title={airCams.length < 2 ? 'Needs two cameras with a picture' : 'While racing, cut to the next camera every 45 seconds'}>
                <span id="alv-cloud-auto">Auto<br />director</span>
                <button type="button" role="switch" aria-checked={autoDirector} aria-labelledby="alv-cloud-auto" className="alv-sw"
                  disabled={airCams.length < 2 && !autoDirector} onClick={() => setAutoDirector(v => !v)} />
              </span>
            )}
            {!isLive && !isEnded && !racesOnly && (
              <button type="button" onClick={goLive} disabled={!!busy || !meeting} className="alv-btn is-small alv-btn-live"
                title={airCams.length ? 'Start streaming the program to AlfieTV' : 'Add a camera first'}>
                {busy === 'Go live' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" aria-hidden="true" />}
                Go live
              </button>
            )}
            {(isLive || (racesOnly && !isEnded)) && (
              <button type="button" onClick={endBroadcast} disabled={!!busy} className="alv-btn is-small alv-btn-end">
                <Square className="w-3.5 h-3.5" aria-hidden="true" />
                End broadcast
              </button>
            )}
            {!isLive && (
              <button type="button" className="alv-ib" onClick={onDelete} aria-label="Delete broadcast" title="Delete broadcast">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button type="button" className="alv-ib" onClick={() => setShowAnalytics(true)} aria-label="Analytics" title="Analytics">
              <BarChart3 className="w-4 h-4" />
            </button>
            <button type="button" className={`alv-ib ${sideOpen ? 'is-on' : ''}`} onClick={() => (drawerMode ? setDrawerOpen(v => !v) : setShowSide(v => !v))}
              aria-pressed={sideOpen} aria-label="Overlays, output and details panel" title="Overlays, output and details">
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className={`alv-cr-body ${sideOpen ? '' : 'no-side'}`}>
          {/* ── Cameras ── */}
          <aside className="alv-cr-panel alv-cr-cams" aria-label="Cameras">
            <div className="alv-cr-head">
              <span className="alv-eyebrow">Cameras · {cams.length}</span>
              {!isEnded && (
                <button type="button" className="alv-btn is-xs" onClick={showLink} aria-label="Add a camera" title="Camera link and QR code for phones and iPads">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="lbl">Add</span>
                </button>
              )}
            </div>
            <div className="alv-cr-camlist">
              {meeting && cams.map((cam, index) => {
                const isProgram = cam.id === programId;
                const isNext = !isProgram && nextCam?.id === cam.id;
                return (
                  <div key={cam.id} className={`alv-cr-cam ${isProgram ? 'is-program' : ''} ${isNext ? 'is-next' : ''} ${cam.videoEnabled ? '' : 'is-off'}`}>
                    <button type="button" className="th" onClick={() => cam.videoEnabled && !isProgram && cut(cam.id)} disabled={!cam.videoEnabled || isProgram}
                      aria-label={isProgram ? `${cam.name} is on program` : cam.videoEnabled ? `Cut to ${cam.name}` : `${cam.name} has no picture yet`}>
                      {cam.videoEnabled ? <CamVideo meeting={meeting} participantId={cam.id} /> : <span className="empty"><Smartphone className="w-6 h-6" /></span>}
                      <span className="n">{index + 1}</span>
                      {isProgram ? <span className="alv-tally is-pgm">{isLive ? 'PROGRAM' : 'ON'}</span>
                        : isNext ? <span className="alv-tally is-next">NEXT</span>
                        : !cam.videoEnabled ? <span className="alv-tally is-off">NO PICTURE</span> : null}
                    </button>
                    <div className="meta">
                      <span className="name" title={cam.name}>{cam.name}</span>
                      <span className="alv-bars" role="img" aria-label={cam.videoEnabled ? 'Picture coming in' : 'No picture'}>
                        {[0, 1, 2, 3].map(b => <i key={b} className={cam.videoEnabled ? 'on' : ''} style={{ height: 4 + b * 2.7 }} />)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!isEnded && meeting && cams.length === 0 && (
                <div className="alv-cr-empty">No cameras yet. Tap <b>Add</b> and scan the QR code with a phone or iPad. No login needed.</div>
              )}
              {!meeting && !isEnded && (
                <div className="alv-cr-empty">{joinError || 'Opening the control room…'}</div>
              )}
              {isEnded && <div className="alv-cr-empty">This broadcast has ended.</div>}
            </div>
            {meeting && cams.length > 0 && !isEnded && (
              <form className="alv-cr-note" onSubmit={(e) => { e.preventDefault(); sendNote(); }}>
                <span className="alv-eyebrow">Note to cameras</span>
                <select value={noteTo} onChange={(e) => setNoteTo(e.target.value)} aria-label="Send the note to" className="alv-input">
                  <option value="all">All cameras</option>
                  {cams.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="row">
                  <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Follow 51 at the mark" maxLength={160} aria-label="Note" className="alv-input" />
                  <button type="submit" className="alv-ib" disabled={!noteText.trim()} aria-label="Send note" title="Send note"><Send className="w-4 h-4" /></button>
                </div>
              </form>
            )}
          </aside>

          {/* ── Program, scenes, next shot, race videos ── */}
          <div className="alv-cr-center">
            <div ref={stageRef} className={`alv-cr-stage ${isFullscreen && !fullscreenApiRef.current ? 'is-full' : ''}`}>
              <div className={`alv-cr-pgm ${isLive ? 'is-live' : ''}`}>
                {programCam && meeting && !isEnded && (
                  <span className="alv-cr-pgm-tag">{isLive ? 'PROGRAM' : 'PREVIEW'}<span className="cam">{programCam.name}</span></span>
                )}
                {meeting && programCam?.videoEnabled && !isEnded && <CamVideo meeting={meeting} participantId={programCam.id} />}
                {overlaysOn && !isEnded && (
                  <LivestreamOverlayRenderer
                    session={session}
                    titleCardTrigger={titleCardTrigger}
                    resultsTrigger={resultsTrigger}
                    onScoring={setScoring}
                    venueImage={session.venueImage}
                    venueName={session.venueName}
                  />
                )}
                {isPaused && isLive && (
                  <div className="alv-cr-card">
                    {session.venueImage && <img src={session.venueImage} alt="" />}
                    <div>
                      <span className="chip">ON HOLD</span>
                      <h3>Racing will resume shortly</h3>
                      <p>Viewers see the hold screen. Press Racing to go back on air.</p>
                    </div>
                  </div>
                )}
                {isEnded && (
                  <div className="alv-cr-card">
                    <div>
                      <span className="ic"><Square className="w-6 h-6" /></span>
                      <h3>Broadcast ended</h3>
                      <p>Race videos are below once they're on YouTube.</p>
                    </div>
                  </div>
                )}
                {!isEnded && (!programCam || !programCam.videoEnabled) && (
                  <div className="alv-cr-card">
                    <div>
                      <span className="ic"><Video className="w-6 h-6" /></span>
                      <h3>No picture yet</h3>
                      <p>Add a phone or iPad as a camera. Its picture shows here, and goes out when you go live.</p>
                      {meeting && <button type="button" className="alv-btn is-small" onClick={showLink}><QrCode className="w-4 h-4" aria-hidden="true" />Camera link</button>}
                    </div>
                  </div>
                )}
                <button type="button" className="alv-cr-full" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {!isEnded && (
              <div className="alv-cr-scenes" role="group" aria-label="Scenes">
                <button type="button" className="alv-scene" onClick={showTitle} disabled={!overlaysOn || !meeting}>Title card<small>8 seconds</small></button>
                <button type="button" className={`alv-scene ${isLive && !isPaused ? 'is-on' : ''}`} aria-pressed={isLive && !isPaused}
                  onClick={() => isPaused && setHold(false)} disabled={!isLive}>
                  Racing<small>{autoOn ? 'Auto director' : session.event_id ? 'Scoring linked' : 'On air'}</small>
                </button>
                <button type="button" className="alv-scene" onClick={showResults}
                  disabled={!overlaysOn || !scoring?.hasResults || session.overlay_config?.showStandings === false}>
                  Results<small>{scoring?.hasResults ? '20 seconds' : 'After a race'}</small>
                </button>
                <button type="button" className={`alv-scene is-hold ${isPaused ? 'is-on' : ''}`} aria-pressed={isPaused}
                  onClick={() => setHold(!isPaused)} disabled={!isLive || !!busy}>
                  Hold<small>{isPaused ? 'On · tap to resume' : 'Hold screen'}</small>
                </button>
              </div>
            )}

            {!isEnded && nextCam && meeting && (
              <div className="alv-cr-panel alv-cr-next">
                <div className="th">
                  <CamVideo meeting={meeting} participantId={nextCam.id} />
                  <span className="alv-tally is-next">NEXT</span>
                </div>
                <div className="txt">
                  <b>{nextCam.name} is next</b>
                  <span>{autoOn && cutIn !== null ? `Auto director cuts in ${cutIn} s. ` : ''}Press {nextIndex} or Cut. Tap any camera to cut to it.</span>
                </div>
                <button type="button" className="alv-btn alv-btn-live" onClick={() => cut(nextCam.id)}>
                  <Scissors className="w-4 h-4" aria-hidden="true" />
                  Cut
                </button>
              </div>
            )}

            <div className="alv-cr-panel alv-cr-videos">
              <div className="alv-cr-head">
                <span className="alv-eyebrow">Race videos · {isTest ? 'Unlisted on YouTube (test)' : 'Alfie YouTube playlist'}</span>
                <div className="flex items-center gap-2">
                  {!isEnded && (openRace ? (
                    <button type="button" className="alv-btn is-xs" onClick={stopRace}>Stop race {openRace.race_number}</button>
                  ) : (
                    <span className="flex items-center gap-1">
                      <label className="sr-only" htmlFor="alv-cloud-race">Race number</label>
                      <input id="alv-cloud-race" type="number" min={1} value={manualRace} onChange={(e) => setManualRace(Math.max(1, Number(e.target.value) || 1))}
                        className="alv-input" style={{ width: 56, height: 30, padding: '0 8px' }} />
                      <button type="button" className="alv-btn is-xs" onClick={() => startRace(manualRace, 'manual')} disabled={!meeting}>Record race</button>
                    </span>
                  ))}
                  {playlistId && !isTest && (
                    <a className="alv-btn is-xs" href={`https://www.youtube.com/playlist?list=${playlistId}`} target="_blank" rel="noopener noreferrer">Open playlist</a>
                  )}
                </div>
              </div>
              {raceVideos.length > 0 ? (
                <div className="alv-cr-vlist">
                  {raceVideos.map(v => <CloudRaceChip key={v.id} video={v} />)}
                </div>
              ) : (
                <p className="alv-cr-hint">
                  {session.event_id
                    ? 'Each race records as its own video when scoring starts it, and goes to YouTube once it\'s scored.'
                    : <>Link a race so scoring records each one as its own video, or use Record race. <button type="button" className="alv-link" onClick={() => setShowSelectRace(true)}>Link a race</button></>}
                </p>
              )}
            </div>
          </div>

          {/* ── Overlays · Output · Details ── */}
          {sideOpen && (
            <aside className="alv-cr-panel alv-cr-side" aria-label="Broadcast settings">
              <div className="alv-cr-sidehead">
                <div className="alv-tabs" role="tablist" aria-label="Broadcast settings">
                  {(['overlays', 'output', 'settings'] as const).map(tab => (
                    <button key={tab} type="button" role="tab" aria-selected={sideTab === tab} onClick={() => setSideTab(tab)}>
                      {tab === 'overlays' ? 'Overlays' : tab === 'output' ? 'Output' : 'Details'}
                    </button>
                  ))}
                </div>
                {drawerMode && (
                  <button type="button" className="alv-ib" onClick={() => setDrawerOpen(false)} aria-label="Close panel"><X className="w-4 h-4" /></button>
                )}
              </div>
              <div className="alv-cr-sidebody" role="tabpanel">
                {sideTab === 'overlays' && (
                  <OverlaysManager session={session} onUpdate={(updates) => {
                    onSessionChange({ ...session, ...updates });
                    livestreamStorage.updateSession(session.id, updates);
                  }} />
                )}
                {sideTab === 'output' && (
                  <div className="alv-cr-form">
                    <div className="alv-tg"><div><b>Engine</b><span>Cloud: cameras join from a link, Cloudflare records the program and streams it to AlfieTV.</span></div></div>
                    <div className="alv-tg"><div><b>Live in AlfieTV</b><span>{racesOnly ? 'Off: this broadcast only records each race for YouTube.' : isLive ? `On${inputState ? ` · stream ${inputState}` : ''}` : 'Starts when you go live.'}</span></div></div>
                    <div className="alv-tg"><div><b>Race videos</b><span>One YouTube video per race{isTest ? ', unlisted while testing' : ', in the event\'s playlist'}.</span></div></div>
                    <button type="button" className="alv-btn is-small" onClick={showLink} disabled={isEnded}><QrCode className="w-4 h-4" aria-hidden="true" />Camera link and QR code</button>
                  </div>
                )}
                {sideTab === 'settings' && (
                  <div className="alv-cr-form">
                    <label className="alv-field">
                      <span>Title</span>
                      <input type="text" className="alv-input" value={session.title}
                        onChange={(e) => { onSessionChange({ ...session, title: e.target.value }); livestreamStorage.updateSession(session.id, { title: e.target.value }); }} />
                    </label>
                    <button type="button" onClick={() => setShowSelectRace(true)} className="alv-btn is-small">
                      <Link2 className="w-4 h-4" aria-hidden="true" />
                      {session.event_id ? 'Change linked race or heat' : 'Link race or heat'}
                    </button>
                    <button type="button" onClick={() => setShowSchedule(true)} className="alv-btn is-small" disabled={isLive || isEnded}>
                      <Calendar className="w-4 h-4" aria-hidden="true" />
                      Schedule broadcast
                    </button>
                  </div>
                )}
              </div>
              {session.event_id && (
                <div className="alv-cr-scorecard">
                  <b>Scoring runs the broadcast</b>
                  <p>
                    Each race records as its own video when scoring starts it, and stops when it's scored.
                    {scoring ? ` Now: ${scoring.race}${scoring.label ? ` · ${scoring.label.toLowerCase()}` : ''}.` : ''}
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Camera link */}
        {showCameraLink && (
          <div className="alv-cr-modal" role="dialog" aria-modal="true" aria-label="Add a camera" onClick={() => setShowCameraLink(false)}>
            <div className="alv-cr-modalcard" onClick={(e) => e.stopPropagation()}>
              <div className="alv-cr-head">
                <b className="alv-disp" style={{ fontSize: 20 }}>Add a camera</b>
                <button type="button" className="alv-ib" onClick={() => setShowCameraLink(false)} aria-label="Close"><X className="w-4 h-4" /></button>
              </div>
              <p className="alv-cr-hint" style={{ marginTop: 4 }}>Scan with a phone or iPad, pick a position and tap Start camera. No app or login needed. The link works for 24 hours.</p>
              {cameraUrl ? (
                <>
                  <canvas ref={qrRef} style={{ borderRadius: 12, background: '#fff', alignSelf: 'center' }} />
                  <div className="row">
                    <input readOnly value={cameraUrl} onFocus={(e) => e.currentTarget.select()} className="alv-input" aria-label="Camera link" />
                    <button type="button" className="alv-btn is-small" onClick={() => navigator.clipboard.writeText(cameraUrl).then(() => addNotification('success', 'Camera link copied', 2000))}>
                      <Copy className="w-4 h-4" aria-hidden="true" />Copy
                    </button>
                  </div>
                </>
              ) : (
                <p className="alv-cr-hint"><Loader2 className="w-4 h-4 inline animate-spin" /> Making the link…</p>
              )}
            </div>
          </div>
        )}

        {showTestLink && <TestBroadcastLinkModal sessionId={session.id} isLive={isLive} onClose={() => setShowTestLink(false)} />}
        {showSelectRace && (
          <SelectRaceHeatModal
            sessionId={session.id}
            clubId={clubId}
            currentEventId={session.event_id || undefined}
            currentHeatNumber={session.heat_number || undefined}
            onSelect={(eventId, heatNumber) => { onSessionChange({ ...session, event_id: eventId, heat_number: heatNumber }); setShowSelectRace(false); }}
            onClose={() => setShowSelectRace(false)}
          />
        )}
        {showSchedule && (
          <ScheduleStreamModal
            sessionId={session.id}
            currentScheduledTime={session.scheduled_start_time || undefined}
            onSchedule={(scheduledTime) => {
              // The modal saves the time (and scheduled/draft status) itself
              onSessionChange({ ...session, scheduled_start_time: scheduledTime || undefined, status: scheduledTime ? 'scheduled' : 'draft' });
              setShowSchedule(false);
            }}
            onClose={() => setShowSchedule(false)}
          />
        )}
        {showAnalytics && <StreamAnalyticsModal sessionId={session.id} clubId={clubId} onClose={() => setShowAnalytics(false)} />}
      </div>
    </div>
  );
}

/** One race video: start time, race, and where it is on its way to YouTube */
function CloudRaceChip({ video }: { video: LivestreamRaceSegment }) {
  const time = video.segment_start_time
    ? new Date(video.segment_start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    : '';
  const label = video.race_number ? `Race ${video.race_number}${video.heat_number ? ` · Heat ${video.heat_number}` : ''}` : (video.segment_title || 'Race video');
  const done = video.upload_status === 'uploaded' || video.upload_status === 'cleanup_complete';
  const recording = !video.segment_end_time;
  const [tone, status] =
    recording ? ['rec', '● recording'] :
    video.upload_status === 'pending' ? ['up', 'saving'] :
    video.upload_status === 'uploading' ? ['up', 'uploading'] :
    done ? ['ok', video.youtube_video_id ? '✓ YouTube' : '✓ saved'] :
    ['bad', 'upload failed'];
  const body = (
    <>
      {time && <span className="t">{time}</span>}
      <span>{label}</span>
      <span className={`st ${tone}`}>{status}</span>
    </>
  );
  const cls = `alv-mk ${recording ? 'is-rec' : tone === 'up' ? 'is-up' : ''}`;
  if (done && video.youtube_video_id) {
    return <a className={cls} href={`https://youtu.be/${video.youtube_video_id}`} target="_blank" rel="noopener noreferrer" title="Watch on YouTube">{body}</a>;
  }
  return <span className={cls} title={tone === 'bad' ? video.upload_error || 'The upload failed' : undefined}>{body}</span>;
}
