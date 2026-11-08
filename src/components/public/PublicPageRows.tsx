import React, { useEffect, useState } from 'react';
import type { EventPageRow } from '../../types/eventWidgets';
import { EventWidgetRenderer } from '../events/EventWidgetRenderer';

type Viewport = 'desktop' | 'tablet' | 'mobile';

const viewportFor = (w: number): Viewport => (w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');

const rgba = (hex: string, opacity: number) => {
  const h = /^#([0-9a-f]{6})$/i.test(hex) ? hex : '#000000';
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
};

const youTubeId = (url: string) => {
  const m = (url || '').match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/);
  return m && m[7].length === 11 ? m[7] : '';
};

const px = (v?: number) => (v !== undefined && v !== null ? `${v}px` : undefined);

/** Renders page-builder rows on a club's public site (same layout model as event websites). */
export const PublicPageRows: React.FC<{ rows: EventPageRow[]; websiteId: string }> = ({ rows, websiteId }) => {
  const [viewport, setViewport] = useState<Viewport>(() => (typeof window === 'undefined' ? 'desktop' : viewportFor(window.innerWidth)));

  useEffect(() => {
    const onResize = () => setViewport(viewportFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="w-full">
      {rows.map(row => {
        const padding = (row.responsivePadding as any)?.[viewport] || row.padding || {};
        const margin = (row.responsiveMargin as any)?.[viewport] || row.margin || {};
        const bg = row.background || ({} as any);
        const overlayType = bg.overlayType;
        const opacity = (bg.overlayOpacity ?? 30) / 100;
        const overlay: React.CSSProperties = overlayType === 'solid'
          ? { backgroundColor: rgba(bg.overlayColor ?? '#000000', opacity) }
          : overlayType === 'gradient'
            ? { backgroundImage: `linear-gradient(${bg.overlayGradientDirection ?? 'to bottom'}, ${rgba(bg.overlayGradientStart ?? '#000000', opacity)}, ${rgba(bg.overlayGradientEnd ?? '#ffffff', opacity)})` }
            : {};
        const vid = bg.mediaType === 'video' ? youTubeId(bg.videoUrl) : '';
        const cols = row.stackOnMobile && row.stackOnTablet ? 'lg:grid-cols-12'
          : row.stackOnMobile ? 'md:grid-cols-12'
          : row.stackOnTablet ? 'md:grid-cols-1 lg:grid-cols-12'
          : 'grid-cols-12';

        return (
          <div
            key={row.id}
            className="w-full relative overflow-hidden"
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: bg.mediaType ? 'transparent' : (bg.type === 'color' ? bg.value : undefined),
              backgroundImage: !bg.mediaType && bg.type === 'gradient' && bg.value ? bg.value : undefined,
              marginTop: px(margin.top), marginBottom: px(margin.bottom), marginLeft: px(margin.left), marginRight: px(margin.right),
              maxWidth: (row as any).responsiveMaxWidth?.[viewport] || row.maxWidth || undefined,
              minHeight: (row as any).responsiveMinHeight?.[viewport] || row.minHeight || undefined,
              maxHeight: (row as any).responsiveMaxHeight?.[viewport] || row.maxHeight || undefined,
            }}
          >
            {vid && (
              <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                <iframe
                  src={`https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}&playsinline=1`}
                  className="absolute top-1/2 left-1/2 w-[300%] h-[300%]"
                  style={{ transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                  title="Background video"
                />
              </div>
            )}
            {bg.mediaType === 'image' && bg.value && (
              <div
                className={`absolute inset-0 w-full h-full bg-cover ${bg.kenBurnsEffect ? 'ken-burns-effect' : ''}`}
                style={{ backgroundImage: `url(${bg.value})`, backgroundPosition: bg.imagePosition ?? 'center center', backgroundSize: 'cover' }}
              />
            )}
            {(bg.mediaType === 'image' || bg.mediaType === 'video') && <div className="absolute inset-0 w-full h-full" style={overlay} />}

            <div
              className={`relative z-10 ${row.fullWidth ? 'w-full' : 'w-full max-w-7xl mx-auto'} grid grid-cols-1 ${cols}`}
              style={{
                flex: 1,
                paddingTop: px(padding.top), paddingBottom: px(padding.bottom), paddingLeft: px(padding.left), paddingRight: px(padding.right),
                gap: row.columnGap !== undefined ? `${row.columnGap}px` : '16px',
              }}
            >
              {row.columns.map(column => {
                const cp = (column.responsivePadding as any)?.[viewport] || column.padding || {};
                return (
                  <div
                    key={column.id}
                    className="flex flex-col"
                    style={{
                      gridColumn: `span ${column.width}`,
                      justifyContent: column.verticalAlign === 'center' ? 'center' : column.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
                      paddingTop: px(cp.top), paddingBottom: px(cp.bottom), paddingLeft: px(cp.left), paddingRight: px(cp.right),
                    }}
                  >
                    {column.widgets.map(widget => (
                      <div key={widget.id}>
                        <EventWidgetRenderer widget={widget} websiteId={websiteId} darkMode={false} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
