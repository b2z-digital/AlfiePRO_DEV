import React from 'react';
import { MapPin, Calendar } from 'lucide-react';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { Logo } from './Logo';

interface RaceHeaderProps {
  event: RaceEvent;
  darkMode: boolean;
}

/**
 * Scoring header (design board SC_pro top bar): event title and meta on the
 * left, race progress on the right. Display only.
 */
export const RaceHeader: React.FC<RaceHeaderProps> = ({ event }) => {
  const completed = Math.max(0, Number((event as any).lastCompletedRace) || 0);
  const total = Math.max(Number((event as any).numRaces) || 0, completed, 1);
  const current = Math.min(completed + 1, total);
  const allDone = completed >= total && completed > 0;
  const dots = Math.min(total, 20);

  return (
    <div className="a-scorebar">
      <span className="a-scorebar-logo"><Logo className="w-7 h-7" /></span>
      <div className="min-w-0 flex-1">
        <h1 className="a-display a-scorebar-title">{event.eventName || event.clubName}</h1>
        <div className="a-scorebar-meta">
          {event.raceClass && <span className="a-badge-cls">{event.raceClass}</span>}
          {event.venue && (
            <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{event.venue}</span>
          )}
          {event.date && (
            <span className="inline-flex items-center gap-1.5"><Calendar size={14} />{formatDate(event.date)}</span>
          )}
        </div>
      </div>
      <div className="a-scorebar-race" aria-label={allDone ? `All ${total} races complete` : `Race ${current} of ${total}`}>
        <span className="a-cap">{allDone ? 'All races' : 'Race'}</span>
        <span className="a-num a-scorebar-n">
          {allDone ? total : current}<span className="a-dim"> / {total}</span>
        </span>
        <span className="a-scorebar-dots" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => (
            <span
              key={i}
              className={i < completed ? 'is-done' : i === completed && !allDone ? 'is-now' : ''}
            />
          ))}
        </span>
      </div>
    </div>
  );
};
