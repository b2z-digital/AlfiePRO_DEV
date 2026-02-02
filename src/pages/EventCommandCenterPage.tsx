import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { EventCommandCenter } from '../components/event-command-center';
import { supabase } from '../utils/supabase';
import { useNotifications } from '../contexts/NotificationContext';

export const EventCommandCenterPage: React.FC = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const darkMode = localStorage.getItem('lightMode') !== 'true';

  const [loading, setLoading] = useState(true);
  const [eventData, setEventData] = useState<{
    name: string;
    date: string | null;
  } | null>(null);

  useEffect(() => {
    if (eventId) {
      loadEventData();
    }
  }, [eventId]);

  const loadEventData = async () => {
    if (!eventId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('public_events')
        .select('event_name, date')
        .eq('id', eventId)
        .maybeSingle();

      if (error) {
        console.error('Error loading event:', error);
        addNotification('Failed to load event', 'error');
        navigate(-1);
        return;
      }

      if (!data) {
        addNotification('Event not found', 'error');
        navigate(-1);
        return;
      }

      setEventData({
        name: data.event_name,
        date: data.date,
      });
    } catch (error) {
      console.error('Error loading event:', error);
      addNotification('Failed to load event', 'error');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!eventData || !eventId) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Back Button */}
      <div className={`px-4 py-2 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <button
          onClick={() => navigate(-1)}
          className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
            ${darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}
          `}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

      {/* Event Task Manager */}
      <div className="flex-1 overflow-hidden">
        <EventCommandCenter
          eventId={eventId}
          eventName={eventData.name}
          eventDate={eventData.date ? new Date(eventData.date) : undefined}
          darkMode={darkMode}
        />
      </div>
    </div>
  );
};
