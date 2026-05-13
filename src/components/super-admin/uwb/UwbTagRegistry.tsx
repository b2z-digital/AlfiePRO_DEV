import React, { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';
import { Tag, Plus, Trash2, CreditCard as Edit2, Battery, Clock, Check } from 'lucide-react';

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

const TAG_COLORS = [
  '#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#d946ef', '#84cc16', '#0891b2', '#e11d48', '#7c3aed',
];

export function UwbTagRegistry({ configId }: { configId: string }) {
  const [tags, setTags] = useState<UwbTag[]>([]);
  const [showAddTag, setShowAddTag] = useState(false);
  const [editingTag, setEditingTag] = useState<UwbTag | null>(null);
  const [formData, setFormData] = useState({
    tag_hardware_id: '',
    sail_number: '',
    skipper_name: '',
    boat_class: '',
    color: TAG_COLORS[0],
  });

  useEffect(() => {
    loadTags();
  }, [configId]);

  async function loadTags() {
    const { data } = await supabase
      .from('uwb_tags')
      .select('*')
      .eq('config_id', configId)
      .order('created_at');
    setTags(data || []);
  }

  async function addTag() {
    if (!formData.tag_hardware_id) return;
    const { data, error } = await supabase
      .from('uwb_tags')
      .insert({
        config_id: configId,
        tag_hardware_id: formData.tag_hardware_id,
        sail_number: formData.sail_number || null,
        skipper_name: formData.skipper_name || null,
        boat_class: formData.boat_class || null,
        color: formData.color,
      })
      .select()
      .single();
    if (!error && data) {
      setTags(prev => [...prev, data]);
      resetForm();
      setShowAddTag(false);
    }
  }

  async function updateTag() {
    if (!editingTag) return;
    const { error } = await supabase
      .from('uwb_tags')
      .update({
        sail_number: formData.sail_number || null,
        skipper_name: formData.skipper_name || null,
        boat_class: formData.boat_class || null,
        color: formData.color,
      })
      .eq('id', editingTag.id);
    if (!error) {
      setTags(prev => prev.map(t => t.id === editingTag.id ? {
        ...t,
        sail_number: formData.sail_number || null,
        skipper_name: formData.skipper_name || null,
        boat_class: formData.boat_class || null,
        color: formData.color,
      } : t));
      setEditingTag(null);
      resetForm();
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

  function resetForm() {
    setFormData({ tag_hardware_id: '', sail_number: '', skipper_name: '', boat_class: '', color: TAG_COLORS[tags.length % TAG_COLORS.length] });
  }

  function startEdit(tag: UwbTag) {
    setEditingTag(tag);
    setFormData({
      tag_hardware_id: tag.tag_hardware_id,
      sail_number: tag.sail_number || '',
      skipper_name: tag.skipper_name || '',
      boat_class: tag.boat_class || '',
      color: tag.color,
    });
  }

  function formatLastSeen(date: string | null) {
    if (!date) return 'Never';
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(date).toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-sky-600" />
            Tag Registry
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Map UWB hardware tags to boats and skippers for identification during races
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddTag(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Tag
        </button>
      </div>

      {/* Tags Grid */}
      {tags.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <div
              key={tag.id}
              className={`bg-white rounded-xl border p-4 transition-all ${
                tag.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.sail_number?.slice(0, 3) || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {tag.skipper_name || 'Unassigned'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tag.sail_number ? `Sail: ${tag.sail_number}` : 'No sail number'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(tag)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteTag(tag.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Hardware ID</span>
                  <code className="font-mono text-gray-600">{tag.tag_hardware_id}</code>
                </div>
                {tag.boat_class && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Class</span>
                    <span className="text-gray-600">{tag.boat_class}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Battery className="w-3 h-3" /> Battery
                  </span>
                  <span className={`font-medium ${
                    (tag.battery_level ?? 0) > 50 ? 'text-emerald-600' :
                    (tag.battery_level ?? 0) > 20 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {tag.battery_level != null ? `${tag.battery_level}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last Seen
                  </span>
                  <span className="text-gray-600">{formatLastSeen(tag.last_seen_at)}</span>
                </div>
              </div>

              <button
                onClick={() => toggleTagActive(tag)}
                className={`mt-3 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  tag.is_active
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tag.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Tag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No tags registered yet</p>
          <p className="text-gray-400 text-xs mt-1">Add UWB tags and assign them to boats</p>
        </div>
      )}

      {/* Add/Edit Tag Modal */}
      {(showAddTag || editingTag) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingTag ? 'Edit Tag' : 'Add New Tag'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Hardware Tag ID</label>
                <input
                  type="text"
                  value={formData.tag_hardware_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, tag_hardware_id: e.target.value }))}
                  placeholder="e.g. TAG-001"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  disabled={!!editingTag}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Sail Number</label>
                  <input
                    type="text"
                    value={formData.sail_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, sail_number: e.target.value }))}
                    placeholder="e.g. AUS 42"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Boat Class</label>
                  <input
                    type="text"
                    value={formData.boat_class}
                    onChange={(e) => setFormData(prev => ({ ...prev, boat_class: e.target.value }))}
                    placeholder="e.g. IOM"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Skipper Name</label>
                <input
                  type="text"
                  value={formData.skipper_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, skipper_name: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Color</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        formData.color === color ? 'border-gray-900 scale-110' : 'border-transparent'
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
              <button
                onClick={() => { setShowAddTag(false); setEditingTag(null); resetForm(); }}
                className="px-4 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={editingTag ? updateTag : addTag}
                disabled={!editingTag && !formData.tag_hardware_id}
                className="px-4 py-2 bg-sky-600 text-white text-sm rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                {editingTag ? 'Save Changes' : 'Add Tag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
