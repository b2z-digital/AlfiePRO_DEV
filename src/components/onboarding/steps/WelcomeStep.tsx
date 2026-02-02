import React from 'react';
import { ArrowRight, ArrowLeft, Users, Award, Calendar } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';

interface WelcomeStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack?: () => void;
  isFirstStep: boolean;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, onBack }) => {
  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 lg:p-12">
      <div className="text-center max-w-2xl mx-auto">

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4 text-white">
          Welcome to Alfie!
        </h1>

        <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 text-slate-300">
          Let's get you connected with your sailing club in just a few steps.
        </p>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-12">
          <div className="p-4 sm:p-5 md:p-6 rounded-xl bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500/10 mb-3 sm:mb-4">
              <Users className="text-blue-400" size={20} />
            </div>
            <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-white">
              Find Your Club
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Connect with your sailing club community
            </p>
          </div>

          <div className="p-4 sm:p-5 md:p-6 rounded-xl bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500/10 mb-3 sm:mb-4">
              <Award className="text-green-400" size={20} />
            </div>
            <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-white">
              Choose Membership
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Select the membership that fits you best
            </p>
          </div>

          <div className="p-4 sm:p-5 md:p-6 rounded-xl bg-slate-700/30 backdrop-blur-sm border border-slate-600/30 sm:col-span-2 md:col-span-1">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/10 mb-3 sm:mb-4">
              <Calendar className="text-purple-400" size={20} />
            </div>
            <h3 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base text-white">
              Start Racing
            </h3>
            <p className="text-xs sm:text-sm text-slate-300">
              Join races and track your performance
            </p>
          </div>
        </div>

        <div className="p-3 sm:p-4 rounded-lg bg-blue-500/10 backdrop-blur-sm border border-blue-500/20 mb-6 sm:mb-8">
          <p className="text-xs sm:text-sm text-blue-300">
            This will take about 3-5 minutes. You can save your progress and continue later.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          {onBack && (
            <button
              onClick={onBack}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all text-sm sm:text-base"
            >
              <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
              Back
            </button>
          )}
          <button
            onClick={() => onNext({})}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg text-sm sm:text-base"
          >
            Get Started
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
