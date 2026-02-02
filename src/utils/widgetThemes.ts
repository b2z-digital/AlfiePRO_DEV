import { WidgetColorTheme, WidgetThemeColors } from '../types/dashboard';

export const getWidgetThemeColors = (theme: WidgetColorTheme = 'default'): WidgetThemeColors => {
  const themes: Record<WidgetColorTheme, WidgetThemeColors> = {
    default: {
      background: 'bg-slate-800/30 border-slate-700/50',
      border: 'border-slate-700/50',
      accentText: 'text-slate-400',
      accentBg: 'bg-slate-700/30'
    },
    purple: {
      background: 'bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-purple-500/30',
      border: 'border-purple-500/20',
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-600/20'
    },
    blue: {
      background: 'bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30',
      border: 'border-blue-500/20',
      accentText: 'text-blue-400',
      accentBg: 'bg-blue-600/20'
    },
    green: {
      background: 'bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30',
      border: 'border-green-500/20',
      accentText: 'text-green-400',
      accentBg: 'bg-green-600/20'
    },
    orange: {
      background: 'bg-gradient-to-br from-orange-600/20 to-orange-800/20 border-orange-500/30',
      border: 'border-orange-500/20',
      accentText: 'text-orange-400',
      accentBg: 'bg-orange-600/20'
    },
    pink: {
      background: 'bg-gradient-to-br from-pink-600/20 to-pink-800/20 border-pink-500/30',
      border: 'border-pink-500/20',
      accentText: 'text-pink-400',
      accentBg: 'bg-pink-600/20'
    },
    red: {
      background: 'bg-gradient-to-br from-red-600/20 to-red-800/20 border-red-500/30',
      border: 'border-red-500/20',
      accentText: 'text-red-400',
      accentBg: 'bg-red-600/20'
    },
    indigo: {
      background: 'bg-gradient-to-br from-indigo-600/20 to-indigo-800/20 border-indigo-500/30',
      border: 'border-indigo-500/20',
      accentText: 'text-indigo-400',
      accentBg: 'bg-indigo-600/20'
    },
    teal: {
      background: 'bg-gradient-to-br from-teal-600/20 to-teal-800/20 border-teal-500/30',
      border: 'border-teal-500/20',
      accentText: 'text-teal-400',
      accentBg: 'bg-teal-600/20'
    },
    amber: {
      background: 'bg-gradient-to-br from-amber-600/20 to-amber-800/20 border-amber-500/30',
      border: 'border-amber-500/20',
      accentText: 'text-amber-400',
      accentBg: 'bg-amber-600/20'
    }
  };

  return themes[theme] || themes.default;
};

export const WIDGET_THEME_OPTIONS: { value: WidgetColorTheme; label: string; preview: string }[] = [
  { value: 'default', label: 'Default (Slate)', preview: 'bg-gradient-to-br from-slate-600/50 to-slate-800/50' },
  { value: 'purple', label: 'Purple', preview: 'bg-gradient-to-br from-purple-600 to-purple-800' },
  { value: 'blue', label: 'Blue', preview: 'bg-gradient-to-br from-blue-600 to-blue-800' },
  { value: 'green', label: 'Green', preview: 'bg-gradient-to-br from-green-600 to-green-800' },
  { value: 'orange', label: 'Orange', preview: 'bg-gradient-to-br from-orange-600 to-orange-800' },
  { value: 'pink', label: 'Pink', preview: 'bg-gradient-to-br from-pink-600 to-pink-800' },
  { value: 'red', label: 'Red', preview: 'bg-gradient-to-br from-red-600 to-red-800' },
  { value: 'indigo', label: 'Indigo', preview: 'bg-gradient-to-br from-indigo-600 to-indigo-800' },
  { value: 'teal', label: 'Teal', preview: 'bg-gradient-to-br from-teal-600 to-teal-800' },
  { value: 'amber', label: 'Amber', preview: 'bg-gradient-to-br from-amber-600 to-amber-800' }
];
