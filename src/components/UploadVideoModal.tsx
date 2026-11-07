import React, { useState, useEffect } from 'react';
import { AlfieIcon } from './brand/AlfieIcon';
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
        .neq('is_simulated', true)
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
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !uploading && onClose()} aria-hidden="true" />
      <section className="a-sheet a-md-sheet relative w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-md-vid-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-md-yt-tile" aria-hidden="true"><i /></span>
          <div className="min-w-0 flex-1">
            <h2 id="a-md-vid-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Upload Video to YouTube</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Posts to your club's connected YouTube channel and adds it here</p>
          </div>
          <button type="button" onClick={onClose} disabled={uploading} className="a-ib" aria-label="Close">
            <AlfieIcon glyph="x" size={20} />
          </button>
        </header>

        <div className="a-md-sheet-body">
          {error && (
            <div className="a-nw-ed-msg a-nw-ed-msg-r" role="alert">
              <AlfieIcon glyph="warn" size={18} />
              <p><b>Upload Error</b><br />{error}</p>
            </div>
          )}

          {success && (
            <div className="a-nw-ed-msg a-nw-ed-msg-g" role="status">
              <AlfieIcon glyph="check" size={18} />
              <p><b>Upload Successful</b><br />{success}</p>
            </div>
          )}

          {/* Video file */}
          <div className="a-md-fl">
            <span>Video File *</span>
            <div className={`a-md-drop a-md-drop-sm ${videoFile ? 'is-set' : ''}`}>
              {videoFile ? (
                <>
                  <span className="a-md-drop-ic is-ok"><AlfieIcon glyph="video" size={24} /></span>
                  <b className="truncate max-w-full">{videoFile.name}</b>
                  <span>{(videoFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <button
                    type="button"
                    onClick={() => setVideoFile(null)}
                    disabled={uploading}
                    className="a-md-link-d"
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <span className="a-md-drop-ic"><AlfieIcon glyph="upload" size={24} /></span>
                  <b>Click to select video file</b>
                  <span>Supports MP4, MOV, AVI and other video formats (Max 2GB)</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Choose video file"
                  />
                </>
              )}
            </div>
          </div>

          <label className="a-md-fl">
            <span>Video Title *</span>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              disabled={uploading}
              className="a-inp"
              placeholder="Enter video title"
            />
          </label>

          <label className="a-md-fl">
            <span>Description</span>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={uploading}
              rows={3}
              className="a-inp"
              placeholder="Enter video description"
            />
          </label>

          <div className="a-md-fl">
            <span>Privacy Setting</span>
            <div className="a-md-privacy" role="radiogroup" aria-label="Privacy Setting">
              {([
                ['public', 'Public', 'Anyone can search for and view', 'globe'],
                ['unlisted', 'Unlisted', 'Anyone with the link can view', 'link'],
                ['private', 'Private', 'Only you can view', 'lock'],
              ] as const).map(([value, label, hint, glyph]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={formData.privacy === value}
                  disabled={uploading}
                  className={`a-md-priv ${formData.privacy === value ? 'is-on' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, privacy: value }))}
                >
                  <AlfieIcon glyph={glyph} size={17} />
                  <b>{label}</b>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="a-md-fl">
            <span>Associated Event (Optional)</span>
            {loadingEvents ? (
              <span className="a-md-readonly"><span className="a-nw-spin" />Loading events…</span>
            ) : (
              <select
                value={formData.eventId}
                onChange={(e) => handleEventChange(e.target.value)}
                disabled={uploading}
                className="a-inp"
              >
                <option value="">Select an event</option>
                {availableEvents.map(event => (
                  <option key={`${event.type}-${event.id}`} value={event.id}>
                    {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                  </option>
                ))}
              </select>
            )}
          </label>

          {formData.eventName && (
            <div className="a-md-pair">
              <div className="a-md-fl">
                <span>Event Name</span>
                <div className="a-md-readonly"><AlfieIcon glyph="cal" size={15} />{formData.eventName}</div>
              </div>
              <div className="a-md-fl">
                <span>Race Class</span>
                <div className="a-md-readonly"><AlfieIcon glyph="trophy" size={15} />{formData.raceClass}</div>
              </div>
            </div>
          )}
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button onClick={onClose} disabled={uploading} className="a-btn a-btn-q">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!videoFile || !formData.title.trim() || uploading}
            className="a-btn a-btn-p"
          >
            {uploading ? (
              <>
                <span className="a-nw-spin" />
                Uploading to YouTube...
              </>
            ) : (
              <>
                <AlfieIcon glyph="upload" size={16} />
                Upload to YouTube
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
};