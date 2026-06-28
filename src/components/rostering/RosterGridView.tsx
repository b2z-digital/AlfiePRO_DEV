import React, { useState, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, DragStartEvent, DragEndEvent
} from '@dnd-kit/core';
import { Calendar, UserCheck, Circle as XCircle, Clock, CircleCheck as CheckCircle2, RefreshCw, Shuffle, TriangleAlert as AlertTriangle } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  manualAssign, generateFairAllocation, applyAllocation, getRosterWithDetails,
  updateAssignmentStatus, swapAssignment
} from '../../utils/proRosterStorage';
import type { RosterWithDetails, ProRosterAssignment } from '../../types/proRoster';

interface RosterGridViewProps {
  roster: RosterWithDetails;
  members: Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null }>;
  onRefresh: () => void;
  darkMode?: boolean;
}

export const RosterGridView: React.FC<RosterGridViewProps> = ({ roster, members, onRefresh }) => {
  const { addNotification } = useNotifications();
  const [draggedMember, setDraggedMember] = useState<string | null>(null);
  const [reallocating, setReallocating] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const assignmentsByRound = useMemo(() => {
    const map = new Map<string, ProRosterAssignment>();
    roster.assignments.forEach(a => map.set(a.round_id, a));
    return map;
  }, [roster.assignments]);

  const getMemberInfo = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member ? { name: `${member.first_name} ${member.last_name}`, avatar: member.avatar_url } : { name: 'Unknown', avatar: null };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle2 size={12} className="text-emerald-400" />;
      case 'declined': return <XCircle size={12} className="text-red-400" />;
      case 'completed': return <CheckCircle2 size={12} className="text-blue-400" />;
      default: return <Clock size={12} className="text-yellow-400" />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'confirmed': return 'border-emerald-500/30 bg-emerald-500/10';
      case 'declined': return 'border-red-500/30 bg-red-500/10';
      case 'completed': return 'border-blue-500/30 bg-blue-500/10';
      default: return 'border-cyan-500/30 bg-cyan-500/10';
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedMember(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedMember(null);

    if (!over || active.id === over.id) return;

    const memberId = active.id as string;
    const roundId = over.id as string;

    const round = roster.rounds.find(r => r.id === roundId);
    if (!round) return;

    try {
      await manualAssign(roster.id, roundId, memberId);
      addNotification('success', `PRO assigned to ${round.name || round.date}`);
      onRefresh();
    } catch (err) {
      console.error('Error assigning PRO:', err);
      addNotification('error', 'Failed to assign PRO');
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('This will regenerate all assignments. Any manual changes will be lost. Continue?')) return;
    try {
      setReallocating(true);
      const allocations = generateFairAllocation(
        roster.rounds,
        roster.members,
        roster.exclusions,
        roster.max_consecutive
      );
      await applyAllocation(roster.id, allocations);
      addNotification('success', 'Roster regenerated with fair allocation!');
      onRefresh();
    } catch (err) {
      console.error('Error regenerating:', err);
      addNotification('error', 'Failed to regenerate roster');
    } finally {
      setReallocating(false);
    }
  };

  const handleStatusChange = async (assignmentId: string, status: 'confirmed' | 'declined' | 'completed') => {
    try {
      await updateAssignmentStatus(assignmentId, status);
      addNotification('success', `Assignment ${status}`);
      onRefresh();
    } catch (err) {
      addNotification('error', 'Failed to update status');
    }
  };

  const dutyStats = useMemo(() => {
    const counts = new Map<string, number>();
    roster.assignments.forEach(a => {
      counts.set(a.member_id, (counts.get(a.member_id) || 0) + 1);
    });
    return counts;
  }, [roster.assignments]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Calendar size={14} />
            {roster.rounds.length} sailing days
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <UserCheck size={14} />
            {roster.assignments.filter(a => a.status === 'confirmed').length}/{roster.assignments.length} confirmed
          </div>
        </div>
        {roster.status === 'draft' && (
          <button
            onClick={handleRegenerate}
            disabled={reallocating}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all disabled:opacity-50"
          >
            {reallocating ? <RefreshCw size={14} className="animate-spin" /> : <Shuffle size={14} />}
            Regenerate
          </button>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
            <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Members</h4>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {roster.members.filter(m => m.is_active).map(rosterMember => {
                const info = getMemberInfo(rosterMember.member_id);
                const duties = dutyStats.get(rosterMember.member_id) || 0;
                return (
                  <div
                    key={rosterMember.member_id}
                    id={rosterMember.member_id}
                    draggable
                    onDragStart={() => setDraggedMember(rosterMember.member_id)}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-900/30 hover:bg-slate-700/50 cursor-grab active:cursor-grabbing transition-all group"
                  >
                    <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-medium text-slate-300 flex-shrink-0 overflow-hidden">
                      {info.avatar ? (
                        <img src={info.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        info.name.split(' ').map(n => n[0]).join('')
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white truncate">{info.name}</div>
                      <div className="text-[10px] text-slate-500">{duties} duties</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 overflow-x-auto">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(160px, 1fr))` }}>
              {roster.rounds.map(round => {
                const assignment = assignmentsByRound.get(round.id);
                const isPast = round.date < today;
                const isToday = round.date === today;
                const memberInfo = assignment ? getMemberInfo(assignment.member_id) : null;

                return (
                  <div
                    key={round.id}
                    id={round.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {}}
                    className={`rounded-xl border p-3 transition-all ${
                      isToday
                        ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/20'
                        : isPast
                          ? 'border-slate-700/30 bg-slate-900/20 opacity-60'
                          : 'border-slate-700/50 bg-slate-900/30 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                      {new Date(round.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}
                    </div>
                    <div className={`text-sm font-semibold mb-2 ${isToday ? 'text-cyan-400' : 'text-white'}`}>
                      {new Date(round.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </div>

                    {assignment && memberInfo ? (
                      <div className={`rounded-lg border p-2 ${getStatusBg(assignment.status)}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-medium text-white overflow-hidden flex-shrink-0">
                            {memberInfo.avatar ? (
                              <img src={memberInfo.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              memberInfo.name.split(' ').map(n => n[0]).join('')
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-white truncate">{memberInfo.name}</div>
                          </div>
                          {getStatusIcon(assignment.status)}
                        </div>
                        {roster.status !== 'draft' && assignment.status === 'assigned' && (
                          <div className="flex gap-1 mt-2">
                            <button
                              onClick={() => handleStatusChange(assignment.id, 'confirmed')}
                              className="flex-1 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition-all"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleStatusChange(assignment.id, 'declined')}
                              className="flex-1 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-all"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-600 p-3 text-center">
                        <div className="text-[10px] text-slate-500">Drop member here</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DragOverlay>
          {draggedMember && (
            <div className="flex items-center gap-2 px-3 py-2 bg-cyan-600 rounded-lg shadow-xl shadow-cyan-500/30 border border-cyan-400">
              <div className="w-6 h-6 rounded-full bg-cyan-700 flex items-center justify-center text-[10px] font-medium text-white">
                {(() => {
                  const info = getMemberInfo(draggedMember);
                  return info.name.split(' ').map(n => n[0]).join('');
                })()}
              </div>
              <span className="text-xs text-white font-medium">
                {getMemberInfo(draggedMember).name}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {roster.members.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Duty Distribution</h4>
          <div className="flex flex-wrap gap-2">
            {roster.members.filter(m => m.is_active).map(m => {
              const info = getMemberInfo(m.member_id);
              const count = dutyStats.get(m.member_id) || 0;
              const maxCount = Math.max(...Array.from(dutyStats.values()), 1);
              const barWidth = Math.max((count / maxCount) * 100, 5);

              return (
                <div key={m.member_id} className="flex items-center gap-2 w-full sm:w-[calc(50%-0.25rem)]">
                  <span className="text-xs text-slate-400 w-28 truncate">{info.name}</span>
                  <div className="flex-1 h-4 bg-slate-900/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-600 to-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-4 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
