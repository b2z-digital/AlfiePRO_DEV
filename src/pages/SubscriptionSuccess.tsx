import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';

export const SubscriptionSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userSubscription, refreshUserClubs } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptionType, setSubscriptionType] = useState<string | null>(null);

  useEffect(() => {
    const type = searchParams.get('type');
    setSubscriptionType(type);

    // Wait a moment for webhook to process, then refresh user data
    const timer = setTimeout(async () => {
      await refreshUserClubs();
      setLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [searchParams, refreshUserClubs]);

  const handleContinue = () => {
    navigate('/onboarding/create-organization');
  };

  const getSubscriptionName = (type: string | null) => {
    switch (type) {
      case 'club':
        return 'Club Subscription';
      case 'state_association':
        return 'State Association Subscription';
      case 'national_association':
        return 'National Association Subscription';
      default:
        return 'Subscription';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <Logo className="w-16 h-16 relative z-10 text-blue-400" />
          </div>

          <div className="mb-6">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-slate-400">
              Thank you for subscribing to {getSubscriptionName(subscriptionType)}
            </p>
          </div>

          {loading ? (
            <div className="mb-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-sm">
                Setting up your account...
              </p>
            </div>
          ) : userSubscription ? (
            <div className="mb-8">
              <div className="bg-slate-700/50 rounded-lg p-4 mb-4">
                <p className="text-slate-300 text-sm">
                  <strong>Subscription:</strong> {getSubscriptionName(userSubscription.subscription_type)}
                </p>
                <p className="text-slate-300 text-sm">
                  <strong>Status:</strong> {userSubscription.status}
                </p>
                {userSubscription.current_period_end && (
                  <p className="text-slate-300 text-sm">
                    <strong>Next billing:</strong> {new Date(userSubscription.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <p className="text-slate-400 text-sm mb-6">
                Your subscription is now active. Let's set up your organization.
              </p>
            </div>
          ) : (
            <div className="mb-8">
              <p className="text-amber-400 text-sm">
                We're still processing your payment. This may take a few moments.
              </p>
            </div>
          )}

          <button
            onClick={handleContinue}
            disabled={loading || !userSubscription}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Please wait...</span>
              </>
            ) : (
              <>
                <span>Continue Setup</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="text-slate-500 text-xs mt-4">
            Need help? Contact our support team at support@alfiepro.com
          </p>
        </div>
      </div>
    </div>
  );
};