import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard as Edit2, Trash2, Youtube, RefreshCw, Search, ExternalLink, CircleCheck as CheckCircle2, Eye, EyeOff, TriangleAlert as AlertTriangle, Star, ListVideo, Globe, ListFilter as Filter } from 'lucide-react';
import { alfieTVStorage, AlfieTVChannel, AlfieTVVideo, AlfieTVYouTubePlaylist } from '../../utils/alfieTVStorage';
import AddVideoModal from './AddVideoModal';
import { ConfirmationModal } from '../ConfirmationModal';

interface AlfieTVAdminProps {
  darkMode?: boolean;
}

export default function AlfieTVAdmin({ darkMode = false }: AlfieTVAdminProps) {
  const { currentClub, currentOrganization, user, isSuperAdmin, isStateOrgAdmin, isNationalOrgAdmin } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();
  const lightMode = !darkMode;

  const [channels, setChannels] = useState<AlfieTVChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddVideoModal, setShowAddVideoModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<AlfieTVChannel | null>(null);
  const [channelUrl, setChannelUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [autoImport, setAutoImport] = useState(true);
  const [isGlobal, setIsGlobal] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'channels' | 'playlists'>('channels');
  const [playlists, setPlaylists] = useState<AlfieTVYouTubePlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState<'all' | 'featured' | 'hidden'>('all');
  const [playlistChannelFilter, setPlaylistChannelFilter] = useState<string>('all');

  const canCreateGlobalChannels = isSuperAdmin || isStateOrgAdmin || isNationalOrgAdmin;
  const organizationId = currentClub?.clubId || currentOrganization?.id;
  const organizationType = currentOrganization?.type || 'club';
  const isAssociation = organizationType === 'state' || organizationType === 'national';

  // Auto-set global for associations since they don't have club context
  useEffect(() => {
    if (isAssociation) {
      setIsGlobal(true);
    }
  }, [isAssociation]);

  useEffect(() => {
    if (organizationId) {
      loadChannels();
    }
  }, [organizationId]);

  const loadChannels = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const data = await alfieTVStorage.getChannels(organizationId);
      setChannels(data);
    } catch (error) {
      console.error('Error loading channels:', error);
      addNotification('Failed to load channels', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!channelUrl.trim() || !channelName.trim()) {
      addNotification('Please fill in all fields', 'error');
      return;
    }

    // If creating global channel, require SuperAdmin or Association Admin
    if (isGlobal && !canCreateGlobalChannels) {
      addNotification('Only SuperAdmins and Association Admins can create global channels', 'error');
      return;
    }

    // If not global, require organization context
    if (!isGlobal && !organizationId) {
      addNotification('Please select an organization to add a channel', 'error');
      return;
    }

    try {
      const channelData: any = {
        channel_url: channelUrl,
        channel_name: channelName,
        auto_import: autoImport,
        is_global: isGlobal
      };

      // Add club_id for club-specific channels (only if it's a club, not an association)
      if (!isGlobal && organizationType === 'club' && currentClub?.clubId) {
        channelData.club_id = currentClub.clubId;
      }

      // Add creator info for global channels
      if (isGlobal && user) {
        channelData.created_by_user_id = user.id;
        channelData.created_by_role = isSuperAdmin
          ? 'super_admin'
          : isNationalOrgAdmin
            ? 'national_admin'
            : 'state_admin';
      }

      const newChannel = await alfieTVStorage.createChannel(channelData);

      addNotification(
        isGlobal
          ? 'Global channel added successfully - visible to all users!'
          : 'Channel added successfully',
        'success'
      );
      setShowAddModal(false);
      setChannelUrl('');
      setChannelName('');
      setAutoImport(true);
      setIsGlobal(false);
      await loadChannels();

      // Auto-sync videos for the new channel
      if (newChannel?.id) {
        addNotification('Starting automatic video sync...', 'info');
        await handleSyncChannel(newChannel.id);
      }
    } catch (error) {
      console.error('Error adding channel:', error);
      addNotification('Failed to add channel', 'error');
    }
  };

  const handleUpdateChannel = async () => {
    if (!editingChannel) return;

    try {
      const updateData: Partial<AlfieTVChannel> = {
        channel_url: channelUrl,
        channel_name: channelName,
        auto_import: autoImport,
      };

      if (canCreateGlobalChannels) {
        updateData.is_global = isGlobal;
        if (isGlobal && !editingChannel.is_global && user) {
          updateData.created_by_user_id = user.id;
          updateData.created_by_role = isSuperAdmin
            ? 'super_admin'
            : isNationalOrgAdmin
              ? 'national_admin'
              : 'state_admin';
        }
      }

      await alfieTVStorage.updateChannel(editingChannel.id, updateData);

      addNotification('Channel updated successfully', 'success');
      setEditingChannel(null);
      setChannelUrl('');
      setChannelName('');
      setAutoImport(true);
      loadChannels();
    } catch (error) {
      console.error('Error updating channel:', error);
      addNotification('Failed to update channel', 'error');
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    setChannelToDelete(channelId);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteChannel = async () => {
    if (!channelToDelete) return;

    try {
      await alfieTVStorage.deleteChannel(channelToDelete);
      addNotification('Channel deleted successfully', 'success');
      setDeleteConfirmOpen(false);
      setChannelToDelete(null);
      loadChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      addNotification('Failed to delete channel', 'error');
      setDeleteConfirmOpen(false);
      setChannelToDelete(null);
    }
  };

  const openEditModal = (channel: AlfieTVChannel) => {
    setEditingChannel(channel);
    setChannelUrl(channel.channel_url);
    setChannelName(channel.channel_name);
    setAutoImport(channel.auto_import);
    setIsGlobal(channel.is_global || false);
  };

  const handleToggleVisibility = async (channelId: string, currentVisibility: boolean) => {
    // Optimistically update UI immediately
    setChannels(prev => prev.map(ch =>
      ch.id === channelId ? { ...ch, is_visible: !currentVisibility } : ch
    ));

    try {
      await alfieTVStorage.toggleChannelVisibility(channelId, !currentVisibility);
      addNotification(
        !currentVisibility ? 'Channel is now visible' : 'Channel is now hidden',
        'success'
      );
    } catch (error) {
      // Revert on error
      setChannels(prev => prev.map(ch =>
        ch.id === channelId ? { ...ch, is_visible: currentVisibility } : ch
      ));
      console.error('Error toggling visibility:', error);
      addNotification('Failed to update channel visibility', 'error');
    }
  };

  const handleSyncChannel = async (channelId: string) => {
    setSyncingChannels(prev => new Set(prev).add(channelId));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-youtube-channel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ channelId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Sync error response:', data);
        throw new Error(data.error || data.details || 'Failed to sync channel');
      }

      addNotification(
        `Successfully imported ${data.videosImported} videos from ${data.channelName}`,
        'success'
      );
      await loadChannels();
    } catch (error) {
      console.error('Error syncing channel:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync channel';
      addNotification(errorMessage, 'error');

      // Show detailed error in console for debugging
      if (error instanceof Error && error.message.includes('YouTube API key')) {
        console.error('YouTube API Key is not configured. You need to add YOUTUBE_API_KEY as a Supabase Edge Function secret.');
      }
    } finally {
      setSyncingChannels(prev => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  const loadPlaylists = async () => {
    if (channels.length === 0) return;
    setPlaylistsLoading(true);
    try {
      const channelIds = channels.map(c => c.id);
      const data = await alfieTVStorage.getChannelPlaylists(channelIds);
      setPlaylists(data);
    } catch (error) {
      console.error('Error loading playlists:', error);
    } finally {
      setPlaylistsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'playlists' && channels.length > 0) {
      loadPlaylists();
    }
  }, [activeTab, channels]);

  const handleTogglePlaylistFeatured = async (playlistId: string, currentFeatured: boolean) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, is_featured: !currentFeatured } : p
    ));
    try {
      await alfieTVStorage.togglePlaylistFeatured(playlistId, !currentFeatured);
      addNotification(
        !currentFeatured ? 'Playlist marked as featured' : 'Playlist unfeatured',
        'success'
      );
    } catch (error) {
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, is_featured: currentFeatured } : p
      ));
      addNotification('Failed to update playlist', 'error');
    }
  };

  const handleTogglePlaylistVisibility = async (playlistId: string, currentVisibility: boolean) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, is_visible: !currentVisibility } : p
    ));
    try {
      await alfieTVStorage.togglePlaylistVisibility(playlistId, !currentVisibility);
      addNotification(
        !currentVisibility ? 'Playlist is now visible' : 'Playlist is now hidden',
        'success'
      );
    } catch (error) {
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, is_visible: currentVisibility } : p
      ));
      addNotification('Failed to update playlist visibility', 'error');
    }
  };

  const handleUpdatePlaylistCategory = async (playlistId: string, category: string) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, playlist_category: category as any } : p
    ));
    try {
      await alfieTVStorage.updateYouTubePlaylist(playlistId, { playlist_category: category as any });
      addNotification('Playlist category updated', 'success');
    } catch (error) {
      addNotification('Failed to update category', 'error');
      await loadPlaylists();
    }
  };

  const filteredPlaylists = playlists.filter(p => {
    if (playlistFilter === 'featured' && !p.is_featured) return false;
    if (playlistFilter === 'hidden' && p.is_visible !== false) return false;
    if (playlistChannelFilter !== 'all' && p.channel_id !== playlistChannelFilter) return false;
    return true;
  });

  const playlistCategoryLabels: Record<string, string> = {
    live_events: 'Live Events',
    big_boat_yachting: 'Big Boat Yachting',
    rc_yachting: 'RC Yachting',
    training_tips: 'Training & Tips',
    highlights_recaps: 'Highlights & Recaps',
    event_archives: 'Event Archives',
    general: 'General',
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1 border-b border-slate-700/50">
            <button
              onClick={() => setActiveTab('channels')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'channels'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <Youtube size={16} />
                Channels
              </span>
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'playlists'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <ListVideo size={16} />
                Playlists
                {playlists.filter(p => p.is_featured).length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400">
                    {playlists.filter(p => p.is_featured).length} featured
                  </span>
                )}
              </span>
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowAddVideoModal(true)}
              className="btn-primary-green flex items-center space-x-2 px-4 py-2 rounded-xl text-white transition-colors"
            >
              <Youtube className="w-5 h-5" />
              <span>Add Video URL</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary-green flex items-center space-x-2 px-4 py-2 rounded-xl text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Add Channel</span>
            </button>
          </div>
        </div>

        {activeTab === 'channels' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-transparent">
                <Youtube className={`w-16 h-16 mx-auto mb-4 ${lightMode ? 'text-gray-400' : 'text-slate-600'}`} />
                <h3 className={`text-xl font-semibold mb-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                  No channels yet
                </h3>
                <p className={`mb-6 ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                  Add your first YouTube channel to start building your video library
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn-primary-green px-6 py-3 rounded-xl text-white transition-colors"
                >
                  Add Your First Channel
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {channels.map(channel => (
                  <div
                    key={channel.id}
                    className={`rounded-2xl p-6 transition-all ${
                      lightMode ? 'bg-white shadow-lg' : 'bg-slate-800/60 shadow-xl'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="relative flex-shrink-0">
                          {channel.channel_thumbnail ? (
                            <img
                              src={channel.channel_thumbnail}
                              alt={channel.channel_name}
                              className="w-20 h-20 rounded-full object-cover ring-4 ring-white/10"
                            />
                          ) : (
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ring-4 ring-white/10">
                              <Youtube className="w-10 h-10 text-white" />
                            </div>
                          )}
                          {channel.last_sync_error ? (
                            <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 ring-4 ring-white dark:ring-slate-800" title={channel.last_sync_error}>
                              <AlertTriangle className="w-4 h-4 text-white" />
                            </div>
                          ) : channel.last_imported_at && channel.video_count > 0 ? (
                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 ring-4 ring-white dark:ring-slate-800">
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            </div>
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`text-xl font-bold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                            {channel.channel_name}
                          </h3>
                          <a
                            href={channel.channel_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 mb-2 group"
                          >
                            <span className="text-sm truncate max-w-md">{channel.channel_url}</span>
                            <ExternalLink className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                          <div className="flex items-center flex-wrap gap-4">
                            <div className={`text-sm ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
                              <span className="font-semibold">{channel.video_count || 0}</span> videos
                            </div>
                            <div className={`text-sm ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
                              <span className="font-semibold">{(channel.subscriber_count || 0).toLocaleString()}</span> subscribers
                            </div>
                            {channel.category && (
                              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                {channel.category === 'rc_yachting' ? 'RC Yachting' :
                                 channel.category === 'full_size_yachting' ? 'Full Size Yachting' :
                                 channel.category === 'sailing_education' ? 'Sailing Education' :
                                 channel.category === 'racing' ? 'Racing' : 'General'}
                              </span>
                            )}
                            {channel.auto_import && (
                              <span className="px-2 py-1 rounded-lg text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Auto-import enabled
                              </span>
                            )}
                            {channel.last_imported_at && (
                              <span className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-500'}`}>
                                Last synced: {new Date(channel.last_imported_at).toLocaleDateString()}
                              </span>
                            )}
                            {channel.last_sync_error && (
                              <span className="px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title={channel.last_sync_error}>
                                Sync error
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleVisibility(channel.id, channel.is_visible)}
                          className={`p-2.5 rounded-xl transition-all ${
                            channel.is_visible
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700/50 dark:text-slate-500 dark:hover:bg-slate-700'
                          }`}
                          title={channel.is_visible ? 'Channel visible - Click to hide' : 'Channel hidden - Click to show'}
                        >
                          {channel.is_visible ? (
                            <Eye className="w-5 h-5" />
                          ) : (
                            <EyeOff className="w-5 h-5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleSyncChannel(channel.id)}
                          disabled={syncingChannels.has(channel.id)}
                          className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-colors ${
                            syncingChannels.has(channel.id)
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                          title="Sync videos from YouTube"
                        >
                          <RefreshCw className={`w-4 h-4 ${
                            syncingChannels.has(channel.id) ? 'animate-spin' : ''
                          }`} />
                          <span className="text-sm font-medium">
                            {syncingChannels.has(channel.id) ? 'Syncing...' : 'Sync Videos'}
                          </span>
                        </button>
                        <button
                          onClick={() => openEditModal(channel)}
                          className={`p-2 rounded-xl transition-colors ${
                            lightMode ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-700/50 text-slate-400'
                          }`}
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteChannel(channel.id)}
                          className="p-2 rounded-xl transition-colors text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'playlists' && (
          <div>
            <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 rounded-xl ${
              lightMode ? 'bg-gray-50 border border-gray-200' : 'bg-slate-800/40 border border-slate-700/50'
            }`}>
              <div className="flex items-center gap-2">
                <Filter size={16} className={lightMode ? 'text-gray-500' : 'text-slate-400'} />
                <div className="flex items-center gap-1 rounded-lg overflow-hidden border ${lightMode ? 'border-gray-200' : 'border-slate-700'}">
                  {(['all', 'featured', 'hidden'] as const).map(filter => (
                    <button
                      key={filter}
                      onClick={() => setPlaylistFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        playlistFilter === filter
                          ? 'bg-blue-600 text-white'
                          : lightMode
                            ? 'bg-white text-gray-600 hover:bg-gray-100'
                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter === 'featured' ? 'Featured' : 'Hidden'}
                    </button>
                  ))}
                </div>
              </div>
              <select
                value={playlistChannelFilter}
                onChange={(e) => setPlaylistChannelFilter(e.target.value)}
                className={`text-sm px-3 py-1.5 rounded-lg border ${
                  lightMode
                    ? 'bg-white border-gray-200 text-gray-700'
                    : 'bg-slate-700/50 border-slate-600 text-slate-300'
                }`}
              >
                <option value="all">All channels</option>
                {channels.map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.channel_name}</option>
                ))}
              </select>
            </div>

            {playlistsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredPlaylists.length === 0 ? (
              <div className="text-center py-16">
                <ListVideo className={`w-16 h-16 mx-auto mb-4 ${lightMode ? 'text-gray-400' : 'text-slate-600'}`} />
                <h3 className={`text-xl font-semibold mb-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                  {playlists.length === 0 ? 'No playlists synced yet' : 'No playlists match your filters'}
                </h3>
                <p className={`mb-4 ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                  {playlists.length === 0
                    ? 'Playlists are imported automatically when you sync a YouTube channel'
                    : 'Try adjusting your filter criteria'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredPlaylists.map(playlist => {
                  const channel = channels.find(c => c.id === playlist.channel_id);
                  return (
                    <div
                      key={playlist.id}
                      className={`rounded-xl overflow-hidden transition-all ${
                        lightMode
                          ? 'bg-white shadow-md hover:shadow-lg border border-gray-100'
                          : 'bg-slate-800/60 hover:bg-slate-800/80 border border-slate-700/50'
                      } ${!playlist.is_visible ? 'opacity-60' : ''}`}
                    >
                      <div className="relative aspect-video bg-slate-900">
                        {playlist.thumbnail_url ? (
                          <img
                            src={playlist.thumbnail_url}
                            alt={playlist.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ListVideo className="w-12 h-12 text-slate-600" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <button
                            onClick={() => handleTogglePlaylistFeatured(playlist.id, playlist.is_featured)}
                            className={`p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                              playlist.is_featured
                                ? 'bg-amber-500/90 text-white hover:bg-amber-600'
                                : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'
                            }`}
                            title={playlist.is_featured ? 'Remove from featured' : 'Mark as featured'}
                          >
                            <Star size={14} className={playlist.is_featured ? 'fill-current' : ''} />
                          </button>
                          <button
                            onClick={() => handleTogglePlaylistVisibility(playlist.id, playlist.is_visible)}
                            className={`p-1.5 rounded-lg backdrop-blur-sm transition-all ${
                              playlist.is_visible
                                ? 'bg-green-500/80 text-white hover:bg-green-600'
                                : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'
                            }`}
                            title={playlist.is_visible ? 'Hide playlist' : 'Show playlist'}
                          >
                            {playlist.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        </div>
                        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 text-white text-xs font-medium">
                          {playlist.video_count} videos
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className={`font-semibold text-sm mb-2 line-clamp-2 ${
                          lightMode ? 'text-gray-900' : 'text-white'
                        }`}>
                          {playlist.title}
                        </h3>

                        {channel && (
                          <div className="flex items-center gap-2 mb-3">
                            {channel.channel_thumbnail ? (
                              <img
                                src={channel.channel_thumbnail}
                                alt={channel.channel_name}
                                className="w-5 h-5 rounded-full"
                              />
                            ) : (
                              <Youtube size={14} className="text-red-500" />
                            )}
                            <span className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
                              {channel.channel_name}
                            </span>
                          </div>
                        )}

                        <select
                          value={playlist.playlist_category || 'general'}
                          onChange={(e) => handleUpdatePlaylistCategory(playlist.id, e.target.value)}
                          className={`w-full text-xs px-2.5 py-1.5 rounded-lg border ${
                            lightMode
                              ? 'bg-gray-50 border-gray-200 text-gray-700'
                              : 'bg-slate-700/50 border-slate-600 text-slate-300'
                          }`}
                        >
                          {Object.entries(playlistCategoryLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add Video Modal */}
        <AddVideoModal
          isOpen={showAddVideoModal}
          onClose={() => setShowAddVideoModal(false)}
          onSuccess={() => {
            addNotification('Video added successfully', 'success');
            loadChannels();
          }}
          darkMode={darkMode}
        />

        {/* Add/Edit Channel Modal */}
        {(showAddModal || editingChannel) && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`w-full max-w-2xl rounded-2xl p-6 ${lightMode ? 'bg-white' : 'bg-slate-800'}`}>
              <h2 className={`text-2xl font-bold mb-6 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                {editingChannel ? 'Edit Channel' : 'Add New Channel'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
                    Channel Name
                  </label>
                  <input
                    type="text"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    placeholder="e.g., RC Sailing Tips"
                    className={`w-full px-4 py-3 rounded-xl transition-colors ${
                      lightMode
                        ? 'bg-gray-50 border border-gray-200 text-gray-900'
                        : 'bg-slate-700/50 border border-slate-600 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
                    YouTube Channel URL
                  </label>
                  <input
                    type="text"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://www.youtube.com/@channel-name"
                    className={`w-full px-4 py-3 rounded-xl transition-colors ${
                      lightMode
                        ? 'bg-gray-50 border border-gray-200 text-gray-900'
                        : 'bg-slate-700/50 border border-slate-600 text-white'
                    }`}
                  />
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="auto-import"
                    checked={autoImport}
                    onChange={(e) => setAutoImport(e.target.checked)}
                    className="w-5 h-5 rounded text-blue-600"
                  />
                  <label htmlFor="auto-import" className={`text-sm ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
                    Automatically import new videos from this channel
                  </label>
                </div>

                {canCreateGlobalChannels && (
                  <div className={`p-4 rounded-xl border ${
                    isGlobal
                      ? 'bg-blue-50 border-blue-200'
                      : lightMode
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-slate-700/30 border-slate-600'
                  }`}>
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        id="is-global"
                        checked={isGlobal}
                        onChange={(e) => setIsGlobal(e.target.checked)}
                        className="w-5 h-5 rounded text-blue-600 mt-0.5"
                        disabled={isAssociation}
                      />
                      <div className="flex-1">
                        <label htmlFor="is-global" className={`text-sm font-medium block mb-1 ${
                          isGlobal ? 'text-blue-700' : lightMode ? 'text-gray-700' : 'text-slate-300'
                        }`}>
                          {isAssociation ? 'Global Channel' : 'Make this a Global Channel'}
                        </label>
                        <p className={`text-xs ${
                          isGlobal ? 'text-blue-600' : lightMode ? 'text-gray-500' : 'text-slate-400'
                        }`}>
                          {isAssociation
                            ? '✓ Association channels are always global and visible to all users'
                            : isGlobal
                              ? '✓ This channel will be visible to all users across all clubs and associations'
                              : 'This channel will only be visible to members of the selected club'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingChannel(null);
                    setChannelUrl('');
                    setChannelName('');
                    setAutoImport(true);
                    setIsGlobal(false);
                  }}
                  className={`px-6 py-3 rounded-xl transition-colors ${
                    lightMode ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-slate-700/50 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={editingChannel ? handleUpdateChannel : handleAddChannel}
                  className="px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  {editingChannel ? 'Update Channel' : 'Add Channel'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmationModal
          isOpen={deleteConfirmOpen}
          onClose={() => {
            setDeleteConfirmOpen(false);
            setChannelToDelete(null);
          }}
          onConfirm={confirmDeleteChannel}
          title="Delete Channel"
          message="Are you sure you want to delete this channel? All videos from this channel will also be deleted."
          confirmText="Delete"
          cancelText="Cancel"
          darkMode={darkMode}
          variant="danger"
        />
      </div>
    </div>
  );
}
