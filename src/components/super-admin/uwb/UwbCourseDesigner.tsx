import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../utils/supabase';
import { MapPin, Plus, Trash2, Save, RotateCcw, Wind, Anchor as AnchorIcon } from 'lucide-react';

interface UwbAnchor {
  id: string;
  config_id: string;
  anchor_id: string;
  name: string;
  role: string;
  position_x: number;
  position_y: number;
  latitude: number | null;
  longitude: number | null;
  battery_level: number | null;
  last_seen_at: string | null;
  is_active: boolean;
  sort_order: number;
}

interface CourseLayout {
  id: string;
  config_id: string;
  name: string;
  course_type: string;
  marks: { anchor_id: string; rounding: 'port' | 'starboard' }[];
  start_line: { pin_anchor_id: string; boat_anchor_id: string };
  finish_line: { pin_anchor_id: string; boat_anchor_id: string };
  wind_direction_deg: number;
  course_distance_m: number | null;
  is_default: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  mark: '#f59e0b',
  start_pin: '#10b981',
  start_boat: '#10b981',
  finish_pin: '#ef4444',
  finish_boat: '#ef4444',
  gate: '#8b5cf6',
  spreader: '#6366f1',
};

const ROLE_LABELS: Record<string, string> = {
  mark: 'Course Mark',
  start_pin: 'Start Pin End',
  start_boat: 'Start Boat End',
  finish_pin: 'Finish Pin End',
  finish_boat: 'Finish Boat End',
  gate: 'Gate Mark',
  spreader: 'Spreader Mark',
};

const CANVAS_SIZE = 600;
const COURSE_PADDING = 60;

