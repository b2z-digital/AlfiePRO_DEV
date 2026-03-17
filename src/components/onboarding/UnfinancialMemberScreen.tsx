import React, { useState, useEffect } from 'react';
import { CircleAlert as AlertCircle, CreditCard, LogOut, ArrowRight, Building2, Clock, DollarSign, Loader as Loader2, Check, TriangleAlert as AlertTriangle, Banknote, Gift } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UnfinancialMemberData {
  member_id: string;
  club_id: string;
  club_name: string;
  membership_level: string | null;
  is_new_member: boolean;
  renewal_date: string | null;
  date_joined: string | null;
}

interface MembershipType {
  id: string;
  name: string;
  amount: number;
  currency: string;
  description: string | null;
  renewal_period: string;
}

interface MidCycleCredit {
  credit_id: string;
  credit_amount: number;
  membership_year_paid: number;
  notes: string;
}

interface UnfinancialMemberScreenProps {
  memberData: UnfinancialMemberData;
  darkMode?: boolean;
}

export const UnfinancialMemberScreen: React.FC<UnfinancialMemberScreenProps> = ({
  memberData,
}) => {
  const { user } = useAuth();
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedType, setSelectedType] = useState<MembershipType | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'bank_transfer'>('stripe');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubHasStripe, setClubHasStripe] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [midCycleCredit, setMidCycleCredit] = useState<MidCycleCredit | null>(null);

  useEffect(() => {
    loadMembershipTypes();
  }, [memberData.club_id]);

  const loadMembershipTypes = async () => {
    try {
      setLoading(true);
      const [typesResult, clubResult] = await Promise.all([
        supabase
          .from('membership_types')
          .select('id, name, amount, currency, description, renewal_period')
          .eq('club_id', memberData.club_id)
          .eq('is_active', true)
          .order('amount'),
        supabase
          .from('clubs')
          .select('stripe_account_id')
          .eq('id', memberData.club_id)
          .maybeSingle()
      ]);

      if (typesResult.data) {
        setMembershipTypes(typesResult.data);
        if (memberData.membership_level) {
          const match = typesResult.data.find(
            (t: MembershipType) => t.name.toLowerCase() === memberData.membership_level?.toLowerCase()
          );
          if (match) setSelectedType(match);
        }
      }
      setClubHasStripe(!!clubResult.data?.stripe_account_id);

      if (!memberData.is_new_member) {
        const now = new Date();
        const renewalYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
        try {
          const { data: creditData } = await supabase
            .rpc('get_pending_mid_cycle_credit', {
              p_member_id: memberData.member_id,
              p_club_id: memberData.club_id,
              p_renewal_year: renewalYear
            });
          if (creditData && creditData.length > 0) {
            setMidCycleCredit(creditData[0]);
          }
        } catch (err) {
          console.error('Error checking mid-cycle credit:', err);
        }
      }
    } catch (err) {
      console.error('Error loading membership types:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEffectiveAmount = () => {
    if (!selectedType) return 0;
    const credit = midCycleCredit?.credit_amount || 0;
    return Math.max(0, selectedType.amount - credit);
  };

  const handlePayment = async () => {
    if (!selectedType) return;

    const effectiveAmount = getEffectiveAmount();

    try {
      setProcessing(true);
      setError(null);

      if (paymentMethod === 'stripe' && clubHasStripe && effectiveAmount > 0) {
        const { data: paymentData, error: paymentError } = await supabase
          .from('membership_payments')
          .insert({
            member_id: memberData.member_id,
            membership_type_id: selectedType.id,
            amount: effectiveAmount,
            currency: selectedType.currency,
            status: 'pending'
          })
          .select()
          .single();

        if (paymentError) throw paymentError;

        if (midCycleCredit) {
          await supabase.rpc('apply_mid_cycle_credit', {
            p_credit_id: midCycleCredit.credit_id,
            p_applied_remittance_id: null
          });
        }

        const { data, error: checkoutError } = await supabase.functions.invoke('create-membership-checkout', {
          body: {
            member_id: memberData.member_id,
            membership_type_id: selectedType.id,
            payment_id: paymentData.id,
            success_url: `${window.location.origin}/?payment=success`,
            cancel_url: `${window.location.origin}/?payment=cancelled`
          }
        });

        if (checkoutError) throw checkoutError;
        if (data?.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }
      }

      if (paymentMethod === 'bank_transfer' || effectiveAmount === 0) {
        const { error: paymentError } = await supabase
          .from('membership_payments')
          .insert({
            member_id: memberData.member_id,
            membership_type_id: selectedType.id,
            amount: effectiveAmount,
            currency: selectedType.currency,
            status: effectiveAmount === 0 ? 'completed' : 'pending',
            payment_method: effectiveAmount === 0 ? 'free' : 'bank_transfer'
          });

        if (paymentError) throw paymentError;

        if (midCycleCredit) {
          await supabase.rpc('apply_mid_cycle_credit', {
            p_credit_id: midCycleCredit.credit_id,
            p_applied_remittance_id: null
          });
        }

        if (effectiveAmount === 0) {
          const renewalDate = new Date();
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);

          await supabase
            .from('members')
            .update({
              is_financial: true,
              amount_paid: 0,
              membership_level: selectedType.name,
              renewal_date: renewalDate.toISOString().split('T')[0]
            })
            .eq('id', memberData.member_id);
        }

        setSuccess(true);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
        return;
      }
    } catch (err: any) {
      console.error('Error processing payment:', err);
      setError(err.message || 'Failed to process payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const isRenewal = !memberData.is_new_member && memberData.renewal_date;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">
            {memberData.is_new_member ? 'Complete Your Membership' : 'Membership Payment Required'}
          </h1>
          <p className="text-slate-400 text-base leading-relaxed">
            {memberData.is_new_member
              ? `Welcome to ${memberData.club_name}! Please complete your membership payment to access the platform.`
              : `Your membership at ${memberData.club_name} requires payment to continue accessing the platform.`
            }
          </p>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">{memberData.club_name}</p>
              {memberData.membership_level && (
                <p className="text-slate-400 text-sm mt-0.5 capitalize">
                  {memberData.membership_level}
                </p>
              )}
              {memberData.date_joined && (
                <p className="text-slate-500 text-xs mt-1">
                  Joined {formatDate(memberData.date_joined)}
                </p>
              )}
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-900/30 text-amber-400 flex-shrink-0">
              Unfinancial
            </span>
          </div>
        </div>

        {success ? (
          <div className="bg-slate-800/40 border border-emerald-500/30 rounded-xl p-8 mb-6 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">
              {paymentMethod === 'bank_transfer' ? 'Payment Pending' : 'Payment Complete'}
            </h3>
            <p className="text-slate-400 text-sm">
              {paymentMethod === 'bank_transfer'
                ? 'Your bank transfer has been recorded. Your club will confirm once payment is received.'
                : 'Your membership has been activated. Redirecting...'
              }
            </p>
          </div>
        ) : !showPaymentOptions ? (
          <>
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 mb-6">
              <h3 className="text-white font-medium mb-3">
                {memberData.is_new_member ? 'How it works' : 'What you need to do'}
              </h3>
              <ul className="space-y-2.5 text-sm text-slate-400">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">1</span>
                  {isRenewal ? 'Select your membership type for renewal' : 'Choose your membership type'}
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">2</span>
                  Make payment via card or bank transfer
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">3</span>
                  Full platform access is restored once payment is confirmed
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setShowPaymentOptions(true)}
                className="w-full py-3.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/30"
              >
                <CreditCard className="w-5 h-5" />
                {isRenewal ? 'Renew Membership' : 'Make Payment'}
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={handleSignOut}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        ) : (
          <>
            {error && (
              <div className="mb-4 p-4 rounded-xl bg-red-900/20 border border-red-900/30 flex items-start gap-3">
                <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              </div>
            ) : membershipTypes.length === 0 ? (
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 mb-6 text-center">
                <p className="text-slate-400 text-sm">
                  No membership types are available. Please contact your club administrator.
                </p>
              </div>
            ) : (
              <>
                {midCycleCredit && (
                  <div className="mb-4 p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/40 flex items-start gap-3">
                    <Gift className="text-emerald-400 mt-0.5 flex-shrink-0" size={18} />
                    <div>
                      <p className="text-emerald-300 font-medium text-sm">State Fee Credit Available</p>
                      <p className="text-emerald-400/80 text-xs mt-1">
                        Your state association fee of ${midCycleCredit.credit_amount.toFixed(2)} was already paid when you joined mid-cycle.
                        This amount will be deducted from your renewal fee.
                      </p>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Select Membership</p>
                  <div className="space-y-2">
                    {membershipTypes.map((type) => {
                      const creditAmount = midCycleCredit?.credit_amount || 0;
                      const adjustedAmount = Math.max(0, type.amount - creditAmount);
                      const hasCredit = creditAmount > 0 && type.amount > 0;

                      return (
                        <button
                          key={type.id}
                          onClick={() => setSelectedType(type)}
                          className={`w-full p-4 rounded-xl border text-left transition-all ${
                            selectedType?.id === type.id
                              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
                              : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium">{type.name}</p>
                              {type.description && (
                                <p className="text-slate-400 text-xs mt-0.5">{type.description}</p>
                              )}
                              <p className="text-slate-500 text-xs mt-1 capitalize">{type.renewal_period} renewal</p>
                            </div>
                            <div className="text-right">
                              {hasCredit ? (
                                <>
                                  <p className="text-slate-500 text-sm line-through">${type.amount.toFixed(2)}</p>
                                  <p className="text-emerald-400 font-bold text-lg">
                                    {adjustedAmount === 0 ? 'Free' : `$${adjustedAmount.toFixed(2)}`}
                                  </p>
                                  <p className="text-emerald-500/70 text-[10px]">-${creditAmount.toFixed(2)} credit</p>
                                </>
                              ) : (
                                <p className="text-white font-bold text-lg">
                                  {type.amount === 0 ? 'Free' : `$${type.amount.toFixed(2)}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedType && getEffectiveAmount() > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Payment Method</p>
                    <div className="space-y-2">
                      {clubHasStripe && (
                        <button
                          onClick={() => setPaymentMethod('stripe')}
                          className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${
                            paymentMethod === 'stripe'
                              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
                              : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
                          }`}
                        >
                          <CreditCard className="text-blue-400 flex-shrink-0" size={20} />
                          <div>
                            <p className="text-white font-medium">Pay by Card</p>
                            <p className="text-slate-400 text-xs">Secure payment via Stripe</p>
                          </div>
                        </button>
                      )}
                      <button
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-3 ${
                          paymentMethod === 'bank_transfer'
                            ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
                            : 'border-slate-700/60 bg-slate-800/40 hover:border-slate-600'
                        }`}
                      >
                        <Banknote className="text-emerald-400 flex-shrink-0" size={20} />
                        <div>
                          <p className="text-white font-medium">Bank Transfer</p>
                          <p className="text-slate-400 text-xs">Pay via bank transfer and notify your club</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 mt-6">
                  <button
                    onClick={handlePayment}
                    disabled={!selectedType || processing}
                    className="w-full py-3.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <DollarSign className="w-5 h-5" />
                        {getEffectiveAmount() === 0 ? 'Activate Free Membership' :
                          paymentMethod === 'bank_transfer' ? 'Record Bank Transfer' : `Pay $${getEffectiveAmount().toFixed(2)}`
                        }
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setShowPaymentOptions(false)}
                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-center text-slate-600 text-xs mt-6">
          If you believe this is an error, please contact your club administrator.
        </p>
      </div>
    </div>
  );
};
