import React, { useState, useEffect } from 'react';
import { Trophy, Plus, Upload, Users, ChevronRight, Share2, FileText, Timer, Sailboat, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import CoverImageUploadModal from '../CoverImageUploadModal';

export const StandaloneRaceDashboard: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImagePosition, setCoverImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [showCoverImageModal, setShowCoverImageModal] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
      fetchCoverImage();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [eventsRes, contactsRes, sharedRes, profileRes] = await Promise.all([
        supabase
          .from('quick_races')
          .select('id, event_name, boat_class, race_format, scoring_type, created_at, last_completed_race, skippers')
          .eq('user_id', user!.id)
          .is('club_id', null)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('race_officer_contacts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('shared_results')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user!.id)
          .maybeSingle()
      ]);

      setRecentEvents(eventsRes.data || []);
      setEventCount(eventsRes.data?.length || 0);
      setContactCount(contactsRes.count || 0);
      setSharedCount(sharedRes.count || 0);
      setUserName(profileRes.data?.full_name || '');
      setUserAvatar(profileRes.data?.avatar_url || '');
    } catch (err) {
      console.error('Error loading standalone dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCoverImage = async () => {
    if (!user) return;
    try {
      const cacheKey = `cover_image_profile_${user.id}`;
      const cachedUrl = localStorage.getItem(cacheKey);
      const cachedPosition = localStorage.getItem(`${cacheKey}_position`);

      if (cachedUrl) setCoverImageUrl(cachedUrl);
      if (cachedPosition) {
        try { setCoverImagePosition(JSON.parse(cachedPosition)); } catch {}
      }

      if (!navigator.onLine) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.cover_image_url) {
        setCoverImageUrl(data.cover_image_url);
        localStorage.setItem(cacheKey, data.cover_image_url);
        const position = {
          x: data.cover_image_position_x || 0,
          y: data.cover_image_position_y || 0,
          scale: data.cover_image_scale || 1
        };
        setCoverImagePosition(position);
        localStorage.setItem(`${cacheKey}_position`, JSON.stringify(position));
      } else {
        setCoverImageUrl(null);
        localStorage.removeItem(cacheKey);
        localStorage.removeItem(`${cacheKey}_position`);
      }
    } catch (err) {
      console.error('Error fetching cover image:', err);
    }
  };

  const handleSaveCoverImage = async (file: File, position: { x: number; y: number; scale: number }) => {
    if (!user) throw new Error('Not authenticated');

    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(file, 'cover');
      const fileExt = compressed.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/cover-${Date.now()}.${fileExt}`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('You must be logged in to upload images');

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, compressed, { cacheControl: '3600', upsert: false });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          cover_image_url: publicUrl,
          cover_image_position_x: position.x,
          cover_image_position_y: position.y,
          cover_image_scale: position.scale
        })
        .eq('id', user.id);

      if (updateError) throw new Error(`Failed to update profile: ${updateError.message}`);

      setCoverImageUrl(publicUrl);
      setCoverImagePosition(position);
      const cacheKey = `cover_image_profile_${user.id}`;
      localStorage.setItem(cacheKey, publicUrl);
      localStorage.setItem(`${cacheKey}_position`, JSON.stringify(position));
    } catch (err) {
      console.error('Error saving cover image:', err);
      throw err instanceof Error ? err : new Error('Failed to save cover image');
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <div className="h-full overflow-y-auto">
      {/* Cover Image Section - Same as Club Dashboard */}
      <div className="relative w-full h-[300px] bg-slate-800 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={coverImageUrl || '/RC-Yachts-image-custom_crop.jpg'}
            alt="Dashboard cover"
            className="absolute min-w-full min-h-full object-cover"
            style={coverImageUrl ? {
              transform: `translate(${coverImagePosition.x}px, ${coverImagePosition.y}px) scale(${coverImagePosition.scale})`,
              transformOrigin: 'center',
            } : undefined}
          />
        </div>
        <div className="absolute inset-0 bg-black opacity-10 pointer-events-none" />

        {/* Edit Cover Image Button */}
        <button
          onClick={() => setShowCoverImageModal(true)}
          className="absolute top-4 right-4 p-3 bg-slate-900 bg-opacity-30 hover:bg-opacity-50 text-white rounded-lg backdrop-blur-sm transition-all flex items-center gap-2"
          title={coverImageUrl ? 'Change Cover' : 'Add Cover'}
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Welcome Header Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 via-slate-900/70 to-transparent p-4 sm:p-8 lg:p-16">
          <div className="flex items-center gap-3 sm:gap-4">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={firstName || 'User'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border border-white/30"
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-sky-500/20 border border-white/20 flex items-center justify-center">
                <Timer className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1
                className="text-xl sm:text-2xl lg:text-3xl font-bold"
                style={{
                  color: '#ffffff',
                  textShadow: '0 2px 8px rgba(0, 0, 0, 0.8), 0 4px 16px rgba(0, 0, 0, 0.6)'
                }}
              >
                {greeting()}{firstName ? `, ${firstName}` : ''}!
              </h1>
              <p
                className="text-sm sm:text-base mt-1"
                style={{
                  color: '#ffffff',
                  opacity: 0.95,
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.7)'
                }}
              >
                Race Management Dashboard
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className={`${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Events</p>
                <p className={`text-2xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{eventCount}</p>
              </div>
              <div className={`w-10 h-10 ${darkMode ? 'bg-sky-500/10' : 'bg-sky-50'} rounded-lg flex items-center justify-center`}>
                <Trophy className="w-5 h-5 text-sky-500" />
              </div>
            </div>
          </div>
          <div className={`${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Skippers</p>
                <p className={`text-2xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{contactCount}</p>
              </div>
              <div className={`w-10 h-10 ${darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'} rounded-lg flex items-center justify-center`}>
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </div>
          <div className={`${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl p-5 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Shared Results</p>
                <p className={`text-2xl font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>{sharedCount}</p>
              </div>
              <div className={`w-10 h-10 ${darkMode ? 'bg-amber-500/10' : 'bg-amber-50'} rounded-lg flex items-center justify-center`}>
                <Share2 className="w-5 h-5 text-amber-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column - Recent Events */}
          <div className="lg:col-span-2">
            <div className={`${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <h2 className={`text-base font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <Trophy className="w-4 h-4 text-sky-500" />
                  Recent Events
                </h2>
                <button
                  onClick={() => navigate('/race-management')}
                  className="text-xs text-sky-500 hover:text-sky-400 flex items-center gap-1 font-medium"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : recentEvents.length === 0 ? (
                  <div className="text-center py-12">
                    <div className={`inline-flex p-4 rounded-full ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'} mb-4`}>
                      <Trophy className={`w-8 h-8 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                    </div>
                    <h3 className={`text-base font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>No events yet</h3>
                    <p className={`mb-5 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Create your first event to start scoring races.
                    </p>
                    <button
                      onClick={() => navigate('/race-management')}
                      className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 transition-colors text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Create Event
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentEvents.map(event => {
                      const skipperCount = Array.isArray(event.skippers) ? event.skippers.length : 0;
                      return (
                        <div
                          key={event.id}
                          onClick={() => navigate('/race-management')}
                          className={`${darkMode ? 'bg-slate-700/30 hover:bg-slate-700/50 border-slate-700/50' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'} border rounded-lg p-3.5 flex items-center gap-3.5 cursor-pointer transition-colors`}
                        >
                          <div className={`w-9 h-9 ${darkMode ? 'bg-sky-500/10' : 'bg-sky-50'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                            <Trophy className="w-4 h-4 text-sky-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{event.event_name}</p>
                            <div className={`flex items-center gap-2 text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {event.boat_class && (
                                <span className={`${darkMode ? 'bg-slate-600/50 text-slate-300' : 'bg-slate-200 text-slate-600'} px-1.5 py-0.5 rounded`}>{event.boat_class}</span>
                              )}
                              <span>{skipperCount} skippers</span>
                              {event.last_completed_race && (
                                <span>Race {event.last_completed_race}</span>
                              )}
                            </div>
                          </div>
                          <div className={`text-xs hidden sm:block ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {formatDate(event.created_at)}
                          </div>
                          <ChevronRight className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Column - Quick Actions & Info */}
          <div className="space-y-6">
            {/* Quick Actions Widget */}
            <div className={`${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl overflow-hidden shadow-sm`}>
              <div className={`px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
                <h2 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Quick Actions</h2>
              </div>
              <div className="p-4 space-y-2">
                <button
                  onClick={() => navigate('/race-management')}
                  className="w-full flex items-center gap-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg px-4 py-3 transition-colors text-left"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">New Event</p>
                    <p className="text-xs text-sky-200">Create a race or series</p>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/ro-contacts')}
                  className={`w-full flex items-center gap-3 ${darkMode ? 'bg-slate-700/60 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'} rounded-lg px-4 py-3 transition-colors text-left`}
                >
                  <Upload className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-sm font-medium">Manage Skippers</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Add or import contacts</p>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/results')}
                  className={`w-full flex items-center gap-3 ${darkMode ? 'bg-slate-700/60 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'} rounded-lg px-4 py-3 transition-colors text-left`}
                >
                  <FileText className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-sm font-medium">View Results</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Past events and series</p>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/data-feeds')}
                  className={`w-full flex items-center gap-3 ${darkMode ? 'bg-slate-700/60 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'} rounded-lg px-4 py-3 transition-colors text-left`}
                >
                  <Share2 className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-300' : 'text-slate-500'}`} />
                  <div>
                    <p className="text-sm font-medium">Data Feeds</p>
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Export results externally</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Upgrade Info Widget */}
            <div className={`${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'} border rounded-xl overflow-hidden shadow-sm`}>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-9 h-9 ${darkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Sailboat className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Want more features?</h3>
                </div>
                <p className={`text-xs leading-relaxed mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Connect to a club or upgrade to the full AlfiePRO platform for member management, website builder, communications, and more.
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="text-xs text-sky-500 hover:text-sky-400 font-medium"
                >
                  Learn more &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cover Image Upload Modal */}
      <CoverImageUploadModal
        isOpen={showCoverImageModal}
        onClose={() => setShowCoverImageModal(false)}
        onSave={handleSaveCoverImage}
        currentImageUrl={coverImageUrl}
        currentPosition={coverImagePosition}
      />
    </div>
  );
};
