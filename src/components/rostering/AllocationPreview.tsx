import React, { useState, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, DragStartEvent, DragEndEvent, useDroppable, useDraggable
} from '@dnd-kit/core';
import { Calendar, X, UserPlus, GripVertical } from 'lucide-react';

interface MemberInfo {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
}

interface AllocationPreviewProps {
  dates: string[];
  members: MemberInfo[];
  allocations: Map<string, string>;
  onAllocationsChange: (allocations: Map<string, string>) => void;
}

export const AllocationPreview: React.FC<AllocationPreviewProps> = ({
  dates, members, allocations, onAllocationsChange,
}) => {
  const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null);
  const [pickingForDate, setPickingForDate] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const memberById = useMemo(() => {
    const map = new Map<string, MemberInfo>();
    members.forEach(m => map.set(m.id, m));
    return map;
  }, [members]);

  const assignedMemberIds = useMemo(() => new Set(allocations.values()), [allocations]);

  const unassignedMembers = useMemo(() =>
    members.filter(m => !assignedMemberIds.has(m.id)),
  [members, assignedMemberIds]);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedMemberId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedMemberId(null);
    if (!over) return;

    const memberId = active.id as string;
    const targetDate = (over.id as string).replace('drop-', '');
    if (!dates.includes(targetDate)) return;

    const newAllocations = new Map(allocations);
    const existingOnTarget = newAllocations.get(targetDate);

    let sourceDate: string | null = null;
    for (const [d, mId] of newAllocations.entries()) {
      if (mId === memberId) { sourceDate = d; break; }
    }

    if (sourceDate && existingOnTarget) {
      newAllocations.set(sourceDate, existingOnTarget);
      newAllocations.set(targetDate, memberId);
    } else if (sourceDate) {
      newAllocations.delete(sourceDate);
      newAllocations.set(targetDate, memberId);
    } else {
      newAllocations.set(targetDate, memberId);
    }

    onAllocationsChange(newAllocations);
  };

  const handleUnassign = (date: string) => {
    const newAllocations = new Map(allocations);
    newAllocations.delete(date);
    onAllocationsChange(newAllocations);
  };

  const handlePickMember = (date: string, memberId: string) => {
    const newAllocations = new Map(allocations);
    for (const [d, mId] of newAllocations.entries()) {
      if (mId === memberId) { newAllocations.delete(d); break; }
    }
    newAllocations.set(date, memberId);
    onAllocationsChange(newAllocations);
    setPickingForDate(null);
  };

  const draggedMember = draggedMemberId ? memberById.get(draggedMemberId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-300">PRO Allocations</h4>
          <span className="text-xs text-slate-500">{allocations.size}/{dates.length} assigned</span>
        </div>

        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {dates.map(date => {
            const assignedId = allocations.get(date);
            const member = assignedId ? memberById.get(assignedId) || null : null;
            return (
              <DateSlot
                key={date}
                date={date}
                member={member}
                isPickerOpen={pickingForDate === date}
                onUnassign={() => handleUnassign(date)}
                onOpenPicker={() => setPickingForDate(date === pickingForDate ? null : date)}
                onPickMember={(mId) => handlePickMember(date, mId)}
                availableMembers={members.filter(m => m.id !== assignedId)}
              />
            );
          })}
        </div>

        {unassignedMembers.length > 0 && (
          <div className="border-t border-slate-700 pt-3">
            <p className="text-xs text-slate-500 mb-2">Unassigned - drag to a date above</p>
            <div className="flex flex-wrap gap-2">
              {unassignedMembers.map(m => (
                <DraggableMemberChip key={m.id} member={m} />
              ))}
            </div>
          </div>
        )}
      </div>

      <DragOverlay>
        {draggedMember && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-full text-xs font-medium shadow-lg shadow-cyan-500/20">
            <MemberAvatar member={draggedMember} size={20} />
            {draggedMember.first_name} {draggedMember.last_name}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

// --- Sub-components ---

const MemberAvatar: React.FC<{ member: MemberInfo; size?: number }> = ({ member, size = 24 }) => {
  const px = `${size}px`;
  if (member.avatar_url) {
    return <img src={member.avatar_url} alt="" className="rounded-full object-cover" style={{ width: px, height: px }} />;
  }
  return (
    <div className="rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-medium text-slate-300" style={{ width: px, height: px }}>
      {member.first_name[0]}{member.last_name[0]}
    </div>
  );
};

const DraggableMemberChip: React.FC<{ member: MemberInfo }> = ({ member }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-700/80 border border-slate-600 rounded-full text-xs text-slate-300 cursor-grab hover:bg-slate-600 hover:border-cyan-500/40 transition-colors active:cursor-grabbing select-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <GripVertical size={10} className="text-slate-500" />
      <MemberAvatar member={member} size={18} />
      <span>{member.first_name} {member.last_name[0]}.</span>
    </div>
  );
};

interface DateSlotProps {
  date: string;
  member: MemberInfo | null;
  isPickerOpen: boolean;
  onUnassign: () => void;
  onOpenPicker: () => void;
  onPickMember: (memberId: string) => void;
  availableMembers: MemberInfo[];
}

const DateSlot: React.FC<DateSlotProps> = ({
  date, member, isPickerOpen, onUnassign, onOpenPicker, onPickMember, availableMembers,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${date}` });

  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <div>
      <div
        ref={setNodeRef}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
          isOver
            ? 'bg-cyan-500/10 border-cyan-500/50'
            : member
              ? 'bg-slate-800/60 border-slate-700/60'
              : 'bg-slate-900/40 border-dashed border-slate-600'
        }`}
      >
        <div className="flex items-center gap-2 min-w-[110px]">
          <Calendar size={13} className="text-slate-500 flex-shrink-0" />
          <span className="text-xs font-medium text-slate-400">{formatted}</span>
        </div>

        <div className="flex-1">
          {member ? (
            <AssignedMemberDraggable member={member} />
          ) : (
            <button onClick={onOpenPicker} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors">
              <UserPlus size={12} />
              <span>Assign member...</span>
            </button>
          )}
        </div>

        {member && (
          <button onClick={onUnassign} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Unassign">
            <X size={14} />
          </button>
        )}

        {!member && !isPickerOpen && (
          <div className="text-[10px] text-slate-600 uppercase tracking-wide">Drop here</div>
        )}
      </div>

      {isPickerOpen && (
        <div className="ml-6 mt-1 mb-1 bg-slate-800 border border-slate-700 rounded-lg p-2 max-h-40 overflow-y-auto shadow-lg">
          {availableMembers.length === 0 ? (
            <p className="text-xs text-slate-500 p-2">All members are assigned</p>
          ) : (
            <div className="space-y-0.5">
              {availableMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => onPickMember(m.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-slate-700 transition-colors"
                >
                  <MemberAvatar member={m} size={20} />
                  <span className="text-xs text-slate-300">{m.first_name} {m.last_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AssignedMemberDraggable: React.FC<{ member: MemberInfo }> = ({ member }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={`flex items-center gap-2 cursor-grab active:cursor-grabbing select-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <MemberAvatar member={member} size={24} />
      <span className="text-sm text-white font-medium">{member.first_name} {member.last_name}</span>
    </div>
  );
};
