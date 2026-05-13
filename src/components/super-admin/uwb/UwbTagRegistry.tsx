import React, { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';
import { Tag, Plus, Trash2, Battery, Clock, Check, UserPlus, X, Search } from 'lucide-react';

interface UwbTag {
  id: string;
  config_id: string;
  tag_hardware_id: string;
  sail_number: string | null;
  skipper_name: string | null;
  member_id: string | null;
  boat_class: string | null;
  color: string;
  battery_level: number | null;
  last_seen_at: string | null;
  is_active: boolean;
}

interface ClubMember {
  id: string;
  first_name: string;
  last_name: string;
  sail_number: string | null;
  avatar_url: string | null;
  boat_class: string | null;
}

const TAG_COLORS = [
  '#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#d946ef', '#84cc16', '#0891b2', '#e11d48', '#7c3aed',
];

export function UwbTagRegistry({ configId }: { configId: string }) {
  const [tags, setTags] = useState<UwbTag[]>([]);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [showAddTag, setShowAddTag] = useState(false);
  const [assigningTag, setAssigningTag] = useState<UwbTag | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [formData, setFormData] = useState({
    tag_hardware_id: '',
    color: TAG_COLORS[0],
  });

  useEffect(() => {
    loadTags();
    loadMembers();
  }, [configId]);

  async function loadTags() {
    const { data } = await supabase
      .from('uwb_tags')
      .select('*')
      .eq('config_id', configId)
      .order('created_at');
    setTags(data || []);
  }

  async function loadMembers() {
    const { data: configData } = await supabase
      .from('uwb_tracking_configs')
      .select('club_id')
      .eq('id', configId)
      .maybeSingle();
    if (!configData) return;

    const { data } = await supabase
      .from('members')
      .select('id, first_name, last_name, sail_number, avatar_url, boat_class')
      .eq('club_id', configData.club_id)
      .order('first_name');
    setMembers(data || []);
  }

  async function addTag() {
    if (!formData.tag_hardware_id) return;
    const { data, error } = await supabase
      .from('uwb_tags')
      .insert({
        config_id: configId,
        tag_hardware_id: formData.tag_hardware_id,
        color: formData.color,
      })
      .select()
      .single();
    if (!error && data) {
      setTags(prev => [...prev, data]);
      setFormData({ tag_hardware_id: '', color: TAG_COLORS[(tags.length + 1) % TAG_COLORS.length] });
      setShowAddTag(false);
    }
  }

  async function assignMemberToTag(tag: UwbTag, member: ClubMember) {
    const { error } = await supabase
      .from('uwb_tags')
      .update({
        member_id: member.id,
        skipper_name: `${member.first_name} ${member.last_name}`,
        sail_number: member.sail_number,
        boat_class: member.boat_class,
      })
      .eq('id', tag.id);
    if (!error) {
      setTags(prev => prev.map(t => t.id === tag.id ? {
        ...t,
        member_id: member.id,
        skipper_name: `${member.first_name} ${member.last_name}`,
        sail_number: member.sail_number,
        boat_class: member.boat_class,
      } : t));
      setAssigningTag(null);
      setMemberSearch('');
    }
  }

  async function unassignTag(tag: UwbTag) {
    const { error } = await supabase
      .from('uwb_tags')
      .update({ member_id: null, skipper_name: null, sail_number: null, boat_class: null })
      .eq('id', tag.id);
    if (!error) {
      setTags(prev => prev.map(t => t.id === tag.id ? {
        ...t, member_id: null, skipper_name: null, sail_number: null, boat_class: null,
      } : t));
    }
  }

  async function deleteTag(id: string) {
    const { error } = await supabase.from('uwb_tags').delete().eq('id', id);
    if (!error) setTags(prev => prev.filter(t => t.id !== id));
  }

  async function toggleTagActive(tag: UwbTag) {
    const { error } = await supabase.from('uwb_tags').update({ is_active: !tag.is_active }).eq('id', tag.id);
    if (!error) setTags(prev => prev.map(t => t.id === tag.id ? { ...t, is_active: !t.is_active } : t));
  }

  function formatLastSeen(date: string | null) {
    if (!date) return 'Never';
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(date).toLocaleDateString();
  }

  const assignedMemberIds = tags.map(t => t.member_id).filter(Boolean);
  const filteredMembers = members.filter(m => {
    if (assignedMemberIds.includes(m.id)) return false;
    if (!memberSearch) return true;
    const name = `${m.first_name} ${m.last_name}`.toLowerCase();
    return name.includes(memberSearch.toLowerCase()) ||
      (m.sail_number?.toLowerCase().includes(memberSearch.toLowerCase()));
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-sky-400" />
            Tag Registry
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Assign club members to UWB hardware tags for race identification
          </p>
        </div>
        <button
          onClick={() => { setFormData({ tag_hardware_id: '', color: TAG_COLORS[tags.length % TAG_COLORS.length] }); setShowAddTag(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Tag
        </button>
      </div>

      {/* Tags Grid */}
      {tags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tags.map(tag => (
            <div
              key={tag.id}
              className={`rounded-2xl border p-4 transition-all bg-slate-800/30 backdrop-blur-sm ${
                tag.is_active ? 'border-slate-700/50' : 'border-slate-800/50 opacity-50'
              }`}
            >
              {/* Tag header with hardware ID */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <code className="text-xs font-mono text-slate-400">{tag.tag_hardware_id}</code>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleTagActive(tag)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      tag.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700/50 text-slate-500'
                    }`}
                  >
                    {tag.is_active ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => deleteTag(tag.id)}
                    className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Assigned member or empty slot */}
              {tag.skipper_name ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-700/30">
                  <MemberAvatar
                    name={tag.skipper_name}
                    avatarUrl={members.find(m => m.id === tag.member_id)?.avatar_url || null}
                    color={tag.color}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{tag.skipper_name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {tag.sail_number && <span>Sail: {tag.sail_number}</span>}
                      {tag.boat_class && <span>{tag.boat_class}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => unassignTag(tag)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Unassign"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAssigningTag(tag)}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-slate-700/50 text-slate-500 hover:text-sky-400 hover:border-sky-500/50 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="text-xs font-medium">Assign Skipper</span>
                </button>
              )}

              {/* Stats row */}
              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Battery className="w-3 h-3" />
                  {tag.battery_level != null ? (
                    <span className={
                      tag.battery_level > 50 ? 'text-emerald-400' :
                      tag.battery_level > 20 ? 'text-amber-400' : 'text-red-400'
                    }>{tag.battery_level}%</span>
                  ) : '--'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatLastSeen(tag.last_seen_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 rounded-2xl border bg-slate-800/30 border-slate-700/50">
          <Tag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No tags registered yet</p>
          <p className="text-slate-600 text-xs mt-1">Add UWB tags and assign them to club members</p>
        </div>
      )}

      {/* Assign Member Modal */}
      {assigningTag && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">
                Assign Skipper to Tag <code className="text-sky-400 ml-2 text-sm">{assigningTag.tag_hardware_id}</code>
              </h3>
              <button onClick={() => { setAssigningTag(null); setMemberSearch(''); }} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                autoFocus
              />
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {filteredMembers.length > 0 ? filteredMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => assignMemberToTag(assigningTag, member)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-900/30 border border-slate-700/30 hover:border-sky-500/50 hover:bg-sky-500/5 transition-all text-left"
                >
                  <MemberAvatar
                    name={`${member.first_name} ${member.last_name}`}
                    avatarUrl={member.avatar_url}
                    color={assigningTag.color}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{member.first_name} {member.last_name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {member.sail_number && <span>Sail: {member.sail_number}</span>}
                      {member.boat_class && <span>{member.boat_class}</span>}
                    </div>
                  </div>
                  <UserPlus className="w-4 h-4 text-slate-500" />
                </button>
              )) : (
                <p className="text-center text-slate-500 text-sm py-8">
                  {memberSearch ? 'No matching members found' : 'All members are already assigned'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Tag Modal */}
      {showAddTag && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700/50 rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Add New Tag</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Hardware Tag ID</label>
                <input
                  type="text"
                  value={formData.tag_hardware_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, tag_hardware_id: e.target.value }))}
                  placeholder="e.g. TAG-001"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Display Color</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        formData.color === color ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {formData.color === color && <Check className="w-4 h-4 text-white mx-auto" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowAddTag(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button
                onClick={addTag}
                disabled={!formData.tag_hardware_id}
                className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                Add Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberAvatar({ name, avatarUrl, color }: { name: string; avatarUrl: string | null; color: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-10 h-10 rounded-full object-cover border-2"
        style={{ borderColor: color }}
      />
    );
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm border-2"
      style={{ backgroundColor: color, borderColor: color }}
    >
      {initials}
    </div>
  );
}
