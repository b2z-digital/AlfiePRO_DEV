import React, { useState, useEffect } from 'react';
import { CircleUser as UserCircle, Phone, Heart, Sailboat, ChevronRight, X, Loader as Loader2, CircleCheck as CheckCircle2 } from 'lucide-react';
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
  };
}

export const ProfileCompletionBanner: React.FC = () => {
  const { user, currentClub } = useAuth();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<ProfileCompleteness | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkProfileCompleteness();
  }, [user, currentClub]);

  const checkProfileCompleteness = async () => {
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
      if (data?.success && data.needs_completion) {
        setProfileData(data);
      }
    } catch (err) {
      console.error('Error checking profile completeness:', err);
    }
    setLoading(false);
  };

  const handleDismiss = () => {
    if (user) {
      localStorage.setItem(`profile_completion_dismissed_${user.id}`, 'true');
    }
    setDismissed(true);
  };

  const handleGoToProfile = () => {
    navigate('/membership');
  };

  if (loading || dismissed || !profileData || !profileData.needs_completion) {
    return null;
  }

  const missingItems = [];
  if (profileData.missing_fields.includes('phone')) {
    missingItems.push({ icon: Phone, label: 'Phone number' });
  }
  if (profileData.missing_fields.includes('emergency_contact')) {
    missingItems.push({ icon: Heart, label: 'Emergency contact' });
  }
  if (!profileData.has_boats) {
    missingItems.push({ icon: Sailboat, label: 'Boat information' });
  }

  if (missingItems.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="bg-gradient-to-r from-blue-600/20 to-sky-600/20 border border-blue-500/30 rounded-xl p-5 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-slate-300 transition"
          title="Dismiss"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <UserCircle size={22} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold mb-1">Complete your membership profile</h3>
            <p className="text-sm text-slate-400 mb-4">
              Welcome to {profileData.club_name}! Please take a moment to fill in a few details so your club has your current information on file.
            </p>

            <div className="flex flex-wrap gap-3 mb-4">
              {missingItems.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50"
                >
                  <item.icon size={14} className="text-amber-400" />
                  <span className="text-xs text-slate-300">{item.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleGoToProfile}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Update My Details
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
