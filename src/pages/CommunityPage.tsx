import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { supabase } from '../utils/supabase';
import { UserPlus, Settings, ArrowLeft, Star, ChevronRight, MessageCircle, Search, X, Image, Video, MapPin } from 'lucide-react';
import { AAvatar } from '../components/alfie/Kit';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PostCreationModal from '../components/social/PostCreationModal';
import ActivityFeed from '../components/social/ActivityFeed';
import ConnectionsModal from '../components/social/ConnectionsModal';
import GroupManagementModal from '../components/social/GroupManagementModal';
import MemberProfileCard from '../components/social/MemberProfileCard';
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
  const [profileCardTarget, setProfileCardTarget] = useState<{ id: string; name: string; avatar?: string } | null>(null);
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

  const av = (name?: string | null, url?: string | null, size = 40) => {
    const [first, ...rest] = (name || '?').split(' ');
    return <AAvatar url={url} first={first} last={rest.join(' ')} size={size} />;
  };
  const openComposer = (groupId?: string) => { setPostModalGroupId(groupId); setShowPostModal(true); };
  const composer = (placeholder: string, groupId?: string) => (
    <div className="a-card flex items-center gap-3" style={{ padding: 14 }}>
      {av(profile?.full_name, profile?.avatar_url, 42)}
      <button className="a-composer-btn" onClick={() => openComposer(groupId)}>{placeholder}</button>
      <button className="a-ib" aria-label="Photo" title="Photo" onClick={() => openComposer(groupId)}><Image size={18} /></button>
      <button className="a-ib" aria-label="Video" title="Video" onClick={() => openComposer(groupId)}><Video size={18} /></button>
      <button className="a-ib" aria-label="Place" title="Place" onClick={() => openComposer(groupId)}><MapPin size={18} /></button>
    </div>
  );
  const filteredConnections = connections.filter(c => {
    if (!connectionSearchTerm) return true;
    const name = c.connected_user?.full_name || '';
    return name.toLowerCase().includes(connectionSearchTerm.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
      {/* Hero */}
      <div className="relative overflow-hidden" style={{ height: 200, borderRadius: 24 }}>
        <div className="absolute inset-0" style={{
          backgroundImage: coverImage ? `url(${coverImage})` : 'linear-gradient(135deg, #2E7BFF 0%, #8A4DFF 60%, #FF3E9A 100%)',
          backgroundSize: 'cover',
          backgroundPosition: coverImage ? `${coverImagePosition.x}% ${coverImagePosition.y}%` : 'center',
          transform: coverImage ? `scale(${coverImagePosition.scale})` : 'none',
          transformOrigin: 'center'
        }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(6,11,22,0.85), rgba(6,11,22,0.2))' }} />
        <div className="absolute flex items-center gap-4" style={{ left: 28, bottom: 26, right: 28 }}>
          {profile?.avatar_url || profile?.full_name ? av(profile?.full_name, profile?.avatar_url, 64) : null}
          <div className="min-w-0">
            <h1 className="a-display m-0 text-[30px] font-bold leading-[1.1]" style={{ color: '#fff' }}>Community</h1>
            <p className="mt-1 text-[14.5px]" style={{ color: 'rgba(235,240,255,0.78)' }}>What's happening across your clubs and groups</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
          {viewingProfile ? (
            <>
              <div className="a-card flex items-center gap-4" style={{ padding: 16 }}>
                <button onClick={() => setViewingProfile(null)} className="a-ib" aria-label="Back to feed">
                  <ArrowLeft size={18} />
                </button>
                {av(viewingProfile.name, viewingProfile.avatar, 48)}
                <div className="flex-1 min-w-0">
                  <h2 className="a-display a-ink m-0 text-[20px] font-semibold truncate">{viewingProfile.name}</h2>
                  <p className="a-dim text-[13px] mt-0.5">Connection</p>
                </div>
                <button
                  onClick={() => setChatTarget({
                    id: viewingProfile.id,
                    name: viewingProfile.name,
                    avatar: viewingProfile.avatar,
                  })}
                  className="a-btn a-btn-p"
                >
                  <MessageCircle size={16} />
                  Message
                </button>
              </div>
              <ActivityFeed key={viewingProfile.id} darkMode={darkMode} authorId={viewingProfile.id} onAuthorClick={setProfileCardTarget} />
            </>
          ) : selectedGroup ? (
            <>
              <div className="a-card flex items-center gap-4" style={{ padding: 16 }}>
                <button onClick={() => setSelectedGroup(null)} className="a-ib" aria-label="Back to feed">
                  <ArrowLeft size={18} />
                </button>
                {(selectedGroup as any).club?.logo || selectedGroup.avatar_url ? (
                  <img src={(selectedGroup as any).club?.logo || selectedGroup.avatar_url} alt={selectedGroup.name} className="w-12 h-12 rounded-[14px] object-cover" />
                ) : (
                  <span className="a-grp-logo" style={{ width: 48, height: 48 }}>{selectedGroup.name.slice(0, 2).toUpperCase()}</span>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="a-display a-ink m-0 text-[20px] font-semibold truncate">{selectedGroup.name}</h2>
                  <p className="a-dim text-[13px] mt-0.5 truncate">
                    {selectedGroup.member_count || 0} members
                    {selectedGroup.description && ` · ${selectedGroup.description}`}
                  </p>
                </div>
              </div>
              {composer(`Post to ${selectedGroup.name}…`, selectedGroup.id)}
              <ActivityFeed darkMode={darkMode} groupId={selectedGroup.id} privacy={['group']} onAuthorClick={setProfileCardTarget} />
            </>
          ) : (
            <>
              {composer("What's happening on the water?")}
              <ActivityFeed darkMode={darkMode} privacy={['public', 'friends', 'group']} onAuthorClick={setProfileCardTarget} />
            </>
          )}
        </div>

        <aside className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-4">
          {/* My groups */}
          <div className="a-card" style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="a-display a-ink text-[17px] font-semibold">My groups</span>
              <div className="flex items-center gap-0.5">
                {isClubAdmin && currentClub?.clubId && (
                  <button onClick={() => setShowGroupManagement(true)} className="a-ib" aria-label="Group settings" title="Manage groups">
                    <Settings size={17} />
                  </button>
                )}
                {groups.length > 3 && (
                  <button onClick={() => setShowAllGroups(!showAllGroups)} className="a-btn a-btn-q a-txt-b" style={{ height: 32, fontSize: 13 }}>
                    {showAllGroups ? 'Show less' : 'See all'}
                  </button>
                )}
              </div>
            </div>
            {groups.length > 0 ? (
              (showAllGroups ? groups : groups.slice(0, 3)).map(group => {
                const defaultClubId = profile?.default_club_id || currentClub?.clubId;
                const isDefaultClub = group.club_id === defaultClubId && group.group_type === 'club';
                const logo = (group as any).club?.logo || group.avatar_url;
                return (
                  <button
                    key={group.id}
                    onClick={() => { setSelectedGroup(group); setViewingProfile(null); }}
                    className={`a-grpl ${selectedGroup?.id === group.id ? 'a-grpl-on' : ''}`}
                  >
                    <span className="relative flex-shrink-0">
                      {logo ? (
                        <img src={logo} alt="" className="w-10 h-10 rounded-[12px] object-cover" />
                      ) : (
                        <span className="a-grp-logo" style={{ width: 40, height: 40 }}>{group.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <span className="a-ink text-[14.5px] font-semibold truncate">{group.name}</span>
                        {isDefaultClub && <span className="a-lb-fmt a-txt-a" style={{ height: 20, fontSize: 10.5 }}><Star size={10} className="fill-current" />Home</span>}
                      </div>
                      <div className="a-dim text-[12px] mt-0.5">{group.member_count || 0} members</div>
                    </div>
                    <ChevronRight size={16} className="a-dim" />
                  </button>
                );
              })
            ) : (
              <p className="a-dim text-[13px] text-center py-4">No groups joined yet</p>
            )}
          </div>

          {/* Connections */}
          <div className="a-card" style={{ padding: 18 }}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="a-display a-ink text-[17px] font-semibold">Connections</span>
              <div className="flex items-center gap-1">
                {pendingRequestCount > 0 && (
                  <button
                    onClick={() => setShowConnectionsModal(true)}
                    className="a-cnt"
                    style={{ background: '#FF453A' }}
                    title={`${pendingRequestCount} pending request${pendingRequestCount > 1 ? 's' : ''}`}
                  >
                    {pendingRequestCount}
                  </button>
                )}
                <button onClick={() => setShowConnectionsModal(true)} className="a-btn a-btn-q a-txt-b" style={{ height: 32, fontSize: 13 }}>
                  <UserPlus size={15} />Find people
                </button>
              </div>
            </div>

            {activeUsers.length > 0 && (
              <div className="flex gap-2.5" style={{ padding: '4px 4px 12px' }}>
                {activeUsers.slice(0, 3).map(activeUser => (
                  <div key={activeUser.id} className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ width: 56 }} title={activeUser.full_name}>
                    <span className="relative inline-flex">
                      {av(activeUser.full_name, activeUser.avatar_url, 48)}
                      <span className="a-pres" style={{ width: 13, height: 13, background: '#30D158' }} />
                    </span>
                    <span className="a-ink text-[12px] text-center truncate w-full">{(activeUser.full_name || '').split(' ')[0]}</span>
                  </div>
                ))}
                <div className="flex flex-col justify-center flex-shrink-0">
                  <span className="a-st text-[12px]"><span className="a-light a-light-g" />{activeUsers.length} active now</span>
                </div>
              </div>
            )}

            {connections.length >= 5 && (
              <label className="a-field mb-2" style={{ height: 38 }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Search connections"
                  value={connectionSearchTerm}
                  onChange={(e) => setConnectionSearchTerm(e.target.value)}
                />
                {connectionSearchTerm && (
                  <button onClick={() => setConnectionSearchTerm('')} className="a-dim flex" aria-label="Clear search"><X size={14} /></button>
                )}
              </label>
            )}

            {connections.length > 0 ? (
              <div className="max-h-[400px] overflow-y-auto">
                {filteredConnections.map(connection => {
                  const connUser = connection.connected_user;
                  const isOnline = connUser?.last_seen && (Date.now() - new Date(connUser.last_seen).getTime()) < 15 * 60 * 1000;
                  const connUserId = connUser?.id || (connection as any).connected_user_id;
                  return (
                    <div
                      key={connection.id}
                      className="a-grpl"
                      role="button"
                      tabIndex={0}
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
                      <span className="relative inline-flex flex-shrink-0">
                        {av(connUser?.full_name, connUser?.avatar_url, 40)}
                        <span className="a-pres" style={{ width: 11, height: 11, background: isOnline ? '#30D158' : '#6B7488' }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[14.5px] font-semibold truncate">{connUser?.full_name || 'User'}</div>
                        <div className={`text-[12px] mt-0.5 ${isOnline ? 'a-txt-g' : 'a-dim'}`}>{isOnline ? 'Online' : 'Offline'}</div>
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
                          className="a-ib a-ib-call-b"
                          aria-label={`Chat with ${connUser?.full_name || 'User'}`}
                          title={`Chat with ${connUser?.full_name || 'User'}`}
                        >
                          <MessageCircle size={17} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {connectionSearchTerm && filteredConnections.length === 0 && (
                  <p className="a-dim text-[13px] text-center py-3">No matching connections</p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="a-dim text-[13px] mb-3">No connections yet</p>
                <button onClick={() => setShowConnectionsModal(true)} className="a-btn a-btn-p">
                  <UserPlus size={16} />Find connections
                </button>
              </div>
            )}
          </div>
        </aside>
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
          <div className="a-sheet relative w-full sm:w-[420px] h-[85vh] sm:h-[600px] sm:max-h-[80vh] overflow-hidden flex flex-col">
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

      {profileCardTarget && (
        <MemberProfileCard
          userId={profileCardTarget.id}
          name={profileCardTarget.name}
          avatar={profileCardTarget.avatar}
          darkMode={darkMode}
          onClose={() => setProfileCardTarget(null)}
          onMessage={(target) => {
            setChatTarget(target);
            setProfileCardTarget(null);
          }}
          onViewProfile={(target) => {
            setViewingProfile(target);
            setSelectedGroup(null);
            setProfileCardTarget(null);
          }}
        />
      )}
    </div>
  );
}
