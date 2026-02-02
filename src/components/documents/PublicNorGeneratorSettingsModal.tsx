import React, { useState, useEffect } from 'react';
import { X, Globe, Link as LinkIcon, Palette, Image, CheckCircle, Copy, ExternalLink } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface PublicNorGeneratorSettingsModalProps {
  darkMode: boolean;
  onClose: () => void;
}

interface GeneratorSettings {
  id?: string;
  club_id: string;
  is_enabled: boolean;
  slug: string;
  custom_domain: string;
  default_template_id: string | null;
  allow_template_selection: boolean;
  branding_logo_url: string;
  branding_primary_color: string;
  welcome_message: string;
}

export const PublicNorGeneratorSettingsModal: React.FC<PublicNorGeneratorSettingsModalProps> = ({
  darkMode,
  onClose
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [settings, setSettings] = useState<GeneratorSettings>({
    club_id: currentClub?.clubId || '',
    is_enabled: false,
    slug: '',
    custom_domain: '',
    default_template_id: null,
    allow_template_selection: true,
    branding_logo_url: '',
    branding_primary_color: '#3B82F6',
    welcome_message: ''
  });

  useEffect(() => {
    loadSettings();
  }, [currentClub]);

  const loadSettings = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoading(true);

      // Load existing settings
      const { data: settingsData } = await supabase
        .from('public_nor_generator_settings')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .maybeSingle();

      if (settingsData) {
        setSettings(settingsData);
      } else {
        // Generate default slug from club name
        const defaultSlug = currentClub.clubName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 50);
        setSettings(prev => ({ ...prev, slug: defaultSlug }));
      }

      // Load NOR templates
      const { data: templatesData } = await supabase
        .from('document_templates')
        .select('id, name, description')
        .eq('club_id', currentClub.clubId)
        .eq('document_type', 'nor')
        .eq('is_active', true)
        .order('name');

      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Error loading settings:', error);
      addNotification('error', 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentClub?.clubId) return;

    // Validate slug
    if (!settings.slug || settings.slug.length < 3) {
      addNotification('error', 'Slug must be at least 3 characters');
      return;
    }

    if (!/^[a-z0-9-]+$/.test(settings.slug)) {
      addNotification('error', 'Slug can only contain lowercase letters, numbers, and hyphens');
      return;
    }

    try {
      setSaving(true);

      if (settings.id) {
        // Update existing
        const { error } = await supabase
          .from('public_nor_generator_settings')
          .update({
            is_enabled: settings.is_enabled,
            slug: settings.slug,
            custom_domain: settings.custom_domain || null,
            default_template_id: settings.default_template_id,
            allow_template_selection: settings.allow_template_selection,
            branding_logo_url: settings.branding_logo_url || null,
            branding_primary_color: settings.branding_primary_color,
            welcome_message: settings.welcome_message || null
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('public_nor_generator_settings')
          .insert({
            club_id: currentClub.clubId,
            is_enabled: settings.is_enabled,
            slug: settings.slug,
            custom_domain: settings.custom_domain || null,
            default_template_id: settings.default_template_id,
            allow_template_selection: settings.allow_template_selection,
            branding_logo_url: settings.branding_logo_url || null,
            branding_primary_color: settings.branding_primary_color,
            welcome_message: settings.welcome_message || null
          });

        if (error) throw error;
      }

      addNotification('success', 'Settings saved successfully');
      onClose();
    } catch (error: any) {
      console.error('Error saving settings:', error);
      if (error.code === '23505') {
        addNotification('error', 'This slug is already in use. Please choose a different one.');
      } else {
        addNotification('error', 'Failed to save settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const generatorUrl = `${window.location.origin}/nor/${settings.slug}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(generatorUrl);
    addNotification('success', 'URL copied to clipboard');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className={`w-full max-w-4xl rounded-xl shadow-xl overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className={`mt-4 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className={`w-full max-w-4xl rounded-xl shadow-xl my-8 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Public NOR Generator Settings
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Create a public page where anyone can generate Notice of Race documents
            </p>
          </div>
          <button
            onClick={onClose}
            className={`rounded-full p-2 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-240px)] overflow-y-auto">
          {/* Enable/Disable */}
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.is_enabled}
                onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Enable Public NOR Generator
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Make the generator accessible via public URL
                </p>
              </div>
            </label>
          </div>

          {/* URL Configuration */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
              <Globe className="inline w-4 h-4 mr-1" />
              Generator URL Slug
            </label>
            <input
              type="text"
              value={settings.slug}
              onChange={(e) => setSettings({ ...settings, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="my-club-nor"
              className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:ring-2 focus:ring-blue-500`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Only lowercase letters, numbers, and hyphens (minimum 3 characters)
            </p>
            {settings.slug && (
              <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${darkMode ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-blue-50 border border-blue-200'}`}>
                <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                <code className={`text-sm flex-1 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  {generatorUrl}
                </code>
                <button
                  onClick={copyUrl}
                  className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                  title="Copy URL"
                >
                  <Copy className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </button>
                {settings.is_enabled && (
                  <a
                    href={generatorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Template Settings */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
              Default NOR Template
            </label>
            {templates.length === 0 ? (
              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-yellow-900/20 border-yellow-700/50 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                <p className="text-sm">
                  You need to create at least one NOR template first. Go to Document Templates section to create one.
                </p>
              </div>
            ) : (
              <>
                <select
                  value={settings.default_template_id || ''}
                  onChange={(e) => setSettings({ ...settings, default_template_id: e.target.value || null })}
                  className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="">Select a template...</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.allow_template_selection}
                    onChange={(e) => setSettings({ ...settings, allow_template_selection: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Allow users to choose from multiple templates
                  </span>
                </label>
              </>
            )}
          </div>

          {/* Branding */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
                <Palette className="inline w-4 h-4 mr-1" />
                Primary Color
              </label>
              <input
                type="color"
                value={settings.branding_primary_color}
                onChange={(e) => setSettings({ ...settings, branding_primary_color: e.target.value })}
                className="w-full h-10 rounded-lg border border-slate-300 cursor-pointer"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
                <Image className="inline w-4 h-4 mr-1" />
                Logo URL (Optional)
              </label>
              <input
                type="url"
                value={settings.branding_logo_url}
                onChange={(e) => setSettings({ ...settings, branding_logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
                className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>

          {/* Welcome Message */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
              Welcome Message (Optional)
            </label>
            <textarea
              value={settings.welcome_message}
              onChange={(e) => setSettings({ ...settings, welcome_message: e.target.value })}
              placeholder="Welcome to our NOR Generator! Create professional race documents in minutes..."
              rows={3}
              className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          {/* Custom Domain (Future Feature) */}
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-50 border-slate-200'} opacity-50`}>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-700'}`}>
              Custom Domain (Coming Soon)
            </label>
            <input
              type="text"
              placeholder="nor.yourclub.com"
              disabled
              className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-500' : 'bg-white border-slate-300 text-slate-400'} cursor-not-allowed`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Custom domain support will be available in a future update
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !settings.slug || templates.length === 0}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
