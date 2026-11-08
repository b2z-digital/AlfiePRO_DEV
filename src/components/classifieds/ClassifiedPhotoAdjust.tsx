import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, RotateCw, X } from 'lucide-react';
import type { ClassifiedImageMeta } from '../../types/classified';
import { ClassifiedPhoto, fromUpright, normaliseTurn, toUpright } from './ClassifiedPhoto';

/**
 * Turn a listing photo the right way up and choose what the card shows.
 * Nothing is uploaded: the setting is saved with the listing (image_meta).
 */
interface Props {
  src: string;
  meta?: ClassifiedImageMeta;
  /** Scraped listings get checked again automatically after a reset */
  autoChecked?: boolean;
  onApply: (meta: ClassifiedImageMeta | undefined) => void;
  onClose: () => void;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export const ClassifiedPhotoAdjust: React.FC<Props> = ({ src, meta, autoChecked, onApply, onClose }) => {
  const [r, setR] = useState(normaliseTurn(meta?.r));
  const [x, setX] = useState(Number.isFinite(Number(meta?.x)) ? Number(meta?.x) : 50);
  const [y, setY] = useState(Number.isFinite(Number(meta?.y)) ? Number(meta?.y) : 50);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const downOnVeil = useRef(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setSize({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
    img.src = src;
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const w = size?.w || 4;
  const h = size?.h || 3;
  const upright = r % 180 ? h / w : w / h;
  const [u, v] = toUpright(x, y, r);

  const placeAt = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    const pu = clamp(((clientX - box.left) / box.width) * 100);
    const pv = clamp(((clientY - box.top) / box.height) * 100);
    const [nx, ny] = fromUpright(pu, pv, r);
    setX(Math.round(nx));
    setY(Math.round(ny));
  };

  const draft: ClassifiedImageMeta = { ...meta, r, x, y };

  return createPortal(
    <div
      className="a-dlg"
      style={{ zIndex: 80 }}
      onPointerDown={(e) => { downOnVeil.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnVeil.current) onClose(); }}
    >
      <section className="a-sheet max-w-4xl" role="dialog" aria-modal="true" aria-label="Adjust photo">
        <div className="a-dlg-head">
          <div className="flex-1 min-w-0">
            <h2 className="a-ink text-lg font-semibold m-0">Adjust photo</h2>
            <p className="a-mute text-[13px] m-0 mt-0.5">Turn it the right way up, then tap the item to centre the card on it.</p>
          </div>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="a-dlg-body">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 flex justify-center w-full">
              <div
                ref={boxRef}
                className="relative rounded-xl overflow-hidden cursor-crosshair select-none touch-none"
                style={{ aspectRatio: String(upright), width: `min(100%, calc(56vh * ${upright}))`, background: 'rgba(0,0,0,0.3)' }}
                onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); placeAt(e.clientX, e.clientY); }}
                onPointerMove={(e) => { if (dragging.current) placeAt(e.clientX, e.clientY); }}
                onPointerUp={() => { dragging.current = false; }}
                onPointerCancel={() => { dragging.current = false; }}
                role="application"
                aria-label="Photo. Tap the item to frame the card on it."
              >
                <ClassifiedPhoto src={src} meta={{ r, x: 50, y: 50 }} fit="contain" loading="eager" draggable={false} className="absolute inset-0 pointer-events-none" />
                <span
                  aria-hidden="true"
                  className="absolute pointer-events-none"
                  style={{
                    left: `${u}%`, top: `${v}%`, width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 999,
                    border: '2.5px solid #fff', boxShadow: '0 0 0 2px rgba(10,132,255,0.9), 0 4px 14px rgba(0,0,0,0.5)', background: 'rgba(10,132,255,0.35)',
                  }}
                />
              </div>
            </div>

            <div className="w-full md:w-[280px] flex-shrink-0 flex flex-col gap-4">
              <div>
                <p className="a-cap mb-2">On the card</p>
                <div className="a-bc-media rounded-xl" style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <ClassifiedPhoto src={src} meta={draft} loading="eager" className="absolute inset-0" />
                </div>
              </div>

              <div>
                <p className="a-cap mb-2">Turn</p>
                <div className="flex gap-2">
                  <button type="button" className="a-btn flex-1" onClick={() => setR((p) => normaliseTurn(p - 90))} aria-label="Turn left">
                    <RotateCcw size={16} />Left
                  </button>
                  <button type="button" className="a-btn flex-1" onClick={() => setR((p) => normaliseTurn(p + 90))} aria-label="Turn right">
                    <RotateCw size={16} />Right
                  </button>
                </div>
              </div>

              {meta && (
                <button
                  type="button"
                  className="a-btn a-btn-q a-btn-sm self-start"
                  onClick={() => { onApply(undefined); onClose(); }}
                  title={autoChecked ? 'Remove this setting; Alfie checks the photo again on the next import' : 'Show the photo as it was uploaded'}
                >
                  Reset{autoChecked ? ' (check again)' : ''}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="a-dlg-foot">
          <button type="button" className="a-btn a-btn-q" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="a-btn a-btn-p"
            onClick={() => { onApply({ r, x, y, by: 'manual', len: meta?.len, at: new Date().toISOString() }); onClose(); }}
          >
            Done
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default ClassifiedPhotoAdjust;
