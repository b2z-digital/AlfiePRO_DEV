import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Target, TrendingUp, Eye, MousePointer, DollarSign } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdCampaign } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import { CampaignFormModal } from '../modals/CampaignFormModal';
import { CampaignCreationWizard } from '../modals/CampaignCreationWizard';
import { format } from 'date-fns';

export const CampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<AdCampaign | null>(null);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await advertisingStorage.getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error('Error loading campaigns:', error);
      addNotification('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (campaign: AdCampaign) => {
    setEditingCampaign(campaign);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This will also delete all associated banners.')) {
      return;
    }

    try {
      await advertisingStorage.deleteCampaign(id);
      addNotification('Campaign deleted successfully', 'success');
      loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      addNotification('Failed to delete campaign', 'error');
    }
  };

  const toggleActive = async (campaign: AdCampaign) => {
    try {
      await advertisingStorage.updateCampaign(campaign.id, {
        is_active: !campaign.is_active,
      });
      addNotification('Campaign status updated', 'success');
      loadCampaigns();
    } catch (error) {
      console.error('Error updating campaign:', error);
      addNotification('Failed to update campaign', 'error');
    }
  };

  const handleFormClose = (success?: boolean) => {
    setShowForm(false);
    setEditingCampaign(null);
    if (success) {
      loadCampaigns();
    }
  };

  const getCampaignStatus = (campaign: AdCampaign) => {
    if (!campaign.is_active) return { label: 'Inactive', color: 'gray' };

    const now = new Date();
    if (campaign.start_date && new Date(campaign.start_date) > now) {
      return { label: 'Scheduled', color: 'blue' };
    }
    if (campaign.end_date && new Date(campaign.end_date) < now) {
      return { label: 'Ended', color: 'red' };
    }
    if (campaign.budget_impressions && campaign.current_impressions >= campaign.budget_impressions) {
      return { label: 'Budget Reached', color: 'yellow' };
    }
    return { label: 'Active', color: 'green' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600 dark:text-gray-400">
          Manage advertising campaigns with targeting and budgets
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No campaigns yet. Create your first campaign to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const status = getCampaignStatus(campaign);
            const ctr = campaign.current_impressions > 0
              ? (campaign.current_clicks / campaign.current_impressions) * 100
              : 0;

            return (
              <div
                key={campaign.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {campaign.name}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                          ${status.color === 'green' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}
                          ${status.color === 'blue' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : ''}
                          ${status.color === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : ''}
                          ${status.color === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : ''}
                          ${status.color === 'gray' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' : ''}
                        `}
                      >
                        {status.label}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Priority: {campaign.priority}
                      </span>
                    </div>
                    {campaign.advertiser && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        Advertiser: {campaign.advertiser.name}
                      </p>
                    )}
                    {campaign.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {campaign.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleActive(campaign)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${
                        campaign.is_active
                          ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200'
                          : 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200'
                      }`}
                    >
                      {campaign.is_active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(campaign)}
                      className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(campaign.id)}
                      className="p-2 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Impressions</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {campaign.current_impressions.toLocaleString()}
                      {campaign.budget_impressions && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          /{campaign.budget_impressions.toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <MousePointer className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Clicks</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {campaign.current_clicks.toLocaleString()}
                      {campaign.budget_clicks && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          /{campaign.budget_clicks.toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">CTR</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {ctr.toFixed(2)}%
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Pricing</span>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {campaign.pricing_model === 'flat_rate'
                        ? `$${campaign.flat_rate_amount?.toFixed(2)}`
                        : `$${campaign.cpm_rate?.toFixed(2)} CPM`}
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs text-gray-600 dark:text-gray-400">Duration</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {campaign.start_date && campaign.end_date
                        ? `${format(new Date(campaign.start_date), 'MMM d')} - ${format(new Date(campaign.end_date), 'MMM d')}`
                        : 'Ongoing'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && !editingCampaign && (
        <CampaignCreationWizard
          onClose={handleFormClose}
        />
      )}

      {showForm && editingCampaign && (
        <CampaignFormModal
          campaign={editingCampaign}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
};