export function UwbCourseDesigner({ configId }: { configId: string }) {
  const [anchors, setAnchors] = useState<UwbAnchor[]>([]);
  const [layouts, setLayouts] = useState<CourseLayout[]>([]);
  const [selectedLayout, setSelectedLayout] = useState<CourseLayout | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<string | null>(null);
  const [windDirection, setWindDirection] = useState(0);
  const [showAddAnchor, setShowAddAnchor] = useState(false);
  const [newAnchor, setNewAnchor] = useState({ anchor_id: '', name: '', role: 'mark' });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    loadAnchors();
    loadLayouts();
  }, [configId]);

  useEffect(() => {
    drawCourse();
  }, [anchors, windDirection, selectedLayout]);

  async function loadAnchors() {
    const { data } = await supabase
      .from('uwb_anchors')
      .select('*')
      .eq('config_id', configId)
      .order('sort_order');
    setAnchors(data || []);
  }

  async function loadLayouts() {
    const { data } = await supabase
      .from('uwb_course_layouts')
      .select('*')
      .eq('config_id', configId)
      .order('created_at', { ascending: false });
    setLayouts(data || []);
    if (data?.length) setSelectedLayout(data[0]);
  }

  async function addAnchor() {
    if (!newAnchor.anchor_id || !newAnchor.name) return;
    const centerOffset = CANVAS_SIZE / 2;
    const { data, error } = await supabase
      .from('uwb_anchors')
      .insert({
        config_id: configId,
        anchor_id: newAnchor.anchor_id,
        name: newAnchor.name,
        role: newAnchor.role,
        position_x: (Math.random() - 0.5) * 80,
        position_y: (Math.random() - 0.5) * 80,
        sort_order: anchors.length,
      })
      .select()
      .single();
    if (!error && data) {
      setAnchors(prev => [...prev, data]);
      setNewAnchor({ anchor_id: '', name: '', role: 'mark' });
      setShowAddAnchor(false);
    }
  }

  async function deleteAnchor(id: string) {
    const { error } = await supabase.from('uwb_anchors').delete().eq('id', id);
    if (!error) setAnchors(prev => prev.filter(a => a.id !== id));
  }

  async function updateAnchorPosition(id: string, x: number, y: number) {
    await supabase.from('uwb_anchors').update({ position_x: x, position_y: y }).eq('id', id);
    setAnchors(prev => prev.map(a => a.id === id ? { ...a, position_x: x, position_y: y } : a));
  }

  async function saveLayout() {
    const startAnchors = anchors.filter(a => a.role === 'start_pin' || a.role === 'start_boat');
    const finishAnchors = anchors.filter(a => a.role === 'finish_pin' || a.role === 'finish_boat');
    const markAnchors = anchors.filter(a => a.role === 'mark' || a.role === 'gate' || a.role === 'spreader');

    const layout = {
      config_id: configId,
      name: `Course Layout ${layouts.length + 1}`,
      course_type: 'custom' as const,
      marks: markAnchors.map(a => ({ anchor_id: a.id, rounding: 'port' as const })),
      start_line: {
        pin_anchor_id: startAnchors.find(a => a.role === 'start_pin')?.id || '',
        boat_anchor_id: startAnchors.find(a => a.role === 'start_boat')?.id || '',
      },
      finish_line: {
        pin_anchor_id: finishAnchors.find(a => a.role === 'finish_pin')?.id || '',
        boat_anchor_id: finishAnchors.find(a => a.role === 'finish_boat')?.id || '',
      },
      wind_direction_deg: windDirection,
      is_default: layouts.length === 0,
    };

    const { data, error } = await supabase
      .from('uwb_course_layouts')
      .insert(layout)
      .select()
      .single();

    if (!error && data) {
      setLayouts(prev => [data, ...prev]);
      setSelectedLayout(data);
    }
  }

  function worldToCanvas(x: number, y: number): [number, number] {
    const scale = (CANVAS_SIZE - COURSE_PADDING * 2) / 120;
    const cx = CANVAS_SIZE / 2 + x * scale;
    const cy = CANVAS_SIZE / 2 - y * scale;
    return [cx, cy];
  }

  function canvasToWorld(cx: number, cy: number): [number, number] {
    const scale = (CANVAS_SIZE - COURSE_PADDING * 2) / 120;
    const x = (cx - CANVAS_SIZE / 2) / scale;
    const y = -(cy - CANVAS_SIZE / 2) / scale;
    return [x, y];
  }

  function drawCourse() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#f0f9ff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid
    ctx.strokeStyle = '#e0e7ff';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) {
      const pos = COURSE_PADDING + i * ((CANVAS_SIZE - COURSE_PADDING * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(pos, COURSE_PADDING);
      ctx.lineTo(pos, CANVAS_SIZE - COURSE_PADDING);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(COURSE_PADDING, pos);
      ctx.lineTo(CANVAS_SIZE - COURSE_PADDING, pos);
      ctx.stroke();
    }

    // Wind arrow
    const windRad = (windDirection - 90) * (Math.PI / 180);
    const windCx = CANVAS_SIZE - 40;
    const windCy = 40;
    ctx.save();
    ctx.translate(windCx, windCy);
    ctx.rotate(windRad);
    ctx.fillStyle = '#0ea5e9';
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(-6, 10);
    ctx.lineTo(6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0ea5e9';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WIND', windCx, windCy + 25);

    // Draw start/finish lines
    const startAnchors = anchors.filter(a => a.role === 'start_pin' || a.role === 'start_boat');
    if (startAnchors.length === 2) {
      const [x1, y1] = worldToCanvas(startAnchors[0].position_x, startAnchors[0].position_y);
      const [x2, y2] = worldToCanvas(startAnchors[1].position_x, startAnchors[1].position_y);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const finishAnchors = anchors.filter(a => a.role === 'finish_pin' || a.role === 'finish_boat');
    if (finishAnchors.length === 2) {
      const [x1, y1] = worldToCanvas(finishAnchors[0].position_x, finishAnchors[0].position_y);
      const [x2, y2] = worldToCanvas(finishAnchors[1].position_x, finishAnchors[1].position_y);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw anchors/marks
    anchors.forEach(anchor => {
      const [cx, cy] = worldToCanvas(anchor.position_x, anchor.position_y);
      const color = ROLE_COLORS[anchor.role] || '#6b7280';

      // Buoy shape
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();

      // White inner
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anchor.name, cx, cy + 22);
    });

    // Scale bar
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    const scaleBarWidth = (CANVAS_SIZE - COURSE_PADDING * 2) / 6;
    ctx.fillRect(COURSE_PADDING, CANVAS_SIZE - 30, scaleBarWidth, 2);
    ctx.fillText('20m', COURSE_PADDING, CANVAS_SIZE - 15);
  }

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    const clicked = anchors.find(anchor => {
      const [ax, ay] = worldToCanvas(anchor.position_x, anchor.position_y);
      return Math.hypot(cx - ax, cy - ay) < 15;
    });

    if (clicked) setDraggingAnchor(clicked.id);
  }, [anchors]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!draggingAnchor) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const [wx, wy] = canvasToWorld(cx, cy);

    setAnchors(prev => prev.map(a =>
      a.id === draggingAnchor ? { ...a, position_x: Math.round(wx * 10) / 10, position_y: Math.round(wy * 10) / 10 } : a
    ));
  }, [draggingAnchor]);

  const handleCanvasMouseUp = useCallback(() => {
    if (draggingAnchor) {
      const anchor = anchors.find(a => a.id === draggingAnchor);
      if (anchor) updateAnchorPosition(anchor.id, anchor.position_x, anchor.position_y);
      setDraggingAnchor(null);
    }
  }, [draggingAnchor, anchors]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Canvas */}
      <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-600" />
            Course Layout
          </h3>
          <div className="flex items-center gap-2">
            <Wind className="w-4 h-4 text-sky-500" />
            <input
              type="range"
              min={0}
              max={359}
              value={windDirection}
              onChange={(e) => setWindDirection(parseInt(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-gray-500 w-8">{windDirection}°</span>
          </div>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ width: '100%', maxWidth: CANVAS_SIZE, height: 'auto', aspectRatio: '1', cursor: draggingAnchor ? 'grabbing' : 'grab' }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="rounded-lg border border-gray-100"
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Drag marks to reposition. Green dashed = start line, Red dashed = finish line.
        </p>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Anchors List */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900 text-sm">Anchors / Buoys</h4>
            <button
              onClick={() => setShowAddAnchor(true)}
              className="p-1.5 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {anchors.map(anchor => (
              <div key={anchor.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ROLE_COLORS[anchor.role] }} />
                  <div>
                    <p className="text-xs font-medium text-gray-900">{anchor.name}</p>
                    <p className="text-[10px] text-gray-400">{ROLE_LABELS[anchor.role]} | {anchor.anchor_id}</p>
                  </div>
                </div>
                <button
                  onClick={() => deleteAnchor(anchor.id)}
                  className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {anchors.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No anchors added yet</p>
            )}
          </div>
        </div>

        {/* Save Layout */}
        <button
          onClick={saveLayout}
          disabled={anchors.length < 3}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          Save Course Layout
        </button>

        {/* Saved Layouts */}
        {layouts.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-medium text-gray-900 text-sm mb-3">Saved Layouts</h4>
            <div className="space-y-2">
              {layouts.map(layout => (
                <button
                  key={layout.id}
                  onClick={() => setSelectedLayout(layout)}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                    selectedLayout?.id === layout.id ? 'bg-sky-50 text-sky-700' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <p className="font-medium">{layout.name}</p>
                  <p className="text-gray-400">{layout.course_type} | Wind: {layout.wind_direction_deg}°</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Anchor Modal */}
      {showAddAnchor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Anchor</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hardware ID</label>
                <input
                  type="text"
                  value={newAnchor.anchor_id}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, anchor_id: e.target.value }))}
                  placeholder="e.g. ANCHOR-001"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newAnchor.name}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Windward Mark"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newAnchor.role}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowAddAnchor(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button
                onClick={addAnchor}
                disabled={!newAnchor.anchor_id || !newAnchor.name}
                className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                Add Anchor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
