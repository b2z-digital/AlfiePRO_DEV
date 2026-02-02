import React, { useState, useEffect } from 'react';
import { Trophy, Medal, ChevronDown, ChevronUp, Calendar, MapPin } from 'lucide-react';
import { RaceSeries } from '../types/race';
import { formatDate } from '../utils/date';

interface SeriesLeaderboardProps {
  series: RaceSeries;
  darkMode: boolean;
}

export const SeriesLeaderboard: React.FC<SeriesLeaderboardProps> = ({
  series,
  darkMode
}) => {
  const [expandedSkipper, setExpandedSkipper] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0);

  return (
    <div className="bg-slate-800 p-6 rounded-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">{series.seriesName}</h2>
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="px-2 py-1 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400">
            {series.raceClass}
          </div>
          <div className="px-2 py-1 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400">
            {series.raceFormat === 'handicap' ? 'Handicap' : 'Scratch'}
          </div>
        </div>
      </div>
      
      <div className="text-center py-8">
        <p className="text-slate-400">Series leaderboard is being rebuilt</p>
      </div>
    </div>
  );
};

export default SeriesLeaderboard;