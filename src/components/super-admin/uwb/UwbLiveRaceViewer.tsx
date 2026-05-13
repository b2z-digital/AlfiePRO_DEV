import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../utils/supabase';
import { Eye, Play, Pause, SkipBack, Users, Radio, Wind, Clock, Maximize2, Minimize2 } from 'lucide-react';

interface BoatPosition {
  tag_id: string;
  position_x: number;
  position_y: number;
  speed_mps: number | null;
  heading_deg: number | null;
  recorded_at: string;
}

interface TagInfo {
  id: string;
  tag_hardware_id: string;
  sail_number: string | null;
  skipper_name: string | null;
  color: string;
  boat_class: string | null;
}

interface AnchorInfo {
  id: string;
  name: string;
  role: string;
  position_x: number;
  position_y: number;
}

interface RaceEvent {
  id: string;
  tag_id: string;
  event_type: string;
  timestamp: string;
  lap_number: number;
  metadata: Record<string, unknown>;
}

interface SessionInfo {
  id: string;
  name: string;
  status: string;
  is_live: boolean;
  started_at: string | null;
  wind_speed_knots: number | null;
  wind_direction_deg: number | null;
  course_layout_id: string | null;
}

const CANVAS_SIZE = 700;
const PADDING = 50;
const BOAT_SIZE = 8;
const TRAIL_LENGTH = 30;

