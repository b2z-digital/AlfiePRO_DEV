import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { EventMedia } from '../types/media';
import { UploadVideoModal } from '../components/UploadVideoModal';
import { ImageUploadModal } from '../components/ImageUploadModal';
import { AddYouTubeUrlModal } from '../components/AddYouTubeUrlModal';
import { SocialShareModal } from '../components/SocialShareModal';
import { ShareWithClubsModal } from '../components/ShareWithClubsModal';
import { useNotifications } from '../contexts/NotificationContext';
import JSZip from 'jszip';
import { AlfieIcon } from '../components/brand/AlfieIcon';
import { MediaRow, MediaThumb, MediaTile, MediaTileSkeleton, MediaViewer } from '../components/media/MediaParts';

interface MediaPageProps {
  darkMode: boolean;
}

const MediaPage: React.FC<MediaPageProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const navigate = useNavigate();
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<EventMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get current context ID (club or organization)
  const contextId = currentOrganization?.id || currentClub?.clubId;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'image' | 'youtube_video'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMedia, setSelectedMedia] = useState<EventMedia | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMedia, setEditingMedia] = useState<EventMedia | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    event_ref_id: '',
    event_ref_type: '',
    event_name: '',
    race_class: ''
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mediaToDelete, setMediaToDelete] = useState<EventMedia | null>(null);
  const [saving, setSaving] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [showYouTubeUrlModal, setShowYouTubeUrlModal] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'event'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showClubShareModal, setShowClubShareModal] = useState(false);
  const [selectedEventName, setSelectedEventName] = useState('');
  const { addNotification } = useNotifications();

  // Get unique event names and race classes for filters
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [raceClasses, setRaceClasses] = useState<string[]>([]);

  useEffect(() => {
    if (contextId) {
      fetchMedia();
      fetchAvailableEvents();
    }
  }, [contextId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    filterMedia();
  }, [media, searchTerm, selectedEventName, selectedClass, selectedType]);

  const fetchMedia = async () => {
    if (!contextId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch media with club information for shared media
      const { data: ownMedia, error: ownError } = await supabase
        .from('event_media')
        .select(`
          *,
          club:clubs(id, name, abbreviation, logo)
        `)
        .eq('club_id', contextId)
        .eq('is_homepage_media', false)
        .order('created_at', { ascending: false });

      if (ownError) throw ownError;

      // Fetch shared media from other clubs (only for clubs, not organizations)
      let sharedMedia = [];
      if (currentClub) {
        const { data, error: sharedError } = await supabase
          .from('shared_club_media')
          .select(`
            media:event_media(
              *,
              club:clubs(id, name, abbreviation, logo)
            )
          `)
          .eq('recipient_club_id', contextId);

        if (sharedError) throw sharedError;
        sharedMedia = data || [];
      }

      // Combine own media and shared media
      const allMedia = [
        ...(ownMedia || []),
        ...(sharedMedia || []).map(item => ({
          ...item.media,
          isShared: true,
          sharedFrom: item.media.club
        }))
      ];

      setMedia(allMedia);

      // Extract unique event names and race classes for filters
      const uniqueEventNames = [...new Set(allMedia?.map(m => m.event_name).filter(Boolean) || [])];
      const uniqueRaceClasses = [...new Set(allMedia?.map(m => m.race_class).filter(Boolean) || [])];
      
      setEventNames(uniqueEventNames);
      setRaceClasses(uniqueRaceClasses);

    } catch (err) {
      console.error('Error fetching media:', err);
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableEvents = async () => {
    if (!currentClub?.clubId) return;

    try {
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

      // Combine all events including series rounds
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
        // Sort by date, with most recent first
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

  const filterMedia = () => {
    let filtered = [...media];

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'date':
          // ascending by date, so "Newest first" (desc) really shows the newest first
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'name':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'event':
          comparison = (a.event_name || '').localeCompare(b.event_name || '');
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.event_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by event name
    if (selectedEventName) {
      filtered = filtered.filter(item => item.event_name === selectedEventName);
    }

    // Filter by race class
    if (selectedClass) {
      filtered = filtered.filter(item => item.race_class === selectedClass);
    }

    // Filter by media type
    if (selectedType !== 'all') {
      filtered = filtered.filter(item => item.media_type === selectedType);
    }

    setFilteredMedia(filtered);
  };

  const handleEditMedia = (mediaItem: EventMedia) => {
    setEditingMedia(mediaItem);
    setEditForm({
      title: mediaItem.title || '',
      description: mediaItem.description || '',
      event_ref_id: mediaItem.event_ref_id || '',
      event_ref_type: mediaItem.event_ref_type || '',
      event_name: mediaItem.event_name || '',
      race_class: mediaItem.race_class || ''
    });
    setShowEditModal(true);
  };

  const handleEventChange = (eventId: string) => {
    const selectedEvent = availableEvents.find(event => event.id === eventId);
    if (selectedEvent) {
      setEditForm({
        ...editForm,
        event_ref_id: selectedEvent.id,
        event_ref_type: selectedEvent.type,
        event_name: selectedEvent.name,
        race_class: selectedEvent.race_class
      });
    } else {
      setEditForm({
        ...editForm,
        event_ref_id: '',
        event_ref_type: '',
        event_name: '',
        race_class: ''
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMedia || !currentClub?.clubId) return;

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('event_media')
        .update({
          title: editForm.title,
          description: editForm.description,
          event_ref_id: editForm.event_ref_id || null,
          event_ref_type: editForm.event_ref_type || null,
          event_name: editForm.event_name || null,
          race_class: editForm.race_class || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingMedia.id);

      if (error) throw error;

      // Refresh media list
      await fetchMedia();
      
      setShowEditModal(false);
      setEditingMedia(null);
      setEditForm({ 
        title: '', 
        description: '', 
        event_ref_id: '',
        event_ref_type: '',
        event_name: '', 
        race_class: '' 
      });
    } catch (err) {
      console.error('Error updating media:', err);
      setError(err instanceof Error ? err.message : 'Failed to update media');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMedia = (mediaItem: EventMedia) => {
    setMediaToDelete(mediaItem);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!mediaToDelete || !currentClub?.clubId) return;

    try {
      setError(null);

      // Extract storage path from URL and delete from storage
      if (mediaToDelete.url && mediaToDelete.media_type === 'image') {
        const urlParts = mediaToDelete.url.split('/');
        const bucketIndex = urlParts.findIndex(part => part === 'event-media');

        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
          const pathParts = urlParts.slice(bucketIndex + 1);
          const storagePath = decodeURIComponent(pathParts.join('/').split('?')[0]);

          const { error: storageError } = await supabase.storage
            .from('event-media')
            .remove([storagePath]);

          if (storageError) {
            console.error('Error deleting from storage:', storageError);
          }
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('event_media')
        .delete()
        .eq('id', mediaToDelete.id);

      if (error) throw error;

      // Refresh media list
      await fetchMedia();
      addNotification('success', 'Media deleted successfully');

      setShowDeleteConfirm(false);
      setMediaToDelete(null);
    } catch (err) {
      console.error('Error deleting media:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete media');
    }
  };

  const handleToggleSelection = (mediaId: string) => {
    const newSelection = new Set(selectedMediaIds);
    if (newSelection.has(mediaId)) {
      newSelection.delete(mediaId);
    } else {
      newSelection.add(mediaId);
    }
    setSelectedMediaIds(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedMediaIds.size === filteredMedia.length) {
      // Deselect all
      setSelectedMediaIds(new Set());
    } else {
      // Select all
      const allIds = new Set(filteredMedia.map(item => item.id));
      setSelectedMediaIds(allIds);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Error downloading file:', err);
      addNotification('error', 'Failed to download file');
    }
  };

  const handleBulkDownload = async () => {
    const selectedMedia = getSelectedMedia();

    if (selectedMedia.length === 0) {
      addNotification('error', 'No media selected');
      return;
    }

    const images = selectedMedia.filter(m => m.media_type === 'image');
    const videos = selectedMedia.filter(m => m.media_type === 'youtube_video');

    if (images.length === 0) {
      addNotification('error', 'No images to download. YouTube videos cannot be downloaded.');
      return;
    }

    if (videos.length > 0) {
      addNotification('info', `YouTube videos (${videos.length}) will not be included in download as they are hosted on YouTube`);
    }

    try {
      addNotification('info', `Preparing ${images.length} image${images.length > 1 ? 's' : ''} for download...`);

      const zip = new JSZip();
      const folder = zip.folder('media');

      for (const media of images) {
        try {
          const response = await fetch(media.url);
          const blob = await response.blob();

          // Generate filename with extension
          const ext = media.url.split('.').pop()?.split('?')[0] || 'jpg';
          const filename = `${media.title || 'image'}.${ext}`;

          folder?.file(filename, blob);
        } catch (err) {
          console.error(`Failed to download ${media.title}:`, err);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(content);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `media-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(blobUrl);

      addNotification('success', `Downloaded ${images.length} image${images.length > 1 ? 's' : ''}`);
      handleClearSelection();
    } catch (err) {
      console.error('Error creating zip:', err);
      addNotification('error', 'Failed to create zip file');
    }
  };

  const handleClearSelection = () => {
    setSelectedMediaIds(new Set());
  };

  const handleShareSelected = () => {
    if (selectedMediaIds.size > 0) {
      setShowShareModal(true);
    }
  };

  const getSelectedMedia = () => {
    return filteredMedia.filter(item => selectedMediaIds.has(item.id));
  };

  const handleMediaClick = (mediaItem: EventMedia) => {
    // Always open media in modal or lightbox when clicking the image
    setSelectedMedia(mediaItem);
    setShowModal(true);
  };

  const handleConnectYouTube = () => {
    navigate('/settings?tab=integrations');
  };

  const photoCount = media.filter(m => m.media_type === 'image').length;
  const videoCount = media.filter(m => m.media_type === 'youtube_video').length;
  const filtersActive = !!(searchTerm || selectedEventName || selectedClass || selectedType !== 'all');
  const selectionCount = getSelectedMedia().length;
  const selecting = selectionCount > 0;

  // Sections: by month when sorted by date, by event when sorted by event
  const groups: { key: string; label: string; items: EventMedia[] }[] = [];
  if (sortBy === 'name') {
    groups.push({ key: 'all', label: '', items: filteredMedia });
  } else {
    const byKey = new Map<string, { key: string; label: string; items: EventMedia[] }>();
    filteredMedia.forEach(item => {
      let key: string;
      let label: string;
      if (sortBy === 'event') {
        key = item.event_name || '';
        label = item.event_name || 'General media';
      } else {
        const d = new Date(item.created_at);
        key = isNaN(d.getTime()) ? 'unknown' : `${d.getFullYear()}-${d.getMonth()}`;
        label = isNaN(d.getTime()) ? 'Undated' : d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      }
      if (!byKey.has(key)) {
        const g = { key, label, items: [] as EventMedia[] };
        byKey.set(key, g);
        groups.push(g);
      }
      byKey.get(key)!.items.push(item);
    });
  }

  const toggleGroup = (items: EventMedia[]) => {
    const all = items.every(i => selectedMediaIds.has(i.id));
    const next = new Set(selectedMediaIds);
    items.forEach(i => (all ? next.delete(i.id) : next.add(i.id)));
    setSelectedMediaIds(next);
  };

  const viewerIndex = selectedMedia ? filteredMedia.findIndex(m => m.id === selectedMedia.id) : -1;
  const openAt = (i: number) => { const m = filteredMedia[i]; if (m) setSelectedMedia(m); };

  const itemProps = (mediaItem: EventMedia) => ({
    selected: selectedMediaIds.has(mediaItem.id),
    onOpen: () => handleMediaClick(mediaItem),
    onToggle: () => handleToggleSelection(mediaItem.id),
    onEdit: () => handleEditMedia(mediaItem),
    onDelete: () => handleDeleteMedia(mediaItem),
    onDownload: () => handleDownload(mediaItem.url, mediaItem.title || 'image'),
  });

  const closeEdit = () => {
    setShowEditModal(false);
    setEditingMedia(null);
    setEditForm({
      title: '',
      description: '',
      event_ref_id: '',
      event_ref_type: '',
      event_name: '',
      race_class: ''
    });
  };

  const sortValue = `${sortBy}-${sortOrder}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className={`a-md-page flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-28 lg:pl-9 ${selecting ? 'a-md-selecting' : ''}`}>
        {/* Header */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}>
            <AlfieIcon glyph="camera" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Media Center</h1>
            <p className="a-mute m-0 mt-1 text-[14px]">
              {loading || media.length === 0
                ? "Upload, organize and share your club's media content"
                : `${photoCount} photo${photoCount === 1 ? '' : 's'} · ${videoCount} video${videoCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="a-field a-nw-search">
              <AlfieIcon glyph="search" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search media"
                aria-label="Search media"
              />
              {searchTerm && (
                <button type="button" className="a-nw-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                  <AlfieIcon glyph="x" size={13} />
                </button>
              )}
            </label>

            {/* Upload split button */}
            <div className="relative" ref={uploadMenuRef}>
              <div className="a-md-split">
                <button onClick={() => setShowImageUploadModal(true)} className="a-btn a-btn-p a-md-split-main" aria-label="Upload Media">
                  <AlfieIcon glyph="upload" size={17} />
                  <span className="a-nw-newbtn-lbl">Upload</span>
                </button>
                <button
                  onClick={() => setShowUploadMenu(!showUploadMenu)}
                  className="a-btn a-btn-p a-md-split-more"
                  aria-label="More upload options"
                  aria-expanded={showUploadMenu}
                >
                  <AlfieIcon glyph="chev" size={16} />
                </button>
              </div>

              {showUploadMenu && (
                <div className="a-pop a-md-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowImageUploadModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="a-md-menu-i"
                  >
                    <span className="a-md-menu-ic a-md-menu-ic-b"><AlfieIcon glyph="image" size={18} /></span>
                    <span>
                      <b>Upload Images</b>
                      <span>Add photos from your device</span>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUploadModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="a-md-menu-i"
                  >
                    <span className="a-md-menu-ic a-md-menu-ic-r"><AlfieIcon glyph="video" size={18} /></span>
                    <span>
                      <b>Upload Video</b>
                      <span>Upload directly to YouTube</span>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowYouTubeUrlModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="a-md-menu-i"
                  >
                    <span className="a-md-menu-ic a-md-menu-ic-p"><AlfieIcon glyph="link" size={18} /></span>
                    <span>
                      <b>Add YouTube URL</b>
                      <span>Link an existing YouTube video</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Toolbar */}
        <div className="a-nw-toolbar">
          <div className="a-seg" role="group" aria-label="Media type">
            <button type="button" className={`a-seg-i ${selectedType === 'all' ? 'a-seg-on' : ''}`} onClick={() => setSelectedType('all')} aria-pressed={selectedType === 'all'}>
              All<span className="a-cnt">{media.length}</span>
            </button>
            <button type="button" className={`a-seg-i ${selectedType === 'image' ? 'a-seg-on' : ''}`} onClick={() => setSelectedType('image')} aria-pressed={selectedType === 'image'}>
              <AlfieIcon glyph="camera" size={15} />Photos<span className="a-cnt">{photoCount}</span>
            </button>
            <button type="button" className={`a-seg-i ${selectedType === 'youtube_video' ? 'a-seg-on' : ''}`} onClick={() => setSelectedType('youtube_video')} aria-pressed={selectedType === 'youtube_video'}>
              <AlfieIcon glyph="video" size={15} />Videos<span className="a-cnt">{videoCount}</span>
            </button>
          </div>

          <div className="a-nw-tools">
            {eventNames.length > 0 && (
              <select
                value={selectedEventName}
                onChange={(e) => setSelectedEventName(e.target.value)}
                className="a-pick a-nw-pick a-md-pick-ev"
                aria-label="Filter by event"
              >
                <option value="">All events</option>
                {eventNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
            {raceClasses.length > 0 && (
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="a-pick a-nw-pick"
                aria-label="Filter by class"
              >
                <option value="">All classes</option>
                {raceClasses.map(raceClass => (
                  <option key={raceClass} value={raceClass}>{raceClass}</option>
                ))}
              </select>
            )}
            <select
              value={sortValue}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-') as ['date' | 'name' | 'event', 'asc' | 'desc'];
                setSortBy(by);
                setSortOrder(order);
              }}
              className="a-pick a-nw-pick"
              aria-label="Sort"
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="event-asc">Event (A–Z)</option>
            </select>
            <div className="a-seg" role="group" aria-label="Layout">
              <button type="button" className={`a-seg-i a-nw-seg-ic ${viewMode === 'grid' ? 'a-seg-on' : ''}`} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
                <AlfieIcon glyph="grid" size={16} />
              </button>
              <button type="button" className={`a-seg-i a-nw-seg-ic ${viewMode === 'list' ? 'a-seg-on' : ''}`} onClick={() => setViewMode('list')} title="List view" aria-label="List view" aria-pressed={viewMode === 'list'}>
                <AlfieIcon glyph="list" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Media */}
        {loading ? (
          <div className="a-md-grid" aria-busy="true" aria-label="Loading media">
            {Array.from({ length: 10 }).map((_, i) => <MediaTileSkeleton key={i} index={i} />)}
          </div>
        ) : error ? (
          <div className="a-card a-empty py-14 px-6">
            <span className="a-tile a-tile-lg a-tile-danger"><AlfieIcon glyph="warn" size={24} /></span>
            <h3 className="a-ink m-0 text-[17px] font-semibold">Couldn't load media</h3>
            <p className="a-mute m-0 text-[14px]">{error}</p>
            <button onClick={fetchMedia} className="a-btn a-btn-p mt-2">Try Again</button>
          </div>
        ) : filteredMedia.length === 0 ? (
          <div className="a-card a-empty py-14 px-6">
            <span className="a-tile a-tile-lg a-tile-rim"><AlfieIcon glyph={media.length === 0 ? 'camera' : 'search'} size={24} /></span>
            <h3 className="a-ink m-0 text-[17px] font-semibold">{media.length === 0 ? 'No media yet' : 'Nothing matches'}</h3>
            <p className="a-mute m-0 max-w-md text-[14px]">
              {media.length === 0
                ? 'No media has been uploaded yet. Add images or videos to your events to see them here.'
                : 'No media matches your current filters. Try adjusting your search criteria.'}
            </p>
            {media.length === 0 ? (
              <button onClick={() => setShowImageUploadModal(true)} className="a-btn a-btn-p mt-2">
                <AlfieIcon glyph="upload" size={16} />Upload Media
              </button>
            ) : filtersActive && (
              <button
                onClick={() => { setSearchTerm(''); setSelectedEventName(''); setSelectedClass(''); setSelectedType('all'); }}
                className="a-btn mt-2"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map((group, gi) => {
              const allSel = group.items.every(i => selectedMediaIds.has(i.id));
              return (
                <section key={group.key} className="flex flex-col gap-3.5" aria-label={group.label || 'Media'}>
                  {group.label && (
                    <div className="a-md-sec">
                      <h2>{group.label}</h2>
                      <span className="a-cnt">{group.items.length}</span>
                      <button type="button" className="a-md-sec-sel" onClick={() => toggleGroup(group.items)}>
                        {allSel ? 'Deselect' : 'Select'}
                      </button>
                    </div>
                  )}
                  {viewMode === 'grid' ? (
                    <div className="a-md-grid">
                      {gi === 0 && (
                        <button type="button" className="a-md-add" onClick={() => setShowImageUploadModal(true)}>
                          <span className="a-md-add-ic"><AlfieIcon glyph="plus" size={24} /></span>
                          <b>Upload Media</b>
                          <span>Click to add images or videos</span>
                        </button>
                      )}
                      {group.items.map((mediaItem, i) => (
                        <MediaTile
                          key={mediaItem.id}
                          item={mediaItem}
                          index={i}
                          showEvent={sortBy !== 'event'}
                          {...itemProps(mediaItem)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="a-md-list">
                      {group.items.map((mediaItem, i) => (
                        <MediaRow key={mediaItem.id} item={mediaItem} index={i} {...itemProps(mediaItem)} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* Selection bar */}
        {selecting && (
          <div className="a-md-selbar" role="toolbar" aria-label="Selected media">
            <span className="a-md-selbar-n"><b>{selectionCount}</b> selected</span>
            <button type="button" className="a-md-selbar-link" onClick={handleSelectAll}>
              {selectedMediaIds.size === filteredMedia.length ? 'Deselect all' : 'Select all'}
            </button>
            <span className="a-md-selbar-sep" aria-hidden="true" />
            <button onClick={handleBulkDownload} className="a-md-selbar-btn" title="Download selected as zip">
              <AlfieIcon glyph="download" size={16} />
              <span>Download</span>
            </button>
            <button onClick={() => setShowShareModal(true)} className="a-md-selbar-btn" title="Share on social media">
              <AlfieIcon glyph="share" size={16} />
              <span>Share</span>
            </button>
            <button onClick={() => setShowClubShareModal(true)} className="a-md-selbar-btn" title="Share with other clubs">
              <AlfieIcon glyph="team" size={16} />
              <span>Clubs</span>
            </button>
            <button onClick={handleClearSelection} className="a-md-selbar-x" title="Clear selection" aria-label="Clear selection">
              <AlfieIcon glyph="x" size={16} />
            </button>
          </div>
        )}

        {/* Viewer */}
        {showModal && selectedMedia && (
          <MediaViewer
            item={selectedMedia}
            position={viewerIndex >= 0 ? viewerIndex + 1 : 1}
            total={viewerIndex >= 0 ? filteredMedia.length : 1}
            onPrev={viewerIndex > 0 ? () => openAt(viewerIndex - 1) : undefined}
            onNext={viewerIndex >= 0 && viewerIndex < filteredMedia.length - 1 ? () => openAt(viewerIndex + 1) : undefined}
            onClose={() => setShowModal(false)}
            onEdit={() => { setShowModal(false); handleEditMedia(selectedMedia); }}
            onDelete={() => { setShowModal(false); handleDeleteMedia(selectedMedia); }}
            onDownload={() => handleDownload(selectedMedia.url, selectedMedia.title || 'image')}
          />
        )}

        {/* Edit Media */}
        {showEditModal && editingMedia && (
          <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
            <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !saving && closeEdit()} aria-hidden="true" />
            <section className="a-sheet a-md-sheet relative w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-md-edit-title">
              <header className="a-sheet-head a-md-sheet-head">
                <span className="a-md-sheet-thumb"><MediaThumb item={editingMedia} /></span>
                <div className="min-w-0 flex-1">
                  <h2 id="a-md-edit-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Edit Media</h2>
                  <p className="a-mute m-0 mt-0.5 truncate text-[13.5px]">{editingMedia.title || 'Untitled'}</p>
                </div>
                <button type="button" className="a-ib" onClick={closeEdit} disabled={saving} aria-label="Close"><AlfieIcon glyph="x" size={20} /></button>
              </header>

              <div className="a-md-sheet-body">
                <label className="a-md-fl">
                  <span>Title</span>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="a-inp"
                    placeholder="Enter media title"
                  />
                </label>
                <label className="a-md-fl">
                  <span>Description</span>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className="a-inp"
                    placeholder="Enter description"
                  />
                </label>
                <label className="a-md-fl">
                  <span>Event</span>
                  <select
                    value={editForm.event_ref_id}
                    onChange={(e) => handleEventChange(e.target.value)}
                    className="a-inp"
                  >
                    <option value="">Select an event</option>
                    {availableEvents.map(event => (
                      <option key={`${event.type}-${event.id}`} value={event.id} data-type={event.type}>
                        {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="a-md-fl">
                  <span>Race Class</span>
                  <div className="a-md-readonly">
                    <AlfieIcon glyph="trophy" size={15} />
                    {editForm.race_class || <i>Select an event to see race class</i>}
                  </div>
                  <small>Race class is automatically set based on the selected event</small>
                </div>
              </div>

              <footer className="a-sheet-foot a-md-sheet-foot">
                <button onClick={closeEdit} disabled={saving} className="a-btn a-btn-q">Cancel</button>
                <button onClick={handleSaveEdit} disabled={saving} className="a-btn a-btn-p">
                  {saving ? (<><span className="a-nw-spin" />Saving...</>) : (<><AlfieIcon glyph="save" size={16} />Save Changes</>)}
                </button>
              </footer>
            </section>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && mediaToDelete && (
          <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
            <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => setShowDeleteConfirm(false)} aria-hidden="true" />
            <section className="a-sheet a-md-sheet relative w-full max-w-md overflow-hidden" role="alertdialog" aria-modal="true" aria-labelledby="a-md-del-title">
              <div className="a-md-del">
                <span className="a-md-del-thumb"><MediaThumb item={mediaToDelete} /></span>
                <h2 id="a-md-del-title" className="a-display a-ink m-0 text-[20px] font-semibold">Delete Media</h2>
                <p className="a-mute m-0 text-[14px]">
                  Are you sure you want to delete "{mediaToDelete.title || 'this media item'}"? This action cannot be undone.
                </p>
              </div>
              <footer className="a-sheet-foot a-md-sheet-foot">
                <button onClick={() => setShowDeleteConfirm(false)} className="a-btn a-btn-q">Cancel</button>
                <button onClick={confirmDelete} className="a-btn a-btn-d">
                  <AlfieIcon glyph="trash" size={16} />
                  Delete
                </button>
              </footer>
            </section>
          </div>
        )}

        {/* Social Share Modal */}
        <SocialShareModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false);
            setSelectedMediaIds(new Set());
          }}
          darkMode={darkMode}
          selectedMedia={getSelectedMedia()}
          onSuccess={() => {
            setShowShareModal(false);
            setSelectedMediaIds(new Set());
          }}
        />

        <ShareWithClubsModal
          isOpen={showClubShareModal}
          onClose={() => {
            setShowClubShareModal(false);
            setSelectedMediaIds(new Set());
          }}
          darkMode={darkMode}
          selectedMedia={getSelectedMedia()}
          onSuccess={() => {
            setShowClubShareModal(false);
            setSelectedMediaIds(new Set());
          }}
        />

        {/* Image Upload Modal */}
        <ImageUploadModal
          isOpen={showImageUploadModal}
          onClose={() => setShowImageUploadModal(false)}
          darkMode={darkMode}
          onSuccess={() => {
            setShowImageUploadModal(false);
            fetchMedia(); // Refresh media list
          }}
        />

        {/* Upload Video Modal */}
        <UploadVideoModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          darkMode={darkMode}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchMedia(); // Refresh media list
          }}
        />

        {/* Add YouTube URL Modal */}
        <AddYouTubeUrlModal
          isOpen={showYouTubeUrlModal}
          onClose={() => setShowYouTubeUrlModal(false)}
          darkMode={darkMode}
          onSuccess={() => {
            setShowYouTubeUrlModal(false);
            fetchMedia(); // Refresh media list
          }}
        />
      </div>
    </div>
  );
};

export default MediaPage;
