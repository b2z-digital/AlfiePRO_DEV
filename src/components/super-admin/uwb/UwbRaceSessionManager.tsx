import React, { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';
import { Play, Square, Eye, Plus, Clock, Users, Trash2, Radio } from 'lucide-react';

interface RaceSession {
  id: string;
  config_id: string;
  course_layout_id: string | null;
  event_id: string | null;
  heat_id: string | null;
  name: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  wind_speed_knots: number | null;
  wind_direction_deg: number | null;
  recording_enabled: boolean;
  is_live: boolean;
  viewer_count: number;
  created_at: string;
}

interface CourseLayout {
  id: string;
  name: string;
  course_type: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  setup: { bg: 'bg-slate-700/50', text: 'text-slate-300', label: 'Setup' },
  pre_start: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Pre-Start' },
  racing: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', label: 'Racing' },
  finished: { bg: 'bg-sky-500/20', text: 'text-sky-300', label: 'Finished' },
  abandoned: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Abandoned' },
};

export function UwbRaceSessionManager({
  configId,
  onViewLive,
}: {
  configId: string;
  onViewLive: (sessionId: string) => void;
}) {
  const [sessions, setSessions] = useState<RaceSession[]>([]);
  const [layouts, setLayouts] = useState<CourseLayout[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newSession, setNewSession] = useState({
    name: '',
    course_layout_id: '',
    recording_enabled: true,
  });

  useEffect(() => {
    loadSessions();
    loadLayouts();
  }, [configId]);

  async function loadSessions() {
    const { data } = await supabase
      .from('uwb_race_sessions')
      .select('*')
      .eq('config_id', configId)
      .order('created_at', { ascending: false });
    setSessions(data || []);
  }

  async function loadLayouts() {
    const { data } = await supabase
      .from('uwb_course_layouts')
      .select('id, name, course_type')
      .eq('config_id', configId);
    setLayouts(data || []);
  }

  async function createSession() {
    if (!newSession.name) return;
    const { data, error } = await supabase
      .from('uwb_race_sessions')
      .insert({
        config_id: configId,
        name: newSession.name,
        course_layout_id: newSession.course_layout_id || null,
        recording_enabled: newSession.recording_enabled,
      })
      .select()
      .single();
    if (!error && data) {
      setSessions(prev => [data, ...prev]);
      setShowCreate(false);
      setNewSession({ name: '', course_layout_id: '', recording_enabled: true });
    }
  }

  async function updateSessionStatus(id: string, status: string) {
    const updates: Record<string, unknown> = { status };
    if (status === 'racing') {
      updates.started_at = new Date().toISOString();
      updates.is_live = true;
    } else if (status === 'finished' || status === 'abandoned') {
      updates.finished_at = new Date().toISOString();
      updates.is_live = false;
    } else if (status === 'pre_start') {
      updates.is_live = true;
    }

    const { error } = await supabase.from('uwb_race_sessions').update(updates).eq('id', id);
    if (!error) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } as RaceSession : s));
    }
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this race session and all its recorded data?')) return;
    const { error } = await supabase.from('uwb_race_sessions').delete().eq('id', id);
    if (!error) setSessions(prev => prev.filter(s => s.id !== id));
  }

  function formatDuration(start: string | null, end: string | null) {
    if (!start) return '--';
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : Date.now();
    const diffMs = e - s;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Play className="w-5 h-5 text-sky-400" />
            Race Sessions
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Create and manage tracked racing sessions with recording and replay
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>
      </div>

      {sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map(session => {
            const statusStyle = STATUS_STYLES[session.status] || STATUS_STYLES.setup;
            return (
              <div key={session.id} className="rounded-2xl border p-4 bg-slate-800/30 border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {session.is_live && (
                      <div className="relative">
                        <Radio className="w-5 h-5 text-red-400" />
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-white">{session.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(session.created_at).toLocaleDateString()} | Duration: {formatDuration(session.started_at, session.finished_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                    {session.viewer_count > 0 && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Users className="w-3.5 h-3.5" />
                        {session.viewer_count}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                  {session.status === 'setup' && (
                    <button
                      onClick={() => updateSessionStatus(session.id, 'pre_start')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Start Sequence
                    </button>
                  )}
                  {session.status === 'pre_start' && (
                    <button
                      onClick={() => updateSessionStatus(session.id, 'racing')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Start Race
                    </button>
                  )}
                  {session.status === 'racing' && (
                    <button
                      onClick={() => updateSessionStatus(session.id, 'finished')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-medium hover:bg-sky-500/20 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Finish Race
                    </button>
                  )}
                  {(session.is_live || session.status === 'finished') && (
                    <button
                      onClick={() => onViewLive(session.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-medium hover:bg-sky-500/20 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {session.is_live ? 'View Live' : 'Replay'}
                    </button>
                  )}
                  <div className="flex-1" />
                  <button
                    onClick={() => deleteSession(session.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border bg-slate-800/30 border-slate-700/50">
          <Play className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No race sessions yet</p>
          <p className="text-slate-600 text-xs mt-1">Create a session to start tracking races</p>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-4">New Race Session</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Session Name</label>
                <input
                  type="text"
                  value={newSession.name}
                  onChange={(e) => setNewSession(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Heat 1 - Round 3"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Course Layout</label>
                <select
                  value={newSession.course_layout_id}
                  onChange={(e) => setNewSession(prev => ({ ...prev, course_layout_id: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white focus:border-sky-500 outline-none"
                >
                  <option value="">None (free tracking)</option>
                  {layouts.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.course_type})</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSession.recording_enabled}
                  onChange={(e) => setNewSession(prev => ({ ...prev, recording_enabled: e.target.checked }))}
                  className="w-4 h-4 text-sky-600 rounded bg-slate-900 border-slate-600"
                />
                <span className="text-sm text-slate-300">Record positions for replay</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={createSession}
                disabled={!newSession.name}
                className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
