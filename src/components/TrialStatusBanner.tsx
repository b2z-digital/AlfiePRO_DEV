import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, CreditCard, X } from 'lucide-react';
import { supabase } from '../utils/supabase';

interface TrialStatus {
  status: string;
  trial_end_date: string | null;
  subscription_type: string;
}

export const TrialStatusBanner: React.FC = () => {
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchTrialStatus();
  }, []);

  const fetchTrialStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('status, trial_end_date, subscription_type')
      .eq('user_id', user.id)
      .eq('status', 'trialing')
      .maybeSingle();

    if (error) {
      console.error('Error fetching trial status:', error);
      return;
    }

    if (data && data.trial_end_date) {
      setTrialStatus(data);

      const trialEndDate = new Date(data.trial_end_date);
      const today = new Date();
      const diffTime = trialEndDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      setDaysRemaining(Math.max(0, diffDays));
    }
  };

  if (!trialStatus || dismissed) {
    return null;
  }

  const isExpiringSoon = daysRemaining <= 7;
  const isLastDay = daysRemaining === 1;
  const hasExpired = daysRemaining === 0;

  const getBannerColor = () => {
    if (hasExpired) return 'bg-red-500/10 border-red-500/30';
    if (isLastDay) return 'bg-orange-500/10 border-orange-500/30';
    if (isExpiringSoon) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-blue-500/10 border-blue-500/30';
  };

  const getTextColor = () => {
    if (hasExpired) return 'text-red-300';
    if (isLastDay) return 'text-orange-300';
    if (isExpiringSoon) return 'text-yellow-300';
    return 'text-blue-300';
  };

  const getIconColor = () => {
    if (hasExpired) return 'text-red-400';
    if (isLastDay) return 'text-orange-400';
    if (isExpiringSoon) return 'text-yellow-400';
    return 'text-blue-400';
  };

  const getPlanName = () => {
    const planNames: Record<string, string> = {
      club: 'Club',
      state: 'State Association',
      national: 'National Association',
    };
    return planNames[trialStatus.subscription_type] || 'Club';
  };

  return (
    <div className={`relative border rounded-lg p-4 mb-6 ${getBannerColor()}`}>
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 p-1 hover:bg-white/10 rounded transition-colors"
      >
        <LogOut className={getTextColor()} size={18} />
      </button>

      <div className="flex items-start gap-4">
        <div className={`mt-1 ${getIconColor()}`}>
          {hasExpired ? (
            <AlertCircle size={24} />
          ) : (
            <Clock size={24} />
          )}
        </div>

        <div className="flex-1">
          <h3 className={`font-semibold text-lg mb-1 ${getTextColor()}`}>
            {hasExpired ? 'Trial Expired' : `Free Trial Active - ${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'} Remaining`}
          </h3>

          <p className="text-slate-300 text-sm mb-3">
            {hasExpired ? (
              <>Your 30-day free trial of the {getPlanName()} plan has ended. Please add payment details to continue using AlfiePro.</>
            ) : isExpiringSoon ? (
              <>Your free trial ends soon. Add payment details now to avoid any interruption to your service.</>
            ) : (
              <>You're currently on a free trial of the {getPlanName()} plan. You won't be charged until your trial ends on {new Date(trialStatus.trial_end_date!).toLocaleDateString()}.</>
            )}
          </p>

          <button
            onClick={() => window.location.href = '/settings?tab=subscription'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              hasExpired
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : isExpiringSoon
                ? 'bg-yellow-500 hover:bg-yellow-600 text-slate-900'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            <CreditCard size={18} />
            {hasExpired ? 'Add Payment Now' : 'Manage Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
};
