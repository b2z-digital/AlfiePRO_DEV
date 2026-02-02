import React, { useState, useEffect } from 'react';
import { Clock, X, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

export const PendingEventsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchPendingEvents();
  }, [currentClub, currentOrganization]);

  const fetchPendingEvents = async () => {
    if (!currentClub?.clubId && !currentOrganization?.id) {
      setLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('public_events')
        .select('id', { count: 'exact', head: true });

      if (currentOrganization) {
        // For associations, show events pending approval
        if (currentOrganization.type === 'state') {
          query = query
            .eq('state_association_id', currentOrganization.id)
            .in('approval_status', ['pending', 'pending_state']);
        } else if (currentOrganization.type === 'national') {
          query = query
            .eq('national_association_id', currentOrganization.id)
            .eq('approval_status', 'pending_national');
        }
      } else {
        // For clubs, show their events pending approval
        query = query
          .eq('club_id', currentClub!.clubId)
          .in('approval_status', ['pending', 'pending_state', 'pending_national', 'rejected', 'withdrawn']);
      }

      const { count, error } = await query;

      if (error) throw error;

      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error fetching pending events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (!isEditMode) {
      // Navigate to Race Management with pending tab selected
      navigate('/race-management', { state: { activeTab: 'pending' } });
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
          <div className="p-3 rounded-xl bg-green-500/20">
            <Clock className="text-green-400" size={24} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 mb-0.5">Pending Events</p>
          <p className="text-2xl font-bold text-white mb-0.5">
            {loading ? '...' : pendingCount}
          </p>
          <p className="text-xs text-slate-400">
            {pendingCount > 0
              ? currentOrganization
                ? 'Awaiting approval'
                : 'Awaiting review'
              : 'No pending events'}
          </p>
        </div>
        <div className="flex-shrink-0">
          <Activity className="text-green-400/40" size={32} />
        </div>
      </button>
    </div>
  );
};
