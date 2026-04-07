import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Clock, ExternalLink } from 'lucide-react';
import type { SupportTutorial } from '../../types/helpSupport';

interface Props {
  title: string;
  description?: string;
  tutorials: SupportTutorial[];
  onPlay: (tutorial: SupportTutorial) => void;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SupportVideoRow({ title, description, tutorials, onPlay }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScroll, 300);
    }
  };

  if (tutorials.length === 0) return null;

  return (
    <div className="mb-10 group/row relative">
      <div className="px-2 mb-4">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {description && (
          <p className="text-sm text-slate-400 mt-1">{description}</p>
        )}
      </div>

      <div className="relative">
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-4 z-20 w-12 bg-gradient-to-r from-[#0f1a2e]/90 to-transparent flex items-center justify-start pl-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          onScroll={checkScroll}
        >
          <style>{`.support-video-row::-webkit-scrollbar { display: none; }`}</style>
          {tutorials.map(tutorial => (
            <VideoCard key={tutorial.id} tutorial={tutorial} onPlay={onPlay} />
          ))}
        </div>

        {canScrollRight && tutorials.length > 3 && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-4 z-20 w-12 bg-gradient-to-l from-[#0f1a2e]/90 to-transparent flex items-center justify-end pr-1 opacity-0 group-hover/row:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

function VideoCard({ tutorial, onPlay }: { tutorial: SupportTutorial; onPlay: (t: SupportTutorial) => void }) {
  return (
    <div
      className="flex-shrink-0 w-72 cursor-pointer group/card"
      onClick={() => onPlay(tutorial)}
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-800">
        {tutorial.thumbnail_url ? (
          <img
            src={tutorial.thumbnail_url}
            alt={tutorial.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
            onError={e => {
              (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${tutorial.youtube_video_id}/hqdefault.jpg`;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
            <Play size={32} className="text-slate-500" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/30 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity scale-75 group-hover/card:scale-100">
            <Play className="w-5 h-5 text-white ml-0.5 fill-current" />
          </div>
        </div>

        {tutorial.duration_seconds > 0 && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-medium flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(tutorial.duration_seconds)}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-semibold uppercase tracking-wider">
              <Play size={8} className="fill-current" /> Video
            </span>
          </div>
          <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug">
            {tutorial.title}
          </h3>
          {tutorial.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{tutorial.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
