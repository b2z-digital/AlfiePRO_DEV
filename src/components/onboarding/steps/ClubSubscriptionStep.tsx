import React from 'react';
import { ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

interface ClubSubscriptionStepProps {
  selectedPlan?: string;
  onSelectPlan: (plan: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const PLANS = [
  {
    id: 'club',
    name: 'Club',
    price: 49,
    description: 'Perfect for individual yacht clubs',
    features: [
      'Up to 200 members',
      'Unlimited races and events',
      'Race management & scoring',
      'Member portal',
      'Financial management',
      'Communications tools',
      'Club website builder',
      'Email support',
    ],
    popular: true,
  },
  {
    id: 'state',
    name: 'State Association',
    price: 149,
    description: 'For state-level sailing associations',
    features: [
      'Up to 1,000 members',
      'Multiple club management',
      'State-wide event calendar',
      'Championship series',
      'Advanced reporting',
      'Custom branding',
      'Priority support',
      'API access',
    ],
    popular: false,
  },
  {
    id: 'national',
    name: 'National Association',
    price: 399,
    description: 'For national sailing organizations',
    features: [
      'Unlimited members',
      'Multi-tier organization',
      'National championships',
      'Advanced analytics',
      'White-label solution',
      'Dedicated support',
      'Custom integrations',
      'Training & onboarding',
    ],
    popular: false,
  },
];

export const ClubSubscriptionStep: React.FC<ClubSubscriptionStepProps> = ({
  selectedPlan,
  onSelectPlan,
  onNext,
  onBack,
}) => {
  const handleNext = () => {
    if (selectedPlan) {
      onNext();
    }
  };

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h2>
        <p className="text-slate-300 mb-4">
          Select the plan that best fits your organization
        </p>

        <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-full border border-green-500/30">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">30-Day Free Trial</span>
        </div>
        <p className="text-sm text-slate-300 mt-2">
          No payment required today. We'll collect payment details but you won't be
          charged until your trial ends.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            onClick={() => onSelectPlan(plan.id)}
            className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
              selectedPlan === plan.id
                ? 'border-emerald-500 bg-emerald-900/30'
                : 'border-slate-700 hover:border-emerald-500 bg-slate-800/50'
            } ${plan.popular ? 'mt-8' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  MOST POPULAR
                </span>
              </div>
            )}

            <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
              <div className="mb-2">
                <span className="text-3xl font-bold text-white">${plan.price}</span>
                <span className="text-slate-300">/month</span>
              </div>
              <p className="text-sm text-slate-300">{plan.description}</p>
            </div>

            <ul className="space-y-3 mb-6">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={`w-full py-2 rounded-lg font-medium transition-colors ${
                selectedPlan === plan.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-blue-50/10 border border-blue-200/20 rounded-lg p-4 mb-6">
        <h4 className="font-semibold text-blue-300 mb-2">What happens next?</h4>
        <ol className="text-sm text-slate-300 space-y-2 ml-4">
          <li>1. Complete your club setup and review</li>
          <li>2. Enter payment details (won't be charged yet)</li>
          <li>3. Start your 30-day free trial immediately</li>
          <li>4. Get full access to all features during trial</li>
          <li>5. Cancel anytime during the trial at no cost</li>
        </ol>
      </div>

      <div className="text-center text-sm text-slate-300 mb-6">
        <p>
          Need help choosing?{' '}
          <a href="#" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Compare all plans
          </a>
        </p>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!selectedPlan}
          className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all transform shadow-lg ${
            selectedPlan
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 hover:scale-105'
              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          Continue to Review
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
