import React, { useState, useEffect } from 'react';
import { CreditCard, Calendar, CheckCircle, AlertTriangle, ExternalLink, Spade as Upgrade, Plus, Building, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserSubscription, SubscriptionTier } from '../../types/subscription';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

const subscriptionTiers: SubscriptionTier[] = [
  {
    id: 'club',
    name: 'Club Subscription',
    description: 'Perfect for individual yacht clubs',
    price: 29,
    currency: 'AUD',
    interval: 'month',
    features: [
      'Unlimited race management',
      'Member management',
      'Event calendar',
      'Results tracking',
      'Basic reporting',
      'Email support'
    ]
  },
  {
    id: 'state_association',
    name: 'State Association',
    description: 'For state-level yacht racing associations',
    price: 99,
    currency: 'AUD',
    interval: 'month',
    features: [
      'Everything in Club subscription',
      'Create state-wide public events',
      'Multi-club coordination',
      'Advanced analytics',
      'Priority support',
      'Custom branding'
    ]
  },
  {
    id: 'national_association',
    name: 'National Association',
    description: 'For national yacht racing organizations',
    price: 199,
    currency: 'AUD',
    interval: 'month',
    features: [
      'Everything in State Association',
      'Create national public events',
      'Cross-state coordination',
      'Premium analytics & insights',
      'Dedicated account manager',
      'API access'
    ]
  }
];

interface SubscriptionManagementProps {
  darkMode: boolean;
}

interface ClubSubscription {
  club_id: string;
  club_name: string;
  organization_type: string;
  subscription_type: string;
  status: string;
  created_at: string;
}

