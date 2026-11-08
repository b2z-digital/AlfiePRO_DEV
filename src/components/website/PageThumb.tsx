import React from 'react';

/** Tiny picture of a page drawn from its builder rows (no screenshots needed). */
export const PageThumb: React.FC<{ rows?: any[] | null; w?: number | string; h?: number | string; large?: boolean; label?: string }> = ({ rows, w = 58, h = 40, large = false, label }) => {
  const list = Array.isArray(rows) ? rows.slice(0, large ? 6 : 4) : [];
  return (
    <span className={`wh-pth${large ? ' lg' : ''}`} style={{ width: w, height: h }} aria-hidden="true">
      {list.length === 0 ? (
        <span className="wh-pth-empty">{label || (large ? 'Empty page' : '')}</span>
      ) : list.map((row: any, i: number) => {
        const cols: any[] = Array.isArray(row?.columns) && row.columns.length ? row.columns : [{ width: 12, widgets: [] }];
        const media = row?.background?.mediaType === 'image' || row?.background?.mediaType === 'video';
        const colour = row?.background?.type === 'color' ? row.background.value : null;
        const tall = media || (row?.minHeight && parseInt(String(row.minHeight), 10) > 300);
        const height = large ? (tall ? 30 : 16) : (tall ? 9 : 5);
        return (
          <span key={row?.id || i} style={{ gridTemplateColumns: cols.map(c => `${Math.max(1, Number(c?.width) || 12)}fr`).join(' ') }}>
            {cols.map((c, j) => {
              const hasMedia = (c?.widgets || []).some((wd: any) => /image|gallery|slider|video|hero|map/i.test(String(wd?.type || '')));
              const bg = media ? '#1E293B' : hasMedia ? '#94A3B8' : colour && colour !== '#ffffff' ? colour : '#CBD5E1';
              return <i key={c?.id || j} style={{ height, background: bg, opacity: hasMedia || media ? 1 : 0.85 }} />;
            })}
          </span>
        );
      })}
    </span>
  );
};
