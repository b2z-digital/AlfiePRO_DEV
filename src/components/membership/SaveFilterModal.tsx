import React, { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { MemberFilterConfig } from '../../types/memberFilters';

interface SaveFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  filterConfig: MemberFilterConfig;
  clubId: string;
  darkMode: boolean;
}

export const SaveFilterModal: React.FC<SaveFilterModalProps> = ({
  isOpen,
  onClose,
  onSave,
  filterConfig,
  clubId,
  darkMode
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for this filter');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to save filters');
      }

      const { error: saveError } = await supabase
        .from('member_filter_presets')
        .insert({
          club_id: clubId,
          name: name.trim(),
          description: description.trim() || null,
          filter_config: filterConfig,
          is_shared: isShared,
          is_default: isDefault,
          created_by: user.id
        });

      if (saveError) throw saveError;

      onSave();
      onClose();

      // Reset form
      setName('');
      setDescription('');
      setIsShared(false);
      setIsDefault(false);
    } catch (err: any) {
      console.error('Error saving filter:', err);
      setError(err.message || 'Failed to save filter');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-md bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-b border-slate-600/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Save className="text-blue-400" size={20} />
            </div>
            <h2 className="text-xl font-bold text-white">Save Filter Preset</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-2">
              <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Filter Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Financial Members with Boats"
              className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description <span className="text-slate-500">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this filter does..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="is-shared"
                checked={isShared}
                onChange={(e) => setIsShared(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
              />
              <label htmlFor="is-shared" className="flex-1">
                <div className="text-sm font-medium text-slate-300">
                  Share with other admins
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Allow other club admins to use this filter preset
                </div>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="is-default"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
              />
              <label htmlFor="is-default" className="flex-1">
                <div className="text-sm font-medium text-slate-300">
                  Set as default filter
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Apply this filter automatically when viewing members
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-5 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-t border-slate-600/50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl font-medium"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Save Filter</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
