import React from 'react';
import { AlertTriangle, RefreshCw, LogOut, ArrowRight, Building2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface CancelledMembership {
  club_id: string;
  club_name: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  previous_membership_level: string | null;
}

interface CancelledMembershipScreenProps {
  cancelledMemberships: CancelledMembership[];
  darkMode?: boolean;
}

export const CancelledMembershipScreen: React.FC<CancelledMembershipScreenProps> = ({
  cancelledMemberships,
}) => {
  const handleRenewMembership = () => {
    window.location.href = '/onboarding';
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Membership Cancelled</h1>
          <p className="text-slate-400 text-base leading-relaxed">
            Your membership has been cancelled. You'll need to renew to regain access to the platform.
          </p>
        </div>

        {cancelledMemberships.length > 0 && (
          <div className="space-y-3 mb-8">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider px-1">Cancelled Memberships</p>
            {cancelledMemberships.map((membership) => (
              <div
                key={membership.club_id}
                className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{membership.club_name}</p>
                    {membership.previous_membership_level && (
                      <p className="text-slate-400 text-sm mt-0.5 capitalize">
                        {membership.previous_membership_level} member
                      </p>
                    )}
                    {membership.cancelled_at && (
                      <p className="text-slate-500 text-xs mt-1">
                        Cancelled {formatDate(membership.cancelled_at)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-red-900/30 text-red-400 flex-shrink-0">
                    Cancelled
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-6">
          <h3 className="text-white font-medium mb-2">What happens when you renew?</h3>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
              Your previous race results, data, and history are preserved
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
              Select your membership type and complete the application
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
              Club admins will review and approve your renewal
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></span>
              Full platform access restored once approved
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleRenewMembership}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/30"
          >
            <RefreshCw className="w-5 h-5" />
            Renew My Membership
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={handleSignOut}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          If you believe this is an error, please contact your club administrator.
        </p>
      </div>
    </div>
  );
};
