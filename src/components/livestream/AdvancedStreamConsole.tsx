import React, { useState, useEffect, useRef } from 'react';
import { Copy, Eye, EyeOff, Signal, Wifi, WifiOff, Activity, Radio, Monitor, Smartphone, Settings, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, RefreshCw, HardDrive, Cloud, Layers, ChevronDown, ChevronRight, Zap, ChartBar as BarChart3, Clock, Info, Shield, Video } from 'lucide-react';
import type { LivestreamSession, StreamInputMode, StreamHealthMetrics, EncodingConfig } from '../../types/livestream';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';

interface AdvancedStreamConsoleProps {
  session: LivestreamSession;
  streamStatus: 'offline' | 'connecting' | 'testing' | 'live';
  whipStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  onUpdateSession: (updates: Partial<LivestreamSession>) => Promise<void>;
  onModeChange?: (mode: StreamInputMode) => void;
}

const RECOMMENDED_CONFIG: EncodingConfig = {
  recommended_resolution: '1920x1080',
  recommended_fps: 30,
  recommended_bitrate_kbps: 4500,
  recommended_keyframe_interval: 2,
  recommended_audio_bitrate_kbps: 128,
};

export function AdvancedStreamConsole({
  session,
  streamStatus,
  whipStatus,
  onUpdateSession,
  onModeChange,
}: AdvancedStreamConsoleProps) {
  const { addNotification } = useNotification();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('connection');
  const [signalPolling, setSignalPolling] = useState(false);
  const [healthMetrics, setHealthMetrics] = useState<StreamHealthMetrics>(session.stream_health || {});
  const [signalStatus, setSignalStatus] = useState<'waiting' | 'detected' | 'lost'>(
    session.signal_detected ? 'detected' : 'waiting'
  );
  const [reconnecting, setReconnecting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputMode = session.stream_input_mode || 'browser';
  const isRtmpMode = inputMode === 'rtmp_external';

  useEffect(() => {
    if (isRtmpMode && (streamStatus === 'testing' || streamStatus === 'live' || streamStatus === 'connecting')) {
      startSignalPolling();
    }
    return () => stopSignalPolling();
  }, [isRtmpMode, streamStatus, session.cloudflare_live_input_id]);

  const startSignalPolling = () => {
    if (pollingRef.current) return;
    setSignalPolling(true);
    pollingRef.current = setInterval(async () => {
      await checkSignalStatus();
    }, 5000);
    checkSignalStatus();
  };

  const stopSignalPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setSignalPolling(false);
  };

  const checkSignalStatus = async () => {
    if (!session.cloudflare_live_input_id) return;
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'getLiveInput',
          clubId: session.club_id,
          liveInputId: session.cloudflare_live_input_id,
        }),
      });

      const data = await response.json();
      if (data.liveInput) {
        const isConnected = data.liveInput.status?.current?.state === 'connected';
        const newStatus = isConnected ? 'detected' : 'waiting';

        if (newStatus === 'detected' && signalStatus !== 'detected') {
          addNotification('success', 'Incoming signal detected!', 4000);
          await onUpdateSession({
            signal_detected: true,
            signal_detected_at: new Date().toISOString(),
            last_signal_at: new Date().toISOString(),
          } as Partial<LivestreamSession>);
        } else if (newStatus === 'waiting' && signalStatus === 'detected') {
          setSignalStatus('lost');
          addNotification('warning', 'Signal lost - waiting for reconnection...', 5000);
          return;
        }

        setSignalStatus(newStatus);

        if (isConnected && data.liveInput.status?.current) {
          const status = data.liveInput.status.current;
          const newMetrics: StreamHealthMetrics = {
            bitrate_kbps: status.ingestBitrate ? Math.round(status.ingestBitrate / 1000) : undefined,
            fps: status.ingestFrameRate,
            resolution: status.ingestWidth && status.ingestHeight
              ? `${status.ingestWidth}x${status.ingestHeight}` : undefined,
            connection_quality: getConnectionQuality(status.ingestBitrate),
            last_updated: new Date().toISOString(),
          };
          setHealthMetrics(newMetrics);
        }
      }
    } catch (err) {
      console.error('[SignalPoll] Error:', err);
    }
  };

  const getConnectionQuality = (bitrate?: number): StreamHealthMetrics['connection_quality'] => {
    if (!bitrate) return undefined;
    const kbps = bitrate / 1000;
    if (kbps >= 4000) return 'excellent';
    if (kbps >= 3000) return 'good';
    if (kbps >= 2000) return 'fair';
    if (kbps >= 1000) return 'poor';
    return 'critical';
  };

  const handleModeChange = async (mode: StreamInputMode) => {
    await onUpdateSession({ stream_input_mode: mode } as Partial<LivestreamSession>);
    onModeChange?.(mode);
  };

  const handleOverlayToggle = async (enabled: boolean) => {
    await onUpdateSession({ enable_alfie_overlay: enabled } as Partial<LivestreamSession>);
  };

  const handleRecordingModeChange = async (mode: string) => {
    await onUpdateSession({ recording_mode: mode } as Partial<LivestreamSession>);
  };

  const handleAutoRecordToggle = async (enabled: boolean) => {
    await onUpdateSession({ auto_record: enabled } as Partial<LivestreamSession>);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    addNotification('success', 'Copied to clipboard', 2000);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const qualityColor = (quality?: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-emerald-400';
      case 'fair': return 'text-amber-400';
      case 'poor': return 'text-orange-400';
      case 'critical': return 'text-red-400';
      default: return 'text-slate-500';
    }
  };

  const qualityBg = (quality?: string) => {
    switch (quality) {
      case 'excellent': return 'bg-green-500/20 border-green-500/30';
      case 'good': return 'bg-emerald-500/20 border-emerald-500/30';
      case 'fair': return 'bg-amber-500/20 border-amber-500/30';
      case 'poor': return 'bg-orange-500/20 border-orange-500/30';
      case 'critical': return 'bg-red-500/20 border-red-500/30';
      default: return 'bg-slate-800/50 border-slate-700/50';
    }
  };

  return (
    <div className="space-y-3">
      {/* Stream Mode Selector */}
      <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Stream Input</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleModeChange('browser')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
              !isRtmpMode
                ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20'
                : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <Monitor className={`w-5 h-5 ${!isRtmpMode ? 'text-cyan-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] font-medium ${!isRtmpMode ? 'text-cyan-300' : 'text-slate-400'}`}>
              Simple
            </span>
            <span className="text-[9px] text-slate-500">Phone/Laptop</span>
          </button>
          <button
            onClick={() => handleModeChange('rtmp_external')}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
              isRtmpMode
                ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/20'
                : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <Settings className={`w-5 h-5 ${isRtmpMode ? 'text-cyan-400' : 'text-slate-500'}`} />
            <span className={`text-[10px] font-medium ${isRtmpMode ? 'text-cyan-300' : 'text-slate-400'}`}>
              Advanced
            </span>
            <span className="text-[9px] text-slate-500">RTMP/OBS</span>
          </button>
        </div>
      </div>

      {/* RTMP Credentials Panel (Advanced Mode) */}
      {isRtmpMode && (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-3">
            <Wifi className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Connection</span>
          </div>

          {/* RTMP Credentials - always visible */}
          {session.cloudflare_rtmps_url ? (
            <div className="space-y-3">
              {/* RTMP URL */}
              <div>
                <label className="text-[10px] text-slate-500 font-medium mb-1.5 block">Server URL</label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-[11px] text-slate-300 font-mono truncate">
                    {session.cloudflare_rtmps_url}
                  </div>
                  <button
                    onClick={() => copyToClipboard(session.cloudflare_rtmps_url!, 'rtmp-url')}
                    className="p-2 bg-slate-800 border border-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                  >
                    {copiedField === 'rtmp-url' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>

              {/* Stream Key */}
              {session.cloudflare_rtmps_stream_key && (
                <div>
                  <label className="text-[10px] text-slate-500 font-medium mb-1.5 block">Stream Key</label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 bg-slate-950 border border-slate-700/50 rounded-lg px-3 py-2 text-[11px] text-slate-300 font-mono truncate">
                      {showStreamKey ? session.cloudflare_rtmps_stream_key : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    </div>
                    <button
                      onClick={() => setShowStreamKey(!showStreamKey)}
                      className="p-2 bg-slate-800 border border-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                    >
                      {showStreamKey ? (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                    <button
                      onClick={() => copyToClipboard(session.cloudflare_rtmps_stream_key!, 'stream-key')}
                      className="p-2 bg-slate-800 border border-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                    >
                      {copiedField === 'stream-key' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Signal Status - shown when stream is active */}
              {(streamStatus === 'testing' || streamStatus === 'live' || streamStatus === 'connecting') && (
                <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                  signalStatus === 'detected'
                    ? 'bg-green-500/10 border-green-500/30'
                    : signalStatus === 'lost'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-slate-800/50 border-slate-700/50'
                }`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    signalStatus === 'detected'
                      ? 'bg-green-400 animate-pulse'
                      : signalStatus === 'lost'
                      ? 'bg-red-400 animate-pulse'
                      : 'bg-slate-600'
                  }`} />
                  <div className="flex-1">
                    <span className={`text-[11px] font-medium ${
                      signalStatus === 'detected' ? 'text-green-300' :
                      signalStatus === 'lost' ? 'text-red-300' : 'text-slate-400'
                    }`}>
                      {signalStatus === 'detected' ? 'Signal Detected' :
                       signalStatus === 'lost' ? 'Signal Lost' : 'Waiting for Signal...'}
                    </span>
                    {signalStatus === 'detected' && healthMetrics.resolution && (
                      <span className="text-[10px] text-slate-500 ml-2">
                        {healthMetrics.resolution} @ {healthMetrics.fps}fps
                      </span>
                    )}
                  </div>
                  {signalPolling && signalStatus === 'waiting' && (
                    <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-800/40 border border-slate-700/30 rounded-lg">
              <p className="text-[11px] text-slate-400 text-center">
                RTMP credentials will appear here once the stream session is created.
              </p>
              <p className="text-[10px] text-slate-500 text-center mt-1">
                Click "Go Live" or start testing to generate your connection details.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stream Health Metrics */}
      {isRtmpMode && signalStatus === 'detected' && (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
          <button
            onClick={() => toggleSection('health')}
            className="flex items-center justify-between w-full mb-2"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-green-400" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Stream Health</span>
            </div>
            {expandedSection === 'health' ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {expandedSection === 'health' && (
            <div className="space-y-2 mt-2">
              {/* Connection Quality Bar */}
              <div className={`p-2.5 rounded-lg border ${qualityBg(healthMetrics.connection_quality)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Connection Quality</span>
                  <span className={`text-xs font-bold uppercase ${qualityColor(healthMetrics.connection_quality)}`}>
                    {healthMetrics.connection_quality || 'Unknown'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      healthMetrics.connection_quality === 'excellent' ? 'bg-green-400 w-full' :
                      healthMetrics.connection_quality === 'good' ? 'bg-emerald-400 w-4/5' :
                      healthMetrics.connection_quality === 'fair' ? 'bg-amber-400 w-3/5' :
                      healthMetrics.connection_quality === 'poor' ? 'bg-orange-400 w-2/5' :
                      healthMetrics.connection_quality === 'critical' ? 'bg-red-400 w-1/5' :
                      'bg-slate-600 w-0'
                    }`}
                  />
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2">
                <MetricCard
                  label="Bitrate"
                  value={healthMetrics.bitrate_kbps ? `${healthMetrics.bitrate_kbps}` : '--'}
                  unit="kbps"
                  target={RECOMMENDED_CONFIG.recommended_bitrate_kbps}
                  actual={healthMetrics.bitrate_kbps}
                />
                <MetricCard
                  label="FPS"
                  value={healthMetrics.fps ? `${healthMetrics.fps}` : '--'}
                  unit="fps"
                  target={RECOMMENDED_CONFIG.recommended_fps}
                  actual={healthMetrics.fps}
                />
                <MetricCard
                  label="Resolution"
                  value={healthMetrics.resolution ? healthMetrics.resolution.split('x')[1] + 'p' : '--'}
                  unit=""
                />
              </div>

              {/* Encoding Warnings */}
              {healthMetrics.bitrate_kbps && healthMetrics.bitrate_kbps < 2000 && (
                <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-[10px] text-amber-300">
                    Low bitrate detected. Recommended: 4500 kbps for 1080p30.
                    Check your upload speed or reduce resolution.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Encoding Guidance */}
      {isRtmpMode && (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
          <button
            onClick={() => toggleSection('encoding')}
            className="flex items-center justify-between w-full mb-2"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Recommended Settings</span>
            </div>
            {expandedSection === 'encoding' ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {expandedSection === 'encoding' && (
            <div className="space-y-2 mt-2">
              <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg overflow-hidden">
                <div className="divide-y divide-slate-700/30">
                  <ConfigRow icon={<Monitor className="w-3 h-3" />} label="Resolution" value="1920x1080 (1080p)" />
                  <ConfigRow icon={<Video className="w-3 h-3" />} label="Frame Rate" value="30 fps" />
                  <ConfigRow icon={<Zap className="w-3 h-3" />} label="Bitrate" value="4500 kbps" />
                  <ConfigRow icon={<Clock className="w-3 h-3" />} label="Keyframe Interval" value="2 seconds" />
                  <ConfigRow icon={<Activity className="w-3 h-3" />} label="Audio" value="AAC 128 kbps" />
                  <ConfigRow icon={<Shield className="w-3 h-3" />} label="Encoder" value="x264 / NVENC" />
                </div>
              </div>

              {/* Network Requirements */}
              <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <Wifi className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] font-medium text-slate-300">Network Requirements</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Minimum Upload</span>
                    <span className="text-slate-300">6 Mbps</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-500">Recommended Upload</span>
                    <span className="text-green-400 font-medium">10+ Mbps</span>
                  </div>
                </div>
              </div>

              {/* How to Connect Guide */}
              <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] font-medium text-slate-300">How to Connect</span>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] text-slate-400 space-y-1.5">
                    <p className="font-medium text-slate-300">OBS Studio:</p>
                    <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9.5px]">
                      <li>Go to Settings &gt; Stream</li>
                      <li>Service: <span className="text-slate-300">Custom</span></li>
                      <li>Paste the <span className="text-cyan-400">Server URL</span> from above</li>
                      <li>Paste the <span className="text-cyan-400">Stream Key</span> from above</li>
                      <li>Click "Start Streaming"</li>
                    </ol>
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-1.5">
                    <p className="font-medium text-slate-300">ATEM Mini / Hardware Encoders:</p>
                    <ol className="list-decimal list-inside space-y-0.5 pl-1 text-[9.5px]">
                      <li>Open ATEM Software Control &gt; Output</li>
                      <li>Platform: <span className="text-slate-300">Custom RTMP</span></li>
                      <li>Enter the Server URL and Stream Key</li>
                      <li>Press "On Air"</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Supported Setups */}
              <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
                <span className="text-[10px] font-medium text-slate-300 block mb-2">Supported Setups</span>
                <div className="space-y-1.5">
                  <SetupTier color="green" label="Starter" desc="Phone + Alfie (Browser mode)" />
                  <SetupTier color="amber" label="Intermediate" desc="OBS + Webcam / DSLR" />
                  <SetupTier color="blue" label="Advanced" desc="ATEM Mini + Multiple Cameras" />
                  <SetupTier color="rose" label="Pro" desc="Drone + ATEM + Bonded Internet" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overlay & Recording Controls */}
      <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-3">
        <button
          onClick={() => toggleSection('controls')}
          className="flex items-center justify-between w-full mb-2"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Output Controls</span>
          </div>
          {expandedSection === 'controls' ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          )}
        </button>

        {expandedSection === 'controls' && (
          <div className="space-y-2.5 mt-2">
            {/* Overlay Mode */}
            <div className="flex items-center justify-between p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <div>
                  <span className="text-[11px] text-slate-300 block">Alfie Overlay</span>
                  <span className="text-[9px] text-slate-500">
                    {isRtmpMode ? 'Disable if using OBS overlays' : 'Race data + scoreboard'}
                  </span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={session.enable_alfie_overlay !== false}
                  onChange={(e) => handleOverlayToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:ring-1 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
              </label>
            </div>

            {/* Auto Record */}
            <div className="flex items-center justify-between p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg">
              <div className="flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                <div>
                  <span className="text-[11px] text-slate-300 block">Auto Record</span>
                  <span className="text-[9px] text-slate-500">Record segments automatically</span>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={session.auto_record !== false}
                  onChange={(e) => handleAutoRecordToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:ring-1 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600" />
              </label>
            </div>

            {/* Recording Mode Selector */}
            <div className="p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] text-slate-300">Recording Storage</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['auto', 'manual', 'both'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleRecordingModeChange(mode)}
                    className={`px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                      (session.recording_mode || 'auto') === mode
                        ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-900/50 border border-slate-700/50 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    {mode === 'auto' ? 'Cloud' : mode === 'manual' ? 'Local' : 'Both'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Failover / Reconnect Status */}
      {isRtmpMode && signalStatus === 'lost' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff className="w-4 h-4 text-red-400" />
            <span className="text-xs font-medium text-red-300">Signal Lost</span>
          </div>
          <p className="text-[10px] text-red-400/80 mb-2">
            Stream connection interrupted. Waiting for auto-reconnection from encoder...
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-red-900/50 rounded-full overflow-hidden">
              <div className="h-full bg-red-400 rounded-full animate-pulse w-1/3" />
            </div>
            <span className="text-[9px] text-red-500">
              Attempts: {session.reconnect_attempts || 0}
            </span>
          </div>
          <p className="text-[9px] text-slate-500 mt-2">
            Recording continues if possible. Most encoders auto-reconnect within 10 seconds.
          </p>
        </div>
      )}

      {/* Latency Notice */}
      {isRtmpMode && streamStatus === 'live' && (
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5">
          <div className="flex items-start gap-2">
            <Clock className="w-3 h-3 text-slate-500 flex-shrink-0 mt-0.5" />
            <span className="text-[9px] text-slate-500">
              Cloudflare relay adds ~10-20 second delay. This is normal for broadcast quality streams.
              Do not use for real-time race judging.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, unit, target, actual }: {
  label: string;
  value: string;
  unit: string;
  target?: number;
  actual?: number;
}) {
  const isGood = target && actual ? actual >= target * 0.8 : true;
  return (
    <div className={`p-2 rounded-lg border text-center ${
      actual ? (isGood ? 'bg-slate-800/50 border-slate-700/50' : 'bg-amber-500/5 border-amber-500/20') : 'bg-slate-800/50 border-slate-700/50'
    }`}>
      <div className={`text-sm font-bold ${actual ? (isGood ? 'text-white' : 'text-amber-400') : 'text-slate-500'}`}>
        {value}
      </div>
      <div className="text-[9px] text-slate-500">{unit}</div>
      <div className="text-[8px] text-slate-600 mt-0.5">{label}</div>
    </div>
  );
}

function ConfigRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="text-slate-500">{icon}</span>
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
      <span className="text-[10px] text-slate-200 font-medium">{value}</span>
    </div>
  );
}

function SetupTier({ color, label, desc }: { color: string; label: string; desc: string }) {
  const dotColors: Record<string, string> = {
    green: 'bg-green-400',
    amber: 'bg-amber-400',
    blue: 'bg-blue-400',
    rose: 'bg-rose-400',
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color] || 'bg-slate-400'}`} />
      <span className="text-[10px] text-slate-300 font-medium w-20">{label}</span>
      <span className="text-[10px] text-slate-500">{desc}</span>
    </div>
  );
}
