import React, { useState, useEffect } from 'react';
import { CheckSquare, X, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const TasksCountWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [taskCount, setTaskCount] = useState(0);
  const [activeTaskCount, setActiveTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchTaskData();
  }, [currentClub]);

  const fetchTaskData = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('club_tasks')
        .select('id, status')
        .eq('club_id', currentClub.clubId);

      if (error) throw error;

      const activeTasks = data?.filter(t => t.status !== 'completed') || [];
      setTaskCount(data?.length || 0);
      setActiveTaskCount(activeTasks.length);
    } catch (err) {
      console.error('Error fetching task data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full">
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
      <button
        onClick={() => !isEditMode && navigate('/tasks')}
        disabled={isEditMode}
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <CheckSquare className="text-blue-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Club Tasks</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : activeTaskCount}
          </p>
          <p className="text-xs text-slate-400">
            {activeTaskCount === 1 ? '1 active task' : activeTaskCount === 0 ? 'No active tasks' : `${activeTaskCount} active tasks`}
          </p>
        </div>
        <div className="flex-shrink-0">
          <BarChart3 className="text-blue-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};
