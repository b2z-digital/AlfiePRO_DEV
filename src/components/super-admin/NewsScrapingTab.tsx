import { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, Play, RefreshCw, CheckCircle, XCircle, Clock, Newspaper, Building, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface NewsScrapingTabProps {
  darkMode: boolean;
}

interface ScrapeSource {
  id: string;
  name: string;
  url: string;
  target_type: 'state' | 'national' | 'all_states';
  target_national_association_id: string | null;
  target_state_association_id: string | null;
  is_active: boolean;
  last_scraped_at: string | null;
  article_count: number;
  created_at: string;
}

interface ScrapeLog {
  id: string;
  source_id: string;
  started_at: string;
  completed_at: string | null;
  articles_found: number;
  articles_created: number;
  articles_skipped: number;
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
  national_association_id: string;
}

const EMPTY_FORM = {
  name: '',
  url: '',
  target_type: 'national' as const,
  target_national_association_id: '',
  target_state_association_id: '',
  is_active: true,
};

export function NewsScrapingTab({ darkMode }: NewsScrapingTabProps) {
  const [sources, setSources] = useState<ScrapeSource[]>([]);
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const [nationals, setNationals] = useState<NationalAssoc[]>([]);
  const [states, setStates] = useState<StateAssoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const [sourceLogs, setSourceLogs] = useState<Record<string, ScrapeLog[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [sourcesRes, nationalsRes, statesRes] = await Promise.all([
      supabase.from('news_scrape_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('national_associations').select('id, name').order('name'),
      supabase.from('state_associations').select('id, name, national_association_id').order('name'),
    ]);
    if (sourcesRes.data) setSources(sourcesRes.data);
    if (nationalsRes.data) setNationals(nationalsRes.data);
    if (statesRes.data) setStates(statesRes.data);
    setLoading(false);
  }

  async function fetchLogsForSource(sourceId: string) {
    const { data } = await supabase
      .from('news_scrape_logs')
      .select('*')
      .eq('source_id', sourceId)
      .order('started_at', { ascending: false })
      .limit(10);
    if (data) setSourceLogs(prev => ({ ...prev, [sourceId]: data }));
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
    if (form.target_type === 'national' && !form.target_national_association_id) {
      setError('Please select a national association.');
      return;
    }
    if (form.target_type === 'state' && !form.target_state_association_id) {
      setError('Please select a state association.');
      return;
    }
    if (form.target_type === 'all_states' && !form.target_national_association_id) {
      setError('Please select a national association (to determine which states to publish to).');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      url: form.url.trim(),
      target_type: form.target_type,
      target_national_association_id: form.target_national_association_id || null,
      target_state_association_id: form.target_type === 'state' ? form.target_state_association_id || null : null,
      is_active: form.is_active,
    };

    const { error: err } = await supabase.from('news_scrape_sources').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess('News source added successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchAll();
      setTimeout(() => setSuccess(null), 3000);
    }
  }

  async function handleToggleActive(source: ScrapeSource) {
    await supabase
      .from('news_scrape_sources')
      .update({ is_active: !source.is_active, updated_at: new Date().toISOString() })
      .eq('id', source.id);
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this news source? All scrape logs will also be deleted.')) return;
    await supabase.from('news_scrape_sources').delete().eq('id', id);
    setSources(prev => prev.filter(s => s.id !== id));
  }

  async function handleRunNow(source: ScrapeSource) {
    setRunningId(source.id);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-news-sources`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ source_id: source.id, manual: true }),
        }
      );
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      const sourceResult = result.results?.[0];
      if (sourceResult) {
        setSuccess(`Scraped "${source.name}": ${sourceResult.created} new articles, ${sourceResult.skipped} skipped.`);
        setTimeout(() => setSuccess(null), 5000);
      }
      fetchAll();
      if (expandedLogs === source.id) fetchLogsForSource(source.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scrape failed');
    }
    setRunningId(null);
  }

  const filteredStates = form.target_national_association_id
    ? states.filter(s => s.national_association_id === form.target_national_association_id)
    : states;

  const targetLabel = (source: ScrapeSource) => {
    if (source.target_type === 'national') {
      const n = nationals.find(n => n.id === source.target_national_association_id);
      return n ? `National: ${n.name}` : 'National Association';
    }
    if (source.target_type === 'state') {
      const s = states.find(s => s.id === source.target_state_association_id);
      return s ? `State: ${s.name}` : 'State Association';
    }
    const n = nationals.find(n => n.id === source.target_national_association_id);
    return n ? `All States under ${n.name}` : 'All States';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Newspaper size={24} className="text-teal-400" />
            News Scraping
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            Configure external news sources to be scraped daily and published to associations.
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors text-sm font-medium"
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
          <h3 className="text-white font-semibold">Add News Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Source Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Radio Sailing Australia"
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">News Index URL</label>
              <input
                type="url"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://radiosailing.org.au/index.php?arcade=news-latest"
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Publish To</label>
              <select
                value={form.target_type}
                onChange={e => setForm(f => ({ ...f, target_type: e.target.value as typeof f.target_type, target_state_association_id: '' }))}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50"
              >
                <option value="national">National Association</option>
                <option value="state">Specific State Association</option>
                <option value="all_states">All States under a National Association</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">National Association</label>
              <select
                value={form.target_national_association_id}
                onChange={e => setForm(f => ({ ...f, target_national_association_id: e.target.value, target_state_association_id: '' }))}
                className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50"
              >
                <option value="">Select national association...</option>
                {nationals.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            {form.target_type === 'state' && (
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">State Association</label>
                <select
                  value={form.target_state_association_id}
                  onChange={e => setForm(f => ({ ...f, target_state_association_id: e.target.value }))}
                  className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50"
                >
                  <option value="">Select state association...</option>
                  {filteredStates.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative w-9 h-5 rounded-full transition-colors ${form.is_active ? 'bg-teal-500' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-slate-300">Active (include in daily scrape)</span>
            </label>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
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
          <Newspaper size={40} className="text-slate-600 mb-3" />
          <p className="text-slate-400">No news sources configured yet.</p>
          <p className="text-slate-500 text-sm mt-1">Add a source to start scraping news articles daily.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => (
            <div key={source.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <Globe size={20} className="text-teal-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{source.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${source.is_active ? 'bg-teal-500/20 text-teal-400' : 'bg-slate-600/50 text-slate-400'}`}>
                      {source.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-slate-400 hover:text-teal-400 transition-colors truncate block mt-0.5"
                  >
                    {source.url}
                  </a>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Building size={12} />
                      {targetLabel(source)}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Newspaper size={12} />
                      {source.article_count} articles scraped
                    </span>
                    {source.last_scraped_at && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        Last scraped {new Date(source.last_scraped_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRunNow(source)}
                    disabled={runningId === source.id}
                    title="Run scrape now"
                    className="p-2 bg-teal-600/20 hover:bg-teal-600/40 text-teal-400 rounded-lg transition-colors disabled:opacity-50"
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
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${source.is_active ? 'border-teal-400 bg-teal-400' : 'border-slate-500'}`} />
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
                              {log.articles_created} created, {log.articles_skipped} skipped
                            </span>
                          )}
                          {log.status === 'error' && (
                            <span className="text-red-400 truncate">{log.error_message}</span>
                          )}
                          {log.status === 'running' && (
                            <span className="text-yellow-400">Running...</span>
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
          <li>Each active source is scraped automatically every day at 6am UTC.</li>
          <li>The scraper visits the index URL, finds article links, and fetches each article's title, content and cover image.</li>
          <li>Duplicate articles (same URL) are never stored twice.</li>
          <li>Articles are published immediately and appear in the target association's news feed.</li>
          <li>Clubs under those associations will automatically see the articles.</li>
          <li>Use "Run Now" to trigger a manual scrape at any time.</li>
        </ul>
      </div>
    </div>
  );
}
