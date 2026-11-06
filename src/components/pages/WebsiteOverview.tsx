import React, { useState, useEffect } from 'react';
import { Globe, SquarePen as Edit, Eye, ArrowUpRight, Activity, ChartBar as BarChart2, Settings, Palette, FileText, Image, ExternalLink, Navigation } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
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

  const previewHref = websiteStatus === 'live'
    ? `https://${websiteUrl}`
    : currentOrganization
      ? `/${currentOrganization.type === 'state' ? 'state' : 'national'}/${currentOrganization.id}/public`
      : `/club/${currentClub?.club?.id}/public`;
  const cover = (currentClub as any)?.club?.cover_image_url as string | undefined;
  const orgName = currentOrganization?.name || currentClub?.club?.name || 'Your club';
  const statusTone = websiteStatus === 'live' ? 'g' : websiteStatus === 'draft' ? 'a' : 'r';
  const ACTION_TONE: Record<string, string> = { created: 'a-txt-g', updated: 'a-txt-b', published: 'a-txt-v', deleted: 'a-txt-r' };
  const quick = [
    { label: 'Homepage', sub: 'Carousel slides and quick link tiles', icon: <Image size={20} />, to: '/website/homepage' },
    { label: 'Theme', sub: 'Colours, fonts and logo', icon: <Palette size={20} />, to: '/website/theme' },
    { label: 'Navigation', sub: 'Menu items and order', icon: <Navigation size={20} />, to: '/website/navigation' },
    { label: 'Pages', sub: 'Create and edit pages', icon: <FileText size={20} />, to: '/website/pages' },
    { label: 'Edit home', sub: 'Edit homepage content', icon: <Edit size={20} />, to: '/website/pages/edit/home' },
    { label: 'Analytics', sub: 'Traffic and visitor insights', icon: <BarChart2 size={20} />, to: '/website/analytics' },
  ];
  const stat = (cap: string, value: React.ReactNode) => (
    <div className="a-mini-stat">
      <p className="a-cap" style={{ fontSize: 10 }}>{cap}</p>
      <div className="a-num a-ink text-[24px] font-semibold mt-1.5 leading-none">{value}</div>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Globe size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Website management</h1>
            <p className="a-mute mt-1 text-[14.5px]">Manage your club’s public-facing website</p>
          </div>
        </div>

        <div className="a-card a-spec-card overflow-hidden grid grid-cols-1 lg:grid-cols-[1.1fr_1fr]" style={{ padding: 0 }}>
          <div className="a-browser relative" style={{ minHeight: 290, margin: 14 }}>
            <div className="a-browser-bar">
              <span style={{ background: '#FF6B6B' }} /><span style={{ background: '#FFB340' }} /><span style={{ background: '#30D158' }} />
              <span className="a-dim flex-1 text-center text-[11.5px] truncate">{websiteUrl || 'your-club.alfiepro.com'}</span>
            </div>
            <div className="absolute left-0 right-0 bottom-0" style={{ top: 30, background: cover ? `url(${cover}) center/cover` : 'linear-gradient(135deg, #2E7BFF 0%, #8A4DFF 60%, #FF3E9A 100%)' }} />
            <div className="absolute left-0 right-0 bottom-0" style={{ top: 30, background: 'linear-gradient(180deg, rgba(6,11,22,0.1), rgba(6,11,22,0.75))' }} />
            <div className="absolute" style={{ left: 22, bottom: 20, right: 22 }}>
              <div className="a-display text-[26px] font-bold" style={{ color: '#fff' }}>{orgName}</div>
              <div className="text-[13px] mt-1" style={{ color: 'rgba(235,240,255,0.75)' }}>Public website preview</div>
            </div>
          </div>
          <div className="flex flex-col gap-[18px]" style={{ padding: '26px 26px 22px 12px' }}>
            <div className="flex items-center justify-between">
              <p className="a-cap">Club website</p>
              <span className={`a-status-pill a-status-${statusTone}`}><span className={`a-light a-light-${statusTone}`} />{websiteStatus === 'live' ? 'Live' : websiteStatus === 'draft' ? 'Draft' : 'Offline'}</span>
            </div>
            <div>
              <div className="a-display a-ink text-[24px] font-semibold">Your main public-facing website</div>
              {websiteUrl && (
                <a href={`https://${websiteUrl}`} target="_blank" rel="noopener noreferrer" className="a-txt-b inline-flex items-center gap-1.5 mt-2 text-[14px] break-all">
                  {websiteUrl}<ExternalLink size={14} />
                </a>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {stat('Page views', analytics.pageViews)}
              {stat('Visitors', analytics.uniqueVisitors)}
              {stat('Avg. time', analytics.averageTimeOnSite)}
            </div>
            <div className="flex gap-2.5 mt-auto flex-wrap">
              <a href={previewHref} target="_blank" rel="noopener noreferrer" className="a-btn a-btn-p flex-1 justify-center" style={{ height: 44 }}>
                <Eye size={17} />Preview website
              </a>
              <button onClick={() => navigate('/website/analytics')} className="a-btn" style={{ height: 44 }}>
                <BarChart2 size={17} />Analytics
              </button>
              <button onClick={() => navigate('/website/settings')} className="a-btn" style={{ height: 44 }} aria-label="Website settings">
                <Settings size={17} />Settings
              </button>
            </div>
          </div>
        </div>

        <div>
          <p className="a-cap mb-2.5">Quick actions</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {quick.map(q => (
              <button key={q.label} onClick={() => navigate(q.to)} className="a-qa text-left">
                <span className="a-tile" style={{ width: 44, height: 44 }}>{q.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[15px] font-semibold">{q.label}</div>
                  <div className="a-dim text-[12.5px] mt-0.5">{q.sub}</div>
                </div>
                <ArrowUpRight size={16} className="a-dim" />
              </button>
            ))}
          </div>
        </div>

        <div className="a-card flex flex-col gap-[18px]" style={{ padding: 22 }}>
          <div className="flex items-center gap-3">
            <span className="a-tile a-tile-sm"><Activity size={16} /></span>
            <h2 className="a-display a-ink flex-1 m-0 text-[18px] font-semibold">Recent activity</h2>
          </div>
          {activityFeed.length === 0 ? (
            <p className="a-dim text-[13.5px]">No website changes yet.</p>
          ) : (
            <div>
              {activityFeed.slice(0, 4).map((activity, i, arr) => {
                const [first, ...rest] = (activity.user || '?').split(' ');
                return (
                  <div key={activity.id} className="flex gap-3.5 relative" style={{ paddingBottom: i < arr.length - 1 ? 18 : 0 }}>
                    {i < arr.length - 1 && <span className="a-tl-line" style={{ left: 15, top: 34 }} />}
                    <AAvatar url={activity.avatarUrl} first={first} last={rest.join(' ')} size={32} />
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="a-ink text-[14px]">
                        <b className="font-semibold">{activity.user}</b>{' '}
                        <span className={ACTION_TONE[activity.action] || 'a-mute'}>{activity.action}</span> page{' '}
                        <span className="font-semibold">“{activity.page}”</span>
                      </div>
                      <div className="a-dim text-[12px] mt-[3px]">{formatTimeAgo(activity.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebsiteOverview;
