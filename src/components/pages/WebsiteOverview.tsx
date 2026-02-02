import React, { useState, useEffect } from 'react';
import { Globe, Edit, Plus, Eye, ArrowUpRight, Activity, Users, Calendar, BarChart2, Clock, Settings, Palette, FileText, Image, Trophy, TrendingUp, ExternalLink, Zap, Sparkles, Rocket, Layout, Navigation } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNavigate } from 'react-router-dom';

interface WebsiteOverviewProps {
  darkMode: boolean;
}

export const WebsiteOverview: React.FC<WebsiteOverviewProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const navigate = useNavigate();
  const [websiteStatus, setWebsiteStatus] = useState<'live' | 'draft' | 'offline'>('draft');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [activityFeed, setActivityFeed] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState({
    pageViews: 0,
    uniqueVisitors: 0,
    averageTimeOnSite: '0m 0s',
    topPage: '-'
  });
  const [eventWebsites, setEventWebsites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = currentOrganization?.id || currentClub?.clubId;
    if (orgId) {
      loadWebsiteStatus();
      loadActivityFeed();
      loadAnalytics();
      loadEventWebsites();
    }
  }, [currentClub?.clubId, currentOrganization?.id]);

  const loadWebsiteStatus = async () => {
    try {
      // Check if viewing from association or club
      if (currentOrganization) {
        const tableName = currentOrganization.type === 'state' ? 'state_associations' : 'national_associations';
        const { data: org, error } = await supabase
          .from(tableName)
          .select('domain_status, subdomain_slug, custom_domain, abbreviation, name')
          .eq('id', currentOrganization.id)
          .single();

        if (error) throw error;

        // Set website URL
        if (org?.custom_domain) {
          setWebsiteUrl(org.custom_domain);
        } else if (org?.subdomain_slug) {
          setWebsiteUrl(`${org.subdomain_slug}.alfiepro.com.au`);
        } else {
          const fallback = org?.abbreviation?.toLowerCase() || 'yourorg';
          setWebsiteUrl(`${fallback}.alfiepro.com.au`);
        }

        // Set status based on domain configuration
        if (org?.domain_status === 'active' && (org?.subdomain_slug || org?.custom_domain)) {
          setWebsiteStatus('live');
        } else if (org?.domain_status === 'custom' && org?.custom_domain) {
          setWebsiteStatus('live');
        } else {
          setWebsiteStatus('draft');
        }
      } else if (currentClub) {
        const { data: club, error } = await supabase
          .from('clubs')
          .select('domain_status, subdomain_slug, custom_domain')
          .eq('id', currentClub.clubId)
          .single();

        if (error) throw error;

        // Set website URL
        if (club?.custom_domain) {
          setWebsiteUrl(club.custom_domain);
        } else if (club?.subdomain_slug) {
          setWebsiteUrl(`${club.subdomain_slug}.alfiepro.com.au`);
        } else {
          const fallback = currentClub?.club?.abbreviation?.toLowerCase() || 'yourclub';
          setWebsiteUrl(`${fallback}.alfiepro.com.au`);
        }

        // Set status based on domain configuration
        if (club?.domain_status === 'active' && (club?.subdomain_slug || club?.custom_domain)) {
          setWebsiteStatus('live');
        } else if (club?.domain_status === 'custom' && club?.custom_domain) {
          setWebsiteStatus('live');
        } else {
          setWebsiteStatus('draft');
        }
      }
    } catch (err) {
      console.error('Error loading website status:', err);
      setWebsiteStatus('draft');
      // Fallback URL
      if (currentOrganization) {
        const fallback = currentOrganization.abbreviation?.toLowerCase() || 'yourorg';
        setWebsiteUrl(`${fallback}.alfiepro.com.au`);
      } else {
        const fallback = currentClub?.club?.abbreviation?.toLowerCase() || 'yourclub';
        setWebsiteUrl(`${fallback}.alfiepro.com.au`);
      }
    }
  };

  const loadEventWebsites = async () => {
    try {
      // Get all enabled event websites
      const { data: websites, error } = await supabase
        .from('event_websites')
        .select('*')
        .eq('enabled', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!websites || websites.length === 0) {
        setEventWebsites([]);
        return;
      }

      // Get all event IDs
      const eventIds = websites.map(w => w.event_id).filter(id => id !== null);

      if (eventIds.length === 0) {
        setEventWebsites([]);
        return;
      }

      // Fetch all events
      const { data: allEvents } = await supabase
        .from('public_events')
        .select('id, event_name, date, event_level, venue, club_id, state_association_id, national_association_id')
        .in('id', eventIds);

      // Filter events based on organization or club
      let filteredEventIds: Set<string>;

      if (currentOrganization) {
        if (currentOrganization.type === 'state') {
          // For state associations, get events from clubs in that state
          const { data: clubs } = await supabase
            .from('clubs')
            .select('id')
            .eq('state_association_id', currentOrganization.id);

          const clubIds = new Set(clubs?.map(c => c.id) || []);

          filteredEventIds = new Set(
            allEvents?.filter(e =>
              clubIds.has(e.club_id) || e.state_association_id === currentOrganization.id
            ).map(e => e.id) || []
          );
        } else if (currentOrganization.type === 'national') {
          // For national associations, get events from all clubs in associated states
          const { data: states } = await supabase
            .from('state_associations')
            .select('id')
            .eq('national_association_id', currentOrganization.id);

          const stateIds = new Set(states?.map(s => s.id) || []);

          const { data: clubs } = await supabase
            .from('clubs')
            .select('id')
            .in('state_association_id', Array.from(stateIds));

          const clubIds = new Set(clubs?.map(c => c.id) || []);

          filteredEventIds = new Set(
            allEvents?.filter(e =>
              clubIds.has(e.club_id) ||
              stateIds.has(e.state_association_id) ||
              e.national_association_id === currentOrganization.id
            ).map(e => e.id) || []
          );
        } else {
          filteredEventIds = new Set();
        }
      } else if (currentClub) {
        // Filter by club
        filteredEventIds = new Set(
          allEvents?.filter(e => e.club_id === currentClub.clubId).map(e => e.id) || []
        );
      } else {
        filteredEventIds = new Set();
      }

      // Create event map for quick lookup
      const eventMap = new Map(allEvents?.map(e => [e.id, e]) || []);

      // Filter and enrich websites
      const enrichedWebsites = websites
        .filter(w => filteredEventIds.has(w.event_id))
        .slice(0, 4)
        .map(w => ({
          ...w,
          public_events: eventMap.get(w.event_id) || null
        }));

      setEventWebsites(enrichedWebsites);
    } catch (err) {
      console.error('Error loading event websites:', err);
      setEventWebsites([]);
    }
  };

  const loadActivityFeed = async () => {
    try {
      const orgId = currentOrganization?.id || currentClub?.clubId;
      if (!orgId) {
        setActivityFeed([]);
        return;
      }

      const { data: activityData, error: activityError } = await supabase
        .from('website_activity_log')
        .select('*')
        .eq('club_id', orgId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (activityError || !activityData) {
        setActivityFeed([]);
        return;
      }

      const userIds = [...new Set(activityData.map(item => item.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      const formattedData = activityData.map(item => {
        const profile = item.user_id ? profileMap.get(item.user_id) : null;
        return {
          id: item.id,
          action: item.action,
          page: item.entity_name,
          user: profile ? `${profile.first_name} ${profile.last_name}` : 'System',
          timestamp: new Date(item.created_at),
          avatarUrl: profile?.avatar_url || null
        };
      });

      setActivityFeed(formattedData);
    } catch (err) {
      console.error('Error loading activity feed:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      const orgId = currentOrganization?.id || currentClub?.clubId;
      if (!orgId) return;

      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { count: uniqueVisitorsCount } = await supabase
        .from('website_analytics')
        .select('visitor_id', { count: 'exact', head: false })
        .eq('club_id', orgId)
        .gte('created_at', last30Days.toISOString());

      const { count: pageViewsCount } = await supabase
        .from('website_analytics')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', orgId)
        .gte('created_at', last30Days.toISOString());

      const { data: durationData } = await supabase
        .from('website_analytics')
        .select('duration')
        .eq('club_id', orgId)
        .gte('created_at', last30Days.toISOString())
        .gt('duration', 0);

      let avgTime = '0m 0s';
      if (durationData && durationData.length > 0) {
        const totalDuration = durationData.reduce((sum, item) => sum + (item.duration || 0), 0);
        const avgSeconds = Math.floor(totalDuration / durationData.length);
        const minutes = Math.floor(avgSeconds / 60);
        const seconds = avgSeconds % 60;
        avgTime = `${minutes}m ${seconds}s`;
      }

      const { data: topPageData } = await supabase
        .from('website_analytics')
        .select('page_path')
        .eq('club_id', orgId)
        .gte('created_at', last30Days.toISOString());

      let topPage = '-';
      if (topPageData && topPageData.length > 0) {
        const pageCounts = topPageData.reduce((acc: any, item) => {
          acc[item.page_path] = (acc[item.page_path] || 0) + 1;
          return acc;
        }, {});
        const topPagePath = Object.keys(pageCounts).reduce((a, b) =>
          pageCounts[a] > pageCounts[b] ? a : b
        );
        topPage = topPagePath.replace('/', '') || 'Homepage';
      }

      const uniqueVisitors = uniqueVisitorsCount || 0;

      setAnalytics({
        pageViews: pageViewsCount || 0,
        uniqueVisitors,
        averageTimeOnSite: avgTime,
        topPage
      });
    } catch (err) {
      console.error('Error loading analytics:', err);
    }
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';

    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';

    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';

    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';

    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';

    return Math.floor(seconds) + ' seconds ago';
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created':
        return darkMode ? 'text-green-400' : 'text-green-600';
      case 'updated':
        return darkMode ? 'text-blue-400' : 'text-blue-600';
      case 'published':
        return darkMode ? 'text-purple-400' : 'text-purple-600';
      case 'deleted':
        return darkMode ? 'text-red-400' : 'text-red-600';
      default:
        return darkMode ? 'text-slate-400' : 'text-slate-600';
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Main Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Globe className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Website Management</h1>
            <p className="text-slate-400">
              Manage your club website and event websites all in one place
            </p>
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-8 mb-8">

          {/* LEFT SIDE - Club Website (3 columns) */}
          <div className="xl:col-span-3 space-y-6">
            <div className={`
              rounded-2xl border backdrop-blur-sm overflow-hidden
              ${darkMode
                ? 'bg-gradient-to-br from-slate-800/50 to-slate-800/30 border-slate-700/50'
                : 'bg-white/10 border-slate-200/20'}
            `}>
              {/* Club Website Header */}
              <div className="p-6 border-b border-slate-700/50 bg-gradient-to-r from-blue-600/10 to-cyan-600/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/20">
                      <Layout size={24} className="text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Club Website</h2>
                      <p className="text-sm text-slate-400">Your main public-facing website</p>
                    </div>
                  </div>
                  <div className={`
                    px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2
                    ${websiteStatus === 'live'
                      ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-600/30'
                      : websiteStatus === 'draft'
                        ? 'bg-amber-900/30 text-amber-400 border border-amber-600/30'
                        : 'bg-red-900/30 text-red-400 border border-red-600/30'}
                  `}>
                    <div className={`w-2 h-2 rounded-full ${websiteStatus === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    {websiteStatus === 'live' ? 'Live' : websiteStatus === 'draft' ? 'Draft' : 'Offline'}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-3 rounded-lg bg-slate-800/50">
                    <div className="text-2xl font-bold text-blue-400">{analytics.pageViews}</div>
                    <div className="text-xs text-slate-400 mt-1">Page Views</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-800/50">
                    <div className="text-2xl font-bold text-cyan-400">{analytics.uniqueVisitors}</div>
                    <div className="text-xs text-slate-400 mt-1">Visitors</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-800/50">
                    <div className="text-lg font-bold text-green-400">{analytics.averageTimeOnSite}</div>
                    <div className="text-xs text-slate-400 mt-1">Avg. Time</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-800/50">
                    <div className="flex items-center justify-center">
                      <TrendingUp size={20} className="text-emerald-400" />
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Analytics</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions Grid - Moved up */}
              <div className="p-6 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <Zap size={16} className="text-blue-400" />
                  Quick Actions
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => navigate('/website/homepage')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-blue-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-600/20">
                        <Image size={18} className="text-blue-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Homepage</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/website/theme')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-amber-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-amber-600/20">
                        <Palette size={18} className="text-amber-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Theme</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/website/navigation')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-purple-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-purple-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-purple-600/20">
                        <Navigation size={18} className="text-purple-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Navigation</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/website/pages')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-green-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-green-600/20">
                        <FileText size={18} className="text-green-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Pages</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/website/pages/edit/home')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-blue-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-blue-600/20">
                        <Edit size={18} className="text-blue-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Edit Home</span>
                    </div>
                  </button>

                  <button
                    onClick={() => navigate('/website/analytics')}
                    className={`
                      p-4 rounded-lg border text-center transition-all hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/20
                      ${darkMode
                        ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-cyan-500/50'
                        : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2 rounded-lg bg-cyan-600/20">
                        <BarChart2 size={18} className="text-cyan-400" />
                      </div>
                      <span className="text-sm font-medium text-white">Analytics</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Domain Management Section */}
              <div className="p-6 bg-slate-800/30">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Domain Management</h3>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Website URL</p>
                    <a
                      href={`https://${websiteUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 transition-colors font-medium text-sm flex items-center gap-2"
                    >
                      {websiteUrl}
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a
                    href={
                      websiteStatus === 'live'
                        ? `https://${websiteUrl}`
                        : currentOrganization
                          ? `/${currentOrganization.type === 'state' ? 'state' : 'national'}/${currentOrganization.id}/public`
                          : `/club/${currentClub?.club?.id}/public`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30 transition-all border border-blue-500/30 font-medium text-sm"
                  >
                    <Eye size={16} />
                    Preview Website
                  </a>
                  <button
                    onClick={() => navigate('/website/settings')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm border border-slate-600/50"
                  >
                    <Settings size={16} />
                    Settings
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className={`
              p-6 rounded-2xl border backdrop-blur-sm
              ${darkMode
                ? 'bg-slate-800/30 border-slate-700/50'
                : 'bg-white/10 border-slate-200/20'}
            `}>
              <div className="flex items-center gap-2 mb-4">
                <Activity size={20} className="text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
              </div>

              <div className="space-y-3">
                {activityFeed.slice(0, 4).map(activity => (
                  <div
                    key={activity.id}
                    className={`
                      p-4 rounded-lg border
                      ${darkMode
                        ? 'bg-slate-700/30 border-slate-600/30'
                        : 'bg-white/5 border-slate-200/10'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {activity.avatarUrl ? (
                        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                          <img
                            src={activity.avatarUrl}
                            alt={activity.user}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                          {activity.user.split(' ').map(n => n[0]).join('')}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">
                          <span className="font-medium">{activity.user}</span>{' '}
                          <span className={getActionColor(activity.action)}>{activity.action}</span>{' '}
                          <span className="text-blue-400">"{activity.page}"</span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT SIDE - Event Websites (2 columns) */}
          <div className="xl:col-span-2">
            <div className={`
              rounded-2xl border backdrop-blur-sm overflow-hidden
              ${darkMode
                ? 'bg-gradient-to-br from-cyan-900/20 to-slate-800/30 border-cyan-700/30'
                : 'bg-white/10 border-slate-200/20'}
            `}>
              {/* Event Websites Header */}
              <div className="p-6 border-b border-cyan-700/30 bg-gradient-to-r from-cyan-600/10 to-blue-600/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-600/20">
                      <Trophy size={24} className="text-cyan-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Event Websites</h2>
                      <p className="text-sm text-slate-400">Dedicated sites for major events</p>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-cyan-600/20 text-cyan-400 text-sm font-medium">
                    {eventWebsites.length} Active
                  </div>
                </div>

                <button
                  onClick={() => navigate('/website/event-websites-management')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/30 transition-all hover:scale-[1.02] font-medium"
                >
                  <Plus size={18} />
                  Manage Event Websites
                </button>
              </div>

              {/* Event Websites List */}
              <div className="p-6">
                {eventWebsites.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-600/20 flex items-center justify-center">
                      <Trophy size={28} className="text-cyan-400" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-white">No Event Websites</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Create dedicated websites for state and national events
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eventWebsites.map((website) => {
                      const event = website.public_events;
                      return (
                        <div
                          key={website.id}
                          className={`
                            p-4 rounded-lg border transition-all hover:scale-[1.02] cursor-pointer
                            ${darkMode
                              ? 'bg-slate-800/50 border-slate-700/50 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/20'
                              : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                          `}
                          onClick={() => navigate(`/website/event-websites/${website.id}`)}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h4 className="font-semibold text-white mb-1">
                                {event?.event_name || 'Untitled Event'}
                              </h4>
                              {event?.event_level && (
                                <span className="inline-block px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-medium capitalize">
                                  {event.event_level}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(`/events/${website.slug}`, '_blank');
                                }}
                                className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/website/event-websites/${website.id}`);
                                }}
                                className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                              >
                                <Edit size={16} />
                              </button>
                            </div>
                          </div>
                          {event && (
                            <div className="space-y-1 text-xs text-slate-400">
                              {event.date && (
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={12} />
                                  <span>{new Date(event.date).toLocaleDateString()}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {eventWebsites.length > 0 && (
                  <button
                    onClick={() => navigate('/website/event-websites-management')}
                    className="w-full mt-4 px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors font-medium"
                  >
                    View All Event Websites →
                  </button>
                )}
              </div>

              {/* Event Website Features */}
              <div className="p-6 border-t border-cyan-700/30 bg-cyan-900/10">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Sparkles size={16} className="text-cyan-400" />
                  Event Website Features
                </h3>
                <div className="space-y-2 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Registration & Payment Processing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Live Results & Leaderboards</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Competitor Information</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Media Gallery & News</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsiteOverview;
