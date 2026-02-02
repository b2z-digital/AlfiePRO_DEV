import React, { useState, useEffect } from 'react';
import { Camera, Video, Search, Filter, Grid, List, Play, Calendar, Trophy, Eye, Download, ExternalLink, Youtube, Edit2, Trash2, X, Save, Share2, CheckSquare, Square, Building, Check, ArrowUpDown, ChevronDown, Upload as UploadIcon, Image as ImageIcon } from 'lucide-react';
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
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'event'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [showClubShareModal, setShowClubShareModal] = useState(false);
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
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
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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

  const getYouTubeVideoId = (url: string) => {
    // Extract video ID from various YouTube URL formats
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const renderMediaItem = (mediaItem: EventMedia) => {
    const isVideo = mediaItem.media_type === 'youtube_video';
    
    if (viewMode === 'grid') {
      return (
        <div
          key={mediaItem.id}
          onClick={() => handleMediaClick(mediaItem)}
          className={`
            group cursor-pointer rounded-xl overflow-hidden transition-all duration-300 transform hover:scale-105 hover:shadow-xl relative
            ${darkMode 
              ? 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50' 
              : 'bg-white/80 border border-slate-200/50 hover:bg-white'}
            ${selectedMediaIds.has(mediaItem.id) ? 'ring-2 ring-blue-500' : ''}
          `}
        >
          {/* Selection Checkbox - Always Visible */}
          <div className="absolute top-2 left-2 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSelection(mediaItem.id);
              }}
              className="p-1 bg-white/90 rounded-full shadow-md transition-all hover:scale-110"
            >
              {selectedMediaIds.has(mediaItem.id) ? (
                <CheckSquare size={20} className="text-blue-600" />
              ) : (
                <Square size={20} className="text-gray-400" />
              )}
            </button>
          </div>
          
          <div className="relative aspect-video overflow-hidden">
            {isVideo ? (
              <>
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditMedia(mediaItem);
                      }}
                      className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMedia(mediaItem);
                      }}
                      className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <img
                  src={mediaItem.thumbnail_url || `https://img.youtube.com/vi/${getYouTubeVideoId(mediaItem.url)}/maxresdefault.jpg`}
                  alt={mediaItem.title || 'Video thumbnail'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
                    <Play size={24} className="text-white ml-1" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex gap-2">
                  {/* Club abbreviation label for shared media */}
                  {mediaItem.isShared && mediaItem.sharedFrom && (
                    <div className="px-2 py-1 bg-purple-600/90 text-white text-xs font-medium rounded-full">
                      {mediaItem.sharedFrom.abbreviation}
                    </div>
                  )}
                  <div className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Youtube size={12} />
                    Video
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditMedia(mediaItem);
                      }}
                      className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMedia(mediaItem);
                      }}
                      className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <img
                  src={mediaItem.url}
                  alt={mediaItem.title || 'Event image'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
                    <Eye size={24} className="text-white" />
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex gap-2">
                  {/* Club abbreviation label for shared media */}
                  {mediaItem.isShared && mediaItem.sharedFrom && (
                    <div className="px-2 py-1 bg-purple-600/90 text-white text-xs font-medium rounded-full">
                      {mediaItem.sharedFrom.abbreviation}
                    </div>
                  )}
                  <div className="bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                    <Camera size={12} />
                    Image
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div className="p-4">
            <h3 className={`font-medium mb-2 line-clamp-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {mediaItem.title || 'Untitled'}
              {mediaItem.isShared && mediaItem.sharedFrom && (
                <span className="ml-2 px-2 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded-full">
                  from {mediaItem.sharedFrom.abbreviation}
                </span>
              )}
            </h3>
            
            <div className="flex items-center gap-2 mb-2">
              {mediaItem.event_name && (
                <div className={`
                  px-2 py-1 rounded-full text-xs font-medium
                  ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-800'}
                `}>
                  {mediaItem.event_name}
                </div>
              )}
              
              {mediaItem.race_class && (
                <div className={`
                  px-2 py-1 rounded-full text-xs font-medium
                  ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-800'}
                `}>
                  {mediaItem.race_class}
                </div>
              )}
            </div>
            
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {new Date(mediaItem.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      );
    } else {
      return (
        <div
          key={mediaItem.id}
          onClick={() => handleMediaClick(mediaItem)}
          className={`
            group cursor-pointer p-4 rounded-lg border transition-all hover:scale-[1.02]
            ${selectedMediaIds.has(mediaItem.id) ? 'ring-2 ring-blue-500' : ''}
            ${darkMode 
              ? 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-700/50' 
              : 'bg-white/80 border-slate-200/50 hover:bg-white'}
          `}
        >
          <div className="flex items-center gap-4">
            {/* Selection Checkbox - Always Visible */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSelection(mediaItem.id);
              }}
              className="flex-shrink-0 transition-all hover:scale-110"
            >
              {selectedMediaIds.has(mediaItem.id) ? (
                <CheckSquare size={20} className="text-blue-600" />
              ) : (
                <Square size={20} className="text-gray-400" />
              )}
            </button>
            
            <div className="relative w-24 h-16 rounded-lg overflow-hidden flex-shrink-0">
              {isVideo ? (
                <>
                  <img
                    src={mediaItem.thumbnail_url || `https://img.youtube.com/vi/${getYouTubeVideoId(mediaItem.url)}/maxresdefault.jpg`}
                    alt={mediaItem.title || 'Video thumbnail'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Play size={16} className="text-white" />
                  </div>
                </>
              ) : (
                <img
                  src={mediaItem.url}
                  alt={mediaItem.title || 'Event image'}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium mb-1 truncate ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {mediaItem.title || 'Untitled'}
                    {mediaItem.isShared && mediaItem.sharedFrom && (
                      <span className="ml-2 px-2 py-0.5 bg-purple-600/20 text-purple-400 text-xs rounded-full">
                        from {mediaItem.sharedFrom.abbreviation}
                      </span>
                    )}
                  </h3>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`
                      px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1
                      ${isVideo 
                        ? darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-800'
                        : darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-800'}
                    `}>
                      {isVideo ? <Youtube size={10} /> : <Camera size={10} />}
                      {isVideo ? 'Video' : 'Image'}
                    </div>
                    
                    {mediaItem.event_name && (
                      <div className={`
                        px-2 py-1 rounded-full text-xs font-medium
                        ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'}
                      `}>
                        {mediaItem.event_name}
                      </div>
                    )}
                    
                    {mediaItem.race_class && (
                      <div className={`
                        px-2 py-1 rounded-full text-xs font-medium
                        ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-800'}
                      `}>
                        {mediaItem.race_class}
                      </div>
                    )}
                  </div>
                  
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {new Date(mediaItem.created_at).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  {/* Club abbreviation label for shared media */}
                  {mediaItem.isShared && mediaItem.sharedFrom && (
                    <div className="px-2 py-1 bg-purple-600/90 text-white text-xs font-medium rounded-full">
                      {mediaItem.sharedFrom.abbreviation}
                    </div>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditMedia(mediaItem);
                    }}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'hover:bg-slate-600 text-slate-300' 
                        : 'hover:bg-slate-200 text-slate-600'}
                    `}
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMedia(mediaItem);
                    }}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'hover:bg-red-900/50 text-red-400' 
                        : 'hover:bg-red-100 text-red-600'}
                    `}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                  
                  {!isVideo && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(mediaItem.url, mediaItem.title || 'image');
                      }}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${darkMode
                          ? 'hover:bg-slate-600 text-slate-300'
                          : 'hover:bg-slate-200 text-slate-600'}
                      `}
                      title="Download"
                    >
                      <Download size={16} />
                    </button>
                  )}
                  
                  {isVideo && (
                    <a
                      href={`https://youtube.com/watch?v=${getYouTubeVideoId(mediaItem.url)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'hover:bg-slate-600 text-slate-300' 
                          : 'hover:bg-slate-200 text-slate-600'}
                      `}
                      title="Open in YouTube"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Camera className="text-white" size={28} style={{ color: '#ffffff' }} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>Media Center</h1>
              <p className="text-slate-400">
                Upload, organize and share your club's media content
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              {showHeaderSearch ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search media..."
                    className="w-64 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setShowHeaderSearch(false);
                      setSearchTerm('');
                    }}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowHeaderSearch(true)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Search media"
                >
                  <Search size={20} />
                </button>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>

            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className={`p-2 transition-colors ${showSortMenu ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
                title="Sort"
              >
                <ArrowUpDown size={20} />
              </button>

              {showSortMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      setSortBy('date');
                      setSortOrder('desc');
                      setShowSortMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300"
                  >
                    Newest First
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('date');
                      setSortOrder('asc');
                      setShowSortMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300"
                  >
                    Oldest First
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setSortOrder('asc');
                      setShowSortMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300"
                  >
                    Name (A-Z)
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('name');
                      setSortOrder('desc');
                      setShowSortMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300"
                  >
                    Name (Z-A)
                  </button>
                  <button
                    onClick={() => {
                      setSortBy('event');
                      setSortOrder('asc');
                      setShowSortMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300"
                  >
                    Event (A-Z)
                  </button>
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 transition-colors ${showFilters ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
                title="Filters"
              >
                <Filter size={20} />
              </button>

              {showFilters && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <div className="px-4 py-2">
                    <label className="block text-sm font-medium mb-2 text-slate-300">Event Name</label>
                    <select
                      value={selectedEventName}
                      onChange={(e) => setSelectedEventName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                    >
                      <option value="">All Events</option>
                      {eventNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="px-4 py-2">
                    <label className="block text-sm font-medium mb-2 text-slate-300">Race Class</label>
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                    >
                      <option value="">All Classes</option>
                      {raceClasses.map(raceClass => (
                        <option key={raceClass} value={raceClass}>{raceClass}</option>
                      ))}
                    </select>
                  </div>

                  <div className="px-4 py-2">
                    <label className="block text-sm font-medium mb-2 text-slate-300">Media Type</label>
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value as 'all' | 'image' | 'youtube_video')}
                      className="w-full px-3 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg"
                    >
                      <option value="all">All Media</option>
                      <option value="image">Images Only</option>
                      <option value="youtube_video">Videos Only</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Selection Actions */}
            {getSelectedMedia().length > 0 && (
              <>
                <div className="h-6 w-px bg-slate-600" />

                <button
                  onClick={handleBulkDownload}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 font-medium transition-all shadow-lg hover:shadow-xl"
                  title="Download selected as zip"
                >
                  <Download size={18} />
                  Download ({getSelectedMedia().length})
                </button>

                <button
                  onClick={() => setShowShareModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  title="Share on social media"
                >
                  <Share2 size={18} />
                  Share ({getSelectedMedia().length})
                </button>

                <button
                  onClick={() => setShowClubShareModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
                  title="Share with other clubs"
                >
                  <Building size={18} />
                  Clubs ({getSelectedMedia().length})
                </button>

                <button
                  onClick={handleClearSelection}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Clear selection"
                >
                  <X size={20} />
                </button>
              </>
            )}

            {/* Upload Media Split Button */}
            <div className="relative">
              <div className="flex">
                <button
                  onClick={() => setShowImageUploadModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 rounded-l-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl animate-pulse"
                  style={{ color: '#ffffff' }}
                >
                  <UploadIcon size={18} className="text-white" style={{ color: '#ffffff' }} />
                  <span className="text-white" style={{ color: '#ffffff' }}>Upload Media</span>
                </button>
                <button
                  onClick={() => setShowUploadMenu(!showUploadMenu)}
                  className="px-2 bg-gradient-to-r from-green-600 to-emerald-600 rounded-r-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl border-l border-green-700/50"
                  style={{ color: '#ffffff' }}
                >
                  <ChevronDown size={18} className="text-white" style={{ color: '#ffffff' }} />
                </button>
              </div>

              {showUploadMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
                  <button
                    onClick={() => {
                      setShowImageUploadModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300 flex items-center gap-2"
                  >
                    <ImageIcon size={16} />
                    Upload Images
                  </button>
                  <button
                    onClick={() => {
                      setShowUploadModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300 flex items-center gap-2"
                  >
                    <Youtube size={16} />
                    Upload Video (YouTube)
                  </button>
                  <div className="border-t border-slate-700 my-2"></div>
                  <button
                    onClick={() => {
                      setShowYouTubeUrlModal(true);
                      setShowUploadMenu(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-slate-700 text-slate-300 flex items-center gap-2"
                  >
                    <ExternalLink size={16} />
                    Add YouTube URL
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Media Grid/List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchMedia}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="text-center py-12">
              <Camera size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
              <h3 className="text-lg font-medium text-white mb-2">No Media Found</h3>
              <p className="text-slate-400">
                {media.length === 0 
                  ? 'No media has been uploaded yet. Add images or videos to your events to see them here.'
                  : 'No media matches your current filters. Try adjusting your search criteria.'}
              </p>
            </div>
          ) : (
            <div className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'space-y-4'
            }>
              {viewMode === 'grid' && (
                <div
                  onClick={() => setShowImageUploadModal(true)}
                  className={`
                    group cursor-pointer rounded-xl border-2 border-dashed transition-all duration-300 transform hover:scale-105 hover:shadow-xl flex flex-col items-center justify-center
                    ${darkMode
                      ? 'bg-slate-800/30 border-slate-700/50 hover:border-green-500 hover:bg-slate-800/50'
                      : 'bg-white/30 border-slate-300/50 hover:border-green-500 hover:bg-white/50'}
                  `}
                >
                  <UploadIcon size={48} className="text-green-500 mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className={`font-semibold text-lg mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Upload Media
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Click to add images or videos
                  </p>
                </div>
              )}
              {filteredMedia.map(renderMediaItem)}
            </div>
          )}

          {/* Media Modal */}
          {showModal && selectedMedia && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`
                w-full max-w-4xl rounded-xl shadow-xl overflow-hidden
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
              `}>
                <div className={`
                  flex items-center justify-between p-6 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {selectedMedia.title || 'Media Details'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className={`
                      rounded-full p-2 transition-colors
                      ${darkMode 
                        ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                    `}
                  >
                    ×
                  </button>
                </div>

                <div className="p-6">
                  {selectedMedia.media_type === 'youtube_video' ? (
                    <div className="aspect-video mb-6">
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${getYouTubeVideoId(selectedMedia.url)}`}
                        title={selectedMedia.title || 'YouTube video'}
                        className="w-full h-full rounded-lg"
                        allowFullScreen
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                    </div>
                  ) : (
                    <div className="mb-6">
                      <img
                        src={selectedMedia.url}
                        alt={selectedMedia.title || 'Event image'}
                        className="w-full max-h-96 object-contain rounded-lg"
                      />
                    </div>
                  )}

                  <div className="space-y-4">
                    {selectedMedia.description && (
                      <div>
                        <h3 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          Description
                        </h3>
                        <p className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                          {selectedMedia.description}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {selectedMedia.event_name && (
                        <div className={`
                          px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1
                          ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-800'}
                        `}>
                          <Calendar size={14} />
                          {selectedMedia.event_name}
                        </div>
                      )}
                      
                      {selectedMedia.race_class && (
                        <div className={`
                          px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1
                          ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-800'}
                        `}>
                          <Trophy size={14} />
                          {selectedMedia.race_class}
                        </div>
                      )}

                      <div className={`
                        px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1
                        ${selectedMedia.media_type === 'youtube_video'
                          ? darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-800'
                          : darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-800'}
                      `}>
                        {selectedMedia.media_type === 'youtube_video' ? <Youtube size={14} /> : <Camera size={14} />}
                        {selectedMedia.media_type === 'youtube_video' ? 'YouTube Video' : 'Image'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-700">
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Added on {new Date(selectedMedia.created_at).toLocaleDateString()}
                      </p>
                      
                      <div className="flex gap-2">
                        {selectedMedia.media_type === 'youtube_video' ? (
                          <a
                            href={`https://youtube.com/watch?v=${getYouTubeVideoId(selectedMedia.url)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <ExternalLink size={16} />
                            Open in YouTube
                          </a>
                        ) : (
                          <button
                            onClick={() => handleDownload(selectedMedia.url, selectedMedia.title || 'image')}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Download size={16} />
                            Download
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Media Modal */}
          {showEditModal && editingMedia && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`
                w-full max-w-md rounded-xl shadow-xl overflow-hidden
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
              `}>
                <div className={`
                  flex items-center justify-between p-6 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Edit Media
                  </h2>
                  <button
                    onClick={() => setShowEditModal(false)}
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

                <div className="p-6 space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                      placeholder="Enter media title"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Description
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                      placeholder="Enter description"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Event Name
                    </label>
                    <select
                      value={editForm.event_ref_id}
                      onChange={(e) => handleEventChange(e.target.value)}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    >
                      <option value="">Select an event</option>
                      {availableEvents.map(event => (
                        <option key={`${event.type}-${event.id}`} value={event.id} data-type={event.type}>
                          {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Race Class
                    </label>
                    <input
                      type="text"
                      value={editForm.race_class}
                      readOnly
                      className={`
                        w-full px-3 py-2 rounded-lg border opacity-60 cursor-not-allowed
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                      placeholder="Select an event to see race class"
                    />
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Race class is automatically set based on the selected event
                    </p>
                  </div>
                </div>

                <div className={`
                  flex justify-end gap-3 p-6 border-t
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <button
                    onClick={() => {
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
                    }}
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
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className={`
                      flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                      ${saving ? 'opacity-50 cursor-not-allowed' : ''}
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
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && mediaToDelete && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`
                w-full max-w-md rounded-xl shadow-xl overflow-hidden
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
              `}>
                <div className={`
                  flex items-center justify-between p-6 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Delete Media
                  </h2>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
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

                <div className="p-6">
                  <p className={`mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Are you sure you want to delete "{mediaToDelete.title || 'this media item'}"? This action cannot be undone.
                  </p>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors
                        ${darkMode
                          ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                      `}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDelete}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
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