import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, Eye, Settings, FileText, Image, Trophy, Users, Newspaper, BarChart3, ExternalLink, Loader2, CheckCircle, AlertCircle, X, Edit, Plus, Trash2, Menu, MapPin } from 'lucide-react';
import type { EventWebsite, EventWebsiteSettings } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { EventWebsitePageManager } from '../events/EventWebsitePageManager';
import { EventWebsiteSponsorManager } from '../events/EventWebsiteSponsorManager';
import { EventWebsiteMediaManager } from '../events/EventWebsiteMediaManager';
import { EventWebsiteCompetitorManager } from '../events/EventWebsiteCompetitorManager';
import { EventWebsiteNewsManager } from '../events/EventWebsiteNewsManager';
import { EventWebsiteAnalytics } from '../events/EventWebsiteAnalytics';
import { EventWebsiteSettingsModal } from '../events/EventWebsiteSettingsModal';
import { EventWebsiteGlobalSectionsManager } from '../events/EventWebsiteGlobalSectionsManager';
import { EventWebsiteAccommodationManager } from '../events/EventWebsiteAccommodationManager';
import { EnhancedDomainManagementSection } from '../settings/EnhancedDomainManagementSection';

type TabType = 'overview' | 'navigation' | 'pages' | 'sponsors' | 'media' | 'competitors' | 'news' | 'accommodations' | 'analytics' | 'settings';

interface EventWebsiteDashboardProps {
  darkMode: boolean;
}

