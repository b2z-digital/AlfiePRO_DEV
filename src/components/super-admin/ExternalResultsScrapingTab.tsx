import { useState, useEffect } from 'react';
import {
  Globe, Plus, Trash2, Play, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronUp, AlertCircle, Eye, EyeOff, RefreshCw,
  Trophy, List, Tag, Wrench
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface ExternalResultsScrapingTabProps {
  darkMode: boolean;
}

interface ResultSource {
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

interface ResultEvent {
  id: string;
  source_id: string;
  external_event_id: string;
  event_name: string;
  event_date: string | null;
  venue: string | null;
  boat_class_raw: string | null;
  boat_class_mapped: string | null;
  competitor_count: number;
  race_count: number;
  is_visible: boolean;
  display_category: string;
  last_scraped_at: string | null;
  source_url: string;
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

const STATE_ABBREV_MAP: Record<string, string> = {
  'NSW': 'NSW',
  'VIC': 'VIC',
  'QLD': 'QLD',
  'SA': 'SA',
  'WA': 'WA',
  'TAS': 'TAS',
  'ACT': 'ACT',
  'NT': 'NT',
};

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

export function ExternalResultsScrapingTab({ darkMode }: ExternalResultsScrapingTabProps) {
  const [sources, setSources] = useState<ResultSource[]>([]);
  const [nationals, setNationals] = useState<NationalAssoc[]>([]);
  const [stateAssociations, setStateAssociations] = useState<StateAssoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [sourceEvents, setSourceEvents] = useState<Record<string, ResultEvent[]>>({});
  const [sourceLogs, setSourceLogs] = useState<Record<string, ScrapeLog[]>>({});
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fixingNames, setFixingNames] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [sourcesRes, nationalsRes, statesRes] = await Promise.all([
      supabase.from('external_result_sources').select('*').order('created_at', { ascending: false }),
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
      .from('external_result_events')
      .select('id,source_id,external_event_id,event_name,event_date,venue,boat_class_raw,boat_class_mapped,competitor_count,race_count,is_visible,display_category,last_scraped_at,source_url')
      .eq('source_id', sourceId)
      .order('event_date', { ascending: false });
    if (data) setSourceEvents(prev => ({ ...prev, [sourceId]: data }));
  }

  async function fetchLogsForSource(sourceId: string) {
    const { data } = await supabase
      .from('external_result_scrape_logs')
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
    const payload = {
      name: form.name.trim(),
      url: form.url.trim(),
      source_type: form.source_type,
      display_category: form.display_category,
      target_national_association_id: form.target_national_association_id || null,
      is_active: form.is_active,
    };
    const { error: err } = await supabase.from('external_result_sources').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess('Results source added successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchAll();
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleToggleActive(source: ResultSource) {
    await supabase
      .from('external_result_sources')
      .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
      .eq('id', source.id);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this results source? All scraped events will also be deleted.')) return;
    await supabase.from('external_result_sources').delete().eq('id', id);
    setSources(prev => prev.filter(s => s.id !== id));
    setExpandedSource(null);
  }

  async function handleToggleEventVisibility(event: ResultEvent) {
    await supabase
      .from('external_result_events')
      .update({ is_visible: !event.is_visible, updated_at: new Date().toISOString() })
      .eq('id', event.id);
    setSourceEvents(prev => ({
      ...prev,
      [event.source_id]: (prev[event.source_id] || []).map(e =>
        e.id === event.id ? { ...e, is_visible: !e.is_visible } : e
      ),
    }));
  }

  async function handleUpdateEventCategory(event: ResultEvent, category: string) {
    await supabase
      .from('external_result_events')
      .update({ display_category: category, updated_at: new Date().toISOString() })
      .eq('id', event.id);
    setSourceEvents(prev => ({
      ...prev,
      [event.source_id]: (prev[event.source_id] || []).map(e =>
        e.id === event.id ? { ...e, display_category: category } : e
      ),
    }));
  }

  async function handleFixBadNames() {
    setFixingNames(true);
    setError(null);
    setSuccess(null);
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data?.session?.access_token;
      if (!token) { setError('Not authenticated.'); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-external-results`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ fix_bad_names: true }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setSuccess(`Fixed ${result.fixed} of ${result.total} records. Run again if more remain.`);
      setTimeout(() => setSuccess(null), 8000);
      await fetchAll();
      if (expandedSource) fetchEventsForSource(expandedSource);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fix failed');
    } finally {
      setFixingNames(false);
    }
  }

  async function handleRunNow(source: ResultSource) {
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-external-results`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ source_id: source.id, manual: true }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      let result: Record<string, unknown> = {};
      try {
        result = await res.json();
      } catch {
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
        setError('Scrape timed out after 2 minutes. The site may be slow — check Logs to see if it completed.');
      } else {
        setError(msg);
      }
    } finally {
      setRunningId(null);
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  const formatShortDate = (iso: string | null) => {
    if (!iso) return '—';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30">
            <Trophy className="text-amber-400" size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">External Results Scraping</h2>
            <p className="text-sm text-slate-400">
              Scrape race results from external websites and display them in the Results section.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleFixBadNames}
            disabled={fixingNames || runningId !== null}
            title="Re-fetch individual event pages to fix events showing only 'Results' as name"
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {fixingNames ? <RefreshCw size={16} className="animate-spin" /> : <Wrench size={16} />}
            {fixingNames ? 'Fixing...' : 'Fix Event Names'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Source
          </button>
        </div>
      </div>

      {/* Running indicator */}
      {runningId && (
        <div className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300 text-sm">
          <RefreshCw size={16} className="animate-spin flex-shrink-0" />
          Scraping in progress — this may take up to 2 minutes for large event lists. Please wait...
        </div>
      )}

      {/* Feedback */}
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

      {/* Add Source Form */}
      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Add Results Source</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Source Name</label>
              <input
                type="text"
                placeholder="e.g. ARYA Results Feed"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">URL</label>
              <input
                type="url"
                placeholder="https://example.com/results-list"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Source Type</label>
              <select
                value={form.source_type}
                onChange={e => setForm(f => ({ ...f, source_type: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="event_list">Event List (discovers multiple events)</option>
                <option value="single_event">Single Event (direct results page)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Display Under</label>
              <select
                value={form.display_category}
                onChange={e => setForm(f => ({ ...f, display_category: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">— None —</option>
                {nationals.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="rounded border-slate-600"
            />
            <label htmlFor="is_active" className="text-sm text-slate-300">Active (scrape daily)</label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
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

      {/* Sources List */}
      {sources.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Trophy size={40} className="mx-auto mb-3 opacity-30" />
          <p>No results sources configured yet.</p>
          <p className="text-sm mt-1">Add a source to start scraping external race results.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sources.map(source => (
            <div key={source.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
              {/* Source Header */}
              <div className="flex items-center gap-3 p-4">
                <div className={`p-2 rounded-lg ${source.is_active ? 'bg-amber-500/20' : 'bg-slate-700'}`}>
                  <Globe size={18} className={source.is_active ? 'text-amber-400' : 'text-slate-500'} />
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
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400">
                      {source.source_type === 'event_list' ? 'Event List' : 'Single Event'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{source.url}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><List size={11} /> {source.event_count} events scraped</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> Last scraped {formatDate(source.last_scraped_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Run Now */}
                  <button
                    type="button"
                    onClick={() => handleRunNow(source)}
                    disabled={runningId !== null}
                    title="Run scrape now"
                    className="p-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {runningId === source.id
                      ? <RefreshCw size={16} className="animate-spin" />
                      : <Play size={16} />}
                  </button>
                  {/* Toggle Active */}
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
                  {/* Expand events */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(source.id)}
                    title="View scraped events"
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    {expandedSource === source.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {/* Logs */}
                  <button
                    type="button"
                    onClick={() => toggleLogs(source.id)}
                    title="View scrape logs"
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors text-xs font-medium"
                  >
                    Logs
                  </button>
                  {/* Delete */}
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

              {/* Scraped Events */}
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
                          <Trophy size={14} className="text-amber-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">{ev.event_name}</span>
                              {ev.boat_class_mapped && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-300">
                                  <Tag size={10} />
                                  {ev.boat_class_mapped}
                                </span>
                              )}
                              {categoryBadge(ev.display_category)}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                              {ev.event_date && <span>{formatShortDate(ev.event_date)}</span>}
                              {ev.venue && <span>{ev.venue}</span>}
                              <span>{ev.competitor_count} competitors</span>
                              <span>{ev.race_count} races</span>
                            </div>
                          </div>
                          {/* Per-event category override */}
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
                          {/* Visibility toggle */}
                          <button
                            onClick={() => handleToggleEventVisibility(ev)}
                            title={ev.is_visible ? 'Hide from Results page' : 'Show in Results page'}
                            className={`p-1.5 rounded-lg transition-colors ${
                              ev.is_visible
                                ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'bg-slate-700 text-slate-500 hover:bg-slate-600'
                            }`}
                          >
                            {ev.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          {/* Open source */}
                          <a
                            href={ev.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                          >
                            <Globe size={14} />
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Scrape Logs */}
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
                          {log.status === 'running' && <RefreshCw size={13} className="text-amber-400 mt-0.5 flex-shrink-0 animate-spin" />}
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
    </div>
  );
}
