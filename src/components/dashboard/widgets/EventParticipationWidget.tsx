import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useAlfieLight, alfieChartScales, alfieTooltip, ALFIE_CHART_COLORS } from '../../alfie/Kit';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useOrganizationContext, getContextLabel } from '../../../hooks/useOrganizationContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface EventParticipationWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const EventParticipationWidget: React.FC<EventParticipationWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const orgContext = useOrganizationContext();
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgContext.isLoading) {
      fetchEventParticipation();
    }
  }, [orgContext.clubIds, orgContext.isLoading]);

  const fetchEventParticipation = async () => {
    if (orgContext.clubIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const { data: singleEvents, error: singleError } = await supabase
        .from('event_attendance')
        .select('event_id')
        .in('club_id', orgContext.clubIds);

      const { data: seriesEvents, error: seriesError } = await supabase
        .from('event_attendance')
        .select('series_id')
        .in('club_id', orgContext.clubIds)
        .not('series_id', 'is', null);

      if (singleError || seriesError) throw singleError || seriesError;

      const singleEventsCount = new Set(singleEvents?.map(e => e.event_id).filter(Boolean)).size;
      const seriesEventsCount = new Set(seriesEvents?.map(e => e.series_id).filter(Boolean)).size;

      setChartData({
        labels: ['Single Events', 'Pointscore Series'],
        datasets: [{
          label: 'Events',
          data: [singleEventsCount, seriesEventsCount],
          backgroundColor: [
            'rgba(59, 130, 246, 0.8)',
            'rgba(251, 146, 60, 0.8)',
          ],
          borderColor: [
            'rgba(59, 130, 246, 1)',
            'rgba(251, 146, 60, 1)',
          ],
          borderWidth: 2,
          borderRadius: 6,
        }]
      });
    } catch (error) {
      console.error('Error fetching event participation:', error);
    } finally {
      setLoading(false);
    }
  };

  const light = useAlfieLight();
  const palette = ['#2E7BFF', '#FF8A2B'];
  const styledData = chartData && {
    ...chartData,
    datasets: chartData.datasets.map((ds: any) => ({
      ...ds,
      backgroundColor: ds.data.map((_: any, i: number) => palette[i % palette.length]),
      borderWidth: 0,
      borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 2, bottomRight: 2 },
      borderSkipped: false,
      categoryPercentage: 0.86,
      barPercentage: 0.9,
    })),
  };

  const scales = alfieChartScales(light);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: alfieTooltip(light) },
    scales: { y: { ...scales.y, ticks: { ...scales.y.ticks, precision: 0, maxTicksLimit: 5 } }, x: scales.x },
  };

  return (
    <ThemedWidgetWrapper
      title={`Event Participation - ${getContextLabel(orgContext.type)}`}
      icon={Activity}
      isEditMode={isEditMode}
      onRemove={onRemove}
      colorTheme={colorTheme}
    >
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
        </div>
      ) : chartData ? (
        <div className="h-[230px]">
          <Bar data={styledData} options={options as any} />
        </div>
      ) : (
        <div className="a-dim flex items-center justify-center h-[230px] text-[13.5px]">
          No event participation data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
