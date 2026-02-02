import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Building2, Mail, Phone, Globe } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { Advertiser } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import { AdvertiserFormModal } from '../modals/AdvertiserFormModal';

export const AdvertisersTab: React.FC = () => {
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAdvertiser, setEditingAdvertiser] = useState<Advertiser | null>(null);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadAdvertisers();
  }, []);

  const loadAdvertisers = async () => {
    try {
      setLoading(true);
      const data = await advertisingStorage.getAdvertisers();
      setAdvertisers(data);
    } catch (error) {
      console.error('Error loading advertisers:', error);
      addNotification('Failed to load advertisers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (advertiser: Advertiser) => {
    setEditingAdvertiser(advertiser);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this advertiser? This will also delete all associated campaigns and banners.')) {
      return;
    }

    try {
      await advertisingStorage.deleteAdvertiser(id);
      addNotification('Advertiser deleted successfully', 'success');
      loadAdvertisers();
    } catch (error) {
      console.error('Error deleting advertiser:', error);
      addNotification('Failed to delete advertiser', 'error');
    }
  };

  const handleFormClose = (success?: boolean) => {
    setShowForm(false);
    setEditingAdvertiser(null);
    if (success) {
      loadAdvertisers();
    }
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
          Manage companies and organizations that advertise on your platform
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Advertiser
        </button>
      </div>

      {advertisers.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No advertisers yet. Create your first advertiser to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {advertisers.map((advertiser) => (
            <div
              key={advertiser.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {advertiser.logo_url ? (
                    <img
                      src={advertiser.logo_url}
                      alt={advertiser.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {advertiser.name}
                    </h3>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        advertiser.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {advertiser.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(advertiser)}
                    className="p-2 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(advertiser.id)}
                    className="p-2 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {advertiser.contact_name && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Building2 className="h-4 w-4" />
                    <span>{advertiser.contact_name}</span>
                  </div>
                )}
                {advertiser.contact_email && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Mail className="h-4 w-4" />
                    <span>{advertiser.contact_email}</span>
                  </div>
                )}
                {advertiser.contact_phone && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Phone className="h-4 w-4" />
                    <span>{advertiser.contact_phone}</span>
                  </div>
                )}
                {advertiser.website_url && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Globe className="h-4 w-4" />
                    <a
                      href={advertiser.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      Visit Website
                    </a>
                  </div>
                )}
              </div>

              {advertiser.notes && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {advertiser.notes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AdvertiserFormModal
          advertiser={editingAdvertiser}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
};
