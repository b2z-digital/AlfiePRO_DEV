import React from 'react';
import { AlfieIcon } from '../../brand/AlfieIcon';
import type { LivestreamSession } from '../../../types/livestream';
import { ChannelAvatar, InfoIcon, PlayIcon, VolumeIcon, TVChannelLite, TVHeroBackdrop, TVVideo, compactNumber, formatDuration, formatScheduledDate, timeAgo } from './TVParts';

export type TVStream = LivestreamSession & { venue_image?: string; club_name?: string };
export type TVHeroSlide =
  | { type: 'live'; stream: TVStream }
  | { type: 'upcoming'; stream: TVStream }
  | { type: 'video'; video: TVVideo };

export const HERO_SECONDS = 30;

const slideImage = (s: TVHeroSlide) =>
  s.type === 'video'
    ? (s.video.thumbnail_high_url || s.video.thumbnail_url || (s.video.youtube_id ? `https://i.ytimg.com/vi/${s.video.youtube_id}/hqdefault.jpg` : ''))
    : s.stream.venue_image || '';

export const TVHero: React.FC<{
  slides: TVHeroSlide[];
  index: number;
  onIndex: (i: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  channelOf: (id?: string | null) => TVChannelLite | null;
  inList: (id: string) => boolean;
  onPlay: (v: TVVideo) => void;
  onToggleList: (e: React.MouseEvent, v: TVVideo) => void;
  onInfo: (v: TVVideo) => void;
  onWatchLive: (s: TVStream) => void;
}> = ({ slides, index, onIndex, muted, onToggleMute, channelOf, inList, onPlay, onToggleList, onInfo, onWatchLive }) => {
  const slide = slides[index];
  if (!slide) return null;
  const n = slides.length;
  const go = (d: number) => onIndex((index + d + n) % n);

  let content: React.ReactNode;
  if (slide.type === 'live') {
    const s = slide.stream;
    content = (
      <>
        <div className="atv-hero-kicker">
          <span className="atv-badge atv-badge-live"><i />Live now</span>
          {s.viewer_count > 0 && <span className="atv-hero-dim">{s.viewer_count} watching</span>}
        </div>
        <h1 className="atv-hero-title">{s.title}</h1>
        {s.club_name && <p className="atv-hero-desc">Hosted by {s.club_name}</p>}
        <div className="atv-btns">
          <button type="button" className="atv-btn atv-btn-live" onClick={() => onWatchLive(s)}>
            <AlfieIcon glyph="radio" size={18} />Watch Live
          </button>
        </div>
      </>
    );
  } else if (slide.type === 'upcoming') {
    const s = slide.stream;
    const when = new Date(s.scheduled_start_time!);
    content = (
      <>
        <div className="atv-hero-kicker">
          <span className="atv-badge atv-badge-soon"><AlfieIcon glyph="radio" size={13} />Coming soon</span>
          <span className="atv-hero-dim">{formatScheduledDate(s.scheduled_start_time!)}</span>
        </div>
        <h1 className="atv-hero-title">{s.title}</h1>
        {s.club_name && <p className="atv-hero-desc">Hosted by {s.club_name}</p>}
        <div className="atv-btns">
          <span className="atv-btn atv-btn-glass atv-btn-static">
            <AlfieIcon glyph="cal" size={17} />
            {when.toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' })}
            {' · '}
            {when.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </>
    );
  } else {
    const v = slide.video;
    const ch = channelOf(v.channel_id);
    const listed = inList(v.id);
    content = (
      <>
        <div className="atv-hero-kicker">
          {ch && <span className="atv-hero-ch"><ChannelAvatar channel={ch} size={26} />{ch.channel_name}</span>}
          {v.is_featured && <span className="atv-badge atv-badge-spectrum">Featured</span>}
        </div>
        <h1 className="atv-hero-title">{v.title}</h1>
        <div className="atv-hero-meta">
          {formatDuration(v.duration) && <span>{formatDuration(v.duration)}</span>}
          {v.view_count ? <span>{compactNumber(v.view_count)} views</span> : null}
          {v.published_at && <span>{timeAgo(v.published_at)}</span>}
        </div>
        {v.description && <p className="atv-hero-desc atv-clamp-2">{v.description}</p>}
        <div className="atv-btns">
          <button type="button" className="atv-btn atv-btn-play" onClick={() => onPlay(v)}><PlayIcon size={20} />Play</button>
          <button type="button" className="atv-btn atv-btn-glass" onClick={e => onToggleList(e, v)}>
            <AlfieIcon glyph={listed ? 'check' : 'plus'} size={18} strokeWidth={2.2} />{listed ? 'In My List' : 'My List'}
          </button>
          <button type="button" className="atv-btn atv-btn-glass atv-btn-icon" onClick={() => onInfo(v)} aria-label="More info" title="More info">
            <InfoIcon size={20} />
          </button>
        </div>
      </>
    );
  }

  return (
    <section className={`atv-hero is-${slide.type}`} aria-roledescription="carousel" aria-label="Featured">
      <TVHeroBackdrop
        key={slide.type === 'video' ? slide.video.id : slide.stream.id}
        youtubeId={slide.type === 'video' ? slide.video.youtube_id : null}
        image={slideImage(slide)}
        muted={muted}
        tint={slide.type === 'live' ? 'live' : slide.type === 'upcoming' ? 'soon' : undefined}
      />

      <div className="atv-hero-content" key={`c-${index}`}>{content}</div>

      {slide.type === 'video' && (
        <button type="button" className="atv-round atv-hero-mute" onClick={onToggleMute} aria-label={muted ? 'Unmute preview' : 'Mute preview'} title={muted ? 'Unmute' : 'Mute'}>
          <VolumeIcon muted={muted} size={18} />
        </button>
      )}

      {n > 1 && (
        <>
          <button type="button" className="atv-hero-arrow atv-hero-arrow-l" onClick={() => go(-1)} aria-label="Previous"><AlfieIcon glyph="chevL" size={26} strokeWidth={2} /></button>
          <button type="button" className="atv-hero-arrow atv-hero-arrow-r" onClick={() => go(1)} aria-label="Next"><AlfieIcon glyph="chevR" size={26} strokeWidth={2} /></button>
          <div className="atv-hero-rail" role="tablist" aria-label="Featured items">
            {slides.map((s, i) => {
              const img = slideImage(s);
              const label = s.type === 'video' ? s.video.title : s.stream.title;
              return (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={label}
                  title={label}
                  className={`atv-hero-tab is-${s.type} ${i === index ? 'is-on' : ''}`}
                  onClick={() => onIndex(i)}
                >
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="atv-hero-tab-ph" />}
                  {s.type === 'live' && <span className="atv-hero-tab-tag">LIVE</span>}
                  {s.type === 'upcoming' && <span className="atv-hero-tab-tag is-soon">SOON</span>}
                  {i === index && <span className="atv-hero-tab-bar" key={`bar-${index}`} style={{ animationDuration: `${HERO_SECONDS}s` }} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};
