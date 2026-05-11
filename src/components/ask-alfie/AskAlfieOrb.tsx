import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AskAlfieChatPanel } from './AskAlfieChatPanel';

interface AskAlfieOrbProps {
  darkMode: boolean;
}

export const AskAlfieOrb: React.FC<AskAlfieOrbProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [orbKey, setOrbKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isOpen) return;

    const ctx = canvas.getContext('2d')!;
    const size = 68;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2);

    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const radius = 27;

      const gradient = ctx.createRadialGradient(
        cx - 4 + Math.sin(time * 0.8) * 2,
        cy - 6 + Math.cos(time * 0.6) * 2,
        2,
        cx,
        cy,
        radius + 2
      );
      gradient.addColorStop(0, 'rgba(180, 230, 255, 0.95)');
      gradient.addColorStop(0.3, 'rgba(56, 189, 248, 0.9)');
      gradient.addColorStop(0.6, 'rgba(14, 165, 233, 0.85)');
      gradient.addColorStop(1, 'rgba(2, 132, 199, 0.8)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      const shineGrad = ctx.createRadialGradient(
        cx - 6 + Math.sin(time * 0.5) * 3,
        cy - 8 + Math.cos(time * 0.7) * 2,
        1,
        cx - 4,
        cy - 6,
        12
      );
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
      shineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
      shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.fillStyle = shineGrad;
      ctx.fill();

      const pulseRadius = radius + 4 + Math.sin(time * 2) * 3;
      const pulseAlpha = 0.12 + Math.sin(time * 2) * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${pulseAlpha})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      time += 0.03;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen) {
      setOrbKey(prev => prev + 1);
    }
    setIsOpen(!isOpen);
    if (!hasInteracted) setHasInteracted(true);
  };

  if (!user) return null;

  return createPortal(
    <>
      <button
        onClick={handleToggle}
        className={`fixed bottom-6 right-6 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 ${
          isOpen ? 'w-14 h-14 bg-slate-700 hover:bg-slate-600 z-[9990]' : 'w-[68px] h-[68px] z-40'
        }`}
        title="Ask Alfie"
        style={!isOpen ? { background: 'transparent', boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)' } : undefined}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <canvas
            ref={canvasRef}
            className="w-[68px] h-[68px] cursor-pointer"
            style={{ imageRendering: 'auto' }}
          />
        )}
      </button>

      {!isOpen && !hasInteracted && (
        <div className="fixed bottom-[6.5rem] right-6 z-40 animate-fade-in">
          <div className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg ${
            darkMode ? 'bg-slate-700 text-cyan-300 border border-slate-600' : 'bg-white text-sky-600 border border-sky-200'
          }`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            Ask Alfie
          </div>
        </div>
      )}

      {isOpen && (
        <AskAlfieChatPanel
          key={orbKey}
          darkMode={darkMode}
          onClose={() => setIsOpen(false)}
        />
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[9988]"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>,
    document.body
  );
};
