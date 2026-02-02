import React, { useState } from 'react';
import {
  Trophy,
  Award,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Flag,
} from 'lucide-react';
import type { SkipperDashboardData, SessionSkipperTracking } from '../../types/liveTracking';
import type { RaceEvent } from '../../types/race';
import type { HeatManagement, HeatDesignation } from '../../types/heat';

interface Props {
  activeTab: 'overview' | 'results' | 'performance' | 'heat';
  dashboardData: SkipperDashboardData;
  fullEvent: RaceEvent | null;
  calculatedStandings: any[];
  heatManagement: HeatManagement | null;
  tracking: SessionSkipperTracking | null;
  getPromotionStatusBadge: () => React.ReactNode;
  getHeatColor: (heat: HeatDesignation) => string;
}

export default function LiveTrackingTabContent({
  activeTab,
  dashboardData,
  fullEvent,
  calculatedStandings,
  heatManagement,
  tracking,
  getPromotionStatusBadge,
  getHeatColor,
}: Props) {
  const [standingsLimit, setStandingsLimit] = useState(10);

  const handleLoadMore = () => {
    setStandingsLimit(prev => Math.min(prev + 10, dashboardData.standings.length));
  };

  // Overview Tab Content
  const renderOverviewTab = () => (
    <>
      {/* Current Heat Assignment */}
      {dashboardData.skipper.current_heat && (
        <div className={`bg-gradient-to-r ${getHeatColor(dashboardData.skipper.current_heat)} rounded-2xl p-6 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/90 font-semibold mb-1">You're Racing In</p>
              <h2 className="text-5xl font-black text-white mb-1">
                Heat {dashboardData.skipper.current_heat}
              </h2>
              <p className="text-white/90 font-semibold text-xl">
                Round {dashboardData.skipper.current_round}
              </p>
            </div>
            <div className="p-5 bg-white/20 backdrop-blur-sm rounded-xl">
              <Flag size={48} className="text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Promotion Badge */}
      {tracking?.promotion_status && (
        <div className="flex justify-center">
          {getPromotionStatusBadge()}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl mb-3 shadow-lg">
              <Trophy className="text-white" size={28} />
            </div>
            <p className="text-4xl font-black text-slate-900 mb-1">
              {dashboardData.current_status.position
                ? `${dashboardData.current_status.position}${getOrdinalSuffix(
                    dashboardData.current_status.position
                  )}`
                : '-'}
            </p>
            <p className="text-sm text-slate-600 font-medium">Position</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-2xl mb-3 shadow-lg">
              <Award className="text-white" size={28} />
            </div>
            <p className="text-4xl font-black text-slate-900 mb-1">
              {dashboardData.current_status.total_points?.toFixed(1) || '0'}
            </p>
            <p className="text-sm text-slate-600 font-medium">NET Points</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
          <div className="flex flex-col items-center text-center">
            <div className="p-3 bg-gradient-to-br from-purple-400 to-violet-600 rounded-2xl mb-3 shadow-lg">
              <Activity className="text-white" size={28} />
            </div>
            <p className="text-4xl font-black text-slate-900 mb-1">
              {dashboardData.current_status.races_completed}
            </p>
            <p className="text-sm text-slate-600 font-medium">Races</p>
          </div>
        </div>
      </div>

      {/* Overall Standings */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-2xl font-bold text-slate-900 mb-4">
          {standingsLimit === 10 ? 'Top 10 - ' : ''}Overall Standings
        </h3>
        <div className="space-y-2">
          {dashboardData.standings.slice(0, standingsLimit).map((skipper, index) => (
            <div
              key={skipper.sail_number}
              className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                skipper.is_current_user
                  ? 'bg-gradient-to-r from-cyan-50 to-blue-50 ring-2 ring-cyan-400'
                  : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-black text-lg ${
                    index === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white'
                      : index === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white'
                      : index === 2
                      ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {skipper.position}
                </div>
                {skipper.avatar_url ? (
                  <img
                    src={skipper.avatar_url}
                    alt={skipper.name}
                    className={`w-12 h-12 rounded-full object-cover ${
                      skipper.is_current_user ? 'ring-2 ring-cyan-400' : 'ring-2 ring-slate-200'
                    }`}
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white ${
                      skipper.is_current_user
                        ? 'bg-gradient-to-br from-cyan-500 to-blue-600'
                        : 'bg-slate-400'
                    }`}
                  >
                    {skipper.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className={`font-bold ${skipper.is_current_user ? 'text-cyan-700' : 'text-slate-900'}`}>
                    {skipper.name}
                  </p>
                  <p className="text-sm text-slate-600">Sail {skipper.sail_number}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-slate-900 text-xl">{skipper.points.toFixed(1)}</p>
                <p className="text-xs text-slate-600">{skipper.races_completed} races</p>
              </div>
            </div>
          ))}
        </div>
        {standingsLimit < dashboardData.standings.length && (
          <button
            onClick={handleLoadMore}
            className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all shadow-md"
          >
            Load More ({dashboardData.standings.length - standingsLimit} remaining)
          </button>
        )}
      </div>
    </>
  );

  // Results Tab Content - Full results table
  const renderResultsTab = () => {
    if (!fullEvent || !calculatedStandings.length) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">No results available yet</p>
        </div>
      );
    }

    const skippersList = Array.isArray(fullEvent.skippers) ? fullEvent.skippers : [];
    const raceResults = fullEvent.raceResults || fullEvent.race_results || [];

    // Group results by race
    const resultsByRace: Record<number, any[]> = {};
    raceResults.forEach((result: any) => {
      const raceNum = result.race || 1;
      if (!resultsByRace[raceNum]) {
        resultsByRace[raceNum] = [];
      }
      resultsByRace[raceNum].push(result);
    });

    const raceNumbers = Object.keys(resultsByRace).map(Number).sort((a, b) => a - b);

    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-blue-50">
          <h3 className="text-2xl font-bold text-slate-900">Full Results Table</h3>
          <p className="text-sm text-slate-600 mt-1">Showing NET scores with drops applied</p>
        </div>

        {/* Mobile-optimized scrollable table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-3 text-left font-bold text-slate-700 border-b border-slate-200 sticky left-0 bg-slate-50 z-10">
                  Pos
                </th>
                <th className="px-3 py-3 text-left font-bold text-slate-700 border-b border-slate-200 sticky left-12 bg-slate-50 z-10 min-w-[150px]">
                  Skipper
                </th>
                {raceNumbers.map((raceNum) => (
                  <th
                    key={raceNum}
                    className="px-3 py-3 text-center font-bold text-slate-700 border-b border-slate-200 min-w-[60px]"
                  >
                    R{raceNum}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-bold text-cyan-700 border-b border-slate-200 bg-cyan-50 min-w-[80px]">
                  NET
                </th>
              </tr>
            </thead>
            <tbody>
              {calculatedStandings.map((standing) => {
                const skipper = skippersList[standing.index];
                const sailNo = skipper?.sailNo || skipper?.sailNumber || skipper?.sail_number || '';
                const isCurrentUser = sailNo === dashboardData.skipper.sail_number;

                return (
                  <tr
                    key={standing.index}
                    className={`${
                      isCurrentUser
                        ? 'bg-gradient-to-r from-cyan-50 to-blue-50 ring-2 ring-inset ring-cyan-400'
                        : 'hover:bg-slate-50'
                    } transition-colors`}
                  >
                    <td className={`px-3 py-3 font-bold sticky left-0 z-10 ${isCurrentUser ? 'bg-cyan-50' : 'bg-white'}`}>
                      {standing.position}
                    </td>
                    <td className={`px-3 py-3 sticky left-12 z-10 ${isCurrentUser ? 'bg-cyan-50' : 'bg-white'}`}>
                      <div>
                        <p className={`font-semibold ${isCurrentUser ? 'text-cyan-700' : 'text-slate-900'}`}>
                          {skipper?.name || skipper?.skipper_name || ''}
                        </p>
                        <p className="text-xs text-slate-500">Sail {sailNo}</p>
                      </div>
                    </td>
                    {raceNumbers.map((raceNum) => {
                      const raceResult = resultsByRace[raceNum]?.find(
                        (r: any) => r.skipperIndex === standing.index
                      );
                      const isDropped = standing.isDropped && standing.isDropped[raceNum];

                      return (
                        <td
                          key={raceNum}
                          className={`px-3 py-3 text-center font-semibold ${
                            isDropped
                              ? 'text-red-600 line-through'
                              : raceResult?.letterScore
                              ? 'text-red-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {raceResult ? (
                            raceResult.letterScore || raceResult.position || '-'
                          ) : (
                            '-'
                          )}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-3 text-center font-black text-lg ${isCurrentUser ? 'text-cyan-700' : 'text-slate-900'} bg-cyan-50/50`}>
                      {standing.netTotal.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            <span><span className="inline-block w-3 h-3 bg-cyan-50 border border-cyan-400 rounded mr-1"></span> Your position</span>
            <span><span className="line-through mr-1">Score</span> (d) = Dropped</span>
            <span className="text-red-600 font-semibold">DNS, DNF, etc = Penalty</span>
          </div>
        </div>
      </div>
    );
  };

  // Performance Insights Tab Content
  const renderPerformanceTab = () => {
    if (!fullEvent || !calculatedStandings.length) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Performance data not available yet</p>
        </div>
      );
    }

    const skippersList = Array.isArray(fullEvent.skippers) ? fullEvent.skippers : [];
    const currentUserIndex = skippersList.findIndex(
      (s: any) =>
        (s.sailNo || s.sailNumber || s.sail_number) === dashboardData.skipper.sail_number
    );

    const currentUserStanding = calculatedStandings.find((s) => s.index === currentUserIndex);

    if (!currentUserStanding) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Your performance data is not available</p>
        </div>
      );
    }

    // Calculate performance metrics
    const raceResults = fullEvent.raceResults || fullEvent.race_results || [];
    const userResults = raceResults
      .filter((r: any) => r.skipperIndex === currentUserIndex)
      .sort((a: any, b: any) => (a.race || 0) - (b.race || 0));

    const positions = userResults
      .filter((r: any) => r.position && !r.letterScore)
      .map((r: any) => r.position);

    const averagePosition = positions.length > 0
      ? positions.reduce((sum, pos) => sum + pos, 0) / positions.length
      : 0;

    const bestPosition = positions.length > 0 ? Math.min(...positions) : 0;
    const worstPosition = positions.length > 0 ? Math.max(...positions) : 0;

    // Count top-3 finishes
    const topThreeFinishes = positions.filter((pos) => pos <= 3).length;

    // Calculate consistency (standard deviation)
    const variance =
      positions.length > 1
        ? positions.reduce((sum, pos) => sum + Math.pow(pos - averagePosition, 2), 0) /
          positions.length
        : 0;
    const consistency = Math.sqrt(variance);

    // Recent form (last 3 races)
    const recentRaces = userResults.slice(-3);
    const recentPositions = recentRaces
      .filter((r: any) => r.position && !r.letterScore)
      .map((r: any) => r.position);
    const recentAverage =
      recentPositions.length > 0
        ? recentPositions.reduce((sum, pos) => sum + pos, 0) / recentPositions.length
        : 0;

    const form = recentAverage < averagePosition ? 'improving' : recentAverage > averagePosition ? 'declining' : 'stable';

    return (
      <div className="space-y-5">
        {/* Performance Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-col items-center text-center">
              <Target className="text-blue-600 mb-2" size={32} />
              <p className="text-3xl font-black text-slate-900 mb-1">
                {averagePosition.toFixed(1)}
              </p>
              <p className="text-xs text-slate-600 font-medium">Avg Position</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-col items-center text-center">
              <Trophy className="text-yellow-600 mb-2" size={32} />
              <p className="text-3xl font-black text-slate-900 mb-1">{bestPosition}</p>
              <p className="text-xs text-slate-600 font-medium">Best Finish</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-col items-center text-center">
              <Award className="text-purple-600 mb-2" size={32} />
              <p className="text-3xl font-black text-slate-900 mb-1">{topThreeFinishes}</p>
              <p className="text-xs text-slate-600 font-medium">Top 3 Finishes</p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex flex-col items-center text-center">
              {form === 'improving' ? (
                <TrendingUp className="text-green-600 mb-2" size={32} />
              ) : form === 'declining' ? (
                <TrendingDown className="text-red-600 mb-2" size={32} />
              ) : (
                <Activity className="text-blue-600 mb-2" size={32} />
              )}
              <p className="text-lg font-black text-slate-900 mb-1 capitalize">{form}</p>
              <p className="text-xs text-slate-600 font-medium">Recent Form</p>
            </div>
          </div>
        </div>

        {/* Detailed Insights */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-2xl font-bold text-slate-900 mb-4">Performance Insights</h3>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Target size={20} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">Consistency Score</p>
                <p className="text-sm text-slate-600">
                  {consistency < 2 ? 'Excellent' : consistency < 4 ? 'Good' : 'Variable'} -{' '}
                  Your results vary by an average of {consistency.toFixed(1)} positions
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                {form === 'improving' ? (
                  <TrendingUp size={20} className="text-green-600" />
                ) : form === 'declining' ? (
                  <TrendingDown size={20} className="text-red-600" />
                ) : (
                  <Activity size={20} className="text-blue-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">Recent Form</p>
                <p className="text-sm text-slate-600">
                  {form === 'improving' && 'You\'re trending upward! Your last 3 races averaged better than your overall average.'}
                  {form === 'declining' && 'Recent races show room for improvement. Your last 3 averaged higher than usual.'}
                  {form === 'stable' && 'You\'re maintaining consistent performance across recent races.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Trophy size={20} className="text-yellow-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">Podium Performance</p>
                <p className="text-sm text-slate-600">
                  {topThreeFinishes > 0
                    ? `You've finished in the top 3 in ${topThreeFinishes} race${topThreeFinishes > 1 ? 's' : ''} (${((topThreeFinishes / positions.length) * 100).toFixed(0)}% of races)`
                    : 'Keep pushing for that first podium finish!'}
                </p>
              </div>
            </div>

            {worstPosition > 0 && (
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Activity size={20} className="text-slate-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Performance Range</p>
                  <p className="text-sm text-slate-600">
                    Your finishes range from {bestPosition} to {worstPosition}.
                    {worstPosition - bestPosition > 10 ? ' Focus on consistency to reduce this range.' : ' Great consistency!'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Race-by-Race Breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-2xl font-bold text-slate-900 mb-4">Race-by-Race Breakdown</h3>

          <div className="space-y-3">
            {userResults.map((result: any, index: number) => {
              const isDropped = currentUserStanding.isDropped && currentUserStanding.isDropped[result.race];
              const position = result.position || 0;

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    isDropped ? 'bg-slate-50' : 'bg-gradient-to-r from-slate-50 to-blue-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                      position <= 3 ? 'bg-yellow-100 text-yellow-700' :
                      position <= 10 ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-200 text-slate-700'
                    }`}>
                      {result.race}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">
                        Race {result.race}
                        {isDropped && <span className="ml-2 text-xs text-slate-500">(Dropped)</span>}
                      </p>
                      <p className="text-sm text-slate-600">
                        {result.letterScore || `Position: ${position}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-black ${isDropped ? 'text-red-600 line-through' : 'text-slate-900'}`}>
                      {result.letterScore || position}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Heat Progression Tab Content
  const renderHeatTab = () => {
    if (!heatManagement || !heatManagement.rounds || heatManagement.rounds.length === 0) {
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-600">Heat management not configured for this event</p>
        </div>
      );
    }

    const skippersList = Array.isArray(fullEvent?.skippers) ? fullEvent.skippers : [];
    const currentUserIndex = skippersList.findIndex(
      (s: any) =>
        (s.sailNo || s.sailNumber || s.sail_number) === dashboardData.skipper.sail_number
    );

    return (
      <div className="space-y-5">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-2xl font-bold text-slate-900 mb-4">Heat Progression</h3>

          <div className="space-y-4">
            {heatManagement.rounds.map((round) => {
              // Find ALL heats this skipper competed in during this round
              const assignments = round.heatAssignments.filter((ha) =>
                ha.skipperIndices.includes(currentUserIndex)
              );

              const isCurrent = round.round === heatManagement.currentRound;

              // Simplified heat border colors
              const heatColorMap: Record<HeatDesignation, string> = {
                'A': 'border-amber-400',
                'B': 'border-orange-500',
                'C': 'border-rose-500',
                'D': 'border-purple-500',
                'E': 'border-blue-500',
                'F': 'border-slate-500',
              };

              // Use the highest (best) heat for border color (A is best)
              const bestHeat = assignments.length > 0
                ? assignments.reduce((best, curr) =>
                    curr.heatDesignation < best.heatDesignation ? curr : best
                  ).heatDesignation
                : null;

              const borderColor = bestHeat && heatColorMap[bestHeat]
                ? heatColorMap[bestHeat]
                : 'border-slate-200';

              return (
                <div
                  key={round.round}
                  className={`p-5 rounded-xl border-2 ${borderColor} ${
                    isCurrent
                      ? 'bg-gradient-to-r from-cyan-50 to-blue-50'
                      : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm text-slate-600 font-medium">Round {round.round}</p>
                      {assignments.length > 0 && (
                        <div className="flex items-center gap-2 mt-1">
                          {assignments.length === 1 ? (
                            <p className={`text-3xl font-black ${isCurrent ? 'text-cyan-700' : 'text-slate-900'}`}>
                              Heat {assignments[0].heatDesignation}
                            </p>
                          ) : (
                            <>
                              <p className={`text-xl font-black ${isCurrent ? 'text-cyan-700' : 'text-slate-900'}`}>
                                Heats: {assignments.map(a => a.heatDesignation).sort().join(' → ')}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="px-3 py-1 bg-cyan-600 text-white text-xs font-bold rounded-full">
                        CURRENT
                      </span>
                    )}
                  </div>

                  {assignments.length > 0 && (
                    <div className="space-y-3">
                      {assignments.map((assignment, assignmentIdx) => (
                        <div key={`${round.round}-${assignment.heatDesignation}`} className={assignmentIdx > 0 ? 'pt-3 border-t border-slate-200' : ''}>
                          <div className="flex items-center gap-2 mb-2">
                            <p className={`text-lg font-bold ${isCurrent ? 'text-cyan-700' : 'text-slate-900'}`}>
                              Heat {assignment.heatDesignation}
                            </p>
                            {assignments.length > 1 && (
                              <span className="text-xs text-slate-500 font-medium">
                                ({assignmentIdx === 0 ? 'Started' : assignmentIdx === assignments.length - 1 ? 'Final' : `Race ${assignmentIdx + 1}`})
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-700 mb-2">Competitors:</p>
                          <div className="flex flex-wrap gap-2">
                            {assignment.skipperIndices
                              .map((idx) => {
                                const skipper = skippersList[idx];
                                const isCurrentUser = idx === currentUserIndex;
                                return (
                                  <div
                                    key={idx}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                                      isCurrentUser
                                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white ring-2 ring-cyan-400 shadow-md'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {skipper?.name || skipper?.skipper_name || 'Unknown'} ({skipper?.sailNo || skipper?.sailNumber || skipper?.sail_number})
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {tracking?.promotion_status && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-3">Promotion Status</h3>
            {getPromotionStatusBadge()}
          </div>
        )}
      </div>
    );
  };

  // Main render based on active tab
  switch (activeTab) {
    case 'overview':
      return renderOverviewTab();
    case 'results':
      return renderResultsTab();
    case 'performance':
      return renderPerformanceTab();
    case 'heat':
      return renderHeatTab();
    default:
      return renderOverviewTab();
  }
}

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
