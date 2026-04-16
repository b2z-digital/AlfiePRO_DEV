import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Trash2, UserPlus, X, CircleAlert as AlertCircle, RefreshCw, Flag, Circle as XCircle, Loader as Loader2, Mail, Send, CircleCheck as CheckCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface RaceOfficersManagementTabProps {
  darkMode: boolean;
}

interface RaceOfficerUser {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  is_race_officer: boolean;
  created_at: string;
}

interface PlatformUser {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
}

type AddMode = 'search' | 'invite';

export function RaceOfficersManagementTab({ darkMode }: RaceOfficersManagementTabProps) {
  const { user } = useAuth();
  const [raceOfficers, setRaceOfficers] = useState<RaceOfficerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PlatformUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ status: string; message: string; temp_password?: string } | null>(null);
  const searchTimeout = useRef<any>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('get_race_officers_for_super_admin');
      setRaceOfficers(data || []);
    } catch (err) {
      console.error('Error loading race officers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!term.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc('search_platform_users_for_super_admin', {
          p_search_term: term.trim()
        });
        if (!error && data) {
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const addRaceOfficer = async (pu: PlatformUser) => {
    setToggling(pu.user_id);
    try {
      await supabase.rpc('set_race_officer_status', {
        p_user_id: pu.user_id,
        p_is_race_officer: true
      });
      await loadData();
      setShowAdd(false);
      setSearchTerm('');
      setSearchResults([]);
    } catch (err) {
      console.error('Error adding race officer:', err);
    } finally {
      setToggling(null);
    }
  };

  const removeRaceOfficer = async (userId: string) => {
    setToggling(userId);
    try {
      await supabase.rpc('set_race_officer_status', {
        p_user_id: userId,
        p_is_race_officer: false
      });
      setRaceOfficers(prev => prev.filter(ro => ro.user_id !== userId));
      setRemoveConfirm(null);
    } catch (err) {
      console.error('Error removing race officer:', err);
    } finally {
      setToggling(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-race-officer`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            name: inviteName.trim(),
          }),
        }
      );
      const result = await res.json();
      if (res.ok) {
        setInviteResult(result);
        await loadData();
      } else {
        setInviteResult({ status: 'error', message: result.error || 'Failed to invite user' });
      }
    } catch {
      setInviteResult({ status: 'error', message: 'Network error - please try again' });
    } finally {
      setInviting(false);
    }
  };

  const resetAddPanel = () => {
    setShowAdd(false);
    setAddMode('search');
    setSearchTerm('');
    setSearchResults([]);
    setInviteEmail('');
    setInviteName('');
    setInviteResult(null);
  };

  const existingIds = raceOfficers.map(ro => ro.user_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
            <Flag className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Race Officers</h1>
            <p className="text-sm text-slate-400">
              {raceOfficers.length} race officer{raceOfficers.length !== 1 ? 's' : ''} configured
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors"
        >
          <UserPlus size={16} /> Add Race Officer
        </button>
      </div>

      <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
        <h3 className="text-sm font-medium text-slate-300 mb-2">What are Race Officers?</h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          Race Officers are users who can run race management independently without needing a club membership.
          They get access to Race Management, Race Calendar, Results, and their own Contacts book.
          This is useful for volunteer race officers who officiate across multiple clubs.
        </p>
      </div>

      {showAdd && (
        <div className="rounded-2xl border p-6 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-5">
            <h4 className="font-semibold text-white">Add Race Officer</h4>
            <button onClick={resetAddPanel}>
              <X size={16} className="text-slate-400 hover:text-slate-200 transition-colors" />
            </button>
          </div>

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => { setAddMode('search'); setInviteResult(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                addMode === 'search'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:text-slate-300'
              }`}
            >
              <Search size={14} /> Existing User
            </button>
            <button
              onClick={() => { setAddMode('invite'); setSearchTerm(''); setSearchResults([]);  }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                addMode === 'invite'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:text-slate-300'
              }`}
            >
              <Mail size={14} /> Invite New Person
            </button>
          </div>

          {addMode === 'search' && (
            <>
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5">
                <AlertCircle size={12} /> Search for an existing Alfie user by name or email address.
              </p>
              {searching && <p className="text-sm text-slate-400 py-4 text-center">Searching...</p>}
              {!searching && searchTerm.length >= 2 && searchResults.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500">No users found matching "{searchTerm}"</p>
                  <button
                    onClick={() => { setAddMode('invite'); setInviteEmail(searchTerm.includes('@') ? searchTerm : ''); }}
                    className="mt-3 text-sm text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    Invite them as a new user instead?
                  </button>
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {searchResults.map(u => {
                    const alreadyRo = existingIds.includes(u.user_id);
                    return (
                      <div key={u.user_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-slate-700 flex-shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            ) : (
                              <span className="text-slate-300 text-xs font-bold">{(u.full_name || u.email || '?').charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{u.full_name || 'No name'}</p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                        {alreadyRo ? (
                          <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Already RO</span>
                        ) : (
                          <button
                            onClick={() => addRaceOfficer(u)}
                            disabled={toggling === u.user_id}
                            className="px-4 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                          >
                            {toggling === u.user_id ? 'Adding...' : 'Add as RO'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {addMode === 'invite' && (
            <>
              {inviteResult ? (
                <div className={`rounded-xl p-5 border ${
                  inviteResult.status === 'error'
                    ? 'bg-red-500/10 border-red-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  <div className="flex items-start gap-3">
                    {inviteResult.status === 'error' ? (
                      <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle size={20} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${inviteResult.status === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
                        {inviteResult.status === 'error' ? 'Error' : 'Success'}
                      </p>
                      <p className={`text-sm mt-1 ${inviteResult.status === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {inviteResult.message}
                      </p>
                      {inviteResult.temp_password && (
                        <div className="mt-3 p-3 rounded-lg bg-slate-800/80 border border-slate-700/50">
                          <p className="text-xs text-slate-400 mb-1">Temporary Password (share with user):</p>
                          <p className="text-sm font-mono text-white select-all">{inviteResult.temp_password}</p>
                        </div>
                      )}
                      <button
                        onClick={() => { setInviteResult(null); setInviteEmail(''); setInviteName(''); }}
                        className="mt-3 text-sm text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {inviteResult.status === 'error' ? 'Try again' : 'Invite another'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleInvite} className="space-y-4">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Mail size={12} /> Create a new Alfie account and grant Race Officer access. They will receive a welcome email with login details.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Email Address *</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="raceofficer@example.com"
                      required
                      className="w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name (optional)</label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-4 py-2.5 rounded-xl border text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                    >
                      {inviting ? (
                        <><Loader2 size={16} className="animate-spin" /> Creating Account...</>
                      ) : (
                        <><Send size={16} /> Create & Invite</>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        {raceOfficers.length === 0 ? (
          <div className="rounded-2xl border p-16 text-center bg-slate-800/30 border-slate-700/50">
            <Flag size={40} className="mx-auto mb-3 text-slate-600" />
            <p className="text-slate-400 font-medium">No race officers configured</p>
            <p className="text-slate-500 text-sm mt-1">Add users as race officers to allow independent race management</p>
          </div>
        ) : (
          raceOfficers.map(ro => (
            <div key={ro.user_id} className="flex items-center justify-between p-5 rounded-2xl border backdrop-blur-sm transition-all bg-slate-800/30 border-slate-700/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-sky-500/20 flex-shrink-0">
                  {ro.avatar_url ? (
                    <img src={ro.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <span className="text-sky-400 font-bold text-sm">
                      {(ro.full_name || ro.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white">{ro.full_name || 'No name'}</p>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/20">
                      <Flag size={10} /> Race Officer
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-0.5">{ro.email}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Added {new Date(ro.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (removeConfirm === ro.user_id) {
                    removeRaceOfficer(ro.user_id);
                  } else {
                    setRemoveConfirm(ro.user_id);
                  }
                }}
                disabled={toggling === ro.user_id}
                className={`p-2.5 rounded-xl transition-colors ${
                  removeConfirm === ro.user_id ? 'bg-red-500/20 text-red-400' : 'hover:bg-red-500/20 text-red-400'
                } disabled:opacity-50`}
                title={removeConfirm === ro.user_id ? 'Click again to confirm removal' : 'Remove race officer status'}
              >
                {toggling === ro.user_id ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : removeConfirm === ro.user_id ? (
                  <XCircle size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
