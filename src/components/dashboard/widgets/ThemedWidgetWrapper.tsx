import React, { useMemo } from 'react';
import { X, LucideIcon } from 'lucide-react';
import { WidgetColorTheme } from '../../../types/dashboard';
import { getWidgetThemeColors } from '../../../utils/widgetThemes';

interface ThemedWidgetWrapperProps {
  title?: string;
  icon?: LucideIcon;
  colorTheme?: WidgetColorTheme;
  isEditMode?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const ThemedWidgetWrapper: React.FC<ThemedWidgetWrapperProps> = ({
  title,
  icon: Icon,
  colorTheme = 'default',
  isEditMode,
  onRemove,
  children,
  className = ''
}) => {
  const themeColors = useMemo(() => getWidgetThemeColors(colorTheme), [colorTheme]);

  return (
    <div
      className={`relative rounded-2xl p-6 w-full h-full flex flex-col border backdrop-blur-sm ${themeColors.background} ${
        isEditMode ? 'animate-wiggle cursor-move' : ''
      } ${className}`}
    >
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
          aria-label="Remove widget"
        >
          <X size={16} />
        </button>
      )}
      {(title || Icon) && (
        <div className="flex items-center gap-3 mb-4">
          {Icon && (
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
              <Icon className="w-5 h-5 text-blue-400" />
            </div>
          )}
          {title && (
            <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export const useWidgetTheme = (colorTheme: WidgetColorTheme = 'default') => {
  return useMemo(() => getWidgetThemeColors(colorTheme), [colorTheme]);
};
