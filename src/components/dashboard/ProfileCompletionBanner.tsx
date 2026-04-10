import React, { useState, useEffect, useCallback } from 'react';
import { Phone, Heart, Sailboat, ChevronRight, X, Camera, CircleCheck as CheckCircle2, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNavigate } from 'react-router-dom';

interface ProfileCompleteness {
  needs_completion: boolean;
  member_id: string;
  club_id: string;
  club_name: string;
  missing_fields: string[];
  has_boats: boolean;
  current_data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    postcode: string;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relationship: string;
    avatar_url?: string;
  };
}

const TOTAL_FIELDS = 5;

const CircularProgress: React.FC<{ percentage: number }> = ({ percentage }) => {
  const radius = 38;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.1)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-xl font-bold text-white leading-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.8 }}
        >
          {percentage}%
        </motion.span>
        <span className="text-[10px] text-slate-400 mt-0.5">complete</span>
      </div>
    </div>
  );
};

export const ProfileCompletionBanner: React.FC = () => {
  const { user, currentClub } = useAuth();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<ProfileCompleteness | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkProfileCompleteness = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const dismissedKey = `profile_completion_dismissed_${user.id}`;
      if (localStorage.getItem(dismissedKey) === 'true') {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const { data } = await supabase.rpc('check_member_profile_completeness');
      if (data?.success) {
        if (data.needs_completion) {
          setProfileData(data);
        } else {
          setProfileData(null);
        }
      }
    } catch (err) {
      console.error('Error checking profile completeness:', err);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkProfileCompleteness();
  }, [user, currentClub, checkProfileCompleteness]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkProfileCompleteness();
      }
    };
    const handleFocus = () => checkProfileCompleteness();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('popstate', handleFocus);
    window.addEventListener('profile-updated', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('popstate', handleFocus);
      window.removeEventListener('profile-updated', handleFocus);
    };
  }, [checkProfileCompleteness]);

  const handleDismiss = () => {
    if (user) {
      localStorage.setItem(`profile_completion_dismissed_${user.id}`, 'true');
    }
    setDismissed(true);
  };

  const handleGoToProfile = () => {
    navigate('/my-membership', { state: { edit: true } });
  };

  if (loading || dismissed || !profileData || !profileData.needs_completion) {
    return null;
  }

  const allItems = [
    { key: 'avatar', icon: Camera, label: 'Profile photo', missing: profileData.missing_fields.includes('avatar') },
    { key: 'phone', icon: Phone, label: 'Phone number', missing: profileData.missing_fields.includes('phone') },
    { key: 'address', icon: MapPin, label: 'Address', missing: profileData.missing_fields.includes('address') },
    { key: 'emergency', icon: Heart, label: 'Emergency contact', missing: profileData.missing_fields.includes('emergency_contact') },
    { key: 'boats', icon: Sailboat, label: 'Boat information', missing: !profileData.has_boats },
  ];

  const missingCount = allItems.filter(i => i.missing).length;
  const completedCount = TOTAL_FIELDS - missingCount;
  const percentage = Math.round((completedCount / TOTAL_FIELDS) * 100);

  if (missingCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/60 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-cyan-500/5 pointer-events-none" />

        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition z-10"
          title="Dismiss"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-6 relative">
          <CircularProgress percentage={percentage} />

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base mb-1">Complete your profile</h3>
            <p className="text-sm text-slate-400 mb-4">
              {completedCount} of {TOTAL_FIELDS} items done. Finish setting up so {profileData.club_name} has your details on file.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {allItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      item.missing
                        ? 'bg-slate-700/50 border border-slate-600/50 text-slate-300'
                        : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {item.missing ? (
                      <ItemIcon size={13} className="text-amber-400" />
                    ) : (
                      <CheckCircle2 size={13} className="text-emerald-400" />
                    )}
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleGoToProfile}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
            >
              Update My Details
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
