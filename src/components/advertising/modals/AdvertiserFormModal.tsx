import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { Advertiser } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import { supabase } from '../../../utils/supabase';
import imageCompression from 'browser-image-compression';

interface AdvertiserFormModalProps {
  advertiser?: Advertiser | null;
  onClose: (success?: boolean) => void;
}

export const AdvertiserFormModal: React.FC<AdvertiserFormModalProps> = ({
  advertiser,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    website_url: '',
    logo_url: '',
    notes: '',
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const { addNotification } = useNotification();

  useEffect(() => {
    if (advertiser) {
      setFormData({
        name: advertiser.name,
        contact_name: advertiser.contact_name || '',
        contact_email: advertiser.contact_email || '',
        contact_phone: advertiser.contact_phone || '',
        website_url: advertiser.website_url || '',
        logo_url: advertiser.logo_url || '',
        notes: advertiser.notes || '',
        is_active: advertiser.is_active,
      });
    }
  }, [advertiser]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addNotification('Please upload an image file', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addNotification('Image size should be less than 5MB', 'error');
      return;
    }

    setLogoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setFormData({ ...formData, logo_url: previewUrl });
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return formData.logo_url;

    try {
      setIsUploadingLogo(true);

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(logoFile, options);
      const fileExt = logoFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `advertising/logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressedFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('Error uploading logo:', err);
      addNotification('Failed to upload logo', 'error');
      return null;
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setFormData({ ...formData, logo_url: '' });
  };

  const normalizeWebsiteUrl = (url: string): string => {
    if (!url) return url;
    const trimmedUrl = url.trim();
    if (trimmedUrl.startsWith('www.')) {
      return `https://${trimmedUrl}`;
    }
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      if (trimmedUrl.includes('.')) {
        return `https://${trimmedUrl}`;
      }
    }
    return trimmedUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      addNotification('Please enter an advertiser name', 'error');
      return;
    }

    try {
      setLoading(true);

      let logoUrl = formData.logo_url;
      if (logoFile) {
        const uploadedUrl = await uploadLogo();
        if (!uploadedUrl) {
          setLoading(false);
          return;
        }
        logoUrl = uploadedUrl;
      }

      const normalizedWebsiteUrl = normalizeWebsiteUrl(formData.website_url);

      const dataToSave = {
        ...formData,
        logo_url: logoUrl,
        website_url: normalizedWebsiteUrl,
      };

      if (advertiser) {
        await advertisingStorage.updateAdvertiser(advertiser.id, dataToSave);
        addNotification('Advertiser updated successfully', 'success');
      } else {
        await advertisingStorage.createAdvertiser(dataToSave);
        addNotification('Advertiser created successfully', 'success');
      }

      onClose(true);
    } catch (error) {
      console.error('Error saving advertiser:', error);
      addNotification('Failed to save advertiser', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {advertiser ? 'Edit Advertiser' : 'Add Advertiser'}
          </h2>
          <button
            onClick={() => onClose()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Company Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Name
              </label>
              <input
                type="text"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Email
              </label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact Phone
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Website URL
              </label>
              <input
                type="text"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="www.example.com or https://example.com"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formData.website_url && formData.website_url.startsWith('www.')
                  ? `Will be saved as: ${normalizeWebsiteUrl(formData.website_url)}`
                  : 'URLs starting with "www." will automatically have "https://" added'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Company Logo
            </label>
            <div className="flex items-start gap-4">
              <div className="relative flex-shrink-0">
                {formData.logo_url ? (
                  <div className="relative w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-700">
                    <img
                      src={formData.logo_url}
                      alt="Logo preview"
                      className="w-full h-full object-contain p-2"
                    />
                    {isUploadingLogo && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
                    <ImageIcon size={32} className="text-gray-400" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3">
                <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors w-fit">
                  <Upload size={16} />
                  <span>Upload Logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    disabled={isUploadingLogo || loading}
                  />
                </label>

                {formData.logo_url && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    disabled={isUploadingLogo || loading}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Remove</span>
                  </button>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Recommended: PNG or JPG, max 5MB. Logo will be automatically compressed and resized.
                </p>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : advertiser ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
