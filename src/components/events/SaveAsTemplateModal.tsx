import React, { useState } from 'react';
import { X, Save, Loader2, BookTemplate, AlertCircle } from 'lucide-react';
import { saveEventWebsiteAsTemplate } from '../../utils/eventWebsiteTemplateStorage';
import { useAuth } from '../../contexts/AuthContext';

interface SaveAsTemplateModalProps {
  eventWebsiteId: string;
  eventName: string;
  onClose: () => void;
  onSaved?: () => void;
  darkMode?: boolean;
}

export const SaveAsTemplateModal: React.FC<SaveAsTemplateModalProps> = ({
  eventWebsiteId,
  eventName,
  onClose,
  onSaved,
  darkMode = true
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: `${eventName} Template`,
    description: '',
    template_type: 'multi_event' as 'single_event' | 'multi_event',
    category: '',
    is_public: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Build template data without club_id to avoid RLS conflicts
      // Templates are available based on user permissions, not club ownership
      const templateData: any = { ...formData };

      // Note: We intentionally don't include club_id to avoid RLS policy conflicts
      // The RLS policy on event_website_templates controls access based on user roles
      // Templates can be shared across organizations when is_public is true

      const { template, error: saveError } = await saveEventWebsiteAsTemplate(
        eventWebsiteId,
        templateData
      );

      if (saveError) throw saveError;

      if (template) {
        onSaved?.();
        onClose();
      }
    } catch (err: any) {
      console.error('Error saving template:', err);
      setError(err.message || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl rounded-xl shadow-2xl ${
        darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <BookTemplate className={darkMode ? 'text-purple-400' : 'text-purple-600'} size={24} />
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Save as Template
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Save this event website configuration for future use
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <div className="font-medium text-red-400">Error</div>
                <div className="text-sm text-red-300 mt-1">{error}</div>
              </div>
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Template Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              placeholder="e.g., Championship Event Template"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              placeholder="Describe what makes this template useful..."
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Template Type *
            </label>
            <select
              required
              value={formData.template_type}
              onChange={(e) => setFormData({ ...formData, template_type: e.target.value as any })}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
            >
              <option value="single_event">Single Event</option>
              <option value="multi_event">Multi-Event</option>
            </select>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Multi-event templates are optimized for events with multiple races or sessions
            </p>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Category
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              placeholder="e.g., Championship, Regatta, Series"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_public"
              checked={formData.is_public}
              onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
              className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-800"
            />
            <label htmlFor="is_public" className={`text-sm ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Make this template available to other clubs
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Template
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
