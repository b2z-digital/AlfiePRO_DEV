import React, { useState, useEffect } from 'react';
import { X, Globe, Eye, Settings, FileText, Image, Trophy, Users, Newspaper, BarChart3, ExternalLink, Plus, Loader2, CheckCircle, AlertCircle, Menu, MapPin, BookTemplate, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { EventWebsite, EventWebsiteSettings } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { supabase } from '../../utils/supabase';

import { EventWebsitePageManager } from './EventWebsitePageManager';
import { EventWebsiteSponsorManager } from './EventWebsiteSponsorManager';
import { EventWebsiteMediaManager } from './EventWebsiteMediaManager';
import { EventWebsiteCompetitorManager } from './EventWebsiteCompetitorManager';
import { EventWebsiteNewsManager } from './EventWebsiteNewsManager';
import { EventWebsiteAnalytics } from './EventWebsiteAnalytics';
import { EventWebsiteGlobalSectionsManager } from './EventWebsiteGlobalSectionsManager';
import { EventWebsiteAccommodationManager } from './EventWebsiteAccommodationManager';
import { EnhancedDomainManagementSection } from '../settings/EnhancedDomainManagementSection';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';

interface EventWebsiteDashboardProps {
  eventId: string;
  eventName: string;
  onClose: () => void;
}

type TabType = 'overview' | 'navigation' | 'pages' | 'sponsors' | 'media' | 'competitors' | 'news' | 'accommodations' | 'analytics' | 'settings';

export const EventWebsiteDashboard: React.FC<EventWebsiteDashboardProps> = ({
  eventId,
  eventName,
  onClose
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [website, setWebsite] = useState<EventWebsite | null>(null);
  const [settings, setSettings] = useState<EventWebsiteSettings | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
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
    loadWebsiteData();
  }, [eventId]);

  const loadWebsiteData = async () => {
    try {
      setLoading(true);
      const [websiteData, settingsData] = await Promise.all([
        eventWebsiteStorage.getEventWebsite(eventId),
        eventWebsiteStorage.getEventWebsite(eventId).then(w =>
          w ? eventWebsiteStorage.getEventWebsiteSettings(w.id) : null
        )
      ]);

      if (websiteData) {
        setWebsite(websiteData);
        setSettings(settingsData);
        await loadStats(websiteData.id);
      }
    } catch (error) {
      console.error('Error loading website data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (websiteId: string) => {
    try {
      const [pages, sponsors, competitors, news] = await Promise.all([
        eventWebsiteStorage.getEventWebsitePages(websiteId),
        eventWebsiteStorage.getEventSponsors(websiteId),
        eventWebsiteStorage.getEventWebsiteCompetitors(websiteId),
        eventWebsiteStorage.getEventWebsiteNews(websiteId)
      ]);

      // Fetch media count from event_media table
      const { count: mediaCount } = await supabase
        .from('event_media')
        .select('*', { count: 'exact', head: true })
        .eq('event_ref_id', eventId)
        .eq('is_homepage_media', false);

      setStats({
        pageViews: website?.visitor_count || 0,
        uniqueVisitors: website?.visitor_count || 0,
        pagesCount: pages.length,
        sponsorsCount: sponsors.length,
        mediaCount: mediaCount || 0,
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
    console.log('EventWebsiteDashboard - getSiteUrl:', {
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
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          <p className="text-slate-300 mt-4">Loading event website...</p>
        </div>
      </div>
    );
  }

  if (!website) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white text-center mb-2">Website Not Found</h3>
          <p className="text-slate-300 text-center mb-6">
            This event doesn't have a website yet. Please enable it in the settings first.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden">
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Globe className="text-purple-400" size={28} />
              <div>
                <h2 className="text-2xl font-bold text-white">{website?.website_name || eventName}</h2>
                <p className="text-sm text-slate-400 mt-1">Event Website Dashboard</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSaveTemplateModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <BookTemplate size={18} />
              Save as Template
            </button>
            <button
              onClick={() => {
                console.log('🎯 Task Manager button clicked!', eventId);
                navigate(`/event-command-center/${eventId}`);
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              style={{ border: '3px solid yellow' }}
            >
              <LayoutGrid size={18} />
              Task Manager
            </button>
            <button
              onClick={() => window.open(getSiteUrl(), '_blank')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Eye size={18} />
              View Website
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700 bg-slate-900/50">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-purple-400 border-b-2 border-purple-400'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Draft Preview Banner */}
              {!website.website_published && (
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-2 border-blue-500/50 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <Eye className="w-8 h-8 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2">Preview Your Draft Website</h3>
                      <p className="text-slate-300 mb-4">
                        Your event website is in draft mode. Preview it before publishing to a custom domain.
                      </p>
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 mb-4">
                        <div className="text-xs text-slate-400 mb-1">Draft Preview URL:</div>
                        <div className="flex items-center gap-2">
                          <code className="text-blue-400 font-mono text-sm flex-1">
                            {window.location.origin}/events/{website.slug}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/events/${website.slug}`);
                            }}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => window.open(`${window.location.origin}/events/${website.slug}`, '_blank')}
                          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                          <Eye size={20} />
                          Preview Website
                        </button>
                        <button
                          onClick={() => setActiveTab('settings')}
                          className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                          <Globe size={20} />
                          Publish to Domain
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Published Banner */}
              {website.website_published && (
                <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 border-2 border-green-500/50 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <CheckCircle className="w-8 h-8 text-green-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white mb-2">Website is Live!</h3>
                      <p className="text-slate-300 mb-4">
                        Your event website is published and accessible to the public.
                      </p>
                      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 mb-4">
                        <div className="text-xs text-slate-400 mb-1">Public URL:</div>
                        <div className="flex items-center gap-2">
                          <code className="text-green-400 font-mono text-sm flex-1">
                            {getSiteUrl()}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(getSiteUrl());
                            }}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => window.open(getSiteUrl(), '_blank')}
                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                      >
                        <ExternalLink size={20} />
                        Visit Live Website
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
                  <Eye className="text-blue-400 mb-2" size={24} />
                  <div className="text-3xl font-bold text-white">{stats.pageViews}</div>
                  <div className="text-sm text-slate-400">Page Views</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
                  <FileText className="text-green-400 mb-2" size={24} />
                  <div className="text-3xl font-bold text-white">{stats.pagesCount}</div>
                  <div className="text-sm text-slate-400">Pages</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
                  <Trophy className="text-yellow-400 mb-2" size={24} />
                  <div className="text-3xl font-bold text-white">{stats.sponsorsCount}</div>
                  <div className="text-sm text-slate-400">Sponsors</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700">
                  <Users className="text-purple-400 mb-2" size={24} />
                  <div className="text-3xl font-bold text-white">{stats.competitorsCount}</div>
                  <div className="text-sm text-slate-400">Competitors</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <button
                    onClick={() => setActiveTab('pages')}
                    className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-purple-500 transition-colors text-left group"
                  >
                    <FileText className="text-purple-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Manage Pages</div>
                    <div className="text-sm text-slate-400">Create and edit website pages</div>
                  </button>
                  <button
                    onClick={() => setActiveTab('sponsors')}
                    className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-yellow-500 transition-colors text-left group"
                  >
                    <Trophy className="text-yellow-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Add Sponsors</div>
                    <div className="text-sm text-slate-400">Showcase event sponsors</div>
                  </button>
                  <button
                    onClick={() => setActiveTab('media')}
                    className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-blue-500 transition-colors text-left group"
                  >
                    <Image className="text-blue-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Upload Media</div>
                    <div className="text-sm text-slate-400">Add photos and videos</div>
                  </button>
                  <button
                    onClick={() => setActiveTab('competitors')}
                    className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-green-500 transition-colors text-left group"
                  >
                    <Users className="text-green-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Manage Competitors</div>
                    <div className="text-sm text-slate-400">Add competitor profiles</div>
                  </button>
                  <button
                    onClick={() => setActiveTab('news')}
                    className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 hover:border-red-500 transition-colors text-left group"
                  >
                    <Newspaper className="text-red-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Post News</div>
                    <div className="text-sm text-slate-400">Share updates and results</div>
                  </button>
                  <button
                    onClick={() => window.open(getSiteUrl(), '_blank')}
                    className="p-4 bg-purple-600 rounded-lg border border-purple-500 hover:bg-purple-700 transition-colors text-left group"
                  >
                    <Eye className="text-white mb-2 group-hover:scale-110 transition-transform" size={24} />
                    <div className="font-medium text-white">Preview Website</div>
                    <div className="text-sm text-purple-200">View public site</div>
                  </button>
                </div>
              </div>

              {/* Domain Management */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Domain Management</h3>
                <EnhancedDomainManagementSection
                  entityType="event"
                  entityId={website.id}
                  entityName={eventName}
                  currentSubdomain={website.slug}
                  currentCustomDomain={website.custom_domain || undefined}
                  onDomainUpdate={loadWebsiteData}
                />
              </div>
            </div>
          )}

          {activeTab === 'navigation' && website && (
            <EventWebsiteGlobalSectionsManager websiteId={website.id} darkMode={true} />
          )}

          {activeTab === 'pages' && website && (
            <EventWebsitePageManager websiteId={website.id} />
          )}

          {activeTab === 'sponsors' && website && (
            <EventWebsiteSponsorManager websiteId={website.id} />
          )}

          {activeTab === 'media' && website && (
            <EventWebsiteMediaManager websiteId={website.id} eventId={eventId} />
          )}

          {activeTab === 'competitors' && website && (
            <EventWebsiteCompetitorManager websiteId={website.id} eventId={eventId} />
          )}

          {activeTab === 'news' && website && (
            <EventWebsiteNewsManager websiteId={website.id} eventId={eventId} />
          )}

          {activeTab === 'accommodations' && website && (
            <EventWebsiteAccommodationManager eventWebsiteId={website.id} darkMode={true} />
          )}

          {activeTab === 'analytics' && website && (
            <EventWebsiteAnalytics websiteId={website.id} eventId={eventId} />
          )}

          {activeTab === 'settings' && website && (
            <div>
              <h3 className="text-xl font-semibold text-white mb-6">Domain Management</h3>
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

      {/* Save as Template Modal */}
      {showSaveTemplateModal && website && (
        <SaveAsTemplateModal
          eventWebsiteId={website.id}
          eventName={eventName}
          onClose={() => setShowSaveTemplateModal(false)}
          onSaved={() => {
            setShowSaveTemplateModal(false);
          }}
          darkMode={true}
        />
      )}
    </div>
  );
};
