import React from 'react';
import { Trophy, MapPin, Calendar } from 'lucide-react';
import { RaceEvent } from '../types/race';
import { formatDate } from '../utils/date';
import { Logo } from './Logo';

interface RaceHeaderProps {
  event: RaceEvent;
  darkMode: boolean;
}

export const RaceHeader: React.FC<RaceHeaderProps> = ({ event, darkMode }) => {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3 justify-center mb-2">
        <Logo className="w-10 h-10" />
        <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          {event.eventName || event.clubName}
        </h1>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400">
        <div className="flex items-center gap-1">
          <Trophy size={16} />
          <span>{event.raceClass}</span>
        </div>
        <div className="flex items-center gap-1">
          <MapPin size={14} />
          <span>{event.venue}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={14} />
          <span>{formatDate(event.date)}</span>
        </div>
      </div>
    </div>
  );
};