import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Eye, Settings, FileText, Image, Trophy, Users, Newspaper, BarChart3, ExternalLink, Loader2, CheckCircle, AlertCircle, LayoutGrid } from 'lucide-react';
import type { EventWebsite, EventWebsiteSettings } from '../types/eventWebsite';
import { eventWebsiteStorage } from '../utils/eventWebsiteStorage';
import { EventWebsitePageManager } from '../components/events/EventWebsitePageManager';
import { EventWebsiteSponsorManager } from '../components/events/EventWebsiteSponsorManager';
import { EventWebsiteMediaManager } from '../components/events/EventWebsiteMediaManager';
import { EventWebsiteCompetitorManager } from '../components/events/EventWebsiteCompetitorManager';
import { EventWebsiteNewsManager } from '../components/events/EventWebsiteNewsManager';
import { EventWebsiteAnalytics } from '../components/events/EventWebsiteAnalytics';
import { EventWebsiteSettingsModal } from '../components/events/EventWebsiteSettingsModal';

type TabType = 'overview' | 'pages' | 'sponsors' | 'media' | 'competitors' | 'news' | 'analytics' | 'settings';

export const EventWebsiteDashboardPage: React.FC = () => {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const darkMode = localStorage.getItem('lightMode') !== 'true';

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [pageManagerKey, setPageManagerKey] = useState(0);
  const [website, setWebsite] = useState<EventWebsite | null>(null);
  const [settings, setSettings] = useState<EventWebsiteSettings | null>(null);
  const [eventName, setEventName] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [stats, setStats] = useState({
    pageViews: 0,
    uniqueVisitors: 0,
    pagesCount: 0,
    sponsorsCount: 0,
    mediaCount: 0,
    competitorsCount: 0,
    newsCount: 0
  });

  useEffect(() => {
    if (websiteId) {
      loadWebsiteData();
    }
  }, [websiteId]);

  const loadWebsiteData = async () => {
    if (!websiteId) return;

    try {
      setLoading(true);

      // Get website by ID or by public event ID
      const { data: websiteData, error } = await import('../utils/supabase').then(({ supabase }) =>
        supabase
          .from('event_websites')
          .select(`
            *,
            public_events (
              id,
              event_name,
              date,
              event_level,
              venue
            )
          `)
          .or(`id.eq.${websiteId},event_id.eq.${websiteId}`)
          .single()
      );

      if (error) {
        console.error('Error loading website:', error);
        // Navigate back to event websites list if not found
        navigate('/website/event-websites');
        return;
      }

      if (websiteData) {
        console.log('Website data loaded:', { id: websiteData.id, event_id: websiteData.event_id, slug: websiteData.slug });
        setWebsite(websiteData);
        setEventName(websiteData.public_events?.event_name || 'Event Website');

        // Load settings and stats in parallel without blocking
        Promise.all([
          eventWebsiteStorage.getEventWebsiteSettings(websiteData.id)
            .then(settingsData => setSettings(settingsData))
            .catch(err => console.error('Error loading settings:', err)),
          loadStats(websiteData.id, websiteData.event_id)
        ]);
      } else {
        // No website found, navigate back
        navigate('/website/event-websites');
      }
    } catch (error) {
      console.error('Error loading website data:', error);
      navigate('/website/event-websites');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (websiteId: string, eventId?: string) => {
    try {
      const [pages, sponsors, media, competitors, news] = await Promise.all([
        eventWebsiteStorage.getEventWebsitePages(websiteId).catch(err => { console.error('Error loading pages:', err); return []; }),
        eventWebsiteStorage.getEventSponsors(websiteId).catch(err => { console.error('Error loading sponsors:', err); return []; }),
        (async () => {
          if (!eventId) return [];
          const { data } = await import('../utils/supabase').then(({ supabase }) =>
            supabase
              .from('event_media')
              .select('id')
              .eq('event_ref_id', eventId)
              .eq('is_homepage_media', false)
          );
          return data || [];
        })().catch(err => { console.error('Error loading media:', err); return []; }),
        eventWebsiteStorage.getEventWebsiteCompetitors(websiteId).catch(err => { console.error('Error loading competitors:', err); return []; }),
        eventWebsiteStorage.getEventWebsiteNews(websiteId).catch(err => { console.error('Error loading news:', err); return []; })
      ]);

      setStats({
        pageViews: website?.visitor_count || 0,
        uniqueVisitors: website?.visitor_count || 0,
        pagesCount: pages.length,
        sponsorsCount: sponsors.length,
        mediaCount: media.length,
        competitorsCount: competitors.length,
        newsCount: news.length
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const getSiteUrl = () => {
    if (!website) return '';
    if (website.custom_domain) {
      return `https://${website.custom_domain}`;
    }
    return `${window.location.origin}/events/${website.slug}`;
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: BarChart3 },
    { id: 'pages' as TabType, label: 'Pages', icon: FileText },
    { id: 'sponsors' as TabType, label: 'Sponsors', icon: Trophy },
    { id: 'media' as TabType, label: 'Media', icon: Image },
    { id: 'competitors' as TabType, label: 'Competitors', icon: Users },
    { id: 'news' as TabType, label: 'News', icon: Newspaper },
    { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading event website...</p>
        </div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Website not found
          </p>
          <button
            onClick={() => navigate('/website/event-websites')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Back to Event Websites
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
      {/* Header */}
      <div className={`sticky top-0 z-30 border-b ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/website/event-websites')}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Globe className="text-white" size={20} />
                </div>
                <div>
                  <h1 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {eventName}
                  </h1>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Event Website Dashboard
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* DEBUG: Always show button */}
              {console.log('RENDER: website object:', website)}
              {console.log('RENDER: event_id:', website?.event_id)}

              <button
                onClick={() => {
                  alert(`Navigating to: /event-command-center/${website?.event_id}`);
                  navigate(`/event-command-center/${website?.event_id}`);
                }}
                style={{ backgroundColor: '#9333ea' }}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium transition-colors hover:opacity-90"
              >
                <LayoutGrid size={18} />
                Command Center DEBUG
              </button>
              {website.enabled && (
                <a
                  href={getSiteUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Eye size={18} />
                  View Website
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === 'pages') {
                      setPageManagerKey(prev => prev + 1);
                    }
                    setActiveTab(tab.id);
                  }}
                  className={`
                    flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors whitespace-nowrap
                    border-b-2
                    ${isActive
                      ? darkMode
                        ? 'border-blue-500 text-blue-400'
                        : 'border-blue-600 text-blue-600'
                      : darkMode
                        ? 'border-transparent text-slate-400 hover:text-slate-300'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }
                  `}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className={`p-6 rounded-xl border ${
              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Website Status
                  </h3>
                  <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                    Your website is {website.enabled ? 'live and accessible' : 'currently disabled'}
                  </p>
                  {website.enabled && (
                    <a
                      href={getSiteUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      {getSiteUrl()}
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                {website.enabled ? (
                  <CheckCircle className="text-emerald-500" size={32} />
                ) : (
                  <AlertCircle className="text-slate-500" size={32} />
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className={`p-6 rounded-xl border ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Pages
                  </h4>
                  <FileText className="text-blue-500" size={20} />
                </div>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.pagesCount}
                </p>
              </div>

              <div className={`p-6 rounded-xl border ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Sponsors
                  </h4>
                  <Trophy className="text-blue-500" size={20} />
                </div>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.sponsorsCount}
                </p>
              </div>

              <div className={`p-6 rounded-xl border ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Media
                  </h4>
                  <Image className="text-blue-500" size={20} />
                </div>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.mediaCount}
                </p>
              </div>

              <div className={`p-6 rounded-xl border ${
                darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Visitors
                  </h4>
                  <Eye className="text-blue-500" size={20} />
                </div>
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {stats.pageViews}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pages' && website && (
          <EventWebsitePageManager key={pageManagerKey} websiteId={website.id} />
        )}

        {activeTab === 'sponsors' && website && (
          <EventWebsiteSponsorManager websiteId={website.id} />
        )}

        {activeTab === 'media' && website && website.event_id && (
          <EventWebsiteMediaManager websiteId={website.id} eventId={website.event_id} />
        )}

        {activeTab === 'competitors' && website && (
          <EventWebsiteCompetitorManager websiteId={website.id} eventId={website.event_id} />
        )}

        {activeTab === 'news' && website && (
          <EventWebsiteNewsManager websiteId={website.id} />
        )}

        {activeTab === 'analytics' && website && (
          <EventWebsiteAnalytics websiteId={website.id} />
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              <Settings className="inline mr-2" size={18} />
              Configure Website Settings
            </button>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettingsModal && website && (
        <EventWebsiteSettingsModal
          eventId={website.event_id}
          eventName={eventName}
          darkMode={darkMode}
          onClose={() => setShowSettingsModal(false)}
          onSaved={() => {
            loadWebsiteData();
            setShowSettingsModal(false);
          }}
        />
      )}
    </div>
  );
};
