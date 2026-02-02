import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, TrendingUp, Award, Target, BarChart3, Plus, Search, ChevronDown, Users, Info, LogOut } from 'lucide-react';
import { Skipper } from '../types';
import { RaceEvent } from '../types/race';

interface SkipperPerformanceInsightsProps {
  skipper: Skipper;
  skipperIndex: number;
  event: RaceEvent;
  darkMode?: boolean;
  allSkippers: Skipper[];
  raceResults: any[];
  onClose: () => void;
  hideHeader?: boolean;
  useSkipperOrderForComparison?: boolean;
}

interface PerformanceStats {
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

type StatCategory = 'wins' | 'avgFinish' | 'top3Finishes' | 'consistencyScore' | 'dnfDnsPercentage';

type ChartView = 'radar' | 'finishDistribution' | 'positionTrend' | 'headToHead' | 'consistencyComparison';

export const SkipperPerformanceInsights: React.FC<SkipperPerformanceInsightsProps> = ({
  skipper,
  skipperIndex,
  event,
  darkMode = true,
  allSkippers,
  raceResults,
  onClose,
  hideHeader = false,
  useSkipperOrderForComparison = false
}) => {
  const [comparePodiumMode, setComparePodiumMode] = useState(true);
  const [compareSkippers, setCompareSkippers] = useState<(number | null)[]>([null, null]);
  const [showSkipperSelector, setShowSkipperSelector] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [chartView, setChartView] = useState<ChartView>('radar');
  const [selectedStatCategory, setSelectedStatCategory] = useState<StatCategory>('wins');
  const [showStatDropdown, setShowStatDropdown] = useState(false);
  const [showChartViewDropdown, setShowChartViewDropdown] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{x: number, y: number, data: any} | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<any>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const calculateStats = (skipperIdx: number): PerformanceStats => {
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

    // Calculate net score with drops
    let netScore = grossScore;
    console.log('Drop calculation for skipper:', {
      skipperIdx,
      event_dropRules: event.dropRules,
      skipperResults_length: skipperResults.length,
      allRacePoints,
      grossScore
    });

    if (event.dropRules && event.dropRules.length > 0 && skipperResults.length > 0) {
      const dropRules = event.dropRules;
      let racesToDrop = 0;
      // Use total number of races (skipperResults.length) not just completed races (positions.length)
      for (const threshold of dropRules) {
        if (skipperResults.length >= threshold) {
          racesToDrop++;
        } else {
          break;
        }
      }

      console.log('Drop rules applied:', { racesToDrop, dropRules });

      if (racesToDrop > 0) {
        const sortedPoints = [...allRacePoints].sort((a, b) => b - a);
        const droppedPoints = sortedPoints.slice(0, racesToDrop).reduce((sum, p) => sum + p, 0);
        netScore = grossScore - droppedPoints;
        console.log('After drops:', { sortedPoints, droppedPoints, netScore });
      }
    }
    const raceDropImpact = grossScore - netScore;
    console.log('Final drop impact:', raceDropImpact);

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
      consistencyScore: Math.round(stdDev * 10) / 10,
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
  };

  const stats = useMemo(() => calculateStats(skipperIndex), [skipperIndex, raceResults, event]);

  // Get top 3 skippers based on event standings
  const getTop3Skippers = useMemo(() => {
    // If useSkipperOrderForComparison is true, use the allSkippers order as-is
    if (useSkipperOrderForComparison) {
      return allSkippers
        .map((_, idx) => idx)
        .filter(idx => idx !== skipperIndex)
        .slice(0, 2);
    }

    const skipperStats = allSkippers.map((_, idx) => ({
      index: idx,
      stats: calculateStats(idx)
    }));

    // Sort by average finish (lower is better)
    const sorted = skipperStats.sort((a, b) => {
      if (a.stats.avgFinish === 0 && b.stats.avgFinish === 0) return 0;
      if (a.stats.avgFinish === 0) return 1;
      if (b.stats.avgFinish === 0) return -1;
      return a.stats.avgFinish - b.stats.avgFinish;
    });

    return sorted.slice(0, 3).map(s => s.index).filter(idx => idx !== skipperIndex);
  }, [allSkippers, raceResults, skipperIndex, event, useSkipperOrderForComparison]);

  // Auto-populate podium skippers when podium mode is on
  useEffect(() => {
    if (comparePodiumMode) {
      const top3 = getTop3Skippers;
      setCompareSkippers([top3[0] ?? null, top3[1] ?? null]);
    }
  }, [comparePodiumMode, getTop3Skippers]);

  const handleAddSkipper = (slotIndex: number, skipperIdx: number) => {
    const newCompareSkippers = [...compareSkippers];
    newCompareSkippers[slotIndex] = skipperIdx;
    setCompareSkippers(newCompareSkippers);
    setShowSkipperSelector(null);
    setSearchTerm('');
  };

  const handleRemoveSkipper = (slotIndex: number) => {
    const newCompareSkippers = [...compareSkippers];
    newCompareSkippers[slotIndex] = null;
    setCompareSkippers(newCompareSkippers);
  };

  const availableSkippers = allSkippers.filter((_, idx) =>
    idx !== skipperIndex && !compareSkippers.includes(idx)
  );

  const filteredSkippers = availableSkippers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statLabels: Record<StatCategory, string> = {
    wins: 'Wins',
    avgFinish: 'Average Finish',
    top3Finishes: 'Top 3 Finishes',
    consistencyScore: 'Consistency Score',
    dnfDnsPercentage: 'DNF/DNS %'
  };

  const chartViewLabels: Record<ChartView, string> = {
    radar: 'Performance Radar',
    finishDistribution: 'Finish Distribution',
    positionTrend: 'Position Trend',
    headToHead: 'Head-to-Head',
    consistencyComparison: 'Consistency Analysis'
  };

  const statInfo: Record<string, { title: string; description: string }> = {
    wins: {
      title: 'Wins',
      description: 'Total number of first place finishes achieved by the skipper. Win percentage shows the ratio of wins to total races completed, indicating overall dominance.'
    },
    avgFinish: {
      title: 'Average Finish',
      description: 'The mean finishing position across all completed races. Lower values indicate better overall performance. This metric provides a clear picture of typical race outcomes.'
    },
    top3: {
      title: 'Top 3 Finishes',
      description: 'Total number of podium finishes (1st, 2nd, or 3rd place). This metric shows consistency at the front of the fleet and competitive performance.'
    },
    consistency: {
      title: 'Consistency',
      description: 'Measures performance variability using three metrics:\n\n• Standard Deviation: Overall spread of finishing positions\n• IQR (Interquartile Range): Spread of the middle 50% of finishes, less affected by outliers\n• Coefficient of Variation: Consistency relative to average performance (Std Dev ÷ Avg Finish)\n\nLower values indicate more consistent performance.'
    },
    dnfDns: {
      title: 'DNF/DNS Rate',
      description: 'Percentage of races not completed (Did Not Finish, Did Not Start, or Did Not Compete). Lower values indicate better reliability and participation.'
    },
    dropImpact: {
      title: 'Race Drop Impact',
      description: 'The difference between gross score and net score, showing how many points were saved by dropping worst results. Higher values indicate greater benefit from the drop score rule, suggesting some poor performances that were discarded.'
    },
    completion: {
      title: 'Race Completion',
      description: 'Shows the ratio of races completed versus total races entered. This metric indicates participation level and reliability.'
    },
    commonFinish: {
      title: 'Most Common Finish',
      description: 'The finishing position that occurs most frequently (statistical mode). This reveals the skipper\'s typical performance level and comfort zone.'
    }
  };

  // Render charts based on selected view
  useEffect(() => {
    if (viewMode === 'chart' && canvasRef.current && compareSkippers.some(s => s !== null)) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Destroy existing chart
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }

      const mainStats = stats;
      const compareStats = compareSkippers
        .filter(idx => idx !== null)
        .map(idx => calculateStats(idx as number));

      // Clear canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      const colors = ['rgb(59, 130, 246)', 'rgb(249, 115, 22)', 'rgb(34, 197, 94)'];

      switch (chartView) {
        case 'radar':
          drawRadarChart(ctx, mainStats, compareStats, colors);
          break;
        case 'finishDistribution':
          drawFinishDistribution(ctx, mainStats, compareStats, colors);
          break;
        case 'positionTrend':
          drawPositionTrend(ctx, mainStats, compareStats, colors);
          break;
        case 'headToHead':
          drawHeadToHead(ctx, mainStats, compareStats, colors);
          break;
        case 'consistencyComparison':
          drawConsistencyComparison(ctx, mainStats, compareStats, colors);
          break;
      }

      chartInstanceRef.current = { destroy: () => {} };
    }
  }, [viewMode, chartView, compareSkippers, stats]);

  // Radar Chart
  const drawRadarChart = (ctx: CanvasRenderingContext2D, mainStats: PerformanceStats, compareStats: PerformanceStats[], colors: string[]) => {
    const normalizeData = (s: PerformanceStats) => ({
      wins: s.wins,
      avgFinish: s.totalRaces > 0 ? ((s.totalRaces - s.avgFinish) / s.totalRaces) * 10 : 0,
      top3: s.top3Finishes,
      consistency: s.totalRaces > 0 ? ((s.totalRaces - s.consistencyScore) / s.totalRaces) * 10 : 0,
      completion: 100 - s.dnfDnsPercentage
    });

    const mainData = normalizeData(mainStats);
    const compareData = compareStats.map(s => normalizeData(s));

    const centerX = canvasRef.current!.width / 2;
    const centerY = canvasRef.current!.height / 2;
    const radius = Math.min(centerX, centerY) - 60;
    const numAxes = 5;

    // Draw grid circles
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius / 5) * i, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw axes and labels
    const labels = ['Wins', 'Avg\\nFinish', 'Top 3', 'Consistency', 'Completion'];
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numAxes; i++) {
      const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(x, y);
      ctx.stroke();

      const labelX = centerX + (radius + 30) * Math.cos(angle);
      const labelY = centerY + (radius + 30) * Math.sin(angle);
      ctx.fillText(labels[i], labelX, labelY);
    }

    const drawPolygon = (data: any, color: string, fillAlpha: number) => {
      const values = [data.wins, data.avgFinish, data.top3, data.consistency, data.completion];
      const maxValue = 10;

      ctx.beginPath();
      for (let i = 0; i < numAxes; i++) {
        const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
        const value = Math.min(values[i], maxValue);
        const distance = (value / maxValue) * radius;
        const x = centerX + distance * Math.cos(angle);
        const y = centerY + distance * Math.sin(angle);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.fillStyle = color.replace(')', `, ${fillAlpha})`).replace('rgb', 'rgba');
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = color;
      for (let i = 0; i < numAxes; i++) {
        const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
        const value = Math.min(values[i], maxValue);
        const distance = (value / maxValue) * radius;
        const x = centerX + distance * Math.cos(angle);
        const y = centerY + distance * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    compareData.forEach((data, idx) => drawPolygon(data, colors[idx + 1], 0.1));
    drawPolygon(mainData, colors[0], 0.2);
  };

  // Finish Distribution
  const drawFinishDistribution = (ctx: CanvasRenderingContext2D, mainStats: PerformanceStats, compareStats: PerformanceStats[], colors: string[]) => {
    const allStats = [mainStats, ...compareStats];
    const maxPosition = Math.max(...allStats.flatMap(s => s.positionHistory));

    const width = canvasRef.current!.width;
    const height = canvasRef.current!.height;
    const padding = 60;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Draw axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Labels
    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Position', width / 2, height - 20);
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency', 0, 0);
    ctx.restore();

    // Draw bars
    const barWidth = chartWidth / (maxPosition * allStats.length + maxPosition);
    allStats.forEach((stat, statIdx) => {
      const positionCounts: { [key: number]: number } = {};
      stat.positionHistory.forEach(p => {
        positionCounts[p] = (positionCounts[p] || 0) + 1;
      });

      const maxCount = Math.max(...Object.values(positionCounts));

      Object.entries(positionCounts).forEach(([pos, count]) => {
        const x = padding + (parseInt(pos) - 1) * (chartWidth / maxPosition) + statIdx * barWidth;
        const barHeight = (count / maxCount) * chartHeight * 0.8;
        const y = height - padding - barHeight;

        ctx.fillStyle = colors[statIdx];
        ctx.fillRect(x, y, barWidth * 0.8, barHeight);
      });
    });

    // Draw position numbers on X-axis
    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    for (let pos = 1; pos <= maxPosition; pos++) {
      const x = padding + (pos - 0.5) * (chartWidth / maxPosition);
      ctx.fillText(pos.toString(), x, height - padding + 15);
    }
  };

  // Position Trend
  const drawPositionTrend = (ctx: CanvasRenderingContext2D, mainStats: PerformanceStats, compareStats: PerformanceStats[], colors: string[]) => {
    const allStats = [mainStats, ...compareStats];
    const maxRaces = Math.max(...allStats.map(s => s.positionHistory.length));
    const maxPosition = Math.max(...allStats.flatMap(s => s.positionHistory));

    const width = canvasRef.current!.width;
    const height = canvasRef.current!.height;
    const padding = 60;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Draw axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Grid lines and position labels on Y-axis
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 1; i <= maxPosition; i++) {
      const y = padding + (i / maxPosition) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();

      // Draw position number on Y-axis
      ctx.fillText(i.toString(), padding - 8, y);
    }

    // Draw lines
    allStats.forEach((stat, statIdx) => {
      if (stat.positionHistory.length === 0) return;

      ctx.strokeStyle = colors[statIdx];
      ctx.lineWidth = 2;
      ctx.beginPath();

      stat.positionHistory.forEach((pos, idx) => {
        const x = padding + (idx / (maxRaces - 1)) * chartWidth;
        const y = padding + (pos / maxPosition) * chartHeight;

        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.stroke();

      // Draw points
      ctx.fillStyle = colors[statIdx];
      stat.positionHistory.forEach((pos, idx) => {
        const x = padding + (idx / (maxRaces - 1)) * chartWidth;
        const y = padding + (pos / maxPosition) * chartHeight;

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Labels
    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Race Number', width / 2, height - 20);

    // Draw race numbers on X-axis
    ctx.font = '11px sans-serif';
    for (let i = 0; i < maxRaces; i++) {
      const x = padding + (i / (maxRaces - 1)) * chartWidth;
      ctx.fillText((i + 1).toString(), x, height - padding + 10);
    }

    // Y-axis label
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Position', 0, 0);
    ctx.restore();
  };

  // Head-to-Head
  const drawHeadToHead = (ctx: CanvasRenderingContext2D, mainStats: PerformanceStats, compareStats: PerformanceStats[], colors: string[]) => {
    const allStats = [mainStats, ...compareStats];
    const width = canvasRef.current!.width;
    const height = canvasRef.current!.height;
    const leftPadding = 100; // Increased from 60 to prevent label cutoff
    const rightPadding = 60;
    const topPadding = 40;
    const bottomPadding = 40;
    const chartHeight = height - topPadding - bottomPadding;
    const chartWidth = width - leftPadding - rightPadding;

    const categories = ['Wins', 'Avg Finish', 'Top 3', 'Consistency', 'Win %'];
    const barHeight = chartHeight / (categories.length * allStats.length + categories.length);

    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '13px sans-serif';

    categories.forEach((cat, catIdx) => {
      const baseY = topPadding + catIdx * (barHeight * allStats.length + barHeight);

      // Draw category label with proper alignment
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(226, 232, 240, 1)';
      ctx.fillText(cat, leftPadding - 15, baseY + (barHeight * allStats.length) / 2);

      allStats.forEach((stat, statIdx) => {
        let value = 0;
        let maxValue = 10;

        switch (cat) {
          case 'Wins':
            value = stat.wins;
            maxValue = Math.max(10, ...allStats.map(s => s.wins));
            break;
          case 'Avg Finish':
            value = stat.avgFinish > 0 ? (10 - stat.avgFinish) : 0;
            maxValue = 10;
            break;
          case 'Top 3':
            value = stat.top3Finishes;
            maxValue = Math.max(10, ...allStats.map(s => s.top3Finishes));
            break;
          case 'Consistency':
            value = stat.consistencyScore > 0 ? (10 - stat.consistencyScore) : 10;
            maxValue = 10;
            break;
          case 'Win %':
            value = stat.winPercentage;
            maxValue = 100;
            break;
        }

        const barWidth = (value / maxValue) * chartWidth * 0.85;
        const y = baseY + statIdx * barHeight;

        // Draw bar
        ctx.fillStyle = colors[statIdx];
        ctx.fillRect(leftPadding, y, barWidth, barHeight * 0.8);

        // Draw value label
        ctx.fillStyle = 'rgba(226, 232, 240, 1)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toFixed(1), leftPadding + barWidth + 8, y + (barHeight * 0.4));
      });
    });
  };

  // Consistency Comparison
  const drawConsistencyComparison = (ctx: CanvasRenderingContext2D, mainStats: PerformanceStats, compareStats: PerformanceStats[], colors: string[]) => {
    const allStats = [mainStats, ...compareStats];
    const width = canvasRef.current!.width;
    const height = canvasRef.current!.height;
    const padding = 80;

    const metrics = ['Std Dev', 'IQR', 'Coef. of Var.'];
    const barWidth = (width - padding * 2) / (metrics.length * allStats.length + metrics.length);

    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';

    metrics.forEach((metric, metricIdx) => {
      const baseX = padding + metricIdx * (barWidth * allStats.length + barWidth);

      ctx.fillText(metric, baseX + barWidth * allStats.length / 2, height - padding + 30);

      allStats.forEach((stat, statIdx) => {
        let value = 0;
        let maxValue = 10;

        switch (metric) {
          case 'Std Dev':
            value = stat.consistencyScore;
            maxValue = Math.max(5, ...allStats.map(s => s.consistencyScore));
            break;
          case 'IQR':
            value = stat.consistencyIQR;
            maxValue = Math.max(5, ...allStats.map(s => s.consistencyIQR));
            break;
          case 'Coef. of Var.':
            value = stat.coefficientOfVariation;
            maxValue = Math.max(1, ...allStats.map(s => s.coefficientOfVariation));
            break;
        }

        const barHeight = (value / maxValue) * (height - padding * 2) * 0.8;
        const x = baseX + statIdx * barWidth;
        const y = height - padding - barHeight;

        ctx.fillStyle = colors[statIdx];
        ctx.fillRect(x, y, barWidth * 0.8, barHeight);

        ctx.fillStyle = 'rgba(226, 232, 240, 1)';
        ctx.save();
        ctx.translate(x + barWidth * 0.4, y - 5);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillText(value.toFixed(2), 0, 0);
        ctx.restore();
      });
    });

    ctx.fillStyle = 'rgba(226, 232, 240, 1)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Consistency Metrics (Lower is Better)', width / 2, padding - 40);
  };

  return (
    <div
      className={`
        overflow-hidden transition-all duration-500 ease-in-out
        ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}
      `}
      style={{
        animation: 'slideDown 0.5s ease-out'
      }}
    >
      <style>
        {`
          @keyframes slideDown {
            from {
              max-height: 0;
              opacity: 0;
            }
            to {
              max-height: 1500px;
              opacity: 1;
            }
          }

          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }

          .stat-card {
            animation: fadeIn 0.3s ease-out forwards;
          }

          .stat-card:nth-child(1) { animation-delay: 0.1s; }
          .stat-card:nth-child(2) { animation-delay: 0.2s; }
          .stat-card:nth-child(3) { animation-delay: 0.3s; }
          .stat-card:nth-child(4) { animation-delay: 0.4s; }
          .stat-card:nth-child(5) { animation-delay: 0.5s; }
        `}
      </style>

      <div className="p-6 border-t border-slate-700/50">
        {!hideHeader && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {skipper.avatarUrl ? (
                <img
                  src={skipper.avatarUrl}
                  alt={skipper.name}
                  className="w-16 h-16 rounded-full object-cover border-3 border-blue-500"
                />
              ) : (
                <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg bg-blue-600 text-white">
                  {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-xl font-bold text-white">{skipper.name}</h3>
                <p className="text-sm text-slate-400">Performance Analysis</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
            >
              <LogOut size={20} className="text-slate-400" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Performance Stats */}
          <div className="space-y-4">
            <h4 className="text-2xl font-bold text-white mb-2">Performance Stats</h4>

            <div className="grid grid-cols-2 gap-4">
              {/* Wins Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('wins')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('wins'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-yellow-400/10 rounded-lg">
                    <Award className="text-yellow-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Wins</div>
                    <div className="text-2xl font-bold text-white">{stats.wins}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {stats.winPercentage.toFixed(1)}% win rate
                    </div>
                  </div>
                </div>
              </div>

              {/* Average Finish Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('avgFinish')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('avgFinish'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-400/10 rounded-lg">
                    <Target className="text-blue-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Avg Finish</div>
                    <div className="text-2xl font-bold text-white">{stats.avgFinish}</div>
                    <div className="text-xs text-slate-400 mt-1">Average position</div>
                  </div>
                </div>
              </div>

              {/* Top 3 Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('top3')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('top3'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-400/10 rounded-lg">
                    <TrendingUp className="text-green-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Top 3</div>
                    <div className="text-2xl font-bold text-white">{stats.top3Finishes}</div>
                    <div className="text-xs text-slate-400 mt-1">Podium finishes</div>
                  </div>
                </div>
              </div>

              {/* Consistency Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('consistency')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('consistency'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-teal-400/10 rounded-lg">
                    <BarChart3 className="text-teal-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Consistency</div>
                    <div className="text-2xl font-bold text-white">{stats.consistencyScore}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      IQR: {stats.consistencyIQR} • CV: {stats.coefficientOfVariation.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* DNF/DNS Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('dnfDns')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('dnfDns'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-red-400/10 rounded-lg">
                    <X className="text-red-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">DNF/DNS</div>
                    <div className="text-2xl font-bold text-white">{stats.dnfDnsPercentage}%</div>
                    <div className="text-xs text-slate-400 mt-1">Incomplete races</div>
                  </div>
                </div>
              </div>

              {/* Drop Impact Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('dropImpact')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('dropImpact'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-orange-400/10 rounded-lg">
                    <TrendingUp className="text-orange-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Drop Impact</div>
                    <div className="text-2xl font-bold text-white">{stats.raceDropImpact}</div>
                    <div className="text-xs text-slate-400 mt-1">Points saved</div>
                  </div>
                </div>
              </div>

              {/* Completion Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('completion')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('completion'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-slate-400/10 rounded-lg">
                    <BarChart3 className="text-slate-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Completion</div>
                    <div className="text-2xl font-bold text-white">{stats.racesCompleted}/{stats.totalRaces}</div>
                    <div className="text-xs text-slate-400 mt-1">Races completed</div>
                  </div>
                </div>
              </div>

              {/* Common Finish Card */}
              <div className="stat-card bg-slate-700/50 rounded-lg p-4 border border-slate-600/50 cursor-pointer hover:bg-slate-700/70 transition-colors relative group"
                   onClick={() => setShowInfoModal('commonFinish')}>
                <button
                  className="absolute top-2 right-2 p-1 rounded-full bg-slate-600/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setShowInfoModal('commonFinish'); }}
                >
                  <Info size={14} className="text-slate-300" />
                </button>
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-cyan-400/10 rounded-lg">
                    <Target className="text-cyan-400" size={24} />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Common Finish</div>
                    <div className="text-2xl font-bold text-white">{stats.mostCommonFinish ?? '-'}</div>
                    <div className="text-xs text-slate-400 mt-1">Most frequent</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/50 mt-4">
              <h5 className="text-sm font-semibold text-white mb-3">Position Range</h5>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Best</div>
                  <div className="text-2xl font-bold text-green-400">{stats.bestFinish || '-'}</div>
                </div>
                <div className="flex-1 mx-4">
                  <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-red-400"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Worst</div>
                  <div className="text-2xl font-bold text-red-400">{stats.worstFinish || '-'}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Compare Skippers - PGA Tour Style */}
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-2xl font-bold text-white">Compare Skippers</h4>

              {/* Compare Podium Toggle Switch */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setComparePodiumMode(!comparePodiumMode);
                    if (!comparePodiumMode) {
                      const top3 = getTop3Skippers;
                      setCompareSkippers([top3[0] ?? null, top3[1] ?? null]);
                    } else {
                      setCompareSkippers([null, null]);
                    }
                  }}
                  className={`
                    relative inline-flex h-8 w-14 items-center rounded-full transition-colors
                    ${comparePodiumMode ? 'bg-blue-600' : 'bg-slate-600'}
                  `}
                  role="switch"
                  aria-checked={comparePodiumMode}
                >
                  <span
                    className={`
                      inline-block h-6 w-6 transform rounded-full bg-white transition-transform
                      ${comparePodiumMode ? 'translate-x-7' : 'translate-x-1'}
                    `}
                  />
                </button>
                <span className="text-sm font-medium text-slate-300">Compare Podium Skippers</span>
              </div>
            </div>

            <p className="text-sm text-slate-400 mb-6">
              {comparePodiumMode
                ? 'Comparing with top 3 skippers automatically'
                : '"Add Skipper" below to compare skipper stats for the current event'
              }
            </p>

            {/* Avatar Slots */}
            <div className="flex items-center justify-center gap-6 mb-6">
              {/* Main Skipper */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  {skipper.avatarUrl ? (
                    <img
                      src={skipper.avatarUrl}
                      alt={skipper.name}
                      className="w-24 h-24 rounded-full object-cover border-2 border-blue-500"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-xl bg-blue-600 text-white border-2 border-blue-500">
                      {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-white">{skipper.name.split(' ')[0]}</div>
                  <div className="text-sm font-bold text-white">{skipper.name.split(' ').slice(1).join(' ')}</div>
                </div>
              </div>

              {/* Compare Slot 1 */}
              {compareSkippers[0] === null ? (
                <button
                  onClick={() => !comparePodiumMode && setShowSkipperSelector(0)}
                  disabled={comparePodiumMode}
                  className={`flex flex-col items-center group ${comparePodiumMode ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div className="relative mb-2">
                    <div className={`w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600 ${!comparePodiumMode && 'group-hover:border-slate-500'} transition-colors`}>
                      <svg className="w-16 h-16 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                      </svg>
                      <div className="absolute top-0 right-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center border-2 border-slate-800">
                        <Plus size={16} className="text-white" />
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-semibold text-slate-400 ${!comparePodiumMode && 'group-hover:text-slate-300'} transition-colors`}>
                    Add Skipper
                  </div>
                </button>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    {allSkippers[compareSkippers[0]].avatarUrl ? (
                      <img
                        src={allSkippers[compareSkippers[0]].avatarUrl}
                        alt={allSkippers[compareSkippers[0]].name}
                        className="w-24 h-24 rounded-full object-cover border-2 border-orange-500"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-xl bg-orange-600 text-white border-2 border-orange-500">
                        {allSkippers[compareSkippers[0]].name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    {!comparePodiumMode && (
                      <button
                        onClick={() => handleRemoveSkipper(0)}
                        className="absolute top-0 right-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-white hover:bg-red-600 transition-colors"
                      >
                        <LogOut size={16} className="text-white" />
                      </button>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{allSkippers[compareSkippers[0]].name.split(' ')[0]}</div>
                    <div className="text-sm font-bold text-white">{allSkippers[compareSkippers[0]].name.split(' ').slice(1).join(' ')}</div>
                  </div>
                </div>
              )}

              {/* Compare Slot 2 */}
              {compareSkippers[1] === null ? (
                <button
                  onClick={() => !comparePodiumMode && setShowSkipperSelector(1)}
                  disabled={comparePodiumMode}
                  className={`flex flex-col items-center group ${comparePodiumMode ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div className="relative mb-2">
                    <div className={`w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600 ${!comparePodiumMode && 'group-hover:border-slate-500'} transition-colors`}>
                      <svg className="w-16 h-16 text-slate-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                      </svg>
                      <div className="absolute top-0 right-0 w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center border-2 border-slate-800">
                        <Plus size={16} className="text-white" />
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-semibold text-slate-400 ${!comparePodiumMode && 'group-hover:text-slate-300'} transition-colors`}>
                    Add Skipper
                  </div>
                </button>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative mb-2">
                    {allSkippers[compareSkippers[1]].avatarUrl ? (
                      <img
                        src={allSkippers[compareSkippers[1]].avatarUrl}
                        alt={allSkippers[compareSkippers[1]].name}
                        className="w-24 h-24 rounded-full object-cover border-2 border-green-500"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-xl bg-green-600 text-white border-2 border-green-500">
                        {allSkippers[compareSkippers[1]].name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    {!comparePodiumMode && (
                      <button
                        onClick={() => handleRemoveSkipper(1)}
                        className="absolute top-0 right-0 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-white hover:bg-red-600 transition-colors"
                      >
                        <LogOut size={16} className="text-white" />
                      </button>
                    )}
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{allSkippers[compareSkippers[1]].name.split(' ')[0]}</div>
                    <div className="text-sm font-bold text-white">{allSkippers[compareSkippers[1]].name.split(' ').slice(1).join(' ')}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Skipper Selector Modal */}
            {showSkipperSelector !== null && (
              <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSkipperSelector(null)}>
                <div className="bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Select Skipper</h3>
                    <button onClick={() => setShowSkipperSelector(null)} className="text-slate-400 hover:text-white">
                      <LogOut size={20} />
                    </button>
                  </div>

                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder="Search Skippers"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredSkippers.map((s) => {
                      const actualIdx = allSkippers.findIndex(sk => sk.sailNo === s.sailNo);
                      return (
                        <button
                          key={actualIdx}
                          onClick={() => handleAddSkipper(showSkipperSelector, actualIdx)}
                          className="w-full p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors flex items-center gap-3"
                        >
                          {s.avatarUrl ? (
                            <img src={s.avatarUrl} alt={s.name} className="w-12 h-12 rounded-full object-cover" />
                          ) : (
                            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold bg-slate-600 text-white">
                              {s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="text-left flex-1">
                            <div className="font-medium text-white">{s.name}</div>
                            <div className="text-sm text-slate-400">{s.sailNo} - {s.boatModel}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Comparison View - Only show if at least one skipper is selected */}
            {compareSkippers.some(s => s !== null) && (
              <div className="space-y-4">
                {/* Controls */}
                <div className="flex items-center justify-between gap-4">
                  {/* Chart View Dropdown - Only show when in chart mode */}
                  {viewMode === 'chart' && (
                    <div className="relative flex-1">
                      <button
                        onClick={() => setShowChartViewDropdown(!showChartViewDropdown)}
                        className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white flex items-center justify-between hover:bg-slate-600 transition-colors"
                      >
                        <span className="text-sm">{chartViewLabels[chartView]}</span>
                        <ChevronDown size={16} />
                      </button>
                      {showChartViewDropdown && (
                        <div className="absolute top-full mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-10">
                          {(Object.keys(chartViewLabels) as ChartView[]).map((key) => (
                            <button
                              key={key}
                              onClick={() => {
                                setChartView(key);
                                setShowChartViewDropdown(false);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-600 first:rounded-t-lg last:rounded-b-lg transition-colors"
                            >
                              {chartViewLabels[key]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chart/Table Toggle */}
                  <div className="flex bg-slate-700 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('chart')}
                      className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'chart'
                          ? 'bg-white text-slate-900'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Chart
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                        viewMode === 'table'
                          ? 'bg-white text-slate-900'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Table
                    </button>
                  </div>
                </div>

                {/* Chart View */}
                {viewMode === 'chart' && (
                  <div className="flex items-center justify-center py-6">
                    <canvas ref={canvasRef} width="400" height="400" />
                  </div>
                )}

                {/* Table View */}
                {viewMode === 'table' && (
                  <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Stat</th>
                          <th className="text-center px-4 py-3">
                            <div className="flex flex-col items-center">
                              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white mb-1">
                                {skipper.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                              </div>
                              <div className="text-xs text-slate-300 font-medium truncate max-w-[80px]">{skipper.name.split(' ')[0]}</div>
                            </div>
                          </th>
                          {compareSkippers[0] !== null && (
                            <th className="text-center px-4 py-3">
                              <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold text-white mb-1">
                                  {allSkippers[compareSkippers[0]].name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="text-xs text-slate-300 font-medium truncate max-w-[80px]">{allSkippers[compareSkippers[0]].name.split(' ')[0]}</div>
                              </div>
                            </th>
                          )}
                          {compareSkippers[1] !== null && (
                            <th className="text-center px-4 py-3">
                              <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold text-white mb-1">
                                  {allSkippers[compareSkippers[1]].name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                </div>
                                <div className="text-xs text-slate-300 font-medium truncate max-w-[80px]">{allSkippers[compareSkippers[1]].name.split(' ')[0]}</div>
                              </div>
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {(Object.keys(statLabels) as StatCategory[]).map(statKey => {
                          const mainStat = stats[statKey as keyof PerformanceStats] as number;
                          const compareStat1 = compareSkippers[0] !== null
                            ? (calculateStats(compareSkippers[0])[statKey as keyof PerformanceStats] as number)
                            : null;
                          const compareStat2 = compareSkippers[1] !== null
                            ? (calculateStats(compareSkippers[1])[statKey as keyof PerformanceStats] as number)
                            : null;

                          return (
                            <tr key={statKey} className="hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3 text-sm text-slate-300 font-medium">{statLabels[statKey]}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="text-lg font-bold text-white">{mainStat}</span>
                              </td>
                              {compareSkippers[0] !== null && (
                                <td className="px-4 py-3 text-center">
                                  <span className="text-lg font-bold text-white">{compareStat1}</span>
                                </td>
                              )}
                              {compareSkippers[1] !== null && (
                                <td className="px-4 py-3 text-center">
                                  <span className="text-lg font-bold text-white">{compareStat2}</span>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowInfoModal(null)}
        >
          <div
            className="bg-slate-800 rounded-lg p-6 max-w-md w-full border border-slate-700 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">{statInfo[showInfoModal]?.title}</h3>
              <button
                onClick={() => setShowInfoModal(null)}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <LogOut size={20} className="text-slate-400" />
              </button>
            </div>
            <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">
              {statInfo[showInfoModal]?.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
