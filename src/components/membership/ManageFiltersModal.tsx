import React, { useState } from 'react';
import { X, Edit2, Trash2, Check, Settings, Save, BookmarkPlus } from 'lucide-react';
import { FilterPreset } from '../../types/memberFilters';
import { supabase } from '../../utils/supabase';

interface ManageFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: FilterPreset[];
  onPresetsChanged: () => void;
  onLoadPreset: (preset: FilterPreset) => void;
  darkMode: boolean;
}

export const ManageFiltersModal: React.FC<ManageFiltersModalProps> = ({
  isOpen,
  onClose,
  presets,
  onPresetsChanged,
  onLoadPreset,
  darkMode
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsShared, setEditIsShared] = useState(false);
  const [editIsDefault, setEditIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEdit = (preset: FilterPreset) => {
    setEditingId(preset.id);
    setEditName(preset.name);
    setEditDescription(preset.description || '');
    setEditIsShared(preset.is_shared || false);
    setEditIsDefault(preset.is_default || false);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditIsShared(false);
    setEditIsDefault(false);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      setError('Filter name is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('member_filter_presets')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          is_shared: editIsShared,
          is_default: editIsDefault,
        })
        .eq('id', editingId);

      if (updateError) throw updateError;

      onPresetsChanged();
      handleCancelEdit();
    } catch (err: any) {
      console.error('Error updating preset:', err);
      setError(err.message || 'Failed to update filter');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: FilterPreset) => {
    if (!confirm(`Delete "${preset.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('member_filter_presets')
        .delete()
        .eq('id', preset.id);

      if (error) throw error;

      onPresetsChanged();
    } catch (err) {
      console.error('Error deleting preset:', err);
      alert('Failed to delete filter preset');
    }
  };

  const handleLoadAndClose = (preset: FilterPreset) => {
    onLoadPreset(preset);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-3xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700/50 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-b border-slate-600/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Settings className="text-blue-400" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Manage Saved Filters</h2>
              <p className="text-sm text-slate-400">Edit, delete, or load your saved filters</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {presets.length === 0 ? (
            <div className="text-center py-12">
              <BookmarkPlus className="mx-auto text-slate-600 mb-3" size={48} />
              <p className="text-slate-400">No saved filters yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Apply a filter and click "Save" to create one
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="p-4 rounded-lg bg-slate-800/50 border border-slate-700"
                >
                  {editingId === preset.id ? (
                    // Edit Mode
                    <div className="space-y-3">
                      {error && (
                        <div className="p-2 rounded bg-red-900/20 border border-red-900/30 text-sm text-red-300">
                          {error}
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Description
                        </label>
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                        />
                      </div>

                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editIsShared}
                            onChange={(e) => setEditIsShared(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                          />
                          <span className="text-sm text-slate-300">Share with admins</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editIsDefault}
                            onChange={(e) => setEditIsDefault(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                          />
                          <span className="text-sm text-slate-300">Set as default</span>
                        </label>
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 text-sm"
                        >
                          {saving ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save size={14} />
                              Save
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-200 truncate">
                            {preset.name}
                          </h3>
                          {preset.is_default && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs">
                              <Check size={12} />
                              Default
                            </span>
                          )}
                          {preset.is_shared && (
                            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                              Shared
                            </span>
                          )}
                        </div>
                        {preset.description && (
                          <p className="text-sm text-slate-400">{preset.description}</p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleLoadAndClose(preset)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                          >
                            Load Filter
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <button
                          onClick={() => handleEdit(preset)}
                          className="p-2 rounded text-slate-400 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(preset)}
                          className="p-2 rounded text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-t border-slate-600/50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
