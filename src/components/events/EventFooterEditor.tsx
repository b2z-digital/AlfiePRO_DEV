import React, { useState } from 'react';
import { Plus, Trash2, Save, Loader2, Facebook, Instagram, Twitter, Youtube } from 'lucide-react';
import type { EventFooterConfig, EventFooterColumn } from '../../types/eventWidgets';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  websiteId: string;
  config: Record<string, any>;
  onSave: (config: EventFooterConfig) => void;
  saving: boolean;
  darkMode?: boolean;
}

export const EventFooterEditor: React.FC<Props> = ({ config, onSave, saving, darkMode = false }) => {
  const [footerConfig, setFooterConfig] = useState<EventFooterConfig>({
    columns: config.columns || [],
    background_color: config.background_color || '#1e293b',
    text_color: config.text_color || '#94a3b8',
    show_social_links: config.show_social_links !== false,
    social_links: config.social_links || {},
    copyright_text: config.copyright_text || `© ${new Date().getFullYear()} All rights reserved.`
  });

  const handleChange = (field: keyof EventFooterConfig, value: any) => {
    setFooterConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSocialLinkChange = (platform: string, url: string) => {
    setFooterConfig(prev => ({
      ...prev,
      social_links: {
        ...prev.social_links,
        [platform]: url
      }
    }));
  };

  const handleAddColumn = () => {
    const newColumn: EventFooterColumn = {
      id: uuidv4(),
      title: 'New Column',
      items: [],
      order: footerConfig.columns.length
    };

    setFooterConfig(prev => ({
      ...prev,
      columns: [...prev.columns, newColumn]
    }));
  };

  const handleUpdateColumn = (index: number, field: keyof EventFooterColumn, value: any) => {
    setFooterConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) => i === index ? { ...col, [field]: value } : col)
    }));
  };

  const handleDeleteColumn = (index: number) => {
    setFooterConfig(prev => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index)
    }));
  };

  const handleAddItemToColumn = (columnIndex: number) => {
    setFooterConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) =>
        i === columnIndex
          ? {
              ...col,
              items: [
                ...col.items,
                { id: uuidv4(), label: 'New Link', url: '', type: 'link' }
              ]
            }
          : col
      )
    }));
  };

  const handleUpdateColumnItem = (columnIndex: number, itemIndex: number, field: string, value: any) => {
    setFooterConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) =>
        i === columnIndex
          ? {
              ...col,
              items: col.items.map((item, j) =>
                j === itemIndex ? { ...item, [field]: value } : item
              )
            }
          : col
      )
    }));
  };

  const handleDeleteColumnItem = (columnIndex: number, itemIndex: number) => {
    setFooterConfig(prev => ({
      ...prev,
      columns: prev.columns.map((col, i) =>
        i === columnIndex
          ? { ...col, items: col.items.filter((_, j) => j !== itemIndex) }
          : col
      )
    }));
  };

  const handleSubmit = () => {
    onSave(footerConfig);
  };

  return (
    <div className="space-y-6">
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
                value={footerConfig.background_color}
                onChange={(e) => handleChange('background_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <input
              type="text"
              value={footerConfig.background_color}
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
                value={footerConfig.text_color}
                onChange={(e) => handleChange('text_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
              />
            </div>
            <input
              type="text"
              value={footerConfig.text_color}
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

      {/* Social Links Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Show Social Links
          </label>
          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Display social media icons in footer
          </p>
        </div>
        <button
          onClick={() => handleChange('show_social_links', !footerConfig.show_social_links)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            footerConfig.show_social_links ? 'bg-cyan-600' : darkMode ? 'bg-slate-700' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              footerConfig.show_social_links ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Social Links */}
      {footerConfig.show_social_links && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'facebook', label: 'Facebook', icon: Facebook },
            { key: 'instagram', label: 'Instagram', icon: Instagram },
            { key: 'twitter', label: 'Twitter', icon: Twitter },
            { key: 'youtube', label: 'YouTube', icon: Youtube }
          ].map(({ key, label, icon: Icon }) => (
            <div key={key}>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <Icon size={16} className="inline mr-1" />
                {label}
              </label>
              <input
                type="text"
                value={footerConfig.social_links?.[key] || ''}
                onChange={(e) => handleSocialLinkChange(key, e.target.value)}
                placeholder={`https://${key}.com/...`}
                className={`w-full px-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Footer Columns */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Footer Columns
          </label>
          <button
            onClick={handleAddColumn}
            className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            <span>Add Column</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {footerConfig.columns.map((column, columnIndex) => (
            <div
              key={column.id}
              className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <input
                  type="text"
                  value={column.title}
                  onChange={(e) => handleUpdateColumn(columnIndex, 'title', e.target.value)}
                  placeholder="Column Title"
                  className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-medium ${
                    darkMode
                      ? 'bg-slate-600 border-slate-500 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                />
                <button
                  onClick={() => handleDeleteColumn(columnIndex)}
                  className={`ml-2 p-1.5 rounded-lg transition-colors ${
                    darkMode
                      ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                      : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="space-y-2">
                {column.items.map((item, itemIndex) => (
                  <div key={item.id} className="flex gap-2">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => handleUpdateColumnItem(columnIndex, itemIndex, 'label', e.target.value)}
                      placeholder="Label"
                      className={`flex-1 px-2 py-1.5 rounded text-sm ${
                        darkMode
                          ? 'bg-slate-600 border-slate-500 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } border focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    />
                    <input
                      type="text"
                      value={item.url}
                      onChange={(e) => handleUpdateColumnItem(columnIndex, itemIndex, 'url', e.target.value)}
                      placeholder="URL"
                      className={`flex-1 px-2 py-1.5 rounded text-sm ${
                        darkMode
                          ? 'bg-slate-600 border-slate-500 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } border focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                    />
                    <button
                      onClick={() => handleDeleteColumnItem(columnIndex, itemIndex)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => handleAddItemToColumn(columnIndex)}
                  className={`w-full py-1.5 rounded text-sm ${
                    darkMode
                      ? 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  } transition-colors`}
                >
                  + Add Link
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Copyright Text */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Copyright Text
        </label>
        <input
          type="text"
          value={footerConfig.copyright_text}
          onChange={(e) => handleChange('copyright_text', e.target.value)}
          placeholder="© 2025 All rights reserved."
          className={`w-full px-4 py-2 rounded-lg border ${
            darkMode
              ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
        />
      </div>

      {/* Preview */}
      <div>
        <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Preview
        </label>
        <div
          className="rounded-lg overflow-hidden border p-8"
          style={{
            backgroundColor: footerConfig.background_color,
            color: footerConfig.text_color
          }}
        >
          <div className="grid grid-cols-4 gap-6 mb-6">
            {footerConfig.columns.slice(0, 4).map((column) => (
              <div key={column.id}>
                <h3 className="font-bold text-white mb-3">{column.title}</h3>
                <div className="space-y-2">
                  {column.items.map((item) => (
                    <div key={item.id} className="text-sm cursor-pointer hover:opacity-75">
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {footerConfig.show_social_links && (
            <div className="flex items-center justify-center gap-4 mb-6 pt-6 border-t border-white/10">
              {footerConfig.social_links?.facebook && <Facebook size={20} className="cursor-pointer hover:opacity-75" />}
              {footerConfig.social_links?.instagram && <Instagram size={20} className="cursor-pointer hover:opacity-75" />}
              {footerConfig.social_links?.twitter && <Twitter size={20} className="cursor-pointer hover:opacity-75" />}
              {footerConfig.social_links?.youtube && <Youtube size={20} className="cursor-pointer hover:opacity-75" />}
            </div>
          )}

          <div className="text-sm text-center opacity-75 border-t border-white/10 pt-4">
            {footerConfig.copyright_text}
          </div>
        </div>
      </div>
    </div>
  );
};
