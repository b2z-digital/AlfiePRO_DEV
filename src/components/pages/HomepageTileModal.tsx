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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="a-sheet w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '20px 24px 4px' }}>
          <h2 className="a-display a-ink m-0 text-[20px] font-semibold">
            {tile ? 'Edit tile' : 'Add tile'}
          </h2>
          <button
            onClick={onClose}
            className="a-ib" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" style={{ padding: '16px 24px 24px' }}>
          {/* Image */}
          <div>
            <label className="a-flab">
              Tile image <span className="a-txt-r">*</span>
            </label>
            {formData.image_url ? (
              <div className="relative">
                <img
                  src={formData.image_url}
                  alt="Tile preview"
                  className="w-full h-48 object-cover" style={{ borderRadius: 14 }}
                />
                <button
                  type="button"
                  onClick={() => setShowImageUpload(true)}
                  className="a-gb absolute top-2.5 right-2.5 text-[13px] font-medium" style={{ width: 'auto', padding: '0 14px' }}
                >
                  Change image
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImageUpload(true)}
                className="a-dropzone w-full h-48 flex flex-col items-center justify-center gap-2"
              >
                <span className="a-tile" style={{ width: 44, height: 44 }}><Upload size={20} /></span>
                <span className="a-mute text-[13.5px]">Click to upload image</span>
              </button>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="a-flab">
              Title <span className="a-txt-r">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="a-inp w-full"
              placeholder="e.g., MEMBERSHIP"
            />
          </div>

          {/* Description */}
          <div>
            <label className="a-flab">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="a-inp w-full"
              placeholder="Brief description shown on hover"
            />
          </div>

          {/* Link URL */}
          <div>
            <label className="a-flab">
              Link URL <span className="a-txt-r">*</span>
            </label>
            <input
              type="text"
              value={formData.link_url}
              onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
              className="a-inp w-full"
              placeholder="https://... or /page-path"
            />
            <p className="a-dim text-[12px] mt-1.5">
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
              className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
            />
            <label htmlFor="is_active" className="a-ink text-[14px] cursor-pointer">
              Show this tile on the homepage
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="a-btn flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="a-btn a-btn-p flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : tile ? 'Save tile' : 'Add tile'}
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
