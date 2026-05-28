import React, { useState, useEffect } from 'react';
import { Trophy, Plus, Upload, Users, ChevronRight, Share2, FileText, Timer, Sailboat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

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

  useEffect(() => {
    if (user) loadData();
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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = userName ? userName.split(' ')[0] : '';

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero Cover Image Section */}
      <div className="relative w-full h-[280px] bg-slate-800 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/RC-Yachts-image-custom_crop.jpg"
            alt="Race Management"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-slate-900/20" />

        {/* Welcome Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 lg:p-12">
          <div className="flex items-center gap-4">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={firstName || 'User'}
                className="w-14 h-14 rounded-full object-cover border-2 border-white/30 shadow-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-sky-500/30 border-2 border-white/20 flex items-center justify-center shadow-lg">
                <Timer className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h1
                className="text-2xl sm:text-3xl font-bold"
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
                  opacity: 0.9,
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
      <div className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 -mt-8 relative z-10">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Events</p>
                <p className="text-2xl font-bold text-white mt-1">{eventCount}</p>
              </div>
              <div className="w-10 h-10 bg-sky-500/10 rounded-lg flex items-center justify-center">
                <Trophy className="w-5 h-5 text-sky-400" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Skippers</p>
                <p className="text-2xl font-bold text-white mt-1">{contactCount}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Shared Results</p>
                <p className="text-2xl font-bold text-white mt-1">{sharedCount}</p>
              </div>
              <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Share2 className="w-5 h-5 text-amber-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column - Recent Events */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-sky-400" />
                  Recent Events
                </h2>
                <button
                  onClick={() => navigate('/race-management')}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : recentEvents.length === 0 ? (
                  <div className="text-center py-10">
                    <div className="inline-flex p-4 rounded-full bg-slate-700/50 mb-4">
                      <Trophy className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="text-base font-medium text-white mb-1">No events yet</h3>
                    <p className="text-slate-400 mb-5 text-sm">
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
                          className="bg-slate-700/30 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg p-3.5 flex items-center gap-3.5 cursor-pointer transition-colors"
                        >
                          <div className="w-9 h-9 bg-sky-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Trophy className="w-4 h-4 text-sky-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">{event.event_name}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              {event.boat_class && (
                                <span className="bg-slate-600/50 px-1.5 py-0.5 rounded text-slate-300">{event.boat_class}</span>
                              )}
                              <span>{skipperCount} skippers</span>
                              {event.last_completed_race && (
                                <span>Race {event.last_completed_race}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 hidden sm:block">
                            {formatDate(event.created_at)}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
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
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700">
                <h2 className="text-base font-semibold text-white">Quick Actions</h2>
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
                  className="w-full flex items-center gap-3 bg-slate-700/60 hover:bg-slate-700 text-white rounded-lg px-4 py-3 transition-colors text-left"
                >
                  <Upload className="w-4 h-4 flex-shrink-0 text-slate-300" />
                  <div>
                    <p className="text-sm font-medium">Manage Skippers</p>
                    <p className="text-xs text-slate-400">Add or import contacts</p>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/results')}
                  className="w-full flex items-center gap-3 bg-slate-700/60 hover:bg-slate-700 text-white rounded-lg px-4 py-3 transition-colors text-left"
                >
                  <FileText className="w-4 h-4 flex-shrink-0 text-slate-300" />
                  <div>
                    <p className="text-sm font-medium">View Results</p>
                    <p className="text-xs text-slate-400">Past events and series</p>
                  </div>
                </button>
                <button
                  onClick={() => navigate('/data-feeds')}
                  className="w-full flex items-center gap-3 bg-slate-700/60 hover:bg-slate-700 text-white rounded-lg px-4 py-3 transition-colors text-left"
                >
                  <Share2 className="w-4 h-4 flex-shrink-0 text-slate-300" />
                  <div>
                    <p className="text-sm font-medium">Data Feeds</p>
                    <p className="text-xs text-slate-400">Export results externally</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Upgrade Info Widget */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sailboat className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">Want more features?</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Connect to a club or upgrade to the full AlfiePRO platform for member management, website builder, communications, and more.
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                >
                  Learn more &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
