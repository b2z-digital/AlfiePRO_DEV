import React, { useState, useEffect } from 'react';
import { Globe, Settings, Search, BarChart2, Share2, Save, Check, Image } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { EnhancedDomainManagementSection } from '../settings/EnhancedDomainManagementSection';
import { useNotifications } from '../../contexts/NotificationContext';

interface WebsiteSettingsProps {
  darkMode: boolean;
}

interface WebsiteSettingsData {
  seoTitle: string;
  seoDescription: string;
  allowIndexing: boolean;
  googleAnalyticsId: string;
  defaultShareImage: string | null;
  defaultShareDescription: string;
  facebookPixelId: string;
  twitterHandle: string;
}

export const WebsiteSettings: React.FC<WebsiteSettingsProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const [settings, setSettings] = useState<WebsiteSettingsData>({
    seoTitle: '',
    seoDescription: '',
    allowIndexing: true,
    googleAnalyticsId: '',
    defaultShareImage: null,
    defaultShareDescription: '',
    facebookPixelId: '',
    twitterHandle: ''
  });
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const orgId = currentOrganization?.id || currentClub?.clubId;
    if (orgId) {
      loadSettings();
    }
  }, [currentClub?.clubId, currentOrganization?.id]);

  const loadSettings = async () => {
    try {
      let data, error;

      if (currentOrganization) {
        const tableName = currentOrganization.type === 'state' ? 'state_associations' : 'national_associations';
        const result = await supabase
          .from(tableName)
          .select('name, description')
          .eq('id', currentOrganization.id)
          .single();
        data = result.data;
        error = result.error;
      } else {
        const result = await supabase
          .from('clubs')
          .select('seo_title, seo_description, allow_indexing, google_analytics_id, default_share_image, default_share_description, facebook_pixel_id, twitter_handle')
          .eq('id', currentClub?.clubId)
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      if (currentOrganization && data) {
        // For associations, use name and description
        setSettings({
          seoTitle: data.name || `${currentOrganization.name || 'Your Association'}`,
          seoDescription: data.description || `Official website of ${currentOrganization.name || 'Your Association'}`,
          allowIndexing: true,
          googleAnalyticsId: '',
          defaultShareImage: currentOrganization.logo || null,
          defaultShareDescription: `Visit the official website of ${currentOrganization.name || 'Your Association'}`,
          facebookPixelId: '',
          twitterHandle: ''
        });
      } else if (data) {
        // For clubs, use existing fields
        setSettings({
          seoTitle: data.seo_title || `${currentClub?.club?.name || 'Your Club'}`,
          seoDescription: data.seo_description || `Official website of ${currentClub?.club?.name || 'Your Club'}`,
          allowIndexing: data.allow_indexing !== false,
          googleAnalyticsId: data.google_analytics_id || '',
          defaultShareImage: data.default_share_image || currentClub?.club?.logo || null,
          defaultShareDescription: data.default_share_description || `Visit the official website of ${currentClub?.club?.name || 'Your Club'}`,
          facebookPixelId: data.facebook_pixel_id || '',
          twitterHandle: data.twitter_handle || ''
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      addNotification('error', 'Failed to load website settings');
    }
  };

  const handleInputChange = (key: keyof WebsiteSettingsData, value: string | boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('clubs')
        .update({
          seo_title: settings.seoTitle,
          seo_description: settings.seoDescription,
          allow_indexing: settings.allowIndexing,
          google_analytics_id: settings.googleAnalyticsId,
          default_share_image: settings.defaultShareImage,
          default_share_description: settings.defaultShareDescription,
          facebook_pixel_id: settings.facebookPixelId,
          twitter_handle: settings.twitterHandle
        })
        .eq('id', currentClub?.clubId);

      if (error) throw error;

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      addNotification('success', 'Website settings saved successfully');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      addNotification('error', error.message || 'Failed to save website settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Globe className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Domain Management</h1>
            <p className="text-slate-400">
              Configure your website domain settings
            </p>
          </div>
        </div>

        {showSuccess && (
          <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30 flex items-start gap-3">
            <Check className="text-green-400 mt-0.5" size={18} />
            <div>
              <h3 className="text-green-400 font-medium">Settings Saved</h3>
              <p className="text-green-300 text-sm">
                Your website settings have been updated successfully.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* Enhanced Domain Management - Now at the top */}
          {currentClub?.clubId && (
            <EnhancedDomainManagementSection
              entityType="club"
              entityId={currentClub.clubId}
              entityName={currentClub.club?.name || ''}
              currentSubdomain={currentClub.club?.abbreviation?.toLowerCase()}
              onDomainUpdate={loadSettings}
            />
          )}

          {/* SEO Settings */}
          <div className={`
            p-6 rounded-xl border backdrop-blur-sm
            ${darkMode
              ? 'bg-slate-800/30 border-slate-700/50'
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className="flex items-center gap-2 mb-6">
              <Search className="text-blue-400" size={20} />
              <h2 className="text-lg font-semibold text-white">SEO Settings</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Site Title
                </label>
                <input
                  type="text"
                  value={settings.seoTitle}
                  onChange={(e) => handleInputChange('seoTitle', e.target.value)}
                  placeholder="e.g., My Club Name"
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This will be used as the default page title for your website.
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Default Meta Description
                </label>
                <textarea
                  value={settings.seoDescription}
                  onChange={(e) => handleInputChange('seoDescription', e.target.value)}
                  rows={3}
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This description will be used for pages that don't have a specific meta description.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.allowIndexing}
                    onChange={(e) => handleInputChange('allowIndexing', e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                    Allow search engines to index your website
                  </span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  If disabled, your website will not appear in search engine results.
                </p>
              </div>
            </div>
          </div>

          {/* Analytics */}
          <div className={`
            p-6 rounded-xl border backdrop-blur-sm
            ${darkMode
              ? 'bg-slate-800/30 border-slate-700/50'
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className="flex items-center gap-2 mb-6">
              <BarChart2 className="text-blue-400" size={20} />
              <h2 className="text-lg font-semibold text-white">Analytics & Tracking</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Google Analytics Tracking ID
                </label>
                <input
                  type="text"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => handleInputChange('googleAnalyticsId', e.target.value)}
                  placeholder="e.g., G-XXXXXXXXXX"
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Enter your Google Analytics tracking ID to enable website analytics.
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Facebook Pixel ID
                </label>
                <input
                  type="text"
                  value={settings.facebookPixelId}
                  onChange={(e) => handleInputChange('facebookPixelId', e.target.value)}
                  placeholder="e.g., 1234567890"
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Track conversions and build audiences for Facebook ads.
                </p>
              </div>
            </div>
          </div>

          {/* Social Sharing */}
          <div className={`
            p-6 rounded-xl border backdrop-blur-sm
            ${darkMode
              ? 'bg-slate-800/30 border-slate-700/50'
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className="flex items-center gap-2 mb-6">
              <Share2 className="text-blue-400" size={20} />
              <h2 className="text-lg font-semibold text-white">Social Sharing</h2>
            </div>

            <div className="space-y-6">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Twitter Handle
                </label>
                <input
                  type="text"
                  value={settings.twitterHandle}
                  onChange={(e) => handleInputChange('twitterHandle', e.target.value)}
                  placeholder="@yourclub"
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Your club's Twitter/X handle for social card attribution.
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Default Share Image
                </label>
                <div className="flex items-center gap-4 mb-4">
                  {settings.defaultShareImage ? (
                    <img
                      src={settings.defaultShareImage}
                      alt="Share Image"
                      className="w-32 h-16 object-cover rounded-lg"
                    />
                  ) : (
                    <div className={`
                      w-32 h-16 flex items-center justify-center rounded-lg
                      ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                    `}>
                      <Image size={24} className="text-slate-400" />
                    </div>
                  )}
                  <div>
                    <button
                      onClick={() => {
                        // TODO: Implement image upload
                        addNotification('info', 'Image upload feature coming soon');
                      }}
                      className={`
                        px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                        ${darkMode
                          ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
                      `}
                    >
                      Upload Image
                    </button>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Recommended size: 1200x630px
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Default Share Description
                </label>
                <textarea
                  value={settings.defaultShareDescription}
                  onChange={(e) => handleInputChange('defaultShareDescription', e.target.value)}
                  rows={3}
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-white text-slate-800 border border-slate-200'}
                  `}
                />
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This description will be used when your website is shared on social media.
                </p>
              </div>
            </div>
          </div>

          {/* Save Settings Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsiteSettings;
