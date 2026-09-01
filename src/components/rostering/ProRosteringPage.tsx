import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ClipboardList, Plus, Calendar, Trash2, Pencil, Play, ChevronRight, CircleCheck as CheckCircle2, Circle as XCircle, Clock, UserCheck, ListFilter as Filter, Search, Layers, CalendarDays, ChevronDown, ChevronUp, Users, Anchor, ListChecks } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { getRosters, deleteRoster, getRosterWithDetails, activateRoster, createTasksForAssignments, updateAssignmentStatus, ensureTasksForRoster } from '../../utils/proRosterStorage';
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

interface RosterGroup {
  label: string;
  icon: React.ReactNode;
  rosters: ProRoster[];
  seriesId: string | null;
  boatClass: string;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBoatClass, setFilterBoatClass] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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

  const boatClasses = useMemo(() => {
    const classes = new Set(rosters.map(r => r.boat_class));
    return Array.from(classes).sort();
  }, [rosters]);

  const filteredRosters = useMemo(() => {
    let result = rosters;
    if (filterStatus !== 'all') {
      result = result.filter(r => r.status === filterStatus);
    }
    if (filterBoatClass !== 'all') {
      result = result.filter(r => r.boat_class === filterBoatClass);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.boat_class.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rosters, filterStatus, filterBoatClass, searchQuery]);

  const { seriesGroups, singleEventRosters } = useMemo(() => {
    const seriesMap = new Map<string, ProRoster[]>();
    const singles: ProRoster[] = [];

    for (const roster of filteredRosters) {
      if (roster.series_id) {
        const key = roster.series_id;
        if (!seriesMap.has(key)) seriesMap.set(key, []);
        seriesMap.get(key)!.push(roster);
      } else {
        singles.push(roster);
      }
    }

    const groups: RosterGroup[] = [];
    for (const [seriesId, groupRosters] of Array.from(seriesMap.entries())) {
      const sortedRosters = groupRosters.sort((a, b) => a.boat_class.localeCompare(b.boat_class) || a.name.localeCompare(b.name));
      const seriesName = extractSeriesName(sortedRosters);
      groups.push({
        label: seriesName,
        icon: <Layers size={16} className="text-cyan-400" />,
        rosters: sortedRosters,
        seriesId,
        boatClass: sortedRosters.map(r => r.boat_class).join(', '),
      });
    }

    groups.sort((a, b) => a.label.localeCompare(b.label));
    singles.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

    return { seriesGroups: groups, singleEventRosters: singles };
  }, [filteredRosters]);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'archived': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-400';
      case 'active': return 'bg-emerald-400';
      case 'completed': return 'bg-blue-400';
      case 'archived': return 'bg-slate-400';
      default: return 'bg-slate-400';
    }
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
            {selectedRoster.status === 'active' && user?.id && (
              <button
                onClick={async () => {
                  try {
                    const count = await ensureTasksForRoster(selectedRoster.id, clubId, user.id);
                    if (count > 0) {
                      addNotification('success', `${count} missing task${count > 1 ? 's' : ''} created with reminders`);
                      handleRefresh();
                    } else {
                      addNotification('info', 'All assignments already have tasks');
                    }
                  } catch (err) {
                    addNotification('error', 'Failed to sync tasks');
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all"
                title="Create missing tasks for assignments that don't have them"
              >
                <ListChecks size={14} /> Sync Tasks
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
            clubId={clubId}
            userId={user?.id}
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

  const activeCount = rosters.filter(r => r.status === 'active').length;
  const draftCount = rosters.filter(r => r.status === 'draft').length;
  const completedCount = rosters.filter(r => r.status === 'completed').length;
  const seriesCount = rosters.filter(r => r.series_id).length;
  const singleCount = rosters.filter(r => !r.series_id).length;

  return (
    <div className="h-full overflow-y-auto"><div className="p-4 sm:p-6 lg:p-16 space-y-6">
      {/* Header */}
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

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Total Rosters" value={rosters.length} icon={<ClipboardList size={14} />} color="text-slate-400" />
        <StatCard label="Active" value={activeCount} icon={<Play size={14} />} color="text-emerald-400" />
        <StatCard label="Draft" value={draftCount} icon={<Clock size={14} />} color="text-yellow-400" />
        <StatCard label="Series" value={seriesCount} icon={<Layers size={14} />} color="text-cyan-400" />
        <StatCard label="Single Events" value={singleCount} icon={<CalendarDays size={14} />} color="text-orange-400" />
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search rosters..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-500" />
          {['all', 'active', 'draft', 'completed', 'archived'].map(status => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStatus === status
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 border border-slate-700/50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {boatClasses.length > 1 && (
          <select
            value={filterBoatClass}
            onChange={e => setFilterBoatClass(e.target.value)}
            className="px-3 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
          >
            <option value="all">All Classes</option>
            {boatClasses.map(bc => (
              <option key={bc} value={bc}>{bc}</option>
            ))}
          </select>
        )}
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
              : 'Try adjusting your search or filters to find what you\'re looking for.'}
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
        <div className="space-y-6">
          {/* Series Rosters */}
          {seriesGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Layers size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Series Rosters</h2>
                <div className="flex-1 border-t border-slate-700/40" />
                <span className="text-xs text-slate-500">{seriesGroups.reduce((sum, g) => sum + g.rosters.length, 0)} rosters across {seriesGroups.length} series</span>
              </div>

              {seriesGroups.map(group => {
                const groupKey = group.seriesId || group.label;
                const isCollapsed = collapsedGroups.has(groupKey);
                const activeInGroup = group.rosters.filter(r => r.status === 'active').length;
                const draftInGroup = group.rosters.filter(r => r.status === 'draft').length;
                const boatClassesInGroup = [...new Set(group.rosters.map(r => r.boat_class))];

                return (
                  <div key={groupKey} className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleGroupCollapse(groupKey)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors text-left"
                    >
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg">
                        <Layers size={16} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm">{group.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">{group.rosters.length} roster{group.rosters.length !== 1 ? 's' : ''}</span>
                          <span className="text-slate-700">|</span>
                          <span className="text-xs text-slate-500">{boatClassesInGroup.join(', ')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeInGroup > 0 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            {activeInGroup} active
                          </span>
                        )}
                        {draftInGroup > 0 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                            {draftInGroup} draft
                          </span>
                        )}
                        {isCollapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="border-t border-slate-700/30">
                        <div className="divide-y divide-slate-700/20">
                          {group.rosters.map(roster => (
                            <RosterRow
                              key={roster.id}
                              roster={roster}
                              getStatusColor={getStatusColor}
                              getStatusDot={getStatusDot}
                              onSelect={handleSelectRoster}
                              onEdit={setEditingRoster}
                              onDelete={setPendingDeleteRosterId}
                              onActivate={handleActivateRoster}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Single Event Rosters */}
          {singleEventRosters.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CalendarDays size={16} className="text-orange-400" />
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Single Event Rosters</h2>
                <div className="flex-1 border-t border-slate-700/40" />
                <span className="text-xs text-slate-500">{singleEventRosters.length} roster{singleEventRosters.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
                <div className="divide-y divide-slate-700/20">
                  {singleEventRosters.map(roster => (
                    <RosterRow
                      key={roster.id}
                      roster={roster}
                      getStatusColor={getStatusColor}
                      getStatusDot={getStatusDot}
                      onSelect={handleSelectRoster}
                      onEdit={setEditingRoster}
                      onDelete={setPendingDeleteRosterId}
                      onActivate={handleActivateRoster}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activation Confirmation Modal */}
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

      {/* Delete Confirmation Modal */}
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

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
      <div className={`flex items-center gap-2 ${color} text-sm mb-1`}>
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function RosterRow({
  roster,
  getStatusColor,
  getStatusDot,
  onSelect,
  onEdit,
  onDelete,
  onActivate,
}: {
  roster: ProRoster;
  getStatusColor: (s: string) => string;
  getStatusDot: (s: string) => string;
  onSelect: (r: ProRoster) => void;
  onEdit: (r: ProRoster) => void;
  onDelete: (id: string) => void;
  onActivate: (id: string) => void;
}) {
  const startDate = new Date(roster.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const endDate = new Date(roster.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-700/20 transition-colors cursor-pointer group"
      onClick={() => onSelect(roster)}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDot(roster.status)}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-sm group-hover:text-cyan-400 transition-colors truncate">
            {roster.name}
          </span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full border flex-shrink-0 ${getStatusColor(roster.status)}`}>
            {roster.status}
          </span>
        </div>
        {roster.description && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{roster.description}</p>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
        <Anchor size={11} className="text-slate-600" />
        <span>{roster.boat_class}</span>
      </div>

      <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
        <Calendar size={11} className="text-slate-600" />
        <span>{startDate} - {endDate}</span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {roster.status === 'draft' && (
          <button
            onClick={e => { e.stopPropagation(); onActivate(roster.id); }}
            className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-all"
            title="Activate"
          >
            <Play size={14} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onEdit(roster); }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(roster.id); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function extractSeriesName(rosters: ProRoster[]): string {
  const names = rosters.map(r => r.name);
  if (names.length === 0) return 'Unknown Series';

  const suffixPatterns = [
    /\s+(scratch|handicap)\s+pro\s+roster$/i,
    /\s+pro\s+roster$/i,
    /\s+roster$/i,
  ];

  const stripped = names.map(n => {
    let result = n;
    for (const pat of suffixPatterns) {
      result = result.replace(pat, '');
    }
    return result;
  });

  const boatClassPattern = /^(.*?)(?:\s+(?:scratch|handicap))?$/i;
  const bases = stripped.map(s => {
    const dayPatterns = [
      /\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekday)/i,
    ];
    let base = s;
    for (const dp of dayPatterns) {
      base = base.replace(dp, '');
    }
    const m = base.match(boatClassPattern);
    return m ? m[1].trim() : base.trim();
  });

  const freq = new Map<string, number>();
  for (const b of bases) {
    freq.set(b, (freq.get(b) || 0) + 1);
  }

  let bestBase = bases[0] || 'Unknown Series';
  let bestCount = 0;
  for (const [b, c] of Array.from(freq.entries())) {
    if (c > bestCount) { bestCount = c; bestBase = b; }
  }

  if (bestBase.length < 3) {
    const longestName = names.reduce((a, b) => a.length >= b.length ? a : b, '');
    for (const pat of suffixPatterns) {
      bestBase = longestName.replace(pat, '');
    }
  }

  return bestBase || 'Series Rosters';
}
