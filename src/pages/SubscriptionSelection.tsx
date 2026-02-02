import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Users, Globe, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { Logo } from '../components/Logo';
import { SubscriptionTier } from '../types/subscription';
import { supabase } from '../utils/supabase';

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

export const SubscriptionSelection: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubscribe = async (tier: SubscriptionTier) => {
    try {
      setLoading(tier.id);
      setError(null);

      const { data, error } = await supabase.functions.invoke('create-alfie-checkout', {
        body: {
          subscription_type: tier.id,
          success_url: `${window.location.origin}/onboarding/success?type=${tier.id}`,
          cancel_url: `${window.location.origin}/onboarding/subscribe`
        }
      });

      if (error) throw error;

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      setError(err.message || 'Failed to create checkout session');
    } finally {
      setLoading(null);
    }
  };

  const getIcon = (tierId: string) => {
    switch (tierId) {
      case 'club':
        return <Building size={32} className="text-blue-400" />;
      case 'state_association':
        return <Users size={32} className="text-purple-400" />;
      case 'national_association':
        return <Globe size={32} className="text-green-400" />;
      default:
        return <Building size={32} className="text-blue-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      {/* Back Button - Fixed to top left */}
      <div className="fixed top-4 left-4 z-50">
        <button
          onClick={() => navigate('/settings?tab=subscriptions')}
          className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700/50"
        >
          <ArrowLeft size={18} />
          <span>Back to Settings</span>
        </button>
      </div>
      
      <div className="w-full max-w-6xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-6">
            <Logo className="w-16 h-16 relative z-10 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Choose Your Alfie PRO Subscription</h1>
          <p className="text-slate-400 text-lg">
            Select the plan that best fits your organization's needs
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {subscriptionTiers.map((tier) => (
            <div
              key={tier.id}
              className={`
                bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-8 relative
                ${tier.id === 'state_association' ? 'ring-2 ring-purple-500/50 scale-105' : ''}
                transition-all duration-300 hover:scale-105
              `}
            >
              {tier.id === 'state_association' && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-purple-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  {getIcon(tier.id)}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{tier.name}</h3>
                <p className="text-slate-400 text-sm">{tier.description}</p>
              </div>

              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-white">${tier.price}</span>
                  <span className="text-slate-400 ml-2">/{tier.interval}</span>
                </div>
                <p className="text-slate-500 text-sm mt-1">{tier.currency}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <Check size={16} className="text-green-400 flex-shrink-0" />
                    <span className="text-slate-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(tier)}
                disabled={loading === tier.id}
                className={`
                  w-full py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed
                  ${tier.id === 'state_association'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
                  }
                  ${loading === tier.id ? 'opacity-50' : ''}
                `}
              >
                {loading === tier.id ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>Get Started</span>
                    <ArrowRight size={16} />
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-slate-400 text-sm">
            All plans include a 14-day free trial. Cancel anytime.
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Prices are in Australian Dollars (AUD) and exclude GST where applicable.
          </p>
        </div>
      </div>
    </div>
  );
};