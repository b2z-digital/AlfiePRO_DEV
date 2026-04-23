import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Check, Undo2, Trash2 } from 'lucide-react';

type Tool = 'pen' | 'line' | 'arrow' | 'boat' | 'mark' | 'wind' | 'eraser';

interface Point {
  x: number;
  y: number;
}

interface FreehandPath {
  id: string;
  type: 'pen';
  points: Point[];
  color: string;
  width: number;
}

interface LineElement {
  id: string;
  type: 'line' | 'arrow';
  x: number;
  y: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

interface StampElement {
  id: string;
  type: 'boat' | 'mark';
  x: number;
  y: number;
  label: string;
  color: string;
  borderColor?: string;
  textColor?: string;
}

interface WindElement {
  id: string;
  type: 'wind';
  x: number;
  y: number;
  x2: number;
  y2: number;
}

export type CanvasElement = FreehandPath | LineElement | StampElement | WindElement;

const BOAT_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const BOAT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const MARK_FILLS = ['#FFFFFF', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#06B6D4', '#8B5CF6'];
const MARK_BORDERS = ['#94A3B8', '#DC2626', '#D97706', '#059669', '#2563EB', '#DB2777', '#0891B2', '#7C3AED'];

const PEN_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#FFFFFF'];
const PEN_WIDTHS = [2, 4, 6];

function getMarkColors(markNumber: number) {
  const pairIndex = Math.floor((markNumber - 1) / 2) % MARK_FILLS.length;
  const fill = MARK_FILLS[pairIndex];
  const border = MARK_BORDERS[pairIndex];
  const textColor = (fill === '#FFFFFF' || fill === '#F59E0B') ? '#0F172A' : '#FFFFFF';
  return { fill, border, textColor };
}

interface RaceScenarioCanvasProps {
  onSave: (imageData: string, elements: CanvasElement[]) => void;
  onClose: () => void;
  darkMode?: boolean;
  courseMode?: boolean;
}

export const RaceScenarioCanvas: React.FC<RaceScenarioCanvasProps> = ({
  onSave,
  onClose,
  courseMode = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>(courseMode ? 'mark' : 'pen');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [boatCount, setBoatCount] = useState(0);
  const [markCount, setMarkCount] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 });
  const [penColor, setPenColor] = useState('#3B82F6');
  const [penWidth, setPenWidth] = useState(4);
  const [showPenOptions, setShowPenOptions] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.min(rect.width - 4, 800);
        const h = Math.min(window.innerHeight * 0.55, 600);
        setCanvasSize({ width: w, height: Math.max(h, 300) });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const pushHistory = useCallback((newElements: CanvasElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newElements]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prev = [...history[newIndex]];
      setElements(prev);
      setBoatCount(prev.filter(e => e.type === 'boat').length);
      setMarkCount(prev.filter(e => e.type === 'mark').length);
    }
  }, [historyIndex, history]);

  const clearAll = useCallback(() => {
    setElements([]);
    setBoatCount(0);
    setMarkCount(0);
    pushHistory([]);
  }, [pushHistory]);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e);

    if (activeTool === 'boat') {
      const color = BOAT_COLORS[boatCount % BOAT_COLORS.length];
      const label = BOAT_LABELS[boatCount % BOAT_LABELS.length];
      const newEl: StampElement = {
        id: crypto.randomUUID(),
        type: 'boat',
        x: pos.x,
        y: pos.y,
        label,
        color,
      };
      const newElements = [...elements, newEl];
      setElements(newElements);
      setBoatCount(boatCount + 1);
      pushHistory(newElements);
    } else if (activeTool === 'mark') {
      const num = markCount + 1;
      const { fill, border, textColor } = getMarkColors(num);
      const newEl: StampElement = {
        id: crypto.randomUUID(),
        type: 'mark',
        x: pos.x,
        y: pos.y,
        label: String(num),
        color: fill,
        borderColor: border,
        textColor,
      };
      const newElements = [...elements, newEl];
      setElements(newElements);
      setMarkCount(num);
      pushHistory(newElements);
    } else if (activeTool === 'pen') {
      setIsDrawing(true);
      setCurrentPath([pos]);
    } else if (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'wind') {
      setIsDrawing(true);
      setDrawStart(pos);
    } else if (activeTool === 'eraser') {
      const hitRadius = 25;
      const filtered = elements.filter(el => {
        if (el.type === 'pen') {
          return !(el as FreehandPath).points.some(p => {
            const dx = p.x - pos.x;
            const dy = p.y - pos.y;
            return Math.sqrt(dx * dx + dy * dy) < hitRadius;
          });
        }
        if (el.type === 'line' || el.type === 'arrow') {
          const le = el as LineElement;
          const mx = (le.x + le.x2) / 2;
          const my = (le.y + le.y2) / 2;
          return Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2) > hitRadius;
        }
        if (el.type === 'wind') {
          const we = el as WindElement;
          const mx = (we.x + we.x2) / 2;
          const my = (we.y + we.y2) / 2;
          return Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2) > hitRadius;
        }
        const se = el as StampElement;
        return Math.sqrt((se.x - pos.x) ** 2 + (se.y - pos.y) ** 2) > hitRadius;
      });
      if (filtered.length !== elements.length) {
        setElements(filtered);
        setBoatCount(filtered.filter(e => e.type === 'boat').length);
        setMarkCount(filtered.filter(e => e.type === 'mark').length);
        pushHistory(filtered);
      }
    }
  }, [activeTool, elements, boatCount, markCount, getCanvasPos, pushHistory]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCanvasPos(e);

    if (activeTool === 'pen') {
      setCurrentPath(prev => [...prev, pos]);
      drawCanvas(elements, undefined, [...currentPath, pos]);
    } else if (drawStart) {
      drawCanvas(elements, pos);
    }
  }, [isDrawing, drawStart, elements, currentPath, activeTool, getCanvasPos]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    if (activeTool === 'pen' && currentPath.length > 1) {
      const newEl: FreehandPath = {
        id: crypto.randomUUID(),
        type: 'pen',
        points: [...currentPath, getCanvasPos(e)],
        color: penColor,
        width: penWidth,
      };
      const newElements = [...elements, newEl];
      setElements(newElements);
      pushHistory(newElements);
    } else if ((activeTool === 'line' || activeTool === 'arrow' || activeTool === 'wind') && drawStart) {
      const pos = getCanvasPos(e);
      const dx = pos.x - drawStart.x;
      const dy = pos.y - drawStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 10) {
        if (activeTool === 'wind') {
          const newEl: WindElement = {
            id: crypto.randomUUID(),
            type: 'wind',
            x: drawStart.x,
            y: drawStart.y,
            x2: pos.x,
            y2: pos.y,
          };
          const newElements = [...elements, newEl];
          setElements(newElements);
          pushHistory(newElements);
        } else {
          const newEl: LineElement = {
            id: crypto.randomUUID(),
            type: activeTool,
            x: drawStart.x,
            y: drawStart.y,
            x2: pos.x,
            y2: pos.y,
            color: penColor,
            width: penWidth,
          };
          const newElements = [...elements, newEl];
          setElements(newElements);
          pushHistory(newElements);
        }
      }
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentPath([]);
  }, [isDrawing, activeTool, drawStart, currentPath, elements, penColor, penWidth, getCanvasPos, pushHistory]);

  const drawCanvas = useCallback((els: CanvasElement[], tempEnd?: Point, tempPath?: Point[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F1E33';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(14,165,233,0.04)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(14,165,233,0.06)';
    ctx.lineWidth = 0.5 * dpr;
    const gridSize = 30 * dpr;
    for (let x = gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    for (const el of els) {
      drawElement(ctx, el, dpr);
    }

    if (tempPath && tempPath.length > 1) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penWidth * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(tempPath[0].x, tempPath[0].y);
      for (let i = 1; i < tempPath.length; i++) {
        ctx.lineTo(tempPath[i].x, tempPath[i].y);
      }
      ctx.stroke();
    }

    if (isDrawing && drawStart && tempEnd && activeTool !== 'pen') {
      ctx.globalAlpha = 0.6;
      if (activeTool === 'wind') {
        drawWindElement(ctx, drawStart.x, drawStart.y, tempEnd.x, tempEnd.y, dpr);
      } else if (activeTool === 'arrow') {
        drawLineArrow(ctx, drawStart.x, drawStart.y, tempEnd.x, tempEnd.y, penColor, penWidth, true, dpr);
      } else {
        drawLineArrow(ctx, drawStart.x, drawStart.y, tempEnd.x, tempEnd.y, penColor, penWidth, false, dpr);
      }
      ctx.globalAlpha = 1;
    }
  }, [isDrawing, drawStart, activeTool, penColor, penWidth]);

  const drawElement = (ctx: CanvasRenderingContext2D, el: CanvasElement, dpr: number) => {
    if (el.type === 'pen') {
      const path = el as FreehandPath;
      if (path.points.length < 2) return;
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    } else if (el.type === 'boat') {
      const boat = el as StampElement;
      const r = 16 * dpr;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(boat.x, boat.y, r, 0, Math.PI * 2);
      ctx.fillStyle = boat.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${16 * dpr}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(boat.label, boat.x, boat.y);
      ctx.restore();
    } else if (el.type === 'mark') {
      const mark = el as StampElement;
      const r = 14 * dpr;
      ctx.beginPath();
      ctx.arc(mark.x, mark.y, r, 0, Math.PI * 2);
      ctx.fillStyle = mark.color;
      ctx.fill();
      ctx.strokeStyle = mark.borderColor || '#94A3B8';
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
      ctx.fillStyle = mark.textColor || '#0F172A';
      ctx.font = `bold ${13 * dpr}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mark.label, mark.x, mark.y);
    } else if (el.type === 'line' || el.type === 'arrow') {
      const line = el as LineElement;
      drawLineArrow(ctx, line.x, line.y, line.x2, line.y2, line.color, line.width, el.type === 'arrow', dpr);
    } else if (el.type === 'wind') {
      const wind = el as WindElement;
      drawWindElement(ctx, wind.x, wind.y, wind.x2, wind.y2, dpr);
    }
  };

  const drawLineArrow = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number, hasArrow: boolean, dpr: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (hasArrow) {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 12 * dpr;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }
  };

  const drawWindElement = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dpr: number) => {
    ctx.save();
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3 * dpr;
    ctx.globalAlpha = 0.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 10 * dpr;
    ctx.fillStyle = '#06B6D4';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const perpAngle = angle + Math.PI / 2;
    const offset = 8 * dpr;
    ctx.fillStyle = '#06B6D4';
    ctx.globalAlpha = 1;
    ctx.font = `bold ${9 * dpr}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WIND', midX + Math.cos(perpAngle) * offset, midY + Math.sin(perpAngle) * offset);
    ctx.restore();
  };

  useEffect(() => {
    drawCanvas(elements);
  }, [elements, canvasSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    drawCanvas(elements);
  }, [canvasSize]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageData = canvas.toDataURL('image/png');
    onSave(imageData, elements);
  };

  const tools: { tool: Tool; label: string; icon: React.ReactNode }[] = [
    {
      tool: 'pen',
      label: 'Pen',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      ),
    },
    {
      tool: 'line',
      label: 'Line',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="19" x2="19" y2="5" />
        </svg>
      ),
    },
    {
      tool: 'arrow',
      label: 'Arrow',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <polyline points="12 5 19 5 19 12" />
        </svg>
      ),
    },
    {
      tool: 'boat',
      label: 'Boat',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 20l4-4h12l4 4" />
          <path d="M12 4v8" />
          <path d="M12 4l6 6H6l6-6z" />
        </svg>
      ),
    },
    {
      tool: 'mark',
      label: 'Mark',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="bold">1</text>
        </svg>
      ),
    },
    {
      tool: 'wind',
      label: 'Wind',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
          <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
          <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0b1120]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-white">
          {courseMode ? 'Course Layout' : 'Race Scenario'}
        </h3>
        <button
          onClick={handleSave}
          disabled={elements.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-cyan-500 text-white hover:bg-cyan-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="w-3.5 h-3.5" />
          Save
        </button>
      </div>

      {/* Instructions */}
      <p className="px-4 py-2 text-xs text-slate-400">
        {courseMode
          ? 'Tap to place numbered marks (paired colours), draw wind direction and start lines'
          : 'Draw boats, marks, arrows and the scenario you need help with'}
      </p>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 px-3 pb-2 min-h-0">
        <div className="relative w-full h-full rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(14,165,233,0.15)' }}>
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className="w-8 h-8 rounded-lg bg-slate-800/80 backdrop-blur border border-slate-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-colors disabled:opacity-30"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={clearAll}
              disabled={elements.length === 0}
              className="w-8 h-8 rounded-lg bg-slate-800/80 backdrop-blur border border-slate-600/50 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors disabled:opacity-30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-crosshair touch-none"
            style={{ width: canvasSize.width, height: canvasSize.height }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>
      </div>

      {/* Pen options panel */}
      {showPenOptions && activeTool === 'pen' && (
        <div className="px-3 pb-1">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700/50">
            <div className="flex items-center gap-1.5">
              {PEN_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setPenColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${penColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="w-px h-5 bg-slate-600" />
            <div className="flex items-center gap-1.5">
              {PEN_WIDTHS.map(w => (
                <button
                  key={w}
                  onClick={() => setPenWidth(w)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${penWidth === w ? 'bg-slate-600 ring-1 ring-cyan-500/40' : 'hover:bg-slate-700'}`}
                >
                  <div className="rounded-full bg-white" style={{ width: w * 2, height: w * 2 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex items-center justify-center gap-1">
          {tools.map(({ tool, icon, label }) => (
            <button
              key={tool}
              onClick={() => {
                setActiveTool(tool);
                setShowPenOptions(tool === 'pen');
              }}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
                activeTool === tool
                  ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={label}
            >
              {icon}
              <span className="text-[9px] font-medium">{label}</span>
            </button>
          ))}
          <button
            onClick={() => { setActiveTool('eraser'); setShowPenOptions(false); }}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
              activeTool === 'eraser'
                ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            title="Erase"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
              <path d="M22 21H7" />
              <path d="m5 11 9 9" />
            </svg>
            <span className="text-[9px] font-medium">Erase</span>
          </button>
        </div>
      </div>
    </div>
  );
};
