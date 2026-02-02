import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Layout, MapPin, Image } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdPlacement, AdBanner } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import { PlacementFormModal } from '../modals/PlacementFormModal';

export const PlacementsTab: React.FC = () => {
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [activeBanners, setActiveBanners] = useState<Record<string, AdBanner[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<AdPlacement | null>(null);
  const { addNotification } = useNotification();

  useEffect(() => {
    loadPlacements();
  }, []);

  const loadPlacements = async () => {
    try {
      setLoading(true);
      const data = await advertisingStorage.getPlacements();
      // Filter to only show active placements
      const activePlacements = data.filter(p => p.is_active);
      setPlacements(activePlacements);

      // Load active banners for each placement
      const bannersMap: Record<string, AdBanner[]> = {};
      for (const placement of activePlacements) {
        const banners = await advertisingStorage.getActiveBannersForPlacement(
          placement.position,
          placement.page_type
        );
        if (banners.length > 0) {
          bannersMap[placement.id] = banners;
        }
      }
      setActiveBanners(bannersMap);
    } catch (error) {
      console.error('Error loading placements:', error);
      addNotification('Failed to load placements', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (placement: AdPlacement) => {
    setEditingPlacement(placement);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this placement?')) {
      return;
    }

    try {
      await advertisingStorage.deletePlacement(id);
      addNotification('Placement deleted successfully', 'success');
      loadPlacements();
    } catch (error) {
      console.error('Error deleting placement:', error);
      addNotification('Failed to delete placement', 'error');
    }
  };

  const toggleActive = async (placement: AdPlacement) => {
    try {
      await advertisingStorage.updatePlacement(placement.id, {
        is_active: !placement.is_active,
      });
      addNotification('Placement status updated', 'success');
      loadPlacements();
    } catch (error) {
      console.error('Error updating placement:', error);
      addNotification('Failed to update placement', 'error');
    }
  };

  const handleFormClose = (success?: boolean) => {
    setShowForm(false);
    setEditingPlacement(null);
    if (success) {
      loadPlacements();
    }
  };

  const getPageTypeLabel = (pageType: string) => {
    return pageType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getPositionLabel = (position: string) => {
    return position.charAt(0).toUpperCase() + position.slice(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Group placements by page type
  const groupedPlacements = placements.reduce((acc, placement) => {
    const pageType = placement.page_type || 'all';
    if (!acc[pageType]) {
      acc[pageType] = [];
    }
    acc[pageType].push(placement);
    return acc;
  }, {} as Record<string, AdPlacement[]>);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600 dark:text-gray-400">
          Manage ad placement zones across your platform
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Placement
        </button>
      </div>

      {placements.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <Layout className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No placements yet. Create your first placement to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedPlacements).map(([pageType, pagePlacements]) => (
            <div key={pageType}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                {getPageTypeLabel(pageType)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagePlacements.map((placement) => (
                  <div
                    key={placement.id}
                    className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {placement.name}
                        </h4>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            placement.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {placement.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => toggleActive(placement)}
                          className={`px-2 py-1 rounded text-xs ${
                            placement.is_active
                              ? 'text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900'
                              : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900'
                          }`}
                        >
                          {placement.is_active ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          onClick={() => handleEdit(placement)}
                          className="p-1 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(placement.id)}
                          className="p-1 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {placement.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {placement.description}
                      </p>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Position:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {getPositionLabel(placement.position)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Size:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {placement.size_width}x{placement.size_height}px
                        </span>
                      </div>
                    </div>

                    {/* Visual size representation */}
                    <div className="mt-4 bg-gray-100 dark:bg-gray-900 rounded p-2 flex items-center justify-center">
                      <div
                        className="bg-blue-200 dark:bg-blue-900 border-2 border-blue-400 dark:border-blue-600 rounded flex items-center justify-center text-xs text-gray-600 dark:text-gray-400"
                        style={{
                          width: `${Math.min(placement.size_width / 4, 200)}px`,
                          height: `${Math.min(placement.size_height / 4, 100)}px`,
                          maxWidth: '100%',
                        }}
                      >
                        Ad Zone
                      </div>
                    </div>

                    {/* Active Banners */}
                    {activeBanners[placement.id] && activeBanners[placement.id].length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          <Image className="h-4 w-4 text-gray-500" />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Active Banners ({activeBanners[placement.id].length})
                          </span>
                        </div>
                        <div className="space-y-1">
                          {activeBanners[placement.id].map((banner) => (
                            <div
                              key={banner.id}
                              className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded px-2 py-1"
                            >
                              {banner.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <PlacementFormModal
          placement={editingPlacement}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
};
