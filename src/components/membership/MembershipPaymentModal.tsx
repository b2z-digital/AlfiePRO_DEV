import React, { useState, useEffect } from 'react';
import { X, CreditCard, DollarSign, Calendar, User, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface MembershipPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  memberId: string;
  memberName: string;
  membershipType: {
    id: string;
    name: string;
    amount: number;
    currency: string;
  };
  onPaymentComplete?: () => void;
}

export const MembershipPaymentModal: React.FC<MembershipPaymentModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  memberId,
  memberName,
  membershipType,
  onPaymentComplete
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'manual'>('stripe');

  const handleStripePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Create payment record first
      const { data: paymentData, error: paymentError } = await supabase
        .from('membership_payments')
        .insert({
          member_id: memberId,
          membership_type_id: membershipType.id,
          amount: membershipType.amount,
          currency: membershipType.currency,
          status: 'pending'
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Create Stripe checkout session
      const { data, error } = await supabase.functions.invoke('create-membership-checkout', {
        body: {
          member_id: memberId,
          membership_type_id: membershipType.id,
          payment_id: paymentData.id,
          success_url: `${window.location.origin}/membership-dashboard?payment=success`,
          cancel_url: `${window.location.origin}/membership-dashboard?payment=cancelled`
        }
      });

      if (error) throw error;

      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error creating payment:', err);
      setError(err.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const handleManualPayment = async () => {
    try {
      setLoading(true);
      setError(null);

      // Create payment record and mark as completed
      const { error: paymentError } = await supabase
        .from('membership_payments')
        .insert({
          member_id: memberId,
          membership_type_id: membershipType.id,
          amount: membershipType.amount,
          currency: membershipType.currency,
          status: 'completed',
          payment_method: 'manual'
        });

      if (paymentError) throw paymentError;

      // Update member status
      const { error: memberError } = await supabase
        .from('members')
        .update({
          is_financial: true,
          amount_paid: membershipType.amount,
          date_joined: new Date().toISOString().split('T')[0],
          renewal_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        })
        .eq('id', memberId);

      if (memberError) throw memberError;

      setSuccess(true);
      
      setTimeout(() => {
        onClose();
        if (onPaymentComplete) onPaymentComplete();
      }, 2000);
    } catch (err: any) {
      console.error('Error processing manual payment:', err);
      setError(err.message || 'Failed to process payment');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
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
            Process Payment
          </h2>
          <button
            onClick={onClose}
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
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-white" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Payment Processed!
              </h3>
              <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                {memberName}'s membership has been activated.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
                  <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                  <div>
                    <h3 className="text-red-400 font-medium">Error</h3>
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                </div>
              )}

              {/* Payment Summary */}
              <div className={`
                p-4 rounded-lg border mb-6
                ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
              `}>
                <h3 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Payment Summary
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Member:</span>
                    <span className={darkMode ? 'text-white' : 'text-slate-800'}>{memberName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Membership:</span>
                    <span className={darkMode ? 'text-white' : 'text-slate-800'}>{membershipType.name}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Amount:</span>
                    <span className={darkMode ? 'text-white' : 'text-slate-800'}>
                      ${membershipType.amount} {membershipType.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Method Selection */}
              <div className="mb-6">
                <h3 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Payment Method
                </h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setPaymentMethod('stripe')}
                    className={`
                      w-full p-4 rounded-lg border text-left transition-colors
                      ${paymentMethod === 'stripe'
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                        : darkMode
                          ? 'border-slate-600 hover:border-slate-500'
                          : 'border-slate-300 hover:border-slate-400'
                      }
                      ${darkMode ? 'bg-slate-700' : 'bg-white'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="text-blue-400" size={20} />
                      <div>
                        <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          Online Payment
                        </h4>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Pay securely with credit card via Stripe
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setPaymentMethod('manual')}
                    className={`
                      w-full p-4 rounded-lg border text-left transition-colors
                      ${paymentMethod === 'manual'
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                        : darkMode
                          ? 'border-slate-600 hover:border-slate-500'
                          : 'border-slate-300 hover:border-slate-400'
                      }
                      ${darkMode ? 'bg-slate-700' : 'bg-white'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign className="text-green-400" size={20} />
                      <div>
                        <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          Manual Payment
                        </h4>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Mark as paid (cash, bank transfer, etc.)
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className={`
                    flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                  `}
                >
                  Cancel
                </button>
                <button
                  onClick={paymentMethod === 'stripe' ? handleStripePayment : handleManualPayment}
                  disabled={loading}
                  className={`
                    flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-white
                    ${loading
                      ? 'bg-slate-600 cursor-not-allowed'
                      : paymentMethod === 'stripe'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-green-600 hover:bg-green-700'
                    }
                  `}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </div>
                  ) : paymentMethod === 'stripe' ? (
                    'Pay with Stripe'
                  ) : (
                    'Mark as Paid'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};