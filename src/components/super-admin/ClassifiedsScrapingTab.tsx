import { useState, useEffect } from 'react';
import {
  Globe, Plus, Trash2, Play, RefreshCw, CheckCircle, XCircle,
  Clock, ChevronDown, ChevronUp, AlertCircle, Tag, ExternalLink, ShoppingBag
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface ClassifiedsScrapingTabProps {
  darkMode: boolean;
}

interface ScrapeSource {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_scraped_at: string | null;
  listing_count: number;
  created_at: string;
}

interface ScrapeLog {
  id: string;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  listings_found: number;
  listings_created: number;
  listings_updated: number;
  listings_removed: number;
  status: 'running' | 'success' | 'error';
  error_message: string | null;
}

interface ScrapedListing {
  id: string;
  title: string;
  price: number | null;
  boat_class: string | null;
  category: string | null;
  source_url: string | null;
  external_source_id: string | null;
  created_at: string;
  is_public: boolean;
}

const EMPTY_FORM = {
  name: '',
  url: '',
  is_active: true,
};

export function ClassifiedsScrapingTab({ darkMode }: ClassifiedsScrapingTabProps) {
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [expandedListings, setExpandedListings] = useState<string | null>(null);
  const [sourceLogs, setSourceLogs] = useState<Record<string, ScrapeLog[]>>({});
  const [sourceListings, setSourceListings] = useState<Record<string, ScrapedListing[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from('classified_scrape_sources')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setSources(data);
    setLoading(false);
  }

  async function fetchLogsForSource(sourceId: string) {
    const { data } = await supabase
      .from('classified_scrape_logs')
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(10);
    if (data) setSourceLogs(prev => ({ ...prev, [sourceId]: data }));
  }

  async function fetchListingsForSource(_sourceId: string) {
    const { data } = await supabase
      .from('classifieds')
      .select('id, title, price, boat_class, category, source_url, external_source_id, created_at, is_public')
      .eq('is_scraped', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setSourceListings(prev => ({ ...prev, [_sourceId]: data }));
  }

  function toggleLogs(sourceId: string) {
    if (expandedLogs === sourceId) {
      setExpandedLogs(null);
    } else {
      setExpandedLogs(sourceId);
      fetchLogsForSource(sourceId);
    }
  }

  function toggleListings(sourceId: string) {
    if (expandedListings === sourceId) {
      setExpandedListings(null);
    } else {
      setExpandedListings(sourceId);
      fetchListingsForSource(sourceId);
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
      is_active: form.is_active,
    };
    const { error: err } = await supabase.from('classified_scrape_sources').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess('Classifieds source added successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchAll();
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleToggleActive(source: ScrapeSource) {
    await supabase
      .from('classified_scrape_sources')
      .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
      .eq('id', source.id);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this classifieds source? All scrape logs will also be deleted.')) return;
    await supabase.from('classified_scrape_sources').delete().eq('id', id);
    setSources(prev => prev.filter(s => s.id !== id));
  }

  async function handleRunNow(source: ScrapeSource) {
    setRunningId(source.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-classifieds`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ source_id: source.id }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      const result = await res.json();
      if (result.error) throw new Error(result.error);

      const sourceResult = result.results?.[0];
      if (sourceResult) {
        setSuccess(
          `Scraped "${source.name}": ${sourceResult.found} found, ${sourceResult.created} created, ${sourceResult.updated} updated, ${sourceResult.removed} removed.`
        );
        setTimeout(() => setSuccess(null), 6000);
      }
      fetchAll();
      if (expandedLogs === source.id) fetchLogsForSource(source.id);
      if (expandedListings === source.id) fetchListingsForSource(source.id);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError('Scrape timed out after 2 minutes. It may still be running in the background.');
      } else {
        setError(e instanceof Error ? e.message : 'Scrape failed');
      }
    }
    setRunningId(null);
  }

  function formatPrice(price: number | null): string {
    if (price === null || price === 0) return 'No price';
    return `$${price.toLocaleString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Tag size={24} className="text-amber-400" />
            Classifieds Scraping
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            Configure external classifieds sources to be scraped every 2 hours and published as public listings.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Add Source
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-teal-500/10 border border-teal-500/30 rounded-lg text-teal-400 text-sm">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
          <h3 className="text-white font-semibold">Add Classifieds Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Source Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. ARYA Classifieds"
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Classifieds Index URL</label>
              <input
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://radiosailing.org.au/index.php?arcade=classifieds"
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${form.is_active ? 'bg-amber-500' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-slate-300">Active (include in scheduled scraping)</span>
            </label>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Save Source'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(null); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={24} className="animate-spin text-slate-500" />
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Tag size={40} className="text-slate-600 mb-3" />
          <p className="text-slate-400">No classifieds sources configured yet.</p>
          <p className="text-slate-500 text-sm mt-1">Add a source to start scraping classifieds listings.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => (
            <div key={source.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <Globe size={20} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${source.is_active ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-600/50 text-slate-400'}`}>
                      {source.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-amber-400 transition-colors truncate block mt-0.5"
                  >
                    {source.url}
                  </a>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <ShoppingBag size={12} />
                      {source.listing_count} listings scraped
                    </span>
                    {source.last_scraped_at && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        Last scraped {new Date(source.last_scraped_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRunNow(source)}
                    disabled={runningId === source.id}
                    title="Run scrape now"
                    className="p-2 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {runningId === source.id
                      ? <RefreshCw size={15} className="animate-spin" />
                      : <Play size={15} />
                    }
                  </button>
                  <button
                    onClick={() => handleToggleActive(source)}
                    title={source.is_active ? 'Pause source' : 'Activate source'}
                    className="p-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${source.is_active ? 'border-amber-400 bg-amber-400' : 'border-slate-500'}`} />
                  </button>
                  <button
                    onClick={() => toggleListings(source.id)}
                    title="View scraped listings"
                    className="p-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                  >
                    <ShoppingBag size={15} />
                  </button>
                  <button
                    onClick={() => toggleLogs(source.id)}
                    title="View scrape history"
                    className="p-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 rounded-lg transition-colors"
                  >
                    {expandedLogs === source.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    title="Delete source"
                    className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {expandedListings === source.id && (
                <div className="border-t border-slate-700/50 px-4 py-3">
                  <p className="text-xs text-slate-400 font-medium mb-2">Scraped Listings (latest 50)</p>
                  {!sourceListings[source.id] ? (
                    <p className="text-xs text-slate-500">Loading...</p>
                  ) : sourceListings[source.id].length === 0 ? (
                    <p className="text-xs text-slate-500">No scraped listings yet. Run the scraper to populate.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {sourceListings[source.id].map(listing => (
                        <div key={listing.id} className="flex items-center gap-3 text-xs bg-slate-800/40 rounded-lg px-3 py-2">
                          <Tag size={13} className="text-amber-400 flex-shrink-0" />
                          <span className="text-white truncate flex-1">{listing.title}</span>
                          {listing.boat_class && (
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 text-xs flex-shrink-0">
                              {listing.boat_class}
                            </span>
                          )}
                          <span className="text-slate-400 flex-shrink-0">{formatPrice(listing.price)}</span>
                          {listing.source_url && (
                            <a
                              href={listing.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-500 hover:text-amber-400 transition-colors flex-shrink-0"
                              title="View original listing"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {expandedLogs === source.id && (
                <div className="border-t border-slate-700/50 px-4 py-3">
                  <p className="text-xs text-slate-400 font-medium mb-2">Recent Scrape History</p>
                  {!sourceLogs[source.id] ? (
                    <p className="text-xs text-slate-500">Loading...</p>
                  ) : sourceLogs[source.id].length === 0 ? (
                    <p className="text-xs text-slate-500">No scrape history yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {sourceLogs[source.id].map(log => (
                        <div key={log.id} className="flex items-center gap-3 text-xs">
                          {log.status === 'success' && <CheckCircle size={13} className="text-teal-400 flex-shrink-0" />}
                          {log.status === 'error' && <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                          {log.status === 'running' && <RefreshCw size={13} className="text-yellow-400 animate-spin flex-shrink-0" />}
                          <span className="text-slate-400">{new Date(log.started_at).toLocaleString()}</span>
                          {log.status === 'success' && (
                            <span className="text-slate-300">
                              {log.listings_found} found, {log.listings_created} created, {log.listings_updated} updated, {log.listings_removed} removed
                            </span>
                          )}
                          {log.status === 'error' && (
                            <span className="text-red-400 truncate">{log.error_message}</span>
                          )}
                          {log.status === 'running' && (
                            <span className="text-yellow-400">Running...</span>
                          )}
                          {log.completed_at && log.status === 'success' && (
                            <span className="text-slate-500 ml-auto">
                              {Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s
                            </span>
                          )}
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

      <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
        <p className="text-xs text-slate-400 font-medium mb-1">How it works</p>
        <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
          <li>Each active source is scraped automatically every 2 hours.</li>
          <li>The scraper visits the index URL, discovers listing links, and fetches each listing's details (title, description, price, location, contact, images, boat class).</li>
          <li>Listings are created as public "External Listings" in the classifieds section.</li>
          <li>Duplicate listings (same external ID) are updated rather than duplicated.</li>
          <li>Listings removed from the source website are automatically deleted from AlfiePRO.</li>
          <li>Use "Run Now" to trigger a manual scrape at any time.</li>
        </ul>
      </div>
    </div>
  );
}
