import React, { useState, useEffect } from 'react';
import { Upload, Save, Loader2, Image, Type, Building2 } from 'lucide-react';
import type { EventHeaderConfig } from '../../types/eventWidgets';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface Props {
  websiteId: string;
  config: Record<string, any>;
  onSave: (config: EventHeaderConfig) => void;
  saving: boolean;
  darkMode?: boolean;
}

export const EventHeaderEditor: React.FC<Props> = ({ websiteId, config, onSave, saving, darkMode = false }) => {
  const [headerConfig, setHeaderConfig] = useState<EventHeaderConfig>({
    logo_type: config.logo_type || 'text',
    logo_url: config.logo_url || '',
    header_text: config.header_text || '',
    logo_position: config.logo_position || 'center',
    show_event_name: config.show_event_name !== false,
    background_color: config.background_color || '#ffffff',
    text_color: config.text_color || '#000000',
    height: config.height || 100,
    logo_size: config.logo_size || 48,
    text_size: config.text_size || 32
  });
  const [uploading, setUploading] = useState(false);
  const [clubLogo, setClubLogo] = useState<string | null>(null);
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadClubLogo();
  }, [websiteId]);

  const loadClubLogo = async () => {
    try {
      console.log('Loading club logo for website:', websiteId);

      const { data: website, error: websiteError } = await supabase
        .from('event_websites')
        .select('event_id')
        .eq('id', websiteId)
        .single();

      if (websiteError) {
        console.error('Error loading event website:', websiteError);
        return;
      }

      console.log('Event website data:', website);

      if (website?.event_id) {
        const { data: event, error: eventError } = await supabase
          .from('public_events')
          .select('club_id')
          .eq('id', website.event_id)
          .single();

        if (eventError) {
          console.error('Error loading event:', eventError);
          return;
        }

        console.log('Event data:', event);

        if (event?.club_id) {
          const { data: club, error: clubError } = await supabase
            .from('clubs')
            .select('logo_url')
            .eq('id', event.club_id)
            .single();

          if (clubError) {
            console.error('Error loading club:', clubError);
            return;
          }

          console.log('Club data:', club);

          if (club?.logo_url) {
            setClubLogo(club.logo_url);
            console.log('Club logo set:', club.logo_url);
          } else {
            console.log('No club logo found');
          }
        }
      }
    } catch (error) {
      console.error('Error loading club logo:', error);
    }
  };

  const handleChange = (field: keyof EventHeaderConfig, value: any) => {
    setHeaderConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${websiteId}/header-logo-${Date.now()}.${fileExt}`;
      const filePath = `event-media/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      handleChange('logo_url', publicUrl);
      addNotification('Logo uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading logo:', error);
      addNotification(`Failed to upload logo: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    onSave(headerConfig);
  };

  const renderLogoPreview = () => {
    if (headerConfig.logo_type === 'upload' && headerConfig.logo_url) {
      return (
        <img
          src={headerConfig.logo_url}
          alt="Event Logo"
          style={{ height: `${headerConfig.logo_size}px` }}
          className="object-contain"
        />
      );
    } else if (headerConfig.logo_type === 'club' && clubLogo) {
      return (
        <img
          src={clubLogo}
          alt="Club Logo"
          style={{ height: `${headerConfig.logo_size}px` }}
          className="object-contain"
        />
      );
    } else if (headerConfig.logo_type === 'text' && headerConfig.header_text) {
      return (
        <span
          className="font-bold"
          style={{ fontSize: `${headerConfig.text_size}px` }}
        >
          {headerConfig.header_text}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Logo Type Selection */}
      <div>
        <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Event Logo
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => handleChange('logo_type', 'upload')}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
              headerConfig.logo_type === 'upload'
                ? 'border-cyan-500 bg-cyan-500/10'
                : darkMode
                ? 'border-slate-600 bg-slate-700 hover:border-slate-500'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <Image size={24} className={headerConfig.logo_type === 'upload' ? 'text-cyan-400' : 'text-slate-400'} />
            <span className={`text-sm font-medium ${
              headerConfig.logo_type === 'upload'
                ? 'text-cyan-600'
                : darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Upload Logo
            </span>
          </button>

          <button
            onClick={() => {
              handleChange('logo_type', 'club');
              if (clubLogo) handleChange('logo_url', clubLogo);
            }}
            disabled={!clubLogo}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
              headerConfig.logo_type === 'club'
                ? 'border-cyan-500 bg-cyan-500/10'
                : darkMode
                ? 'border-slate-600 bg-slate-700 hover:border-slate-500'
                : 'border-slate-300 bg-white hover:border-slate-400'
            } ${!clubLogo ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Building2 size={24} className={headerConfig.logo_type === 'club' ? 'text-cyan-400' : 'text-slate-400'} />
            <span className={`text-sm font-medium ${
              headerConfig.logo_type === 'club'
                ? 'text-cyan-600'
                : darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Club Logo
            </span>
          </button>

          <button
            onClick={() => handleChange('logo_type', 'text')}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
              headerConfig.logo_type === 'text'
                ? 'border-cyan-500 bg-cyan-500/10'
                : darkMode
                ? 'border-slate-600 bg-slate-700 hover:border-slate-500'
                : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <Type size={24} className={headerConfig.logo_type === 'text' ? 'text-cyan-400' : 'text-slate-400'} />
            <span className={`text-sm font-medium ${
              headerConfig.logo_type === 'text'
                ? 'text-cyan-600'
                : darkMode ? 'text-slate-300' : 'text-slate-700'
            }`}>
              Text Only
            </span>
          </button>
        </div>
      </div>

      {/* Upload Logo Section */}
      {headerConfig.logo_type === 'upload' && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Upload Image
          </label>
          <div className="flex items-center gap-4">
            {headerConfig.logo_url && (
              <div className="w-24 h-24 rounded-lg border-2 border-dashed overflow-hidden flex items-center justify-center bg-white">
                <img
                  src={headerConfig.logo_url}
                  alt="Logo"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                }}
                className="hidden"
                id="logo-upload"
                disabled={uploading}
              />
              <label
                htmlFor="logo-upload"
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  uploading ? 'opacity-50 cursor-not-allowed' : ''
                } ${
                  darkMode
                    ? 'border-slate-600 hover:border-cyan-500 bg-slate-700 text-slate-300'
                    : 'border-slate-300 hover:border-cyan-500 bg-white text-slate-600'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    <span>Click to upload logo</span>
                  </>
                )}
              </label>
              <p className={`mt-2 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Recommended size: 200x80px or similar aspect ratio. PNG or JPG format.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Club Logo Preview */}
      {headerConfig.logo_type === 'club' && clubLogo && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Club Logo Preview
          </label>
          <div className="w-24 h-24 rounded-lg border-2 overflow-hidden flex items-center justify-center bg-white">
            <img
              src={clubLogo}
              alt="Club Logo"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Text Input Section */}
      {headerConfig.logo_type === 'text' && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Header Text
          </label>
          <input
            type="text"
            value={headerConfig.header_text || ''}
            onChange={(e) => handleChange('header_text', e.target.value)}
            placeholder="Enter event title or header text"
            className={`w-full px-4 py-3 rounded-lg border ${
              darkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
          />
          <p className={`mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            This text will be displayed prominently in the header
          </p>
        </div>
      )}

      {/* Size Control */}
      {(headerConfig.logo_type === 'upload' || headerConfig.logo_type === 'club') && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Logo Size: {headerConfig.logo_size}px
          </label>
          <input
            type="range"
            min="24"
            max="120"
            value={headerConfig.logo_size}
            onChange={(e) => handleChange('logo_size', parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>24px</span>
            <span>120px</span>
          </div>
        </div>
      )}

      {headerConfig.logo_type === 'text' && (
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Text Size: {headerConfig.text_size}px
          </label>
          <input
            type="range"
            min="16"
            max="72"
            value={headerConfig.text_size}
            onChange={(e) => handleChange('text_size', parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>16px</span>
            <span>72px</span>
          </div>
        </div>
      )}

      {/* Logo Position */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Logo Position
        </label>
        <div className="flex gap-3">
          {['left', 'center'].map((position) => (
            <button
              key={position}
              onClick={() => handleChange('logo_position', position)}
              className={`flex-1 px-4 py-2 rounded-lg border-2 font-medium transition-colors ${
                headerConfig.logo_position === position
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                  : darkMode
                  ? 'border-slate-600 bg-slate-700 text-slate-300 hover:border-slate-500'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
              }`}
            >
              {position.charAt(0).toUpperCase() + position.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Show Event Name */}
      <div className="flex items-center justify-between">
        <div>
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Show Event Name
          </label>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Display event name next to logo/text
          </p>
        </div>
        <button
          onClick={() => handleChange('show_event_name', !headerConfig.show_event_name)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            headerConfig.show_event_name ? 'bg-cyan-600' : darkMode ? 'bg-slate-700' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              headerConfig.show_event_name ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Background Color
          </label>
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={headerConfig.background_color}
                onChange={(e) => handleChange('background_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <input
              type="text"
              value={headerConfig.background_color}
              onChange={(e) => handleChange('background_color', e.target.value)}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
            />
          </div>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Text Color
          </label>
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={headerConfig.text_color}
                onChange={(e) => handleChange('text_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <input
              type="text"
              value={headerConfig.text_color}
              onChange={(e) => handleChange('text_color', e.target.value)}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
            />
          </div>
        </div>
      </div>

      {/* Height */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Header Height: {headerConfig.height}px
        </label>
        <input
          type="range"
          min="60"
          max="150"
          value={headerConfig.height}
          onChange={(e) => handleChange('height', parseInt(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>60px</span>
          <span>150px</span>
        </div>
      </div>

      {/* Max Width */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Content Max Width: {headerConfig.max_width ? `${headerConfig.max_width}px` : 'Full Width'}
        </label>
        <input
          type="range"
          min="0"
          max="1920"
          step="80"
          value={headerConfig.max_width || 0}
          onChange={(e) => handleChange('max_width', parseInt(e.target.value) || undefined)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Full Width</span>
          <span>1920px</span>
        </div>
        <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Set to 0 for full width, or constrain content to a maximum width
        </p>
      </div>

      {/* Preview */}
      <div>
        <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Preview
        </label>
        <div
          className="rounded-lg overflow-hidden border"
          style={{
            backgroundColor: headerConfig.background_color,
            color: headerConfig.text_color,
            height: `${headerConfig.height}px`
          }}
        >
          <div
            className={`h-full flex items-center px-8 mx-auto ${
              headerConfig.logo_position === 'center' ? 'justify-center' : 'justify-start'
            }`}
            style={{
              maxWidth: headerConfig.max_width ? `${headerConfig.max_width}px` : 'none'
            }}
          >
            {renderLogoPreview()}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSubmit}
          disabled={saving || uploading}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl hover:shadow-lg hover:shadow-green-500/20 transition-all hover:scale-[1.02] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save size={18} />
              <span>Save Header</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
