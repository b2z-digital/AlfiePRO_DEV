import { AAvatar } from '../alfie/Kit';
import React, { useState, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, DragStartEvent, DragEndEvent, useDroppable, useDraggable
} from '@dnd-kit/core';
import { Calendar, UserCheck, Circle as XCircle, Clock, CircleCheck as CheckCircle2, RefreshCw, Shuffle, TriangleAlert as AlertTriangle, X, Search } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  manualAssign, removeAssignment, generateFairAllocation, applyAllocation, getRosterWithDetails,
  updateAssignmentStatus, swapAssignment, ensureTasksForRoster, createTasksForAssignments
} from '../../utils/proRosterStorage';
import type { RosterWithDetails, ProRosterAssignment } from '../../types/proRoster';

interface RosterGridViewProps {
  roster: RosterWithDetails;
  members: Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null }>;
  onRefresh: () => void;
  darkMode?: boolean;
}

interface RosterGridViewPropsExtended extends RosterGridViewProps {
  clubId?: string;
  userId?: string;
}

export const RosterGridView: React.FC<RosterGridViewPropsExtended> = ({ roster, members, onRefresh, clubId, userId }) => {
  const { addNotification } = useNotifications();
  const [draggedMember, setDraggedMember] = useState<string | null>(null);
  const [reallocating, setReallocating] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSort, setMemberSort] = useState<'fewest' | 'az'>('fewest');

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
    return member ? { name: `${member.first_name} ${member.last_name}`, avatar: member.avatar_url, first_name: member.first_name, last_name: member.last_name } : { name: 'Unknown', avatar: null, first_name: '', last_name: '' };
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle2 size={17} className="a-txt-g" />;
      case 'declined': return <XCircle size={17} className="a-txt-r" />;
      case 'completed': return <CheckCircle2 size={17} className="a-txt-b" />;
      default: return <Clock size={17} className="a-txt-a" />;
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
    const droppableId = over.id as string;

    const roundId = droppableId.startsWith('round-') ? droppableId.replace('round-', '') : droppableId;
    const round = roster.rounds.find(r => r.id === roundId);
    if (!round) return;

    try {
      await manualAssign(roster.id, roundId, memberId);
      if (roster.status === 'active' && clubId && userId) {
        const details = await getRosterWithDetails(roster.id);
        const newAssignment = details.assignments.find(a => a.round_id === roundId && a.member_id === memberId);
        if (newAssignment && !newAssignment.task_id) {
          await createTasksForAssignments(roster, [round], [newAssignment], clubId, userId);
        }
      }
      addNotification('success', `PRO assigned to ${round.name || round.date}`);
      onRefresh();
    } catch (err) {
      console.error('Error assigning PRO:', err);
      addNotification('error', 'Failed to assign PRO');
    }
  };

  const handleRemoveAssignment = async (roundId: string, roundLabel: string) => {
    if (!confirm(`Remove the PRO assignment for ${roundLabel}?`)) return;
    try {
      await removeAssignment(roster.id, roundId);
      addNotification('success', `PRO assignment removed from ${roundLabel}`);
      onRefresh();
    } catch (err) {
      console.error('Error removing assignment:', err);
      addNotification('error', 'Failed to remove assignment');
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

  const handleConfirmAll = async () => {
    const pendingAssignments = roster.assignments.filter(a => a.status === 'assigned');
    if (pendingAssignments.length === 0) return;
    try {
      for (const assignment of pendingAssignments) {
        await updateAssignmentStatus(assignment.id, 'confirmed');
      }
      addNotification('success', `${pendingAssignments.length} assignments confirmed`);
      onRefresh();
    } catch (err) {
      addNotification('error', 'Failed to confirm assignments');
    }
  };

  const dutyStats = useMemo(() => {
    const counts = new Map<string, number>();
    roster.assignments.forEach(a => {
      counts.set(a.member_id, (counts.get(a.member_id) || 0) + 1);
    });
    return counts;
  }, [roster.assignments]);

  const sortedMembersBySurname = useMemo(() => {
    return [...roster.members].filter(m => m.is_active).sort((a, b) => {
      const infoA = getMemberInfo(a.member_id);
      const infoB = getMemberInfo(b.member_id);
      return infoA.last_name.localeCompare(infoB.last_name) || infoA.first_name.localeCompare(infoB.first_name);
    });
  }, [roster.members, members]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end empty:hidden">
        <div className="flex items-center gap-2 empty:hidden">
          {roster.status !== 'draft' && roster.assignments.some(a => a.status === 'assigned') && (
            <button
              onClick={handleConfirmAll}
              className="a-btn a-btn-g"
              style={{ height: 36 }}
            >
              <CheckCircle2 size={15} />
              Confirm all
            </button>
          )}
          {roster.status === 'draft' && (
            <button
              onClick={handleRegenerate}
              disabled={reallocating}
              className="a-btn disabled:opacity-50"
              style={{ height: 36 }}
            >
              {reallocating ? <RefreshCw size={14} className="animate-spin" /> : <Shuffle size={14} />}
              Regenerate
            </button>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 items-start">
          <aside className="a-card flex flex-col gap-2" style={{ padding: 14 }}>
            <div className="flex items-center justify-between px-1 py-0.5">
              <p className="a-cap">Members</p>
              <span className="a-dim text-[12px]">Drag onto a day</span>
            </div>
            <label className="a-field" style={{ height: 38, fontSize: 13 }}>
              <Search size={15} />
              <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Find a member" aria-label="Find a member" />
            </label>
            <div className="a-seg" style={{ display: 'flex' }} role="radiogroup" aria-label="Sort members">
              <button type="button" role="radio" aria-checked={memberSort === 'fewest'} onClick={() => setMemberSort('fewest')} className={`a-seg-i flex-1 justify-center ${memberSort === 'fewest' ? 'a-seg-on' : ''}`} style={{ height: 30, fontSize: 12.5 }}>Fewest duties</button>
              <button type="button" role="radio" aria-checked={memberSort === 'az'} onClick={() => setMemberSort('az')} className={`a-seg-i flex-1 justify-center ${memberSort === 'az' ? 'a-seg-on' : ''}`} style={{ height: 30, fontSize: 12.5 }}>A–Z</button>
            </div>
            <div className="flex flex-col gap-0.5 max-h-[600px] overflow-y-auto">
              {roster.members
                .filter(m => m.is_active)
                .filter(m => !memberQuery.trim() || getMemberInfo(m.member_id).name.toLowerCase().includes(memberQuery.trim().toLowerCase()))
                .sort((a, b) => {
                  const an = getMemberInfo(a.member_id).name, bn = getMemberInfo(b.member_id).name;
                  if (memberSort === 'fewest') {
                    const d = (dutyStats.get(a.member_id) || 0) - (dutyStats.get(b.member_id) || 0);
                    if (d !== 0) return d;
                  }
                  return an.localeCompare(bn);
                })
                .map(rosterMember => {
                const info = getMemberInfo(rosterMember.member_id);
                const duties = dutyStats.get(rosterMember.member_id) || 0;
                return (
                  <DraggableMemberItem
                    key={rosterMember.member_id}
                    memberId={rosterMember.member_id}
                    name={info.name}
                    avatar={info.avatar}
                    duties={duties}
                  />
                );
              })}
            </div>
          </aside>

          <div className="overflow-x-auto">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(200px, 1fr))` }}>
              {roster.rounds.map(round => {
                const assignment = assignmentsByRound.get(round.id);
                const isPast = round.date < today;
                const isToday = round.date === today;
                const memberInfo = assignment ? getMemberInfo(assignment.member_id) : null;

                return (
                  <DroppableRoundCell
                    key={round.id}
                    roundId={round.id}
                    date={round.date}
                    isPast={isPast}
                    isToday={isToday}
                    assignment={assignment}
                    memberInfo={memberInfo}
                    getStatusIcon={getStatusIcon}
                    getStatusBg={getStatusBg}
                    onRemove={handleRemoveAssignment}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <DragOverlay>
          {draggedMember && (
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[14px] shadow-xl border border-[#0A84FF] bg-[#0A84FF] text-white">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-semibold text-white">
                {(() => {
                  const info = getMemberInfo(draggedMember);
                  return info.name.split(' ').map(n => n[0]).join('');
                })()}
              </div>
              <span className="text-[13px] text-white font-semibold">
                {getMemberInfo(draggedMember).name}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {roster.members.length > 0 && (
        <div className="a-card" style={{ padding: 18 }}>
          <h4 className="a-display a-ink text-[15px] font-semibold mb-3">Duty distribution</h4>
          <div className="flex flex-wrap gap-2">
            {sortedMembersBySurname.map(m => {
              const info = getMemberInfo(m.member_id);
              const count = dutyStats.get(m.member_id) || 0;
              const maxCount = Math.max(...Array.from(dutyStats.values()), 1);
              const barWidth = Math.max((count / maxCount) * 100, 5);

              return (
                <div key={m.member_id} className="flex items-center gap-2 w-full sm:w-[calc(50%-0.25rem)]">
                  <span className="a-mute text-[12.5px] w-32 truncate">{info.name}</span>
                  <div className="a-progress" style={{ height: 8 }}>
                    <i style={{ width: `${barWidth}%` }} />
                  </div>
                  <span className="a-num a-ink text-[13px] w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const DraggableMemberItem: React.FC<{
  memberId: string;
  name: string;
  avatar: string | null | undefined;
  duties: number;
}> = ({ memberId, name, avatar, duties }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: memberId });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`a-lib flex items-center gap-2.5 cursor-grab active:cursor-grabbing select-none ${isDragging ? 'opacity-40' : ''}`}
      title={`${duties} dut${duties === 1 ? 'y' : 'ies'}`}
    >
      <AAvatar url={avatar} first={name.split(' ')[0]} last={name.split(' ').slice(-1)[0]} size={30} />
      <span className="a-ink flex-1 min-w-0 truncate text-[13.5px] font-medium">{name}</span>
      <span className={`a-cnt ${duties > 0 ? 'a-cnt-b' : ''}`}>{duties}</span>
    </div>
  );
};

const DroppableRoundCell: React.FC<{
  roundId: string;
  date: string;
  isPast: boolean;
  isToday: boolean;
  assignment: ProRosterAssignment | undefined;
  memberInfo: { name: string; avatar: string | null | undefined } | null;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusBg: (status: string) => string;
  onRemove: (roundId: string, roundLabel: string) => void;
}> = ({ roundId, date, isPast, isToday, assignment, memberInfo, getStatusIcon, getStatusBg, onRemove }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `round-${roundId}` });

  return (
    <div
      ref={setNodeRef}
      className={`a-card a-day flex flex-col gap-3 ${isOver ? 'a-day-over' : isToday ? 'a-day-today' : ''} ${isPast && !isOver ? 'opacity-55' : ''}`}
      style={{ padding: 14 }}
    >
      <div>
        <p className="a-cap" style={{ fontSize: 10.5 }}>
          {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}{isPast ? ' · done' : isToday ? ' · today' : ''}
        </p>
        <div className={`a-display text-[19px] font-semibold mt-[3px] ${isToday ? 'a-txt-b' : 'a-ink'}`}>
          {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </div>
      </div>

      {assignment && memberInfo ? (
        <div className="a-duty group/cell relative">
          <div className="flex items-center gap-2.5">
            <AAvatar url={memberInfo.avatar} first={memberInfo.name.split(' ')[0]} last={memberInfo.name.split(' ').slice(-1)[0]} size={30} />
            <div className="flex-1 min-w-0">
              <div className="a-ink text-[13.5px] font-semibold truncate">{memberInfo.name}</div>
            </div>
            {getStatusIcon(assignment.status)}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const label = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
              onRemove(roundId, label);
            }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#FF453A] text-white flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity shadow-lg border-2 border-[#0B1220]"
            title="Remove assignment"
            aria-label="Remove assignment"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <div className={`a-duty-empty ${isOver ? 'a-duty-empty-on' : ''}`}>
          Drop a member here
        </div>
      )}
    </div>
  );
};
