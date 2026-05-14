import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../../utils/supabase';
import { loadGoogleMaps } from '../../../utils/googleMaps';
import { MapPin, Plus, Trash2, Save, Wind, Navigation, Map as MapIcon, Crosshair, Satellite } from 'lucide-react';

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

interface Venue {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
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
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [viewMode, setViewMode] = useState<'canvas' | 'map'>('map');
  const [mapReady, setMapReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  useEffect(() => {
    loadAnchors();
    loadLayouts();
    loadVenues();
  }, [configId]);

  useEffect(() => {
    if (viewMode === 'canvas') drawCourse();
  }, [anchors, windDirection, selectedLayout, viewMode]);

  useEffect(() => {
    if (viewMode === 'map' && selectedVenue?.latitude && selectedVenue?.longitude) {
      initMap();
    }
  }, [viewMode, selectedVenue]);

  useEffect(() => {
    if (mapReady && googleMapRef.current) {
      syncMarkersToMap();
    }
  }, [anchors, mapReady]);

  async function loadVenues() {
    const { data: configData } = await supabase
      .from('uwb_tracking_configs')
      .select('club_id')
      .eq('id', configId)
      .maybeSingle();
    if (!configData) return;

    const { data: clubVenues } = await supabase
      .from('club_venues')
      .select('venue_id, is_primary, venues(id, name, latitude, longitude, address, is_default)')
      .eq('club_id', configData.club_id);

    if (clubVenues) {
      const mapped: Venue[] = clubVenues
        .filter(cv => cv.venues)
        .map(cv => {
          const v = cv.venues as any;
          return {
            id: v.id,
            name: v.name,
            latitude: v.latitude,
            longitude: v.longitude,
            address: v.address,
            is_default: cv.is_primary || v.is_default,
          };
        });
      setVenues(mapped);
      const defaultVenue = mapped.find(v => v.is_default) || mapped[0];
      if (defaultVenue) setSelectedVenue(defaultVenue);
    }
  }

  function initMap() {
    if (!mapRef.current || !selectedVenue?.latitude || !selectedVenue?.longitude) return;

    loadGoogleMaps(() => {
      if (!mapRef.current || !window.google) return;

      const center = { lat: selectedVenue.latitude!, lng: selectedVenue.longitude! };
      const map = new google.maps.Map(mapRef.current, {
        center,
        zoom: 18,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
          position: google.maps.ControlPosition.TOP_RIGHT,
        },
        gestureHandling: 'greedy',
        styles: [
          { elementType: 'labels', stylers: [{ visibility: 'on' }] },
        ],
      });

      googleMapRef.current = map;
      setMapReady(true);

      // Click to place marks
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        // Show the add anchor modal pre-filled with GPS coordinates
        const lat = e.latLng.lat();
        const lng = e.latLng.lng();
        const [x, y] = gpsToLocal(lat, lng);
        setNewAnchor(prev => ({ ...prev, anchor_id: '', name: '' }));
        setShowAddAnchor(true);
        // Store the GPS position temporarily
        (window as any).__uwb_new_anchor_gps = { lat, lng, x, y };
      });

      syncMarkersToMap();
    });
  }

  function gpsToLocal(lat: number, lng: number): [number, number] {
    if (!selectedVenue?.latitude || !selectedVenue?.longitude) return [0, 0];
    const dLat = lat - selectedVenue.latitude;
    const dLng = lng - selectedVenue.longitude;
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos(selectedVenue.latitude * Math.PI / 180);
    return [dLng * mPerDegLng, dLat * mPerDegLat];
  }

  function localToGps(x: number, y: number): { lat: number; lng: number } | null {
    if (!selectedVenue?.latitude || !selectedVenue?.longitude) return null;
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos(selectedVenue.latitude * Math.PI / 180);
    return {
      lat: selectedVenue.latitude + y / mPerDegLat,
      lng: selectedVenue.longitude + x / mPerDegLng,
    };
  }

  function syncMarkersToMap() {
    if (!googleMapRef.current || !window.google) return;

    // Remove old markers not in anchors
    markersRef.current.forEach((marker, id) => {
      if (!anchors.find(a => a.id === id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    });

    // Update or create markers for anchors
    anchors.forEach(anchor => {
      const gps = anchor.latitude && anchor.longitude
        ? { lat: anchor.latitude, lng: anchor.longitude }
        : localToGps(anchor.position_x, anchor.position_y);

      if (!gps) return;

      const existing = markersRef.current.get(anchor.id);
      if (existing) {
        existing.setPosition(gps);
      } else {
        const color = ROLE_COLORS[anchor.role] || '#6b7280';
        const marker = new google.maps.Marker({
          position: gps,
          map: googleMapRef.current!,
          title: anchor.name,
          label: {
            text: anchor.name.slice(0, 3).toUpperCase(),
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 'bold',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 10,
          },
          draggable: true,
        });

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (!pos) return;
          const [newX, newY] = gpsToLocal(pos.lat(), pos.lng());
          updateAnchorPosition(anchor.id, newX, newY, pos.lat(), pos.lng());
        });

        markersRef.current.set(anchor.id, marker);
      }
    });

    // Draw lines between start/finish marks
    // (handled via polylines if needed)
  }

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

    const gpsData = (window as any).__uwb_new_anchor_gps;
    const posX = gpsData?.x ?? (Math.random() - 0.5) * 80;
    const posY = gpsData?.y ?? (Math.random() - 0.5) * 80;
    const lat = gpsData?.lat ?? null;
    const lng = gpsData?.lng ?? null;

    const { data, error } = await supabase
      .from('uwb_anchors')
      .insert({
        config_id: configId,
        anchor_id: newAnchor.anchor_id,
        name: newAnchor.name,
        role: newAnchor.role,
        position_x: posX,
        position_y: posY,
        latitude: lat,
        longitude: lng,
        sort_order: anchors.length,
      })
      .select()
      .single();
    if (!error && data) {
      setAnchors(prev => [...prev, data]);
      setNewAnchor({ anchor_id: '', name: '', role: 'mark' });
      setShowAddAnchor(false);
      (window as any).__uwb_new_anchor_gps = null;
    }
  }

  async function deleteAnchor(id: string) {
    const { error } = await supabase.from('uwb_anchors').delete().eq('id', id);
    if (!error) {
      setAnchors(prev => prev.filter(a => a.id !== id));
      const marker = markersRef.current.get(id);
      if (marker) {
        marker.setMap(null);
        markersRef.current.delete(id);
      }
    }
  }

  async function updateAnchorPosition(id: string, x: number, y: number, lat?: number, lng?: number) {
    const updateData: any = { position_x: x, position_y: y };
    if (lat !== undefined) updateData.latitude = lat;
    if (lng !== undefined) updateData.longitude = lng;
    await supabase.from('uwb_anchors').update(updateData).eq('id', id);
    setAnchors(prev => prev.map(a => a.id === id ? { ...a, position_x: x, position_y: y, latitude: lat ?? a.latitude, longitude: lng ?? a.longitude } : a));
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

  function detectGpsMarks() {
    // Check for anchors that have reported GPS coordinates recently
    anchors.forEach(anchor => {
      if (anchor.latitude && anchor.longitude && googleMapRef.current) {
        const gps = { lat: anchor.latitude, lng: anchor.longitude };
        googleMapRef.current.panTo(gps);
      }
    });
  }

  // Canvas drawing functions for fallback view
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

    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid
    ctx.strokeStyle = '#1e293b';
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

    // Start line
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

    // Finish line
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

    // Anchors/marks
    anchors.forEach(anchor => {
      const [cx, cy] = worldToCanvas(anchor.position_x, anchor.position_y);
      const color = ROLE_COLORS[anchor.role] || '#6b7280';

      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#0f1729';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anchor.name, cx, cy + 22);
    });

    // Scale bar
    ctx.fillStyle = '#475569';
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

  const hasGpsAnchors = anchors.some(a => a.latitude && a.longitude);

  return (
    <div className="space-y-4">
      {/* Venue Selector */}
      <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Navigation className="w-5 h-5 text-sky-400" />
            <div>
              <h4 className="text-sm font-medium text-white">Venue</h4>
              <p className="text-xs text-slate-500">Course marks will be placed at this location</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasGpsAnchors && (
              <button
                onClick={detectGpsMarks}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/20 transition-colors"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Detect GPS Marks
              </button>
            )}
            <div className="flex rounded-lg border border-slate-700/50 overflow-hidden">
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  viewMode === 'map' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Satellite className="w-3.5 h-3.5" />
                Map
              </button>
              <button
                onClick={() => setViewMode('canvas')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors ${
                  viewMode === 'canvas' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                Schematic
              </button>
            </div>
          </div>
        </div>

        {venues.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {venues.map(venue => (
              <button
                key={venue.id}
                onClick={() => {
                  setSelectedVenue(venue);
                  setMapReady(false);
                  markersRef.current.forEach(m => m.setMap(null));
                  markersRef.current.clear();
                  googleMapRef.current = null;
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  selectedVenue?.id === venue.id
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-900/40 text-slate-400 border border-slate-700/30 hover:border-slate-600'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                {venue.name}
                {venue.is_default && (
                  <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded text-[10px]">Default</span>
                )}
              </button>
            ))}
          </div>
        )}
        {venues.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">No venues configured for this club. Add a venue in Club Settings to enable map-based course design.</p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Canvas / Map */}
        <div className="xl:col-span-2 rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-400" />
              Course Layout
            </h3>
            <div className="flex items-center gap-2">
              <Wind className="w-4 h-4 text-sky-400" />
              <input
                type="range"
                min={0}
                max={359}
                value={windDirection}
                onChange={(e) => setWindDirection(parseInt(e.target.value))}
                className="w-24 accent-sky-500"
              />
              <span className="text-xs text-slate-400 w-8">{windDirection}°</span>
            </div>
          </div>

          {viewMode === 'map' && selectedVenue?.latitude && selectedVenue?.longitude ? (
            <div className="relative">
              <div
                ref={mapRef}
                className="w-full rounded-xl border border-slate-700/50 overflow-hidden"
                style={{ height: '500px' }}
              />
              <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-slate-300 border border-slate-700/50">
                Click on map to place a mark
              </div>
            </div>
          ) : viewMode === 'map' && (!selectedVenue?.latitude || !selectedVenue?.longitude) ? (
            <div className="flex flex-col items-center justify-center h-[500px] rounded-xl border border-slate-700/50 bg-slate-900/30">
              <Satellite className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-sm text-slate-400">No GPS coordinates for this venue</p>
              <p className="text-xs text-slate-600 mt-1">Add latitude/longitude to the venue, or switch to Schematic view</p>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                style={{ width: '100%', maxWidth: CANVAS_SIZE, height: 'auto', aspectRatio: '1', cursor: draggingAnchor ? 'grabbing' : 'grab' }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="rounded-xl border border-slate-700/50"
              />
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">
            {viewMode === 'map'
              ? 'Click the map to place marks. Drag marks to reposition. Marks with GPS will auto-detect positions.'
              : 'Drag marks to reposition. Green dashed = start line, Red dashed = finish line.'}
          </p>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-white text-sm">Anchors / Buoys</h4>
              <button
                onClick={() => {
                  (window as any).__uwb_new_anchor_gps = null;
                  setShowAddAnchor(true);
                }}
                className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {anchors.map(anchor => (
                <div key={anchor.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-700/30">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ROLE_COLORS[anchor.role] }} />
                    <div>
                      <p className="text-xs font-medium text-white">{anchor.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {ROLE_LABELS[anchor.role]}
                        {anchor.latitude ? ' | GPS' : ''} | {anchor.anchor_id}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAnchor(anchor.id)}
                    className="p-1 rounded text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {anchors.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No anchors added yet</p>
              )}
            </div>
          </div>

          <button
            onClick={saveLayout}
            disabled={anchors.length < 3}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Course Layout
          </button>

          {layouts.length > 0 && (
            <div className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
              <h4 className="font-medium text-white text-sm mb-3">Saved Layouts</h4>
              <div className="space-y-2">
                {layouts.map(layout => (
                  <button
                    key={layout.id}
                    onClick={() => setSelectedLayout(layout)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                      selectedLayout?.id === layout.id
                        ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                        : 'bg-slate-900/40 text-slate-300 border border-slate-700/30 hover:border-slate-600'
                    }`}
                  >
                    <p className="font-medium">{layout.name}</p>
                    <p className="text-slate-500">{layout.course_type} | Wind: {layout.wind_direction_deg}°</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Anchor Modal */}
      {showAddAnchor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Add Anchor</h3>
            {(window as any).__uwb_new_anchor_gps && (
              <div className="mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <p className="text-xs text-emerald-300">
                  GPS position captured from map click
                </p>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Hardware ID</label>
                <input
                  type="text"
                  value={newAnchor.anchor_id}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, anchor_id: e.target.value }))}
                  placeholder="e.g. ANCHOR-001"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newAnchor.name}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Windward Mark"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                <select
                  value={newAnchor.role}
                  onChange={(e) => setNewAnchor(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white focus:border-sky-500 outline-none"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => { setShowAddAnchor(false); (window as any).__uwb_new_anchor_gps = null; }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
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
