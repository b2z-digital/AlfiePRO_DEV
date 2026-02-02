import React from 'react';
import { Trophy, X } from 'lucide-react';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const BoatClassDistributionWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  return (
    <div className={`relative rounded-2xl p-6 w-full h-full border backdrop-blur-sm ${themeColors.background}`}>
      {isEditMode && onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto">
          <X size={16} />
        </button>
      )}
      <div className="flex items-center gap-2"><Trophy className="text-blue-400" size={20} /><h2 className="text-lg font-semibold text-white">Boat Classes</h2></div>
    </div>
  );
};
