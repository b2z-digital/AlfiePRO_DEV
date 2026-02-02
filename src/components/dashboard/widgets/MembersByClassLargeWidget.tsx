import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface MembersByClassLargeWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const MembersByClassLargeWidget: React.FC<MembersByClassLargeWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [totalBoats, setTotalBoats] = useState(0);

  useEffect(() => {
    if (currentClub) {
      fetchMembersByClass();
    }
  }, [currentClub]);

  const fetchMembersByClass = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: boats, error } = await supabase
        .from('member_boats')
        .select('boat_type, member_id, members!inner(club_id)')
        .eq('members.club_id', currentClub.clubId)
        .not('boat_type', 'is', null);

      if (error) throw error;

      const classCounts: Record<string, number> = {};
      boats?.forEach(boat => {
        const boatClass = boat.boat_type || 'Unknown';
        classCounts[boatClass] = (classCounts[boatClass] || 0) + 1;
      });

      const sortedEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
      const labels = sortedEntries.map(([key]) => key);
      const values = sortedEntries.map(([, value]) => value);
      setTotalBoats(values.reduce((a, b) => a + b, 0));

      const colors = [
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(20, 184, 166, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(251, 191, 36, 0.8)',
      ];

      setChartData({
        labels,
        datasets: [{
          label: 'Boats',
          data: values,
          backgroundColor: labels.map((_, idx) => colors[idx % colors.length]),
          borderColor: labels.map((_, idx) => colors[idx % colors.length].replace('0.8', '1')),
          borderWidth: 2,
          borderRadius: 8,
        }]
      });
    } catch (error) {
      console.error('Error fetching members by class:', error);
    } finally {
      setLoading(false);
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 16,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y || 0;
            const percentage = totalBoats > 0 ? ((value / totalBoats) * 100).toFixed(1) : 0;
            return `Boats: ${value} (${percentage}%)`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgb(148, 163, 184)',
          font: {
            size: 12
          },
          stepSize: 1
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.2)'
        },
        title: {
          display: true,
          text: 'Number of Boats',
          color: 'rgb(148, 163, 184)',
          font: {
            size: 13
          }
        }
      },
      x: {
        ticks: {
          color: 'rgb(148, 163, 184)',
          font: {
            size: 12
          }
        },
        grid: {
          display: false
        },
        title: {
          display: true,
          text: 'Boat Class',
          color: 'rgb(148, 163, 184)',
          font: {
            size: 13
          }
        }
      }
    }
  };

  return (
    <ThemedWidgetWrapper
      title="Members by Boat Class"
      icon={BarChart3}
      isEditMode={isEditMode}
      onRemove={onRemove}
      colorTheme={colorTheme}
    >
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : chartData ? (
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-400">Total Boats Registered</div>
              <div className="text-3xl font-bold text-white">{totalBoats}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-400">Boat Classes</div>
              <div className="text-3xl font-bold text-white">{chartData.labels.length}</div>
            </div>
          </div>
          <div className="h-80">
            <Bar data={chartData} options={options} />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-slate-400">
          No boat class data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
