import React, { useState, useEffect } from 'react';
import { X, Youtube, Link as LinkIcon, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNotifications } from '../contexts/NotificationContext';

interface AddYouTubeUrlModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess: () => void;
  preselectedEventId?: string;
}

export const AddYouTubeUrlModal: React.FC<AddYouTubeUrlModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onSuccess,
  preselectedEventId,
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [selectedEventName, setSelectedEventName] = useState('');
  const [selectedRaceClass, setSelectedRaceClass] = useState('');
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [validUrl, setValidUrl] = useState<boolean | null>(null);
  const [videoId, setVideoId] = useState('');
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    if (isOpen && currentClub?.clubId) {
      fetchAvailableEvents();
    }
  }, [isOpen, currentClub]);

  useEffect(() => {
    if (preselectedEventId && availableEvents.length > 0) {
      const event = availableEvents.find(e => e.id === preselectedEventId);
      if (event) {
        setSelectedEventId(event.id);
        setSelectedEventType(event.type);
        setSelectedEventName(event.name);
        setSelectedRaceClass(event.raceClass || '');
      }
    }
  }, [preselectedEventId, availableEvents]);

  useEffect(() => {
    if (videoId) {
      fetchVideoMetadata(videoId);
    }
  }, [videoId]);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen]);

  const fetchAvailableEvents = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: quickRaces, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_class, race_date')
        .eq('club_id', currentClub.clubId)
        .order('race_date', { ascending: false });

      if (quickRacesError) throw quickRacesError;

      const { data: raceSeries, error: raceSeriesError } = await supabase
        .from('race_series')
        .select('id, series_name, race_class, rounds')
        .eq('club_id', currentClub.clubId)
        .order('created_at', { ascending: false });

      if (raceSeriesError) throw raceSeriesError;

      const { data: publicEvents, error: publicEventsError } = await supabase
        .from('public_events')
        .select('id, event_name, race_class, date')
        .order('date', { ascending: false });

      if (publicEventsError) throw publicEventsError;

      const seriesRounds: any[] = [];
      (raceSeries || []).forEach(series => {
        if (series.rounds && Array.isArray(series.rounds)) {
          series.rounds.forEach((round: any, index: number) => {
            seriesRounds.push({
              id: `${series.id}-round-${index}`,
              name: `${round.name || `Round ${index + 1}`} - ${series.series_name}`,
              race_class: series.race_class,
              type: 'series_round',
              date: round.date,
              seriesId: series.id,
              roundIndex: index
            });
          });
        }
      });

      const allEvents = [
        ...(quickRaces || []).map(event => ({
          id: event.id,
          name: event.event_name || 'Quick Race',
          race_class: event.race_class,
          type: 'quick_race',
          date: event.race_date
        })),
        ...seriesRounds,
        ...(publicEvents || []).map(event => ({
          id: event.id,
          name: event.event_name,
          race_class: event.race_class,
          type: 'public_event',
          date: event.date
        }))
      ].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setAvailableEvents(allEvents);
    } catch (err) {
      console.error('Error fetching available events:', err);
    }
  };

  const extractVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const fetchVideoMetadata = async (id: string) => {
    setFetchingMetadata(true);
    setThumbnailUrl(`https://img.youtube.com/vi/${id}/maxresdefault.jpg`);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn('No session found, skipping metadata fetch');
        setFetchingMetadata(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-youtube-metadata`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ videoId: id }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.canEmbed === false) {
          addNotification('error', data.error || 'This video cannot be embedded');
          setYoutubeUrl('');
          setVideoId('');
          setValidUrl(false);
          setTitle('');
          setDescription('');
          setThumbnailUrl('');
          return;
        } else if (response.status === 404) {
          addNotification('error', 'Video not found or is private');
          setYoutubeUrl('');
          setVideoId('');
          setValidUrl(false);
          setTitle('');
          setDescription('');
          setThumbnailUrl('');
          return;
        } else {
          console.warn('Failed to fetch metadata, user can enter manually:', data);
          addNotification('info', 'Could not fetch video details automatically. Please enter title manually.');
        }
      } else if (data.canEmbed) {
        setTitle(data.title || '');
        setDescription(data.description || '');
        if (data.thumbnailUrl) {
          setThumbnailUrl(data.thumbnailUrl);
        }
      }
    } catch (err) {
      console.error('Error fetching video metadata:', err);
      addNotification('info', 'Could not fetch video details automatically. Please enter title manually.');
    } finally {
      setFetchingMetadata(false);
    }
  };

  const handleUrlChange = (url: string) => {
    setYoutubeUrl(url);
    const extractedId = extractVideoId(url);

    if (extractedId) {
      setVideoId(extractedId);
      setValidUrl(true);
    } else if (url.length > 0) {
      setVideoId('');
      setValidUrl(false);
    } else {
      setVideoId('');
      setValidUrl(null);
    }
  };

  const handleEventChange = (eventId: string) => {
    const selectedEvent = availableEvents.find(event => event.id === eventId);
    if (selectedEvent) {
      setSelectedEventId(selectedEvent.id);
      setSelectedEventType(selectedEvent.type);
      setSelectedEventName(selectedEvent.name);
      setSelectedRaceClass(selectedEvent.race_class || '');
    } else {
      setSelectedEventId('');
      setSelectedEventType('');
      setSelectedEventName('');
      setSelectedRaceClass('');
    }
  };

  const handleSave = async () => {
    if (!currentClub?.clubId || !videoId || !title) {
      addNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('event_media')
        .insert({
          club_id: currentClub.clubId,
          media_type: 'youtube_video',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          title,
          description: description || null,
          event_ref_id: selectedEventId || null,
          event_ref_type: selectedEventType || null,
          event_name: selectedEventName || null,
          race_class: selectedRaceClass || null,
          is_homepage_media: false,
        });

      if (error) throw error;

      addNotification('success', 'YouTube video added successfully');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving YouTube video:', err);
      addNotification('error', 'Failed to save YouTube video');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setSelectedEventId('');
    setSelectedEventType('');
    setSelectedEventName('');
    setSelectedRaceClass('');
    setValidUrl(null);
    setVideoId('');
    setThumbnailUrl('');
    setFetchingMetadata(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Youtube className="text-red-600" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Add YouTube Video
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              YouTube URL <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className={`
                  w-full px-4 py-2 pr-10 rounded-lg border
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {validUrl === true && (
                  <CheckCircle size={20} className="text-green-500" />
                )}
                {validUrl === false && (
                  <AlertCircle size={20} className="text-red-500" />
                )}
              </div>
            </div>
            {validUrl === false && (
              <p className="text-red-500 text-sm mt-1">
                Please enter a valid YouTube URL
              </p>
            )}
          </div>

          {fetchingMetadata && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className={`ml-3 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                Fetching video details...
              </span>
            </div>
          )}

          {!fetchingMetadata && videoId && thumbnailUrl && (
            <div className="rounded-lg overflow-hidden border border-slate-700">
              <div className="aspect-video">
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title"
              disabled={fetchingMetadata}
              className={`
                w-full px-4 py-2 rounded-lg border
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
                ${fetchingMetadata ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Enter video description (optional)"
              disabled={fetchingMetadata}
              className={`
                w-full px-4 py-2 rounded-lg border
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
                ${fetchingMetadata ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Link to Event (Optional)
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              className={`
                w-full px-4 py-2 rounded-lg border
                ${darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            >
              <option value="">No event selected</option>
              {availableEvents.map(event => (
                <option key={`${event.type}-${event.id}`} value={event.id}>
                  {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                </option>
              ))}
            </select>
          </div>

          {selectedRaceClass && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Race Class
              </label>
              <input
                type="text"
                value={selectedRaceClass}
                readOnly
                className={`
                  w-full px-4 py-2 rounded-lg border opacity-60 cursor-not-allowed
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>
          )}
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${saving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !videoId || !title || fetchingMetadata}
            className={`
              flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
              ${(saving || !videoId || !title || fetchingMetadata) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Add Video
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
