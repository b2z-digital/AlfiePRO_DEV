import React, { useState, useEffect } from 'react';
import { Building2, Plus, CreditCard as Edit2, Trash2, Search, Globe, Mail, X, Check, Loader as Loader2, Rss, Copy, ExternalLink, Link2, ToggleLeft, ToggleRight, Eye } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExternalOrganization {
  id: string;
  name: string;
  abbreviation: string;
  contact_email: string;
  website_url: string;
  description: string;
  created_at: string;
}

interface QuickRaceEvent {
  id: string;
  event_name: string;
  boat_class: string;
  last_completed_race: number;
  created_at: string;
}

interface DataFeed {
  id: string;
  event_id: string;
  organization_id: string | null;
  feed_token: string;
  feed_name: string;
  format: string;
  is_active: boolean;
  include_race_details: boolean;
  last_accessed_at: string | null;
  access_count: number;
  created_at: string;
}

interface ExternalOrganizationsPageProps {
  darkMode: boolean;
}

export const ExternalOrganizationsPage: React.FC<ExternalOrganizationsPageProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'organizations' | 'feeds'>('feeds');

  // Organizations state
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [orgLoading, setOrgLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<ExternalOrganization | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    contact_email: '',
    website_url: '',
    description: '',
  });

  // Feeds state
  const [feeds, setFeeds] = useState<DataFeed[]>([]);
  const [events, setEvents] = useState<QuickRaceEvent[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(true);
  const [showFeedForm, setShowFeedForm] = useState(false);
  const [savingFeed, setSavingFeed] = useState(false);
  const [deletingFeed, setDeletingFeed] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [feedFormData, setFeedFormData] = useState({
    event_id: '',
    organization_id: '',
    feed_name: '',
    format: 'json',
    include_race_details: true,
  });

  useEffect(() => {
    if (user) {
      loadOrganizations();
      loadFeeds();
      loadEvents();
    }
  }, [user]);

  // --- Organizations ---
  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('external_organizations')
        .select('*')
        .eq('user_id', user!.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setOrganizations((data || []) as ExternalOrganization[]);
    } catch (err) {
      console.error('Error loading organizations:', err);
    } finally {
      setOrgLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      if (editingOrg) {
        const { error } = await supabase
          .from('external_organizations')
          .update({
            name: formData.name.trim(),
            abbreviation: formData.abbreviation.trim(),
            contact_email: formData.contact_email.trim(),
            website_url: formData.website_url.trim(),
            description: formData.description.trim(),
          })
          .eq('id', editingOrg.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('external_organizations')
          .insert({
            user_id: user!.id,
            name: formData.name.trim(),
            abbreviation: formData.abbreviation.trim(),
            contact_email: formData.contact_email.trim(),
            website_url: formData.website_url.trim(),
            description: formData.description.trim(),
          });

        if (error) throw error;
      }

      resetForm();
      loadOrganizations();
    } catch (err) {
      console.error('Error saving organization:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('external_organizations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setOrganizations(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      console.error('Error deleting organization:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (org: ExternalOrganization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      abbreviation: org.abbreviation || '',
      contact_email: org.contact_email || '',
      website_url: org.website_url || '',
      description: org.description || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingOrg(null);
    setFormData({ name: '', abbreviation: '', contact_email: '', website_url: '', description: '' });
  };

  // --- Data Feeds ---
  const loadFeeds = async () => {
    try {
      const { data, error } = await supabase
        .from('event_data_feeds')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeeds((data || []) as DataFeed[]);
    } catch (err) {
      console.error('Error loading feeds:', err);
    } finally {
      setFeedsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('quick_races')
        .select('id, event_name, boat_class, last_completed_race, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Error loading events:', err);
    }
  };

  const handleSaveFeed = async () => {
    if (!feedFormData.event_id) return;
    setSavingFeed(true);

    try {
      const selectedEvent = events.find(e => e.id === feedFormData.event_id);
      const feedName = feedFormData.feed_name.trim() || selectedEvent?.event_name || 'Untitled Feed';

      const { error } = await supabase
        .from('event_data_feeds')
        .insert({
          user_id: user!.id,
          event_id: feedFormData.event_id,
          organization_id: feedFormData.organization_id || null,
          feed_name: feedName,
          format: feedFormData.format,
          include_race_details: feedFormData.include_race_details,
        });

      if (error) throw error;
      resetFeedForm();
      loadFeeds();
    } catch (err) {
      console.error('Error creating feed:', err);
    } finally {
      setSavingFeed(false);
    }
  };

  const handleDeleteFeed = async (id: string) => {
    setDeletingFeed(id);
    try {
      const { error } = await supabase
        .from('event_data_feeds')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setFeeds(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      console.error('Error deleting feed:', err);
    } finally {
      setDeletingFeed(null);
    }
  };

  const handleToggleFeed = async (feed: DataFeed) => {
    try {
      const { error } = await supabase
        .from('event_data_feeds')
        .update({ is_active: !feed.is_active })
        .eq('id', feed.id);

      if (error) throw error;
      setFeeds(prev => prev.map(f => f.id === feed.id ? { ...f, is_active: !f.is_active } : f));
    } catch (err) {
      console.error('Error toggling feed:', err);
    }
  };

  const resetFeedForm = () => {
    setShowFeedForm(false);
    setFeedFormData({ event_id: '', organization_id: '', feed_name: '', format: 'json', include_race_details: true });
  };

  const getFeedUrl = (feed: DataFeed) => {
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${baseUrl}/functions/v1/event-data-feed/${feed.feed_token}`;
  };

  const copyFeedUrl = (feed: DataFeed) => {
    const url = getFeedUrl(feed);
    navigator.clipboard.writeText(url);
    setCopiedToken(feed.id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const getEventName = (eventId: string) => {
    return events.find(e => e.id === eventId)?.event_name || 'Unknown Event';
  };

  const getOrgName = (orgId: string | null) => {
    if (!orgId) return null;
    return organizations.find(o => o.id === orgId)?.name || null;
  };

  const formatLabel = (format: string) => {
    switch (format) {
      case 'json': return 'JSON';
      case 'csv': return 'CSV';
      case 'html': return 'HTML';
      default: return format.toUpperCase();
    }
  };

  const filtered = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (org.abbreviation || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Data Feeds</h1>
          <p className="text-sm text-slate-400 mt-1">Create feed URLs to share race results with organizations in JSON, CSV, or HTML format</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800/60 border border-slate-700 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('feeds')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'feeds'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Rss className="w-4 h-4" />
              Feed URLs
            </span>
          </button>
          <button
            onClick={() => setActiveTab('organizations')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'organizations'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organizations
            </span>
          </button>
        </div>

        {/* Data Feeds Tab */}
        {activeTab === 'feeds' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">
                {feeds.length} active feed{feeds.length !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => { resetFeedForm(); setShowFeedForm(true); }}
                className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Feed
              </button>
            </div>

            {/* Create Feed Form */}
            {showFeedForm && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">New Data Feed</h2>
                  <button onClick={resetFeedForm} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">Event *</label>
                    <select
                      value={feedFormData.event_id}
                      onChange={e => setFeedFormData(prev => ({ ...prev, event_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="">Select an event...</option>
                      {events.map(event => (
                        <option key={event.id} value={event.id}>
                          {event.event_name} {event.boat_class ? `(${event.boat_class})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Feed Name</label>
                    <input
                      type="text"
                      value={feedFormData.feed_name}
                      onChange={e => setFeedFormData(prev => ({ ...prev, feed_name: e.target.value }))}
                      placeholder="e.g. ARYA Results Feed (auto-generated if blank)"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Organization (optional)</label>
                    <select
                      value={feedFormData.organization_id}
                      onChange={e => setFeedFormData(prev => ({ ...prev, organization_id: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="">No organization linked</option>
                      {organizations.map(org => (
                        <option key={org.id} value={org.id}>
                          {org.name} {org.abbreviation ? `(${org.abbreviation})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Default Format</label>
                    <select
                      value={feedFormData.format}
                      onChange={e => setFeedFormData(prev => ({ ...prev, format: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    >
                      <option value="json">JSON (structured data)</option>
                      <option value="csv">CSV (spreadsheet)</option>
                      <option value="html">HTML (web page)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={feedFormData.include_race_details}
                        onChange={e => setFeedFormData(prev => ({ ...prev, include_race_details: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-900/50 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-sm text-slate-300">Include per-race scores</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-5">
                  <button onClick={resetFeedForm} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveFeed}
                    disabled={!feedFormData.event_id || savingFeed}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                  >
                    {savingFeed ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Create Feed
                  </button>
                </div>
              </div>
            )}

            {/* Feed List */}
            {feedsLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : feeds.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-8 text-center">
                <Rss className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-white mb-2">No data feeds yet</h3>
                <p className="text-slate-400 text-sm mb-4 max-w-md mx-auto">
                  Create a data feed to generate a URL that organizations can use to pull your race results in JSON, CSV, or HTML format. Results update automatically as you score races.
                </p>
                <button
                  onClick={() => { resetFeedForm(); setShowFeedForm(true); }}
                  className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Feed
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {feeds.map(feed => {
                  const feedUrl = getFeedUrl(feed);
                  const orgName = getOrgName(feed.organization_id);

                  return (
                    <div
                      key={feed.id}
                      className={`bg-slate-800/60 border rounded-xl p-4 transition-colors ${
                        feed.is_active ? 'border-slate-700' : 'border-slate-700/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-white font-medium truncate">{feed.feed_name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded font-mono ${
                              feed.format === 'json' ? 'bg-green-500/20 text-green-300' :
                              feed.format === 'csv' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-blue-500/20 text-blue-300'
                            }`}>
                              {formatLabel(feed.format)}
                            </span>
                            {!feed.is_active && (
                              <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
                                Disabled
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-400 mb-2">
                            Event: {getEventName(feed.event_id)}
                            {orgName && <> &middot; For: {orgName}</>}
                          </p>

                          {/* URL Display */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 min-w-0 bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-2">
                              <Link2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <span className="text-xs text-slate-300 font-mono truncate">{feedUrl}</span>
                            </div>
                            <button
                              onClick={() => copyFeedUrl(feed)}
                              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                                copiedToken === feed.id
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600'
                              }`}
                              title="Copy URL"
                            >
                              {copiedToken === feed.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <a
                              href={feedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                              title="Open feed in new tab"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>

                          {/* Format hint */}
                          <p className="text-xs text-slate-500">
                            Append <code className="text-slate-400 bg-slate-800 px-1 rounded">?format=json</code>, <code className="text-slate-400 bg-slate-800 px-1 rounded">?format=csv</code>, or <code className="text-slate-400 bg-slate-800 px-1 rounded">?format=html</code> to override the default format
                          </p>

                          {/* Stats */}
                          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {feed.access_count} access{feed.access_count !== 1 ? 'es' : ''}
                            </span>
                            {feed.last_accessed_at && (
                              <span>Last accessed: {new Date(feed.last_accessed_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleToggleFeed(feed)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                            title={feed.is_active ? 'Disable feed' : 'Enable feed'}
                          >
                            {feed.is_active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteFeed(feed.id)}
                            disabled={deletingFeed === feed.id}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                            title="Delete feed"
                          >
                            {deletingFeed === feed.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Organizations Tab */}
        {activeTab === 'organizations' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">
                Manage organizations you share results with
              </p>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Organization
              </button>
            </div>

            {showForm && (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">
                    {editingOrg ? 'Edit Organization' : 'New Organization'}
                  </h2>
                  <button onClick={resetForm} className="text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Australian Radio Yacht Association"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Abbreviation</label>
                    <input
                      type="text"
                      value={formData.abbreviation}
                      onChange={e => setFormData(prev => ({ ...prev, abbreviation: e.target.value }))}
                      placeholder="e.g. ARYA"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={e => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                      placeholder="results@arya.org.au"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Website</label>
                    <input
                      type="url"
                      value={formData.website_url}
                      onChange={e => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                      placeholder="https://arya.org.au"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Brief description of this organization"
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button onClick={resetForm} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!formData.name.trim() || saving}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {editingOrg ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search organizations..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>

            {orgLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-8 text-center">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-white mb-2">
                  {searchTerm ? 'No matches found' : 'No organizations yet'}
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  {searchTerm
                    ? 'Try a different search term.'
                    : 'Add organizations like ARYA or state associations to easily share your race results.'}
                </p>
                {!searchTerm && (
                  <button
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Organization
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(org => (
                  <div
                    key={org.id}
                    className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-4"
                  >
                    <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium truncate">{org.name}</p>
                        {org.abbreviation && (
                          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded flex-shrink-0">
                            {org.abbreviation}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        {org.contact_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {org.contact_email}
                          </span>
                        )}
                        {org.website_url && (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" /> {org.website_url.replace(/^https?:\/\//, '')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(org)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(org.id)}
                        disabled={deleting === org.id}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        {deleting === org.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


export { ExternalOrganizationsPage }