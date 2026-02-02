import React from 'react';
import { Calendar, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const QuickEventSetupWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  return (
    <div className={`relative rounded-2xl p-6 w-full h-full flex flex-col ${darkMode ? 'border backdrop-blur-sm ${themeColors.background}' : 'bg-white shadow-xl'} ${isEditMode ? 'animate-wiggle cursor-move' : ''}`}>
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Calendar className="text-purple-400" size={20} />
        <h2 className="text-lg font-semibold text-white">Quick Event Setup</h2>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        <button
          onClick={() => !isEditMode && navigate('/race-management?tab=oneoff')}
          disabled={isEditMode}
          className={`flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <div className="flex items-center gap-3">
            <Plus size={20} className="text-purple-400" />
            <div className="text-left">
              <div className="font-medium text-white">Single Event</div>
              <div className="text-xs text-slate-400">One-off race event</div>
            </div>
          </div>
          <div className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </div>
        </button>

        <button
          onClick={() => !isEditMode && navigate('/race-management?tab=series')}
          disabled={isEditMode}
          className={`flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <div className="flex items-center gap-3">
            <Plus size={20} className="text-purple-400" />
            <div className="text-left">
              <div className="font-medium text-white">Series Event</div>
              <div className="text-xs text-slate-400">Multi-round championship</div>
            </div>
          </div>
          <div className="text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </div>
        </button>
      </div>
    </div>
  );
};
