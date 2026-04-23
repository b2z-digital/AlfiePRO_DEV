import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Check, Undo2, Trash2 } from 'lucide-react';

type Tool = 'buoy' | 'boat' | 'line' | 'arrow' | 'wind' | 'eraser' | 'select';

interface CanvasElement {
  id: string;
  type: 'buoy' | 'boat' | 'arrow' | 'wind' | 'line';
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  label: string;
  color?: string;
}

const BOAT_COLORS = [
  { bg: '#3b82f6', label: 'A' },
  { bg: '#ef4444', label: 'B' },
  { bg: '#22c55e', label: 'C' },
  { bg: '#f59e0b', label: 'D' },
  { bg: '#a855f7', label: 'E' },
  { bg: '#ec4899', label: 'F' },
  { bg: '#14b8a6', label: 'G' },
  { bg: '#f97316', label: 'H' },
];

interface RaceScenarioCanvasProps {
  onSave: (imageData: string, elements: CanvasElement[]) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export const RaceScenarioCanvas: React.FC<RaceScenarioCanvasProps> = ({
  onSave,
  onClose,
  darkMode = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeTool, setActiveTool] = useState<Tool>('buoy');
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [buoyCount, setBuoyCount] = useState(0);
  const [boatIndex, setBoatIndex] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 });

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
      setElements([...history[newIndex]]);
      const prevBuoys = history[newIndex].filter(e => e.type === 'buoy').length;
      const prevBoats = history[newIndex].filter(e => e.type === 'boat').length;
      setBuoyCount(prevBuoys);
      setBoatIndex(prevBoats);
    }
  }, [historyIndex, history]);

  const clearAll = useCallback(() => {
    setElements([]);
    setBuoyCount(0);
    setBoatIndex(0);
    pushHistory([]);
  }, [pushHistory]);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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

    if (activeTool === 'buoy') {
      const newBuoy: CanvasElement = {
        id: crypto.randomUUID(),
        type: 'buoy',
        x: pos.x,
        y: pos.y,
        label: String(buoyCount + 1),
      };
      const newElements = [...elements, newBuoy];
      setElements(newElements);
      setBuoyCount(buoyCount + 1);
      pushHistory(newElements);
    } else if (activeTool === 'boat') {
      const boatColor = BOAT_COLORS[boatIndex % BOAT_COLORS.length];
      const newBoat: CanvasElement = {
        id: crypto.randomUUID(),
        type: 'boat',
        x: pos.x,
        y: pos.y,
        label: boatColor.label,
        color: boatColor.bg,
      };
      const newElements = [...elements, newBoat];
      setElements(newElements);
      setBoatIndex(boatIndex + 1);
      pushHistory(newElements);
    } else if (activeTool === 'arrow' || activeTool === 'wind' || activeTool === 'line') {
      setIsDrawing(true);
      setDrawStart(pos);
    } else if (activeTool === 'eraser') {
      const hitRadius = 25;
      const filtered = elements.filter(el => {
        if (el.type === 'arrow' || el.type === 'wind' || el.type === 'line') {
          const dx = ((el.x + (el.x2 || el.x)) / 2) - pos.x;
          const dy = ((el.y + (el.y2 || el.y)) / 2) - pos.y;
          return Math.sqrt(dx * dx + dy * dy) > hitRadius;
        }
        const dx = el.x - pos.x;
        const dy = el.y - pos.y;
        return Math.sqrt(dx * dx + dy * dy) > hitRadius;
      });
      if (filtered.length !== elements.length) {
        setElements(filtered);
        pushHistory(filtered);
      }
    }
  }, [activeTool, elements, buoyCount, boatIndex, getCanvasPos, pushHistory]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !drawStart) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    drawCanvas(elements, pos);
  }, [isDrawing, drawStart, elements, getCanvasPos]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !drawStart) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    const dx = pos.x - drawStart.x;
    const dy = pos.y - drawStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) {
      const newEl: CanvasElement = {
        id: crypto.randomUUID(),
        type: activeTool as 'arrow' | 'wind' | 'line',
        x: drawStart.x,
        y: drawStart.y,
        x2: pos.x,
        y2: pos.y,
        label: activeTool === 'wind' ? 'WIND' : '',
      };
      const newElements = [...elements, newEl];
      setElements(newElements);
      pushHistory(newElements);
    }
    setIsDrawing(false);
    setDrawStart(null);
  }, [isDrawing, drawStart, activeTool, elements, getCanvasPos, pushHistory]);

  const drawCanvas = useCallback((els: CanvasElement[], tempEnd?: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0f1729';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 0.5 * dpr;
    const gridSize = 40 * dpr;
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

    // Draw elements
    for (const el of els) {
      drawElement(ctx, el, dpr);
    }

    // Temp drawing preview
    if (isDrawing && drawStart && tempEnd) {
      const tempEl: CanvasElement = {
        id: 'temp',
        type: activeTool as 'arrow' | 'wind' | 'line',
        x: drawStart.x,
        y: drawStart.y,
        x2: tempEnd.x,
        y2: tempEnd.y,
        label: activeTool === 'wind' ? 'WIND' : '',
      };
      ctx.globalAlpha = 0.6;
      drawElement(ctx, tempEl, dpr);
      ctx.globalAlpha = 1;
    }
  }, [isDrawing, drawStart, activeTool]);

  const drawElement = (ctx: CanvasRenderingContext2D, el: CanvasElement, dpr: number) => {
    const scale = dpr;

    if (el.type === 'buoy') {
      const r = 18 * scale;
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = `bold ${14 * scale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, el.x, el.y);
    } else if (el.type === 'boat') {
      const r = 20 * scale;
      ctx.beginPath();
      ctx.arc(el.x, el.y, r, 0, Math.PI * 2);
      ctx.fillStyle = el.color || '#3b82f6';
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${15 * scale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label, el.x, el.y);
    } else if (el.type === 'arrow' || el.type === 'line') {
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (el.type === 'arrow') {
        const angle = Math.atan2(y2 - el.y, x2 - el.x);
        const headLen = 14 * scale;
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    } else if (el.type === 'wind') {
      const x2 = el.x2 ?? el.x;
      const y2 = el.y2 ?? el.y;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3.5 * scale;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(el.x, el.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      const angle = Math.atan2(y2 - el.y, x2 - el.x);
      const headLen = 14 * scale;
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      // WIND label
      const midX = (el.x + x2) / 2;
      const midY = (el.y + y2) / 2;
      const offset = 18 * scale;
      const perpAngle = angle + Math.PI / 2;
      ctx.fillStyle = '#22d3ee';
      ctx.font = `bold ${11 * scale}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WIND', midX + Math.cos(perpAngle) * offset, midY + Math.sin(perpAngle) * offset);
    }
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

  const tools: { tool: Tool; icon: React.ReactNode; label: string }[] = [
    {
      tool: 'buoy',
      label: 'Mark',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="11" fontWeight="bold">1</text>
        </svg>
      ),
    },
    {
      tool: 'eraser',
      label: 'Erase',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="20" x2="20" y2="20" />
          <path d="M5 16l6-6 8 8" />
        </svg>
      ),
    },
    {
      tool: 'boat',
      label: 'Boat',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 20l4-4h12l4 4" />
          <path d="M12 4v8" />
          <path d="M12 4l6 6H6l6-6z" />
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
        <h3 className="text-sm font-semibold text-white">Race Scenario</h3>
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
        Draw boats, marks, arrows and the scenario you need help with
      </p>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 px-3 pb-2 min-h-0">
        <div className="relative w-full h-full rounded-xl border border-slate-600/50 overflow-hidden">
          {/* Canvas controls */}
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

      {/* Toolbar */}
      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex items-center justify-center gap-1">
          {tools.map(({ tool, icon, label }) => (
            <button
              key={tool}
              onClick={() => setActiveTool(tool)}
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
        </div>
      </div>
    </div>
  );
};
