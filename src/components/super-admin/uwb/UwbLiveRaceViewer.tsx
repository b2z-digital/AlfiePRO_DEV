import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabase';
import { Eye, Play, Pause, Users, Wind, Clock, Maximize2, Minimize2, Zap, MapPin, Calendar, Building2, Anchor, ChevronDown, ChevronUp } from 'lucide-react';

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

const TRAIL_LENGTH = 40;

const BOAT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#10b981', '#f43f5e',
];

const DEMO_SKIPPERS = [
  { name: 'Keith Murray', sail: 'AUS 19', color: BOAT_COLORS[0] },
  { name: 'Craig Bowler', sail: 'AUS 7', color: BOAT_COLORS[1] },
  { name: 'Andrew Hurst', sail: 'AUS 77', color: BOAT_COLORS[4] },
  { name: 'Brian Lewis', sail: 'AUS 5', color: BOAT_COLORS[5] },
  { name: 'Peter McNamara', sail: 'AUS 23', color: BOAT_COLORS[3] },
  { name: 'Stephen Walsh', sail: 'AUS 1', color: BOAT_COLORS[2] },
  { name: 'Greg Richards', sail: 'AUS 56', color: BOAT_COLORS[6] },
  { name: 'Phil Skewes', sail: 'AUS 88', color: BOAT_COLORS[7] },
  { name: 'John Robinson', sail: 'AUS 91', color: BOAT_COLORS[8] },
  { name: 'Ross Campbell', sail: 'AUS 33', color: BOAT_COLORS[9] },
  { name: 'David Craven', sail: 'AUS 12', color: BOAT_COLORS[10] },
  { name: 'Mark Thompson', sail: 'AUS 45', color: BOAT_COLORS[11] },
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
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [selectedBoat, setSelectedBoat] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<number>(0);
  const demoTickRef = useRef<number>(0);
  const canvasSizeRef = useRef({ width: 800, height: 600 });

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
  }, [isPlaying, positions, anchors, tags, session, selectedBoat]);

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

  useEffect(() => {
    function handleResize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;
      canvasSizeRef.current = { width: container.clientWidth, height: container.clientHeight };
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

    const courseAnchors: AnchorInfo[] = anchors.length > 0 ? anchors : [
      { id: 'start_pin', name: 'Start Pin', role: 'start_pin', position_x: -20, position_y: -30 },
      { id: 'start_boat', name: 'Start Boat', role: 'start_boat', position_x: 20, position_y: -30 },
      { id: 'windward', name: 'Windward Mark', role: 'course_mark', position_x: 0, position_y: 40 },
      { id: 'leeward_port', name: 'Leeward Port', role: 'course_mark', position_x: -15, position_y: -20 },
      { id: 'leeward_stbd', name: 'Leeward Stbd', role: 'course_mark', position_x: 15, position_y: -20 },
      { id: 'finish_pin', name: 'Finish Pin', role: 'finish_pin', position_x: -18, position_y: -35 },
      { id: 'finish_boat', name: 'Finish Boat', role: 'finish_boat', position_x: 18, position_y: -35 },
    ];

    if (anchors.length === 0) setAnchors(courseAnchors);

    const demoTags: TagInfo[] = DEMO_SKIPPERS.map((s, i) => ({
      id: `demo-tag-${i}`,
      tag_hardware_id: `UWB-${String(i + 1).padStart(3, '0')}`,
      sail_number: s.sail,
      skipper_name: s.name,
      color: s.color,
      boat_class: 'IOM',
    }));
    setTags(demoTags);

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

    const marks = courseAnchors.filter(a => a.role === 'course_mark');
    const startLine = courseAnchors.filter(a => a.role.includes('start'));
    const startMidX = startLine.length === 2 ? (startLine[0].position_x + startLine[1].position_x) / 2 : 0;
    const startMidY = startLine.length === 2 ? (startLine[0].position_y + startLine[1].position_y) / 2 : -30;

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

    const boatStates = demoTags.map((_, i) => ({
      progress: 0,
      segmentIndex: 0,
      speed: 0.4 + Math.random() * 0.25 + (i === 0 ? 0.08 : 0),
      lateralOffset: (Math.random() - 0.5) * 8,
      wobble: Math.random() * Math.PI * 2,
    }));

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

          state.progress += state.speed * (0.8 + Math.random() * 0.4);
          state.wobble += 0.1;

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

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const segLen = Math.sqrt(dx * dx + dy * dy) || 1;
          const perpX = -dy / segLen;
          const perpY = dx / segLen;
          const wobbleOffset = Math.sin(state.wobble) * 1.5;

          const x = baseX + perpX * (state.lateralOffset + wobbleOffset);
          const y = baseY + perpY * (state.lateralOffset + wobbleOffset);

          const heading = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI) + 90 + Math.sin(state.wobble) * 5;
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

          if (tick % 20 === 0 && Math.random() < 0.3) {
            demoEvents.push({
              id: `demo-event-${eventCounter++}`,
              tag_id: tagId,
              event_type: 'mark_rounding',
              timestamp: new Date().toISOString(),
              lap_number: Math.floor(state.segmentIndex / 2) + 1,
              metadata: {},
            });
          }
        });

        return next;
      });

      if (demoEvents.length > 0) {
        setRaceEvents(prev => [...prev, ...demoEvents.splice(0)].slice(-50));
      }

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
    const pad = 15;
    return {
      minX: Math.min(...allX) - pad,
      maxX: Math.max(...allX) + pad,
      minY: Math.min(...allY) - pad,
      maxY: Math.max(...allY) + pad,
    };
  }

  function worldToCanvas(x: number, y: number, bounds: ReturnType<typeof getCourseBounds>, w: number, h: number): [number, number] {
    const padding = 60;
    const rangeX = bounds.maxX - bounds.minX || 1;
    const rangeY = bounds.maxY - bounds.minY || 1;
    const scale = Math.min((w - padding * 2) / rangeX, (h - padding * 2) / rangeY);
    const offsetX = (w - rangeX * scale) / 2;
    const offsetY = (h - rangeY * scale) / 2;
    const cx = offsetX + (x - bounds.minX) * scale;
    const cy = h - offsetY - (y - bounds.minY) * scale;
    return [cx, cy];
  }

  function drawRaceView() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    const bounds = getCourseBounds();

    // Water background - rich ocean blue gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#1a3a4a');
    bgGrad.addColorStop(0.5, '#1e4050');
    bgGrad.addColorStop(1, '#162d3a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle water texture
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#5eead4';
    ctx.lineWidth = 0.5;
    const time = Date.now() * 0.0003;
    for (let row = 0; row < h; row += 28) {
      ctx.beginPath();
      for (let col = 0; col < w; col += 4) {
        const yOff = Math.sin((col * 0.008) + time + row * 0.1) * 3;
        if (col === 0) ctx.moveTo(col, row + yOff);
        else ctx.lineTo(col, row + yOff);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // Draw course boundary lines (connecting marks)
    const courseMarks = anchors.filter(a => a.role === 'course_mark');
    if (courseMarks.length >= 2) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      courseMarks.forEach((mark, i) => {
        if (i === 0) return;
        const [x1, y1] = worldToCanvas(courseMarks[i - 1].position_x, courseMarks[i - 1].position_y, bounds, w, h);
        const [x2, y2] = worldToCanvas(mark.position_x, mark.position_y, bounds, w, h);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Draw start/finish lines
    const startPins = anchors.filter(a => a.role === 'start_pin' || a.role === 'start_boat');
    if (startPins.length === 2) {
      const [x1, y1] = worldToCanvas(startPins[0].position_x, startPins[0].position_y, bounds, w, h);
      const [x2, y2] = worldToCanvas(startPins[1].position_x, startPins[1].position_y, bounds, w, h);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start label
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', (x1 + x2) / 2, Math.min(y1, y2) - 12);
    }

    const finishPins = anchors.filter(a => a.role === 'finish_pin' || a.role === 'finish_boat');
    if (finishPins.length === 2) {
      const [x1, y1] = worldToCanvas(finishPins[0].position_x, finishPins[0].position_y, bounds, w, h);
      const [x2, y2] = worldToCanvas(finishPins[1].position_x, finishPins[1].position_y, bounds, w, h);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', (x1 + x2) / 2, Math.max(y1, y2) + 18);
    }

    // Draw marks/anchors
    anchors.forEach(anchor => {
      const [cx, cy] = worldToCanvas(anchor.position_x, anchor.position_y, bounds, w, h);

      const markColor = anchor.role.includes('start') ? '#22c55e' :
                        anchor.role.includes('finish') ? '#ef4444' : '#f59e0b';

      // Outer glow ring
      ctx.strokeStyle = markColor + '40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Mark circle
      ctx.fillStyle = markColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();

      // White ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Name label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anchor.name, cx, cy + 22);
    });

    // Draw boat trails with gradient opacity
    positions.forEach((trail, tagId) => {
      const tag = tags.find(t => t.id === tagId);
      const color = tag?.color || '#ffffff';
      const isSelected = selectedBoat === tagId;
      const isHighlighted = !selectedBoat || isSelected;

      if (trail.length > 1) {
        const opacity = isHighlighted ? 0.8 : 0.15;
        const lineWidth = isSelected ? 3.5 : (isHighlighted ? 2.5 : 1);

        for (let i = 1; i < trail.length; i++) {
          const segmentAlpha = (i / trail.length) * opacity;
          ctx.strokeStyle = color + Math.round(segmentAlpha * 255).toString(16).padStart(2, '0');
          ctx.lineWidth = lineWidth * (0.3 + (i / trail.length) * 0.7);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const [px1, py1] = worldToCanvas(trail[i - 1].position_x, trail[i - 1].position_y, bounds, w, h);
          const [px2, py2] = worldToCanvas(trail[i].position_x, trail[i].position_y, bounds, w, h);
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
        }
      }

      // Current position
      const current = trail[trail.length - 1];
      if (!current) return;
      const [bx, by] = worldToCanvas(current.position_x, current.position_y, bounds, w, h);
      const baseOpacity = isHighlighted ? 1 : 0.3;

      // Boat marker - filled circle with border
      ctx.globalAlpha = baseOpacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, isSelected ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Heading indicator
      if (current.heading_deg != null) {
        const headRad = (current.heading_deg - 90) * (Math.PI / 180);
        const arrowLen = isSelected ? 14 : 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(headRad) * arrowLen, by + Math.sin(headRad) * arrowLen);
        ctx.stroke();
      }

      // Sail number label
      if (isHighlighted) {
        const sailLabel = tag?.sail_number || tag?.tag_hardware_id?.slice(-3) || '?';
        ctx.font = `bold ${isSelected ? '12' : '11'}px -apple-system, BlinkMacSystemFont, sans-serif`;
        const textW = ctx.measureText(sailLabel).width;
        const labelX = bx - textW / 2 - 4;
        const labelY = by - (isSelected ? 20 : 16);
        const labelW = textW + 8;
        const labelH = isSelected ? 18 : 16;

        // Label background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        const r = 3;
        ctx.moveTo(labelX + r, labelY);
        ctx.lineTo(labelX + labelW - r, labelY);
        ctx.arcTo(labelX + labelW, labelY, labelX + labelW, labelY + r, r);
        ctx.lineTo(labelX + labelW, labelY + labelH - r);
        ctx.arcTo(labelX + labelW, labelY + labelH, labelX + labelW - r, labelY + labelH, r);
        ctx.lineTo(labelX + r, labelY + labelH);
        ctx.arcTo(labelX, labelY + labelH, labelX, labelY + labelH - r, r);
        ctx.lineTo(labelX, labelY + r);
        ctx.arcTo(labelX, labelY, labelX + r, labelY, r);
        ctx.closePath();
        ctx.fill();

        // Label border accent
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sailLabel, bx, labelY + labelH / 2);
        ctx.textBaseline = 'alphabetic';

        // Speed below
        if (current.speed_mps != null && current.speed_mps > 0) {
          const speedText = `${(current.speed_mps * 1.94384).toFixed(1)}kts`;
          ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
          ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(speedText, bx, by + 16);
        }
      }

      ctx.globalAlpha = 1.0;
    });

    // Wind indicator (top-right corner)
    if (session?.wind_direction_deg != null) {
      const windRad = (session.wind_direction_deg - 90) * (Math.PI / 180);
      const windCx = w - 50;
      const windCy = 50;

      // Background circle
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(windCx, windCy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Wind arrow
      ctx.save();
      ctx.translate(windCx, windCy);
      ctx.rotate(windRad);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-6, 10);
      ctx.lineTo(0, 6);
      ctx.lineTo(6, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Wind text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WIND', windCx, windCy + 38);
      if (session.wind_speed_knots) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(`${session.wind_speed_knots}kts`, windCx, windCy + 50);
      }
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

  const sortedBoats = Array.from(positions.entries())
    .sort((a, b) => {
      const aLast = a[1][a[1].length - 1];
      const bLast = b[1][b[1].length - 1];
      return (bLast?.position_y || 0) - (aLast?.position_y || 0);
    });

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
            Launch Demo Race
          </button>
          <p className="text-xs text-slate-600 mt-3">
            Simulates a live race with 12 IOM class boats
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${isFullscreen ? 'bg-[#0d1b2a] fixed inset-0 z-50 p-0' : ''}`}>
      {/* Main Layout */}
      <div className={`flex ${isFullscreen ? 'h-full' : 'h-[calc(100vh-280px)] min-h-[500px]'}`}>
        {/* Left Info Panel */}
        {showInfoPanel && (
          <div className="w-72 flex-shrink-0 bg-[#0f1f2e] border-r border-slate-700/40 flex flex-col overflow-hidden rounded-l-xl">
            {/* Race Info Header */}
            <div className="p-4 border-b border-slate-700/40">
              <div className="flex items-center gap-2 mb-3">
                {(session?.is_live || demoRunning) && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px] font-bold uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
                {demoRunning && (
                  <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-[10px] font-medium">
                    Demo
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-white text-sm leading-tight mb-3">
                {session?.name || 'Race Viewer'}
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span>Lake Macquarie, NSW</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>LMRYC</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Anchor className="w-3.5 h-3.5 text-slate-500" />
                  <span>{positions.size} Competitors</span>
                </div>
              </div>
            </div>

            {/* Competitor List */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
                  Competitor Positions
                </h4>
                <div className="space-y-1">
                  {sortedBoats.map(([tagId, trail], rank) => {
                    const tag = tags.find(t => t.id === tagId);
                    const latest = trail[trail.length - 1];
                    const speed = latest?.speed_mps ? (latest.speed_mps * 1.94384).toFixed(1) : '--';
                    const isActive = selectedBoat === tagId;
                    return (
                      <button
                        key={tagId}
                        onClick={() => setSelectedBoat(isActive ? null : tagId)}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-left ${
                          isActive
                            ? 'bg-sky-500/10 border border-sky-500/30'
                            : 'hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        <span className="text-[10px] font-bold text-slate-500 w-4 text-center">{rank + 1}</span>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag?.color || '#ccc' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-white">
                            {tag?.sail_number || tag?.tag_hardware_id || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {tag?.skipper_name || 'Unassigned'}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono font-medium text-emerald-400">
                          {speed}kts
                        </span>
                      </button>
                    );
                  })}
                  {positions.size === 0 && (
                    <p className="text-xs text-center py-6 text-slate-600">
                      Waiting for position data...
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Wind info at bottom of panel */}
            {session?.wind_speed_knots != null && (
              <div className="p-3 border-t border-slate-700/40">
                <div className="flex items-center gap-2 px-2">
                  <Wind className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-medium text-white">
                    {session.wind_speed_knots}kts @ {session.wind_direction_deg}&deg;
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#0d1b2a] border-b border-slate-700/40">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowInfoPanel(!showInfoPanel)}
                className="p-1.5 rounded-md hover:bg-slate-800/60 transition-colors text-slate-400"
                title={showInfoPanel ? 'Hide panel' : 'Show panel'}
              >
                {showInfoPanel ? <ChevronDown className="w-4 h-4 rotate-90" /> : <ChevronUp className="w-4 h-4 rotate-90" />}
              </button>
              {(session?.status === 'racing' || demoRunning) && (
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-sm font-mono text-white">{formatElapsed(elapsedTime)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {demoRunning && (
                <button
                  onClick={stopDemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors text-xs font-medium"
                >
                  Stop Demo
                </button>
              )}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 rounded-md bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors text-slate-300"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-md bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-colors text-slate-300"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 relative bg-[#0d1b2a]">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
            />

            {/* LIVE Badge Overlay */}
            {(session?.is_live || demoRunning) && (
              <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 bg-red-600/90 rounded text-white text-xs font-bold">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                LIVE
              </div>
            )}
          </div>

          {/* Bottom Timeline Bar */}
          <div className="px-4 py-2.5 bg-[#0d1b2a] border-t border-slate-700/40">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-500">{formatElapsed(elapsedTime)}</span>
              <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${Math.min((elapsedTime / 300) * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500">
                <Users className="w-3 h-3 inline mr-1" />
                {positions.size}
              </span>
            </div>
          </div>
        </div>

        {/* Right Events Panel (visible in fullscreen or wide screens) */}
        {isFullscreen && raceEvents.length > 0 && (
          <div className="w-64 flex-shrink-0 bg-[#0f1f2e] border-l border-slate-700/40 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-700/40">
              <h4 className="text-xs font-semibold text-white">Race Events</h4>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {raceEvents.slice(-15).reverse().map(event => {
                const tag = tags.find(t => t.id === event.tag_id);
                const typeLabels: Record<string, string> = {
                  start_crossing: 'Started',
                  finish_crossing: 'Finished',
                  mark_rounding: 'Mark Rounded',
                  ocs: 'OCS',
                  recall: 'Recall',
                };
                return (
                  <div key={event.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-slate-900/40">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag?.color || '#ccc' }} />
                    <span className="font-medium text-slate-300">{tag?.sail_number || '?'}</span>
                    <span className="text-slate-500">{typeLabels[event.event_type] || event.event_type}</span>
                    <span className="ml-auto text-slate-600 text-[10px]">
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
