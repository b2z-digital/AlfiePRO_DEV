import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Image as ImageIcon, Code, FileText, LayoutGrid, List, MapPin } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdBanner, AdPlacement } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import { BannerFormModal } from '../modals/BannerFormModal';
import { BannerPreviewModal } from '../modals/BannerPreviewModal';

type ViewMode = 'grid' | 'list';

export const BannersTab: React.FC = () => {
  const [banners, setBanners] = useState<AdBanner[]>([]);
  const [bannerPlacements, setBannerPlacements] = useState<Record<string, AdPlacement[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AdBanner | null>(null);
  const [previewBanner, setPreviewBanner] = useState<AdBanner | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const { addNotification } = useNotification();

  useEffect(() => {
    loadBanners();
  }, []);

  const loadBanners = async () => {
    try {
      setLoading(true);
      const data = await advertisingStorage.getBanners();
      setBanners(data);

      // Load placements for each banner
      const placementsMap: Record<string, AdPlacement[]> = {};
      for (const banner of data) {
        const placements = await advertisingStorage.getPlacementsForBanner(banner.id);
        placementsMap[banner.id] = placements;
      }
      setBannerPlacements(placementsMap);
    } catch (error) {
      console.error('Error loading banners:', error);
      addNotification('Failed to load banners', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (banner: AdBanner) => {
    setEditingBanner(banner);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this banner?')) {
      return;
    }

    try {
      await advertisingStorage.deleteBanner(id);
      addNotification('Banner deleted successfully', 'success');
      loadBanners();
    } catch (error) {
      console.error('Error deleting banner:', error);
      addNotification('Failed to delete banner', 'error');
    }
  };

  const toggleActive = async (banner: AdBanner) => {
    try {
      await advertisingStorage.updateBanner(banner.id, {
        is_active: !banner.is_active,
      });
      addNotification('Banner status updated', 'success');
      loadBanners();
    } catch (error) {
      console.error('Error updating banner:', error);
      addNotification('Failed to update banner', 'error');
    }
  };

  const handleFormClose = (success?: boolean) => {
    setShowForm(false);
    setEditingBanner(null);
    if (success) {
      loadBanners();
    }
  };

  const getAdTypeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="h-5 w-5" />;
      case 'html5':
      case 'adsense':
        return <Code className="h-5 w-5" />;
      case 'text':
        return <FileText className="h-5 w-5" />;
      default:
        return <ImageIcon className="h-5 w-5" />;
    }
  };

  const getAdTypeLabel = (type: string) => {
    switch (type) {
      case 'image':
        return 'Image Banner';
      case 'html5':
        return 'HTML5 Banner';
      case 'adsense':
        return 'Google AdSense';
      case 'text':
        return 'Text Ad';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const getPageTypeLabel = (pageType: string) => {
    return pageType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getPositionLabel = (position: string) => {
    return position.charAt(0).toUpperCase() + position.slice(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600 dark:text-gray-400">
          Manage banner creative for your campaigns
        </p>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition-colors ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Banner
          </button>
        </div>
      </div>

      {banners.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No banners yet. Create your first banner to get started.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Banner Preview - Clickable */}
              <div
                className="bg-gray-100 dark:bg-gray-900 p-4 flex items-center justify-center min-h-[200px] cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setPreviewBanner(banner)}
              >
                {banner.ad_type === 'image' && banner.image_url ? (
                  <img
                    src={banner.image_url}
                    alt={banner.name}
                    className="max-w-full max-h-[180px] object-contain"
                  />
                ) : banner.ad_type === 'text' && banner.text_content ? (
                  <div className="text-center p-4">
                    <h4 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">
                      {banner.text_content.headline}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {banner.text_content.body}
                    </p>
                    {banner.text_content.cta && (
                      <button className="px-4 py-2 bg-blue-600 text-white rounded text-sm">
                        {banner.text_content.cta}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    {getAdTypeIcon(banner.ad_type)}
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {getAdTypeLabel(banner.ad_type)}
                    </p>
                  </div>
                )}
              </div>

              {/* Banner Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {banner.name}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          banner.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {banner.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {getAdTypeLabel(banner.ad_type)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => toggleActive(banner)}
                      className={`p-1.5 rounded text-xs ${
                        banner.is_active
                          ? 'text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900'
                          : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900'
                      }`}
                    >
                      {banner.is_active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleEdit(banner)}
                      className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(banner.id)}
                      className="p-1.5 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {banner.campaign && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Campaign: {banner.campaign.name}
                  </p>
                )}

                {(banner.size_width || banner.size_height) && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Size: {banner.size_width}x{banner.size_height}px
                  </p>
                )}

                {banner.link_url && (
                  <a
                    href={banner.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline block mt-2 truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {banner.link_url}
                  </a>
                )}

                {/* Placements Info */}
                {bannerPlacements[banner.id] && bannerPlacements[banner.id].length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <MapPin className="h-3 w-3" />
                      <span>Active on {bannerPlacements[banner.id].length} placement{bannerPlacements[banner.id].length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {bannerPlacements[banner.id].slice(0, 2).map((placement) => (
                        <span
                          key={placement.id}
                          className="text-xs bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded"
                        >
                          {getPageTypeLabel(placement.page_type || 'all')}
                        </span>
                      ))}
                      {bannerPlacements[banner.id].length > 2 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          +{bannerPlacements[banner.id].length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // List View
        <div className="space-y-3">
          {banners.map((banner) => (
            <div
              key={banner.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center gap-4 p-4">
                {/* Thumbnail */}
                <div
                  className="flex-shrink-0 w-32 h-20 bg-gray-100 dark:bg-gray-900 rounded flex items-center justify-center cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => setPreviewBanner(banner)}
                >
                  {banner.ad_type === 'image' && banner.image_url ? (
                    <img
                      src={banner.image_url}
                      alt={banner.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-center">
                      {getAdTypeIcon(banner.ad_type)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
                        {banner.name}
                      </h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            banner.is_active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {banner.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {getAdTypeLabel(banner.ad_type)}
                        </span>
                        {banner.campaign && (
                          <>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {banner.campaign.name}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {banner.size_width}x{banner.size_height}px
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleActive(banner)}
                        className={`px-2 py-1 rounded text-xs ${
                          banner.is_active
                            ? 'text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900'
                            : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900'
                        }`}
                      >
                        {banner.is_active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleEdit(banner)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(banner.id)}
                        className="p-1.5 text-gray-600 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Placements */}
                  {bannerPlacements[banner.id] && bannerPlacements[banner.id].length > 0 ? (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mt-2">
                      <MapPin className="h-3 w-3" />
                      <span>Active on:</span>
                      <div className="flex flex-wrap gap-1">
                        {bannerPlacements[banner.id].map((placement) => (
                          <span
                            key={placement.id}
                            className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200 px-2 py-0.5 rounded"
                          >
                            {getPageTypeLabel(placement.page_type || 'all')} - {getPositionLabel(placement.position)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-2">
                      <MapPin className="h-3 w-3" />
                      <span>No active placements</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <BannerFormModal
          banner={editingBanner}
          onClose={handleFormClose}
        />
      )}

      {previewBanner && (
        <BannerPreviewModal
          banner={previewBanner}
          placements={bannerPlacements[previewBanner.id] || []}
          onClose={() => setPreviewBanner(null)}
        />
      )}
    </div>
  );
};
