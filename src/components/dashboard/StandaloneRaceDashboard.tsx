import React, { useState, useEffect } from 'react';
import { Trophy, Plus, Upload, Users, Calendar, ChevronRight, Share2, FileText, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

export const StandaloneRaceDashboard: React.FC<{ darkMode: boolean }> = ({ darkMode }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [contactCount, setContactCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

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
          .select('full_name')
          .eq('id', user!.id)
          .maybeSingle()
      ]);

      setRecentEvents(eventsRes.data || []);
      setContactCount(contactsRes.count || 0);
      setSharedCount(sharedRes.count || 0);
      setUserName(profileRes.data?.full_name || '');
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-10 max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-500/20 rounded-lg flex items-center justify-center">
              <Timer className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {greeting()}{userName ? `, ${userName.split(' ')[0]}` : ''}
              </h1>
              <p className="text-sm text-slate-400">Race Management Dashboard</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Events</p>
                <p className="text-2xl font-bold text-white">{recentEvents.length}</p>
              </div>
              <Trophy className="w-8 h-8 text-sky-400/50" />
            </div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Skipper Contacts</p>
                <p className="text-2xl font-bold text-white">{contactCount}</p>
              </div>
              <Users className="w-8 h-8 text-emerald-400/50" />
            </div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Shared Results</p>
                <p className="text-2xl font-bold text-white">{sharedCount}</p>
              </div>
              <Share2 className="w-8 h-8 text-amber-400/50" />
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => navigate('/race-management')}
              className="flex items-center gap-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl p-4 transition-colors text-left"
            >
              <Plus className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">New Event</p>
                <p className="text-xs text-sky-200">Create a race or series</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/ro-contacts')}
              className="flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl p-4 transition-colors text-left"
            >
              <Upload className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Import Skippers</p>
                <p className="text-xs text-slate-300">Add or manage contacts</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/results')}
              className="flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl p-4 transition-colors text-left"
            >
              <FileText className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">View Results</p>
                <p className="text-xs text-slate-300">Past events and series</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/external-organizations')}
              className="flex items-center gap-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl p-4 transition-colors text-left"
            >
              <Share2 className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Organizations</p>
                <p className="text-xs text-slate-300">Share results externally</p>
              </div>
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Recent Events</h2>
            <button
              onClick={() => navigate('/race-management')}
              className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : recentEvents.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-8 text-center">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-2">No events yet</h3>
              <p className="text-slate-400 mb-4 text-sm">
                Create your first event to start scoring races independently.
              </p>
              <button
                onClick={() => navigate('/race-management')}
                className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
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
                    className="bg-slate-800/60 border border-slate-700 hover:border-slate-600 rounded-xl p-4 flex items-center gap-4 cursor-pointer transition-colors"
                  >
                    <div className="w-10 h-10 bg-sky-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Trophy className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{event.event_name}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        {event.boat_class && (
                          <span className="bg-slate-700/50 px-2 py-0.5 rounded">{event.boat_class}</span>
                        )}
                        <span>{skipperCount} skippers</span>
                        {event.last_completed_race && (
                          <span>Race {event.last_completed_race}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(event.created_at)}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-8 bg-slate-800/40 border border-slate-700 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-medium mb-1">Want more features?</h3>
              <p className="text-slate-400 text-sm">
                Connect to a club or upgrade to the full AlfiePRO platform for member management, website builder, communications, and more.
              </p>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="text-sm text-sky-400 hover:text-sky-300 whitespace-nowrap flex-shrink-0"
            >
              Learn more
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
