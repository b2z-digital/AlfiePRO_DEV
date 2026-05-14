import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabase';
import { Eye, Play, Pause, Users, Radio, Wind, Clock, Maximize2, Minimize2, Zap } from 'lucide-react';

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

const DEMO_SKIPPERS = [
  { name: 'Stephen Walsh', sail: 'AUS 1', color: '#ef4444' },
  { name: 'Craig Bowler', sail: 'AUS 7', color: '#f97316' },
  { name: 'David Craven', sail: 'AUS 12', color: '#eab308' },
  { name: 'Peter McNamara', sail: 'AUS 23', color: '#22c55e' },
  { name: 'Mark Thompson', sail: 'AUS 45', color: '#06b6d4' },
  { name: 'Greg Richards', sail: 'AUS 56', color: '#3b82f6' },
  { name: 'Andrew Hurst', sail: 'AUS 77', color: '#8b5cf6' },
  { name: 'Phil Skewes', sail: 'AUS 88', color: '#ec4899' },
  { name: 'John Robinson', sail: 'AUS 91', color: '#14b8a6' },
  { name: 'Ross Campbell', sail: 'AUS 33', color: '#f59e0b' },
  { name: 'Brian Lewis', sail: 'AUS 5', color: '#6366f1' },
  { name: 'Keith Murray', sail: 'AUS 19', color: '#10b981' },
];

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
  const [demoRunning, setDemoRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<number>(0);
  const demoTickRef = useRef<number>(0);

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

  useEffect(() => {
    return () => {
      if (demoRef.current) clearInterval(demoRef.current);
    };
  }, []);

  async function loadSessionData() {
    const [sessionRes, tagsRes, anchorsRes] = await Promise.all([
      supabase.from('uwb_race_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('uwb_tags').select('id, tag_hardware_id, sail_number, skipper_name, color, boat_class').eq('config_id', configId),
      supabase.from('uwb_anchors').select('id, name, role, position_x, position_y').eq('config_id', configId),
    ]);

    if (sessionRes.data) setSession(sessionRes.data);
    if (tagsRes.data) setTags(tagsRes.data);
    if (anchorsRes.data) setAnchors(anchorsRes.data);

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

  function startDemoRace() {
    setDemoRunning(true);
    demoTickRef.current = 0;

    // Generate course marks if no anchors exist
    const courseAnchors: AnchorInfo[] = anchors.length > 0 ? anchors : [
      { id: 'start_pin', name: 'Start Pin', role: 'start_pin', position_x: -20, position_y: -30 },
      { id: 'start_boat', name: 'Start Boat', role: 'start_boat', position_x: 20, position_y: -30 },
      { id: 'windward', name: 'Windward', role: 'course_mark', position_x: 0, position_y: 40 },
      { id: 'leeward_port', name: 'Leeward Port', role: 'course_mark', position_x: -15, position_y: -20 },
      { id: 'leeward_stbd', name: 'Leeward Stbd', role: 'course_mark', position_x: 15, position_y: -20 },
      { id: 'finish_pin', name: 'Finish Pin', role: 'finish_pin', position_x: -18, position_y: -35 },
      { id: 'finish_boat', name: 'Finish Boat', role: 'finish_boat', position_x: 18, position_y: -35 },
    ];

    if (anchors.length === 0) setAnchors(courseAnchors);

    // Create demo tags
    const demoTags: TagInfo[] = DEMO_SKIPPERS.map((s, i) => ({
      id: `demo-tag-${i}`,
      tag_hardware_id: `UWB-${String(i + 1).padStart(3, '0')}`,
      sail_number: s.sail,
      skipper_name: s.name,
      color: s.color,
      boat_class: 'IOM',
    }));
    setTags(demoTags);

    // Set session info
    setSession({
      id: 'demo-session',
      name: 'LMRYC IOM Club Championship - Heat 3',
      status: 'racing',
      is_live: true,
      started_at: new Date().toISOString(),
      wind_speed_knots: 8,
      wind_direction_deg: 195,
      course_layout_id: null,
    });

    // Build course waypoints from anchors for boat navigation
    const marks = courseAnchors.filter(a => a.role === 'course_mark');
    const startLine = courseAnchors.filter(a => a.role.includes('start'));
    const startMidX = startLine.length === 2 ? (startLine[0].position_x + startLine[1].position_x) / 2 : 0;
    const startMidY = startLine.length === 2 ? (startLine[0].position_y + startLine[1].position_y) / 2 : -30;

    // Define course route: start -> windward -> leeward -> windward -> finish
    const windward = marks.find(m => m.name.toLowerCase().includes('windward')) || marks[0];
    const leewardPort = marks.find(m => m.name.toLowerCase().includes('leeward') && m.name.toLowerCase().includes('port'));
    const leewardStbd = marks.find(m => m.name.toLowerCase().includes('leeward') && m.name.toLowerCase().includes('stbd'));
    const leeward = leewardPort || marks.find(m => m.name.toLowerCase().includes('leeward')) || marks[1];

    const courseRoute = [
      { x: startMidX, y: startMidY },
      windward ? { x: windward.position_x, y: windward.position_y } : { x: 0, y: 40 },
      leeward ? { x: leeward.position_x, y: leeward.position_y } : { x: 0, y: -20 },
      windward ? { x: windward.position_x, y: windward.position_y } : { x: 0, y: 40 },
      leewardStbd ? { x: leewardStbd.position_x, y: leewardStbd.position_y } : (leeward ? { x: leeward.position_x, y: leeward.position_y } : { x: 0, y: -20 }),
      { x: startMidX, y: startMidY - 5 },
    ];

    // Each boat has different speed/progress
    const boatStates = demoTags.map((_, i) => ({
      progress: 0,
      segmentIndex: 0,
      speed: 0.4 + Math.random() * 0.25 + (i === 0 ? 0.08 : 0), // Stephen Walsh slightly faster
      lateralOffset: (Math.random() - 0.5) * 8,
      wobble: Math.random() * Math.PI * 2,
    }));

    // Demo event generation
    const demoEvents: RaceEvent[] = [];
    let eventCounter = 0;

    const interval = setInterval(() => {
      demoTickRef.current++;
      const tick = demoTickRef.current;

      setPositions(prev => {
        const next = new Map(prev);

        boatStates.forEach((state, i) => {
          const tagId = `demo-tag-${i}`;
          const trail = next.get(tagId) || [];

          // Advance along course
          state.progress += state.speed * (0.8 + Math.random() * 0.4);
          state.wobble += 0.1;

          // Calculate position along course route
          const totalSegments = courseRoute.length - 1;
          const progressPerSegment = 100 / totalSegments;
          state.segmentIndex = Math.min(Math.floor(state.progress / progressPerSegment), totalSegments - 1);
          const segFrac = (state.progress - state.segmentIndex * progressPerSegment) / progressPerSegment;

          if (state.segmentIndex >= totalSegments) {
            state.segmentIndex = totalSegments - 1;
            state.progress = totalSegments * progressPerSegment;
          }

          const from = courseRoute[state.segmentIndex];
          const to = courseRoute[state.segmentIndex + 1] || courseRoute[state.segmentIndex];
          const fracClamped = Math.min(Math.max(segFrac, 0), 1);

          const baseX = from.x + (to.x - from.x) * fracClamped;
          const baseY = from.y + (to.y - from.y) * fracClamped;

          // Add lateral offset and wobble for realism
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
          const perpX = -dy / segLen;
          const perpY = dx / segLen;
          const wobbleOffset = Math.sin(state.wobble) * 1.5;

          const x = baseX + perpX * (state.lateralOffset + wobbleOffset);
          const y = baseY + perpY * (state.lateralOffset + wobbleOffset);

          // Calculate heading
          const heading = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI) + 90 + Math.sin(state.wobble) * 5;

          // Speed in m/s (IOM boats are ~0.5-1.5 m/s)
          const speedMps = (state.speed * 2.5) + Math.random() * 0.3;

          const pos: BoatPosition = {
            tag_id: tagId,
            position_x: x,
            position_y: y,
            speed_mps: speedMps,
            heading_deg: heading,
            recorded_at: new Date().toISOString(),
          };

          trail.push(pos);
          if (trail.length > TRAIL_LENGTH) trail.shift();
          next.set(tagId, trail);

          // Generate mark rounding events
          if (tick % 20 === 0 && Math.random() < 0.3) {
            const eventTypes = ['mark_rounding', 'mark_rounding', 'mark_rounding'];
            const evType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            demoEvents.push({
              id: `demo-event-${eventCounter++}`,
              tag_id: tagId,
              event_type: evType,
              timestamp: new Date().toISOString(),
              lap_number: Math.floor(state.segmentIndex / 2) + 1,
              metadata: {},
            });
          }
        });

        return next;
      });

      // Update race events
      if (demoEvents.length > 0) {
        setRaceEvents(prev => [...prev, ...demoEvents.splice(0)].slice(-50));
      }

      // Update elapsed time
      setElapsedTime(tick);
    }, 200);

    demoRef.current = interval as unknown as number;
  }

  function stopDemo() {
    if (demoRef.current) {
      clearInterval(demoRef.current);
      demoRef.current = 0;
    }
    setDemoRunning(false);
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

    // Dark ocean background
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Subtle wave pattern
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_SIZE; i += 20) {
      ctx.beginPath();
      for (let x = 0; x < CANVAS_SIZE; x += 5) {
        const y = i + Math.sin((x + Date.now() * 0.001) * 0.05) * 3;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Grid overlay
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = PADDING; i < CANVAS_SIZE - PADDING; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, PADDING);
      ctx.lineTo(i, CANVAS_SIZE - PADDING);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(PADDING, i);
      ctx.lineTo(CANVAS_SIZE - PADDING, i);
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
      ctx.shadowColor = anchor.role.includes('start') ? '#4ade80' :
                        anchor.role.includes('finish') ? '#f87171' : '#fbbf24';
      ctx.shadowBlur = 12;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      const glowColor = anchor.role.includes('start') ? '74, 222, 128' :
                        anchor.role.includes('finish') ? '248, 113, 113' : '251, 191, 36';
      gradient.addColorStop(0, `rgba(${glowColor}, 0.4)`);
      gradient.addColorStop(1, `rgba(${glowColor}, 0)`);
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

      ctx.shadowBlur = 0;

      // Name
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anchor.name, cx, cy + 18);
    });

    // Draw boat trails and flag-style markers
    const ALFIE_BLUE = '#0ea5e9';
    const ALFIE_BLUE_DARK = '#0284c7';
    const FLAG_POLE_HEIGHT = 28;
    const FLAG_PADDING_X = 5;
    const FLAG_PADDING_Y = 3;

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

      // Boat dot (position indicator)
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = ALFIE_BLUE_DARK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Green activity ring
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx - 1, by + 2, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(bx - 1, by + 2, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Flag pole (vertical line going up from boat dot)
      ctx.strokeStyle = ALFIE_BLUE_DARK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - FLAG_POLE_HEIGHT);
      ctx.stroke();

      // Flag rectangle with sail number
      const sailLabel = tag?.sail_number || tag?.tag_hardware_id?.slice(-3) || '?';
      ctx.font = 'bold 11px sans-serif';
      const textWidth = ctx.measureText(sailLabel).width;
      const flagWidth = textWidth + FLAG_PADDING_X * 2;
      const flagHeight = 18;
      const flagX = bx;
      const flagY = by - FLAG_POLE_HEIGHT - flagHeight;

      // Flag background with rounded corners
      const radius = 3;
      ctx.beginPath();
      ctx.moveTo(flagX + radius, flagY);
      ctx.lineTo(flagX + flagWidth - radius, flagY);
      ctx.arcTo(flagX + flagWidth, flagY, flagX + flagWidth, flagY + radius, radius);
      ctx.lineTo(flagX + flagWidth, flagY + flagHeight - radius);
      ctx.arcTo(flagX + flagWidth, flagY + flagHeight, flagX + flagWidth - radius, flagY + flagHeight, radius);
      ctx.lineTo(flagX + radius, flagY + flagHeight);
      ctx.arcTo(flagX, flagY + flagHeight, flagX, flagY + flagHeight - radius, radius);
      ctx.lineTo(flagX, flagY + radius);
      ctx.arcTo(flagX, flagY, flagX + radius, flagY, radius);
      ctx.closePath();

      ctx.fillStyle = ALFIE_BLUE;
      ctx.shadowColor = 'rgba(14, 165, 233, 0.4)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Flag border
      ctx.strokeStyle = ALFIE_BLUE_DARK;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Flag text (sail number)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(sailLabel, flagX + FLAG_PADDING_X, flagY + flagHeight / 2);
      ctx.textBaseline = 'alphabetic';

      // Speed indicator below the boat dot
      if (current.speed_mps != null && current.speed_mps > 0) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${(current.speed_mps * 1.94384).toFixed(1)}kts`, bx + flagWidth / 2, by + 14);
      }
    });

    // Wind indicator (top-right)
    if (session?.wind_direction_deg != null) {
      const windRad = (session.wind_direction_deg - 90) * (Math.PI / 180);
      const windCx = CANVAS_SIZE - 45;
      const windCy = 45;

      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.arc(windCx, windCy, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

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

      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WIND', windCx, windCy + 35);
      if (session.wind_speed_knots) {
        ctx.fillText(`${session.wind_speed_knots}kts`, windCx, windCy + 44);
      }
    }

    // Live indicator
    if (session?.is_live) {
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(20, 20, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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

  if (!sessionId && !demoRunning) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 rounded-2xl border bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <Eye className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Session Selected</h3>
          <p className="text-sm text-slate-500 mb-6">Select a race session from the Sessions tab to view live tracking or replay</p>
          <button
            onClick={startDemoRace}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-medium text-sm"
          >
            <Zap className="w-4 h-4" />
            Generate Demo Race (12 IOM Boats)
          </button>
          <p className="text-xs text-slate-600 mt-3">
            Simulates a live race with 12 IOM class boats from LMRYC members
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-4 ${isFullscreen ? 'bg-slate-900 p-4' : ''}`}>
      {/* Controls Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold flex items-center gap-2 text-white">
            {(session?.is_live || demoRunning) && <Radio className="w-4 h-4 text-red-500 animate-pulse" />}
            {session?.name || 'Race Viewer'}
          </h3>
          {(session?.status === 'racing' || demoRunning) && (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium border border-emerald-500/20">
              <Clock className="w-3.5 h-3.5" />
              {formatElapsed(elapsedTime)}
            </span>
          )}
          {demoRunning && (
            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-300 rounded-full text-xs font-medium border border-amber-500/20">
              Demo Mode
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {demoRunning && (
            <button
              onClick={stopDemo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors text-xs font-medium"
            >
              Stop Demo
            </button>
          )}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors text-slate-300"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors text-slate-300"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Main Canvas */}
        <div className="xl:col-span-3">
          <div className="bg-[#0f1729] rounded-2xl overflow-hidden border border-slate-700/50 shadow-lg">
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
          <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2 text-white">
              <Users className="w-4 h-4 text-sky-400" />
              Boats on Course ({positions.size})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Array.from(positions.entries())
                .sort((a, b) => {
                  const aLast = a[1][a[1].length - 1];
                  const bLast = b[1][b[1].length - 1];
                  return (bLast?.position_y || 0) - (aLast?.position_y || 0);
                })
                .map(([tagId, trail], rank) => {
                  const tag = tags.find(t => t.id === tagId);
                  const latest = trail[trail.length - 1];
                  const speed = latest?.speed_mps ? (latest.speed_mps * 1.94384).toFixed(1) : '--';
                  return (
                    <div key={tagId} className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/50 border border-slate-700/30">
                      <span className="text-xs font-bold text-slate-500 w-4">{rank + 1}</span>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag?.color || '#ccc' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-white">
                          {tag?.sail_number || tag?.tag_hardware_id || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {tag?.skipper_name || 'Unassigned'}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-sky-400">
                        {speed}kts
                      </span>
                    </div>
                  );
                })}
              {positions.size === 0 && (
                <p className="text-xs text-center py-4 text-slate-600">
                  Waiting for position data...
                </p>
              )}
            </div>
          </div>

          {/* Race Events Feed */}
          <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
            <h4 className="font-medium text-sm mb-3 text-white">
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
                  start_crossing: 'text-emerald-400',
                  finish_crossing: 'text-sky-400',
                  mark_rounding: 'text-amber-400',
                  ocs: 'text-red-400',
                  recall: 'text-red-400',
                };
                return (
                  <div key={event.id} className="flex items-center gap-2 text-xs p-1.5 rounded-lg bg-slate-900/30">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag?.color || '#ccc' }} />
                    <span className="font-medium text-slate-300">
                      {tag?.sail_number || '?'}
                    </span>
                    <span className={typeColors[event.event_type] || 'text-slate-500'}>
                      {typeLabels[event.event_type] || event.event_type}
                    </span>
                    <span className="ml-auto text-slate-600">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              {raceEvents.length === 0 && (
                <p className="text-xs text-center py-4 text-slate-600">
                  No events yet
                </p>
              )}
            </div>
          </div>

          {/* Wind Info */}
          {session?.wind_speed_knots != null && (
            <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-400" />
                <span className="text-sm text-white">
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
