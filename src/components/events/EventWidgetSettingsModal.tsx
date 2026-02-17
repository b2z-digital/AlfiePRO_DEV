import React, { useState } from 'react';
import { Save, Upload, Link as LinkIcon, ExternalLink, Loader2, Plus, Trash2, GripVertical, X, Monitor, Tablet, Smartphone, CheckCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { EventWidgetConfig, EventWidgetSettingField, DeviceType, ResponsiveMargin, ResponsivePadding, ResponsiveSettings} from '../../types/eventWidgets';
import { getWidgetDefinition } from '../../constants/eventWidgetRegistry';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { WysiwygEditor } from '../ui/WysiwygEditor';
import { TextBlockTypographySettings } from './TextBlockTypographySettings';
import { DraggableModal } from './DraggableModal';
import { IconPickerModal } from './IconPickerModal';

interface Props {
  widget: EventWidgetConfig;
  websiteId: string;
  onSave: (updatedWidget: EventWidgetConfig) => void;
  onClose: () => void;
  darkMode?: boolean;
  initialViewport?: DeviceType;
}

export const EventWidgetSettingsModal: React.FC<Props> = ({ widget, websiteId, onSave, onClose, darkMode = false, initialViewport = 'desktop' }) => {
  const widgetDef = getWidgetDefinition(widget.type);
  const [settings, setSettings] = useState(() => ({
    ...(widgetDef?.defaultSettings || {}),
    ...(widget.settings || {})
  }));
  const [uploading, setUploading] = useState(false);
  const [availablePages, setAvailablePages] = useState<Array<{ slug: string; title: string }>>([]);
  const [groupedEvents, setGroupedEvents] = useState<Array<{ id: string; event_name: string; is_primary: boolean }>>([]);
  const [currentViewport, setCurrentViewport] = useState<DeviceType>(initialViewport);
  const [responsiveMargin, setResponsiveMargin] = useState<ResponsiveMargin>(widget.responsiveMargin || {});
  const [responsivePadding, setResponsivePadding] = useState<ResponsivePadding>(widget.responsivePadding || {});
  const [responsiveSettings, setResponsiveSettings] = useState<ResponsiveSettings>(widget.responsiveSettings || {});
  const [iconPickerOpen, setIconPickerOpen] = useState<number | null>(null);
  const { addNotification } = useNotifications();

  React.useEffect(() => {
    loadAvailablePages();
    loadGroupedEvents();
  }, [websiteId]);

  const loadAvailablePages = async () => {
    try {
      console.log('Loading pages for website:', websiteId);
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('page_slug, title')
        .eq('event_website_id', websiteId)
        .order('title');

      if (error) {
        console.error('Error loading pages:', error);
        return;
      }

      console.log('Loaded pages:', data);
      if (data) {
        const pages = data.map(page => ({
          slug: page.page_slug,
          title: page.title
        }));
        setAvailablePages(pages);
      }
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  };

  const loadGroupedEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('event_website_all_events')
        .select('all_events')
        .eq('event_website_id', websiteId)
        .maybeSingle();

      if (error) {
        console.error('Error loading grouped events:', error);
        return;
      }

      if (data?.all_events && Array.isArray(data.all_events)) {
        setGroupedEvents(data.all_events.sort((a: any, b: any) => a.display_order - b.display_order));
      }
    } catch (error) {
      console.error('Error loading grouped events:', error);
    }
  };

  if (!widgetDef) {
    return null;
  }

  const handleSave = () => {
    onSave({
      ...widget,
      settings,
      responsiveSettings,
      responsiveMargin,
      responsivePadding
    });
    onClose();
  };

  const handleChange = (key: string, value: any) => {
    // If on tablet or mobile, save to responsive settings
    if (currentViewport !== 'desktop') {
      setResponsiveSettings(prev => ({
        ...prev,
        [currentViewport]: {
          ...(prev[currentViewport] || {}),
          [key]: value
        }
      }));
    } else {
      // For desktop, save to base settings
      const newSettings = {
        ...settings,
        [key]: value
      };
      setSettings(newSettings);
    }
  };

  // Get current setting value based on viewport
  const getCurrentValue = (key: string, defaultValue?: any) => {
    if (currentViewport !== 'desktop' && responsiveSettings[currentViewport]?.[key] !== undefined) {
      return responsiveSettings[currentViewport]![key];
    }
    return settings[key] !== undefined ? settings[key] : defaultValue;
  };

  const handleImageUpload = async (key: string, file: File) => {
    if (!file) {
      console.error('No file provided');
      return;
    }

    console.log('Starting image upload...', { key, fileName: file.name, size: file.size, type: file.type });

    setUploading(true);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(file, 'photo');

      const fileExt = compressed.name.split('.').pop();
      const fileName = `${websiteId}/${widget.id}_${key}_${Date.now()}.${fileExt}`;
      const filePath = `event-media/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressed, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      console.log('Public URL:', publicUrl);

      handleChange(key, publicUrl);
      addNotification('Image uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading image:', error);
      addNotification(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const renderField = (field: EventWidgetSettingField) => {
    const value = getCurrentValue(field.key, field.defaultValue ?? '');
    const hasResponsiveValue = currentViewport !== 'desktop' && responsiveSettings[currentViewport]?.[field.key] !== undefined;

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            placeholder={field.label}
            required={field.required}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            rows={4}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            placeholder={field.label}
            required={field.required}
          />
        );

      case 'wysiwyg':
        return (
          <div className={`rounded-lg border ${
            darkMode ? 'border-slate-700' : 'border-slate-300'
          }`}>
            <WysiwygEditor
              value={value}
              onChange={(newValue) => handleChange(field.key, newValue)}
              darkMode={darkMode}
              height={300}
              placeholder={field.label}
            />
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(field.key, parseFloat(e.target.value) || 0)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            required={field.required}
          />
        );

      case 'color':
        return (
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={value}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className={`flex-1 px-4 py-2.5 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              placeholder="#000000"
            />
          </div>
        );

      case 'date':
        return (
          <input
            type="datetime-local"
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            required={field.required}
          />
        );

      case 'toggle':
        return (
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={!!value}
                onChange={(e) => handleChange(field.key, e.target.checked)}
                className="sr-only"
              />
              <div className={`w-12 h-7 rounded-full transition-colors ${
                value ? 'bg-cyan-600' : darkMode ? 'bg-slate-700' : 'bg-slate-300'
              }`}>
                <div className={`absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                  value ? 'transform translate-x-5' : ''
                }`} />
              </div>
            </div>
            <span className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {value ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            required={field.required}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'page-select':
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            required={field.required}
          >
            <option value="">Select a page...</option>
            {availablePages.map((page) => (
              <option key={page.slug} value={`/${page.slug}`}>
                {page.title}
              </option>
            ))}
          </select>
        );

      case 'event-select':
        if (groupedEvents.length <= 1) {
          return null; // Don't show event selector if there's only one event
        }
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className={`w-full px-4 py-2.5 rounded-lg border ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
            required={field.required}
          >
            <option value="">Select an event...</option>
            {groupedEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.event_name}{event.is_primary ? ' (Primary)' : ''}
              </option>
            ))}
          </select>
        );

      case 'event-multi-select':
        if (groupedEvents.length === 0) {
          return (
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              No events available
            </p>
          );
        }
        const selectedEventIds = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {groupedEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/50">
                <input
                  type="checkbox"
                  checked={selectedEventIds.includes(event.id)}
                  onChange={(e) => {
                    const newSelection = e.target.checked
                      ? [...selectedEventIds, event.id]
                      : selectedEventIds.filter((id: string) => id !== event.id);
                    handleChange(field.key, newSelection);
                  }}
                  className="rounded border-slate-600 text-cyan-600 focus:ring-cyan-500"
                />
                <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                  {event.event_name}{event.is_primary ? ' (Primary)' : ''}
                </span>
              </label>
            ))}
            {selectedEventIds.length === 0 && (
              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'} mt-1`}>
                Leave empty to show competitors from all events
              </p>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="space-y-3">
            <input
              id={`file-${field.key}`}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  console.log('File selected:', file);
                  handleImageUpload(field.key, file);
                  e.target.value = ''; // Reset input
                }
              }}
              className="hidden"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById(`file-${field.key}`) as HTMLInputElement;
                  input?.click();
                }}
                disabled={uploading}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed font-medium transition-all ${
                  uploading
                    ? 'opacity-50 cursor-not-allowed'
                    : darkMode
                    ? 'border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10'
                    : 'border-slate-300 hover:border-cyan-500 text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload size={18} />
                    <span>Upload Image</span>
                  </>
                )}
              </button>
            </div>

            {value && (
              <div className="relative group">
                <img
                  src={value}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  onClick={() => handleChange(field.key, '')}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              Upload an image or paste a URL below
            </p>

            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(field.key, e.target.value)}
              className={`w-full px-4 py-2.5 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              placeholder="Or enter image URL"
            />
          </div>
        );

      case 'url':
        return (
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={settings[`${field.key}_type`] || 'external'}
                onChange={(e) => handleChange(`${field.key}_type`, e.target.value)}
                className={`px-4 py-2.5 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              >
                <option value="external">External URL</option>
                <option value="internal">Internal Page</option>
              </select>

              <select
                value={settings[`${field.key}_target`] || '_self'}
                onChange={(e) => handleChange(`${field.key}_target`, e.target.value)}
                className={`px-4 py-2.5 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              >
                <option value="_self">Same Tab</option>
                <option value="_blank">New Tab</option>
              </select>
            </div>

            {settings[`${field.key}_type`] === 'internal' ? (
              <select
                value={value}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className={`w-full px-4 py-2.5 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              >
                <option value="">Select a page...</option>
                {availablePages.map((page) => (
                  <option key={page.slug} value={`/${page.slug}`}>
                    {page.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="url"
                value={value}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className={`w-full px-4 py-2.5 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
                placeholder="https://example.com"
                required={field.required}
              />
            )}
          </div>
        );

      case 'fields-manager':
        const fields = value as any[] || [];

        const addField = () => {
          const newField = {
            id: `field_${Date.now()}`,
            label: 'New Field',
            type: 'text',
            required: false,
            enabled: true
          };
          handleChange(field.key, [...fields, newField]);
        };

        const updateField = (index: number, updates: any) => {
          const updatedFields = [...fields];
          updatedFields[index] = { ...updatedFields[index], ...updates };
          handleChange(field.key, updatedFields);
        };

        const removeField = (index: number) => {
          handleChange(field.key, fields.filter((_, i) => i !== index));
        };

        return (
          <div className="space-y-3">
            {fields.map((formField: any, index: number) => (
              <div
                key={formField.id || index}
                className={`p-4 rounded-lg border ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 mt-2">
                    <GripVertical size={18} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Field Label
                        </label>
                        <input
                          type="text"
                          value={formField.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                          placeholder="Enter label"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Field Type
                        </label>
                        <select
                          value={formField.type}
                          onChange={(e) => updateField(index, { type: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        >
                          <option value="text">Text</option>
                          <option value="email">Email</option>
                          <option value="tel">Phone</option>
                          <option value="number">Number</option>
                          <option value="textarea">Textarea</option>
                          <option value="date">Date</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formField.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-2 focus:ring-cyan-500"
                        />
                        <span className={`text-sm font-medium ${
                          darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          Required Field
                        </span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formField.enabled}
                          onChange={(e) => updateField(index, { enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-2 focus:ring-cyan-500"
                        />
                        <span className={`text-sm font-medium ${
                          darkMode ? 'text-slate-300' : 'text-slate-700'
                        }`}>
                          Enabled
                        </span>
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(index)}
                    className={`flex-shrink-0 p-2 rounded-lg transition-colors ${
                      darkMode
                        ? 'hover:bg-red-900/30 text-red-400'
                        : 'hover:bg-red-50 text-red-600'
                    }`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addField}
              className={`w-full px-4 py-3 rounded-lg border-2 border-dashed font-medium transition-all flex items-center justify-center gap-2 ${
                darkMode
                  ? 'border-slate-700 hover:border-cyan-500 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                  : 'border-slate-300 hover:border-cyan-500 text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
              }`}
            >
              <Plus size={18} />
              Add Field
            </button>
          </div>
        );

      case 'button-list':
        const buttons = settings[field.key] || [];

        const addButton = () => {
          const newButton = {
            id: `button_${Date.now()}`,
            text: 'New Button',
            link_type: 'registration',
            url: '',
            bg_color: '#06b6d4',
            text_color: '#ffffff',
            event_id: groupedEvents[0]?.id || '',
            style: 'solid',
            border_radius: 8,
            hover_bg_color: '#0891b2',
            hover_text_color: '#ffffff',
            width: 'auto',
            size: 'md'
          };
          handleChange(field.key, [...buttons, newButton]);
        };

        const updateButton = (index: number, updates: any) => {
          const updatedButtons = [...buttons];
          updatedButtons[index] = { ...updatedButtons[index], ...updates };
          handleChange(field.key, updatedButtons);
        };

        const removeButton = (index: number) => {
          handleChange(field.key, buttons.filter((_, i) => i !== index));
        };

        const moveButton = (index: number, direction: 'up' | 'down') => {
          if ((direction === 'up' && index === 0) || (direction === 'down' && index === buttons.length - 1)) {
            return;
          }
          const newButtons = [...buttons];
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          [newButtons[index], newButtons[targetIndex]] = [newButtons[targetIndex], newButtons[index]];
          handleChange(field.key, newButtons);
        };

        return (
          <div className="space-y-4">
            {buttons.map((button: any, index: number) => (
              <div
                key={button.id || index}
                className={`p-4 rounded-lg border ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GripVertical size={18} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                      <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Button {index + 1}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveButton(index, 'up')}
                        disabled={index === 0}
                        className={`p-1 rounded ${
                          index === 0
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveButton(index, 'down')}
                        disabled={index === buttons.length - 1}
                        className={`p-1 rounded ${
                          index === buttons.length - 1
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeButton(index)}
                        className={`p-1 rounded ${
                          darkMode
                            ? 'hover:bg-red-900/30 text-red-400'
                            : 'hover:bg-red-50 text-red-600'
                        }`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Button Text
                    </label>
                    <input
                      type="text"
                      value={button.text}
                      onChange={(e) => updateButton(index, { text: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      placeholder="Enter button text"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Link Type
                      </label>
                      <select
                        value={button.link_type}
                        onChange={(e) => updateButton(index, { link_type: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="registration">Event Registration</option>
                        <option value="custom">Custom URL</option>
                      </select>
                    </div>

                    {button.link_type === 'registration' ? (
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Select Event
                        </label>
                        <select
                          value={button.event_id}
                          onChange={(e) => updateButton(index, { event_id: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        >
                          {groupedEvents.length === 0 && (
                            <option value="">No events found</option>
                          )}
                          {groupedEvents.map((event: any) => (
                            <option key={event.id} value={event.id}>
                              {event.event_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Custom URL
                        </label>
                        <input
                          type="text"
                          value={button.url || ''}
                          onChange={(e) => updateButton(index, { url: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                          placeholder="https://..."
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Style
                      </label>
                      <select
                        value={button.style || 'solid'}
                        onChange={(e) => updateButton(index, { style: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="solid">Solid</option>
                        <option value="outline">Outline</option>
                        <option value="ghost">Ghost</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Size
                      </label>
                      <select
                        value={button.size || 'md'}
                        onChange={(e) => updateButton(index, { size: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Width
                      </label>
                      <select
                        value={button.width || 'auto'}
                        onChange={(e) => updateButton(index, { width: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="auto">Auto</option>
                        <option value="fit">Fit Content</option>
                        <option value="full">Full Width</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Background Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={button.bg_color}
                          onChange={(e) => updateButton(index, { bg_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={button.bg_color}
                          onChange={(e) => updateButton(index, { bg_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Text Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={button.text_color}
                          onChange={(e) => updateButton(index, { text_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={button.text_color}
                          onChange={(e) => updateButton(index, { text_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Hover Background
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={button.hover_bg_color || button.bg_color}
                          onChange={(e) => updateButton(index, { hover_bg_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={button.hover_bg_color || button.bg_color}
                          onChange={(e) => updateButton(index, { hover_bg_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Hover Text Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={button.hover_text_color || button.text_color}
                          onChange={(e) => updateButton(index, { hover_text_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={button.hover_text_color || button.text_color}
                          onChange={(e) => updateButton(index, { hover_text_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Corner Radius (px)
                    </label>
                    <input
                      type="number"
                      value={button.border_radius || 8}
                      onChange={(e) => updateButton(index, { border_radius: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="50"
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addButton}
              className={`w-full px-4 py-3 rounded-lg border-2 border-dashed font-medium transition-all flex items-center justify-center gap-2 ${
                darkMode
                  ? 'border-slate-700 hover:border-cyan-500 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                  : 'border-slate-300 hover:border-cyan-500 text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
              }`}
            >
              <Plus size={18} />
              Add Button
            </button>
          </div>
        );

      case 'tile-list':
        const tiles = settings[field.key] || [];

        const addTile = () => {
          const newTile = {
            id: `tile_${Date.now()}`,
            title: 'New Tile',
            subtitle: '',
            mode: 'icon',
            icon: 'Link',
            icon_size: 48,
            icon_color: '#ffffff',
            layout: 'top',
            image_url: '',
            link_type: 'external',
            link_page: '',
            link_url: '',
            event_id: '',
            file_url: '',
            file_name: '',
            bg_color: '#06b6d4',
            text_color: '#ffffff',
            hover_bg_color: ''
          };
          handleChange(field.key, [...tiles, newTile]);
        };

        const updateTile = (index: number, updates: any) => {
          const updatedTiles = [...tiles];
          updatedTiles[index] = { ...updatedTiles[index], ...updates };
          handleChange(field.key, updatedTiles);
        };

        const removeTile = (index: number) => {
          handleChange(field.key, tiles.filter((_, i) => i !== index));
        };

        const moveTile = (index: number, direction: 'up' | 'down') => {
          if ((direction === 'up' && index === 0) || (direction === 'down' && index === tiles.length - 1)) {
            return;
          }
          const newTiles = [...tiles];
          const targetIndex = direction === 'up' ? index - 1 : index + 1;
          [newTiles[index], newTiles[targetIndex]] = [newTiles[targetIndex], newTiles[index]];
          handleChange(field.key, newTiles);
        };

        return (
          <div className="space-y-4">
            {tiles.map((tile: any, index: number) => (
              <div
                key={tile.id || index}
                className={`p-4 rounded-lg border ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <GripVertical size={18} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                      <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Tile {index + 1}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveTile(index, 'up')}
                        disabled={index === 0}
                        className={`p-1 rounded ${
                          index === 0
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTile(index, 'down')}
                        disabled={index === tiles.length - 1}
                        className={`p-1 rounded ${
                          index === tiles.length - 1
                            ? 'opacity-30 cursor-not-allowed'
                            : darkMode
                            ? 'hover:bg-slate-700 text-slate-400'
                            : 'hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTile(index)}
                        className={`p-1 rounded ${
                          darkMode
                            ? 'hover:bg-red-900/30 text-red-400'
                            : 'hover:bg-red-50 text-red-600'
                        }`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Tile Title
                    </label>
                    <input
                      type="text"
                      value={tile.title}
                      onChange={(e) => updateTile(index, { title: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      placeholder="Enter tile title"
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Sub Title
                    </label>
                    <input
                      type="text"
                      value={tile.subtitle || ''}
                      onChange={(e) => updateTile(index, { subtitle: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      placeholder="Enter optional subtitle"
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Display Mode
                    </label>
                    <select
                      value={tile.mode}
                      onChange={(e) => updateTile(index, { mode: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    >
                      <option value="icon">Icon</option>
                      <option value="image">Image</option>
                    </select>
                  </div>

                  {tile.mode === 'icon' ? (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Icon
                      </label>
                      <button
                        type="button"
                        onClick={() => setIconPickerOpen(index)}
                        className={`w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white hover:bg-slate-800'
                            : 'bg-white border-slate-300 text-slate-900 hover:bg-slate-50'
                        } transition-colors`}
                      >
                        <div className="flex items-center gap-2">
                          {(() => {
                            const IconComponent = (Icons as any)[tile.icon || 'Link'];
                            return IconComponent ? <IconComponent size={18} /> : null;
                          })()}
                          <span>{tile.icon || 'Link'}</span>
                        </div>
                        <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                          Click to change
                        </span>
                      </button>

                      <IconPickerModal
                        isOpen={iconPickerOpen === index}
                        onClose={() => setIconPickerOpen(null)}
                        onSelect={(iconName) => updateTile(index, { icon: iconName })}
                        currentIcon={tile.icon || 'Link'}
                        darkMode={darkMode}
                      />
                    </div>
                  ) : null}

                  {tile.mode === 'icon' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${
                            darkMode ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            Icon Size
                          </label>
                          <input
                            type="number"
                            value={tile.icon_size || 48}
                            onChange={(e) => updateTile(index, { icon_size: parseInt(e.target.value) || 48 })}
                            min="16"
                            max="128"
                            className={`w-full px-3 py-2 rounded-lg border text-sm ${
                              darkMode
                                ? 'bg-slate-900 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                          />
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${
                            darkMode ? 'text-slate-400' : 'text-slate-600'
                          }`}>
                            Icon Color
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={tile.icon_color || tile.text_color}
                              onChange={(e) => updateTile(index, { icon_color: e.target.value })}
                              className="w-12 h-9 rounded border-0 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={tile.icon_color || tile.text_color}
                              onChange={(e) => updateTile(index, { icon_color: e.target.value })}
                              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                                darkMode
                                  ? 'bg-slate-900 border-slate-600 text-white'
                                  : 'bg-white border-slate-300 text-slate-900'
                              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-xs font-medium mb-1 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          Layout
                        </label>
                        <select
                          value={tile.layout || 'top'}
                          onChange={(e) => updateTile(index, { layout: e.target.value })}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        >
                          <option value="top">Icon Above Title</option>
                          <option value="left">Icon Left of Title</option>
                          <option value="right">Icon Right of Title</option>
                        </select>
                      </div>
                    </>
                  )}

                  {tile.mode === 'image' && (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Image URL
                      </label>
                      <input
                        type="text"
                        value={tile.image_url || ''}
                        onChange={(e) => updateTile(index, { image_url: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>
                  )}

                  <div>
                    <label className={`block text-xs font-medium mb-1 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Link Type
                    </label>
                    <select
                      value={tile.link_type}
                      onChange={(e) => updateTile(index, { link_type: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-900 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    >
                      <option value="registration">Event Registration</option>
                      <option value="page">Page</option>
                      <option value="external">External URL</option>
                      <option value="file">File Upload</option>
                    </select>
                  </div>

                  {tile.link_type === 'registration' ? (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Select Event
                      </label>
                      <select
                        value={tile.event_id || ''}
                        onChange={(e) => updateTile(index, { event_id: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="">Select an event...</option>
                        {groupedEvents.map((event: any) => (
                          <option key={event.id} value={event.id}>
                            {event.event_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : tile.link_type === 'page' ? (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Select Page
                      </label>
                      <select
                        value={tile.link_page || ''}
                        onChange={(e) => updateTile(index, { link_page: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      >
                        <option value="">Select a page...</option>
                        {availablePages.map((page) => (
                          <option key={page.slug} value={`/${page.slug}`}>
                            {page.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : tile.link_type === 'file' ? (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Upload File (PDF, DOC, etc.)
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !websiteId) return;

                          try {
                            const fileExt = file.name.split('.').pop();
                            const fileName = `${Date.now()}_${file.name}`;
                            const filePath = `${websiteId}/${fileName}`;

                            const { supabase } = await import('../../utils/supabase');
                            const { data, error } = await supabase.storage
                              .from('event-documents')
                              .upload(filePath, file);

                            if (error) {
                              console.error('Error uploading file:', error);
                              alert('Failed to upload file. Please try again.');
                              return;
                            }

                            const { data: { publicUrl } } = supabase.storage
                              .from('event-documents')
                              .getPublicUrl(filePath);

                            updateTile(index, {
                              file_url: publicUrl,
                              file_name: file.name
                            });
                          } catch (err) {
                            console.error('Error uploading file:', err);
                            alert('Failed to upload file. Please try again.');
                          }
                        }}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                      />
                      {tile.file_name && (
                        <div className={`mt-2 text-xs flex items-center gap-2 ${
                          darkMode ? 'text-slate-400' : 'text-slate-600'
                        }`}>
                          <CheckCircle size={14} className="text-green-500" />
                          <span>Uploaded: {tile.file_name}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        URL
                      </label>
                      <input
                        type="text"
                        value={tile.link_url || ''}
                        onChange={(e) => updateTile(index, { link_url: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${
                          darkMode
                            ? 'bg-slate-900 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        placeholder="https://example.com"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Background Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tile.bg_color}
                          onChange={(e) => updateTile(index, { bg_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tile.bg_color}
                          onChange={(e) => updateTile(index, { bg_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium mb-1 ${
                        darkMode ? 'text-slate-400' : 'text-slate-600'
                      }`}>
                        Text Color
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={tile.text_color}
                          onChange={(e) => updateTile(index, { text_color: e.target.value })}
                          className="w-12 h-9 rounded border-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={tile.text_color}
                          onChange={(e) => updateTile(index, { text_color: e.target.value })}
                          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-slate-900 border-slate-600 text-white'
                              : 'bg-white border-slate-300 text-slate-900'
                          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addTile}
              className={`w-full px-4 py-3 rounded-lg border-2 border-dashed font-medium transition-all flex items-center justify-center gap-2 ${
                darkMode
                  ? 'border-slate-700 hover:border-cyan-500 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10'
                  : 'border-slate-300 hover:border-cyan-500 text-slate-600 hover:text-cyan-600 hover:bg-cyan-50'
              }`}
            >
              <Plus size={18} />
              Add Tile
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <DraggableModal
      isOpen={true}
      onClose={onClose}
      title={`${widgetDef.name} Settings`}
      modalType="widget_settings"
      darkMode={darkMode}
      maxWidth="600px"
    >
      <div className="space-y-6">
            {/* Device Selector */}
            <div className="flex items-center gap-2 p-1 rounded-lg bg-slate-800 border border-slate-700">
              <button
                onClick={() => setCurrentViewport('desktop')}
                className={`flex-1 px-4 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${
                  currentViewport === 'desktop'
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Monitor size={16} />
                <span className="text-sm font-medium">Desktop</span>
              </button>
              <button
                onClick={() => setCurrentViewport('tablet')}
                className={`flex-1 px-4 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${
                  currentViewport === 'tablet'
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Tablet size={16} />
                <span className="text-sm font-medium">Tablet</span>
              </button>
              <button
                onClick={() => setCurrentViewport('mobile')}
                className={`flex-1 px-4 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${
                  currentViewport === 'mobile'
                    ? 'bg-cyan-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                <Smartphone size={16} />
                <span className="text-sm font-medium">Mobile</span>
              </button>
            </div>

            {currentViewport !== 'desktop' && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 flex items-start gap-2">
                <Monitor size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-cyan-400">
                  Changes made in {currentViewport} view will only apply to {currentViewport} devices. Desktop settings are used as fallback.
                </p>
              </div>
            )}

            {widget.type === 'text-block' && (
              <TextBlockTypographySettings
                settings={settings}
                onChange={handleChange}
                darkMode={darkMode}
                getCurrentValue={getCurrentValue}
              />
            )}

            {widgetDef.settingsSchema.map((field) => {
              // Check if field should be shown based on showIf condition
              if (field.showIf) {
                // Check all conditions - all must be true
                const shouldShow = Object.keys(field.showIf).every(conditionKey => {
                  const conditionValue = field.showIf![conditionKey];
                  const currentValue = settings[conditionKey];
                  const matches = currentValue === conditionValue;

                  if (field.key === 'link_page') {
                    console.log(`Field: ${field.key}, Condition: ${conditionKey}=${conditionValue}, Current: ${currentValue}, Matches: ${matches}`);
                    console.log('Available pages:', availablePages);
                  }

                  return matches;
                });
                if (!shouldShow) {
                  return null;
                }
              }

              const hasResponsiveOverride = currentViewport !== 'desktop' && responsiveSettings[currentViewport]?.[field.key] !== undefined;

              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium mb-2 text-slate-300 flex items-center gap-2">
                    {field.label}
                    {field.required && <span className="text-red-400 ml-1">*</span>}
                    {hasResponsiveOverride && (
                      <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Monitor size={12} />
                        {currentViewport}
                      </span>
                    )}
                  </label>
                  {field.helperText && (
                    <p className="text-xs text-slate-400 mb-2">{field.helperText}</p>
                  )}
                  {renderField(field)}
                </div>
              );
            })}

        {/* Responsive Spacing */}
        <div className="mt-6 pt-6 border-t border-slate-700">
          <h3 className="text-sm font-semibold mb-3 text-slate-300">
            Responsive Spacing
          </h3>

          {/* Device Tabs */}
          <div className="flex items-center rounded-xl overflow-hidden border border-slate-700 mb-4">
            <button
              onClick={() => setCurrentViewport('desktop')}
              className={`flex-1 px-4 py-2.5 transition-all flex items-center justify-center gap-2 ${
                currentViewport === 'desktop'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Monitor size={18} />
              Desktop
            </button>
            <button
              onClick={() => setCurrentViewport('tablet')}
              className={`flex-1 px-4 py-2.5 transition-all flex items-center justify-center gap-2 ${
                currentViewport === 'tablet'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Tablet size={18} />
              Tablet
            </button>
            <button
              onClick={() => setCurrentViewport('mobile')}
              className={`flex-1 px-4 py-2.5 transition-all flex items-center justify-center gap-2 ${
                currentViewport === 'mobile'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Smartphone size={18} />
              Mobile
            </button>
          </div>

          {/* Margin */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-3 text-slate-300">
              Margin (px)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Top</label>
                <input
                  type="number"
                  value={responsiveMargin[currentViewport]?.top || 0}
                  onChange={(e) => setResponsiveMargin({
                    ...responsiveMargin,
                    [currentViewport]: {
                      ...responsiveMargin[currentViewport],
                      top: parseInt(e.target.value) || 0,
                      bottom: responsiveMargin[currentViewport]?.bottom || 0,
                      left: responsiveMargin[currentViewport]?.left || 0,
                      right: responsiveMargin[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bottom</label>
                <input
                  type="number"
                  value={responsiveMargin[currentViewport]?.bottom || 0}
                  onChange={(e) => setResponsiveMargin({
                    ...responsiveMargin,
                    [currentViewport]: {
                      ...responsiveMargin[currentViewport],
                      top: responsiveMargin[currentViewport]?.top || 0,
                      bottom: parseInt(e.target.value) || 0,
                      left: responsiveMargin[currentViewport]?.left || 0,
                      right: responsiveMargin[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Left</label>
                <input
                  type="number"
                  value={responsiveMargin[currentViewport]?.left || 0}
                  onChange={(e) => setResponsiveMargin({
                    ...responsiveMargin,
                    [currentViewport]: {
                      ...responsiveMargin[currentViewport],
                      top: responsiveMargin[currentViewport]?.top || 0,
                      bottom: responsiveMargin[currentViewport]?.bottom || 0,
                      left: parseInt(e.target.value) || 0,
                      right: responsiveMargin[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Right</label>
                <input
                  type="number"
                  value={responsiveMargin[currentViewport]?.right || 0}
                  onChange={(e) => setResponsiveMargin({
                    ...responsiveMargin,
                    [currentViewport]: {
                      ...responsiveMargin[currentViewport],
                      top: responsiveMargin[currentViewport]?.top || 0,
                      bottom: responsiveMargin[currentViewport]?.bottom || 0,
                      left: responsiveMargin[currentViewport]?.left || 0,
                      right: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
            </div>
          </div>

          {/* Padding */}
          <div>
            <label className="block text-sm font-medium mb-3 text-slate-300">
              Padding (px)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Top</label>
                <input
                  type="number"
                  value={responsivePadding[currentViewport]?.top || 0}
                  onChange={(e) => setResponsivePadding({
                    ...responsivePadding,
                    [currentViewport]: {
                      ...responsivePadding[currentViewport],
                      top: parseInt(e.target.value) || 0,
                      bottom: responsivePadding[currentViewport]?.bottom || 0,
                      left: responsivePadding[currentViewport]?.left || 0,
                      right: responsivePadding[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bottom</label>
                <input
                  type="number"
                  value={responsivePadding[currentViewport]?.bottom || 0}
                  onChange={(e) => setResponsivePadding({
                    ...responsivePadding,
                    [currentViewport]: {
                      ...responsivePadding[currentViewport],
                      top: responsivePadding[currentViewport]?.top || 0,
                      bottom: parseInt(e.target.value) || 0,
                      left: responsivePadding[currentViewport]?.left || 0,
                      right: responsivePadding[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Left</label>
                <input
                  type="number"
                  value={responsivePadding[currentViewport]?.left || 0}
                  onChange={(e) => setResponsivePadding({
                    ...responsivePadding,
                    [currentViewport]: {
                      ...responsivePadding[currentViewport],
                      top: responsivePadding[currentViewport]?.top || 0,
                      bottom: responsivePadding[currentViewport]?.bottom || 0,
                      left: parseInt(e.target.value) || 0,
                      right: responsivePadding[currentViewport]?.right || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Right</label>
                <input
                  type="number"
                  value={responsivePadding[currentViewport]?.right || 0}
                  onChange={(e) => setResponsivePadding({
                    ...responsivePadding,
                    [currentViewport]: {
                      ...responsivePadding[currentViewport],
                      top: responsivePadding[currentViewport]?.top || 0,
                      bottom: responsivePadding[currentViewport]?.bottom || 0,
                      left: responsivePadding[currentViewport]?.left || 0,
                      right: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
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
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 rounded-lg font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/30 transition-all flex items-center gap-2 hover:scale-[1.02]"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>
    </DraggableModal>
  );
};
