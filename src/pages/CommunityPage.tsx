import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { supabase } from '../utils/supabase';
import { Users, UserPlus, Settings, Clock, ArrowLeft, Star, ChevronDown, ChevronUp, MessageCircle, Search, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PostCreationModal from '../components/social/PostCreationModal';
import ActivityFeed from '../components/social/ActivityFeed';
import ConnectionsModal from '../components/social/ConnectionsModal';
import GroupManagementModal from '../components/social/GroupManagementModal';
import { ChatView } from '../components/conversations/ChatView';
import { socialStorage, SocialGroup, SocialConnection } from '../utils/socialStorage';

interface CommunityPageProps {
  darkMode?: boolean;
}

export default function CommunityPage({ darkMode = false }: CommunityPageProps) {
  const { user, currentClub } = useAuth();
  const { isImpersonating, effectiveProfile: impersonatedProfile, effectiveUserId } = useImpersonation();
  const navigate = useNavigate();
  const lightMode = !darkMode;
  const [profile, setProfile] = useState<any>(null);
  const [coverImage, setCoverImage] = useState<string>('');
  const [coverImagePosition, setCoverImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [showPostModal, setShowPostModal] = useState(false);
  const [showConnectionsModal, setShowConnectionsModal] = useState(false);
  const [showGroupManagement, setShowGroupManagement] = useState(false);
  const [groups, setGroups] = useState<SocialGroup[]>([]);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [activityPoints, setActivityPoints] = useState<any>(null);
  const [clubName, setClubName] = useState<string>('');
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<SocialGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<SocialGroup | null>(null);
  const [postModalGroupId, setPostModalGroupId] = useState<string | undefined>();
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [connectionSearchTerm, setConnectionSearchTerm] = useState('');
  const [chatTarget, setChatTarget] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [viewingProfile, setViewingProfile] = useState<{ id: string; name: string; avatar?: string } | null>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const chatWith = searchParams.get('chatWith');
    const chatName = searchParams.get('chatName');
    const chatAvatar = searchParams.get('chatAvatar');
    if (chatWith && chatName) {
      setChatTarget({ id: chatWith, name: chatName, avatar: chatAvatar || undefined });
    }
  }, [searchParams]);

  useEffect(() => {
    loadProfile();
    loadGroups();
    loadConnections();
    loadActivityPoints();
    loadActiveUsers();

    // Update last_seen timestamp
    updateLastSeen();

    // Update last_seen every 5 minutes
    const interval = setInterval(updateLastSeen, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const updateLastSeen = async () => {
    if (!user) return;
    try {
      await supabase.rpc('update_user_last_seen');
    } catch (error) {
      console.error('Error updating last_seen:', error);
    }
  };

  const loadProfile = async () => {
    if (!user) return;

    const profileUserId = isImpersonating && effectiveUserId ? effectiveUserId : user.id;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileUserId)
      .maybeSingle();

    if (isImpersonating && impersonatedProfile && !data) {
      setProfile({
        id: effectiveUserId,
        full_name: impersonatedProfile.fullName,
        first_name: impersonatedProfile.firstName,
        last_name: impersonatedProfile.lastName,
        avatar_url: impersonatedProfile.avatarUrl,
      });
    } else if (data) {
      if (isImpersonating && impersonatedProfile) {
        setProfile({
          ...data,
          full_name: impersonatedProfile.fullName || data.full_name,
          avatar_url: impersonatedProfile.avatarUrl || data.avatar_url,
        });
      } else {
        setProfile(data);
      }
    }

    const effectiveData = isImpersonating && impersonatedProfile
      ? { default_club_id: currentClub?.clubId }
      : data;

    if (effectiveData) {
      const clubId = effectiveData.default_club_id || currentClub?.clubId;
      if (clubId) {
        const { data: club } = await supabase
          .from('clubs')
          .select('name, cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale')
          .eq('id', clubId)
          .maybeSingle();

        if (club) {
          setClubName(club.name);
          if (club.cover_image_url) {
            setCoverImage(club.cover_image_url);
            setCoverImagePosition({
              x: club.cover_image_position_x || 0,
              y: club.cover_image_position_y || 0,
              scale: club.cover_image_scale || 1
            });
          }
        }
      }
    }
  };

  const loadGroups = async () => {
    try {
      const data = await socialStorage.getGroups({ userId: user?.id });
      const defaultClubId = profile?.default_club_id || currentClub?.clubId;
      const sorted = [...(data || [])].sort((a, b) => {
        const aIsDefault = a.club_id === defaultClubId && a.group_type === 'club';
        const bIsDefault = b.club_id === defaultClubId && b.group_type === 'club';
        if (aIsDefault && !bIsDefault) return -1;
        if (!aIsDefault && bIsDefault) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      setAllGroups(sorted);
      setGroups(sorted);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadConnections = async () => {
    try {
      const [connData, pendingData] = await Promise.all([
        socialStorage.getConnections(),
        socialStorage.getPendingConnectionRequests(),
      ]);
      setConnections(connData?.slice(0, 5) || []);
      setPendingRequestCount(pendingData?.length || 0);
    } catch (error) {
      console.error('Error loading connections:', error);
    }
  };

  const isClubAdmin = currentClub?.role === 'admin' || currentClub?.role === 'super_admin';

  const loadActivityPoints = async () => {
    if (!user) return;

    const activityUserId = isImpersonating && effectiveUserId ? effectiveUserId : user.id;

    try {
      const { data } = await supabase
        .from('member_activity_points')
        .select('*')
        .eq('user_id', activityUserId)
        .maybeSingle();

      setActivityPoints(data);
    } catch (error) {
      console.error('Error loading activity points:', error);
    }
  };

  const loadActiveUsers = async () => {
    if (!user) return;

    try {
      // Get users active in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, last_seen')
        .gte('last_seen', fifteenMinutesAgo)
        .order('last_seen', { ascending: false })
        .limit(20);

      setActiveUsers(data || []);
    } catch (error) {
      console.error('Error loading active users:', error);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      await socialStorage.joinGroup(groupId);
      loadGroups();
    } catch (error) {
      console.error('Error joining group:', error);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      await socialStorage.leaveGroup(groupId);
      loadGroups();
    } catch (error) {
      console.error('Error leaving group:', error);
    }
  };

  const firstName = profile?.full_name?.split(' ')[0] || '';

  return (
    <div className={`min-h-screen ${lightMode ? 'bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50' : 'bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]'}`}>
      {/* Hero Header Section - Same as Dashboard */}
      <div className="relative h-[300px] overflow-hidden" style={{
        backgroundImage: coverImage ? `url(${coverImage})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundSize: coverImage ? 'cover' : 'auto',
        backgroundPosition: coverImage ? `${coverImagePosition.x}% ${coverImagePosition.y}%` : 'center',
        transform: coverImage ? `scale(${coverImagePosition.scale})` : 'none',
        transformOrigin: 'center'
      }}>
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/70 to-transparent"></div>

        {/* Welcome Header Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-8 lg:p-16">
          <div className="flex items-center gap-3 sm:gap-4">
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt={firstName || 'User'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border border-white/30"
              />
            )}
            <div>
              <h1
                className="text-xl sm:text-2xl lg:text-3xl font-bold"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 4px 16px rgba(0, 0, 0, 0.6)'
                }}
              >
                Welcome to Alfie Pro{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p
                className="text-sm sm:text-base mt-1"
                style={{
                  color: '#ffffff',
                  opacity: 0.95,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.7)'
                }}
              >
                The Ultimate Principal Race Officer & Club Mgt Tool for {clubName || 'your club'}.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-16">
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          <div className="lg:col-span-7 space-y-6">
            {viewingProfile ? (
              <>
                <div className={`rounded-xl p-6 border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setViewingProfile(null)}
                      className={`p-2 rounded-lg transition-colors ${lightMode ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-700 text-slate-400'}`}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    {viewingProfile.avatar ? (
                      <img src={viewingProfile.avatar} alt={viewingProfile.name} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                        {viewingProfile.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className={`text-xl font-bold truncate ${lightMode ? 'text-gray-900' : 'text-white'}`}>{viewingProfile.name}</h2>
                      <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>Connection</p>
                    </div>
                    <button
                      onClick={() => setChatTarget({
                        id: viewingProfile.id,
                        name: viewingProfile.name,
                        avatar: viewingProfile.avatar,
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Message
                    </button>
                  </div>
                </div>
                <ActivityFeed key={viewingProfile.id} darkMode={darkMode} authorId={viewingProfile.id} />
              </>
            ) : selectedGroup ? (
              <>
                <div className={`rounded-xl p-6 border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSelectedGroup(null)}
                      className={`p-2 rounded-lg transition-colors ${lightMode ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-700 text-slate-400'}`}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    {(selectedGroup as any).club?.logo ? (
                      <img src={(selectedGroup as any).club.logo} alt={selectedGroup.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : selectedGroup.avatar_url ? (
                      <img src={selectedGroup.avatar_url} alt={selectedGroup.name} className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                        {selectedGroup.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className={`text-xl font-bold truncate ${lightMode ? 'text-gray-900' : 'text-white'}`}>{selectedGroup.name}</h2>
                      <p className={`text-sm ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
                        {selectedGroup.member_count || 0} members
                        {selectedGroup.description && ` - ${selectedGroup.description}`}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className={`rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.01] border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50 hover:shadow-xl' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl hover:border-slate-600/50'}`}
                  onClick={() => { setPostModalGroupId(selectedGroup.id); setShowPostModal(true); }}
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.full_name} className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                          {profile?.full_name?.charAt(0) || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`w-full text-left px-4 py-3 rounded-full transition-colors ${lightMode ? 'bg-gray-100 hover:bg-gray-200' : 'bg-slate-700/50 hover:bg-slate-700/70'}`}>
                        <span className={lightMode ? 'text-gray-500' : 'text-slate-400'}>Post to {selectedGroup.name}...</span>
                      </div>
                    </div>
                  </div>
                </div>
                <ActivityFeed darkMode={darkMode} groupId={selectedGroup.id} privacy={['group']} />
              </>
            ) : (
              <>
                <div
                  className={`rounded-xl p-6 cursor-pointer transition-all hover:scale-[1.01] border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50 hover:shadow-xl' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl hover:border-slate-600/50'}`}
                  onClick={() => { setPostModalGroupId(undefined); setShowPostModal(true); }}
                >
                  <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.full_name} className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                          {profile?.full_name?.charAt(0) || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={`w-full text-left px-4 py-3 rounded-full transition-colors ${lightMode ? 'bg-gray-100 hover:bg-gray-200' : 'bg-slate-700/50 hover:bg-slate-700/70'}`}>
                        <span className={lightMode ? 'text-gray-500' : 'text-slate-400'}>What's on your mind?</span>
                      </div>
                    </div>
                  </div>
                </div>
                <ActivityFeed darkMode={darkMode} privacy={['public', 'friends', 'group']} />
              </>
            )}
          </div>

          <div className="lg:col-span-3 space-y-6">
            {/* My Groups Card */}
            <div className={`rounded-xl p-6 border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-lg ${lightMode ? 'text-gray-900' : 'text-white'}`}>My Groups</h3>
                <div className="flex items-center gap-2">
                  {isClubAdmin && currentClub?.clubId && (
                    <button
                      onClick={() => setShowGroupManagement(true)}
                      className={`p-1.5 rounded-lg transition-colors ${lightMode ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                      title="Manage Groups"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                  {groups.length > 3 && (
                    <button
                      onClick={() => setShowAllGroups(!showAllGroups)}
                      className="flex items-center gap-1 text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors"
                    >
                      <span>{showAllGroups ? 'Show Less' : 'See All'}</span>
                      {showAllGroups ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>
              {groups.length > 0 ? (
                <div className="space-y-1">
                  {(showAllGroups ? groups : groups.slice(0, 3)).map(group => {
                    const defaultClubId = profile?.default_club_id || currentClub?.clubId;
                    const isDefaultClub = group.club_id === defaultClubId && group.group_type === 'club';
                    const clubLogo = (group as any).club?.logo;
                    return (
                      <button
                        key={group.id}
                        onClick={() => { setSelectedGroup(group); setViewingProfile(null); }}
                        className={`w-full flex items-center space-x-3 p-2 rounded-lg transition-colors text-left ${selectedGroup?.id === group.id ? (lightMode ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-blue-900/30 ring-1 ring-blue-700') : (lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/30')}`}
                      >
                        <div className="relative flex-shrink-0">
                          {clubLogo ? (
                            <img src={clubLogo} alt={group.name} className="w-10 h-10 rounded-lg object-cover" />
                          ) : group.avatar_url ? (
                            <img src={group.avatar_url} alt={group.name} className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                              {group.name.charAt(0)}
                            </div>
                          )}
                          {isDefaultClub && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow-sm">
                              <Star className="w-2.5 h-2.5 text-white fill-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium truncate text-sm ${lightMode ? 'text-gray-900' : 'text-white'}`}>{group.name}</span>
                            {isDefaultClub && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${lightMode ? 'bg-amber-100 text-amber-700' : 'bg-amber-900/40 text-amber-400'}`}>
                                HOME
                              </span>
                            )}
                          </div>
                          <div className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>{group.member_count || 0} members</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-sm text-center py-4 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>No groups joined yet</p>
              )}
            </div>

            {/* My Connections Card - Match Dashboard Card Style */}
            <div className={`rounded-xl p-6 border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`font-bold text-lg ${lightMode ? 'text-gray-900' : 'text-white'}`}>My Connections</h3>
                <div className="flex items-center gap-2">
                  {pendingRequestCount > 0 && (
                    <button
                      onClick={() => setShowConnectionsModal(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse"
                      title={`${pendingRequestCount} pending request${pendingRequestCount > 1 ? 's' : ''}`}
                    >
                      <Clock className="w-3 h-3" />
                      {pendingRequestCount}
                    </button>
                  )}
                  <button
                    onClick={() => setShowConnectionsModal(true)}
                    className="flex items-center space-x-1 text-blue-500 hover:text-blue-600 text-sm font-medium transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{connections.length}</span>
                  </button>
                </div>
              </div>
              {connections.length > 0 && (
                <div className="relative mb-3">
                  <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${lightMode ? 'text-gray-400' : 'text-slate-500'}`} />
                  <input
                    type="text"
                    placeholder="Search connections..."
                    value={connectionSearchTerm}
                    onChange={(e) => setConnectionSearchTerm(e.target.value)}
                    className={`w-full pl-9 pr-8 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ${
                      lightMode
                        ? 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
                        : 'bg-slate-700/60 border border-slate-600/50 text-white placeholder-slate-500'
                    }`}
                  />
                  {connectionSearchTerm && (
                    <button
                      onClick={() => setConnectionSearchTerm('')}
                      className={`absolute right-3 top-1/2 -translate-y-1/2 ${lightMode ? 'text-gray-400 hover:text-gray-600' : 'text-slate-500 hover:text-white'}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              {connections.length > 0 ? (
                <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                  {connections
                    .filter(c => {
                      if (!connectionSearchTerm) return true;
                      const name = c.connected_user?.full_name || '';
                      return name.toLowerCase().includes(connectionSearchTerm.toLowerCase());
                    })
                    .map(connection => {
                    const connUser = connection.connected_user;
                    const isOnline = connUser?.last_seen && (Date.now() - new Date(connUser.last_seen).getTime()) < 15 * 60 * 1000;
                    const connUserId = connUser?.id || (connection as any).connected_user_id;
                    return (
                      <div
                        key={connection.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/30'}`}
                        onClick={() => {
                          if (connUserId) {
                            setViewingProfile({
                              id: connUserId,
                              name: connUser?.full_name || 'User',
                              avatar: connUser?.avatar_url,
                            });
                            setSelectedGroup(null);
                          }
                        }}
                      >
                        <div className="relative flex-shrink-0">
                          {connUser?.avatar_url ? (
                            <img
                              src={connUser.avatar_url}
                              alt={connUser.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                              {connUser?.full_name?.charAt(0) || '?'}
                            </div>
                          )}
                          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${lightMode ? 'border-white' : 'border-slate-800'} ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-medium truncate ${lightMode ? 'text-gray-900' : 'text-white'}`}>{connUser?.full_name || 'User'}</div>
                          <div className={`text-xs ${isOnline ? 'text-green-500' : lightMode ? 'text-gray-400' : 'text-slate-500'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </div>
                        </div>
                        {connUserId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatTarget({
                                id: connUserId,
                                name: connUser?.full_name || 'User',
                                avatar: connUser?.avatar_url,
                              });
                            }}
                            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${lightMode ? 'text-blue-600 hover:bg-blue-50' : 'text-blue-400 hover:bg-slate-700/50'}`}
                            title={`Chat with ${connUser?.full_name || 'User'}`}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {connectionSearchTerm && connections.filter(c => (c.connected_user?.full_name || '').toLowerCase().includes(connectionSearchTerm.toLowerCase())).length === 0 && (
                    <p className={`text-sm text-center py-3 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>No matching connections</p>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className={`text-sm mb-3 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>No connections yet</p>
                  <button
                    onClick={() => setShowConnectionsModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Find Connections
                  </button>
                </div>
              )}
            </div>

            {/* Active Now Card - Match Dashboard Card Style */}
            <div className={`rounded-xl p-6 border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
              <h3 className={`font-bold text-lg mb-4 ${lightMode ? 'text-gray-900' : 'text-white'}`}>Active Now</h3>
              {activeUsers.length > 0 ? (
                <div className="flex flex-wrap -space-x-2">
                  {activeUsers.slice(0, 15).map(activeUser => (
                    <div key={activeUser.id} className="relative group">
                      {activeUser.avatar_url ? (
                        <img
                          src={activeUser.avatar_url}
                          alt={activeUser.full_name}
                          className={`w-10 h-10 rounded-full border-2 object-cover ${lightMode ? 'border-white' : 'border-slate-700'}`}
                          title={activeUser.full_name}
                        />
                      ) : (
                        <div
                          className={`w-10 h-10 rounded-full border-2 bg-blue-500 flex items-center justify-center text-white text-xs font-bold ${lightMode ? 'border-white' : 'border-slate-700'}`}
                          title={activeUser.full_name}
                        >
                          {activeUser.full_name?.charAt(0)}
                        </div>
                      )}
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-sm text-center py-4 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>No one is active right now</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <PostCreationModal
        isOpen={showPostModal}
        onClose={() => setShowPostModal(false)}
        groupId={postModalGroupId}
        groups={allGroups}
        onPostCreated={() => {
          setShowPostModal(false);
        }}
        darkMode={darkMode}
      />

      <ConnectionsModal
        isOpen={showConnectionsModal}
        onClose={() => {
          setShowConnectionsModal(false);
          loadConnections();
        }}
        darkMode={darkMode}
      />

      {currentClub?.clubId && (
        <GroupManagementModal
          isOpen={showGroupManagement}
          onClose={() => setShowGroupManagement(false)}
          clubId={currentClub.clubId}
          darkMode={darkMode}
          onGroupsChanged={loadGroups}
        />
      )}

      {chatTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setChatTarget(null)} />
          <div className={`relative w-full sm:w-[420px] h-[85vh] sm:h-[600px] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
            <ChatView
              recipientId={chatTarget.id}
              recipientName={chatTarget.name}
              recipientAvatar={chatTarget.avatar}
              onBack={() => setChatTarget(null)}
              darkMode={darkMode}
            />
          </div>
        </div>
      )}
    </div>
  );
}
