import React, { useState, useEffect, useRef } from 'react';
import { Globe, Plus, Edit, Trash2, Eye, Copy, Search, Calendar, MapPin, Users, ArrowLeft, MoreVertical, BookTemplate } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useNavigate } from 'react-router-dom';
import { eventWebsiteStorage } from '../utils/eventWebsiteStorage';
import { supabase } from '../utils/supabase';
import type { EventWebsite } from '../types/eventWebsite';
import { EventWebsiteSettingsModal } from '../components/events/EventWebsiteSettingsModal';
import { useNotifications } from '../contexts/NotificationContext';
import { SaveAsTemplateModal } from '../components/events/SaveAsTemplateModal';

export const EventWebsitesPage: React.FC = () => {
  const { currentClub, user } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const darkMode = localStorage.getItem('lightMode') !== 'true';

  const [activeTab, setActiveTab] = useState<'websites' | 'templates'>('websites');
  const [loading, setLoading] = useState(true);
  const [eventWebsites, setEventWebsites] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventName, setSelectedEventName] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [selectedWebsiteForTemplate, setSelectedWebsiteForTemplate] = useState<{ id: string; name: string } | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkSuperAdmin();
    if (activeTab === 'websites') {
      loadEventWebsites();
    } else {
      loadTemplates();
    }
  }, [currentClub, activeTab]);

  const checkSuperAdmin = async () => {
    if (!user) return;
    try {
      // Check if user has super_admin role in any club/organization
      const { data, error } = await supabase
        .from('user_clubs')
        .select('role')
        .eq('user_id', effectiveUserId!)
        .eq('role', 'super_admin')
        .limit(1);

      if (error) {
        console.error('Error checking super admin status:', error);
        setIsSuperAdmin(false);
        return;
      }

      const hasSuperAdmin = data && data.length > 0;
      console.log('SuperAdmin check:', { userId: user.id, hasSuperAdmin, data });
      setIsSuperAdmin(hasSuperAdmin);
    } catch (error) {
      console.error('Error checking super admin status:', error);
      setIsSuperAdmin(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadEventWebsites = async () => {
    try {
      setLoading(true);

      // Query event_websites table directly
      const { data: websites, error } = await supabase
        .from('event_websites')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with event data
      if (websites && websites.length > 0) {
        const eventIds = websites.map((w: any) => w.event_id);
        const { data: events } = await supabase
          .from('public_events')
          .select('id, event_name, date, event_level, venue, created_at')
          .in('id', eventIds);

        const enrichedWebsites = websites.map((website: any) => ({
          ...website,
          public_events: events?.find((e: any) => e.id === website.event_id) || null
        }));

        setEventWebsites(enrichedWebsites);
      } else {
        setEventWebsites([]);
      }
    } catch (error) {
      console.error('Error loading event websites:', error);
      addNotification('error', 'Failed to load event websites');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);

      const { data: templateData, error } = await supabase
        .from('event_website_templates')
        .select(`
          *,
          profiles:created_by (
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTemplates(templateData || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      addNotification('error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (websiteId: string) => {
    try {
      await eventWebsiteStorage.deleteEventWebsite(websiteId);
      addNotification('success', 'Event website deleted successfully');
      loadEventWebsites();
      setDeleteConfirm(null);
    } catch (error: any) {
      addNotification('error', error.message);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('event_website_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;

      addNotification('success', 'Template deleted successfully');
      loadTemplates();
      setDeleteConfirm(null);
    } catch (error: any) {
      addNotification('error', error.message || 'Failed to delete template');
    }
  };

  const handleDuplicate = async (website: any) => {
    const eventName = website.public_events?.event_name || 'Event';
    setSelectedWebsiteForTemplate({ id: website.id, name: eventName });
    setShowSaveTemplateModal(true);
  };

  const handleViewWebsite = (slug: string) => {
    window.open(`/events/${slug}`, '_blank');
  };

  const filteredWebsites = eventWebsites.filter(site => {
    const eventName = site.public_events?.event_name || '';
    const slug = site.slug || '';
    return eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           slug.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Separate templates by type
  const globalTemplates = templates.filter(t => t.is_public === true && !t.club_id);
  const clubTemplates = templates.filter(t => t.club_id === currentClub?.clubId);

  const filteredTemplates = templates.filter(template => {
    const name = template.name || '';
    const description = template.description || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           description.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const renderTemplatesTab = () => {
    const globalFiltered = filteredTemplates.filter(t => t.is_public === true && !t.club_id);
    const clubFiltered = filteredTemplates.filter(t => t.club_id === currentClub?.clubId);

    return (
      <div className="space-y-8">
        {/* Global Templates */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Global Templates
            </h2>
            {isSuperAdmin && (
              <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs font-medium">
                SuperAdmin Only
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
            </div>
          ) : globalFiltered.length === 0 ? (
            <div className={`text-center py-12 rounded-lg border ${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <BookTemplate className={`mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={48} />
              <p className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                {searchTerm ? 'No global templates found' : 'No global templates available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {globalFiltered.map(template => renderTemplateCard(template, true))}
            </div>
          )}
        </div>

        {/* Club Templates */}
        <div>
          <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Club Templates
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
            </div>
          ) : clubFiltered.length === 0 ? (
            <div className={`text-center py-12 rounded-lg border ${
              darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
            }`}>
              <BookTemplate className={`mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={48} />
              <p className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                {searchTerm ? 'No club templates found' : 'No club templates yet'}
              </p>
              <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Save an event website as a template to reuse it
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clubFiltered.map(template => renderTemplateCard(template, false))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTemplateCard = (template: any, isGlobal: boolean) => {
    const canDelete = isGlobal ? isSuperAdmin : true;
    const canEdit = isGlobal ? isSuperAdmin : true;

    return (
      <div
        key={template.id}
        className={`rounded-xl border overflow-hidden transition-all hover:shadow-lg ${
          darkMode
            ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            : 'bg-white border-slate-200 hover:border-slate-300'
        }`}
      >
        {/* Preview Image */}
        {template.preview_image && (
          <div className="h-48 bg-slate-900 overflow-hidden">
            <img
              src={template.preview_image}
              alt={template.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className={`text-lg font-bold flex-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {template.name}
            </h3>
            <div className="flex items-center gap-2">
              {isGlobal && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                  Global
                </span>
              )}
              {canEdit && (
                <button
                  onClick={() => {
                    addNotification('info', 'Template editing coming soon');
                  }}
                  className={`p-1.5 rounded transition-colors ${
                    darkMode
                      ? 'hover:bg-slate-700 text-slate-400 hover:text-cyan-400'
                      : 'hover:bg-slate-100 text-slate-500 hover:text-cyan-600'
                  }`}
                  title="Edit template"
                >
                  <Edit size={16} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setDeleteConfirm(template.id)}
                  className={`p-1.5 rounded transition-colors ${
                    darkMode
                      ? 'hover:bg-slate-700 text-slate-400 hover:text-red-400'
                      : 'hover:bg-slate-100 text-slate-500 hover:text-red-600'
                  }`}
                  title="Delete template"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {template.description && (
            <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {template.description}
            </p>
          )}

          <div className={`flex items-center gap-2 text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            <span>Used {template.use_count || 0} times</span>
            {template.category && (
              <>
                <span>•</span>
                <span className="capitalize">{template.category}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // Open template preview - for now open in new tab, could create preview modal
                const previewUrl = `/events/${template.slug || template.id}?preview=true`;
                addNotification('info', 'Template preview functionality coming soon');
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Eye size={16} />
              Preview
            </button>
          </div>

          {template.profiles?.full_name && (
            <p className={`text-xs mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Created by {template.profiles.full_name}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('websites')}
            className={`px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'websites'
                ? darkMode
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-cyan-600 text-cyan-600'
                : darkMode
                  ? 'border-transparent text-slate-400 hover:text-slate-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Globe size={18} />
              <span>Event Websites</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-3 border-b-2 font-medium transition-colors ${
              activeTab === 'templates'
                ? darkMode
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-cyan-600 text-cyan-600'
                : darkMode
                  ? 'border-transparent text-slate-400 hover:text-slate-300'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookTemplate size={18} />
              <span>Templates</span>
            </div>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={activeTab === 'websites' ? 'Search event websites...' : 'Search templates...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
              darkMode
                ? 'bg-slate-800/50 border-slate-700 text-white placeholder-slate-400'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
            } focus:outline-none focus:ring-2 focus:ring-cyan-500`}
          />
        </div>
      </div>

      {/* Content */}
      {activeTab === 'templates' ? (
        renderTemplatesTab()
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
        </div>
      ) : filteredWebsites.length === 0 ? (
        <div className={`text-center py-12 rounded-lg border ${
          darkMode
            ? 'bg-slate-800/50 border-slate-700'
            : 'bg-white border-slate-200'
        }`}>
          <Globe className={`mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={48} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {searchTerm ? 'No websites found' : 'No event websites yet'}
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            {searchTerm
              ? 'Try adjusting your search terms'
              : 'Create event websites from the event management page for state and national events'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWebsites.map((website) => {
            const event = website.public_events;
            const isActive = website.enabled;

            return (
              <div
                key={website.id}
                className={`rounded-xl border overflow-hidden transition-all hover:shadow-lg ${
                  darkMode
                    ? 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                  {/* Status Badge */}
                  <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : darkMode
                            ? 'bg-slate-500/20 text-slate-400'
                            : 'bg-slate-200 text-slate-600'
                      }`}>
                        {isActive ? 'Active' : 'Draft'}
                      </span>
                      {event?.event_level && (
                        <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-medium capitalize">
                          {event.event_level}
                        </span>
                      )}
                    </div>

                    <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {event?.event_name || 'Untitled Event'}
                    </h3>

                    {event && (
                      <div className={`space-y-1 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {event.date && (
                          <div className="flex items-center gap-2">
                            <Calendar size={14} />
                            <span>{new Date(event.date).toLocaleDateString()}</span>
                          </div>
                        )}
                        {event.venue && (
                          <div className="flex items-center gap-2">
                            <MapPin size={14} />
                            <span>{event.venue}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Website Info */}
                  <div className="p-4">
                    <div className={`mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <p className="text-xs mb-1">Website URL:</p>
                      <p className="text-sm font-mono truncate text-cyan-400">
                        /events/{website.slug}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          console.log('Navigating to event website dashboard:', website.id);
                          navigate(`/website/event-websites/${website.id}`);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Edit size={16} />
                        Edit Website
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDuplicate(website)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm font-medium transition-colors"
                        >
                          <BookTemplate size={16} />
                          Save as Template
                        </button>
                        <div className="relative" ref={openDropdown === website.id ? dropdownRef : null}>
                          <button
                            onClick={() => setOpenDropdown(openDropdown === website.id ? null : website.id)}
                            className="px-3 py-2 rounded-lg transition-colors bg-slate-700 hover:bg-slate-600 text-slate-300"
                            title="More options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openDropdown === website.id && (
                            <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg border z-10 ${
                              darkMode
                                ? 'bg-slate-800 border-slate-700'
                                : 'bg-white border-slate-200'
                            }`}>
                              {isActive && (
                                <button
                                  onClick={() => {
                                    handleViewWebsite(website.slug);
                                    setOpenDropdown(null);
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                                    darkMode
                                      ? 'text-slate-300 hover:bg-slate-700'
                                      : 'text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  <Eye size={16} />
                                  View Website
                                </button>
                              )}
                              {deleteConfirm === website.id ? (
                                <div className="p-2 space-y-2">
                                  <p className="text-xs text-center text-slate-400 px-2">
                                    Delete this website?
                                  </p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        handleDelete(website.id);
                                        setOpenDropdown(null);
                                      }}
                                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-xs font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(website.id)}
                                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors ${
                                    isActive ? 'border-t border-slate-700' : ''
                                  }`}
                                >
                                  <Trash2 size={16} />
                                  Delete Website
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && selectedEventId && (
        <EventWebsiteSettingsModal
          eventId={selectedEventId}
          eventName={selectedEventName}
          darkMode={darkMode}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedEventId(null);
            setSelectedEventName('');
          }}
          onSaved={() => {
            loadEventWebsites();
          }}
          onOpenDashboard={(websiteId) => {
            setShowCreateModal(false);
            // Navigate to dashboard
            if (websiteId) {
              navigate(`/website/event-websites/${websiteId}`);
            }
          }}
        />
      )}

      {/* Save as Template Modal */}
      {showSaveTemplateModal && selectedWebsiteForTemplate && (
        <SaveAsTemplateModal
          eventWebsiteId={selectedWebsiteForTemplate.id}
          eventName={selectedWebsiteForTemplate.name}
          onClose={() => {
            setShowSaveTemplateModal(false);
            setSelectedWebsiteForTemplate(null);
          }}
          onSaved={() => {
            setShowSaveTemplateModal(false);
            setSelectedWebsiteForTemplate(null);
            addNotification('success', 'Template saved successfully');
            loadTemplates();
          }}
          darkMode={darkMode}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && activeTab === 'templates' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-lg max-w-md w-full p-6 ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Delete Template
            </h3>
            <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              Are you sure you want to delete this template? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTemplate(deleteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
