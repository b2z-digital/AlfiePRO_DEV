import React, { useState, useEffect, useRef } from 'react';
import {
  Users, UserPlus, Shield, Trash2, Edit2, GripVertical, Plus,
  Crown, DollarSign, FileText, Calendar, Heart, LifeBuoy, X, ChevronDown,
  Globe, LayoutGrid, Check
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CommitteeManagementProps {
  darkMode: boolean;
}

interface PositionDefinition {
  id: string;
  position_name: string;
  description: string;
  display_order: number;
  is_executive: boolean;
  dashboard_template_id?: string | null;
  position_priority?: number | null;
  show_on_website?: boolean;
  access_level?: string;
}

interface PositionAssignment {
  id: string;
  position_definition_id: string;
  position_name: string;
  member_id: string | null;
  member_name: string | null;
  user_id: string | null;
  avatar_url?: string | null;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string | null;
  avatar_url?: string | null;
}

export const CommitteeManagement: React.FC<CommitteeManagementProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'positions' | 'assignments'>('assignments');
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [assignments, setAssignments] = useState<PositionAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPosition, setEditingPosition] = useState<PositionDefinition | null>(null);
  const [showPositionForm, setShowPositionForm] = useState(false);

  const isAdmin = currentClub?.role === 'admin';
  const isEditor = currentClub?.role === 'editor';
  const canManage = isAdmin || isEditor;

  useEffect(() => {
    if (currentClub) {
      fetchData();
    }
  }, [currentClub]);

  const fetchData = async () => {
    if (!currentClub) return;

    try {
      setLoading(true);

      const { data: positionsData, error: positionsError } = await supabase
        .from('committee_position_definitions')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('display_order');

      if (positionsError) throw positionsError;
      setPositions(positionsData || []);

      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('committee_positions')
        .select(`
          id,
          position_definition_id,
          position_title,
          member_id,
          user_id,
          members (first_name, last_name, avatar_url)
        `)
        .eq('club_id', currentClub.clubId);

      if (assignmentsError) throw assignmentsError;

      const formattedAssignments = assignmentsData?.map(a => ({
        id: a.id,
        position_definition_id: a.position_definition_id || '',
        position_name: a.position_title || '',
        member_id: a.member_id,
        member_name: a.members ? `${a.members.first_name} ${a.members.last_name}` : null,
        user_id: a.user_id,
        avatar_url: a.members?.avatar_url
      })) || [];

      setAssignments(formattedAssignments);

      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, user_id, avatar_url')
        .eq('club_id', currentClub.clubId)
        .order('last_name');

      if (membersError) throw membersError;
      setMembers(membersData || []);

    } catch (error: any) {
      console.error('Error fetching committee data:', error);
      addNotification('error', 'Failed to load committee data');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePosition = async (positionData: Partial<PositionDefinition>) => {
    if (!currentClub) return;

    try {
      if (editingPosition) {
        const { error } = await supabase
          .from('committee_position_definitions')
          .update({
            position_name: positionData.position_name,
            description: positionData.description,
            is_executive: positionData.is_executive,
            dashboard_template_id: positionData.dashboard_template_id,
            position_priority: positionData.position_priority,
            show_on_website: positionData.show_on_website,
            access_level: positionData.access_level,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPosition.id);

        if (error) throw error;
        addNotification('success', 'Position updated successfully');
      } else {
        const maxOrder = positions.length > 0
          ? Math.max(...positions.map(p => p.display_order))
          : 0;

        const { error } = await supabase
          .from('committee_position_definitions')
          .insert({
            club_id: currentClub.clubId,
            position_name: positionData.position_name,
            description: positionData.description,
            is_executive: false,
            display_order: maxOrder + 1,
            dashboard_template_id: positionData.dashboard_template_id,
            position_priority: positionData.position_priority,
            show_on_website: positionData.show_on_website,
            access_level: positionData.access_level
          });

        if (error) throw error;
        addNotification('success', 'Position created successfully');
      }

      setShowPositionForm(false);
      setEditingPosition(null);
      fetchData();
    } catch (error: any) {
      console.error('Error saving position:', error);
      addNotification('error', error?.message || 'Failed to save position');
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (!confirm('Are you sure you want to delete this position? Any member assignments will be unlinked.')) return;

    try {
      const { error } = await supabase
        .from('committee_position_definitions')
        .delete()
        .eq('id', positionId);

      if (error) throw error;
      addNotification('success', 'Position deleted successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error deleting position:', error);
      addNotification('error', 'Failed to delete position');
    }
  };

  const handleAddMember = async (positionDefId: string, memberId: string) => {
    if (!currentClub) return;

    try {
      const position = positions.find(p => p.id === positionDefId);
      if (!position) return;

      const member = members.find(m => m.id === memberId);
      if (!member) return;

      const alreadyAssigned = assignments.some(
        a => a.position_definition_id === positionDefId && a.member_id === memberId
      );

      if (alreadyAssigned) {
        addNotification('info', 'Member is already assigned to this position');
        return;
      }

      const { error } = await supabase
        .from('committee_positions')
        .insert({
          club_id: currentClub.clubId,
          position_definition_id: positionDefId,
          position_title: position.position_name,
          title: position.position_name,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          member_id: memberId,
          user_id: member.user_id
        });

      if (error) throw error;

      addNotification('success', 'Member assigned successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error assigning member:', error);
      addNotification('error', 'Failed to assign member');
    }
  };

  const handleRemoveMember = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('committee_positions')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;

      addNotification('success', 'Member removed successfully');
      fetchData();
    } catch (error: any) {
      console.error('Error assigning member:', error);
      addNotification('error', 'Failed to update assignment');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = positions.findIndex(p => p.id === active.id);
    const newIndex = positions.findIndex(p => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedPositions = arrayMove(positions, oldIndex, newIndex);
    setPositions(reorderedPositions);

    try {
      const updates = reorderedPositions.map((pos, index) =>
        supabase
          .from('committee_position_definitions')
          .update({ display_order: index })
          .eq('id', pos.id)
      );

      await Promise.all(updates);
      addNotification('success', 'Position order updated');
    } catch (error) {
      console.error('Error updating position order:', error);
      addNotification('error', 'Failed to update position order');
      fetchData();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getPositionIcon = (positionName: string) => {
    const name = positionName.toLowerCase();
    if (name.includes('commodore') || name.includes('president')) return <Crown size={16} />;
    if (name.includes('treasurer')) return <DollarSign size={16} />;
    if (name.includes('secretary')) return <FileText size={16} />;
    if (name.includes('race')) return <Calendar size={16} />;
    if (name.includes('social')) return <Heart size={16} />;
    if (name.includes('safety')) return <LifeBuoy size={16} />;
    return <Shield size={16} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Loading committee data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Committee Management</h2>
          <p className="text-slate-400 mt-1">Define positions and assign members to your committee</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'assignments'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-slate-400 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} />
            Assign Members
          </div>
        </button>
        {canManage && (
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'positions'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Shield size={16} />
              Manage Positions
            </div>
          </button>
        )}
      </div>

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {positions.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <Shield className="mx-auto text-slate-500 mb-3" size={48} />
              <p className="text-slate-400 mb-4">No committee positions defined yet</p>
              {canManage && (
                <button
                  onClick={() => setActiveTab('positions')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Define Positions
                </button>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={positions.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid gap-4">
                  {positions.map(position => {
                    const positionAssignments = assignments.filter(
                      a => a.position_definition_id === position.id
                    );

                    return (
                      <SortablePositionCard
                        key={position.id}
                        position={position}
                        positionAssignments={positionAssignments}
                        members={members}
                        canManage={canManage}
                        onAddMember={handleAddMember}
                        onRemoveMember={handleRemoveMember}
                        getPositionIcon={getPositionIcon}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}

      {activeTab === 'positions' && canManage && (
        <div className="space-y-4">
          {!showPositionForm && (
            <button
              onClick={() => {
                setEditingPosition(null);
                setShowPositionForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Position
            </button>
          )}

          {showPositionForm && (
            <PositionForm
              position={editingPosition}
              onSave={handleSavePosition}
              onCancel={() => {
                setShowPositionForm(false);
                setEditingPosition(null);
              }}
            />
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={positions.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid gap-3">
                {positions.map(position => (
                  <SortablePositionItem
                    key={position.id}
                    position={position}
                    onEdit={() => {
                      setEditingPosition(position);
                      setShowPositionForm(true);
                    }}
                    onDelete={() => handleDeletePosition(position.id)}
                    getPositionIcon={getPositionIcon}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
};

// Sortable Position Item Component
interface SortablePositionItemProps {
  position: PositionDefinition;
  onEdit: () => void;
  onDelete: () => void;
  getPositionIcon: (positionName: string) => React.ReactNode;
}

const SortablePositionItem: React.FC<SortablePositionItemProps> = ({
  position,
  onEdit,
  onDelete,
  getPositionIcon,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: position.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-slate-800/30 rounded-xl border border-slate-700/50 px-4 py-3 flex items-center gap-3"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors">
        <GripVertical size={18} />
      </div>

      <span className="text-blue-400">{getPositionIcon(position.position_name)}</span>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-sm">{position.position_name}</p>
        {position.description && (
          <p className="text-xs text-slate-500 truncate">{position.description}</p>
        )}
      </div>

      {position.access_level && (
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border ${
          position.access_level === 'admin'
            ? 'bg-amber-500/10 border-amber-500/20'
            : position.access_level === 'editor'
              ? 'bg-blue-500/10 border-blue-500/20'
              : 'bg-slate-500/10 border-slate-500/20'
        }`}>
          <Shield size={11} className={
            position.access_level === 'admin' ? 'text-amber-400'
              : position.access_level === 'editor' ? 'text-blue-400'
                : 'text-slate-400'
          } />
          <span className={`text-xs capitalize ${
            position.access_level === 'admin' ? 'text-amber-400'
              : position.access_level === 'editor' ? 'text-blue-400'
                : 'text-slate-400'
          }`}>{position.access_level}</span>
        </div>
      )}

      {position.show_on_website && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full">
          <Globe size={11} className="text-green-400" />
          <span className="text-xs text-green-400">Website</span>
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
          title="Edit position"
        >
          <Edit2 size={15} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
          title="Delete position"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
};

// Position Form Component
interface PositionFormProps {
  position: PositionDefinition | null;
  onSave: (data: Partial<PositionDefinition>) => void;
  onCancel: () => void;
}

interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
}

const PositionForm: React.FC<PositionFormProps> = ({ position, onSave, onCancel }) => {
  const isPresident = (name: string) => /president/i.test(name);
  const isSecretary = (name: string) => /secretary/i.test(name);
  const isTreasurer = (name: string) => /treasurer/i.test(name);
  const isExecutiveRole = (name: string) =>
    isPresident(name) || name.toLowerCase().includes('vice president') || isSecretary(name) || isTreasurer(name);

  const defaultWebsite = position
    ? (position.show_on_website ?? false)
    : false;

  const defaultAccessLevel = position?.access_level || 'editor';

  const [formData, setFormData] = useState({
    position_name: position?.position_name || '',
    description: position?.description || '',
    dashboard_template_id: position?.dashboard_template_id || null as string | null,
    position_priority: position?.position_priority ?? 50,
    show_on_website: defaultWebsite,
    access_level: defaultAccessLevel,
  });
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  useEffect(() => {
    if (!position && templates.length > 0) {
      const shouldShow = isPresident(formData.position_name) || isSecretary(formData.position_name);
      const autoTemplate = getDefaultTemplateForPosition(formData.position_name);
      const autoAccess = isExecutiveRole(formData.position_name) ? 'admin' : 'editor';
      setFormData(prev => ({
        ...prev,
        show_on_website: shouldShow,
        dashboard_template_id: autoTemplate,
        access_level: autoAccess,
      }));
    } else if (!position) {
      const shouldShow = isPresident(formData.position_name) || isSecretary(formData.position_name);
      const autoAccess = isExecutiveRole(formData.position_name) ? 'admin' : 'editor';
      setFormData(prev => ({
        ...prev,
        show_on_website: shouldShow,
        access_level: autoAccess,
      }));
    }
  }, [formData.position_name, templates]);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('dashboard_templates')
        .select('id, name, description')
        .or('is_system_template.eq.true,is_public.eq.true,club_id.is.null')
        .order('name');

      if (error) throw error;
      const seen = new Set<string>();
      const unique = (data || []).filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setTemplates(unique);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const getDefaultTemplateForPosition = (name: string): string | null => {
    const n = name.toLowerCase();
    if (/treasurer|finance/.test(n)) {
      return templates.find(t => /finance/i.test(t.name))?.id || null;
    }
    if (/president|vice.?president|commodore|vice.?commodore/.test(n)) {
      return templates.find(t => /full.?overview/i.test(t.name))?.id || null;
    }
    if (/secretary/.test(n)) {
      return templates.find(t => /secretary/i.test(t.name))?.id || null;
    }
    if (/membership|registrar/.test(n)) {
      return templates.find(t => /membership/i.test(t.name))?.id || null;
    }
    if (/race.?officer|race.?manager/.test(n)) {
      return templates.find(t => /race/i.test(t.name))?.id || null;
    }
    return null;
  };

  const selectedTemplate = templates.find(t => t.id === formData.dashboard_template_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Form header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
        <h3 className="font-semibold text-white">
          {position ? 'Edit Position' : 'New Position'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-700"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Position Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Position Name *
          </label>
          <input
            type="text"
            value={formData.position_name}
            onChange={(e) => setFormData({ ...formData, position_name: e.target.value })}
            className="w-full px-3 py-2.5 bg-slate-700/60 border border-slate-600/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:bg-slate-700 text-sm transition-colors"
            placeholder="e.g., Commodore, Treasurer, Race Officer"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2.5 bg-slate-700/60 border border-slate-600/60 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:bg-slate-700 text-sm transition-colors resize-none"
            placeholder="Brief description of the role"
            rows={2}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            <Shield size={13} />
            System Access Level
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Members assigned to this position will receive this access level in the club
          </p>
          <div className="flex gap-2">
            {[
              { value: 'admin', label: 'Admin', color: 'amber', desc: 'Full access' },
              { value: 'editor', label: 'Editor', color: 'blue', desc: 'Can edit' },
              { value: 'viewer', label: 'Viewer', color: 'slate', desc: 'Read only' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, access_level: opt.value }))}
                className={`flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl border transition-all ${
                  formData.access_level === opt.value
                    ? `bg-${opt.color}-500/10 border-${opt.color}-500/30 text-${opt.color}-400`
                    : 'border-slate-600/50 text-slate-500 hover:border-slate-500'
                }`}
                style={formData.access_level === opt.value ? {
                  backgroundColor: opt.color === 'amber' ? 'rgba(245, 158, 11, 0.1)' : opt.color === 'blue' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                  borderColor: opt.color === 'amber' ? 'rgba(245, 158, 11, 0.3)' : opt.color === 'blue' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(100, 116, 139, 0.3)',
                  color: opt.color === 'amber' ? '#fbbf24' : opt.color === 'blue' ? '#60a5fa' : '#94a3b8',
                } : {}}
              >
                <Shield size={16} />
                <span className="text-xs font-medium">{opt.label}</span>
                <span className="text-[10px] opacity-60">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Show on Website toggle */}
        <div className="flex items-center justify-between py-3 px-4 bg-slate-700/30 rounded-xl border border-slate-600/30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Globe size={15} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Show on Club Website</p>
              <p className="text-xs text-slate-500">Display this position on the public contact page</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFormData(prev => ({ ...prev, show_on_website: !prev.show_on_website }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              formData.show_on_website ? 'bg-green-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                formData.show_on_website ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Dashboard Template — visual card picker */}
        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            <LayoutGrid size={13} />
            Dashboard Template
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Members with this position will see this dashboard layout by default
          </p>

          {loadingTemplates ? (
            <div className="text-slate-500 text-sm">Loading templates...</div>
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-700/60 border border-slate-600/60 rounded-lg text-sm transition-colors hover:bg-slate-700 focus:outline-none focus:border-blue-500"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <LayoutGrid size={14} className="text-blue-400 flex-shrink-0" />
                  <span className={`truncate ${formData.dashboard_template_id ? 'text-white' : 'text-slate-500'}`}>
                    {selectedTemplate ? selectedTemplate.name : 'No template (use club default)'}
                  </span>
                </div>
                <ChevronDown size={14} className={`text-slate-400 flex-shrink-0 transition-transform ${showTemplateDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showTemplateDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-20 overflow-hidden">
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, dashboard_template_id: null });
                        setShowTemplateDropdown(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        !formData.dashboard_template_id
                          ? 'bg-blue-600/20 border border-blue-500/30'
                          : 'hover:bg-slate-700'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0">
                        <LayoutGrid size={14} className="text-slate-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">Club Default</p>
                        <p className="text-xs text-slate-500">Use the club's default dashboard</p>
                      </div>
                      {!formData.dashboard_template_id && (
                        <Check size={14} className="text-blue-400 flex-shrink-0" />
                      )}
                    </button>

                    {templates.map(template => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, dashboard_template_id: template.id });
                          setShowTemplateDropdown(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                          formData.dashboard_template_id === template.id
                            ? 'bg-blue-600/20 border border-blue-500/30'
                            : 'hover:bg-slate-700'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                          <LayoutGrid size={14} className="text-blue-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white">{template.name}</p>
                          {template.description && (
                            <p className="text-xs text-slate-500 truncate">{template.description}</p>
                          )}
                        </div>
                        {formData.dashboard_template_id === template.id && (
                          <Check size={14} className="text-blue-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Position Priority — compact number input */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Position Priority
          </label>
          <p className="text-xs text-slate-500 mb-3">
            When a member holds multiple positions, the highest priority determines their dashboard (0–100)
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={formData.position_priority}
              onChange={(e) => setFormData({ ...formData, position_priority: parseInt(e.target.value) })}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${formData.position_priority}%, #334155 ${formData.position_priority}%, #334155 100%)`
              }}
            />
            <div className="w-14 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-center">
              <input
                type="number"
                min="0"
                max="100"
                value={formData.position_priority}
                onChange={(e) => setFormData({ ...formData, position_priority: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                className="w-full bg-transparent text-white text-sm text-center focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 px-5 py-4 border-t border-slate-700/50 bg-slate-800/20">
        <button
          type="submit"
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {position ? 'Save Changes' : 'Create Position'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-lg font-medium text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

interface SortablePositionCardProps {
  position: PositionDefinition;
  positionAssignments: PositionAssignment[];
  members: Member[];
  canManage: boolean;
  onAddMember: (positionId: string, memberId: string) => void;
  onRemoveMember: (assignmentId: string) => void;
  getPositionIcon: (positionName: string) => React.ReactNode;
}

const SortablePositionCard: React.FC<SortablePositionCardProps> = ({
  position,
  positionAssignments,
  members,
  canManage,
  onAddMember,
  onRemoveMember,
  getPositionIcon,
}) => {
  const [showAddMember, setShowAddMember] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: position.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4 relative"
    >
      <div className="flex items-start justify-between gap-4">
        {canManage && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing pt-1">
            <GripVertical size={20} className="text-slate-500" />
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-blue-400">{getPositionIcon(position.position_name)}</span>
            <h3 className="font-semibold text-white">{position.position_name}</h3>
            {position.access_level && (
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${
                position.access_level === 'admin'
                  ? 'bg-amber-500/10 border-amber-500/20'
                  : position.access_level === 'editor'
                    ? 'bg-blue-500/10 border-blue-500/20'
                    : 'bg-slate-500/10 border-slate-500/20'
              }`}>
                <Shield size={10} className={
                  position.access_level === 'admin' ? 'text-amber-400'
                    : position.access_level === 'editor' ? 'text-blue-400'
                      : 'text-slate-400'
                } />
                <span className={`text-xs capitalize ${
                  position.access_level === 'admin' ? 'text-amber-400'
                    : position.access_level === 'editor' ? 'text-blue-400'
                      : 'text-slate-400'
                }`}>{position.access_level}</span>
              </span>
            )}
            {position.show_on_website && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/10 border border-green-500/20 rounded-full">
                <Globe size={10} className="text-green-400" />
                <span className="text-xs text-green-400">Website</span>
              </span>
            )}
          </div>
          {position.description && (
            <p className="text-sm text-slate-400 mb-3">{position.description}</p>
          )}

          <div className="space-y-2">
            {positionAssignments.length === 0 ? (
              <div className="text-slate-500 italic text-sm mb-3">No members assigned</div>
            ) : (
              positionAssignments.map(assignment => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between bg-slate-700/50 rounded-lg p-2"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      imageUrl={assignment.avatar_url}
                      firstName={assignment.member_name?.split(' ')[0] || ''}
                      lastName={assignment.member_name?.split(' ').slice(1).join(' ') || ''}
                      size="sm"
                    />
                    <span className="text-white text-sm">{assignment.member_name}</span>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => onRemoveMember(assignment.id)}
                      className="text-slate-400 hover:text-red-400 transition-colors"
                      title="Remove member"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {canManage && showAddMember && (
            <div className="mt-3">
              <MemberSelector
                members={members}
                onSelect={(memberId) => {
                  onAddMember(position.id, memberId);
                  setShowAddMember(false);
                }}
                excludedMemberIds={positionAssignments.map(a => a.member_id).filter(Boolean) as string[]}
                onClose={() => setShowAddMember(false)}
              />
            </div>
          )}
        </div>

        {canManage && positionAssignments.length > 0 && !showAddMember && (
          <button
            onClick={() => setShowAddMember(true)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-700 border border-slate-600 text-slate-400 hover:text-blue-400 hover:bg-slate-600 hover:border-blue-500 transition-all"
            title="Add another member"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      {canManage && positionAssignments.length === 0 && !showAddMember && (
        <div className="mt-3">
          <button
            onClick={() => setShowAddMember(true)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm text-left flex items-center justify-between hover:bg-slate-600 transition-colors"
          >
            <span className="text-slate-300">+ Add member to this position</span>
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

interface MemberSelectorProps {
  members: Member[];
  onSelect: (memberId: string) => void;
  excludedMemberIds?: string[];
  onClose?: () => void;
}

const MemberSelector: React.FC<MemberSelectorProps> = ({ members, onSelect, excludedMemberIds = [], onClose }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const availableMembers = members.filter(m => !excludedMemberIds.includes(m.id));
  const filteredMembers = availableMembers.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
        onClose?.();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleSelect = (memberId: string) => {
    onSelect(memberId);
    setIsOpen(false);
    setSearchTerm('');
  };

  if (!isOpen) return null;

  return (
    <div className="relative w-full max-w-md" ref={dropdownRef}>
      {isOpen && (
        <div className="bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-80 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-600">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search members..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <div className="px-3 py-4 text-center text-slate-400 text-sm">
                {availableMembers.length === 0 ? 'All members assigned' : 'No members found'}
              </div>
            ) : (
              filteredMembers.map(member => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleSelect(member.id)}
                  className="w-full px-3 py-2 flex items-center gap-3 hover:bg-slate-600 transition-colors text-left"
                >
                  <Avatar
                    imageUrl={member.avatar_url}
                    firstName={member.first_name}
                    lastName={member.last_name}
                    size="sm"
                  />
                  <span className="text-white text-sm">
                    {member.first_name} {member.last_name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
