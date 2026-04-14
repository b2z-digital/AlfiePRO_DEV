import { useState, useEffect } from 'react';
import {
  Globe, Plus, Trash2, Play, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, AlertCircle, Eye, EyeOff, RefreshCw,
  CalendarDays, List, Tag, FileText, ExternalLink, MapPin, Download,
  Pencil, X, Save
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface EventsScrapingTabProps {
  darkMode: boolean;
}

interface EventSource {
  id: string;
  name: string;
  url: string;
  source_type: 'event_list' | 'single_event';
  display_category: string;
  target_national_association_id: string | null;
  is_active: boolean;
  last_scraped_at: string | null;
  event_count: number;
  created_at: string;
}

interface ScrapedEvent {
  id: string;
  source_id: string;
  external_event_id: string;
  event_name: string;
  event_date: string | null;
  event_end_date: string | null;
  venue: string | null;
  location: string | null;
  state_code: string | null;
  boat_class_raw: string | null;
  boat_class_mapped: string | null;
  event_type: string;
  event_status: string;
  ranking_event: boolean;
  source_url: string;
  documents_json: Array<{ name: string; url: string }> | null;
  registration_url: string | null;
  is_visible: boolean;
  display_category: string;
  last_scraped_at: string | null;
}

interface ScrapeLog {
  id: string;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  events_found: number;
  events_created: number;
  events_updated: number;
  events_skipped: number;
  status: 'running' | 'success' | 'error';
  error_message: string | null;
}

interface NationalAssoc {
  id: string;
  name: string;
}

interface StateAssoc {
  id: string;
  name: string;
  abbreviation: string | null;
}

function getStateLabel(category: string, stateAssociations: StateAssoc[]): string {
  if (category === 'national') return 'National Events';
  if (category === 'world') return 'World Events';
  if (category.startsWith('state_')) {
    const stateId = category.replace('state_', '');
    const sa = stateAssociations.find(s => s.id === stateId);
    if (sa) return sa.abbreviation || sa.name;
    return 'State Event';
  }
  return category;
}

const EMPTY_FORM = {
  name: '',
  url: '',
  source_type: 'event_list' as const,
  display_category: 'national' as const,
  target_national_association_id: '',
  is_active: true,
};

export function EventsScrapingTab({ darkMode }: EventsScrapingTabProps) {
  const [sources, setSources] = useState<EventSource[]>([]);
  const [nationals, setNationals] = useState<NationalAssoc[]>([]);
  const [stateAssociations, setStateAssociations] = useState<StateAssoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourceEvents, setSourceEvents] = useState<Record<string, ScrapedEvent[]>>({});
  const [sourceLogs, setSourceLogs] = useState<Record<string, ScrapeLog[]>>({});
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScrapedEvent | null>(null);
  const [editForm, setEditForm] = useState({
    event_name: '',
    venue: '',
    location: '',
    state_code: '',
    event_date: '',
    event_end_date: '',
    boat_class_mapped: '',
    event_type: 'club',
    event_status: 'scheduled',
    registration_url: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [sourcesRes, nationalsRes, statesRes] = await Promise.all([
      supabase.from('external_event_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('national_associations').select('id, name').order('name'),
      supabase.from('state_associations').select('id, name, abbreviation').order('name'),
    ]);
    if (sourcesRes.data) setSources(sourcesRes.data);
    if (nationalsRes.data) setNationals(nationalsRes.data);
    if (statesRes.data) setStateAssociations(statesRes.data);
    setLoading(false);
  }

  async function fetchEventsForSource(sourceId: string) {
    const { data } = await supabase
      .from('external_events')
      .select('*')
      .eq('source_id', sourceId)
      .order('event_date', { ascending: true, nullsFirst: false });
    if (data) setSourceEvents(prev => ({ ...prev, [sourceId]: data }));
  }

  async function fetchLogsForSource(sourceId: string) {
    const { data } = await supabase
      .from('external_event_scrape_logs')
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(10);
    if (data) setSourceLogs(prev => ({ ...prev, [sourceId]: data }));
  }

  function toggleExpand(sourceId: string) {
    if (expandedSource === sourceId) {
      setExpandedSource(null);
    } else {
      setExpandedSource(sourceId);
      fetchEventsForSource(sourceId);
    }
  }

  function toggleLogs(sourceId: string) {
    if (expandedLogs === sourceId) {
      setExpandedLogs(null);
    } else {
      setExpandedLogs(sourceId);
      fetchLogsForSource(sourceId);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.url.trim()) {
      setError('Name and URL are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('external_event_sources').insert({
      name: form.name.trim(),
      url: form.url.trim(),
      source_type: form.source_type,
      display_category: form.display_category,
      target_national_association_id: form.target_national_association_id || null,
      is_active: form.is_active,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess('Events source added successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchAll();
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleToggleActive(source: EventSource) {
    await supabase
      .from('external_event_sources')
      .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
      .eq('id', source.id);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this events source? All scraped events will also be deleted.')) return;
    await supabase.from('external_event_sources').delete().eq('id', id);
    setSources(prev => prev.filter(s => s.id !== id));
    setExpandedSource(null);
  }

  async function handleToggleEventVisibility(event: ScrapedEvent) {
    await supabase
      .from('external_events')
      .update({ is_visible: !event.is_visible, updated_at: new Date().toISOString() })
      .eq('id', event.id);
    setSourceEvents(prev => ({
      ...prev,
      [event.source_id]: (prev[event.source_id] || []).map(e =>
        e.id === event.id ? { ...e, is_visible: !e.is_visible } : e
      ),
    }));
  }

  async function handleUpdateEventCategory(event: ScrapedEvent, category: string) {
    setSourceEvents(prev => ({
      ...prev,
      [event.source_id]: (prev[event.source_id] || []).map(e =>
        e.id === event.id ? { ...e, display_category: category } : e
      ),
    }));
    const { error: updateError } = await supabase
      .from('external_events')
      .update({ display_category: category, updated_at: new Date().toISOString() })
      .eq('id', event.id);
    if (updateError) {
      setError(`Failed to save category: ${updateError.message}`);
      setTimeout(() => setError(null), 5000);
      setSourceEvents(prev => ({
        ...prev,
        [event.source_id]: (prev[event.source_id] || []).map(e =>
          e.id === event.id ? { ...e, display_category: event.display_category } : e
        ),
      }));
    }
  }

  async function handleFetchDetails() {
    setFetchingDetails(true);
    setError(null);
    setSuccess(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data?.session?.access_token;
      if (!token) { setError('Not authenticated.'); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ fetch_details: true }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setSuccess('Event details fetched successfully. Documents, venues, and types updated.');
      setTimeout(() => setSuccess(null), 6000);
      await fetchAll();
      if (expandedSource) fetchEventsForSource(expandedSource);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fetch details failed');
    } finally {
      setFetchingDetails(false);
    }
  }

  async function handleFetchSingleDetail(eventId: string) {
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data?.session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ event_row_id: eventId }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setSuccess('Event details updated.');
      setTimeout(() => setSuccess(null), 3000);
      if (expandedSource) fetchEventsForSource(expandedSource);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch event details');
    }
  }

  function handleEditEvent(ev: ScrapedEvent) {
    setEditingEvent(ev);
    setEditForm({
      event_name: ev.event_name || '',
      venue: ev.venue || '',
      location: ev.location || '',
      state_code: ev.state_code || '',
      event_date: ev.event_date ? ev.event_date.split('T')[0] : '',
      event_end_date: ev.event_end_date ? ev.event_end_date.split('T')[0] : '',
      boat_class_mapped: ev.boat_class_mapped || '',
      event_type: ev.event_type || 'club',
      event_status: ev.event_status || 'scheduled',
      registration_url: ev.registration_url || '',
    });
  }

  async function handleSaveEventEdit() {
    if (!editingEvent) return;
    setSavingEdit(true);
    const updates: Record<string, unknown> = {
      event_name: editForm.event_name.trim(),
      venue: editForm.venue.trim() || null,
      location: editForm.location.trim() || null,
      state_code: editForm.state_code.trim() || null,
      event_date: editForm.event_date || null,
      event_end_date: editForm.event_end_date || null,
      boat_class_mapped: editForm.boat_class_mapped.trim() || null,
      event_type: editForm.event_type,
      event_status: editForm.event_status,
      registration_url: editForm.registration_url.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from('external_events')
      .update(updates)
      .eq('id', editingEvent.id);
    setSavingEdit(false);
    if (updateError) {
      setError(`Failed to save: ${updateError.message}`);
      setTimeout(() => setError(null), 5000);
    } else {
      setSourceEvents(prev => ({
        ...prev,
        [editingEvent.source_id]: (prev[editingEvent.source_id] || []).map(e =>
          e.id === editingEvent.id ? { ...e, ...updates } as ScrapedEvent : e
        ),
      }));
      setEditingEvent(null);
      setSuccess('Event updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleRunNow(source: EventSource) {
    setRunningId(source.id);
    setError(null);
    setSuccess(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data?.session?.access_token;
      if (!token) {
        setError('Not authenticated. Please refresh the page.');
        clearTimeout(timeoutId);
        setRunningId(null);
        return;
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ source_id: source.id, manual: true }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      let result: Record<string, unknown> = {};
      try { result = await res.json(); } catch {
        throw new Error(`Server returned status ${res.status} (non-JSON response)`);
      }
      if (!res.ok || result.error) {
        throw new Error(String(result.error || result.message || `HTTP ${res.status}`));
      }
      const r = (result.results as Array<Record<string, unknown>>)?.[0];
      if (r && !r.error) {
        setSuccess(`Scraped "${source.name}": ${r.created ?? 0} new, ${r.updated ?? 0} updated, ${r.skipped ?? 0} skipped.`);
        setTimeout(() => setSuccess(null), 6000);
      } else if (r?.error) {
        setError(`Scrape error: ${r.error}`);
      } else {
        setSuccess(`Scrape completed for "${source.name}".`);
        setTimeout(() => setSuccess(null), 4000);
      }
      await fetchAll();
      if (expandedSource === source.id) fetchEventsForSource(source.id);
      if (expandedLogs === source.id) fetchLogsForSource(source.id);
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : 'Scrape failed';
      if (msg.toLowerCase().includes('abort')) {
        setError('Scrape timed out after 2 minutes. Check Logs to see if it completed.');
      } else {
        setError(msg);
      }
    } finally {
      setRunningId(null);
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '--';
    return new Date(iso).toLocaleString();
  };

  const formatShortDate = (iso: string | null) => {
    if (!iso) return '--';
    return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const categoryBadge = (cat: string) => {
    const isState = cat.startsWith('state_');
    const colorClass = cat === 'world'
      ? 'bg-amber-500/20 text-amber-300'
      : isState
        ? 'bg-green-500/20 text-green-300'
        : 'bg-blue-500/20 text-blue-300';
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
        {getStateLabel(cat, stateAssociations)}
      </span>
    );
  };

  const statusBadge = (status: string) => {
    if (status === 'cancelled') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300">Cancelled</span>;
    if (status === 'postponed') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300">Postponed</span>;
    return null;
  };

  const eventTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      national: 'bg-blue-500/20 text-blue-300',
      state: 'bg-teal-500/20 text-teal-300',
      world: 'bg-amber-500/20 text-amber-300',
      invitational: 'bg-cyan-500/20 text-cyan-300',
      club: 'bg-slate-600/40 text-slate-300',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[type] || colors.club}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-600/20 border border-teal-500/30">
            <CalendarDays className="text-teal-400" size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">External Events Scraping</h2>
            <p className="text-sm text-slate-400">
              Scrape upcoming events from external websites and display them in the Race Calendar.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFetchDetails}
            disabled={fetchingDetails || runningId !== null}
            title="Fetch detailed info (venue, documents, type) for events missing details"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {fetchingDetails ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            {fetchingDetails ? 'Fetching...' : 'Fetch Details'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Source
          </button>
        </div>
      </div>

      {runningId && (
        <div className="flex items-center gap-2 p-3 bg-teal-900/30 border border-teal-700/50 rounded-lg text-teal-300 text-sm">
          <RefreshCw size={16} className="animate-spin flex-shrink-0" />
          Scraping in progress -- this may take up to 2 minutes. Please wait...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-red-300 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-200"><XCircle size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-green-300 text-sm">
          <CheckCircle size={16} className="flex-shrink-0" />
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Add Events Source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Source Name</label>
              <input
                type="text"
                placeholder="e.g. ARYA Events Feed"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">URL</label>
              <input
                type="url"
                placeholder="https://radiosailing.org.au/index.php?arcade=events"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Source Type</label>
              <select
                value={form.source_type}
                onChange={e => setForm(f => ({ ...f, source_type: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="event_list">Event List (discovers multiple events)</option>
                <option value="single_event">Single Event</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Display Under</label>
              <select
                value={form.display_category}
                onChange={e => setForm(f => ({ ...f, display_category: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="national">National Events</option>
                <option value="world">World Events</option>
                {stateAssociations.length > 0 && (
                  <optgroup label="State Events">
                    {stateAssociations.map(sa => (
                      <option key={sa.id} value={`state_${sa.id}`}>
                        {sa.abbreviation || sa.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">National Association (optional)</label>
              <select
                value={form.target_national_association_id}
                onChange={e => setForm(f => ({ ...f, target_national_association_id: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">-- None --</option>
                {nationals.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active_events"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="rounded border-slate-600"
            />
            <label htmlFor="is_active_events" className="text-sm text-slate-300">Active (scrape hourly)</label>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Source'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p>No event sources configured yet.</p>
          <p className="text-sm mt-1">Add a source to start scraping external upcoming events.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sources.map(source => (
            <div key={source.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className={`p-2 rounded-lg ${source.is_active ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                  <Globe size={18} className={source.is_active ? 'text-teal-400' : 'text-slate-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{source.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      source.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {categoryBadge(source.display_category)}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{source.url}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><List size={11} /> {source.event_count} events</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> Last scraped {formatDate(source.last_scraped_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRunNow(source)}
                    disabled={runningId !== null}
                    title="Run scrape now"
                    className="p-2 rounded-lg bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {runningId === source.id
                      ? <RefreshCw size={16} className="animate-spin" />
                      : <Play size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(source)}
                    disabled={runningId !== null}
                    title={source.is_active ? 'Deactivate' : 'Activate'}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                      source.is_active
                        ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-400'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${source.is_active ? 'bg-green-400' : 'bg-slate-500'}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpand(source.id)}
                    title="View scraped events"
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    {expandedSource === source.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLogs(source.id)}
                    title="View scrape logs"
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors text-xs font-medium"
                  >
                    Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(source.id)}
                    disabled={runningId !== null}
                    title="Delete source"
                    className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {expandedSource === source.id && (
                <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">
                    Scraped Events ({(sourceEvents[source.id] || []).length})
                  </h4>
                  {!(sourceEvents[source.id]?.length) ? (
                    <p className="text-xs text-slate-500 py-2">No events scraped yet. Run the scraper to discover events.</p>
                  ) : (
                    <div className="space-y-2">
                      {(sourceEvents[source.id] || []).map(ev => (
                        <div key={ev.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                          ev.is_visible ? 'bg-slate-800/40 border-slate-700/40' : 'bg-slate-900/40 border-slate-800/40 opacity-60'
                        }`}>
                          <CalendarDays size={14} className="text-teal-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">{ev.event_name}</span>
                              {ev.boat_class_mapped && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300">
                                  <Tag size={10} />
                                  {ev.boat_class_mapped}
                                </span>
                              )}
                              {eventTypeBadge(ev.event_type)}
                              {statusBadge(ev.event_status)}
                              {ev.ranking_event && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">Ranking</span>
                              )}
                              {categoryBadge(ev.display_category)}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                              {ev.event_date && <span>{formatShortDate(ev.event_date)}{ev.event_end_date ? ` - ${formatShortDate(ev.event_end_date)}` : ''}</span>}
                              {ev.venue && <span className="flex items-center gap-0.5"><MapPin size={10} />{ev.venue}</span>}
                              {ev.location && <span>{ev.location}</span>}
                              {ev.state_code && <span className="font-medium">{ev.state_code}</span>}
                              {ev.documents_json && ev.documents_json.length > 0 && (
                                <span className="flex items-center gap-0.5 text-teal-400">
                                  <FileText size={10} />
                                  {ev.documents_json.length} doc{ev.documents_json.length > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {ev.documents_json && ev.documents_json.length > 0 && (
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {ev.documents_json.map((doc, i) => (
                                  <a
                                    key={i}
                                    href={doc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                                  >
                                    <FileText size={10} />
                                    {doc.name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleEditEvent(ev)}
                            title="Edit event"
                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-amber-400 hover:bg-slate-600 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleFetchSingleDetail(ev.id)}
                            title="Re-fetch event details"
                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-teal-400 hover:bg-slate-600 transition-colors"
                          >
                            <RefreshCw size={13} />
                          </button>
                          <select
                            value={ev.display_category}
                            onChange={e => handleUpdateEventCategory(ev, e.target.value)}
                            className="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-300 focus:outline-none"
                          >
                            <option value="national">National</option>
                            <option value="world">World</option>
                            {stateAssociations.map(sa => (
                              <option key={sa.id} value={`state_${sa.id}`}>
                                {sa.abbreviation || sa.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleToggleEventVisibility(ev)}
                            title={ev.is_visible ? 'Hide from Calendar' : 'Show in Calendar'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              ev.is_visible
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-slate-700 text-slate-500 hover:bg-slate-600'
                            }`}
                          >
                            {ev.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {expandedLogs === source.id && (
                <div className="border-t border-slate-700/50 px-4 pb-4 pt-3">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Recent Scrape History</h4>
                  {!(sourceLogs[source.id]?.length) ? (
                    <p className="text-xs text-slate-500 py-2">No scrape history yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(sourceLogs[source.id] || []).map(log => (
                        <div key={log.id} className="flex items-start gap-2 text-xs">
                          {log.status === 'success' && <CheckCircle size={13} className="text-green-400 mt-0.5 flex-shrink-0" />}
                          {log.status === 'error' && <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />}
                          {log.status === 'running' && <RefreshCw size={13} className="text-teal-400 mt-0.5 flex-shrink-0 animate-spin" />}
                          <span className="text-slate-400">{formatDate(log.started_at)}</span>
                          {log.status === 'success' && (
                            <span className="text-slate-300">
                              {log.events_created} created, {log.events_updated} updated, {log.events_skipped} skipped
                            </span>
                          )}
                          {log.status === 'error' && (
                            <span className="text-red-400">{log.error_message}</span>
                          )}
                          {log.status === 'running' && <span className="text-slate-400">Running...</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Edit Event</h3>
              <button
                onClick={() => setEditingEvent(null)}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Event Name</label>
                <input
                  type="text"
                  value={editForm.event_name}
                  onChange={e => setEditForm(f => ({ ...f, event_name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Venue (Club Name)</label>
                  <input
                    type="text"
                    value={editForm.venue}
                    onChange={e => setEditForm(f => ({ ...f, venue: e.target.value }))}
                    placeholder="e.g. Lake Macquarie Radio Yacht Club"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Grahamstown Dam, NSW"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editForm.event_date}
                    onChange={e => setEditForm(f => ({ ...f, event_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editForm.event_end_date}
                    onChange={e => setEditForm(f => ({ ...f, event_end_date: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">State Code</label>
                  <input
                    type="text"
                    value={editForm.state_code}
                    onChange={e => setEditForm(f => ({ ...f, state_code: e.target.value }))}
                    placeholder="e.g. NSW"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Boat Class</label>
                  <input
                    type="text"
                    value={editForm.boat_class_mapped}
                    onChange={e => setEditForm(f => ({ ...f, boat_class_mapped: e.target.value }))}
                    placeholder="e.g. DF65"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Event Type</label>
                  <select
                    value={editForm.event_type}
                    onChange={e => setEditForm(f => ({ ...f, event_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="club">Club</option>
                    <option value="state">State</option>
                    <option value="national">National</option>
                    <option value="world">World</option>
                    <option value="invitational">Invitational</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                  <select
                    value={editForm.event_status}
                    onChange={e => setEditForm(f => ({ ...f, event_status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="postponed">Postponed</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Registration URL</label>
                <input
                  type="url"
                  value={editForm.registration_url}
                  onChange={e => setEditForm(f => ({ ...f, registration_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-700">
              <button
                onClick={() => setEditingEvent(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEventEdit}
                disabled={savingEdit || !editForm.event_name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Save size={14} />
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
