import React from 'react';
import { Building2, Users, Calendar, DollarSign, Globe, ArrowRight, ArrowLeft } from 'lucide-react';

interface ClubWelcomeStepProps {
  onNext: () => void;
  onBack?: () => void;
}

export const ClubWelcomeStep: React.FC<ClubWelcomeStepProps> = ({ onNext, onBack }) => {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center">
      <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
        <Building2 className="w-10 h-10 text-blue-400" />
      </div>

      <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
        Let's get your yacht club set up with everything you need to manage races,
        members, finances, and more. This should take about 5-10 minutes.
      </p>

      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">30</span>
          </div>
          <h3 className="text-xl font-semibold text-white">
            Day Free Trial
          </h3>
        </div>
        <p className="text-slate-300">
          Try AlfiePro risk-free for 30 days. We'll collect payment details but you
          won't be charged until your trial ends.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8 text-left">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Race Management</h4>
            <p className="text-sm text-slate-300">
              Organize races, track results, and manage series with ease
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-green-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Member Management</h4>
            <p className="text-sm text-slate-300">
              Handle memberships, applications, and member communications
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Financial Tools</h4>
            <p className="text-sm text-slate-300">
              Track payments, expenses, and generate financial reports
            </p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Globe className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white mb-1">Club Website</h4>
            <p className="text-sm text-slate-300">
              Professional website with news, results, and member portal
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700/50 pt-6 mb-6">
        <h4 className="font-semibold text-white mb-3">What You'll Need:</h4>
        <ul className="text-left text-slate-300 space-y-2 max-w-xl mx-auto">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Club name and logo
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Contact information
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Primary venue details
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Tax and financial information
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
            Payment details for trial setup
          </li>
        </ul>
      </div>

        <div className="flex items-center justify-center gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
            >
              <ArrowLeft size={20} />
              Back
            </button>
          )}
          <button
            onClick={onNext}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Let's Get Started
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-slate-400 mt-4">
          Your progress will be automatically saved
        </p>
      </div>
    </div>
  );
};
