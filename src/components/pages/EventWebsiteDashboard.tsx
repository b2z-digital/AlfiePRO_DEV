import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, Eye, Settings, FileText, Image, Trophy, Users, Newspaper, ChartBar as BarChart3, ExternalLink, Loader as Loader2, CircleCheck as CheckCircle, CircleAlert as AlertCircle, X, CreditCard as Edit, Plus, Trash2, Menu, MapPin, Link2, Search, Calendar } from 'lucide-react';
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
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

type TabType = 'overview' | 'navigation' | 'pages' | 'sponsors' | 'media' | 'competitors' | 'news' | 'accommodations' | 'analytics' | 'settings';

interface EventWebsiteDashboardProps {
  darkMode: boolean;
}

export const EventWebsiteDashboard: React.FC<EventWebsiteDashboardProps> = ({ darkMode }) => {
  const { websiteId } = useParams<{ websiteId: string }>();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [website, setWebsite] = useState<EventWebsite | null>(null);
  const [settings, setSettings] = useState<EventWebsiteSettings | null>(null);
  const [eventName, setEventName] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLinkEventModal, setShowLinkEventModal] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const [linkingEvent, setLinkingEvent] = useState(false);
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

      const { data: websiteData, error } = await supabase
        .from('event_websites')
        .select('*')
        .or(`id.eq.${websiteId},event_id.eq.${websiteId}`)
        .maybeSingle();

      if (error || !websiteData) {
        console.error('Error loading website:', error);
        navigate('/event-websites');
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
      const derivedName = websiteData.public_events?.event_name
        || websiteData.website_name
        || websiteData.slug?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        || 'Event Website';
      setEventName(derivedName);

      Promise.all([
        eventWebsiteStorage.getEventWebsiteSettings(websiteData.id)
          .then(settingsData => setSettings(settingsData))
          .catch(err => console.error('Error loading settings:', err)),
        loadStats(websiteData.id)
      ]);
    } catch (error) {
      console.error('Error loading website data:', error);
      navigate('/event-websites');
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

  const isOrphaned = website && !website.public_events;

  const loadAvailableEvents = async () => {
    try {
      setLoadingEvents(true);
      const { data: events, error } = await supabase
        .from('public_events')
        .select('id, event_name, date, end_date, event_level, venue')
        .order('date', { ascending: false });

      if (error) throw error;
      setAvailableEvents(events || []);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleOpenLinkModal = () => {
    setEventSearchTerm('');
    setShowLinkEventModal(true);
    loadAvailableEvents();
  };

  const handleLinkEvent = async (eventId: string) => {
    if (!website) return;
    try {
      setLinkingEvent(true);
      const { error } = await supabase
        .from('event_websites')
        .update({ event_id: eventId })
        .eq('id', website.id);

      if (error) throw error;

      addNotification('success', 'Event linked successfully');
      setShowLinkEventModal(false);
      loadWebsiteData();
    } catch (err) {
      console.error('Error linking event:', err);
      addNotification('error', 'Failed to link event');
    } finally {
      setLinkingEvent(false);
    }
  };

  const filteredLinkEvents = availableEvents.filter(event => {
    const name = event.event_name || '';
    const venue = event.venue || '';
    return name.toLowerCase().includes(eventSearchTerm.toLowerCase()) ||
           venue.toLowerCase().includes(eventSearchTerm.toLowerCase());
  });

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
            onClick={() => navigate('/event-websites')}
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
              {!isOrphaned && website.event_id && (
                <button
                  onClick={() => {
                    navigate(`/event-command-center/${website.event_id}`);
                  }}
                  className="btn-primary-green flex items-center gap-2 px-6 py-3 from-blue-600 to-cyan-600 text-white rounded-xl hover:shadow-lg transition-all hover:scale-[1.02] font-medium"
                >
                  <Menu size={18} />
                  Task Manager
                </button>
              )}
              {isOrphaned && (
                <button
                  onClick={handleOpenLinkModal}
                  className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl hover:shadow-lg transition-all hover:scale-[1.02] font-medium"
                >
                  <Link2 size={18} />
                  Link to Event
                </button>
              )}
              {website.enabled && (
                <a
                  href={getSiteUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 text-white rounded-xl hover:shadow-lg transition-all hover:scale-[1.02] font-medium"
                >
                  <Eye size={18} />
                  View Website
                  <ExternalLink size={14} />
                </a>
              )}
              <button
                onClick={() => navigate('/event-websites')}
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

        {/* Orphaned Website Banner */}
        {isOrphaned && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between ${
            darkMode
              ? 'bg-amber-900/20 border-amber-600/30'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-3">
              <AlertCircle className="text-amber-500 flex-shrink-0" size={20} />
              <div>
                <p className={`font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                  This website is not linked to an event
                </p>
                <p className={`text-sm ${darkMode ? 'text-amber-400/70' : 'text-amber-600'}`}>
                  Some features (media, competitors, news) require a linked event. Link this website to an event to unlock all features.
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenLinkModal}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Link2 size={16} />
              Link to Event
            </button>
          </div>
        )}

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
            !isOrphaned && website.event_id ? (
              <EventWebsiteMediaManager websiteId={website.id} eventId={website.event_id} />
            ) : (
              <NoLinkedEventMessage darkMode={darkMode} feature="Media" onLink={handleOpenLinkModal} />
            )
          )}

          {activeTab === 'competitors' && website && (
            !isOrphaned && website.event_id ? (
              <EventWebsiteCompetitorManager websiteId={website.id} eventId={website.event_id} />
            ) : (
              <NoLinkedEventMessage darkMode={darkMode} feature="Competitors" onLink={handleOpenLinkModal} />
            )
          )}

          {activeTab === 'news' && website && (
            !isOrphaned && website.event_id ? (
              <EventWebsiteNewsManager websiteId={website.id} eventId={website.event_id} />
            ) : (
              <NoLinkedEventMessage darkMode={darkMode} feature="News" onLink={handleOpenLinkModal} />
            )
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
      {showSettingsModal && website && website.event_id && (
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

      {/* Link to Event Modal */}
      {showLinkEventModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col ${
            darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
          } shadow-2xl`}>
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-600/20">
                    <Link2 size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Link to Event
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Connect this website to an event to enable all features
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLinkEventModal(false)}
                  className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={eventSearchTerm}
                  onChange={(e) => setEventSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
                  } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingEvents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-cyan-500" size={32} />
                </div>
              ) : filteredLinkEvents.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className={`mx-auto mb-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={40} />
                  <p className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    {eventSearchTerm ? 'No matching events found' : 'No events found'}
                  </p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {eventSearchTerm ? 'Try adjusting your search' : 'Create an event in Race Management first'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLinkEvents.map(event => (
                    <button
                      key={event.id}
                      onClick={() => handleLinkEvent(event.id)}
                      disabled={linkingEvent}
                      className={`w-full text-left p-4 rounded-lg border transition-all ${
                        darkMode
                          ? 'bg-slate-700/30 border-slate-700 hover:border-cyan-500/50 hover:bg-slate-700/60'
                          : 'bg-white border-slate-200 hover:border-cyan-400 hover:bg-cyan-50'
                      } ${linkingEvent ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {event.event_name || 'Untitled Event'}
                          </h4>
                          <div className={`flex items-center gap-3 mt-1.5 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {event.date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={13} />
                                {new Date(event.date).toLocaleDateString()}
                                {event.end_date && event.end_date !== event.date && (
                                  <> - {new Date(event.end_date).toLocaleDateString()}</>
                                )}
                              </span>
                            )}
                            {event.venue && (
                              <span className="flex items-center gap-1">
                                <MapPin size={13} />
                                <span className="truncate max-w-[200px]">{event.venue}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        {event.event_level && (
                          <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                            event.event_level === 'national'
                              ? 'bg-amber-500/20 text-amber-400'
                              : event.event_level === 'state'
                                ? 'bg-cyan-500/20 text-cyan-400'
                                : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {event.event_level}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NoLinkedEventMessage: React.FC<{ darkMode: boolean; feature: string; onLink: () => void }> = ({ darkMode, feature, onLink }) => (
  <div className={`text-center py-16 rounded-xl border ${
    darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-white border-slate-200'
  }`}>
    <Link2 className={`mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={48} />
    <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
      No Linked Event
    </h3>
    <p className={`mb-6 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
      {feature} management requires a linked event. Connect this website to an event to manage {feature.toLowerCase()}.
    </p>
    <button
      onClick={onLink}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
    >
      <Link2 size={16} />
      Link to Event
    </button>
  </div>
);
