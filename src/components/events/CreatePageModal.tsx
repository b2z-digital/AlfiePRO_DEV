import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import type { EventWebsitePage } from '../../types/eventWebsite';

interface Props {
  websiteId: string;
  onSave: (page: EventWebsitePage) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export const CreatePageModal: React.FC<Props> = ({ websiteId, onSave, onClose, darkMode = false }) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [pageType, setPageType] = useState<EventWebsitePage['page_type']>('custom');
  const [showInNav, setShowInNav] = useState(true);
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!slugManuallyEdited && title) {
      const autoSlug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      setSlug(autoSlug);
    }
  }, [title, slugManuallyEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !slug.trim()) {
      alert('Please enter both title and slug');
      return;
    }

    setSaving(true);

    try {
      const { eventWebsiteStorage } = await import('../../utils/eventWebsiteStorage');
      const { supabase } = await import('../../utils/supabase');

      const { data: existingPages } = await supabase
        .from('event_website_pages')
        .select('navigation_order')
        .eq('event_website_id', websiteId)
        .order('navigation_order', { ascending: false })
        .limit(1);

      const maxOrder = existingPages && existingPages.length > 0 ? existingPages[0].navigation_order : -1;

      const newPage = await eventWebsiteStorage.createEventWebsitePage({
        event_website_id: websiteId,
        title: title.trim(),
        slug: slug.trim(),
        page_type: pageType,
        content_blocks: [],
        show_in_navigation: showInNav,
        is_published: isPublished,
        navigation_order: maxOrder + 1
      });

      onSave(newPage);
    } catch (error) {
      console.error('Error creating page:', error);
      alert('Failed to create page. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl ${
        darkMode ? 'bg-slate-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Create New Page
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Set up the basic details for your page
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-800 text-slate-400'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Page Title */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Page Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="About Us"
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              required
            />
          </div>

          {/* URL Slug */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              URL Slug *
            </label>
            <div className="flex items-center">
              <span className={`px-3 py-3 rounded-l-lg border border-r-0 ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-400'
                  : 'bg-slate-100 border-slate-300 text-slate-600'
              }`}>
                /
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManuallyEdited(true);
                }}
                placeholder="about_us"
                className={`flex-1 px-4 py-3 rounded-r-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                required
              />
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              Auto-generated from title, but you can customize it
            </p>
          </div>

          {/* Page Type */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${
              darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Page Type
            </label>
            <select
              value={pageType}
              onChange={(e) => setPageType(e.target.value as EventWebsitePage['page_type'])}
              className={`w-full px-4 py-3 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
            >
              <option value="custom">Custom</option>
              <option value="home">Home</option>
              <option value="about">About</option>
              <option value="schedule">Schedule</option>
              <option value="results">Results</option>
              <option value="media">Media</option>
              <option value="sponsors">Sponsors</option>
              <option value="competitors">Competitors</option>
              <option value="news">News</option>
              <option value="contact">Contact</option>
            </select>
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={showInNav}
                onChange={(e) => setShowInNav(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Show in navigation
              </span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Publish page
              </span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/30 transition-all hover:scale-[1.02] font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>Create & Build Page</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
