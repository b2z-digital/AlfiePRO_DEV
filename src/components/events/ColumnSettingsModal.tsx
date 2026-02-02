import React, { useState } from 'react';
import { Save, Monitor, Tablet, Smartphone, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from 'lucide-react';
import type { EventPageColumn, DeviceType } from '../../types/eventWidgets';
import { DraggableModal } from './DraggableModal';

interface Props {
  column: EventPageColumn;
  onSave: (updatedColumn: EventPageColumn) => void;
  onClose: () => void;
  currentViewport: DeviceType;
  darkMode?: boolean;
}

export const ColumnSettingsModal: React.FC<Props> = ({ column, onSave, onClose, currentViewport, darkMode = false }) => {
  const [activeDevice, setActiveDevice] = useState<DeviceType>(currentViewport);
  const [settings, setSettings] = useState({
    verticalAlign: column.verticalAlign ?? 'top',
    backgroundColor: column.background?.type === 'color' ? column.background.value : 'transparent',
    marginTop: column.margin?.top ?? 0,
    marginBottom: column.margin?.bottom ?? 0,
    marginLeft: column.margin?.left ?? 0,
    marginRight: column.margin?.right ?? 0,
    paddingTop: column.padding?.top ?? 0,
    paddingBottom: column.padding?.bottom ?? 0,
    paddingLeft: column.padding?.left ?? 0,
    paddingRight: column.padding?.right ?? 0,
    responsivePadding: {
      desktop: column.responsivePadding?.desktop ?? { top: 0, bottom: 0, left: 0, right: 0 },
      tablet: column.responsivePadding?.tablet ?? { top: 0, bottom: 0, left: 0, right: 0 },
      mobile: column.responsivePadding?.mobile ?? { top: 0, bottom: 0, left: 0, right: 0 }
    },
    responsiveMargin: {
      desktop: column.responsiveMargin?.desktop ?? { top: 0, bottom: 0, left: 0, right: 0 },
      tablet: column.responsiveMargin?.tablet ?? { top: 0, bottom: 0, left: 0, right: 0 },
      mobile: column.responsiveMargin?.mobile ?? { top: 0, bottom: 0, left: 0, right: 0 }
    }
  });

  const handleSave = () => {
    onSave({
      ...column,
      verticalAlign: settings.verticalAlign as 'top' | 'center' | 'bottom',
      background: settings.backgroundColor !== 'transparent' ? {
        type: 'color',
        value: settings.backgroundColor
      } : undefined,
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
      responsiveMargin: settings.responsiveMargin
    });
    onClose();
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
      title="Column Settings"
      modalType="column_settings"
      darkMode={darkMode}
      maxWidth="500px"
    >
      <div className="space-y-6">
          {/* Vertical Alignment */}
          <div>
            <label className={`block text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Vertical Alignment
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'top', label: 'Top', icon: AlignStartVertical },
                { value: 'center', label: 'Center', icon: AlignCenterVertical },
                { value: 'bottom', label: 'Bottom', icon: AlignEndVertical }
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleChange('verticalAlign', option.value)}
                    className={`px-4 py-2.5 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                      settings.verticalAlign === option.value
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                        : darkMode
                        ? 'border-slate-600 text-slate-300 hover:border-slate-500'
                        : 'border-slate-300 text-slate-700 hover:border-slate-400'
                    }`}
                  >
                    <Icon size={18} />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className={`text-xs mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Controls how widgets align vertically in the column. Row must have a Min Height set for this to take effect.
            </p>
          </div>

          {/* Background Color */}
          <div>
            <label className={`block text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Background Color
            </label>
            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                {settings.backgroundColor !== 'transparent' && (
                  <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => handleChange('backgroundColor', e.target.value)}
                      className="w-full h-full cursor-pointer border-0"
                      style={{ padding: 0, margin: 0 }}
                    />
                  </div>
                )}
                <input
                  type="text"
                  value={settings.backgroundColor}
                  onChange={(e) => handleChange('backgroundColor', e.target.value)}
                  className={`flex-1 px-4 py-2.5 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
                  placeholder="transparent or #1e293b"
                />
              </div>
              <button
                onClick={() => handleChange('backgroundColor', settings.backgroundColor === 'transparent' ? '#1e293b' : 'transparent')}
                className={`text-sm px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  settings.backgroundColor === 'transparent'
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                    : darkMode
                    ? 'border-slate-600 text-slate-300 hover:border-slate-500'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400'
                }`}
              >
                {settings.backgroundColor === 'transparent' ? 'Transparent (Click to disable)' : 'Make Transparent'}
              </button>
            </div>
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
