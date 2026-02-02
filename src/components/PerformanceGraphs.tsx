import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { TrendingUp, ArrowUpDown } from 'lucide-react';
import { Skipper, LetterScore, getLetterScoreValue } from '../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface PerformanceGraphsProps {
  skippers: Skipper[];
  raceResults: any[];
  darkMode: boolean;
  visible?: boolean;
}

export const PerformanceGraphs: React.FC<PerformanceGraphsProps> = ({ 
  skippers,
  raceResults,
  darkMode,
  visible = false
}) => {
  if (!visible) return null;

  const lastCompletedRace = Math.max(...raceResults.map(r => r.race), 0);

  const getNumericPosition = (result: any): number => {
    if (result.position !== null) return result.position;
    if (!result.letterScore) return NaN;

    const raceFinishers = raceResults
      .filter(r => r.race === result.race && r.position !== null && !r.letterScore)
      .length;

    return getLetterScoreValue(result.letterScore as LetterScore, raceFinishers, skippers.length);
  };

  const getUniqueColor = (index: number): string => {
    const hue = (index * 137.5) % 360;
    return `hsl(${hue}, 85%, 65%)`;
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 50
    },
    transitions: {
      active: {
        animation: {
          duration: 50
        }
      }
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false
    },
    elements: {
      line: { 
        tension: 0.2,
        borderWidth: 1.5
      },
      point: { 
        radius: 4,
        hitRadius: 8,
        hoverRadius: 6,
        borderWidth: 1.5
      }
    },
    scales: {
      y: {
        type: 'linear',
        reverse: true,
        min: 0.5,
        max: skippers.length + 1.5,
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          stepSize: 1,
          callback: (value) => Math.round(value).toString(),
          color: darkMode ? '#94a3b8' : '#64748b'
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: darkMode ? '#94a3b8' : '#64748b' }
      }
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: darkMode ? '#e2e8f0' : '#1e293b',
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: { size: 11 }
        }
      },
      tooltip: {
        enabled: true,
        animation: false,
        backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: darkMode ? '#e2e8f0' : '#1e293b',
        bodyColor: darkMode ? '#e2e8f0' : '#1e293b',
        borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          title: (items) => `Race ${items[0].label.replace('R', '')}`,
          label: (context) => {
            const dataset = context.dataset;
            const result = raceResults.find(
              r => r.race === parseInt(context.label.replace('R', '')) && 
                  r.skipperIndex === skippers.findIndex(s => 
                    `${s.name} (${s.sailNo})` === dataset.label
                  )
            );
            
            if (result?.letterScore) {
              return `${dataset.label}: ${result.letterScore}`;
            }
            
            const position = context.parsed.y;
            const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
            return `${dataset.label}: ${position}${suffix} place`;
          }
        }
      }
    }
  };

  const getPositionData = () => {
    const labels = Array.from({ length: lastCompletedRace }, (_, i) => `R${i + 1}`);

    const datasets = skippers.map((skipper, skipperIndex) => {
      const color = getUniqueColor(skipperIndex);

      const positions = labels.map(raceLabel => {
        const raceNum = parseInt(raceLabel.replace('R', ''));
        const result = raceResults.find(
          r => r.race === raceNum && r.skipperIndex === skipperIndex
        );
        return result ? getNumericPosition(result) : NaN;
      });

      return {
        label: `${skipper.name} (${skipper.sailNo})`,
        data: positions,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        borderWidth: 1.5,
        pointBackgroundColor: color,
        pointBorderColor: 'white',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: false,
        showLine: true
      };
    });

    return { labels, datasets };
  };

  const getHandicapData = () => {
    const labels = Array.from({ length: lastCompletedRace }, (_, i) => `R${i + 1}`);

    const datasets = skippers.map((skipper, skipperIndex) => {
      const color = getUniqueColor(skipperIndex);

      const handicaps = labels.map((raceLabel, index) => {
        if (index === 0) return skipper.startHcap;
        const raceNum = parseInt(raceLabel.replace('R', ''));
        const prevRaceResult = raceResults.find(
          r => r.race === raceNum - 1 && r.skipperIndex === skipperIndex
        );
        return typeof prevRaceResult?.adjustedHcap === 'number' ? prevRaceResult.adjustedHcap : NaN;
      });

      return {
        label: `${skipper.name} (${skipper.sailNo})`,
        data: handicaps,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        borderWidth: 1.5,
        pointBackgroundColor: color,
        pointBorderColor: 'white',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: false,
        showLine: true
      };
    });

    return { labels, datasets };
  };

  return (
    <>
      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} rounded-lg shadow-sm border overflow-hidden h-full`}>
        <div className="bg-[#2c5282] px-6 py-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-white" />
            <h3 className="text-sm font-medium text-white">
              Position Trends
            </h3>
          </div>
        </div>
        <div className="p-4 h-[300px]">
          <Line options={chartOptions} data={getPositionData()} />
        </div>
      </div>

      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'} rounded-lg shadow-sm border overflow-hidden h-full`}>
        <div className="bg-[#2c5282] px-6 py-4">
          <div className="flex items-center gap-2">
            <ArrowUpDown size={16} className="text-white" />
            <h3 className="text-sm font-medium text-white">
              Handicap Evolution
            </h3>
          </div>
        </div>
        <div className="p-4 h-[300px]">
          <Line 
            options={{
              ...chartOptions,
              scales: {
                ...chartOptions.scales,
                y: {
                  type: 'linear',
                  reverse: false,
                  min: 0,
                  max: 150,
                  grid: {
                    color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                  },
                  ticks: {
                    callback: (value) => value === 0 ? 'Scratch' : `${value} sec`,
                    color: darkMode ? '#94a3b8' : '#64748b'
                  }
                }
              },
              plugins: {
                ...chartOptions.plugins,
                tooltip: {
                  ...chartOptions.plugins.tooltip,
                  callbacks: {
                    title: (items) => `Race ${items[0].label.replace('R', '')}`,
                    label: (context) => {
                      const dataset = context.dataset;
                      const value = context.parsed.y;
                      return `${dataset.label}: ${value === 0 ? 'Scratch' : `${value} sec`}`;
                    }
                  }
                }
              }
            }}
            data={getHandicapData()} 
          />
        </div>
      </div>
    </>
  );
};