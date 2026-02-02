import React from 'react';
import { X, ExternalLink, MapPin, Image as ImageIcon } from 'lucide-react';
import { AdBanner, AdPlacement } from '../../../types/advertising';

interface BannerPreviewModalProps {
  banner: AdBanner;
  placements: AdPlacement[];
  onClose: () => void;
}

export const BannerPreviewModal: React.FC<BannerPreviewModalProps> = ({
  banner,
  placements,
  onClose,
}) => {
  const getPageTypeLabel = (pageType: string) => {
    return pageType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const getPositionLabel = (position: string) => {
    return position.charAt(0).toUpperCase() + position.slice(1);
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {banner.name}
            </h2>
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
              {banner.campaign && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Campaign: {banner.campaign.name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Banner Preview */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Preview
            </h3>
            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-8 flex items-center justify-center">
              {banner.ad_type === 'image' && banner.image_url ? (
                <img
                  src={banner.image_url}
                  alt={banner.name}
                  className="max-w-full max-h-[400px] object-contain"
                />
              ) : banner.ad_type === 'text' && banner.text_content ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-lg text-center">
                  <h4 className="font-bold text-2xl mb-3 text-gray-900 dark:text-white">
                    {banner.text_content.headline}
                  </h4>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    {banner.text_content.body}
                  </p>
                  {banner.text_content.cta && (
                    <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      {banner.text_content.cta}
                    </button>
                  )}
                </div>
              ) : banner.ad_type === 'html5' && banner.html_content ? (
                <div
                  className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden"
                  style={{
                    width: banner.size_width ? `${banner.size_width}px` : 'auto',
                    height: banner.size_height ? `${banner.size_height}px` : 'auto'
                  }}
                  dangerouslySetInnerHTML={{ __html: banner.html_content }}
                />
              ) : banner.ad_type === 'adsense' ? (
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-full mb-4">
                    <ImageIcon className="h-10 w-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Google AdSense Unit</p>
                  {banner.adsense_settings?.slot_id && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                      Slot ID: {banner.adsense_settings.slot_id}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                  <p>No preview available</p>
                </div>
              )}
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Size</label>
                <p className="text-gray-900 dark:text-white">
                  {banner.size_width}x{banner.size_height}px
                </p>
              </div>

              {banner.link_url && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Link URL</label>
                  <a
                    href={banner.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span className="truncate">{banner.link_url}</span>
                    <ExternalLink className="h-4 w-4 flex-shrink-0" />
                  </a>
                </div>
              )}

              {banner.alt_text && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Alt Text</label>
                  <p className="text-gray-900 dark:text-white">{banner.alt_text}</p>
                </div>
              )}
            </div>

            {/* Right Column - Placements */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-5 w-5 text-gray-500" />
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Active Placements
                </label>
              </div>
              {placements.length > 0 ? (
                <div className="space-y-2">
                  {placements.map((placement) => (
                    <div
                      key={placement.id}
                      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {placement.name}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {getPageTypeLabel(placement.page_type || 'all')}
                            </span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {getPositionLabel(placement.position)}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded">
                          {placement.size_width}x{placement.size_height}px
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No active placements
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
