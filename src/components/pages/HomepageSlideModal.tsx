import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload } from 'lucide-react';
import { MediaLibraryModal } from '../MediaLibraryModal';

interface HomepageSlide {
  id?: string;
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_url: string;
  is_active: boolean;
}

interface HomepageSlideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (slide: Partial<HomepageSlide>) => Promise<void>;
  slide: HomepageSlide | null;
  darkMode: boolean;
}

export const HomepageSlideModal: React.FC<HomepageSlideModalProps> = ({
  isOpen,
  onClose,
  onSave,
  slide,
  darkMode
}) => {
  const [formData, setFormData] = useState<Partial<HomepageSlide>>({
    title: '',
    subtitle: '',
    image_url: '',
    button_text: '',
    button_url: '',
    is_active: true
  });
  const [saving, setSaving] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);

  useEffect(() => {
    if (slide) {
      setFormData(slide);
    } else {
      setFormData({
        title: '',
        subtitle: '',
        image_url: '',
        button_text: '',
        button_url: '',
        is_active: true
      });
    }
  }, [slide]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.image_url) {
      alert('Title and image are required');
      return;
    }

    try {
      setSaving(true);
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving slide:', error);
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
            {slide ? 'Edit Slide' : 'Add New Slide'}
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
              Slide Image <span className="text-red-500">*</span>
            </label>
            {formData.image_url ? (
              <div className="relative">
                <img
                  src={formData.image_url}
                  alt="Slide preview"
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
              placeholder="e.g., Welcome to Our Club"
            />
          </div>

          {/* Subtitle */}
          <div>
            <label className="block text-sm font-medium mb-2">Subtitle</label>
            <textarea
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              rows={3}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="Brief description or tagline"
            />
          </div>

          {/* Button Text */}
          <div>
            <label className="block text-sm font-medium mb-2">Button Text (Optional)</label>
            <input
              type="text"
              value={formData.button_text}
              onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="e.g., Learn More"
            />
          </div>

          {/* Button URL */}
          <div>
            <label className="block text-sm font-medium mb-2">Button URL (Optional)</label>
            <input
              type="url"
              value={formData.button_url}
              onChange={(e) => setFormData({ ...formData, button_url: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder="https://..."
            />
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
              Show this slide on the homepage
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
              {saving ? 'Saving...' : slide ? 'Update Slide' : 'Add Slide'}
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
