import React, { useMemo, useEffect, useState, useRef } from 'react';
import { estimateDiversityMetrics } from '../utils/shrsHeatSystem';
import { Users, Target, Zap, TrendingUp, Award, Info } from 'lucide-react';

interface DiversityGaugeProps {
  totalSkippers: number;
  numberOfHeats: number;
  qualifyingRounds: number;
  darkMode: boolean;
}

const GAUGE_RADIUS = 90;
const GAUGE_STROKE = 14;
const CENTER = 110;
const START_ANGLE = 135;
const END_ANGLE = 405;
const ARC_SPAN = END_ANGLE - START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function getGaugeColor(efficiency: number): string {
  if (efficiency >= 95) return '#10b981';
  if (efficiency >= 85) return '#22d3ee';
  if (efficiency >= 70) return '#f59e0b';
  return '#ef4444';
}

function getGaugeLabel(efficiency: number): string {
  if (efficiency >= 95) return 'Excellent';
  if (efficiency >= 85) return 'Good';
  if (efficiency >= 70) return 'Fair';
  return 'Low';
}

export function DiversityGauge({ totalSkippers, numberOfHeats, qualifyingRounds, darkMode }: DiversityGaugeProps) {
  const [animatedEfficiency, setAnimatedEfficiency] = useState(0);
  const [showDetail, setShowDetail] = useState(true);
  const animRef = useRef<number | null>(null);
  const prevEfficiency = useRef(0);

  const metrics = useMemo(() => {
    if (totalSkippers < 4 || numberOfHeats < 2 || qualifyingRounds < 2) return null;
    return estimateDiversityMetrics(totalSkippers, numberOfHeats, qualifyingRounds);
  }, [totalSkippers, numberOfHeats, qualifyingRounds]);

  const currentEfficiency = metrics?.roundStats[metrics.roundStats.length - 1]?.efficiency ?? 0;
  const currentAvgUnique = metrics?.roundStats[metrics.roundStats.length - 1]?.avgUnique ?? 0;

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const from = prevEfficiency.current;
    const to = currentEfficiency;
    const duration = 800;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedEfficiency(from + (to - from) * eased);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        prevEfficiency.current = to;
      }
    }

    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [currentEfficiency]);

  if (!metrics) return null;

  const gaugeAngle = START_ANGLE + (animatedEfficiency / 100) * ARC_SPAN;
  const gaugeColor = getGaugeColor(animatedEfficiency);
  const gaugeLabel = getGaugeLabel(animatedEfficiency);

  const recommendedAngle = START_ANGLE + (95 / 100) * ARC_SPAN;
  const recTick = polarToCartesian(CENTER, CENTER, GAUGE_RADIUS, recommendedAngle);
  const recTickInner = polarToCartesian(CENTER, CENTER, GAUGE_RADIUS - GAUGE_STROKE / 2 - 4, recommendedAngle);
  const recTickOuter = polarToCartesian(CENTER, CENTER, GAUGE_RADIUS + GAUGE_STROKE / 2 + 4, recommendedAngle);

  const milestones = [
    { round: 4, label: 'Q4' },
    { round: 6, label: 'Q6' },
    { round: 8, label: 'Q8' },
    { round: 10, label: 'Q10' },
  ].filter(m => m.round <= qualifyingRounds);

  const needsMoreRounds = currentEfficiency < 95;

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all duration-500 ${
      darkMode
        ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 border-slate-600/50'
        : 'bg-gradient-to-br from-white to-slate-50 border-slate-200'
    }`}>
      <div className={`px-4 py-3 flex items-center justify-between border-b ${
        darkMode ? 'border-slate-700/50' : 'border-slate-100'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${darkMode ? 'bg-cyan-500/20' : 'bg-cyan-50'}`}>
            <Target className={`w-4 h-4 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
          </div>
          <div>
            <h4 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Opponent Diversity Analysis
            </h4>
            <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Heat allocation quality indicator
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowDetail(!showDetail)}
          className={`p-1.5 rounded-lg transition-all ${
            showDetail
              ? darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600'
              : darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'
          }`}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pt-3 pb-2">
        <div className="flex justify-center">
          <svg width="220" height="160" viewBox="0 0 220 180">
            {/* Background arc */}
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE, END_ANGLE)}
              fill="none"
              stroke={darkMode ? '#334155' : '#e2e8f0'}
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
            />

            {/* Zone coloring - subtle background zones */}
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE, START_ANGLE + 0.7 * ARC_SPAN)}
              fill="none"
              stroke={darkMode ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)'}
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
            />
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE + 0.7 * ARC_SPAN, START_ANGLE + 0.85 * ARC_SPAN)}
              fill="none"
              stroke={darkMode ? 'rgba(34,211,238,0.12)' : 'rgba(34,211,238,0.08)'}
              strokeWidth={GAUGE_STROKE}
            />
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE + 0.85 * ARC_SPAN, START_ANGLE + 0.95 * ARC_SPAN)}
              fill="none"
              stroke={darkMode ? 'rgba(34,211,238,0.18)' : 'rgba(34,211,238,0.12)'}
              strokeWidth={GAUGE_STROKE}
            />
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE + 0.95 * ARC_SPAN, END_ANGLE)}
              fill="none"
              stroke={darkMode ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.12)'}
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
            />

            {/* Active arc with glow */}
            <defs>
              <filter id="gaugeGlow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={gaugeColor} stopOpacity="0.6" />
                <stop offset="100%" stopColor={gaugeColor} />
              </linearGradient>
            </defs>
            <path
              d={describeArc(CENTER, CENTER, GAUGE_RADIUS, START_ANGLE, Math.min(gaugeAngle, END_ANGLE))}
              fill="none"
              stroke="url(#gaugeGradient)"
              strokeWidth={GAUGE_STROKE}
              strokeLinecap="round"
              filter="url(#gaugeGlow)"
              style={{ transition: 'none' }}
            />

            {/* 95% threshold marker */}
            <line
              x1={recTickInner.x} y1={recTickInner.y}
              x2={recTickOuter.x} y2={recTickOuter.y}
              stroke={darkMode ? '#94a3b8' : '#64748b'}
              strokeWidth="2"
              strokeDasharray="2,2"
              opacity="0.6"
            />
            <text
              x={recTickOuter.x + 2}
              y={recTickOuter.y - 6}
              fill={darkMode ? '#94a3b8' : '#64748b'}
              fontSize="8"
              textAnchor="middle"
            >
              95%
            </text>

            {/* Needle tip dot */}
            {(() => {
              const tip = polarToCartesian(CENTER, CENTER, GAUGE_RADIUS, Math.min(gaugeAngle, END_ANGLE));
              return (
                <circle
                  cx={tip.x} cy={tip.y} r="5"
                  fill={gaugeColor}
                  stroke={darkMode ? '#0f172a' : '#ffffff'}
                  strokeWidth="2"
                  filter="url(#gaugeGlow)"
                />
              );
            })()}

            {/* Center text */}
            <text x={CENTER} y={CENTER - 12} textAnchor="middle"
              fill={gaugeColor} fontSize="32" fontWeight="800"
              fontFamily="system-ui, -apple-system, sans-serif">
              {Math.round(animatedEfficiency)}%
            </text>
            <text x={CENTER} y={CENTER + 6} textAnchor="middle"
              fill={darkMode ? '#94a3b8' : '#64748b'} fontSize="11" fontWeight="600">
              {gaugeLabel} Diversity
            </text>
            <text x={CENTER} y={CENTER + 22} textAnchor="middle"
              fill={darkMode ? '#64748b' : '#94a3b8'} fontSize="9">
              {Math.round(currentAvgUnique)} of {metrics.totalPossibleOpponents} unique opponents
            </text>

            {/* Bottom labels */}
            <text x="30" y="170" fill={darkMode ? '#475569' : '#94a3b8'} fontSize="9" textAnchor="middle">0%</text>
            <text x="190" y="170" fill={darkMode ? '#475569' : '#94a3b8'} fontSize="9" textAnchor="middle">100%</text>
          </svg>
        </div>

        {/* Recommendation badge */}
        {needsMoreRounds && metrics.recommendedMinRounds > qualifyingRounds ? (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${
            darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
          }`}>
            <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
            <p className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
              <span className="font-semibold">Recommendation:</span>{' '}
              Increase to at least {metrics.recommendedMinRounds} qualifying rounds for reliable tie-breaking coverage (95%+)
            </p>
          </div>
        ) : (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${
            darkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'
          }`}>
            <Award className={`w-3.5 h-3.5 flex-shrink-0 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <p className={`text-xs ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
              <span className="font-semibold">Excellent coverage.</span>{' '}
              {qualifyingRounds} rounds provides strong opponent diversity for reliable tie-breaking.
            </p>
          </div>
        )}

        {/* Milestone progress bars */}
        {showDetail && (
          <div className={`space-y-3 pt-2 pb-1 border-t ${darkMode ? 'border-slate-700/50' : 'border-slate-100'}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className={`w-3.5 h-3.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
              <span className={`text-[11px] font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Cumulative Diversity by Round
              </span>
            </div>

            <div className="space-y-2">
              {milestones.map(m => {
                const stat = metrics.roundStats[m.round - 1];
                if (!stat) return null;
                const barColor = getGaugeColor(stat.efficiency);
                return (
                  <div key={m.round} className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold w-6 text-right ${
                      darkMode ? 'text-slate-400' : 'text-slate-500'
                    }`}>{m.label}</span>
                    <div className={`flex-1 h-2 rounded-full overflow-hidden ${
                      darkMode ? 'bg-slate-700' : 'bg-slate-200'
                    }`}>
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${stat.efficiency}%`,
                          backgroundColor: barColor,
                          boxShadow: `0 0 6px ${barColor}40`
                        }}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold w-10 text-right tabular-nums ${
                      darkMode ? 'text-slate-300' : 'text-slate-600'
                    }`}>{stat.efficiency}%</span>
                  </div>
                );
              })}
            </div>

            {/* Stats grid */}
            <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${
              darkMode ? 'border-slate-700/30' : 'border-slate-100'
            }`}>
              <div className={`text-center p-2 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Fleet</div>
                <div className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <Users className="w-3 h-3 inline mr-0.5 -mt-0.5" />{totalSkippers}
                </div>
              </div>
              <div className={`text-center p-2 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Pairs/Round</div>
                <div className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {metrics.pairsPerRound}
                </div>
              </div>
              <div className={`text-center p-2 rounded-lg ${darkMode ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                <div className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Min Rounds</div>
                <div className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {metrics.theoreticalMinRounds}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}