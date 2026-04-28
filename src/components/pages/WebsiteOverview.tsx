import React, { useState, useEffect } from 'react';
import { Globe, CreditCard as Edit, Plus, Eye, ArrowUpRight, Activity, Users, Calendar, ChartBar as BarChart2, Clock, Settings, Palette, FileText, Image, TrendingUp, ExternalLink, Zap, Rocket, LayoutGrid as Layout, Navigation } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = currentOrganization?.id || currentClub?.clubId;
    if (orgId) {
      loadWebsiteStatus();
      loadActivityFeed();
      loadAnalytics();
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
              Manage your club's public-facing website
            </p>
          </div>
        </div>

        {/* Club Website Section */}
        <div className="mb-8">
          <div className="space-y-6">
            <div className={`
              rounded-2xl border backdrop-blur-sm overflow-hidden
              ${darkMode
                ? 'bg-gradient-to-br from-slate-800/50 to-slate-800/30 border-slate-700/50'
                : 'bg-white/10 border-slate-200/20'}
            `}>
              {/* Club Website Header */}
              <div className="p-6 border-b border-slate-700/50 from-blue-600/10 to-cyan-600/10">
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

        </div>
      </div>
    </div>
  );
};

export default WebsiteOverview;
