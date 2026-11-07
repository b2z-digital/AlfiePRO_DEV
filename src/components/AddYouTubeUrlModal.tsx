import React, { useState, useEffect } from 'react';
import { AlfieIcon } from './brand/AlfieIcon';
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
        .neq('is_simulated', true)
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
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !saving && onClose()} aria-hidden="true" />
      <section className="a-sheet a-md-sheet relative w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-md-yt-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-md-yt-tile" aria-hidden="true"><i /></span>
          <div className="min-w-0 flex-1">
            <h2 id="a-md-yt-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Add YouTube Video</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Paste a link and we'll fill in the details</p>
          </div>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close">
            <AlfieIcon glyph="x" size={20} />
          </button>
        </header>

        <div className="a-md-sheet-body">
          <label className="a-md-fl">
            <span>YouTube URL <em>*</em></span>
            <span className={`a-field a-md-url ${validUrl === true ? 'is-ok' : validUrl === false ? 'is-bad' : ''}`}>
              <AlfieIcon glyph="link" size={16} />
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
              />
              {validUrl === true && <AlfieIcon glyph="check" size={17} className="a-txt-g" strokeWidth={2.2} />}
              {validUrl === false && <AlfieIcon glyph="warn" size={17} className="a-txt-r" />}
            </span>
            {validUrl === false && (
              <small className="a-txt-r">Please enter a valid YouTube URL</small>
            )}
          </label>

          {fetchingMetadata && (
            <div className="a-md-yt-preview is-loading">
              <span className="a-nw-spin a-nw-spin-lg" />
              <span>Fetching video details...</span>
            </div>
          )}

          {!fetchingMetadata && videoId && thumbnailUrl && (
            <div className="a-md-yt-preview">
              <img src={thumbnailUrl} alt="Video thumbnail" />
              <span className="a-md-play" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
              </span>
            </div>
          )}

          <label className="a-md-fl">
            <span>Title <em>*</em></span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title"
              disabled={fetchingMetadata}
              className="a-inp"
            />
          </label>

          <label className="a-md-fl">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Enter video description (optional)"
              disabled={fetchingMetadata}
              className="a-inp"
            />
          </label>

          <label className="a-md-fl">
            <span>Link to Event (Optional)</span>
            <select
              value={selectedEventId}
              onChange={(e) => handleEventChange(e.target.value)}
              className="a-inp"
            >
              <option value="">No event selected</option>
              {availableEvents.map(event => (
                <option key={`${event.type}-${event.id}`} value={event.id}>
                  {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                </option>
              ))}
            </select>
          </label>

          {selectedRaceClass && (
            <div className="a-md-fl">
              <span>Race Class</span>
              <div className="a-md-readonly"><AlfieIcon glyph="trophy" size={15} />{selectedRaceClass}</div>
            </div>
          )}
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button onClick={onClose} disabled={saving} className="a-btn a-btn-q">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !videoId || !title || fetchingMetadata}
            className="a-btn a-btn-p"
          >
            {saving ? (
              <>
                <span className="a-nw-spin" />
                Saving...
              </>
            ) : (
              <>
                <AlfieIcon glyph="plus" size={16} />
                Add Video
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
};
