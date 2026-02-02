import React, { useState, useEffect } from 'react';
import { X, Upload } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdBanner, AdCampaign } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';

interface BannerFormModalProps {
  banner?: AdBanner | null;
  onClose: (success?: boolean) => void;
}

export const BannerFormModal: React.FC<BannerFormModalProps> = ({ banner, onClose }) => {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [formData, setFormData] = useState({
    campaign_id: '',
    name: '',
    ad_type: 'image' as 'image' | 'html5' | 'adsense' | 'text',
    image_url: '',
    html_content: '',
    adsense_code: '',
    text_headline: '',
    text_body: '',
    text_cta: '',
    link_url: '',
    size_width: 300,
    size_height: 250,
    is_active: true,
  });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadCampaigns();
    if (banner) {
      setFormData({
        campaign_id: banner.campaign_id,
        name: banner.name,
        ad_type: banner.ad_type,
        image_url: banner.image_url || '',
        html_content: banner.html_content || '',
        adsense_code: banner.adsense_code || '',
        text_headline: banner.text_content?.headline || '',
        text_body: banner.text_content?.body || '',
        text_cta: banner.text_content?.cta || '',
        link_url: banner.link_url || '',
        size_width: banner.size_width || 300,
        size_height: banner.size_height || 250,
        is_active: banner.is_active,
      });
    }
  }, [banner]);

  const loadCampaigns = async () => {
    const data = await advertisingStorage.getCampaigns();
    setCampaigns(data.filter(c => c.is_active));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const url = await advertisingStorage.uploadBannerImage(file);
      setFormData({ ...formData, image_url: url });
      addNotification('Image uploaded successfully', 'success');
    } catch (error) {
      console.error('Error uploading image:', error);
      addNotification('Failed to upload image', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.campaign_id || !formData.name) {
      addNotification('Please fill in required fields', 'error');
      return;
    }

    try {
      setLoading(true);
      const bannerData: any = {
        campaign_id: formData.campaign_id,
        name: formData.name,
        ad_type: formData.ad_type,
        link_url: formData.link_url,
        size_width: formData.size_width,
        size_height: formData.size_height,
        is_active: formData.is_active,
      };

      if (formData.ad_type === 'image') bannerData.image_url = formData.image_url;
      if (formData.ad_type === 'html5') bannerData.html_content = formData.html_content;
      if (formData.ad_type === 'adsense') bannerData.adsense_code = formData.adsense_code;
      if (formData.ad_type === 'text') {
        bannerData.text_content = {
          headline: formData.text_headline,
          body: formData.text_body,
          cta: formData.text_cta,
        };
      }

      if (banner) {
        await advertisingStorage.updateBanner(banner.id, bannerData);
        addNotification('Banner updated successfully', 'success');
      } else {
        await advertisingStorage.createBanner(bannerData);
        addNotification('Banner created successfully', 'success');
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving banner:', error);
      addNotification('Failed to save banner', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {banner ? 'Edit Banner' : 'Create Banner'}
            </h2>
            <p className="text-blue-100 text-sm mt-1">Configure your advertising banner</p>
          </div>
          <button onClick={() => onClose()} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Campaign *</label>
              <select
                value={formData.campaign_id}
                onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select Campaign</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Banner Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ad Type</label>
            <select
              value={formData.ad_type}
              onChange={(e) => setFormData({ ...formData, ad_type: e.target.value as any })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="image">Image Banner</option>
              <option value="html5">HTML5 Banner</option>
              <option value="adsense">Google AdSense</option>
              <option value="text">Text Ad</option>
            </select>
          </div>

          {formData.ad_type === 'image' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Banner Image</label>
              <div className="flex gap-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  id="banner-upload"
                />
                <label
                  htmlFor="banner-upload"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
                </label>
                {formData.image_url && (
                  <img src={formData.image_url} alt="Preview" className="h-20 rounded border border-gray-300 dark:border-gray-600" />
                )}
              </div>
            </div>
          )}

          {formData.ad_type === 'html5' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">HTML Content</label>
              <textarea
                value={formData.html_content}
                onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                placeholder="<div>Your HTML here</div>"
              />
            </div>
          )}

          {formData.ad_type === 'adsense' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">AdSense Code</label>
              <textarea
                value={formData.adsense_code}
                onChange={(e) => setFormData({ ...formData, adsense_code: e.target.value })}
                rows={6}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                placeholder="<script async src=&quot;https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXX&quot; crossorigin=&quot;anonymous&quot;></script>"
              />
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Google AdSense will automatically handle ad sizing and placement. No need to specify dimensions or click URLs.
              </p>
            </div>
          )}

          {formData.ad_type === 'text' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Headline</label>
                <input
                  type="text"
                  value={formData.text_headline}
                  onChange={(e) => setFormData({ ...formData, text_headline: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Body</label>
                <textarea
                  value={formData.text_body}
                  onChange={(e) => setFormData({ ...formData, text_body: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Call-to-Action</label>
                <input
                  type="text"
                  value={formData.text_cta}
                  onChange={(e) => setFormData({ ...formData, text_cta: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {formData.ad_type !== 'adsense' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Click URL</label>
                <input
                  type="url"
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="https://example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Width (px)</label>
                  <input
                    type="number"
                    value={formData.size_width}
                    onChange={(e) => setFormData({ ...formData, size_width: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Height (px)</label>
                  <input
                    type="number"
                    value={formData.size_height}
                    onChange={(e) => setFormData({ ...formData, size_height: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center">
            <input
              type="checkbox"
              id="banner_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <label htmlFor="banner_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</label>
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : banner ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
