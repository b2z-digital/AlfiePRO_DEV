import React, { useEffect, useRef } from 'react';
import { AlfieIcon } from '../brand/AlfieIcon';
import { SmartImage } from '../news/SmartImage';
import type { EventMedia } from '../../types/media';

/* Presentational pieces for the Media Center. All behaviour stays in MediaPage. */

export const youTubeId = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return match && match[2].length === 11 ? match[2] : null;
};

export const isVideo = (m: Pick<EventMedia, 'media_type'>) => m.media_type === 'youtube_video';

export const mediaDate = (iso?: string | null, long = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU', long
    ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
};

const PlayGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
);

/** Thumbnail for any media item: smart-cropped photo, or the YouTube frame with a backup size. */
export const MediaThumb: React.FC<{ item: EventMedia; eager?: boolean; zoom?: boolean }> = ({ item, eager, zoom }) => {
  const video = isVideo(item);
  const id = video ? youTubeId(item.url) : null;
  const src = video ? (item.thumbnail_url || (id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null)) : item.url;
  return (
    <SmartImage
      src={src}
      fallbackSrc={id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null}
      alt={item.title || (video ? 'Video thumbnail' : 'Event image')}
      eager={eager}
      zoomOnHover={zoom}
      fallback={
        <div className="a-md-ph" aria-hidden="true">
          <AlfieIcon glyph={video ? 'video' : 'camera'} size={26} />
        </div>
      }
    />
  );
};

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

interface ItemActions {
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}

/** Gallery tile */
export const MediaTile: React.FC<{ item: EventMedia; index?: number; showEvent?: boolean } & ItemActions> = ({
  item, index = 0, showEvent = true, selected, onOpen, onToggle, onEdit, onDelete, onDownload,
}) => {
  const video = isVideo(item);
  const meta = [showEvent ? item.event_name : null, item.race_class].filter(Boolean).join(' · ');
  return (
    <div className={`a-md-tile a-nw-in group ${selected ? 'is-sel' : ''}`} style={{ ['--i' as any]: Math.min(index, 16) }}>
      <div
        className="a-md-media"
        role="button"
        tabIndex={0}
        aria-label={`Open ${item.title || (video ? 'video' : 'image')}`}
        onClick={onOpen}
        onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
      >
        <MediaThumb item={item} zoom />
        <span className="a-md-shade" aria-hidden="true" />
        {video && (
          <span className="a-md-play" aria-hidden="true"><PlayGlyph size={20} /></span>
        )}
        <div className="a-md-badges">
          {video && <span className="a-md-glass a-md-glass-yt"><i aria-hidden="true" />YouTube</span>}
          {item.isShared && item.sharedFrom && (
            <span className="a-md-glass" title={`Shared by ${item.sharedFrom.name}`}><AlfieIcon glyph="share" size={12} />{item.sharedFrom.abbreviation}</span>
          )}
        </div>
        <button
          type="button"
          className="a-md-check"
          aria-pressed={selected}
          aria-label={selected ? 'Deselect' : 'Select'}
          onClick={stop(onToggle)}
        >
          <AlfieIcon glyph="check" size={14} strokeWidth={2.4} />
        </button>
        <div className="a-md-acts">
          {!video && (
            <button type="button" className="a-nw-gb" aria-label="Download" title="Download" onClick={stop(onDownload)}>
              <AlfieIcon glyph="download" size={15} />
            </button>
          )}
          <button type="button" className="a-nw-gb" aria-label="Edit" title="Edit" onClick={stop(onEdit)}>
            <AlfieIcon glyph="pen" size={15} />
          </button>
          <button type="button" className="a-nw-gb a-nw-gb-d" aria-label="Delete" title="Delete" onClick={stop(onDelete)}>
            <AlfieIcon glyph="trash" size={15} />
          </button>
        </div>
      </div>
      <div className="a-md-cap">
        <p className="a-md-title" title={item.title || 'Untitled'}>{item.title || 'Untitled'}</p>
        <p className="a-md-meta">{meta || mediaDate(item.created_at)}</p>
      </div>
    </div>
  );
};

