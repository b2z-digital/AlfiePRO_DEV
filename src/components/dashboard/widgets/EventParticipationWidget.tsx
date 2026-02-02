import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

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
  const [chartData, setChartData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentClub) {
      fetchEventParticipation();
    }
  }, [currentClub]);

  const fetchEventParticipation = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data: singleEvents, error: singleError } = await supabase
        .from('event_attendance')
        .select('event_id')
        .eq('club_id', currentClub.clubId);

      const { data: seriesEvents, error: seriesError } = await supabase
        .from('event_attendance')
        .select('series_id')
        .eq('club_id', currentClub.clubId)
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
      title="Event Participation"
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
        <div className="h-64 p-4">
          <Bar data={chartData} options={options} />
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-slate-400">
          No event participation data available
        </div>
      )}
    </ThemedWidgetWrapper>
  );
};
