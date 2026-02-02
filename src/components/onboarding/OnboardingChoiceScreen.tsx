import React from 'react';
import { Users, Building2, ArrowRight, Check } from 'lucide-react';
import { Logo } from '../Logo';

interface OnboardingChoiceScreenProps {
  onSelectJoinClub: () => void;
  onSelectStartClub: () => void;
}

export const OnboardingChoiceScreen: React.FC<OnboardingChoiceScreenProps> = ({
  onSelectJoinClub,
  onSelectStartClub,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-6xl w-full">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <Logo size="large" />
            <h1 className="text-3xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>
        </div>

        <div className="text-center mb-12">
          <p className="text-xl text-slate-300">
            Let's get you started. What would you like to do?
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div
            onClick={onSelectJoinClub}
            className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-slate-700 hover:border-blue-500 p-8 group"
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6 group-hover:bg-blue-500 transition-colors">
                <Users className="w-10 h-10 text-blue-600 group-hover:text-white transition-colors" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">
                Join an Existing Club
              </h2>

              <p className="text-slate-300 mb-6 leading-relaxed">
                Already a member of a yacht club? Join your club to access races,
                events, and connect with fellow sailors.
              </p>

              <div className="space-y-3 mb-8 text-left w-full">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Find and join your club</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Register your boats</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">View race results and standings</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Access member benefits</span>
                </div>
              </div>

              <button className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 group-hover:bg-blue-700">
                Get Started
                <ArrowRight className="w-5 h-5" />
              </button>

              <p className="text-sm text-slate-400 mt-4">
                Takes about 3-5 minutes
              </p>
            </div>
          </div>

          <div
            onClick={onSelectStartClub}
            className="bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border-2 border-slate-700 hover:border-emerald-500 p-8 group relative overflow-hidden"
          >
            <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              30-DAY FREE TRIAL
            </div>

            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 group-hover:bg-emerald-500 transition-colors">
                <Building2 className="w-10 h-10 text-emerald-600 group-hover:text-white transition-colors" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">
                Start Your Own Club
              </h2>

              <p className="text-slate-300 mb-6 leading-relaxed">
                Setting up a new yacht club? Get everything you need to manage
                races, members, and events professionally.
              </p>

              <div className="space-y-3 mb-8 text-left w-full">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Complete race management system</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Member & financial management</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Professional club website</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-200">Communications & notifications</span>
                </div>
              </div>

              <button className="w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 group-hover:bg-emerald-700">
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </button>

              <p className="text-sm text-slate-400 mt-4">
                Takes about 5-10 minutes • No credit card required
              </p>
            </div>
          </div>
        </div>

        <div className="text-center mt-8 text-slate-300">
          <p className="text-sm">
            Not sure which option is right for you?{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              Contact our support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