/** List row */
export const MediaRow: React.FC<{ item: EventMedia; index?: number } & ItemActions> = ({
  item, index = 0, selected, onOpen, onToggle, onEdit, onDelete, onDownload,
}) => {
  const video = isVideo(item);
  const id = youTubeId(item.url);
  return (
    <div
      className={`a-md-row a-nw-in group ${selected ? 'is-sel' : ''}`}
      style={{ ['--i' as any]: Math.min(index, 16) }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
    >
      <button type="button" className="a-md-check a-md-check-row" aria-pressed={selected} aria-label={selected ? 'Deselect' : 'Select'} onClick={stop(onToggle)}>
        <AlfieIcon glyph="check" size={13} strokeWidth={2.4} />
      </button>
      <div className="a-md-row-thumb">
        <MediaThumb item={item} />
        {video && <span className="a-md-play a-md-play-sm" aria-hidden="true"><PlayGlyph size={13} /></span>}
      </div>
      <div className="a-md-row-body">
        <p className="a-md-title">{item.title || 'Untitled'}</p>
        <div className="a-md-chips">
          <span className={`a-md-chip ${video ? 'a-md-chip-r' : 'a-md-chip-b'}`}>
            <AlfieIcon glyph={video ? 'video' : 'camera'} size={12} />{video ? 'Video' : 'Image'}
          </span>
          {item.event_name && <span className="a-md-chip"><AlfieIcon glyph="cal" size={12} />{item.event_name}</span>}
          {item.race_class && <span className="a-md-chip a-md-chip-p">{item.race_class}</span>}
          {item.isShared && item.sharedFrom && <span className="a-md-chip a-md-chip-p"><AlfieIcon glyph="share" size={12} />from {item.sharedFrom.abbreviation}</span>}
        </div>
      </div>
      <span className="a-md-row-date">{mediaDate(item.created_at)}</span>
      <div className="a-md-row-acts">
        <button type="button" className="a-ib" aria-label="Edit" title="Edit" onClick={stop(onEdit)}><AlfieIcon glyph="pen" size={16} /></button>
        <button type="button" className="a-ib a-ib-d" aria-label="Delete" title="Delete" onClick={stop(onDelete)}><AlfieIcon glyph="trash" size={16} /></button>
        {video ? (
          <a
            href={`https://youtube.com/watch?v=${id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="a-ib"
            aria-label="Open in YouTube"
            title="Open in YouTube"
          >
            <AlfieIcon glyph="ext" size={16} />
          </a>
        ) : (
          <button type="button" className="a-ib" aria-label="Download" title="Download" onClick={stop(onDownload)}><AlfieIcon glyph="download" size={16} /></button>
        )}
      </div>
    </div>
  );
};

export const MediaTileSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => (
  <div className="a-md-tile" aria-hidden="true" style={{ ['--i' as any]: index }}>
    <div className="a-md-media"><span className="a-nw-shim" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} /></div>
    <div className="a-md-cap">
      <span className="a-nw-shim a-nw-shim-line" style={{ width: '70%', marginTop: 4 }} />
      <span className="a-nw-shim a-nw-shim-line" style={{ width: '45%', marginTop: 8 }} />
    </div>
  </div>
);

/** Full-screen viewer with previous / next */
export const MediaViewer: React.FC<{
  item: EventMedia;
  position: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDownload: () => void;
}> = ({ item, position, total, onPrev, onNext, onClose, onEdit, onDelete, onDownload }) => {
  const video = isVideo(item);
  const id = youTubeId(item.url);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext]);

  const backdrop = video ? (item.thumbnail_url || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : '')) : item.url;

  return (
    <div className="a-md-viewer" role="dialog" aria-modal="true" aria-label={item.title || 'Media'}>
      {backdrop && <img className="a-md-viewer-amb" src={backdrop} alt="" aria-hidden="true" />}
      <div className="a-md-viewer-top">
        <span className="a-md-viewer-count">{position} of {total}</span>
        <span className="a-md-viewer-name">{item.title || (video ? 'Video' : 'Image')}</span>
        <button ref={closeRef} type="button" className="a-md-vbtn" onClick={onClose} aria-label="Close">
          <AlfieIcon glyph="x" size={20} />
        </button>
      </div>

      <div className="a-md-viewer-main">
        <div className="a-md-stage" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
          {onPrev && (
            <button type="button" className="a-md-vbtn a-md-nav a-md-nav-l" onClick={onPrev} aria-label="Previous">
              <AlfieIcon glyph="chevL" size={22} />
            </button>
          )}
          {video ? (
            <div className="a-md-frame" key={item.id}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${id}`}
                title={item.title || 'YouTube video'}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          ) : (
            <img key={item.id} className="a-md-photo" src={item.url} alt={item.title || 'Event image'} />
          )}
          {onNext && (
            <button type="button" className="a-md-vbtn a-md-nav a-md-nav-r" onClick={onNext} aria-label="Next">
              <AlfieIcon glyph="chevR" size={22} />
            </button>
          )}
        </div>

        <aside className="a-md-info">
          <div className="a-md-info-scroll">
            <span className={`a-md-chip ${video ? 'a-md-chip-r' : 'a-md-chip-b'}`}>
              <AlfieIcon glyph={video ? 'video' : 'camera'} size={12} />{video ? 'YouTube Video' : 'Image'}
            </span>
            <h2 className="a-md-info-title">{item.title || 'Media Details'}</h2>
            <p className="a-md-info-date">Added on {mediaDate(item.created_at, true)}</p>
            {item.description && <p className="a-md-info-desc">{item.description}</p>}
            {(item.event_name || item.race_class || (item.isShared && item.sharedFrom)) && (
              <dl className="a-md-facts">
                {item.event_name && (<><dt><AlfieIcon glyph="cal" size={14} />Event</dt><dd>{item.event_name}</dd></>)}
                {item.race_class && (<><dt><AlfieIcon glyph="trophy" size={14} />Class</dt><dd>{item.race_class}</dd></>)}
                {item.isShared && item.sharedFrom && (<><dt><AlfieIcon glyph="share" size={14} />Shared by</dt><dd>{item.sharedFrom.name}</dd></>)}
              </dl>
            )}
          </div>
          <div className="a-md-info-acts">
            {video ? (
              <a
                href={`https://youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="a-btn a-btn-p a-md-wide"
              >
                <AlfieIcon glyph="ext" size={16} />
                Open in YouTube
              </a>
            ) : (
              <button type="button" onClick={onDownload} className="a-btn a-btn-p a-md-wide">
                <AlfieIcon glyph="download" size={16} />
                Download
              </button>
            )}
            <button type="button" onClick={onEdit} className="a-btn a-md-vact"><AlfieIcon glyph="pen" size={15} />Edit</button>
            <button type="button" onClick={onDelete} className="a-btn a-btn-d a-md-vact" aria-label="Delete"><AlfieIcon glyph="trash" size={15} /></button>
          </div>
        </aside>
      </div>
    </div>
  );
};
