import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface MemberRetentionWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const MemberRetentionWidget: React.FC<MemberRetentionWidgetProps> = ({
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
      fetchMemberRetention();
    }
  }, [currentClub]);

  const fetchMemberRetention = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      console.log('[MemberRetentionWidget] Fetching for clubId:', currentClub.clubId);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data: oldMembers, error: oldError } = await supabase
        .from('members')
        .select('id, membership_status')
        .eq('club_id', currentClub.clubId)
        .lt('created_at', oneYearAgo.toISOString());

      console.log('[MemberRetentionWidget] Query result:', { oldMembers, error: oldError, count: oldMembers?.length });

      if (oldError) throw oldError;

      const renewed = oldMembers?.filter(m =>
        m.membership_status === 'active' || m.membership_status === null
      ).length || 0;
      const notRenewed = oldMembers?.filter(m =>
        m.membership_status !== 'active' && m.membership_status !== null
      ).length || 0;

      setChartData({
        labels: ['Renewed', 'Not Renewed'],
        datasets: [{
          data: [renewed, notRenewed],
          backgroundColor: [
            'rgba(34, 197, 94, 0.8)',
            'rgba(239, 68, 68, 0.8)',
          ],
          borderColor: [
            'rgba(34, 197, 94, 1)',
            'rgba(239, 68, 68, 1)',
          ],
          borderWidth: 2,
        }]
      });
    } catch (error) {
      console.error('Error fetching member retention:', error);
    } finally {
      setLoading(false);
    }
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgba(71, 85, 105, 0.5)',
        borderWidth: 1,
        padding: 12,
        displayColors: true
      }
    },
    cutout: '65%'
  };

  return (
    <ThemedWidgetWrapper
      title="Member Retention"
      icon={Users}
      isEditMode={isEditMode}
      onRemove={onRemove}
      colorTheme={colorTheme}
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      ) : chartData ? (
        <div className="h-64 p-4">
          <Doughnut data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400">
          No retention data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
