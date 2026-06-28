import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Plus, Calendar, Users, ChartBar as BarChart3, Download, Trash2, Pencil, Play, Archive, ChevronRight, Shuffle, GripVertical, CircleCheck as CheckCircle2, Circle as XCircle, Clock, TriangleAlert as AlertTriangle, UserCheck, ListFilter as Filter } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { getRosters, deleteRoster, getRosterWithDetails, activateRoster, createTasksForAssignments, updateAssignmentStatus } from '../../utils/proRosterStorage';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredMembers } from '../../utils/storage';
import type { ProRoster, RosterWithDetails } from '../../types/proRoster';
import { RosterBuilder } from './RosterBuilder';
import { RosterGridView } from './RosterGridView';
import { RosterListView } from './RosterListView';

interface ProRosteringPageProps {
  clubId: string;
  clubName: string;
  darkMode?: boolean;
}

export const ProRosteringPage: React.FC<ProRosteringPageProps> = ({ clubId, clubName, darkMode = true }) => {
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [rosters, setRosters] = useState<ProRoster[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<RosterWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRoster, setEditingRoster] = useState<ProRoster | null>(null);
  const [view, setView] = useState<'dashboard' | 'grid' | 'list'>('dashboard');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [members, setMembers] = useState<Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null; boats?: Array<{ boat_type: string }> }>>([]);
  const [pendingActivationRosterId, setPendingActivationRosterId] = useState<string | null>(null);
  const [pendingDeleteRosterId, setPendingDeleteRosterId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await getStoredMembers();
      setMembers(data as any);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  }, []);

  const fetchRosters = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRosters(clubId);
      setRosters(data);
    } catch (err) {
      console.error('Error fetching rosters:', err);
      addNotification('error', 'Failed to load rosters');
    } finally {
      setLoading(false);
    }
  }, [clubId, addNotification]);

  useEffect(() => { fetchRosters(); fetchMembers(); }, [fetchRosters, fetchMembers]);

  const handleSelectRoster = async (roster: ProRoster) => {
    try {
      const details = await getRosterWithDetails(roster.id);
      const enrichedMembers = details.members.map(m => {
        const member = members.find(mem => mem.id === m.member_id);
        return { ...m, member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown', member_avatar: member?.avatar_url };
      });
      const enrichedAssignments = details.assignments.map(a => {
        const member = members.find(mem => mem.id === a.member_id);
        return { ...a, member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown', member_avatar: member?.avatar_url };
      });
      setSelectedRoster({ ...details, members: enrichedMembers, assignments: enrichedAssignments });
      setView('grid');
    } catch (err) {
      console.error('Error loading roster:', err);
      addNotification('error', 'Failed to load roster details');
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    try {
      await deleteRoster(rosterId);
      setRosters(prev => prev.filter(r => r.id !== rosterId));
      if (selectedRoster?.id === rosterId) {
        setSelectedRoster(null);
        setView('dashboard');
      }
      setPendingDeleteRosterId(null);
      addNotification('success', 'Roster and associated tasks deleted');
    } catch (err) {
      console.error('Error deleting roster:', err);
      addNotification('error', 'Failed to delete roster');
    }
  };

  const handleActivateRoster = async (rosterId: string) => {
    try {
      await activateRoster(rosterId);
      const details = await getRosterWithDetails(rosterId);
      if (details.assignments.length > 0 && user?.id) {
        await createTasksForAssignments(details, details.rounds, details.assignments, clubId, user.id);
        for (const assignment of details.assignments) {
          if (assignment.status === 'assigned') {
            await updateAssignmentStatus(assignment.id, 'confirmed');
          }
        }
      }
      await fetchRosters();
      if (selectedRoster?.id === rosterId) {
        const refreshed = await getRosterWithDetails(rosterId);
        setSelectedRoster(refreshed);
      }
      setPendingActivationRosterId(null);
      addNotification('success', 'Roster activated! All assignments confirmed and tasks created.');
    } catch (err) {
      console.error('Error activating roster:', err);
      addNotification('error', 'Failed to activate roster');
    }
  };

  const handleRosterCreated = async () => {
    setShowBuilder(false);
    setEditingRoster(null);
    await fetchRosters();
    const latestRosters = await getRosters(clubId);
    const newestDraft = latestRosters.find(r => r.status === 'draft');
    if (newestDraft) {
      setPendingActivationRosterId(newestDraft.id);
    }
  };

  const handleRefresh = async () => {
    if (selectedRoster) {
      await handleSelectRoster(selectedRoster);
    }
  };

  const filteredRosters = filterStatus === 'all' ? rosters : rosters.filter(r => r.status === filterStatus);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'archived': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatsForRoster = (roster: ProRoster) => {
    return { rounds: 0, assigned: 0, confirmed: 0 };
  };

  if (showBuilder || editingRoster) {
    return (
      <RosterBuilder
        clubId={clubId}
        clubName={clubName}
        members={members}
        existingRoster={editingRoster}
        onComplete={handleRosterCreated}
        onCancel={() => { setShowBuilder(false); setEditingRoster(null); }}
        darkMode={darkMode}
      />
    );
  }

  if (selectedRoster && (view === 'grid' || view === 'list')) {
    return (
      <div className="h-full overflow-y-auto"><div className="p-4 sm:p-6 lg:p-16 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { setSelectedRoster(null); setView('dashboard'); }}
            className="text-slate-400 hover:text-white transition-colors"
          >
            Rosters
          </button>
          <ChevronRight size={16} className="text-slate-600" />
          <span className="text-white font-medium">{selectedRoster.name}</span>
          <div className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${getStatusColor(selectedRoster.status)}`}>
            {selectedRoster.status}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('grid')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${view === 'grid' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              <Calendar size={14} className="inline mr-1" /> Grid
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all ${view === 'list' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              <ClipboardList size={14} className="inline mr-1" /> List
            </button>
            {selectedRoster.status === 'draft' && (
              <button
                onClick={() => handleActivateRoster(selectedRoster.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-500 transition-all"
              >
                <Play size={14} /> Activate
              </button>
            )}
          </div>
        </div>

        {view === 'grid' ? (
          <RosterGridView
            roster={selectedRoster}
            members={members}
            onRefresh={handleRefresh}
            darkMode={darkMode}
          />
        ) : (
          <RosterListView
            roster={selectedRoster}
            members={members}
            onRefresh={handleRefresh}
            darkMode={darkMode}
          />
        )}
      </div></div>
    );
  }

  return (
    <div className="h-full overflow-y-auto"><div className="p-4 sm:p-6 lg:p-16 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl">
              <ClipboardList size={24} className="text-white" />
            </div>
            PRO Rostering
          </h1>
          <p className="text-slate-400 mt-1">Manage Principal Race Officer duty rosters for your club's sailing days</p>
        </div>
        <button
          onClick={() => setShowBuilder(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-500 hover:to-blue-500 transition-all hover:scale-105 shadow-lg shadow-cyan-500/20"
        >
          <Plus size={18} />
          New Roster
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <ClipboardList size={14} />
            Total Rosters
          </div>
          <div className="text-2xl font-bold text-white">{rosters.length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-sm mb-1">
            <Play size={14} />
            Active
          </div>
          <div className="text-2xl font-bold text-white">{rosters.filter(r => r.status === 'active').length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-yellow-400 text-sm mb-1">
            <Clock size={14} />
            Draft
          </div>
          <div className="text-2xl font-bold text-white">{rosters.filter(r => r.status === 'draft').length}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
            <CheckCircle2 size={14} />
            Completed
          </div>
          <div className="text-2xl font-bold text-white">{rosters.filter(r => r.status === 'completed').length}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Filter size={14} className="text-slate-400" />
        {['all', 'active', 'draft', 'completed', 'archived'].map(status => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filterStatus === status
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredRosters.length === 0 ? (
        <div className="text-center py-20 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <ClipboardList size={48} className="mx-auto text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300 mb-2">
            {rosters.length === 0 ? 'No Rosters Yet' : 'No Matching Rosters'}
          </h3>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            {rosters.length === 0
              ? 'Create your first PRO roster to automatically assign race officers to your sailing days.'
              : 'Try changing the status filter to see other rosters.'}
          </p>
          {rosters.length === 0 && (
            <button
              onClick={() => setShowBuilder(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-medium hover:from-cyan-500 hover:to-blue-500 transition-all"
            >
              <Plus size={16} className="inline mr-2" />
              Create First Roster
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRosters.map(roster => (
            <div
              key={roster.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:border-cyan-500/30 transition-all cursor-pointer group"
              onClick={() => handleSelectRoster(roster)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                    {roster.name}
                  </h3>
                  <p className="text-sm text-slate-400 mt-0.5">{roster.boat_class}</p>
                </div>
                <div className={`px-2 py-0.5 text-xs rounded-full border ${getStatusColor(roster.status)}`}>
                  {roster.status}
                </div>
              </div>

              {roster.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{roster.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(roster.start_date).toLocaleDateString()} - {new Date(roster.end_date).toLocaleDateString()}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
                {roster.status === 'draft' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleActivateRoster(roster.id); }}
                    className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
                    title="Activate"
                  >
                    <Play size={14} />
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingRoster(roster); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPendingDeleteRosterId(roster.id); }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingActivationRosterId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/20 rounded-xl">
                <Play size={20} className="text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Activate Roster?</h3>
            </div>
            <p className="text-slate-300 mb-6">
              Your roster has been created. Would you like to activate it now? This will create tasks and send reminders to assigned PROs.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setPendingActivationRosterId(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Later
              </button>
              <button
                onClick={() => handleActivateRoster(pendingActivationRosterId)}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl font-medium hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                Activate Now
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteRosterId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-xl">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Delete Roster?</h3>
            </div>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete this roster? This will also remove all tasks created for members on this roster. This cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setPendingDeleteRosterId(null)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRoster(pendingDeleteRosterId)}
                className="px-5 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-medium hover:from-red-500 hover:to-red-400 transition-all shadow-lg shadow-red-500/20"
              >
                Delete Roster
              </button>
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
};