export const EventWebsiteDashboard: React.FC<EventWebsiteDashboardProps> = ({ darkMode }) => {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
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

      // Fetch website data
      const { supabase } = await import('../../utils/supabase');
      const { data: websiteData, error } = await supabase
        .from('event_websites')
        .select('*')
        .or(`id.eq.${websiteId},event_id.eq.${websiteId}`)
        .maybeSingle();

      if (error || !websiteData) {
        console.error('Error loading website:', error);
        navigate('/website/event-websites-management');
        return;
      }

      // Fetch associated event data separately
      if (websiteData.event_id) {
        const { data: eventData } = await supabase
          .from('public_events')
          .select('id, event_name, date, event_level, venue')
          .eq('id', websiteData.event_id)
          .maybeSingle();

        // Attach event data to website object
        if (eventData) {
          (websiteData as any).public_events = eventData;
        }
      }

      console.log('EventWebsiteDashboard - Website data loaded:', {
        id: websiteData.id,
        event_id: websiteData.event_id,
        slug: websiteData.slug,
        custom_domain: websiteData.custom_domain
      });
      setWebsite(websiteData);
      setEventName(websiteData.public_events?.event_name || 'Event Website');

      Promise.all([
        eventWebsiteStorage.getEventWebsiteSettings(websiteData.id)
          .then(settingsData => setSettings(settingsData))
          .catch(err => console.error('Error loading settings:', err)),
        loadStats(websiteData.id)
      ]);
    } catch (error) {
      console.error('Error loading website data:', error);
      navigate('/website/event-websites-management');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (websiteId: string) => {
    try {
      const [pages, sponsors, media, competitors, news] = await Promise.all([
        eventWebsiteStorage.getEventWebsitePages(websiteId).catch(() => []),
        eventWebsiteStorage.getEventSponsors(websiteId).catch(() => []),
        eventWebsiteStorage.getEventWebsiteMedia(websiteId).catch(() => []),
        eventWebsiteStorage.getEventWebsiteCompetitors(websiteId).catch(() => []),
        eventWebsiteStorage.getEventWebsiteNews(websiteId).catch(() => [])
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

    // Debug: log the website data
    console.log('Page EventWebsiteDashboard - getSiteUrl:', {
      custom_domain: website.custom_domain,
      slug: website.slug,
      full_url: website.custom_domain ? `https://${website.custom_domain}` : `${window.location.origin}/events/${website.slug}`
    });

    if (website.custom_domain) {
      return `https://${website.custom_domain}`;
    }
    return `${window.location.origin}/events/${website.slug}`;
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: BarChart3 },
    { id: 'navigation' as TabType, label: 'Navigation', icon: Menu },
    { id: 'pages' as TabType, label: 'Pages', icon: FileText },
    { id: 'sponsors' as TabType, label: 'Sponsors', icon: Trophy },
    { id: 'media' as TabType, label: 'Media', icon: Image },
    { id: 'competitors' as TabType, label: 'Competitors', icon: Users },
    { id: 'news' as TabType, label: 'News', icon: Newspaper },
    { id: 'accommodations' as TabType, label: 'Accommodations', icon: MapPin },
    { id: 'analytics' as TabType, label: 'Analytics', icon: BarChart3 },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings }
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading event website...</p>
        </div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Website not found
          </p>
          <button
            onClick={() => navigate('/website/event-websites-management')}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          >
            Back to Event Websites
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Globe className="text-white" size={28} />
              </div>
              <div>
                <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {eventName}
                </h1>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} mt-1`}>
                  Event Website Dashboard
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  console.log('🎯 Task Manager button clicked!', website?.event_id);
                  navigate(`/event-command-center/${website?.event_id}`);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all hover:scale-[1.02] font-medium"
              >
                <Menu size={18} />
                Task Manager
              </button>
              {website.enabled && (
                <a
                  href={getSiteUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all hover:scale-[1.02] font-medium"
                >
                  <Eye size={18} />
                  View Website
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                onClick={() => navigate('/website/event-websites-management')}
                className={`p-3 rounded-xl transition-colors ${
                  darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                }`}
                title="Exit"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex gap-2 mb-8 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'} overflow-x-auto pb-px`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-3 font-medium text-sm transition-all whitespace-nowrap rounded-t-lg
                  ${isActive
                    ? darkMode
                      ? 'bg-cyan-500/10 text-cyan-400 border-b-2 border-cyan-500'
                      : 'bg-cyan-50 text-cyan-600 border-b-2 border-cyan-600'
                    : darkMode
                      ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }
                `}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Status Card */}
              {/* Domain Management */}
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Domain Management
                </h3>
                <EnhancedDomainManagementSection
                  entityType="event"
                  entityId={website.id}
                  entityName={eventName}
                  currentSubdomain={website.slug}
                  currentCustomDomain={website.custom_domain || undefined}
                  onDomainUpdate={loadWebsiteData}
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className={`p-6 rounded-xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Pages
                    </h4>
                    <FileText className="text-cyan-500" size={20} />
                  </div>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {stats.pagesCount}
                  </p>
                </div>

                <div className={`p-6 rounded-xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Sponsors
                    </h4>
                    <Trophy className="text-cyan-500" size={20} />
                  </div>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {stats.sponsorsCount}
                  </p>
                </div>

                <div className={`p-6 rounded-xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Media
                    </h4>
                    <Image className="text-cyan-500" size={20} />
                  </div>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {stats.mediaCount}
                  </p>
                </div>

                <div className={`p-6 rounded-xl border ${
                  darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Visitors
                    </h4>
                    <Eye className="text-cyan-500" size={20} />
                  </div>
                  <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {stats.pageViews}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'navigation' && website && (
            <EventWebsiteGlobalSectionsManager websiteId={website.id} darkMode={darkMode} />
          )}

          {activeTab === 'pages' && website && (
            <EventWebsitePageManager websiteId={website.id} />
          )}

          {activeTab === 'sponsors' && website && (
            <EventWebsiteSponsorManager websiteId={website.id} />
          )}

          {activeTab === 'media' && website && (
            <EventWebsiteMediaManager websiteId={website.id} eventId={website.event_id} />
          )}

          {activeTab === 'competitors' && website && (
            <EventWebsiteCompetitorManager websiteId={website.id} eventId={website.event_id} />
          )}

          {activeTab === 'news' && website && (
            <EventWebsiteNewsManager websiteId={website.id} />
          )}

          {activeTab === 'accommodations' && website && (
            <EventWebsiteAccommodationManager eventWebsiteId={website.id} darkMode={darkMode} />
          )}

          {activeTab === 'analytics' && website && (
            <EventWebsiteAnalytics websiteId={website.id} />
          )}

          {activeTab === 'settings' && website && (
            <div>
              <h3 className={`text-xl font-semibold mb-6 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Domain Management
              </h3>
              <EnhancedDomainManagementSection
                entityType="event"
                entityId={website.id}
                entityName={eventName}
                currentSubdomain={website.slug}
                currentCustomDomain={website.custom_domain || undefined}
                onDomainUpdate={loadWebsiteData}
              />
            </div>
          )}
        </div>
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
