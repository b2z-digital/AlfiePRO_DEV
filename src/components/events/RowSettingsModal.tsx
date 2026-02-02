import React, { useState } from 'react';
import { Save, Monitor, Tablet, Smartphone, Upload, Trash2, Image as ImageIcon, Video, Loader2 } from 'lucide-react';
import type { EventPageRow, DeviceType } from '../../types/eventWidgets';
import { supabase } from '../../utils/supabase';
import imageCompression from 'browser-image-compression';
import { DraggableModal } from './DraggableModal';

interface Props {
  row: EventPageRow;
  onSave: (updatedRow: EventPageRow) => void;
  onClose: () => void;
  darkMode?: boolean;
  websiteId: string;
}

const extractYouTubeId = (url: string): string => {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : '';
};

export const RowSettingsModal: React.FC<Props> = ({ row, onSave, onClose, darkMode = false, websiteId }) => {
  const [activeDevice, setActiveDevice] = useState<DeviceType>('desktop');
  const [isUploading, setIsUploading] = useState(false);
  const [settings, setSettings] = useState({
    backgroundColor: row.background?.type === 'color' ? row.background.value : '#1e293b',
    mediaType: row.background?.mediaType ?? 'none' as 'none' | 'image' | 'video',
    imageUrl: row.background?.type === 'image' ? row.background.value : '',
    videoUrl: row.background?.videoUrl ?? '',
    imagePosition: row.background?.imagePosition ?? 'center center',
    kenBurnsEffect: row.background?.kenBurnsEffect ?? false,
    overlayType: row.background?.overlayType ?? 'none' as 'none' | 'solid' | 'gradient',
    overlayColor: row.background?.overlayColor ?? '#000000',
    overlayGradientStart: row.background?.overlayGradientStart ?? '#000000',
    overlayGradientEnd: row.background?.overlayGradientEnd ?? '#ffffff',
    overlayGradientDirection: row.background?.overlayGradientDirection ?? 'to-bottom',
    overlayOpacity: row.background?.overlayOpacity ?? 30,
    marginTop: row.margin?.top ?? 0,
    marginBottom: row.margin?.bottom ?? 0,
    marginLeft: row.margin?.left ?? 0,
    marginRight: row.margin?.right ?? 0,
    paddingTop: row.padding?.top ?? 16,
    paddingBottom: row.padding?.bottom ?? 16,
    paddingLeft: row.padding?.left ?? 16,
    paddingRight: row.padding?.right ?? 16,
    fullWidth: row.fullWidth ?? false,
    stackOnMobile: row.stackOnMobile ?? true,
    stackOnTablet: row.stackOnTablet ?? false,
    responsivePadding: {
      desktop: row.responsivePadding?.desktop ?? { top: 16, bottom: 16, left: 16, right: 16 },
      tablet: row.responsivePadding?.tablet ?? { top: 12, bottom: 12, left: 12, right: 12 },
      mobile: row.responsivePadding?.mobile ?? { top: 8, bottom: 8, left: 8, right: 8 }
    },
    responsiveMargin: {
      desktop: row.responsiveMargin?.desktop ?? { top: 0, bottom: 0, left: 0, right: 0 },
      tablet: row.responsiveMargin?.tablet ?? { top: 0, bottom: 0, left: 0, right: 0 },
      mobile: row.responsiveMargin?.mobile ?? { top: 0, bottom: 0, left: 0, right: 0 }
    },
    responsiveMaxWidth: {
      desktop: row.responsiveMaxWidth?.desktop ?? '',
      tablet: row.responsiveMaxWidth?.tablet ?? '',
      mobile: row.responsiveMaxWidth?.mobile ?? ''
    },
    responsiveMinHeight: {
      desktop: row.responsiveMinHeight?.desktop ?? '',
      tablet: row.responsiveMinHeight?.tablet ?? '',
      mobile: row.responsiveMinHeight?.mobile ?? ''
    },
    responsiveMaxHeight: {
      desktop: row.responsiveMaxHeight?.desktop ?? '',
      tablet: row.responsiveMaxHeight?.tablet ?? '',
      mobile: row.responsiveMaxHeight?.mobile ?? ''
    },
    responsiveVerticalAlign: {
      desktop: row.responsiveVerticalAlign?.desktop ?? 'top',
      tablet: row.responsiveVerticalAlign?.tablet ?? 'top',
      mobile: row.responsiveVerticalAlign?.mobile ?? 'top'
    }
  });

  const handleSave = () => {
    // Determine background configuration based on media type
    let background;
    if (settings.mediaType === 'image' && settings.imageUrl) {
      background = {
        type: 'image' as const,
        value: settings.imageUrl,
        mediaType: 'image' as const,
        imagePosition: settings.imagePosition,
        kenBurnsEffect: settings.kenBurnsEffect,
        overlayType: settings.overlayType,
        overlayColor: settings.overlayColor,
        overlayGradientStart: settings.overlayGradientStart,
        overlayGradientEnd: settings.overlayGradientEnd,
        overlayGradientDirection: settings.overlayGradientDirection,
        overlayOpacity: settings.overlayOpacity
      };
    } else if (settings.mediaType === 'video' && settings.videoUrl) {
      background = {
        type: 'image' as const,
        value: '',
        mediaType: 'video' as const,
        videoUrl: settings.videoUrl,
        overlayType: settings.overlayType,
        overlayColor: settings.overlayColor,
        overlayGradientStart: settings.overlayGradientStart,
        overlayGradientEnd: settings.overlayGradientEnd,
        overlayGradientDirection: settings.overlayGradientDirection,
        overlayOpacity: settings.overlayOpacity
      };
    } else {
      background = {
        type: 'color' as const,
        value: settings.backgroundColor
      };
    }

    onSave({
      ...row,
      background,
      margin: {
        top: settings.marginTop,
        bottom: settings.marginBottom,
        left: settings.marginLeft,
        right: settings.marginRight
      },
      padding: {
        top: settings.paddingTop,
        bottom: settings.paddingBottom,
        left: settings.paddingLeft,
        right: settings.paddingRight
      },
      responsivePadding: settings.responsivePadding,
      responsiveMargin: settings.responsiveMargin,
      responsiveMaxWidth: settings.responsiveMaxWidth,
      responsiveMinHeight: settings.responsiveMinHeight,
      responsiveMaxHeight: settings.responsiveMaxHeight,
      responsiveVerticalAlign: settings.responsiveVerticalAlign,
      fullWidth: settings.fullWidth,
      stackOnMobile: settings.stackOnMobile,
      stackOnTablet: settings.stackOnTablet
    });
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      setIsUploading(true);

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name.split('.').pop();
      const fileName = `row-bg-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `event-backgrounds/${websiteId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setSettings({ ...settings, imageUrl: publicUrl, mediaType: 'image' });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResponsiveChange = (device: DeviceType, type: 'padding' | 'margin', side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    setSettings(prev => ({
      ...prev,
      [`responsive${type.charAt(0).toUpperCase() + type.slice(1)}`]: {
        ...prev[`responsive${type.charAt(0).toUpperCase() + type.slice(1)}` as 'responsivePadding' | 'responsiveMargin'],
        [device]: {
          ...prev[`responsive${type.charAt(0).toUpperCase() + type.slice(1)}` as 'responsivePadding' | 'responsiveMargin'][device],
          [side]: value
        }
      }
    }));
  };

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <DraggableModal
      isOpen={true}
      onClose={onClose}
      title="Row Settings"
      modalType="row_settings"
      darkMode={darkMode}
      maxWidth="500px"
    >
      <div className="space-y-6">
          {/* Layout */}
          <div>
            <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Layout
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.fullWidth}
                  onChange={(e) => handleChange('fullWidth', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Full Width (Edge-to-edge)
                </span>
              </label>
              {row.columns.length > 1 && (
                <>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.stackOnMobile}
                      onChange={(e) => handleChange('stackOnMobile', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Stack columns on mobile
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.stackOnTablet}
                      onChange={(e) => handleChange('stackOnTablet', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Stack columns on tablet
                    </span>
                  </label>
                </>
              )}
            </div>

            {/* Responsive Dimensions */}
            <div className="mt-6 space-y-3">
              <h4 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Responsive Dimensions
              </h4>

              {/* Device Tabs */}
              <div className={`flex items-center rounded-lg overflow-hidden border ${
                darkMode ? 'border-slate-700' : 'border-slate-300'
              }`}>
                <button
                  type="button"
                  onClick={() => setActiveDevice('desktop')}
                  className={`flex-1 px-3 py-1.5 transition-all flex items-center justify-center gap-1.5 ${
                    activeDevice === 'desktop'
                      ? 'bg-cyan-500 text-white'
                      : darkMode
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Monitor size={14} />
                  <span className="text-xs">Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDevice('tablet')}
                  className={`flex-1 px-3 py-1.5 transition-all border-x flex items-center justify-center gap-1.5 ${
                    darkMode ? 'border-slate-700' : 'border-slate-300'
                  } ${
                    activeDevice === 'tablet'
                      ? 'bg-cyan-500 text-white'
                      : darkMode
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Tablet size={14} />
                  <span className="text-xs">Tablet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDevice('mobile')}
                  className={`flex-1 px-3 py-1.5 transition-all flex items-center justify-center gap-1.5 ${
                    activeDevice === 'mobile'
                      ? 'bg-cyan-500 text-white'
                      : darkMode
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Smartphone size={14} />
                  <span className="text-xs">Mobile</span>
                </button>
              </div>

              {/* Max Width */}
              <div>
                <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Max Width
                </label>
                <input
                  type="text"
                  value={settings.responsiveMaxWidth[activeDevice]}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    responsiveMaxWidth: {
                      ...prev.responsiveMaxWidth,
                      [activeDevice]: e.target.value
                    }
                  }))}
                  placeholder="e.g., 1200px, 100%, 80vw"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                />
              </div>

              {/* Min Height */}
              <div>
                <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Min Height
                </label>
                <input
                  type="text"
                  value={settings.responsiveMinHeight[activeDevice]}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    responsiveMinHeight: {
                      ...prev.responsiveMinHeight,
                      [activeDevice]: e.target.value
                    }
                  }))}
                  placeholder="e.g., 400px, 50vh, 20rem"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                />
                <p className={`text-xs mt-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Required for column vertical alignment to work (e.g., 500px, 60vh)
                </p>
              </div>

              {/* Max Height */}
              <div>
                <label className={`block text-xs mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Max Height
                </label>
                <input
                  type="text"
                  value={settings.responsiveMaxHeight[activeDevice]}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    responsiveMaxHeight: {
                      ...prev.responsiveMaxHeight,
                      [activeDevice]: e.target.value
                    }
                  }))}
                  placeholder="e.g., 800px, 100vh, 40rem"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                />
              </div>
            </div>
          </div>

          {/* Background Media */}
          <div className="space-y-4">
            <h3 className={`text-sm font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Background
            </h3>

            {/* Media Type Selector */}
            <div>
              <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Background Type
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mediaType: 'none' })}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    settings.mediaType === 'none'
                      ? 'bg-cyan-600 text-white'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Color
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mediaType: 'image' })}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    settings.mediaType === 'image'
                      ? 'bg-cyan-600 text-white'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <ImageIcon size={16} />
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mediaType: 'video' })}
                  className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                    settings.mediaType === 'video'
                      ? 'bg-cyan-600 text-white'
                      : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  <Video size={16} />
                  Video
                </button>
              </div>
            </div>

            {/* Color Background */}
            {settings.mediaType === 'none' && (
              <div>
                <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Background Color
                </label>
                <div className="flex gap-3 items-center">
                  <div className="w-10 h-10 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                      className="w-full h-full cursor-pointer border-0"
                      style={{ padding: 0, margin: 0 }}
                    />
                  </div>
                  <input
                    type="text"
                    value={settings.backgroundColor}
                    onChange={(e) => setSettings({ ...settings, backgroundColor: e.target.value })}
                    className={`flex-1 px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent text-sm`}
                    placeholder="#1e293b"
                  />
                </div>
              </div>
            )}

            {/* Image Background */}
            {settings.mediaType === 'image' && (
              <div className="space-y-3">
                {settings.imageUrl ? (
                  <div className="space-y-3">
                    <div className="relative w-full h-32 bg-slate-700 rounded-lg overflow-hidden">
                      <img
                        src={settings.imageUrl}
                        alt="Background preview"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: settings.imagePosition }}
                      />
                      <button
                        onClick={() => setSettings({ ...settings, imageUrl: '' })}
                        className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Image Position */}
                    <div>
                      <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Image Position
                      </label>
                      <select
                        value={settings.imagePosition}
                        onChange={(e) => setSettings({ ...settings, imagePosition: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="center center">Center Center</option>
                        <option value="top center">Top Center</option>
                        <option value="top left">Top Left</option>
                        <option value="top right">Top Right</option>
                        <option value="center left">Center Left</option>
                        <option value="center right">Center Right</option>
                        <option value="bottom center">Bottom Center</option>
                        <option value="bottom left">Bottom Left</option>
                        <option value="bottom right">Bottom Right</option>
                      </select>
                    </div>

                    {/* Ken Burns Effect */}
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.kenBurnsEffect}
                          onChange={(e) => setSettings({ ...settings, kenBurnsEffect: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                        />
                        <div>
                          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Ken Burns Effect
                          </span>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            Slow zoom animation on background image
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className={`block w-full px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 hover:border-cyan-500'
                      : 'bg-slate-50 border-slate-300 hover:border-cyan-500'
                  }`}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center">
                      {isUploading ? (
                        <>
                          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-2" />
                          <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Uploading...</p>
                        </>
                      ) : (
                        <>
                          <Upload className={`w-8 h-8 mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                          <p className={`text-sm mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Click to upload background image
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            PNG, JPG up to 10MB
                          </p>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>
            )}

            {/* Video Background */}
            {settings.mediaType === 'video' && (
              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    YouTube Video URL
                  </label>
                  <input
                    type="text"
                    value={settings.videoUrl}
                    onChange={(e) => setSettings({ ...settings, videoUrl: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    Video will auto-play in the background
                  </p>
                </div>
                {settings.videoUrl && (
                  <div className="relative w-full h-32 bg-slate-700 rounded-lg overflow-hidden">
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYouTubeId(settings.videoUrl)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(settings.videoUrl)}`}
                      className="w-full h-full"
                      frameBorder="0"
                      allow="autoplay; encrypted-media"
                      title="Video preview"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Overlay Settings (only show for image/video) */}
            {(settings.mediaType === 'image' || settings.mediaType === 'video') && (
              <div className={`space-y-3 border rounded-lg p-3 ${
                darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-300 bg-slate-50'
              }`}>
                <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Color Overlay
                </h4>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Add a colored overlay on top of the background
                </p>

                <div>
                  <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Overlay Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, overlayType: 'none' })}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        settings.overlayType === 'none'
                          ? 'bg-cyan-600 text-white'
                          : darkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, overlayType: 'solid' })}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        settings.overlayType === 'solid'
                          ? 'bg-cyan-600 text-white'
                          : darkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, overlayType: 'gradient' })}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        settings.overlayType === 'gradient'
                          ? 'bg-cyan-600 text-white'
                          : darkMode
                          ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>

                {settings.overlayType === 'solid' && (
                  <div>
                    <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Overlay Color
                    </label>
                    <div className="flex gap-2 items-center">
                      <div className="w-10 h-10 rounded-full border-2 border-slate-600 overflow-hidden">
                        <input
                          type="color"
                          value={settings.overlayColor}
                          onChange={(e) => setSettings({ ...settings, overlayColor: e.target.value })}
                          className="w-full h-full cursor-pointer border-0"
                          style={{ padding: 0, margin: 0 }}
                        />
                      </div>
                      <input
                        type="text"
                        value={settings.overlayColor}
                        onChange={(e) => setSettings({ ...settings, overlayColor: e.target.value })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                )}

                {settings.overlayType === 'gradient' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Start Color
                        </label>
                        <div className="flex gap-2 items-center">
                          <div className="w-10 h-10 rounded-full border-2 border-slate-600 overflow-hidden">
                            <input
                              type="color"
                              value={settings.overlayGradientStart}
                              onChange={(e) => setSettings({ ...settings, overlayGradientStart: e.target.value })}
                              className="w-full h-full cursor-pointer border-0"
                              style={{ padding: 0, margin: 0 }}
                            />
                          </div>
                          <input
                            type="text"
                            value={settings.overlayGradientStart}
                            onChange={(e) => setSettings({ ...settings, overlayGradientStart: e.target.value })}
                            className={`flex-1 px-2 py-1.5 rounded-lg border text-xs ${
                              darkMode
                                ? 'bg-slate-700 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          End Color
                        </label>
                        <div className="flex gap-2 items-center">
                          <div className="w-10 h-10 rounded-full border-2 border-slate-600 overflow-hidden">
                            <input
                              type="color"
                              value={settings.overlayGradientEnd}
                              onChange={(e) => setSettings({ ...settings, overlayGradientEnd: e.target.value })}
                              className="w-full h-full cursor-pointer border-0"
                              style={{ padding: 0, margin: 0 }}
                            />
                          </div>
                          <input
                            type="text"
                            value={settings.overlayGradientEnd}
                            onChange={(e) => setSettings({ ...settings, overlayGradientEnd: e.target.value })}
                            className={`flex-1 px-2 py-1.5 rounded-lg border text-xs ${
                              darkMode
                                ? 'bg-slate-700 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Gradient Direction
                      </label>
                      <select
                        value={settings.overlayGradientDirection}
                        onChange={(e) => setSettings({ ...settings, overlayGradientDirection: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="to-bottom">Top to Bottom</option>
                        <option value="to-top">Bottom to Top</option>
                        <option value="to-right">Left to Right</option>
                        <option value="to-left">Right to Left</option>
                        <option value="to-bottom-right">Top-Left to Bottom-Right</option>
                        <option value="to-bottom-left">Top-Right to Bottom-Left</option>
                      </select>
                    </div>
                  </>
                )}

                {settings.overlayType !== 'none' && (
                  <div>
                    <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Overlay Opacity ({settings.overlayOpacity}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.overlayOpacity}
                      onChange={(e) => setSettings({ ...settings, overlayOpacity: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <div className={`flex justify-between text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <span>0% (Transparent)</span>
                      <span>100% (Opaque)</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Responsive Spacing */}
          <div>
            <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Responsive Spacing
            </h3>

            {/* Device Tabs */}
            <div className={`flex items-center rounded-lg overflow-hidden border mb-4 ${
              darkMode ? 'border-slate-700' : 'border-slate-300'
            }`}>
              <button
                onClick={() => setActiveDevice('desktop')}
                className={`flex-1 px-4 py-2 transition-all flex items-center justify-center gap-2 ${
                  activeDevice === 'desktop'
                    ? 'bg-cyan-500 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Monitor size={16} />
                <span className="text-sm">Desktop</span>
              </button>
              <button
                onClick={() => setActiveDevice('tablet')}
                className={`flex-1 px-4 py-2 transition-all border-x flex items-center justify-center gap-2 ${
                  darkMode ? 'border-slate-700' : 'border-slate-300'
                } ${
                  activeDevice === 'tablet'
                    ? 'bg-cyan-500 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Tablet size={16} />
                <span className="text-sm">Tablet</span>
              </button>
              <button
                onClick={() => setActiveDevice('mobile')}
                className={`flex-1 px-4 py-2 transition-all flex items-center justify-center gap-2 ${
                  activeDevice === 'mobile'
                    ? 'bg-cyan-500 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone size={16} />
                <span className="text-sm">Mobile</span>
              </button>
            </div>

            {/* Margin for Active Device */}
            <div className="mb-4">
              <h4 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Margin (px)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Top
                  </label>
                  <input
                    type="number"
                    value={settings.responsiveMargin[activeDevice].top}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'margin', 'top', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Bottom
                  </label>
                  <input
                    type="number"
                    value={settings.responsiveMargin[activeDevice].bottom}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'margin', 'bottom', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Left
                  </label>
                  <input
                    type="number"
                    value={settings.responsiveMargin[activeDevice].left}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'margin', 'left', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Right
                  </label>
                  <input
                    type="number"
                    value={settings.responsiveMargin[activeDevice].right}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'margin', 'right', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                  min="0"
                />
              </div>
            </div>
          </div>

            {/* Padding for Active Device */}
            <div>
              <h4 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Padding (px)
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Top
                  </label>
                  <input
                    type="number"
                    value={settings.responsivePadding[activeDevice].top}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'padding', 'top', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Bottom
                  </label>
                  <input
                    type="number"
                    value={settings.responsivePadding[activeDevice].bottom}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'padding', 'bottom', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Left
                  </label>
                  <input
                    type="number"
                    value={settings.responsivePadding[activeDevice].left}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'padding', 'left', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Right
                  </label>
                  <input
                    type="number"
                    value={settings.responsivePadding[activeDevice].right}
                    onChange={(e) => handleResponsiveChange(activeDevice, 'padding', 'right', parseInt(e.target.value) || 0)}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 pt-6 mt-6 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'text-slate-300 hover:bg-slate-700'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
          >
            <Save size={16} />
            Save Settings
          </button>
        </div>
      </div>
    </DraggableModal>
  );
};
