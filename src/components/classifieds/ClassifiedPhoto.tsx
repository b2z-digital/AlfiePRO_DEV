import React from 'react';
import type { ClassifiedImageMeta } from '../../types/classified';

/**
 * Shows a classifieds photo the right way up and framed on the item.
 *
 * Many listings imported from the ARYA site are stored sideways (the photo
 * lost its "which way is up" information before we got it). Each photo can
 * carry a small setting, kept in `classifieds.image_meta` by URL:
 *   r     clockwise turn needed to stand it upright (0, 90, 180, 270)
 *   x, y  where the item sits, as % of the photo as stored (before turning)
 * The file itself is never changed, so the nightly re-import can't undo it.
 *
 * The parent must give this box a size (absolute inset-0, or width + height).
 */

export type PhotoFit = 'cover' | 'contain';

const TURNS = [0, 90, 180, 270];

export const normaliseTurn = (r: unknown): number => {
  const n = Math.round(Number(r) || 0);
  const m = ((n % 360) + 360) % 360;
  return TURNS.includes(m) ? m : 0;
};

const clampPct = (v: unknown, d = 50) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : d;
};

export const photoMetaFor = (
  meta: Record<string, ClassifiedImageMeta> | null | undefined,
  src: string | null | undefined,
): ClassifiedImageMeta | undefined => (src && meta && typeof meta === 'object' ? meta[src] : undefined);

/** Point on the photo as stored → the same point once it's turned upright (all in %). */
export const toUpright = (x: number, y: number, r: number): [number, number] => {
  switch (normaliseTurn(r)) {
    case 90: return [100 - y, x];
    case 180: return [100 - x, 100 - y];
    case 270: return [y, 100 - x];
    default: return [x, y];
  }
};

/** Point on the upright photo → the same point on the photo as stored. */
export const fromUpright = (u: number, v: number, r: number): [number, number] => {
  switch (normaliseTurn(r)) {
    case 90: return [v, 100 - u];
    case 180: return [100 - u, 100 - v];
    case 270: return [100 - v, u];
    default: return [u, v];
  }
};

interface ClassifiedPhotoProps {
  src: string;
  meta?: ClassifiedImageMeta | null;
  alt?: string;
  fit?: PhotoFit;
  /** Blurred copy of the photo behind a 'contain' photo, so there are no empty bars */
  backdrop?: boolean;
  className?: string;
  style?: React.CSSProperties;
  imgClassName?: string;
  onClick?: (e: React.MouseEvent) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  loading?: 'lazy' | 'eager';
  draggable?: boolean;
}

const imgStyle = (r: number, fit: PhotoFit, x: number, y: number): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'absolute',
    objectFit: fit,
    objectPosition: `${x}% ${y}%`,
    maxWidth: 'none',
  };
  if (r === 90 || r === 270) {
    // Lay the photo out in a box with width and height swapped, then turn it:
    // once turned it fills the frame exactly.
    return {
      ...base,
      left: '50%',
      top: '50%',
      width: '100cqh',
      height: '100cqw',
      transform: `translate(-50%, -50%) rotate(${r}deg)`,
    };
  }
  return {
    ...base,
    inset: 0,
    width: '100%',
    height: '100%',
    transform: r === 180 ? 'rotate(180deg)' : undefined,
  };
};

export const ClassifiedPhoto: React.FC<ClassifiedPhotoProps> = ({
  src, meta, alt = '', fit = 'cover', backdrop = false, className = '', style,
  imgClassName = '', onClick, onError, onLoad, loading = 'lazy', draggable,
}) => {
  const r = normaliseTurn(meta?.r);
  const x = clampPct(meta?.x);
  const y = clampPct(meta?.y);
  return (
    <div className={`a-cph ${className}`} style={style} onClick={onClick}>
      {backdrop && fit === 'contain' && (
        <img src={src} alt="" aria-hidden="true" className="a-cph-bd" style={imgStyle(r, 'cover', x, y)} loading={loading} draggable={false} />
      )}
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        style={imgStyle(r, fit, x, y)}
        onError={onError}
        onLoad={onLoad}
        loading={loading}
        draggable={draggable}
      />
    </div>
  );
};

export default ClassifiedPhoto;
