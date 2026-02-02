import React from 'react';
import { createPortal } from 'react-dom';
import { X, CreditCard, Link2, Info } from 'lucide-react';

interface StripeConnectionChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectConnectionType: (type: 'oauth' | 'express') => void;
  darkMode: boolean;
}

export const StripeConnectionChoiceModal: React.FC<StripeConnectionChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectConnectionType,
  darkMode
}) => {
  if (!isOpen) return null;

  const handleChoice = (type: 'oauth' | 'express') => {
    onSelectConnectionType(type);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div
        className={`${
          darkMode ? 'bg-slate-800' : 'bg-white'
        } rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className={`sticky top-0 ${darkMode ? 'bg-slate-800' : 'bg-white'} border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'} px-6 py-4 flex items-center justify-between z-10`}>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Connect Stripe Payment Account
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info Banner */}
          <div className={`mb-6 p-4 rounded-lg border ${
            darkMode
              ? 'bg-blue-500/10 border-blue-500/30'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex gap-3">
              <Info className={`${darkMode ? 'text-blue-400' : 'text-blue-600'} flex-shrink-0 mt-0.5`} size={20} />
              <div className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                <p className="font-medium mb-1">Choose how to connect your club's Stripe account</p>
                <p>All payments go directly to your club - AlfiePRO does not take any platform fees.</p>
              </div>
            </div>
          </div>

          {/* Choice Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Existing Account Option */}
            <button
              onClick={() => handleChoice('oauth')}
              className={`group relative p-6 rounded-xl border-2 transition-all text-left hover:scale-[1.02] ${
                darkMode
                  ? 'border-slate-600 hover:border-blue-500 bg-slate-800/50'
                  : 'border-gray-200 hover:border-blue-500 bg-white'
              }`}
            >
              <div className={`absolute top-4 right-4 w-3 h-3 rounded-full ${
                darkMode ? 'bg-green-400' : 'bg-green-500'
              } opacity-0 group-hover:opacity-100 transition-opacity`} />

              <div className={`w-12 h-12 rounded-lg ${
                darkMode ? 'bg-blue-500/20' : 'bg-blue-100'
              } flex items-center justify-center mb-4`}>
                <Link2 className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
              </div>

              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Connect Existing Account
              </h3>

              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Already have a Stripe account? Link it to your club.
              </p>

              <div className={`space-y-2 text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Use your existing Stripe account</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Full control over your account</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Keep existing payment history</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Can disconnect anytime</span>
                </div>
              </div>

              <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-medium ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                  Best for clubs with existing Stripe accounts
                </p>
              </div>
            </button>

            {/* New Account Option */}
            <button
              onClick={() => handleChoice('express')}
              className={`group relative p-6 rounded-xl border-2 transition-all text-left hover:scale-[1.02] ${
                darkMode
                  ? 'border-slate-600 hover:border-blue-500 bg-slate-800/50'
                  : 'border-gray-200 hover:border-blue-500 bg-white'
              }`}
            >
              <div className={`absolute top-4 right-4 px-2 py-1 rounded text-xs font-medium ${
                darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
              }`}>
                Recommended
              </div>

              <div className={`w-12 h-12 rounded-lg ${
                darkMode ? 'bg-green-500/20' : 'bg-green-100'
              } flex items-center justify-center mb-4`}>
                <CreditCard className={darkMode ? 'text-green-400' : 'text-green-600'} size={24} />
              </div>

              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Create New Account
              </h3>

              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Quick setup with a new Stripe account managed through AlfiePRO.
              </p>

              <div className={`space-y-2 text-sm ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Fast 5-minute setup</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Simplified onboarding process</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Platform support for setup</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className={darkMode ? 'text-green-400' : 'text-green-600'}>✓</span>
                  <span>Start accepting payments today</span>
                </div>
              </div>

              <div className={`mt-4 pt-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-medium ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                  Best for clubs new to Stripe
                </p>
              </div>
            </button>
          </div>

          {/* Additional Info */}
          <div className={`mt-6 p-4 rounded-lg ${
            darkMode ? 'bg-slate-700/50' : 'bg-gray-50'
          }`}>
            <h4 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              What happens next?
            </h4>
            <ul className={`space-y-2 text-sm ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              <li className="flex items-start gap-2">
                <span className="font-bold">1.</span>
                <span>You'll be redirected to Stripe to complete setup</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">2.</span>
                <span>Provide your business details and bank account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">3.</span>
                <span>Return to AlfiePRO and start accepting payments</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className={`sticky bottom-0 ${darkMode ? 'bg-slate-800' : 'bg-white'} border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'} px-6 py-4`}>
          <button
            onClick={onClose}
            className={`w-full px-4 py-2 rounded-lg transition-colors ${
              darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
