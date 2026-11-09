import React, { useEffect, useState } from 'react';
import type { DeviceType, EventPageRow, EventWidgetConfig } from '../../types/eventWidgets';
import { EventWidgetRenderer } from '../events/EventWidgetRenderer';
import { SITE_MODULE_TYPES, SiteEditContext, SiteModule, type SiteEdit } from './SiteModules';

export const deviceFor = (w: number): DeviceType => (w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop');

const rgba = (hex: string, opacity: number) => {
  const h = /^#([0-9a-f]{6})$/i.test(hex) ? hex : '#000000';
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
};

const youTubeId = (url: string) => {
  const m = (url || '').match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/);
  return m && m[7].length === 11 ? m[7] : '';
};

const px = (v?: number) => (v !== undefined && v !== null && !Number.isNaN(Number(v)) ? `${v}px` : undefined);
type Box = { top?: number; bottom?: number; left?: number; right?: number };
/** A value for this screen size, else the base value (the same rule the public site has always used). */
const pick = <T,>(resp: Partial<Record<DeviceType, T>> | undefined, base: T | undefined, d: DeviceType): T | undefined => resp?.[d] ?? base;

const hiddenOn = (hideOn: DeviceType[] | undefined, d: DeviceType) => !!hideOn && hideOn.includes(d);

/** One module: the builder's own modules, or the shared event website widgets. */
const Module: React.FC<{ widget: EventWidgetConfig; websiteId: string; device: DeviceType; edit: boolean }> = ({ widget, websiteId, device, edit }) => {
  const m = pick(widget.responsiveMargin as any, undefined, device) as Box | undefined;
  const p = pick(widget.responsivePadding as any, undefined, device) as Box | undefined;
  const hidden = hiddenOn(widget.hideOn, device);
  if (hidden && !edit) return null;
  return (
    <div
      id={widget.anchor || undefined}
      data-sb-mod={edit ? widget.id : undefined}
      className={hidden ? 'sb-hidden-here' : undefined}
      style={{
        marginTop: px(m?.top), marginBottom: px(m?.bottom), marginLeft: px(m?.left), marginRight: px(m?.right),
        paddingTop: px(p?.top), paddingBottom: px(p?.bottom), paddingLeft: px(p?.left), paddingRight: px(p?.right),
      }}
    >
      {SITE_MODULE_TYPES.has(widget.type)
        ? <SiteModule widget={widget} clubId={websiteId} device={device} />
        : <EventWidgetRenderer widget={widget} websiteId={websiteId} darkMode={false} isEditing={edit} />}
    </div>
  );
};

/**
 * Renders page-builder rows: the public club site and the site builder canvas use the same code,
 * so what you build is what visitors see. `edit` adds the markers the builder needs.
 */
export const PageRows: React.FC<{ rows: EventPageRow[]; websiteId: string; edit?: SiteEdit | null; device?: DeviceType }> = ({ rows, websiteId, edit, device: forced }) => {
  const [vw, setVw] = useState<DeviceType>(() => (typeof window === 'undefined' ? 'desktop' : deviceFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setVw(deviceFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const device = forced || vw;
  const isEdit = !!edit;

  const body = (
    <div className="w-full">
      {rows.map(row => {
        const rowHidden = hiddenOn(row.hideOn, device);
        if (rowHidden && !isEdit) return null;
        const padding = (pick(row.responsivePadding as any, row.padding, device) || {}) as Box;
        const margin = (pick(row.responsiveMargin as any, row.margin, device) || {}) as Box;
        const gap = pick(row.responsiveColumnGap as any, row.columnGap, device) as number | undefined;
        const bg = row.background || ({} as any);
        const overlayType = bg.overlayType;
        const opacity = (bg.overlayOpacity ?? 30) / 100;
        const overlay: React.CSSProperties = overlayType === 'solid'
          ? { backgroundColor: rgba(bg.overlayColor ?? '#000000', opacity) }
          : overlayType === 'gradient'
            ? { backgroundImage: `linear-gradient(${bg.overlayGradientDirection ?? 'to bottom'}, ${rgba(bg.overlayGradientStart ?? '#000000', opacity)}, ${rgba(bg.overlayGradientEnd ?? '#ffffff', opacity)})` }
            : {};
        const vid = bg.mediaType === 'video' ? youTubeId(bg.videoUrl) : '';
        // Same as the public site always did: stacking on tablets also stacks on phones
        const stacked = (device === 'mobile' && (!!row.stackOnMobile || !!row.stackOnTablet)) || (device === 'tablet' && !!row.stackOnTablet);
        const columns = stacked && row.reverseOnMobile ? [...row.columns].reverse() : row.columns;

        return (
          <div
            key={row.id}
            id={row.anchor || undefined}
            data-sb-row={isEdit ? row.id : undefined}
            className={`w-full relative overflow-hidden${rowHidden ? ' sb-hidden-here' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: bg.mediaType ? 'transparent' : (bg.type === 'color' ? bg.value : undefined),
              backgroundImage: !bg.mediaType && bg.type === 'gradient' && bg.value ? bg.value : undefined,
              marginTop: px(margin.top), marginBottom: px(margin.bottom), marginLeft: px(margin.left), marginRight: px(margin.right),
              maxWidth: (row as any).responsiveMaxWidth?.[device] || row.maxWidth || undefined,
              minHeight: (row as any).responsiveMinHeight?.[device] || row.minHeight || undefined,
              maxHeight: (row as any).responsiveMaxHeight?.[device] || row.maxHeight || undefined,
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
              className={`relative z-10 ${row.fullWidth ? 'w-full' : 'w-full max-w-7xl mx-auto'} grid`}
              style={{
                flex: 1,
                gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : 'repeat(12, minmax(0, 1fr))',
                paddingTop: px(padding.top), paddingBottom: px(padding.bottom), paddingLeft: px(padding.left), paddingRight: px(padding.right),
                gap: gap !== undefined ? `${gap}px` : '16px',
              }}
            >
              {columns.map(column => {
                const colHidden = hiddenOn(column.hideOn, device);
                if (colHidden && !isEdit) return null;
                const cp = (pick(column.responsivePadding as any, column.padding, device) || {}) as Box;
                const cbg = column.background;
                return (
                  <div
                    key={column.id}
                    data-sb-col={isEdit ? column.id : undefined}
                    className={`flex flex-col${colHidden ? ' sb-hidden-here' : ''}`}
                    style={{
                      gridColumn: stacked ? 'auto' : `span ${column.width}`,
                      justifyContent: column.verticalAlign === 'center' ? 'center' : column.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
                      paddingTop: px(cp.top), paddingBottom: px(cp.bottom), paddingLeft: px(cp.left), paddingRight: px(cp.right),
                      background: cbg?.value ? (cbg.type === 'image' ? `center / cover no-repeat url(${cbg.value})` : cbg.value) : undefined,
                      borderRadius: cbg?.value ? 'var(--site-card-radius, 12px)' : undefined,
                    }}
                  >
                    {column.widgets.map(widget => <Module key={widget.id} widget={widget} websiteId={websiteId} device={device} edit={isEdit} />)}
                    {isEdit && column.widgets.length === 0 && (
                      <div data-sb-colempty={column.id} className="sb-col-empty">Drop a module here</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return isEdit ? <SiteEditContext.Provider value={edit!}>{body}</SiteEditContext.Provider> : body;
};
