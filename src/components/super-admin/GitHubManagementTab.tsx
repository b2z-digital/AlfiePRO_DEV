import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, GitCommit, GitPullRequest, GitMerge, Settings,
  RefreshCw, Loader2, CheckCircle, XCircle, Clock, Eye,
  ExternalLink, ChevronDown, ChevronRight, ArrowRight,
  AlertTriangle, Plus, Code2, Shield, Zap, Search,
  ArrowUpDown, MessageSquare, User, Calendar
} from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface GitHubManagementTabProps {
  darkMode: boolean;
  embedded?: boolean;
}

interface RepoInfo {
  full_name: string;
  description: string;
  default_branch: string;
  stargazers_count: number;
  open_issues_count: number;
  visibility: string;
  pushed_at: string;
  updated_at: string;
  language: string;
  size: number;
}

interface Branch {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
}

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
  html_url: string;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  head: { ref: string };
  base: { ref: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  html_url: string;
  body: string;
  draft: boolean;
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
}

interface CompareResult {
  status: string;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  commits: Commit[];
  files: { filename: string; status: string; additions: number; deletions: number; changes: number }[];
}

export function GitHubManagementTab({ darkMode, embedded = false }: GitHubManagementTabProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [repoName, setRepoName] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'branches' | 'commits' | 'pulls' | 'compare'>('overview');

  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const [selectedBranch, setSelectedBranch] = useState('main');
  const [compareBranches, setCompareBranches] = useState({ base: 'main', head: 'dev' });
  const [pullFilter, setPullFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [refreshing, setRefreshing] = useState(false);

  const [setupToken, setSetupToken] = useState('');
  const [setupRepo, setSetupRepo] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-proxy`;

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const apiFetch = useCallback(async (action: string, params?: Record<string, string>, method = 'GET', body?: any) => {
    const headers = await getHeaders();
    const queryParams = new URLSearchParams({ action, ...params });
    const res = await fetch(`${apiUrl}?${queryParams}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `API error ${res.status}`);
    }
    return res.json();
  }, [apiUrl, getHeaders]);

  useEffect(() => {
    checkConfig();
  }, []);

  const checkConfig = async () => {
    try {
      const data = await apiFetch('get-config');
      setConfigured(data.configured);
      setRepoName(data.repo || '');
      setHasToken(data.hasToken);
      if (data.configured) {
        loadAllData();
      } else {
        setLoading(false);
      }
    } catch {
      setConfigured(false);
      setLoading(false);
    }
  };

  const loadAllData = async () => {
    setRefreshing(true);
    try {
      const [repoData, branchesData, commitsData, pullsData] = await Promise.allSettled([
        apiFetch('repo'),
        apiFetch('branches'),
        apiFetch('commits', { branch: selectedBranch }),
        apiFetch('pulls', { state: pullFilter }),
      ]);

      if (repoData.status === 'fulfilled') setRepo(repoData.value);
      if (branchesData.status === 'fulfilled') setBranches(branchesData.value);
      if (commitsData.status === 'fulfilled') setCommits(commitsData.value);
      if (pullsData.status === 'fulfilled') setPulls(pullsData.value);
    } catch (err) {
      console.error('Error loading GitHub data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCommits = async (branch: string) => {
    setSelectedBranch(branch);
    try {
      const data = await apiFetch('commits', { branch });
      setCommits(data);
    } catch (err) {
      console.error('Error loading commits:', err);
    }
  };

  const loadPulls = async (state: 'open' | 'closed' | 'all') => {
    setPullFilter(state);
    try {
      const data = await apiFetch('pulls', { state });
      setPulls(data);
    } catch (err) {
      console.error('Error loading pulls:', err);
    }
  };

  const loadCompare = async () => {
    try {
      const data = await apiFetch('compare', {
        base: compareBranches.base,
        head: compareBranches.head,
      });
      setCompareResult(data);
    } catch (err) {
      console.error('Error loading compare:', err);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await apiFetch('save-config', {}, 'POST', {
        token: setupToken,
        repo: setupRepo,
      });
      setConfigured(true);
      setRepoName(setupRepo);
      setHasToken(true);
      setShowSettings(false);
      setSetupToken('');
      loadAllData();
    } catch (err) {
      console.error('Error saving config:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const cardClass = `rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`;
  const labelClass = `text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={32} className="animate-spin text-sky-500" />
      </div>
    );
  }

  if (!configured && !showSettings) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900">
            <Code2 className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">GitHub Repository</h1>
            <p className="text-sm text-slate-400">Source code management and deployment</p>
          </div>
        </div>

        <div className={`${cardClass} p-12 text-center`}>
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
            <Code2 size={32} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
          </div>
          <h2 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Connect Your GitHub Repository</h2>
          <p className={`text-sm mb-8 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Link your GitHub repository to view branches, commits, pull requests, and manage deployments directly from this dashboard.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="px-6 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20"
          >
            <Settings size={16} className="inline mr-2" />
            Configure GitHub
          </button>
        </div>
      </div>
    );
  }

  if (showSettings) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900">
            <Settings className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">GitHub Settings</h1>
            <p className="text-sm text-slate-400">Configure your repository connection</p>
          </div>
        </div>

        <div className={`${cardClass} p-8 max-w-lg`}>
          <div className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Repository (owner/repo)
              </label>
              <input
                type="text"
                value={setupRepo || repoName}
                onChange={(e) => setSetupRepo(e.target.value)}
                placeholder="e.g. your-org/your-repo"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:outline-none focus:ring-2 focus:ring-sky-500/40`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Personal Access Token
              </label>
              <input
                type="password"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
                placeholder={hasToken ? 'Token already saved (enter new to update)' : 'ghp_...'}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:outline-none focus:ring-2 focus:ring-sky-500/40`}
              />
              <p className={`text-xs mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Requires repo scope. Generate at GitHub Settings &gt; Developer settings &gt; Personal access tokens.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveConfig}
                disabled={saving || (!setupToken && !hasToken) || (!setupRepo && !repoName)}
                className="px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="inline animate-spin mr-2" /> : null}
                {saving ? 'Saving...' : 'Save & Connect'}
              </button>
              {configured && (
                <button
                  onClick={() => setShowSettings(false)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Code2 },
    { id: 'branches', label: 'Branches', icon: GitBranch },
    { id: 'commits', label: 'Commits', icon: GitCommit },
    { id: 'pulls', label: 'Pull Requests', icon: GitPullRequest },
    { id: 'compare', label: 'Compare', icon: ArrowUpDown },
  ] as const;

  return (
    <div className={embedded ? "space-y-6" : "space-y-8"}>
      {!embedded && (
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900">
              <Code2 className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">GitHub Repository</h1>
              <p className="text-sm text-slate-400">{repoName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAllData()}
              disabled={refreshing}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Settings size={16} />
            </button>
            {repo && (
              <a
                href={`https://github.com/${repoName}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <ExternalLink size={14} />
                Open in GitHub
              </a>
            )}
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">{repoName || 'Not configured'}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAllData()}
              disabled={refreshing}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-colors"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-800/50 transition-colors"
            >
              <Settings size={16} />
            </button>
            {repo && (
              <a
                href={`https://github.com/${repoName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                <ExternalLink size={14} />
                Open in GitHub
              </a>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'compare' && !compareResult) loadCompare();
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.id === 'pulls' && pulls.length > 0 && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                darkMode ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'
              }`}>
                {pulls.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && repo && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`${cardClass} p-5`}>
              <p className={labelClass}>Default Branch</p>
              <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                <GitBranch size={16} className="inline mr-1.5 text-emerald-500" />
                {repo.default_branch}
              </p>
            </div>
            <div className={`${cardClass} p-5`}>
              <p className={labelClass}>Branches</p>
              <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {branches.length}
              </p>
            </div>
            <div className={`${cardClass} p-5`}>
              <p className={labelClass}>Open Issues/PRs</p>
              <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {repo.open_issues_count}
              </p>
            </div>
            <div className={`${cardClass} p-5`}>
              <p className={labelClass}>Last Push</p>
              <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatDate(repo.pushed_at)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className={cardClass}>
              <div className="p-4 flex items-center justify-between">
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <GitBranch size={16} className="inline mr-2 text-emerald-500" />
                  Branches
                </h3>
              </div>
              <div className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {branches.slice(0, 8).map(branch => (
                  <div key={branch.name} className={`px-4 py-3 flex items-center justify-between ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                    <div className="flex items-center gap-2">
                      <GitBranch size={14} className={branch.name === repo.default_branch ? 'text-emerald-500' : 'text-slate-500'} />
                      <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {branch.name}
                      </span>
                      {branch.protected && (
                        <Shield size={12} className="text-amber-500" />
                      )}
                      {branch.name === repo.default_branch && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                          darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                        }`}>DEFAULT</span>
                      )}
                    </div>
                    <span className={`text-xs font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {branch.commit.sha.slice(0, 7)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <div className="p-4 flex items-center justify-between">
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <GitCommit size={16} className="inline mr-2 text-sky-500" />
                  Recent Commits
                </h3>
              </div>
              <div className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {commits.slice(0, 6).map(commit => (
                  <div key={commit.sha} className={`px-4 py-3 ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                    <div className="flex items-start gap-3">
                      {commit.author?.avatar_url ? (
                        <img src={commit.author.avatar_url} className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5" alt="" />
                      ) : (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <User size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {commit.commit.message.split('\n')[0]}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {commit.commit.author.name}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                          <span className={`text-xs font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {commit.sha.slice(0, 7)}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                          <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {formatDate(commit.commit.author.date)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {pulls.length > 0 && (
            <div className={cardClass}>
              <div className="p-4">
                <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <GitPullRequest size={16} className="inline mr-2 text-sky-500" />
                  Open Pull Requests
                </h3>
              </div>
              <div className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {pulls.filter(p => p.state === 'open').slice(0, 5).map(pr => (
                  <a
                    key={pr.id}
                    href={pr.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block px-4 py-3 ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <GitPullRequest size={16} className={pr.draft ? 'text-slate-500' : 'text-emerald-500'} />
                        <div>
                          <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {pr.title}
                            <span className={`ml-2 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>#{pr.number}</span>
                          </p>
                          <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {pr.head.ref} <ArrowRight size={10} className="inline mx-0.5" /> {pr.base.ref}
                            <span className="mx-1">&middot;</span>
                            {formatDate(pr.updated_at)}
                          </p>
                        </div>
                      </div>
                      <ExternalLink size={14} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'branches' && (
        <div className={cardClass}>
          <div className="p-4">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              All Branches ({branches.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-y border-slate-700/50 bg-slate-800/40' : 'text-slate-500 border-y border-slate-200 bg-slate-50'}`}>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Latest Commit</th>
                  <th className="px-4 py-3 text-center">Protected</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {branches.map(branch => (
                  <tr key={branch.name} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                    <td className={`px-4 py-3 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      <div className="flex items-center gap-2">
                        <GitBranch size={14} className={branch.name === repo?.default_branch ? 'text-emerald-500' : 'text-slate-500'} />
                        <span className="font-medium">{branch.name}</span>
                        {branch.name === repo?.default_branch && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                            darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                          }`}>DEFAULT</span>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 font-mono text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {branch.commit.sha.slice(0, 7)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {branch.protected ? (
                        <Shield size={14} className="inline text-amber-500" />
                      ) : (
                        <span className={darkMode ? 'text-slate-600' : 'text-slate-300'}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setSelectedBranch(branch.name); loadCommits(branch.name); setActiveTab('commits'); }}
                        className={`text-xs px-2 py-1 rounded-md transition-colors ${
                          darkMode ? 'text-sky-400 hover:bg-sky-500/15' : 'text-sky-600 hover:bg-sky-50'
                        }`}
                      >
                        View Commits
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'commits' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedBranch}
              onChange={(e) => loadCommits(e.target.value)}
              className={`px-3 py-2 rounded-xl border text-sm ${
                darkMode
                  ? 'bg-slate-700/50 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-sky-500/40`}
            >
              {branches.map(b => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className={cardClass}>
            <div className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
              {commits.map(commit => (
                <div key={commit.sha} className={`${darkMode ? 'hover:bg-slate-700/10' : 'hover:bg-slate-50'} transition-colors`}>
                  <div className="px-4 py-3 flex items-start gap-3">
                    {commit.author?.avatar_url ? (
                      <img src={commit.author.avatar_url} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" alt="" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        <User size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {commit.commit.message.split('\n')[0]}
                      </p>
                      {commit.commit.message.split('\n').length > 1 && (
                        <button
                          onClick={() => setExpandedCommit(expandedCommit === commit.sha ? null : commit.sha)}
                          className={`text-xs mt-1 ${darkMode ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-500'}`}
                        >
                          {expandedCommit === commit.sha ? 'Hide details' : 'Show more...'}
                        </button>
                      )}
                      {expandedCommit === commit.sha && (
                        <pre className={`text-xs mt-2 p-2 rounded-lg whitespace-pre-wrap ${
                          darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {commit.commit.message.split('\n').slice(1).join('\n').trim()}
                        </pre>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {commit.author?.login || commit.commit.author.name}
                        </span>
                        <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>&middot;</span>
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {formatDate(commit.commit.author.date)}
                        </span>
                      </div>
                    </div>
                    <a
                      href={commit.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex-shrink-0 px-2 py-1 rounded-md text-xs font-mono transition-colors ${
                        darkMode ? 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/20' : 'text-sky-600 bg-sky-50 hover:bg-sky-100'
                      }`}
                    >
                      {commit.sha.slice(0, 7)}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pulls' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(['open', 'closed', 'all'] as const).map(state => (
              <button
                key={state}
                onClick={() => loadPulls(state)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  pullFilter === state
                    ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                    : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {state}
              </button>
            ))}
          </div>

          <div className={cardClass}>
            {pulls.length === 0 ? (
              <div className="p-12 text-center">
                <GitPullRequest size={36} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  No {pullFilter === 'all' ? '' : pullFilter} pull requests found
                </p>
              </div>
            ) : (
              <div className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {pulls.map(pr => (
                  <a
                    key={pr.id}
                    href={pr.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block px-4 py-4 ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {pr.merged_at ? (
                          <GitMerge size={18} className="text-purple-500" />
                        ) : pr.state === 'closed' ? (
                          <GitPullRequest size={18} className="text-red-500" />
                        ) : pr.draft ? (
                          <GitPullRequest size={18} className="text-slate-500" />
                        ) : (
                          <GitPullRequest size={18} className="text-emerald-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {pr.title}
                          </p>
                          {pr.draft && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                              darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'
                            }`}>Draft</span>
                          )}
                        </div>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          #{pr.number} &middot; {pr.head.ref} <ArrowRight size={10} className="inline mx-0.5" /> {pr.base.ref}
                          <span className="mx-1">&middot;</span>
                          opened by {pr.user.login}
                          <span className="mx-1">&middot;</span>
                          {formatDate(pr.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {pr.comments > 0 && (
                          <span className={`flex items-center gap-1 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            <MessageSquare size={12} /> {pr.comments}
                          </span>
                        )}
                        <ExternalLink size={14} className={darkMode ? 'text-slate-600' : 'text-slate-300'} />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={compareBranches.base}
              onChange={(e) => setCompareBranches(prev => ({ ...prev, base: e.target.value }))}
              className={`px-3 py-2 rounded-xl border text-sm ${
                darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-sky-500/40`}
            >
              {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <ArrowRight size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
            <select
              value={compareBranches.head}
              onChange={(e) => setCompareBranches(prev => ({ ...prev, head: e.target.value }))}
              className={`px-3 py-2 rounded-xl border text-sm ${
                darkMode ? 'bg-slate-700/50 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-sky-500/40`}
            >
              {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <button
              onClick={loadCompare}
              className="px-4 py-2 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              Compare
            </button>
          </div>

          {compareResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className={`${cardClass} p-5 text-center`}>
                  <p className={labelClass}>Status</p>
                  <p className={`text-lg font-bold mt-1 capitalize ${darkMode ? 'text-white' : 'text-slate-900'}`}>{compareResult.status}</p>
                </div>
                <div className={`${cardClass} p-5 text-center`}>
                  <p className={labelClass}>Ahead</p>
                  <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>+{compareResult.ahead_by} commits</p>
                </div>
                <div className={`${cardClass} p-5 text-center`}>
                  <p className={labelClass}>Behind</p>
                  <p className={`text-lg font-bold mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>-{compareResult.behind_by} commits</p>
                </div>
              </div>

              {compareResult.files && compareResult.files.length > 0 && (
                <div className={cardClass}>
                  <div className="p-4">
                    <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Changed Files ({compareResult.files.length})
                    </h3>
                  </div>
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0">
                        <tr className={`text-left font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-y border-slate-700/50 bg-slate-800' : 'text-slate-500 border-y border-slate-200 bg-slate-50'}`}>
                          <th className="px-4 py-2">File</th>
                          <th className="px-4 py-2 text-center">Status</th>
                          <th className="px-4 py-2 text-right">+/-</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                        {compareResult.files.map(f => (
                          <tr key={f.filename} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}>
                            <td className={`px-4 py-2 font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{f.filename}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                f.status === 'added' ? darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700' :
                                f.status === 'removed' ? darkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700' :
                                darkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'
                              }`}>{f.status}</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className="text-emerald-500">+{f.additions}</span>
                              {' / '}
                              <span className="text-red-500">-{f.deletions}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {compareResult.commits && compareResult.commits.length > 0 && (
                <div className={cardClass}>
                  <div className="p-4">
                    <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Commits ({compareResult.total_commits})
                    </h3>
                  </div>
                  <div className={`divide-y max-h-64 overflow-y-auto ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                    {compareResult.commits.map(c => (
                      <div key={c.sha} className={`px-4 py-2.5 flex items-center gap-3 ${darkMode ? 'hover:bg-slate-700/10' : 'hover:bg-slate-50'}`}>
                        <span className={`font-mono text-xs flex-shrink-0 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}>{c.sha.slice(0, 7)}</span>
                        <span className={`text-xs truncate flex-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{c.commit.message.split('\n')[0]}</span>
                        <span className={`text-xs flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{formatDate(c.commit.author.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!compareResult && (
            <div className={`${cardClass} p-12 text-center`}>
              <ArrowUpDown size={36} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Select two branches and click Compare to see the differences
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