export function UwbLiveRaceViewer({
  configId,
  sessionId,
}: {
  configId: string;
  sessionId: string | null;
}) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [anchors, setAnchors] = useState<AnchorInfo[]>([]);
  const [positions, setPositions] = useState<Map<string, BoatPosition[]>>(new Map());
  const [raceEvents, setRaceEvents] = useState<RaceEvent[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    loadSessionData();
  }, [sessionId, configId]);

  useEffect(() => {
    if (!session?.is_live || !sessionId) return;

    const channel = supabase
      .channel(`uwb-positions-${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'uwb_position_data',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const pos = payload.new as any;
        setPositions(prev => {
          const next = new Map(prev);
          const trail = next.get(pos.tag_id) || [];
          trail.push({
            tag_id: pos.tag_id,
            position_x: pos.position_x,
            position_y: pos.position_y,
            speed_mps: pos.speed_mps,
            heading_deg: pos.heading_deg,
            recorded_at: pos.recorded_at,
          });
          if (trail.length > TRAIL_LENGTH) trail.shift();
          next.set(pos.tag_id, trail);
          return next;
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'uwb_race_events',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setRaceEvents(prev => [...prev.slice(-50), payload.new as RaceEvent]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.is_live, sessionId]);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animationRef.current);
      return;
    }
    function animate() {
      drawRaceView();
      animationRef.current = requestAnimationFrame(animate);
    }
    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, positions, anchors, tags, session]);

  useEffect(() => {
    if (!session?.started_at || session.status !== 'racing') return;
    const interval = setInterval(() => {
      const start = new Date(session.started_at!).getTime();
      setElapsedTime(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.started_at, session?.status]);

  async function loadSessionData() {
    const [sessionRes, tagsRes, anchorsRes] = await Promise.all([
      supabase.from('uwb_race_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('uwb_tags').select('id, tag_hardware_id, sail_number, skipper_name, color, boat_class').eq('config_id', configId),
      supabase.from('uwb_anchors').select('id, name, role, position_x, position_y').eq('config_id', configId),
    ]);

    if (sessionRes.data) setSession(sessionRes.data);
    if (tagsRes.data) setTags(tagsRes.data);
    if (anchorsRes.data) setAnchors(anchorsRes.data);

    // Load recent positions for replay or initial state
    if (sessionId) {
      const { data: posData } = await supabase
        .from('uwb_position_data')
        .select('tag_id, position_x, position_y, speed_mps, heading_deg, recorded_at')
        .eq('session_id', sessionId)
        .order('recorded_at', { ascending: false })
        .limit(200);

      if (posData) {
        const grouped = new Map<string, BoatPosition[]>();
        posData.reverse().forEach(p => {
          const trail = grouped.get(p.tag_id) || [];
          trail.push(p);
          if (trail.length > TRAIL_LENGTH) trail.shift();
          grouped.set(p.tag_id, trail);
        });
        setPositions(grouped);
      }

      const { data: events } = await supabase
        .from('uwb_race_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false })
        .limit(50);
      if (events) setRaceEvents(events.reverse());
    }
  }

  function getCourseBounds() {
    const allX = [...anchors.map(a => a.position_x)];
    const allY = [...anchors.map(a => a.position_y)];
    positions.forEach(trail => {
      trail.forEach(p => { allX.push(p.position_x); allY.push(p.position_y); });
    });
    if (allX.length === 0) return { minX: -60, maxX: 60, minY: -60, maxY: 60 };
    const pad = 10;
    return {
      minX: Math.min(...allX) - pad,
      maxX: Math.max(...allX) + pad,
      minY: Math.min(...allY) - pad,
      maxY: Math.max(...allY) + pad,
    };
  }

  function worldToCanvas(x: number, y: number, bounds: ReturnType<typeof getCourseBounds>): [number, number] {
    const rangeX = bounds.maxX - bounds.minX || 1;
    const rangeY = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((CANVAS_SIZE - PADDING * 2) / rangeX, (CANVAS_SIZE - PADDING * 2) / rangeY);
    const cx = PADDING + (x - bounds.minX) * scale;
    const cy = CANVAS_SIZE - PADDING - (y - bounds.minY) * scale;
    return [cx, cy];
  }

  function drawRaceView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const bounds = getCourseBounds();

    // Water background
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Subtle wave pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_SIZE; i += 20) {
      ctx.beginPath();
      for (let x = 0; x < CANVAS_SIZE; x += 5) {
        const y = i + Math.sin((x + Date.now() * 0.001) * 0.05) * 3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Draw start/finish lines
    const startPins = anchors.filter(a => a.role === 'start_pin' || a.role === 'start_boat');
    if (startPins.length === 2) {
      const [x1, y1] = worldToCanvas(startPins[0].position_x, startPins[0].position_y, bounds);
      const [x2, y2] = worldToCanvas(startPins[1].position_x, startPins[1].position_y, bounds);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      // "START" label
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', (x1 + x2) / 2, (y1 + y2) / 2 - 10);
    }

    const finishPins = anchors.filter(a => a.role === 'finish_pin' || a.role === 'finish_boat');
    if (finishPins.length === 2) {
      const [x1, y1] = worldToCanvas(finishPins[0].position_x, finishPins[0].position_y, bounds);
      const [x2, y2] = worldToCanvas(finishPins[1].position_x, finishPins[1].position_y, bounds);
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', (x1 + x2) / 2, (y1 + y2) / 2 - 10);
    }

    // Draw marks/buoys
    anchors.forEach(anchor => {
      const [cx, cy] = worldToCanvas(anchor.position_x, anchor.position_y, bounds);

      // Glow
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.4)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();

      // Buoy body
      ctx.fillStyle = anchor.role.includes('start') ? '#4ade80' :
                      anchor.role.includes('finish') ? '#f87171' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Name
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anchor.name, cx, cy + 18);
    });

    // Draw boat trails and current positions
    positions.forEach((trail, tagId) => {
      const tag = tags.find(t => t.id === tagId);
      const color = tag?.color || '#ffffff';

      // Trail
      if (trail.length > 1) {
        ctx.strokeStyle = color + '40';
        ctx.lineWidth = 2;
        ctx.beginPath();
        trail.forEach((p, i) => {
          const [px, py] = worldToCanvas(p.position_x, p.position_y, bounds);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // Current position (last in trail)
      const current = trail[trail.length - 1];
      if (!current) return;
      const [bx, by] = worldToCanvas(current.position_x, current.position_y, bounds);

      // Boat triangle shape
      const heading = current.heading_deg != null ? (current.heading_deg - 90) * (Math.PI / 180) : 0;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(heading);

      // Boat hull
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -BOAT_SIZE);
      ctx.lineTo(-BOAT_SIZE * 0.6, BOAT_SIZE * 0.7);
      ctx.lineTo(BOAT_SIZE * 0.6, BOAT_SIZE * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      // Sail number label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tag?.sail_number || tag?.tag_hardware_id?.slice(-3) || '?', bx, by + BOAT_SIZE + 14);

      // Speed indicator
      if (current.speed_mps != null && current.speed_mps > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px sans-serif';
        ctx.fillText(`${(current.speed_mps * 1.94384).toFixed(1)}kts`, bx, by + BOAT_SIZE + 24);
      }
    });

    // Wind indicator (top-right)
    if (session?.wind_direction_deg != null) {
      const windRad = (session.wind_direction_deg - 90) * (Math.PI / 180);
      const windCx = CANVAS_SIZE - 45;
      const windCy = 45;

      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.arc(windCx, windCy, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(windCx, windCy);
      ctx.rotate(windRad);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-5, 8);
      ctx.lineTo(5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WIND', windCx, windCy + 35);
    }

    // Live indicator
    if (session?.is_live) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(20, 20, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('LIVE', 30, 24);
    }
  }

  function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  if (!sessionId) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <Eye className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700 mb-2">No Session Selected</h3>
        <p className="text-sm text-gray-400">Select a race session from the Sessions tab to view live tracking or replay</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-4 ${isFullscreen ? 'bg-gray-900 p-4' : ''}`}>
      {/* Controls Bar */}
      <div className={`flex items-center justify-between ${isFullscreen ? 'text-white' : ''}`}>
        <div className="flex items-center gap-4">
          <h3 className={`font-semibold flex items-center gap-2 ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
            {session?.is_live && <Radio className="w-4 h-4 text-red-500 animate-pulse" />}
            {session?.name || 'Race Viewer'}
          </h3>
          {session?.status === 'racing' && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium">
              <Clock className="w-3.5 h-3.5" />
              {formatElapsed(elapsedTime)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Main Canvas */}
        <div className="xl:col-span-3">
          <div className="bg-[#0c4a6e] rounded-xl overflow-hidden shadow-lg">
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 'auto', aspectRatio: '1' }}
              className="block"
            />
          </div>
        </div>

        {/* Sidebar - Leaderboard & Events */}
        <div className="space-y-4">
          {/* Boats on course */}
          <div className={`rounded-xl border p-4 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h4 className={`font-medium text-sm mb-3 flex items-center gap-2 ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
              <Users className="w-4 h-4 text-sky-500" />
              Boats on Course ({positions.size})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {Array.from(positions.entries()).map(([tagId, trail]) => {
                const tag = tags.find(t => t.id === tagId);
                const latest = trail[trail.length - 1];
                const speed = latest?.speed_mps ? (latest.speed_mps * 1.94384).toFixed(1) : '--';
                return (
                  <div key={tagId} className={`flex items-center gap-2 p-2 rounded-lg ${isFullscreen ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag?.color || '#ccc' }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
                        {tag?.sail_number || tag?.tag_hardware_id || 'Unknown'}
                      </p>
                      <p className={`text-[10px] ${isFullscreen ? 'text-gray-400' : 'text-gray-500'}`}>
                        {tag?.skipper_name || 'Unassigned'}
                      </p>
                    </div>
                    <span className={`text-xs font-mono ${isFullscreen ? 'text-sky-400' : 'text-sky-600'}`}>
                      {speed}kts
                    </span>
                  </div>
                );
              })}
              {positions.size === 0 && (
                <p className={`text-xs text-center py-4 ${isFullscreen ? 'text-gray-500' : 'text-gray-400'}`}>
                  Waiting for position data...
                </p>
              )}
            </div>
          </div>

          {/* Race Events Feed */}
          <div className={`rounded-xl border p-4 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h4 className={`font-medium text-sm mb-3 ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
              Race Events
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {raceEvents.slice(-10).reverse().map(event => {
                const tag = tags.find(t => t.id === event.tag_id);
                const typeLabels: Record<string, string> = {
                  start_crossing: 'Started',
                  finish_crossing: 'Finished',
                  mark_rounding: 'Mark Rounded',
                  ocs: 'OCS!',
                  recall: 'Recall',
                };
                const typeColors: Record<string, string> = {
                  start_crossing: 'text-emerald-500',
                  finish_crossing: 'text-sky-500',
                  mark_rounding: 'text-amber-500',
                  ocs: 'text-red-500',
                  recall: 'text-red-500',
                };
                return (
                  <div key={event.id} className={`flex items-center gap-2 text-xs p-1.5 rounded ${isFullscreen ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag?.color || '#ccc' }} />
                    <span className={`font-medium ${isFullscreen ? 'text-gray-300' : 'text-gray-700'}`}>
                      {tag?.sail_number || '?'}
                    </span>
                    <span className={typeColors[event.event_type] || 'text-gray-500'}>
                      {typeLabels[event.event_type] || event.event_type}
                    </span>
                    <span className={`ml-auto ${isFullscreen ? 'text-gray-500' : 'text-gray-400'}`}>
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              {raceEvents.length === 0 && (
                <p className={`text-xs text-center py-4 ${isFullscreen ? 'text-gray-500' : 'text-gray-400'}`}>
                  No events yet
                </p>
              )}
            </div>
          </div>

          {/* Wind Info */}
          {session?.wind_speed_knots != null && (
            <div className={`rounded-xl border p-4 ${isFullscreen ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Wind className={`w-4 h-4 ${isFullscreen ? 'text-sky-400' : 'text-sky-500'}`} />
                <span className={`text-sm ${isFullscreen ? 'text-white' : 'text-gray-900'}`}>
                  {session.wind_speed_knots}kts @ {session.wind_direction_deg}°
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
