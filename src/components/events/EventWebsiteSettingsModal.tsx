import React, { useState, useEffect } from 'react';
import { X, Globe, Save, ExternalLink, Loader2, Check, AlertCircle, Eye, Settings as SettingsIcon, Sparkles, Plus, Calendar, MapPin, Trophy, BookTemplate } from 'lucide-react';
import type { EventWebsite, EventWebsiteSettings } from '../../types/eventWebsite';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { DomainManagementSection } from '../settings/DomainManagementSection';
import { EventGroupManager } from './EventGroupManager';
import { supabase } from '../../utils/supabase';
import { TemplateSelectionModal } from './TemplateSelectionModal';

interface EventWebsiteSettingsModalProps {
  eventId: string;
  eventName: string;
  darkMode?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onOpenDashboard?: () => void;
}

interface PublicEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  race_class: string;
  event_type: string;
}

export const EventWebsiteSettingsModal: React.FC<EventWebsiteSettingsModalProps> = ({
  eventId,
  eventName,
  darkMode = true,
  onClose,
  onSaved,
  onOpenDashboard
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const [eventWebsite, setEventWebsite] = useState<EventWebsite | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [websiteName, setWebsiteName] = useState('');
  const [slug, setSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [googleAnalyticsId, setGoogleAnalyticsId] = useState('');

  // Event grouping
  const [selectedEvents, setSelectedEvents] = useState<string[]>([eventId]);
  const [primaryEventId, setPrimaryEventId] = useState<string>(eventId);
  const [availableEvents, setAvailableEvents] = useState<PublicEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [primaryEvent, setPrimaryEvent] = useState<PublicEvent | null>(null);

  useEffect(() => {
    loadEventWebsite();
    loadAvailableEvents();
  }, [eventId]);

  const loadAvailableEvents = async () => {
    try {
      setLoadingEvents(true);
      setError(null);

      // Try to get event from public_events first
      let primaryEvt: any = null;
      const { data: publicEvt, error: publicError } = await supabase
        .from('public_events')
        .select('id, event_name, date, venue, race_class, event_level')
        .eq('id', eventId)
        .maybeSingle();

      if (publicEvt) {
        primaryEvt = publicEvt;
      } else {
        // If not found in public_events, try quick_races
        const { data: quickRace, error: quickError } = await supabase
          .from('quick_races')
          .select('id, event_name, end_date, club_id, created_at')
          .eq('id', eventId)
          .maybeSingle();

        if (!quickRace) {
          setError(`This event doesn't exist. Please refresh the Race Management page and try again.`);
          setLoading(false);
          return;
        }

        // Map quick_race to match public_events structure
        primaryEvt = {
          id: quickRace.id,
          event_name: quickRace.event_name,
          date: quickRace.end_date || quickRace.created_at,
          venue: '', // Quick races don't have venue
          race_class: '', // Quick races don't have race_class
          event_level: 'club'
        };
      }

      // Map to expected interface
      setPrimaryEvent({
        id: primaryEvt.id,
        name: primaryEvt.event_name,
        date: primaryEvt.date,
        location: primaryEvt.venue || 'TBA',
        race_class: primaryEvt.race_class || 'All Classes',
        event_type: primaryEvt.event_level || 'Event'
      });

      // Only fetch related events for public_events (not for quick_races)
      if (primaryEvt.venue) {
        // Calculate date range (7 days before and after)
        const eventDate = new Date(primaryEvt.date);
        const startDate = new Date(eventDate);
        startDate.setDate(startDate.getDate() - 7);
        const endDate = new Date(eventDate);
        endDate.setDate(endDate.getDate() + 7);

        // Fetch related events (within 7 days and same venue)
        const { data: events, error: eventsError } = await supabase
          .from('public_events')
          .select('id, event_name, date, venue, race_class, event_level')
          .neq('id', eventId)
          .eq('venue', primaryEvt.venue)
          .gte('date', startDate.toISOString().split('T')[0])
          .lte('date', endDate.toISOString().split('T')[0])
          .order('date', { ascending: true })
          .limit(50);

        if (eventsError) throw eventsError;

        // Map to expected interface
        const mappedEvents = (events || []).map(evt => ({
          id: evt.id,
          name: evt.event_name,
          date: evt.date,
          location: evt.venue,
          race_class: evt.race_class,
          event_type: evt.event_level || 'Event'
        }));

        setAvailableEvents(mappedEvents);
      } else {
        // For quick_races, no related events
        setAvailableEvents([]);
      }
    } catch (error) {
      console.error('Error loading available events:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadEventWebsite = async () => {
    try {
      setLoading(true);
      const website = await eventWebsiteStorage.getEventWebsite(eventId);

      if (website) {
        setEventWebsite(website);
        setEnabled(website.enabled);
        setWebsiteName(website.website_name || '');
        setSlug(website.slug);
        setCustomDomain(website.custom_domain || '');
        setMetaTitle(website.meta_title || eventName);
        setMetaDescription(website.meta_description || `Official website for ${eventName}`);
        setGoogleAnalyticsId(website.google_analytics_id || '');

        // Load linked events
        const { data: linkedEvents } = await supabase
          .from('event_website_events')
          .select('event_id, is_primary')
          .eq('event_website_id', website.id);

        if (linkedEvents && linkedEvents.length > 0) {
          const eventIds = linkedEvents.map(e => e.event_id);
          setSelectedEvents(eventIds);
          const primary = linkedEvents.find(e => e.is_primary);
          if (primary) {
            setPrimaryEventId(primary.event_id);
          }
        }
      } else {
        // Creating new website - auto-enable it
        setEnabled(true);
        const autoSlug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        setSlug(autoSlug);
        setMetaTitle(eventName);
        setMetaDescription(`Official website for ${eventName}`);
      }
    } catch (error) {
      console.error('Error loading event website:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!slug) {
      setError('URL slug is required');
      return;
    }

    if (selectedEvents.length === 0) {
      setError('At least one event must be selected');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const websiteData: Partial<EventWebsite> = {
        event_id: primaryEventId,
        website_name: websiteName || null,
        slug,
        custom_domain: customDomain || null,
        meta_title: metaTitle || eventName,
        meta_description: metaDescription || `Official website for ${eventName}`,
        google_analytics_id: googleAnalyticsId || null,
        enabled,
        status: enabled ? 'published' : 'draft'
      };

      let website: EventWebsite;
      if (eventWebsite) {
        website = await eventWebsiteStorage.updateEventWebsite(eventWebsite.id, websiteData);
      } else {
        website = await eventWebsiteStorage.createEventWebsite(websiteData);
      }

      // Update event grouping
      // Delete existing links
      await supabase
        .from('event_website_events')
        .delete()
        .eq('event_website_id', website.id);

      // Insert new links
      const eventLinks = selectedEvents.map((evtId, index) => ({
        event_website_id: website.id,
        event_id: evtId,
        is_primary: evtId === primaryEventId,
        display_order: index
      }));

      await supabase
        .from('event_website_events')
        .insert(eventLinks);

      setEventWebsite(website);
      setSuccess(true);
      onSaved?.();

      if (!onOpenDashboard) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      // Check for RLS policy violation (event doesn't exist)
      if (err.message?.includes('row-level security policy') || err.code === '42501') {
        setError(`Unable to create website: This event doesn't exist in the database or hasn't been properly synced. Please refresh the Race Management page and try again.`);
      } else {
        setError(err.message || 'Failed to save website settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEventSelection = (eventId: string) => {
    if (selectedEvents.includes(eventId)) {
      // Don't allow deselecting the primary event
      if (eventId === primaryEventId) {
        setError('Cannot remove the primary event');
        return;
      }
      setSelectedEvents(selectedEvents.filter(id => id !== eventId));
    } else {
      setSelectedEvents([...selectedEvents, eventId]);
    }
  };

  const getSiteUrl = () => {
    if (customDomain) {
      return `https://${customDomain}`;
    }
    return `${window.location.origin}/events/${slug}`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl p-8 shadow-2xl border`}>
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
          <p className={`${darkMode ? 'text-slate-300' : 'text-slate-600'} mt-4`}>Loading event website...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl shadow-2xl border w-full max-w-5xl my-8 overflow-hidden`}>
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-purple-600 via-purple-700 to-violet-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Globe className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Event Website</h2>
              <p className="text-purple-100 text-sm mt-0.5">{eventName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-16rem)] overflow-y-auto">
          {/* Success Message */}
          {success && (
            <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-emerald-900/20 border-emerald-500/50' : 'bg-emerald-50 border-emerald-400'}`}>
              <div className="flex items-center gap-3 mb-3">
                <Check className={darkMode ? 'text-emerald-400' : 'text-emerald-600'} size={20} />
                <p className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                  Event website settings saved successfully!
                </p>
              </div>
              {onOpenDashboard && enabled && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenDashboard();
                  }}
                  className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} />
                  Open Website Dashboard
                </button>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className={`p-4 rounded-xl border-2 ${darkMode ? 'bg-red-900/20 border-red-500/50' : 'bg-red-50 border-red-400'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`${darkMode ? 'text-red-400' : 'text-red-600'} flex-shrink-0`} size={20} />
                <p className={darkMode ? 'text-red-400' : 'text-red-600'}>{error}</p>
              </div>
            </div>
          )}

          {/* Template Selection Banner - Only show when creating new website */}
          {!eventWebsite && (
            <div className={`p-5 rounded-xl border-2 ${darkMode ? 'bg-purple-900/20 border-purple-500/50' : 'bg-purple-50 border-purple-400'}`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <BookTemplate className={darkMode ? 'text-purple-400' : 'text-purple-600'} size={24} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold mb-1 ${darkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                    Start with a Template
                  </h3>
                  <p className={`text-sm mb-4 ${darkMode ? 'text-purple-400/80' : 'text-purple-600'}`}>
                    Save time by starting with a pre-configured website template. Templates include pages, layouts, colors, and settings that you can customize.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!eventWebsite) {
                        await handleSave();
                        // After saving, the eventWebsite state will be updated
                        // Wait a brief moment for the state to update, then open template modal
                        setTimeout(() => {
                          setShowTemplateModal(true);
                        }, 100);
                      } else {
                        setShowTemplateModal(true);
                      }
                    }}
                    disabled={saving}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                      darkMode
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <BookTemplate size={16} />
                    Choose Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Website Status - Only show for existing websites */}
          {eventWebsite && (
            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className={enabled ? 'text-purple-400' : (darkMode ? 'text-slate-500' : 'text-slate-400')} size={20} />
                  <div>
                    <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Website Visibility
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {enabled ? 'Public - accessible to everyone' : 'Private - visible only to admins'}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
              {enabled && slug && (
                <a
                  href={getSiteUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                className="mt-3 flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
              >
                <ExternalLink size={16} />
                {getSiteUrl()}
              </a>
              )}
            </div>
          )}

          {eventWebsite && (
            <DomainManagementSection
              entityType="event"
              entityId={eventWebsite.id}
              entityName={eventName}
              currentSubdomain={slug}
              currentCustomDomain={customDomain}
              onDomainUpdate={loadEventWebsite}
            />
          )}

          {/* Event Group Management */}
          {eventWebsite && (
            <EventGroupManager
              eventWebsiteId={eventWebsite.id}
              onEventsChanged={loadEventWebsite}
            />
          )}

          {/* Basic Settings */}
          <div>
            <h3 className={`text-base font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <SettingsIcon size={18} />
              Basic Settings
            </h3>
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Website Name
              </label>
              <input
                type="text"
                value={websiteName}
                onChange={(e) => setWebsiteName(e.target.value)}
                placeholder="2026 DF Australian Championship"
                className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Custom name for this website (useful when bundling multiple events). Leave blank to use primary event name.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  URL Slug <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="2026-df65-df95-australian-championship"
                  className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-purple-500`}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Lowercase letters, numbers, and hyphens only
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Page Title (SEO)
                </label>
                <input
                  type="text"
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder="2026 DF65 & DF95 Australian Championship"
                  className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-purple-500`}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Meta Description (SEO)
              </label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder={`Official website for ${eventName}`}
                rows={2}
                className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
            <div className="mt-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Google Analytics Tracking ID
              </label>
              <input
                type="text"
                value={googleAnalyticsId}
                onChange={(e) => setGoogleAnalyticsId(e.target.value)}
                placeholder="G-XXXXXXXXXX"
                className={`w-full px-4 py-2.5 rounded-lg border transition-colors ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Enter your GA4 measurement ID (e.g., G-XXXXXXXXXX) to track website analytics
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !slug}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
          >
            {saving ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* Template Selection Modal */}
      {showTemplateModal && eventWebsite && (
        <TemplateSelectionModal
          eventWebsiteId={eventWebsite.id}
          onClose={() => setShowTemplateModal(false)}
          onTemplateApplied={() => {
            setShowTemplateModal(false);
            loadEventWebsite();
          }}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};
