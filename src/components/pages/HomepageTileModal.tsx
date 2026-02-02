import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { MediaLibraryModal } from '../MediaLibraryModal';

interface HomepageTile {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  is_active: boolean;
}

interface HomepageTileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tile: Partial<HomepageTile>) => Promise<void>;
  tile: HomepageTile | null;
  darkMode: boolean;
}

export const HomepageTileModal: React.FC<HomepageTileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  tile,
  darkMode
}) => {
  const [formData, setFormData] = useState<Partial<HomepageTile>>({
    title: '',
    description: '',
    image_url: '',
    link_url: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);

  useEffect(() => {
    if (tile) {
      setFormData(tile);
    } else {
      setFormData({
        title: '',
        description: '',
        image_url: '',
        link_url: '',
        is_active: true
      });
    }
  }, [tile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.image_url || !formData.link_url) {
      alert('Title, image, and link URL are required');
      return;
    }

    try {
      setSaving(true);
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving tile:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div
        className={`w-full max-w-2xl rounded-xl shadow-2xl ${
          darkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold">
            {tile ? 'Edit Tile' : 'Add New Tile'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Tile Image <span className="text-red-500">*</span>
            </label>
            {formData.image_url ? (
              <div className="relative">
                <img
                  src={formData.image_url}
                  alt="Tile preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowImageUpload(true)}
                  className="absolute top-2 right-2 px-3 py-1.5 bg-white text-gray-900 rounded shadow hover:bg-gray-100 transition-colors text-sm font-medium"
                >
                  Change Image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImageUpload(true)}
                className={`w-full h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-colors ${
                  darkMode
                    ? 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <Upload className="w-8 h-8 text-gray-400" />
                <span className="text-sm text-gray-500">Click to upload image</span>
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="e.g., MEMBERSHIP"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Brief description shown on hover"
            />
          </div>

          {/* Link URL */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Link URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={formData.link_url}
              onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="https://... or /page-path"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use full URLs (https://...) for external links, or page paths (/membership) for internal links
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium cursor-pointer">
              Show this tile on the homepage
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : tile ? 'Update Tile' : 'Add Tile'}
            </button>
          </div>
        </form>
      </div>

      {/* Media Library Modal */}
      {showImageUpload && (
        <MediaLibraryModal
          isOpen={showImageUpload}
          onClose={() => setShowImageUpload(false)}
          onSelect={(url) => {
            setFormData({ ...formData, image_url: url });
            setShowImageUpload(false);
          }}
          darkMode={darkMode}
          isHomepageMedia={true}
        />
      )}
    </div>,
    document.body
  );
};
