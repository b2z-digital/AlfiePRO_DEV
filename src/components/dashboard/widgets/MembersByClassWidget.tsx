import React, { useState, useEffect } from 'react';
import { BarChart3 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface MembersByClassWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const MembersByClassWidget: React.FC<MembersByClassWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      console.log('[MembersByClassWidget] Fetching for clubId:', currentClub.clubId);
      // Query member_boats to get boat types for members in this club
      const { data: boats, error } = await supabase
        .from('member_boats')
        .select('boat_type, member_id, members!inner(club_id)')
        .eq('members.club_id', currentClub.clubId)
        .not('boat_type', 'is', null);

      console.log('[MembersByClassWidget] Query result:', { boats, error, count: boats?.length });

      if (error) throw error;

      const classCounts: Record<string, number> = {};
      boats?.forEach(boat => {
        const boatClass = boat.boat_type || 'Unknown';
        classCounts[boatClass] = (classCounts[boatClass] || 0) + 1;
      });

      const sortedEntries = Object.entries(classCounts).sort((a, b) => b[1] - a[1]);
      const labels = sortedEntries.map(([key]) => key);
      const values = sortedEntries.map(([, value]) => value);

      const colors = [
        'rgba(59, 130, 246, 0.8)',
        'rgba(168, 85, 247, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(251, 146, 60, 0.8)',
        'rgba(239, 68, 68, 0.8)',
        'rgba(20, 184, 166, 0.8)',
      ];

      setChartData({
        labels,
        datasets: [{
          label: 'Members',
          data: values,
          backgroundColor: labels.map((_, idx) => colors[idx % colors.length]),
          borderColor: labels.map((_, idx) => colors[idx % colors.length].replace('0.8', '1')),
          borderWidth: 2,
          borderRadius: 6,
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
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 12
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: 'rgb(148, 163, 184)',
          font: {
            size: 11
          },
          stepSize: 1
        },
        grid: {
          color: 'rgba(71, 85, 105, 0.2)'
        }
      },
      x: {
        ticks: {
          color: 'rgb(148, 163, 184)',
          font: {
            size: 11
          }
        },
        grid: {
          display: false
        }
      }
    }
  };

  return (
    <ThemedWidgetWrapper
      title="Members by Class"
      icon={BarChart3}
      isEditMode={isEditMode}
      onRemove={onRemove}
      colorTheme={colorTheme}
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      ) : chartData ? (
        <div className="h-64 p-4">
          <Bar data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400">
          No boat class data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
