import React, { useState, useEffect } from 'react';
import { X, Upload, Youtube, AlertTriangle, CheckCircle, Video, Calendar, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNotifications } from '../contexts/NotificationContext';

// Helper function to extract database UUID from app event ID
function extractDbId(eventId: string): string {
  if (eventId.includes('-round-') || eventId.includes('-day-')) {
    // For series events like "uuid-round-1" or "uuid-day-2"
    const parts = eventId.split('-');
    // Take first 5 parts to reconstruct the UUID (8-4-4-4-12 format)
    return parts.slice(0, 5).join('-');
  }
  return eventId; // Return as-is if no suffix
}

interface UploadVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess?: () => void;
  preselectedEventId?: string;
  preselectedEventType?: string;
}

interface VideoFormData {
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
  eventId: string;
  eventType: string;
  eventName: string;
  raceClass: string;
}

interface AvailableEvent {
  id: string;
  name: string;
  race_class: string;
  type: string;
  date?: string;
  seriesId?: string;
  roundIndex?: number;
}

export const UploadVideoModal: React.FC<UploadVideoModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onSuccess,
  preselectedEventId,
  preselectedEventType
}) => {
  const { currentClub } = useAuth();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableEvents, setAvailableEvents] = useState<AvailableEvent[]>([]);
  const { addNotification } = useNotifications();
  const [loadingEvents, setLoadingEvents] = useState(false);
  
  const [formData, setFormData] = useState<VideoFormData>({
    title: '',
    description: '',
    privacy: 'unlisted',
    eventId: preselectedEventId || '',
    eventType: preselectedEventType || '',
    eventName: '',
    raceClass: ''
  });

  useEffect(() => {
    if (isOpen && currentClub?.clubId) {
      fetchAvailableEvents();
    }
  }, [isOpen, currentClub]);

  useEffect(() => {
    if (preselectedEventId && preselectedEventType) {
      setFormData(prev => ({
        ...prev,
        eventId: preselectedEventId,
        eventType: preselectedEventType
      }));
    }
  }, [preselectedEventId, preselectedEventType]);

  const fetchAvailableEvents = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoadingEvents(true);
      setError(null);

      // Fetch quick races
      const { data: quickRaces, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_class, race_date')
        .eq('club_id', currentClub.clubId)
        .order('race_date', { ascending: false });

      if (quickRacesError) throw quickRacesError;

      // Fetch race series
      const { data: raceSeries, error: raceSeriesError } = await supabase
        .from('race_series')
        .select('id, series_name, race_class, rounds')
        .eq('club_id', currentClub.clubId)
        .order('created_at', { ascending: false });

      if (raceSeriesError) throw raceSeriesError;

      // Fetch public events
      const { data: publicEvents, error: publicEventsError } = await supabase
        .from('public_events')
        .select('id, event_name, race_class, date')
        .order('date', { ascending: false });

      if (publicEventsError) throw publicEventsError;

      // Process series rounds
      const seriesRounds: AvailableEvent[] = [];
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

      // Combine all events
      const allEvents: AvailableEvent[] = [
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
      setError('Failed to load available events');
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's a video file
    if (!file.type.startsWith('video/')) {
      setError('Please select a video file');
      return;
    }

    // Check file size (limit to 2GB for YouTube)
    const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
    if (file.size > maxSize) {
      setError('Video file size must be less than 2GB');
      return;
    }

    setVideoFile(file);
    setError(null);

    // Auto-generate title from filename if empty
    if (!formData.title) {
      const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
      setFormData(prev => ({ ...prev, title: fileName }));
    }
  };

  const handleEventChange = (eventId: string) => {
    const selectedEvent = availableEvents.find(event => event.id === eventId);
    if (selectedEvent) {
      setFormData(prev => ({
        ...prev,
        eventId: selectedEvent.id,
        eventType: selectedEvent.type,
        eventName: selectedEvent.name,
        raceClass: selectedEvent.race_class
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        eventId: '',
        eventType: '',
        eventName: '',
        raceClass: ''
      }));
    }
  };

  const handleUpload = async () => {
    if (!videoFile || !currentClub?.clubId) return;

    if (!formData.title.trim()) {
      setError('Please enter a video title');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;

          // Call the YouTube upload edge function
          // Extract the database UUID for the event reference
          const dbEventId = formData.eventType === 'series_round' 
            ? extractDbId(formData.eventId.split('-round-')[0])
            : extractDbId(formData.eventId || '');

          const { data, error } = await supabase.functions.invoke('youtube-upload', {
            body: {
              videoFile: base64Data,
              title: formData.title,
              description: formData.description,
              privacy: formData.privacy,
              clubId: currentClub.clubId,
              eventId: dbEventId || null,
              eventType: formData.eventType || null,
              eventName: formData.eventName || null,
              raceClass: formData.raceClass || null
            }
          });

          if (error) throw error;

          if (data.error) {
            throw new Error(data.error);
          }

          addNotification('success', `Video uploaded successfully to YouTube! Video ID: ${data.videoId}`);
          
          // Reset form
          setVideoFile(null);
          setFormData({
            title: '',
            description: '',
            privacy: 'unlisted',
            eventId: '',
            eventType: '',
            eventName: '',
            raceClass: ''
          });

          // Call success callback
          if (onSuccess) {
            setTimeout(() => {
              onSuccess();
              onClose();
            }, 2000);
          }

        } catch (err) {
          console.error('Upload error:', err);
          setError(err instanceof Error ? err.message : 'Failed to upload video');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read video file');
        setUploading(false);
      };

      reader.readAsDataURL(videoFile);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload video');
      setUploading(false);
    }
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
            <Youtube className="text-red-400" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Upload Video to YouTube
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
              <AlertTriangle className="text-red-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-red-400 font-medium">Upload Error</h3>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30 flex items-start gap-3">
              <CheckCircle className="text-green-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-green-400 font-medium">Upload Successful</h3>
                <p className="text-green-300 text-sm">{success}</p>
              </div>
            </div>
          )}

          {/* Video File Upload */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Video File *
            </label>
            <div className={`
              relative
              border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${videoFile 
                ? darkMode ? 'border-green-600 bg-green-900/20' : 'border-green-500 bg-green-50'
                : darkMode ? 'border-slate-600 hover:border-slate-500' : 'border-slate-300 hover:border-slate-400'}
            `}>
              {videoFile ? (
                <div className="space-y-2">
                  <Video className="mx-auto text-green-400" size={32} />
                  <p className={`font-medium ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                    {videoFile.name}
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-500'}`}>
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                  <button
                    onClick={() => setVideoFile(null)}
                    disabled={uploading}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className={`mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} size={32} />
                  <p className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Click to select video file
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Supports MP4, MOV, AVI and other video formats (Max 2GB)
                  </p>
                </div>
              )}
              <input
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Video Details */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Video Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                disabled={uploading}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                  ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                placeholder="Enter video title"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                disabled={uploading}
                rows={3}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                  ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                placeholder="Enter video description"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Privacy Setting
              </label>
              <select
                value={formData.privacy}
                onChange={(e) => setFormData(prev => ({ ...prev, privacy: e.target.value as any }))}
                disabled={uploading}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                  ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <option value="public">Public - Anyone can search for and view</option>
                <option value="unlisted">Unlisted - Anyone with the link can view</option>
                <option value="private">Private - Only you can view</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Associated Event (Optional)
              </label>
              {loadingEvents ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <select
                  value={formData.eventId}
                  onChange={(e) => handleEventChange(e.target.value)}
                  disabled={uploading}
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-slate-300 text-slate-900'}
                    ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <option value="">Select an event</option>
                  {availableEvents.map(event => (
                    <option key={`${event.type}-${event.id}`} value={event.id}>
                      {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {formData.eventName && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Event Name
                  </label>
                  <div className={`
                    px-3 py-2 rounded-lg border
                    ${darkMode ? 'bg-slate-700/50 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-600'}
                  `}>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      <span className="text-sm">{formData.eventName}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Race Class
                  </label>
                  <div className={`
                    px-3 py-2 rounded-lg border
                    ${darkMode ? 'bg-slate-700/50 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-300 text-slate-600'}
                  `}>
                    <div className="flex items-center gap-2">
                      <Trophy size={16} />
                      <span className="text-sm">{formData.raceClass}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            disabled={uploading}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!videoFile || !formData.title.trim() || uploading}
            className={`
              flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors
              ${(!videoFile || !formData.title.trim() || uploading) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Uploading to YouTube...
              </>
            ) : (
              <>
                <Youtube size={16} />
                Upload to YouTube
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};