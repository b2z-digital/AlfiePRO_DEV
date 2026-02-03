import React, { useState, useEffect } from 'react';
import { Users, ChevronRight, X, Mail, Phone, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

interface Application {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  membership_type_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  avatar_url?: string;
}

export const RecentApplicationsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const darkMode = true;
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    fetchRecentApplications();
  }, [currentClub]);

  const fetchRecentApplications = async () => {
    if (!currentClub?.clubId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('membership_applications')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;

      setApplications(data || []);
    } catch (err) {
      console.error('Error fetching recent applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Pending
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
            Rejected
          </span>
        );
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diff = now.getTime() - then.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  return (
    <div className={`relative rounded-2xl p-6 w-full h-full border backdrop-blur-sm ${themeColors.background}`}>
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

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Users className="text-amber-400" size={20} />
          <h2 className="text-lg font-semibold text-white">Recent Applications</h2>
        </div>
        {!isEditMode && currentClub?.clubId && (
          <button
            onClick={() => navigate(`/membership/${currentClub.clubId}`, { state: { activeTab: 'applications' } })}
            className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300"
          >
            View all
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12">
          <Users className="mx-auto mb-4 text-slate-500" size={48} />
          <p className="text-slate-400">No recent applications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              onClick={() => {
                if (!isEditMode && currentClub?.clubId) {
                  navigate(`/membership/${currentClub.clubId}`, { state: { activeTab: 'applications', selectedApplicationId: app.id } });
                }
              }}
              className={`
                group relative overflow-hidden rounded-xl border transition-all duration-300
                ${isEditMode ? 'pointer-events-none' : 'hover:shadow-xl hover:scale-[1.02] cursor-pointer'}
                bg-slate-800/50 border-slate-700/50 hover:border-slate-600/70 p-4
              `}
            >
              <div className="flex items-start gap-3">
                {app.avatar_url ? (
                  <img
                    src={app.avatar_url}
                    alt={`${app.first_name} ${app.last_name}`}
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <Users size={24} className="text-slate-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {app.first_name} {app.last_name}
                    </h3>
                    {getStatusBadge(app.status)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Mail size={12} />
                      <span className="truncate">{app.email}</span>
                    </div>
                    {app.membership_type_name && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Award size={12} />
                        <span className="truncate">{app.membership_type_name}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {formatTimeAgo(app.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
