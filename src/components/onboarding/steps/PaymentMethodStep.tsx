import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowLeft, CreditCard, Building2, Check } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';

interface PaymentMethodStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

export const PaymentMethodStep: React.FC<PaymentMethodStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>(
    formData.paymentMethod || 'bank_transfer'
  );
  const [bankDetails, setBankDetails] = useState({
    bank_name: '',
    bsb: '',
    account_number: '',
  });
  const [stripeEnabled, setStripeEnabled] = useState(false);

  useEffect(() => {
    fetchClubBankDetails();
  }, [formData.clubId]);

  const fetchClubBankDetails = async () => {
    if (!formData.clubId) return;

    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('bank_name, bsb, account_number, stripe_account_id')
        .eq('id', formData.clubId)
        .single();

      if (error) throw error;

      if (data) {
        setBankDetails({
          bank_name: data.bank_name || 'Not specified',
          bsb: data.bsb || 'Not specified',
          account_number: data.account_number || 'Not specified',
        });
        setStripeEnabled(!!data.stripe_account_id);
      }
    } catch (error) {
      console.error('Error fetching bank details:', error);
    }
  };

  const handleContinue = () => {
    onNext({
      paymentMethod,
    });
  };

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-3xl mx-auto">
        <h2 className={`text-xl sm:text-2xl font-bold mb-1 sm:mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Payment Method
        </h2>
        <p className={`mb-4 sm:mb-6 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          How would you like to pay your membership fee?
        </p>

        <div className="space-y-3 sm:space-y-4">
          {stripeEnabled && (
            <button
              onClick={() => setPaymentMethod('card')}
              className={`w-full p-4 sm:p-5 md:p-6 rounded-xl transition-all text-left ${
                paymentMethod === 'card'
                  ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl'
                  : darkMode
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'card' ? 'bg-white/20' : 'bg-green-500/10'
                  }`}>
                    <CreditCard className={`w-5 h-5 sm:w-6 sm:h-6 ${paymentMethod === 'card' ? 'text-white' : 'text-blue-500'}`} />
                  </div>

                  <div>
                    <h3 className="font-semibold text-base sm:text-lg mb-0.5 sm:mb-1">Pay Online Now</h3>
                    <p className={`text-xs sm:text-sm ${
                      paymentMethod === 'card' ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Quick & secure card payment via Stripe
                    </p>
                    <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                      <span className={`text-xs px-2 py-0.5 sm:py-1 rounded ${
                        paymentMethod === 'card' ? 'bg-white/20' : 'bg-green-500/10 text-green-600'
                      }`}>
                        Instant Approval
                      </span>
                      <span className={`text-xs px-2 py-0.5 sm:py-1 rounded ${
                        paymentMethod === 'card' ? 'bg-white/20' : 'bg-green-500/10 text-blue-600'
                      }`}>
                        Secure
                      </span>
                    </div>
                  </div>
                </div>

                {paymentMethod === 'card' && (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Check className="text-white w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                )}
              </div>
            </button>
          )}

          <button
            onClick={() => setPaymentMethod('bank_transfer')}
            className={`w-full p-4 sm:p-5 md:p-6 rounded-xl transition-all text-left ${
              paymentMethod === 'bank_transfer'
                ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl'
                : darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  paymentMethod === 'bank_transfer' ? 'bg-white/20' : 'bg-green-500/10'
                }`}>
                  <Building2 className={`w-5 h-5 sm:w-6 sm:h-6 ${paymentMethod === 'bank_transfer' ? 'text-white' : 'text-green-500'}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base sm:text-lg mb-0.5 sm:mb-1">Bank Transfer</h3>
                  <p className={`text-xs sm:text-sm mb-2 sm:mb-3 ${
                    paymentMethod === 'bank_transfer' ? 'text-blue-100' : darkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Pay via direct deposit to club account
                  </p>

                  <div className={`text-xs sm:text-sm space-y-0.5 sm:space-y-1 ${
                    paymentMethod === 'bank_transfer' ? 'text-white' : darkMode ? 'text-slate-300' : 'text-slate-700'
                  }`}>
                    <div className="flex gap-2">
                      <span className="font-medium min-w-[70px] sm:min-w-[100px]">Bank:</span>
                      <span className="break-all">{bankDetails.bank_name}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium min-w-[70px] sm:min-w-[100px]">BSB:</span>
                      <span>{bankDetails.bsb}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium min-w-[70px] sm:min-w-[100px]">Account:</span>
                      <span className="break-all">{bankDetails.account_number}</span>
                    </div>
                  </div>
                </div>
              </div>

              {paymentMethod === 'bank_transfer' && (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Check className="text-white w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              )}
            </div>
          </button>
        </div>

        {paymentMethod === 'bank_transfer' && (
          <div className={`mt-3 sm:mt-4 p-3 sm:p-4 rounded-lg ${
            darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
          }`}>
            <p className={`text-xs sm:text-sm ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
              Your application will be reviewed once payment is received. Please use your name as the reference.
            </p>
          </div>
        )}

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
          <button
            onClick={onBack}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            Back
          </button>

          <button
            onClick={handleContinue}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-lg text-sm sm:text-base"
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
