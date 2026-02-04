import React, { useState, useEffect } from 'react';
import { PieChart } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface MembershipTypesLargeWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const MembershipTypesLargeWidget: React.FC<MembershipTypesLargeWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [totalMembers, setTotalMembers] = useState(0);

  useEffect(() => {
    if (currentClub) {
      fetchMembershipTypes();
    }
  }, [currentClub]);

  const fetchMembershipTypes = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: members, error } = await supabase
        .from('members')
        .select('membership_level')
        .eq('club_id', currentClub.clubId)
        .or('membership_status.eq.active,membership_status.is.null');

      if (error) throw error;

      const typeCounts: Record<string, number> = {};
      members?.forEach(member => {
        const type = member.membership_level || 'Not Set';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      const labels = Object.keys(typeCounts);
      const values = Object.values(typeCounts);
      setTotalMembers(values.reduce((a, b) => a + b, 0));

      if (labels.length > 0 && values.some(v => v > 0)) {
        setChartData({
          labels,
          datasets: [{
            data: values,
            backgroundColor: [
              'rgba(59, 130, 246, 0.8)',
              'rgba(168, 85, 247, 0.8)',
              'rgba(34, 197, 94, 0.8)',
              'rgba(251, 146, 60, 0.8)',
              'rgba(239, 68, 68, 0.8)',
              'rgba(20, 184, 166, 0.8)',
            ],
            borderColor: [
              'rgba(59, 130, 246, 1)',
              'rgba(168, 85, 247, 1)',
              'rgba(34, 197, 94, 1)',
              'rgba(251, 146, 60, 1)',
              'rgba(239, 68, 68, 1)',
              'rgba(20, 184, 166, 1)',
            ],
            borderWidth: 2,
          }]
        });
      }
    } catch (error) {
      console.error('Error fetching membership types:', error);
    } finally {
      setLoading(false);
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 20,
          font: {
            size: 13
          },
          boxWidth: 20,
          boxHeight: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 16,
        displayColors: true,
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const percentage = totalMembers > 0 ? ((value / totalMembers) * 100).toFixed(1) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  return (
    <ThemedWidgetWrapper
      title="Membership Types Distribution"
      icon={PieChart}
      isEditMode={isEditMode}
      onRemove={onRemove}
      colorTheme={colorTheme}
    >
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : chartData ? (
        <div className="relative h-96 p-6">
          <Doughnut data={chartData} options={options} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">{totalMembers}</div>
              <div className="text-sm text-slate-400 mt-1">Total Members</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-slate-400">
          No membership data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
