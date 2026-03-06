import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Bell, Mail, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useImpersonation } from '../../../contexts/ImpersonationContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

interface CommsStats {
  unreadNotifications: number;
  recentMessages: number;
  pendingTasks: number;
}

export const CommunicationsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, user } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const [stats, setStats] = useState<CommsStats>({
    unreadNotifications: 0,
    recentMessages: 0,
    pendingTasks: 0
  });
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;

  useEffect(() => {
    loadCommsStats();
  }, [currentClub, effectiveUserId]);

  const loadCommsStats = async () => {
    if (!currentClub?.clubId || !effectiveUserId) {
      setLoading(false);
      return;
    }

    try {
      const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', effectiveUserId)
        .eq('read', false);

      if (notifError) throw notifError;

      const { data: tasks, error: taskError } = await supabase
        .from('club_tasks')
        .select('id')
        .eq('club_id', currentClub.clubId)
        .eq('status', 'pending');

      if (taskError) throw taskError;

      setStats({
        unreadNotifications: notifications?.length || 0,
        recentMessages: 0,
        pendingTasks: tasks?.length || 0
      });
    } catch (error) {
      console.error('Error loading communications stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (path: string) => {
    if (!isEditMode) navigate(path);
  };

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
        <MessageSquare className="text-cyan-400" size={20} />
        <h2 className="text-lg font-semibold text-white">Communications</h2>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          Loading...
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <button
            onClick={() => handleNavigate('/comms')}
            disabled={isEditMode}
            className={`flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group ${isEditMode ? 'pointer-events-none' : ''}`}
          >
            <div className="flex items-center gap-3">
              <Bell size={20} className="text-cyan-400" />
              <div className="text-left">
                <div className="font-medium text-white">Notifications</div>
                <div className="text-xs text-slate-400">
                  {stats.unreadNotifications} unread
                </div>
              </div>
            </div>
            {stats.unreadNotifications > 0 && (
              <div className="px-2 py-1 bg-cyan-600 text-white text-xs font-semibold rounded-full min-w-[24px] text-center">
                {stats.unreadNotifications}
              </div>
            )}
          </button>

          <button
            onClick={() => handleNavigate('/comms?compose=true')}
            disabled={isEditMode}
            className={`flex items-center justify-between p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group ${isEditMode ? 'pointer-events-none' : ''}`}
          >
            <div className="flex items-center gap-3">
              <Mail size={20} className="text-cyan-400" />
              <div className="text-left">
                <div className="font-medium text-white">Send Message</div>
                <div className="text-xs text-slate-400">Email members</div>
              </div>
            </div>
            <Send size={16} className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          <div className="bg-slate-700/30 border border-slate-700/50 rounded-xl p-4 mt-auto">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-400">Pending tasks</div>
                <div className="text-lg font-semibold text-white mt-1">
                  {stats.pendingTasks} active
                </div>
              </div>
              <button
                onClick={() => handleNavigate('/tasks')}
                disabled={isEditMode}
                className={`px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg transition-colors ${isEditMode ? 'pointer-events-none' : ''}`}
              >
                View Tasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
