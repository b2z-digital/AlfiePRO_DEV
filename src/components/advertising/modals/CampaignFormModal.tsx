import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdCampaign, Advertiser } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';

interface CampaignFormModalProps {
  campaign?: AdCampaign | null;
  onClose: (success?: boolean) => void;
}

export const CampaignFormModal: React.FC<CampaignFormModalProps> = ({ campaign, onClose }) => {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [formData, setFormData] = useState({
    advertiser_id: '',
    name: '',
    description: '',
    pricing_model: 'flat_rate' as 'flat_rate' | 'cpm',
    flat_rate_amount: 0,
    cpm_rate: 0,
    budget_impressions: 0,
    budget_clicks: 0,
    start_date: '',
    end_date: '',
    priority: 5,
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadAdvertisers();
    if (campaign) {
      setFormData({
        advertiser_id: campaign.advertiser_id,
        name: campaign.name,
        description: campaign.description || '',
        pricing_model: campaign.pricing_model,
        flat_rate_amount: campaign.flat_rate_amount || 0,
        cpm_rate: campaign.cpm_rate || 0,
        budget_impressions: campaign.budget_impressions || 0,
        budget_clicks: campaign.budget_clicks || 0,
        start_date: campaign.start_date || '',
        end_date: campaign.end_date || '',
        priority: campaign.priority,
        is_active: campaign.is_active,
      });
    }
  }, [campaign]);

  const loadAdvertisers = async () => {
    const data = await advertisingStorage.getAdvertisers();
    setAdvertisers(data.filter(a => a.is_active));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.advertiser_id || !formData.name) {
      addNotification('Please fill in required fields', 'error');
      return;
    }

    try {
      setLoading(true);
      if (campaign) {
        await advertisingStorage.updateCampaign(campaign.id, formData);
        addNotification('Campaign updated successfully', 'success');
      } else {
        await advertisingStorage.createCampaign(formData);
        addNotification('Campaign created successfully', 'success');
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving campaign:', error);
      addNotification('Failed to save campaign', 'error');
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
              {campaign ? 'Edit Campaign' : 'Create Campaign'}
            </h2>
            <p className="text-blue-100 text-sm mt-1">Update campaign settings</p>
          </div>
          <button onClick={() => onClose()} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Advertiser *</label>
              <select
                value={formData.advertiser_id}
                onChange={(e) => setFormData({ ...formData, advertiser_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select Advertiser</option>
                {advertisers.map(adv => (
                  <option key={adv.id} value={adv.id}>{adv.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Campaign Name *</label>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pricing Model</label>
              <select
                value={formData.pricing_model}
                onChange={(e) => setFormData({ ...formData, pricing_model: e.target.value as 'flat_rate' | 'cpm' })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="flat_rate">Flat Rate</option>
                <option value="cpm">CPM</option>
              </select>
            </div>
            {formData.pricing_model === 'flat_rate' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Flat Rate Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.flat_rate_amount}
                  onChange={(e) => setFormData({ ...formData, flat_rate_amount: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CPM Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cpm_rate}
                  onChange={(e) => setFormData({ ...formData, cpm_rate: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="campaign_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <label htmlFor="campaign_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</label>
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
              {loading ? 'Saving...' : campaign ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
