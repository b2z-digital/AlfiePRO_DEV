import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { AlfieIcon } from '../brand/AlfieIcon';
import { ASwitch } from '../alfie/Kit';
import { alfieTVStorage, AlfieTVChannel, AlfieTVVideo, AlfieTVYouTubePlaylist } from '../../utils/alfieTVStorage';
import AddVideoModal from './AddVideoModal';
import { ConfirmationModal } from '../ConfirmationModal';

interface AlfieTVAdminProps {
  darkMode?: boolean;
  /** True when shown inside the AlfieTV app, which supplies its own page header. */
  embedded?: boolean;
}

export default function AlfieTVAdmin({ darkMode = false, embedded = false }: AlfieTVAdminProps) {
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
      addNotification('error', 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChannel = async () => {
    if (!channelUrl.trim() || !channelName.trim()) {
      addNotification('error', 'Please fill in all fields');
      return;
    }

    // If creating global channel, require SuperAdmin or Association Admin
    if (isGlobal && !canCreateGlobalChannels) {
      addNotification('error', 'Only SuperAdmins and Association Admins can create global channels');
      return;
    }

    // If not global, require organization context
    if (!isGlobal && !organizationId) {
      addNotification('error', 'Please select an organization to add a channel');
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
        'success',
        isGlobal
          ? 'Global channel added successfully - visible to all users!'
          : 'Channel added successfully'
      );
      setShowAddModal(false);
      setChannelUrl('');
      setChannelName('');
      setAutoImport(true);
      setIsGlobal(false);
      await loadChannels();

      // Auto-sync videos for the new channel
      if (newChannel?.id) {
        addNotification('info', 'Starting automatic video sync...');
        await handleSyncChannel(newChannel.id);
      }
    } catch (error) {
      console.error('Error adding channel:', error);
      addNotification('error', 'Failed to add channel');
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

      addNotification('success', 'Channel updated successfully');
      setEditingChannel(null);
      setChannelUrl('');
      setChannelName('');
      setAutoImport(true);
      loadChannels();
    } catch (error) {
      console.error('Error updating channel:', error);
      addNotification('error', 'Failed to update channel');
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
      addNotification('success', 'Channel deleted successfully');
      setDeleteConfirmOpen(false);
      setChannelToDelete(null);
      loadChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      addNotification('error', 'Failed to delete channel');
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
        'success',
        !currentVisibility ? 'Channel is now visible' : 'Channel is now hidden'
      );
    } catch (error) {
      // Revert on error
      setChannels(prev => prev.map(ch =>
        ch.id === channelId ? { ...ch, is_visible: currentVisibility } : ch
      ));
      console.error('Error toggling visibility:', error);
      addNotification('error', 'Failed to update channel visibility');
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
        'success',
        `Successfully imported ${data.videosImported} videos from ${data.channelName}`
      );
      await loadChannels();
    } catch (error) {
      console.error('Error syncing channel:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync channel';
      addNotification('error', errorMessage);

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
        'success',
        !currentFeatured ? 'Playlist marked as featured' : 'Playlist unfeatured'
      );
    } catch (error) {
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, is_featured: currentFeatured } : p
      ));
      addNotification('error', 'Failed to update playlist');
    }
  };

  const handleTogglePlaylistVisibility = async (playlistId: string, currentVisibility: boolean) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, is_visible: !currentVisibility } : p
    ));
    try {
      await alfieTVStorage.togglePlaylistVisibility(playlistId, !currentVisibility);
      addNotification(
        'success',
        !currentVisibility ? 'Playlist is now visible' : 'Playlist is now hidden'
      );
    } catch (error) {
      setPlaylists(prev => prev.map(p =>
        p.id === playlistId ? { ...p, is_visible: currentVisibility } : p
      ));
      addNotification('error', 'Failed to update playlist visibility');
    }
  };

  const handleUpdatePlaylistCategory = async (playlistId: string, category: string) => {
    setPlaylists(prev => prev.map(p =>
      p.id === playlistId ? { ...p, playlist_category: category as any } : p
    ));
    try {
      await alfieTVStorage.updateYouTubePlaylist(playlistId, { playlist_category: category as any });
      addNotification('success', 'Playlist category updated');
    } catch (error) {
      addNotification('error', 'Failed to update category');
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

  const categoryLabel = (c?: string | null) =>
    c === 'rc_yachting' ? 'RC Yachting'
      : c === 'full_size_yachting' ? 'Full Size Yachting'
        : c === 'sailing_education' ? 'Sailing Education'
          : c === 'racing' ? 'Racing' : 'General';
  const totalVideos = channels.reduce((n, c) => n + (c.video_count || 0), 0);
  const visibleCount = channels.filter(c => c.is_visible).length;
  const featuredCount = playlists.filter(p => p.is_featured).length;
  const autoImportCount = channels.filter(c => c.auto_import).length;
  const closeChannelSheet = () => {
    setShowAddModal(false);
    setEditingChannel(null);
    setChannelUrl('');
    setChannelName('');
    setAutoImport(true);
    setIsGlobal(false);
  };

  return (
    <div className={`atvm ${embedded ? '' : 'atvm-standalone p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-28 lg:pl-9'}`}>
      {!embedded && (
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}>
            <AlfieIcon glyph="video" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">AlfieTV channels</h1>
            <p className="a-mute m-0 mt-1 text-[14px]">Add YouTube channels and videos, sync, and choose what shows on AlfieTV.</p>
          </div>
          <button type="button" className="a-btn" onClick={() => navigate('/alfie-tv')}>
            <AlfieIcon glyph="video" size={16} />Open AlfieTV
          </button>
        </header>
      )}
      {/* Summary */}
      <div className="atvm-stats">
        <div className="a-card atvm-stat"><span className="atvm-stat-ic is-b"><AlfieIcon glyph="video" size={18} /></span><div><b>{channels.length}</b><span>Channels</span></div></div>
        <div className="a-card atvm-stat"><span className="atvm-stat-ic is-p"><AlfieIcon glyph="media" size={18} /></span><div><b>{totalVideos.toLocaleString()}</b><span>Videos</span></div></div>
        <div className="a-card atvm-stat"><span className="atvm-stat-ic is-g"><AlfieIcon glyph="eye" size={18} /></span><div><b>{visibleCount}</b><span>Showing on AlfieTV</span></div></div>
        <div className="a-card atvm-stat"><span className="atvm-stat-ic is-a"><AlfieIcon glyph="sync" size={18} /></span><div><b>{autoImportCount}</b><span>Auto-importing</span></div></div>
      </div>

      {/* Toolbar */}
      <div className="atvm-bar">
        <div className="a-seg" role="tablist" aria-label="Manage">
          <button type="button" role="tab" aria-selected={activeTab === 'channels'} className={`a-seg-i ${activeTab === 'channels' ? 'a-seg-on' : ''}`} onClick={() => setActiveTab('channels')}>
            <AlfieIcon glyph="video" size={15} />Channels<span className="a-cnt">{channels.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'playlists'} className={`a-seg-i ${activeTab === 'playlists' ? 'a-seg-on' : ''}`} onClick={() => setActiveTab('playlists')}>
            <AlfieIcon glyph="list" size={15} />Playlists
            {featuredCount > 0 && <span className="a-cnt a-cnt-amber">{featuredCount} featured</span>}
          </button>
        </div>
        <div className="atvm-bar-r">
          <button onClick={() => setShowAddVideoModal(true)} className="a-btn">
            <AlfieIcon glyph="link" size={16} />
            Add Video URL
          </button>
          <button onClick={() => setShowAddModal(true)} className="a-btn a-btn-p">
            <AlfieIcon glyph="plus" size={16} />
            Add Channel
          </button>
        </div>
      </div>

      {activeTab === 'channels' && (
        loading ? (
          <div className="a-card atvm-list" aria-busy="true">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="atvm-row">
                <span className="a-nw-shim" style={{ width: 52, height: 52, borderRadius: 999 }} />
                <div className="flex-1 min-w-0">
                  <span className="a-nw-shim a-nw-shim-line" style={{ width: '40%' }} />
                  <span className="a-nw-shim a-nw-shim-line" style={{ width: '65%', marginTop: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="a-card a-empty py-14 px-6">
            <span className="a-tile a-tile-lg a-tile-rim"><AlfieIcon glyph="video" size={24} /></span>
            <h3 className="a-ink m-0 text-[17px] font-semibold">No channels yet</h3>
            <p className="a-mute m-0 text-[14px]">Add your first YouTube channel to start building your video library</p>
            <button onClick={() => setShowAddModal(true)} className="a-btn a-btn-p mt-2">
              <AlfieIcon glyph="plus" size={16} />Add Your First Channel
            </button>
          </div>
        ) : (
          <div className="a-card atvm-list">
            {channels.map(channel => {
              const syncing = syncingChannels.has(channel.id);
              const synced = !channel.last_sync_error && channel.last_imported_at && channel.video_count > 0;
              return (
                <div key={channel.id} className={`atvm-row ${channel.is_visible ? '' : 'is-hidden'}`}>
                  <div className={`atvm-av ${channel.last_sync_error ? 'is-err' : synced ? 'is-ok' : ''}`}>
                    {channel.channel_thumbnail ? (
                      <img src={channel.channel_thumbnail} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <span>{(channel.channel_name || '?').charAt(0).toUpperCase()}</span>
                    )}
                    {channel.last_sync_error ? (
                      <i title={channel.last_sync_error}><AlfieIcon glyph="warn" size={11} strokeWidth={2.4} /></i>
                    ) : synced ? (
                      <i><AlfieIcon glyph="check" size={11} strokeWidth={2.8} /></i>
                    ) : null}
                  </div>

                  <div className="atvm-row-body">
                    <div className="atvm-row-name">
                      <h3>{channel.channel_name}</h3>
                      {channel.is_global && <span className="atvm-chip is-b"><AlfieIcon glyph="globe" size={11} />Global</span>}
                      {!channel.is_visible && <span className="atvm-chip">Hidden</span>}
                    </div>
                    <a href={channel.channel_url} target="_blank" rel="noopener noreferrer" className="atvm-url">
                      {channel.channel_url.replace(/^https?:\/\/(www\.)?/, '')}
                      <AlfieIcon glyph="ext" size={12} />
                    </a>
                    <div className="atvm-chips">
                      <span className="atvm-num"><b>{(channel.video_count || 0).toLocaleString()}</b> videos</span>
                      <span className="atvm-num"><b>{(channel.subscriber_count || 0).toLocaleString()}</b> subscribers</span>
                      {channel.category && <span className="atvm-chip is-p">{categoryLabel(channel.category)}</span>}
                      {channel.auto_import && <span className="atvm-chip is-g">Auto-import</span>}
                      {channel.last_sync_error && <span className="atvm-chip is-r" title={channel.last_sync_error}>Sync error</span>}
                      {channel.last_imported_at && (
                        <span className="atvm-when">Synced {new Date(channel.last_imported_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  <div className="atvm-acts">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={channel.is_visible}
                      onClick={() => handleToggleVisibility(channel.id, channel.is_visible)}
                      className={`atvm-vis ${channel.is_visible ? 'is-on' : ''}`}
                      title={channel.is_visible ? 'Channel visible - Click to hide' : 'Channel hidden - Click to show'}
                    >
                      <AlfieIcon glyph={channel.is_visible ? 'eye' : 'eyeoff'} size={16} />
                      <span>{channel.is_visible ? 'Visible' : 'Hidden'}</span>
                    </button>
                    <button
                      onClick={() => handleSyncChannel(channel.id)}
                      disabled={syncing}
                      className="a-btn a-btn-sm atvm-sync"
                      title="Sync videos from YouTube"
                    >
                      <AlfieIcon glyph="sync" size={15} className={syncing ? 'atvm-spin' : ''} />
                      {syncing ? 'Syncing...' : 'Sync'}
                    </button>
                    <button type="button" onClick={() => openEditModal(channel)} className="a-ib" aria-label="Edit channel" title="Edit">
                      <AlfieIcon glyph="pen" size={17} />
                    </button>
                    <button type="button" onClick={() => handleDeleteChannel(channel.id)} className="a-ib a-ib-d" aria-label="Delete channel" title="Delete">
                      <AlfieIcon glyph="trash" size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {activeTab === 'playlists' && (
        <div className="flex flex-col gap-4">
          <div className="atvm-bar atvm-bar-sub">
            <div className="a-seg" role="group" aria-label="Show">
              {(['all', 'featured', 'hidden'] as const).map(filter => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPlaylistFilter(filter)}
                  className={`a-seg-i ${playlistFilter === filter ? 'a-seg-on' : ''}`}
                  aria-pressed={playlistFilter === filter}
                >
                  {filter === 'all' ? 'All' : filter === 'featured' ? 'Featured' : 'Hidden'}
                </button>
              ))}
            </div>
            <select
              value={playlistChannelFilter}
              onChange={(e) => setPlaylistChannelFilter(e.target.value)}
              className="a-pick atvm-pick"
              aria-label="Channel"
            >
              <option value="all">All channels</option>
              {channels.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.channel_name}</option>
              ))}
            </select>
          </div>

          {playlistsLoading ? (
            <div className="atvm-pl-grid" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className="a-nw-shim" style={{ height: 260, borderRadius: 18 }} />)}
            </div>
          ) : filteredPlaylists.length === 0 ? (
            <div className="a-card a-empty py-14 px-6">
              <span className="a-tile a-tile-lg a-tile-rim"><AlfieIcon glyph="list" size={24} /></span>
              <h3 className="a-ink m-0 text-[17px] font-semibold">
                {playlists.length === 0 ? 'No playlists synced yet' : 'No playlists match your filters'}
              </h3>
              <p className="a-mute m-0 text-[14px]">
                {playlists.length === 0
                  ? 'Playlists are imported automatically when you sync a YouTube channel'
                  : 'Try adjusting your filter criteria'}
              </p>
            </div>
          ) : (
            <div className="atvm-pl-grid">
              {filteredPlaylists.map(playlist => {
                const channel = channels.find(c => c.id === playlist.channel_id);
                return (
                  <div key={playlist.id} className={`a-card atvm-pl ${!playlist.is_visible ? 'is-hidden' : ''} ${playlist.is_featured ? 'is-featured' : ''}`}>
                    <div className="atvm-pl-media">
                      {playlist.thumbnail_url ? (
                        <img src={playlist.thumbnail_url} alt="" loading="lazy" />
                      ) : (
                        <span className="atvm-pl-ph"><AlfieIcon glyph="list" size={28} /></span>
                      )}
                      <div className="atvm-pl-acts">
                        <button
                          type="button"
                          onClick={() => handleTogglePlaylistFeatured(playlist.id, playlist.is_featured)}
                          className={`atvm-glass ${playlist.is_featured ? 'is-star' : ''}`}
                          title={playlist.is_featured ? 'Remove from featured' : 'Mark as featured'}
                          aria-pressed={playlist.is_featured}
                        >
                          <AlfieIcon glyph="star" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePlaylistVisibility(playlist.id, playlist.is_visible)}
                          className={`atvm-glass ${playlist.is_visible ? 'is-eye' : ''}`}
                          title={playlist.is_visible ? 'Hide playlist' : 'Show playlist'}
                          aria-pressed={playlist.is_visible}
                        >
                          <AlfieIcon glyph={playlist.is_visible ? 'eye' : 'eyeoff'} size={14} />
                        </button>
                      </div>
                      {playlist.is_featured && <span className="atvm-pl-feat">Featured</span>}
                      <span className="atvm-pl-count">{playlist.video_count} videos</span>
                    </div>

                    <div className="atvm-pl-body">
                      <h3>{playlist.title}</h3>
                      {channel && (
                        <div className="atvm-pl-ch">
                          {channel.channel_thumbnail ? (
                            <img src={channel.channel_thumbnail} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span>{channel.channel_name.charAt(0)}</span>
                          )}
                          {channel.channel_name}
                        </div>
                      )}
                      <select
                        value={playlist.playlist_category || 'general'}
                        onChange={(e) => handleUpdatePlaylistCategory(playlist.id, e.target.value)}
                        className="a-pick atvm-pick atvm-pick-full"
                        aria-label="Playlist type"
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
          addNotification('success', 'Video added successfully');
          loadChannels();
        }}
        darkMode={darkMode}
      />

      {/* Add/Edit Channel */}
      {(showAddModal || editingChannel) && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6 atvm-modal">
          <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={closeChannelSheet} aria-hidden="true" />
          <section className="a-sheet relative w-full max-w-xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="atvm-ch-title">
            <header className="a-sheet-head a-md-sheet-head">
              <span className="atvm-yt" aria-hidden="true"><i /></span>
              <div className="min-w-0 flex-1">
                <h2 id="atvm-ch-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">
                  {editingChannel ? 'Edit Channel' : 'Add New Channel'}
                </h2>
                <p className="a-mute m-0 mt-0.5 text-[13.5px]">Videos and playlists are imported from YouTube</p>
              </div>
              <button type="button" className="a-ib" onClick={closeChannelSheet} aria-label="Close"><AlfieIcon glyph="x" size={20} /></button>
            </header>

            <div className="a-md-sheet-body">
              <label className="a-md-fl">
                <span>Channel Name</span>
                <input
                  type="text"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  placeholder="e.g., RC Sailing Tips"
                  className="a-inp"
                />
              </label>

              <label className="a-md-fl">
                <span>YouTube Channel URL</span>
                <span className="a-field">
                  <AlfieIcon glyph="link" size={16} />
                  <input
                    type="text"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    placeholder="https://www.youtube.com/@channel-name"
                  />
                </span>
              </label>

              <div className="atvm-opt">
                <div className="min-w-0 flex-1">
                  <b>Auto-import</b>
                  <span>Automatically import new videos from this channel</span>
                </div>
                <ASwitch checked={autoImport} onChange={setAutoImport} label="Automatically import new videos from this channel" />
              </div>

              {canCreateGlobalChannels && (
                <div className={`atvm-opt ${isGlobal ? 'is-on' : ''}`}>
                  <span className="atvm-opt-ic"><AlfieIcon glyph="globe" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <b>{isAssociation ? 'Global Channel' : 'Make this a Global Channel'}</b>
                    <span>
                      {isAssociation
                        ? 'Association channels are always global and visible to all users'
                        : isGlobal
                          ? 'This channel will be visible to all users across all clubs and associations'
                          : 'This channel will only be visible to members of the selected club'}
                    </span>
                  </div>
                  <ASwitch checked={isGlobal} onChange={setIsGlobal} label="Global channel" disabled={isAssociation} />
                </div>
              )}
            </div>

            <footer className="a-sheet-foot a-md-sheet-foot">
              <button onClick={closeChannelSheet} className="a-btn a-btn-q">Cancel</button>
              <button onClick={editingChannel ? handleUpdateChannel : handleAddChannel} className="a-btn a-btn-p">
                <AlfieIcon glyph={editingChannel ? 'save' : 'plus'} size={16} />
                {editingChannel ? 'Update Channel' : 'Add Channel'}
              </button>
            </footer>
          </section>
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
  );
}
