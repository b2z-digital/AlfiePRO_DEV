import React, { useState } from 'react';
import { X, FileText } from 'lucide-react';

interface CreatePageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, slug: string) => void;
  darkMode: boolean;
}

export const CreatePageModal: React.FC<CreatePageModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  darkMode
}) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [autoSlug, setAutoSlug] = useState(true);

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (autoSlug) {
      setSlug(generateSlug(newTitle));
    }
  };

  const handleSlugChange = (newSlug: string) => {
    setAutoSlug(false);
    setSlug(newSlug);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      const finalSlug = slug || generateSlug(title);
      onCreate(title.trim(), finalSlug);
      setTitle('');
      setSlug('');
      setAutoSlug(true);
    }
  };

  const handleClose = () => {
    setTitle('');
    setSlug('');
    setAutoSlug(true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`
          relative w-full max-w-md rounded-xl border shadow-2xl
          ${darkMode
            ? 'bg-slate-800 border-slate-700'
            : 'bg-white border-slate-200'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-600/20">
              <FileText size={20} className="text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">Create New Page</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Page Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g., About Us, Contact, Events"
              autoFocus
              className={`
                w-full px-4 py-2.5 rounded-lg transition-colors
                ${darkMode
                  ? 'bg-slate-700 text-white border border-slate-600 focus:border-green-500'
                  : 'bg-white text-slate-800 border border-slate-200 focus:border-green-500'}
                focus:outline-none focus:ring-2 focus:ring-green-500/20
              `}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              URL Slug
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="about-us"
                className={`
                  flex-1 px-4 py-2.5 rounded-lg transition-colors
                  ${darkMode
                    ? 'bg-slate-700 text-white border border-slate-600 focus:border-green-500'
                    : 'bg-white text-slate-800 border border-slate-200 focus:border-green-500'}
                  focus:outline-none focus:ring-2 focus:ring-green-500/20
                `}
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {autoSlug ? 'Auto-generated from title' : 'Custom slug'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className={`
                flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className={`
                flex-1 px-4 py-2.5 rounded-lg font-medium transition-all
                ${title.trim()
                  ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-lg hover:shadow-green-500/20'
                  : 'bg-slate-600 text-slate-400 cursor-not-allowed'}
              `}
            >
              Create Page
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePageModal;
