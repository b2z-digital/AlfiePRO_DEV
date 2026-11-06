import React, { useState, useEffect, useRef } from 'react';
import { Users, Shield, Trash2, SquarePen as Edit2, GripVertical, Plus, Crown, DollarSign, FileText, Calendar, Heart, LifeBuoy, X, ChevronDown, Globe, LayoutGrid, Check, Minus, Eye, Search } from 'lucide-react';
import { AAvatar, ALevel, AStatus, ASwitch, accessLevelLabel } from '../alfie/Kit';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import AccessLevelManager from '../committee/AccessLevelManager';
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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CommitteeManagementProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
  onSaveComplete?: () => void;
  /** Rendered inside the Membership page, which already shows the page header. */
  embedded?: boolean;
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

export const CommitteeManagement: React.FC<CommitteeManagementProps> = ({ darkMode, associationId, associationType, onSaveComplete, embedded = false }) => {
  const { currentClub, currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const { isAdmin, isEditor, isStateAdmin, isNationalAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<'positions' | 'assignments' | 'access-levels'>('assignments');
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [assignments, setAssignments] = useState<PositionAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPosition, setEditingPosition] = useState<PositionDefinition | null>(null);
  const [showPositionForm, setShowPositionForm] = useState(false);

  const effectiveAssocId = associationId || currentOrganization?.id;
  const effectiveAssocType = associationType || (currentOrganization?.type as 'state' | 'national' | undefined);
  const isAssociationContext = !!effectiveAssocType && (effectiveAssocType === 'state' || effectiveAssocType === 'national');

  const canManage = isAdmin || isEditor || isStateAdmin || isNationalAdmin;

  useEffect(() => {
    if (isAssociationContext ? effectiveAssocId : currentClub) {
      fetchData();
    }
  }, [currentClub, effectiveAssocId, effectiveAssocType]);

  const fetchData = async () => {
    if (!isAssociationContext && !currentClub) return;

    try {
      setLoading(true);

      if (isAssociationContext && effectiveAssocId) {
        const assocColumn = effectiveAssocType === 'state' ? 'state_association_id' : 'national_association_id';

        const { data: positionsData, error: positionsError } = await supabase
          .from('committee_position_definitions')
          .select('*')
          .eq(assocColumn, effectiveAssocId)
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
          .eq(assocColumn, effectiveAssocId);

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

        let clubIds: string[] = [];
        if (effectiveAssocType === 'state') {
          const { data: clubs } = await supabase
            .from('clubs')
            .select('id')
            .eq('state_association_id', effectiveAssocId);
          clubIds = clubs?.map(c => c.id) || [];
        } else {
          const { data: states } = await supabase
            .from('state_associations')
            .select('id')
            .eq('national_association_id', effectiveAssocId);
          const stateIds = states?.map(s => s.id) || [];
          if (stateIds.length > 0) {
            const { data: clubs } = await supabase
              .from('clubs')
              .select('id')
              .in('state_association_id', stateIds);
            clubIds = clubs?.map(c => c.id) || [];
          }
        }

        if (clubIds.length > 0) {
          const { data: membersData, error: membersError } = await supabase
            .from('members')
            .select('id, first_name, last_name, email, user_id, avatar_url')
            .in('club_id', clubIds)
            .order('last_name');

          if (membersError) throw membersError;
          setMembers(membersData || []);
        } else {
          setMembers([]);
        }
      } else {
        const { data: positionsData, error: positionsError } = await supabase
          .from('committee_position_definitions')
          .select('*')
          .eq('club_id', currentClub!.clubId)
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
          .eq('club_id', currentClub!.clubId);

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
          .eq('club_id', currentClub!.clubId)
          .order('last_name');

        if (membersError) throw membersError;
        setMembers(membersData || []);
      }
    } catch (error: any) {
      console.error('Error fetching committee data:', error);
      addNotification('error', 'Failed to load committee data');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePosition = async (positionData: Partial<PositionDefinition>) => {
    if (!isAssociationContext && !currentClub) return;

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

        const insertData: Record<string, any> = {
          position_name: positionData.position_name,
          description: positionData.description,
          is_executive: false,
          display_order: maxOrder + 1,
          dashboard_template_id: positionData.dashboard_template_id,
          position_priority: positionData.position_priority,
          show_on_website: positionData.show_on_website,
          access_level: positionData.access_level
        };

        if (isAssociationContext && effectiveAssocId) {
          if (effectiveAssocType === 'state') {
            insertData.state_association_id = effectiveAssocId;
          } else {
            insertData.national_association_id = effectiveAssocId;
          }
        } else {
          insertData.club_id = currentClub!.clubId;
        }

        const { error } = await supabase
          .from('committee_position_definitions')
          .insert(insertData);

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
    if (!isAssociationContext && !currentClub) return;

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

      const insertData: Record<string, any> = {
        position_definition_id: positionDefId,
        position_title: position.position_name,
        title: position.position_name,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        member_id: memberId
      };

      if (member.user_id) {
        insertData.user_id = member.user_id;
      }

      if (isAssociationContext && effectiveAssocId) {
        if (effectiveAssocType === 'state') {
          insertData.state_association_id = effectiveAssocId;
        } else {
          insertData.national_association_id = effectiveAssocId;
        }
      } else {
        insertData.club_id = currentClub!.clubId;
      }

      const { error } = await supabase
        .from('committee_positions')
        .insert(insertData);

      if (error) throw error;

      if (isAssociationContext && effectiveAssocId && member.user_id) {
        const assocTable = effectiveAssocType === 'state' ? 'user_state_associations' : 'user_national_associations';
        const assocIdCol = effectiveAssocType === 'state' ? 'state_association_id' : 'national_association_id';

        const accessLevel = position.access_level || 'editor';
        let role = 'member';
        if (accessLevel === 'admin') {
          role = effectiveAssocType === 'state' ? 'state_admin' : 'national_admin';
        } else if (accessLevel === 'editor') {
          role = 'editor';
        } else if (accessLevel === 'race_scorer') {
          role = 'race_scorer';
        }

        const { data: existing } = await supabase
          .from(assocTable)
          .select('id, role')
          .eq('user_id', member.user_id)
          .eq(assocIdCol, effectiveAssocId)
          .maybeSingle();

        if (!existing) {
          const accessData: Record<string, any> = {
            user_id: member.user_id,
            role,
          };
          accessData[assocIdCol] = effectiveAssocId;

          await supabase
            .from(assocTable)
            .insert(accessData);
        } else if (existing.role !== role) {
          await supabase
            .from(assocTable)
            .update({ role, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }

      addNotification('success', 'Member assigned successfully');
      fetchData();
      if (onSaveComplete) {
        setTimeout(() => onSaveComplete(), 500);
      }
    } catch (error: any) {
      console.error('Error assigning member:', error);
      console.error('Error details:', error?.message, error?.code, error?.details, error?.hint);
      addNotification('error', `Failed to assign member: ${error?.message || 'Unknown error'}`);
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
        <div className="a-mute">Loading committee data...</div>
      </div>
    );
  }

  const positionsTab = activeTab === 'positions' && canManage;
  const selectedPosition = showPositionForm ? editingPosition : null;

  return (
    <div className="flex flex-col gap-[22px]">
      {!embedded && (
        <div>
          <h2 className="a-display text-2xl font-bold text-white">
            {isAssociationContext ? 'Association Committee Management' : 'Committee Management'}
          </h2>
          <p className="a-mute mt-1">
            {isAssociationContext
              ? 'Define positions and assign members to your association committee'
              : 'Define positions and assign members to your committee'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="a-seg self-start" role="tablist" aria-label="Committee">
          <button role="tab" aria-selected={activeTab === 'assignments'} onClick={() => setActiveTab('assignments')} className={`a-seg-i ${activeTab === 'assignments' ? 'a-seg-on' : ''}`}>
            <Users size={16} />Assign members
          </button>
          {canManage && (
            <button
              role="tab"
              aria-selected={activeTab === 'positions'}
              onClick={() => {
                setActiveTab('positions');
                if (!showPositionForm && positions[0]) { setEditingPosition(positions[0]); setShowPositionForm(true); }
              }}
              className={`a-seg-i ${activeTab === 'positions' ? 'a-seg-on' : ''}`}
            >
              <Shield size={16} />Manage positions
            </button>
          )}
          {(isAdmin || isStateAdmin || isNationalAdmin) && (
            <button role="tab" aria-selected={activeTab === 'access-levels'} onClick={() => setActiveTab('access-levels')} className={`a-seg-i ${activeTab === 'access-levels' ? 'a-seg-on' : ''}`}>
              <LayoutGrid size={16} />Manage access levels
            </button>
          )}
        </div>
        {activeTab === 'assignments' && canManage && positions.length > 1 && (
          <span className="a-dim text-[13px]">Drag to set the order shown on the club website</span>
        )}
      </div>

      {activeTab === 'assignments' && (
        positions.length === 0 ? (
          <div className="a-card a-empty py-12 px-6">
            <span className="a-tile"><Shield size={20} /></span>
            <p className="text-[15px] font-semibold a-ink">No committee positions yet</p>
            <p className="a-mute text-[13.5px]">Create positions like President or Treasurer, then assign members to them.</p>
            {canManage && (
              <button onClick={() => { setActiveTab('positions'); setEditingPosition(null); setShowPositionForm(true); }} className="a-btn a-btn-p mt-1">
                <Plus size={16} />Define positions
              </button>
            )}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={positions.map(p => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {positions.map(position => (
                  <SortablePositionCard
                    key={position.id}
                    position={position}
                    positionAssignments={assignments.filter(a => a.position_definition_id === position.id)}
                    members={members}
                    canManage={canManage}
                    onAddMember={handleAddMember}
                    onRemoveMember={handleRemoveMember}
                    getPositionIcon={getPositionIcon}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )
      )}

      {positionsTab && (
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <div className="a-card lg:flex-[0_0_400px] p-3 flex flex-col gap-1 self-start w-full">
            <div className="flex items-center justify-between px-2 pt-1.5 pb-2.5">
              <p className="a-cap">{positions.length} {positions.length === 1 ? 'position' : 'positions'}</p>
              <button
                onClick={() => { setEditingPosition(null); setShowPositionForm(true); }}
                className="a-btn a-btn-p a-btn-sm"
              >
                <Plus size={16} />New position
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={positions.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {positions.map(position => (
                  <SortablePositionItem
                    key={position.id}
                    position={position}
                    selected={selectedPosition?.id === position.id}
                    onEdit={() => { setEditingPosition(position); setShowPositionForm(true); }}
                    onDelete={() => handleDeletePosition(position.id)}
                    getPositionIcon={getPositionIcon}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {positions.length > 1 && <p className="a-dim mx-2 mt-2 mb-1 text-[12.5px]">Drag to reorder how positions appear on the club website.</p>}
          </div>

          {showPositionForm ? (
            <PositionForm
              key={editingPosition?.id ?? 'new'}
              position={editingPosition}
              icon={getPositionIcon(editingPosition?.position_name || '')}
              onSave={handleSavePosition}
              onCancel={() => { setShowPositionForm(false); setEditingPosition(null); }}
            />
          ) : (
            <div className="a-panel flex-1 min-w-0 a-empty py-16 px-6">
              <span className="a-tile"><Shield size={20} /></span>
              <p className="text-[15px] font-semibold a-ink">Pick a position to edit</p>
              <p className="a-mute text-[13.5px]">Or create a new one for your committee.</p>
              <button onClick={() => { setEditingPosition(null); setShowPositionForm(true); }} className="a-btn a-btn-p mt-1"><Plus size={16} />New position</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'access-levels' && (isAdmin || isStateAdmin || isNationalAdmin) && (
        <AccessLevelManager
          darkMode={darkMode}
          scopeType={
            isAssociationContext
              ? effectiveAssocType === 'state' ? 'state_association' : 'national_association'
              : 'club'
          }
          scopeId={isAssociationContext ? effectiveAssocId! : currentClub!.clubId}
        />
      )}
    </div>
  );
};

// Sortable Position Item Component
interface SortablePositionItemProps {
  position: PositionDefinition;
  selected?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  getPositionIcon: (positionName: string) => React.ReactNode;
}

const SortablePositionItem: React.FC<SortablePositionItemProps> = ({
  position,
  selected,
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
      className={`a-prow ${selected ? 'a-prow-on' : ''}`}
      aria-current={selected ? 'true' : undefined}
      onClick={onEdit}
    >
      <span {...attributes} {...listeners} className="a-dim flex cursor-grab active:cursor-grabbing" aria-label="Drag to reorder" onClick={(e) => e.stopPropagation()}>
        <GripVertical size={16} />
      </span>
      <span className="a-tile a-tile-sm">{getPositionIcon(position.position_name)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-semibold a-ink truncate">{position.position_name}</div>
        <div className="a-dim text-xs mt-0.5">{accessLevelLabel(position.access_level)} access</div>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="a-ib" style={{ width: 32, height: 32 }} aria-label={`Edit ${position.position_name}`} title="Edit position">
        <Edit2 size={15} />
      </button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="a-ib a-ib-d" style={{ width: 32, height: 32 }} aria-label={`Delete ${position.position_name}`} title="Delete position">
        <Trash2 size={15} />
      </button>
    </div>
  );
};

// Position Form Component
interface PositionFormProps {
  position: PositionDefinition | null;
  icon?: React.ReactNode;
  onSave: (data: Partial<PositionDefinition>) => void;
  onCancel: () => void;
}

interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
}

const PositionForm: React.FC<PositionFormProps> = ({ position, icon, onSave, onCancel }) => {
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

  const accessOptions = [
    { value: 'admin', label: 'Admin', desc: 'Full access', icon: <Crown size={17} /> },
    { value: 'editor', label: 'Editor', desc: 'Can edit content', icon: <Edit2 size={17} /> },
    { value: 'race_scorer', label: 'Race Scorer', desc: 'Can score races', icon: <Calendar size={17} /> },
    { value: 'viewer', label: 'Viewer', desc: 'Read only', icon: <Eye size={17} /> },
  ];
  const stepPriority = (d: number) =>
    setFormData(prev => ({ ...prev, position_priority: Math.min(100, Math.max(0, (prev.position_priority ?? 0) + d)) }));

  return (
    <form onSubmit={handleSubmit} className="a-panel flex-1 min-w-0 flex flex-col">
      <div className="a-panel-head">
        <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}>{icon || <Shield size={20} />}</span>
        <div className="flex-1 min-w-0">
          <p className="a-cap">{position ? 'Edit position' : 'New position'}</p>
          <h2 className="a-display a-ink text-[22px] font-semibold mt-[3px] truncate">{formData.position_name || 'Untitled position'}</h2>
        </div>
        <button type="button" onClick={onCancel} className="a-ib" aria-label="Close"><X size={18} /></button>
      </div>

      <div className="p-[22px] flex flex-col gap-[22px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="a-flab">Position name</span>
            <input
              type="text"
              value={formData.position_name}
              onChange={(e) => setFormData({ ...formData, position_name: e.target.value })}
              className="a-inp"
              placeholder="e.g., Commodore, Treasurer, Race Officer"
              required
            />
          </label>
          <label>
            <span className="a-flab">Description</span>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="a-inp"
              placeholder="Brief description of the role"
            />
          </label>
        </div>

        <div>
          <span className="a-flab">System access level</span>
          <div role="radiogroup" aria-label="System access level" className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
            {accessOptions.map(opt => {
              const on = formData.access_level === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFormData(prev => ({ ...prev, access_level: opt.value }))}
                  className={`a-acc ${on ? 'a-acc-on' : ''}`}
                >
                  <span className="a-radio" />
                  <span className="a-tile a-tile-sm">{opt.icon}</span>
                  <span>
                    <span className="block text-[14.5px] font-semibold">{opt.label}</span>
                    <span className="block a-dim text-[12.5px] mt-0.5">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="a-dim text-[12.5px] mt-2">Members assigned to this position get this access level in the club.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="a-well self-start">
            <span className="a-tile a-tile-sm"><Globe size={17} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-semibold a-ink">Show on club website</div>
              <div className="a-dim text-[12.5px] mt-0.5">Listed on the committee page</div>
            </div>
            <ASwitch
              checked={formData.show_on_website}
              onChange={(v) => setFormData(prev => ({ ...prev, show_on_website: v }))}
              label="Show on club website"
            />
          </div>

          <div>
            <span className="a-flab">Dashboard template</span>
            <div className="flex gap-2.5">
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
                  className="a-pick w-full justify-start"
                  style={{ height: 46 }}
                  aria-haspopup="listbox"
                  aria-expanded={showTemplateDropdown}
                  disabled={loadingTemplates}
                >
                  <LayoutGrid size={16} />
                  <span className="flex-1 text-left truncate">
                    {loadingTemplates ? 'Loading templates…' : selectedTemplate ? selectedTemplate.name : 'Club default'}
                  </span>
                  <ChevronDown size={16} className={`transition-transform ${showTemplateDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showTemplateDropdown && (
                  <div className="a-pop absolute top-full left-0 right-0 mt-1.5 z-20" role="listbox">
                    <div className="max-h-64 overflow-y-auto p-1.5 flex flex-col gap-0.5">
                      {[{ id: null as string | null, name: 'Club default', description: "Use the club's default dashboard" }, ...templates].map(t => (
                        <button
                          key={t.id ?? 'default'}
                          type="button"
                          role="option"
                          aria-selected={formData.dashboard_template_id === t.id}
                          onClick={() => { setFormData({ ...formData, dashboard_template_id: t.id }); setShowTemplateDropdown(false); }}
                          className={`a-pop-item ${formData.dashboard_template_id === t.id ? 'a-pop-item-on' : ''}`}
                        >
                          <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}><LayoutGrid size={14} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block truncate">{t.name}</span>
                            {t.description && <span className="block a-dim text-xs truncate">{t.description}</span>}
                          </span>
                          {formData.dashboard_template_id === t.id && <Check size={15} className="a-txt-b" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="a-seg flex-nowrap" role="group" aria-label="Dashboard priority" title="Dashboard priority" style={{ height: 46, padding: 4 }}>
                <button type="button" className="a-seg-i" aria-label="Lower priority" style={{ height: 38, padding: '0 9px' }} onClick={() => stepPriority(-5)} disabled={formData.position_priority <= 0}>
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="Priority"
                  value={formData.position_priority}
                  onChange={(e) => setFormData({ ...formData, position_priority: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                  className="a-num a-ink bg-transparent border-0 outline-none text-center text-base font-semibold w-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" className="a-seg-i" aria-label="Higher priority" style={{ height: 38, padding: '0 9px' }} onClick={() => stepPriority(5)} disabled={formData.position_priority >= 100}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <p className="a-dim text-[12.5px] mt-2">Priority {formData.position_priority} · if a member holds two positions, the higher number picks their dashboard</p>
          </div>
        </div>
      </div>

      <div className="a-panel-foot mt-auto">
        <button type="button" onClick={onCancel} className="a-btn">Cancel</button>
        <button type="submit" className="a-btn a-btn-p"><Check size={16} />{position ? 'Save changes' : 'Create position'}</button>
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
      style={{ ...style, padding: '18px 18px 18px 10px' }}
      className="a-card a-hov flex gap-2.5 relative"
    >
      {canManage ? (
        <span {...attributes} {...listeners} className="a-dim flex items-start pt-2.5 cursor-grab active:cursor-grabbing" aria-label="Drag to reorder">
          <GripVertical size={16} />
        </span>
      ) : <span className="w-1" />}

      <div className="flex-1 min-w-0 flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <span className="a-tile">{getPositionIcon(position.position_name)}</span>
          <div className="flex-1 min-w-0">
            <h3 className="a-display a-ink m-0 text-[17px] font-semibold truncate">{position.position_name}</h3>
            {position.description && <p className="a-dim mt-0.5 text-[12.5px] truncate">{position.description}</p>}
          </div>
          {position.access_level && <ALevel level={position.access_level} />}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {positionAssignments.map(assignment => {
            const [first, ...rest] = (assignment.member_name || '').split(' ');
            return (
              <span key={assignment.id} className="a-pill">
                <AAvatar url={assignment.avatar_url} first={first} last={rest.join(' ')} size="sm" />
                <span>{assignment.member_name}</span>
                {canManage ? (
                  <button onClick={() => onRemoveMember(assignment.id)} className="a-ib" aria-label={`Remove ${assignment.member_name}`} title="Remove member">
                    <X size={14} />
                  </button>
                ) : <span className="w-1.5" />}
              </span>
            );
          })}
          {positionAssignments.length === 0 && !canManage && <span className="a-dim text-[13px]">No one assigned yet</span>}
          {canManage && (
            <div className="relative">
              <button onClick={() => setShowAddMember(!showAddMember)} className="a-pill-add" aria-expanded={showAddMember}>
                <Plus size={15} />Assign
              </button>
              {showAddMember && (
                <MemberSelector
                  members={members}
                  onSelect={(memberId) => {
                    onAddMember(position.id, memberId);
                    setShowAddMember(false);
                  }}
                  excludedMemberIds={positionAssignments.map(a => a.member_id).filter(Boolean) as string[]}
                  onClose={() => setShowAddMember(false)}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.055] a-card-rule">
          {position.show_on_website
            ? <AStatus tone="g" className="text-[12.5px]">On website</AStatus>
            : <AStatus className="text-[12.5px]">Hidden</AStatus>}
          <span className="a-dim text-[12.5px]">{positionAssignments.length} assigned</span>
        </div>
      </div>
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
    <div className="a-pop absolute left-0 top-full mt-2 z-30 w-[300px] flex flex-col max-h-80" ref={dropdownRef}>
      <div className="p-2">
        <label className="a-field" style={{ height: 38 }}>
          <Search size={15} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            autoFocus
          />
        </label>
      </div>
      <div className="overflow-y-auto px-1.5 pb-1.5 flex flex-col gap-0.5">
        {filteredMembers.length === 0 ? (
          <div className="px-3 py-4 text-center a-mute text-sm">
            {availableMembers.length === 0 ? 'Everyone is already assigned' : 'No members match'}
          </div>
        ) : (
          filteredMembers.map(member => (
            <button key={member.id} type="button" onClick={() => handleSelect(member.id)} className="a-pop-item">
              <AAvatar url={member.avatar_url} first={member.first_name} last={member.last_name} size="sm" />
              <span className="truncate">{member.first_name} {member.last_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