export const SubscriptionManagement: React.FC<SubscriptionManagementProps> = ({ darkMode }) => {
  const { userSubscription, refreshUserClubs, userClubs, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubSubscriptions, setClubSubscriptions] = useState<ClubSubscription[]>([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [clubToCancel, setClubToCancel] = useState<ClubSubscription | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isSuperAdmin || userClubs.length > 0) {
      fetchClubSubscriptions();
    }
  }, [isSuperAdmin, userClubs]);

  const fetchClubSubscriptions = async () => {
    try {
      // For super admins or users with clubs, show club-based subscriptions
      const clubIds = userClubs.map(uc => uc.clubId);
      
      if (clubIds.length > 0) {
        const { data: clubs, error } = await supabase
          .from('clubs')
          .select('id, name, organization_type, created_at')
          .in('id', clubIds);
        
        if (error) throw error;
        
        // Map clubs to subscription format
        const subscriptions: ClubSubscription[] = clubs.map(club => ({
          club_id: club.id,
          club_name: club.name,
          organization_type: club.organization_type,
          subscription_type: club.organization_type,
          status: 'active', // Assume active since clubs exist
          created_at: club.created_at
        }));
        
        setClubSubscriptions(subscriptions);
      }
    } catch (err) {
      console.error('Error fetching club subscriptions:', err);
    }
  };

  const getCurrentTier = (subscriptionType: string) => {
    return subscriptionTiers.find(tier => tier.id === subscriptionType);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400';
      case 'past_due':
        return 'text-amber-400';
      case 'cancelled':
      case 'inactive':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={16} className="text-green-400" />;
      case 'past_due':
      case 'cancelled':
      case 'inactive':
        return <AlertTriangle size={16} className="text-amber-400" />;
      default:
        return <AlertTriangle size={16} className="text-slate-400" />;
    }
  };

  const handleUpgrade = async (newTier: SubscriptionTier) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.functions.invoke('create-alfie-checkout', {
        body: {
          subscription_type: newTier.id,
          success_url: `${window.location.origin}/settings?tab=subscriptions&upgraded=true`,
          cancel_url: `${window.location.origin}/settings?tab=subscriptions`
        }
      });

      if (error) throw error;

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error creating upgrade checkout:', err);
      setError(err.message || 'Failed to create upgrade checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = () => {
    // Create a customer portal session
    const createPortalSession = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-portal-session', {
          body: { return_url: window.location.href }
        });
        
        if (error) throw error;
        
        if (data?.url && data.url !== window.location.href) {
          window.location.href = data.url;
        } else {
          // Show message if billing portal is not configured
          setError(data?.message || 'Billing portal not configured. Please contact support.');
        }
      } catch (err) {
        console.error('Error creating portal session:', err);
        setError('Failed to open billing portal. Please contact support.');
      }
    };
    
    createPortalSession();
  };

  const handleCancelSubscription = async () => {
    if (!clubToCancel) return;

    try {
      setCancelLoading(true);
      setError(null);

      // Cancel all active members for this club (set to cancelled, do NOT delete)
      await supabase
        .from('members')
        .update({
          membership_status: 'cancelled',
          is_financial: false,
          cancelled_at: new Date().toISOString(),
          cancelled_reason: 'manual'
        })
        .eq('club_id', clubToCancel.club_id)
        .in('membership_status', ['active', 'expired']);

      // Mark the club subscription as cancelled rather than deleting the club
      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          subscription_status: 'cancelled',
          subscription_cancelled_at: new Date().toISOString()
        })
        .eq('id', clubToCancel.club_id);

      if (updateError) throw updateError;

      // Refresh the data
      await fetchClubSubscriptions();
      await refreshUserClubs();
      addNotification('success', 'Subscription cancelled. Your data has been preserved and can be reactivated at any time.');

      setShowCancelModal(false);
      setClubToCancel(null);

    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleAddSubscription = () => {
    window.location.href = '/onboarding/subscribe';
  };

  // Show club subscriptions if available, otherwise fall back to user subscription
  const hasSubscriptions = userSubscription || clubSubscriptions.length > 0;

  if (!hasSubscriptions) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <CreditCard size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
          <h3 className="text-lg font-medium text-white mb-2">No Active Subscription</h3>
          <p className="text-slate-400 mb-6">
            You don't have an active subscription. Choose a plan to get started.
          </p>
          <button
            onClick={() => window.location.href = '/onboarding/subscribe'}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Subscription Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-white mb-2">Subscription Management</h2>
          <p className="text-slate-400">Manage your Alfie PRO subscription and billing</p>
        </div>

        <button
          onClick={handleAddSubscription}
          className="w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors"
          title="Add Another Subscription"
        >
          <Plus size={24} className="text-white" />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 mb-6">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Current Subscriptions */}
      {clubSubscriptions.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Club Subscriptions</h3>
          {clubSubscriptions.map((clubSub) => {
            const currentTier = getCurrentTier(clubSub.subscription_type);
            const club = userClubs.find(uc => uc.clubId === clubSub.club_id);

            return (
              <div key={clubSub.club_id} className={`
                    p-6 rounded-xl border backdrop-blur-sm
                    ${darkMode 
                      ? 'bg-slate-800/30 border-slate-700/50' 
                      : 'bg-white/10 border-slate-200/20'}
                  `}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        {club?.club?.logo ? (
                          <img 
                            src={club.club.logo} 
                            alt={`${clubSub.club_name} logo`}
                            className="w-12 h-12 object-contain rounded-lg"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-blue-600 flex items-center justify-center">
                            <Building size={24} className="text-white" />
                          </div>
                        )}
                        <div>
                          <h4 className="text-lg font-semibold text-white">{clubSub.club_name}</h4>
                          <p className="text-slate-400 text-sm">
                            {clubSub.organization_type === 'club' ? 'Yacht Club' : 
                             clubSub.organization_type === 'state_association' ? 'State Association' : 
                             'National Association'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(clubSub.status)}
                        <span className={`text-sm font-medium ${getStatusColor(clubSub.status)}`}>
                          {clubSub.status.charAt(0).toUpperCase() + clubSub.status.slice(1)}
                        </span>
                      </div>
                    </div>

                    {currentTier && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h5 className="font-medium text-white mb-2">{currentTier.name}</h5>
                          <p className="text-slate-400 text-sm mb-4">{currentTier.description}</p>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-white">${currentTier.price}</span>
                            <span className="text-slate-400">/{currentTier.interval}</span>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400" />
                            <span className="text-slate-300 text-sm">
                              Created: {new Date(clubSub.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={handleManageBilling}
                              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                            >
                              <ExternalLink size={16} />
                              <span>Manage Billing</span>
                            </button>
                            
                            <button
                              onClick={() => {
                                setClubToCancel(clubSub);
                                setShowCancelModal(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/30 transition-colors"
                            >
                              <X size={16} />
                              <span>Cancel</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : userSubscription && (
            <div className={`
              p-6 rounded-xl border backdrop-blur-sm
              ${darkMode 
                ? 'bg-slate-800/30 border-slate-700/50' 
                : 'bg-white/10 border-slate-200/20'}
            `}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Current Subscription</h3>
                <div className="flex items-center gap-2">
                  {getStatusIcon(userSubscription.status)}
                  <span className={`text-sm font-medium ${getStatusColor(userSubscription.status)}`}>
                    {userSubscription.status.charAt(0).toUpperCase() + userSubscription.status.slice(1)}
                  </span>
                </div>
              </div>

              {(() => {
                const currentTier = getCurrentTier(userSubscription.subscription_type);
                return currentTier && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-white mb-2">{currentTier.name}</h4>
                      <p className="text-slate-400 text-sm mb-4">{currentTier.description}</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">${currentTier.price}</span>
                        <span className="text-slate-400">/{currentTier.interval}</span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {userSubscription.current_period_end && (
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-slate-400" />
                          <span className="text-slate-300 text-sm">
                            Next billing: {new Date(userSubscription.current_period_end).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      
                      <button
                        onClick={handleManageBilling}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                      >
                        <ExternalLink size={16} />
                        <span>Manage Billing</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {!hasSubscriptions && (
            <div className="text-center py-12">
              <CreditCard size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
              <h3 className="text-lg font-medium text-white mb-2">No Active Subscription</h3>
              <p className="text-slate-400 mb-6">
                You don't have an active subscription. Choose a plan to get started.
              </p>
              <button
                onClick={() => window.location.href = '/onboarding/subscribe'}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Subscription Plans
              </button>
            </div>
          )}
      </div>


      {/* Cancel Subscription Modal */}
      {showCancelModal && clubToCancel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className={`
                w-full max-w-md rounded-xl shadow-xl overflow-hidden
                ${darkMode ? 'bg-slate-800' : 'bg-white'}
              `}>
                <div className={`
                  flex items-center justify-between p-6 border-b
                  ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                `}>
                  <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Cancel Subscription
                  </h2>
                  <button
                    onClick={() => setShowCancelModal(false)}
                    className={`
                      rounded-full p-2 transition-colors
                      ${darkMode 
                        ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                    `}
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6">
                  <div className="mb-6">
                    <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <AlertTriangle size={32} className="text-white" />
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 text-center ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      Are you sure?
                    </h3>
                    <p className={`text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      This will cancel the subscription for{' '}
                      <strong>{clubToCancel.club_name}</strong>.
                      All member data and history will be preserved. Members will have their
                      membership status set to cancelled and will be prompted to renew when they next log in.
                    </p>
                    <p className={`text-center text-sm mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                      You can reactivate the subscription at any time.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCancelModal(false)}
                      disabled={cancelLoading}
                      className={`
                        flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                        ${darkMode
                          ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                        ${cancelLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      Keep Subscription
                    </button>
                    <button
                      onClick={handleCancelSubscription}
                      disabled={cancelLoading}
                      className={`
                        flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors
                        ${cancelLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
};