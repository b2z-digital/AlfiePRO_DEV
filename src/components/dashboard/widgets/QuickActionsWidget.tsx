import React from 'react';
import { Zap, Plus, Send, UserPlus, CreditCard, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const QuickActionsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  return (
    <div
      className={`
        relative rounded-2xl p-6 w-full h-full
        ${darkMode
          ? 'border backdrop-blur-sm ${themeColors.background}'
          : 'bg-white shadow-xl'}
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

      <div className="flex items-center gap-2 mb-4">
        <Zap className={darkMode ? "text-yellow-400" : "text-yellow-500"} size={20} />
        <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-700'}`}>Quick Actions</h2>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => !isEditMode && navigate('/race-management')}
          disabled={isEditMode}
          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
            darkMode ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-slate-50 hover:bg-slate-100'
          } ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <Plus className={darkMode ? "text-purple-400" : "text-purple-500"} size={16} />
          <span className={`text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>Create Race</span>
        </button>

        <button
          onClick={() => !isEditMode && navigate('/comms')}
          disabled={isEditMode}
          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
            darkMode ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-slate-50 hover:bg-slate-100'
          } ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <Send className={darkMode ? "text-blue-400" : "text-blue-500"} size={16} />
          <span className={`text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>Send Message</span>
        </button>

        <button
          onClick={() => !isEditMode && navigate('/membership-dashboard?tab=members')}
          disabled={isEditMode}
          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
            darkMode ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-slate-50 hover:bg-slate-100'
          } ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <UserPlus className={darkMode ? "text-green-400" : "text-green-500"} size={16} />
          <span className={`text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>Add Member</span>
        </button>

        <button
          onClick={() => !isEditMode && navigate('/finances')}
          disabled={isEditMode}
          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
            darkMode ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-slate-50 hover:bg-slate-100'
          } ${isEditMode ? 'pointer-events-none' : ''}`}
        >
          <CreditCard className={darkMode ? "text-emerald-400" : "text-emerald-500"} size={16} />
          <span className={`text-sm ${darkMode ? 'text-white' : 'text-slate-800'}`}>Record Payment</span>
        </button>
      </div>
    </div>
  );
};
