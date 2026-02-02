import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const UnreadCommunicationsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchUnreadCount();
  }, [user]);

  const fetchUnreadCount = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setUnreadCount(count || 0);
    } catch (err) {
      console.error('Error fetching unread communications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      navigate('/comms');
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
        onClick={handleClick}
        disabled={isEditMode}
        className={`relative rounded-2xl p-4 text-left transition-all w-full h-full flex items-center gap-3 border backdrop-blur-sm ${themeColors.background} ${isEditMode ? '' : 'cursor-pointer transform hover:scale-[1.02]'}`}
      >
        <div className="flex-shrink-0">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <MessageSquare className="text-blue-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Unread Messages</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : unreadCount}
          </p>
          <p className="text-xs text-slate-400">
            {unreadCount > 0
              ? `${unreadCount === 1 ? '1 message' : `${unreadCount} messages`} unread`
              : 'All caught up!'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <Activity className="text-blue-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};
