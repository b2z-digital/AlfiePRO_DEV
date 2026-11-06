import React from 'react';
import { Bell, X } from 'lucide-react';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const ActivityFeedWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  return (
    <div
      className={`
        relative rounded-2xl p-6 w-full h-full
        ${darkMode ? `border backdrop-blur-sm ${themeColors.background}` : 'bg-white shadow-xl'}
        ${isEditMode ? 'animate-wiggle cursor-move' : ''}
      `}
    >
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
      <div className="flex items-center gap-3 mb-4">
        <span className="a-tile flex-shrink-0" style={{ width: 36, height: 36 }}><Bell size={19} /></span>
        <h2 className="a-display a-ink text-[18px] font-semibold">Recent Activity</h2>
      </div>
      <p className="text-sm text-slate-400">Activity feed placeholder</p>
    </div>
  );
};
