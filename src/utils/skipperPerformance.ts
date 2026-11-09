/**
 * Skipper performance for one event (wins, average finish, consistency, drop impact...).
 * Moved verbatim from SkipperPerformanceInsights so the desktop insights panel and the phone's
 * skipper card and compare screen always agree.
 */

export interface PerformanceStats {
  wins: number;
  winPercentage: number;
  avgFinish: number;
  top3Finishes: number;
  consistencyScore: number;
  consistencyIQR: number;
  coefficientOfVariation: number;
  dnfDnsPercentage: number;
  racesCompleted: number;
  totalRaces: number;
  positionHistory: number[];
  bestFinish: number;
  worstFinish: number;
  raceDropImpact: number;
  mostCommonFinish: number | null;
}

export function calculateSkipperPerformance(raceResults: any[], skipperIdx: number, eventDropRules?: number[] | null): PerformanceStats {
  const skipperResults = raceResults.filter(r => r.skipperIndex === skipperIdx);
  const positions = skipperResults
    .filter(r => r.position !== null && !r.letterScore)
    .map(r => r.position);

  const wins = positions.filter(p => p === 1).length;
  const winPercentage = positions.length > 0 ? (wins / positions.length) * 100 : 0;
  const top3 = positions.filter(p => p <= 3).length;
  const avgFinish = positions.length > 0
    ? positions.reduce((sum, p) => sum + p, 0) / positions.length
    : 0;

  // Standard Deviation
  const variance = positions.length > 1
    ? positions.reduce((sum, p) => sum + Math.pow(p - avgFinish, 2), 0) / positions.length
    : 0;
  const stdDev = Math.sqrt(variance);

  // IQR (Interquartile Range) - spread of middle 50%
  const sortedPositions = [...positions].sort((a, b) => a - b);
  const q1Index = Math.floor(sortedPositions.length * 0.25);
  const q3Index = Math.floor(sortedPositions.length * 0.75);
  const q1 = sortedPositions[q1Index] || 0;
  const q3 = sortedPositions[q3Index] || 0;
  const iqr = q3 - q1;

  // Coefficient of Variation - consistency relative to performance
  const coefficientOfVariation = avgFinish > 0 ? (stdDev / avgFinish) : 0;

  // Most Common Finish Position (Mode)
  const positionCounts: { [key: number]: number } = {};
  positions.forEach(p => {
    positionCounts[p] = (positionCounts[p] || 0) + 1;
  });
  let mostCommonFinish: number | null = null;
  let maxCount = 0;
  Object.entries(positionCounts).forEach(([pos, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostCommonFinish = parseInt(pos);
    }
  });

  // Race Drop Impact (Gross Score - Net Score)
  // Use points if available, otherwise use position (for races without calculated points)
  const allRacePoints = skipperResults.map(r => {
    if (r.points !== undefined && r.points !== null) return r.points;
    if (r.position !== undefined && r.position !== null) return r.position;
    return 0;
  });
  const grossScore = allRacePoints.reduce((sum, p) => sum + p, 0);

  let netScore = grossScore;
  const dropRules = (eventDropRules && eventDropRules.length > 0)
    ? eventDropRules
    : [4, 8, 16, 24, 32, 40];

  if (skipperResults.length > 0) {
    let racesToDrop = 0;
    // Use total number of races (skipperResults.length) not just completed races (positions.length)
    for (const threshold of dropRules) {
      if (skipperResults.length >= threshold) {
        racesToDrop++;
      } else {
        break;
      }
    }

    if (racesToDrop > 0) {
      const sortedPoints = [...allRacePoints].sort((a, b) => b - a);
      const droppedPoints = sortedPoints.slice(0, racesToDrop).reduce((sum, p) => sum + p, 0);
      netScore = grossScore - droppedPoints;
    }
  }
  const raceDropImpact = grossScore - netScore;

  const dnfDns = skipperResults.filter(r =>
    r.letterScore === 'DNF' || r.letterScore === 'DNS' || r.letterScore === 'DNC'
  ).length;
  const dnfDnsPercentage = skipperResults.length > 0
    ? (dnfDns / skipperResults.length) * 100
    : 0;

  const bestFinish = positions.length > 0 ? Math.min(...positions) : 0;
  const worstFinish = positions.length > 0 ? Math.max(...positions) : 0;

  return {
    wins,
    winPercentage: Math.round(winPercentage * 10) / 10,
    avgFinish: Math.round(avgFinish * 10) / 10,
    top3Finishes: top3,
    consistencyScore: Math.round((iqr + coefficientOfVariation) * 10) / 10,
    consistencyIQR: Math.round(iqr * 10) / 10,
    coefficientOfVariation: Math.round(coefficientOfVariation * 100) / 100,
    dnfDnsPercentage: Math.round(dnfDnsPercentage),
    racesCompleted: positions.length,
    totalRaces: skipperResults.length,
    positionHistory: positions,
    bestFinish,
    worstFinish,
    raceDropImpact,
    mostCommonFinish
  };
}
