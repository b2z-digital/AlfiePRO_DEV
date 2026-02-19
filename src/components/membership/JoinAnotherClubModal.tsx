import React, { useState, useEffect } from 'react';
import {
  X, Search, MapPin, Sailboat, CheckCircle2, AlertCircle, Loader2,
  CreditCard, Building2, Crown, Users, Copy, Check
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface Club {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  state_association_id: string | null;
  state_associations: {
    name: string;
    abbreviation: string;
  } | null;
}

interface MembershipType {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
}

interface FeeBreakdown {
  clubFee: number;
  stateFee: number;
  nationalFee: number;
  total: number;
  relationshipType: string;
}

interface BankDetails {
  bank_name: string;
  bsb: string;
  account_number: string;
}

interface JoinAnotherClubModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const JoinAnotherClubModal: React.FC<JoinAnotherClubModalProps> = ({
  darkMode,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<'search' | 'preview' | 'applying'>('search');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMemberships, setCurrentMemberships] = useState<string[]>([]);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<string>('');
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>('bank_transfer');
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [bankDetails, setBankDetails] = useState<BankDetails>({ bank_name: '', bsb: '', account_number: '' });
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    fetchClubs();
    fetchCurrentMemberships();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredClubs(clubs);
    } else {
      const filtered = clubs.filter(club =>
        club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        club.abbreviation?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredClubs(filtered);
    }
  }, [searchTerm, clubs]);

  const fetchClubs = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select(`
          id, name, abbreviation, logo, state_association_id,
          state_associations:state_association_id ( name, abbreviation )
        `)
        .order('name');

      if (error) throw error;
      setClubs(data || []);
      setFilteredClubs(data || []);
    } catch (err) {
      console.error('Error fetching clubs:', err);
      addNotification('error', 'Failed to load clubs');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentMemberships = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('club_memberships')
        .select('club_id')
        .eq('member_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setCurrentMemberships(data?.map(m => m.club_id) || []);
    } catch (err) {
      console.error('Error fetching memberships:', err);
    }
  };

  const handleSelectClub = async (club: Club) => {
    setSelectedClub(club);
    setStep('preview');
    await fetchClubDetailsAndFees(club.id);
  };

  const fetchClubDetailsAndFees = async (clubId: string) => {
    try {
      const [typesResult, clubResult] = await Promise.all([
        supabase
          .from('membership_types')
          .select('*')
          .eq('club_id', clubId)
          .eq('is_active', true)
          .order('amount'),
        supabase
          .from('clubs')
          .select('bank_name, bsb, account_number, stripe_account_id, state_association_id')
          .eq('id', clubId)
          .maybeSingle()
      ]);

      if (typesResult.error) throw typesResult.error;

      const types = typesResult.data || [];
      setMembershipTypes(types);

      if (clubResult.data) {
        setBankDetails({
          bank_name: clubResult.data.bank_name || '',
          bsb: clubResult.data.bsb || '',
          account_number: clubResult.data.account_number || '',
        });
        const hasStripe = !!clubResult.data.stripe_account_id;
        setStripeEnabled(hasStripe);
        if (hasStripe) {
          setPaymentMethod('card');
        } else {
          setPaymentMethod('bank_transfer');
        }
      }

      if (types.length > 0) {
        setSelectedMembershipType(types[0].id);
        await calculateFees(clubId, types[0]);
      }
    } catch (err) {
      console.error('Error fetching club details:', err);
    }
  };

  const calculateFees = async (clubId: string, membershipType: MembershipType) => {
    if (!user) return;

    try {
      const clubFee = parseFloat(String(membershipType.amount || '0'));
      let stateFee = 0;
      let nationalFee = 0;
      const isAssociate = currentMemberships.length > 0;

      if (!isAssociate) {
        const { data: club } = await supabase
          .from('clubs')
          .select('state_association_id')
          .eq('id', clubId)
          .maybeSingle();

        if (club?.state_association_id) {
          const [stateResult, nationalResult] = await Promise.all([
            supabase
              .from('state_association_club_fees')
              .select('club_fee_amount')
              .eq('state_association_id', club.state_association_id)
              .lte('effective_from', new Date().toISOString())
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('national_association_state_fees')
              .select('state_fee_amount')
              .eq('state_association_id', club.state_association_id)
              .lte('effective_from', new Date().toISOString())
              .order('effective_from', { ascending: false })
              .limit(1)
              .maybeSingle()
          ]);

          stateFee = parseFloat(stateResult.data?.club_fee_amount || '0');
          nationalFee = parseFloat(nationalResult.data?.state_fee_amount || '0');
        }
      }

      setFeeBreakdown({
        clubFee,
        stateFee,
        nationalFee,
        total: clubFee + stateFee + nationalFee,
        relationshipType: isAssociate ? 'associate' : 'primary'
      });
    } catch (err) {
      console.error('Error calculating fees:', err);
    }
  };

  const handleMembershipTypeChange = (typeId: string) => {
    setSelectedMembershipType(typeId);
    const type = membershipTypes.find(t => t.id === typeId);
    if (type && selectedClub) {
      calculateFees(selectedClub.id, type);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleApply = async () => {
    if (!user || !selectedClub || !selectedMembershipType) return;

    setStep('applying');

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();

      const nameParts = (profile?.full_name || '').split(' ');
      const firstName = nameParts[0] || user.user_metadata?.first_name || '';
      const lastName = nameParts.slice(1).join(' ') || user.user_metadata?.last_name || '';

      const { data: existingMember } = await supabase
        .from('members')
        .select('first_name, last_name, phone, street, city, state, postcode, avatar_url')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      const selectedType = membershipTypes.find(t => t.id === selectedMembershipType);

      const applicationData: Record<string, any> = {
        club_id: selectedClub.id,
        user_id: user.id,
        membership_type_id: selectedMembershipType,
        membership_type_name: selectedType?.name || '',
        membership_amount: selectedType ? parseFloat(String(selectedType.amount || '0')) : 0,
        status: 'pending',
        is_draft: false,
        first_name: existingMember?.first_name || firstName,
        last_name: existingMember?.last_name || lastName,
        email: user.email,
        phone: existingMember?.phone || '',
        payment_method: paymentMethod,
        street: existingMember?.street || '',
        city: existingMember?.city || '',
        state: existingMember?.state || '',
        postcode: existingMember?.postcode || '',
        avatar_url: existingMember?.avatar_url || '',
        application_data: {
          application_type: 'additional_club',
          has_existing_membership: currentMemberships.length > 0,
          should_pay_association_fees: currentMemberships.length === 0,
          relationship_type: currentMemberships.length > 0 ? 'associate' : 'primary',
          fee_breakdown: feeBreakdown,
        }
      };

      const { error } = await supabase
        .from('membership_applications')
        .insert(applicationData);

      if (error) throw error;

      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-membership-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            email_type: 'application_received',
            recipient_email: user.email,
            member_data: {
              first_name: existingMember?.first_name || firstName,
              last_name: existingMember?.last_name || lastName,
              club_name: selectedClub.name,
              payment_method: paymentMethod,
              bank_name: bankDetails.bank_name,
              bsb: bankDetails.bsb,
              account_number: bankDetails.account_number,
            }
          })
        });
      } catch {
        // non-critical
      }

      addNotification('success', `Application submitted to ${selectedClub.name}! You'll be notified once it's reviewed.`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error submitting application:', err);
      addNotification('error', err.message || 'Failed to submit application');
      setStep('preview');
    }
  };

  const hasBankDetails = bankDetails.bank_name || bankDetails.bsb || bankDetails.account_number;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col bg-slate-800 border border-slate-700 shadow-2xl">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-600 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/15">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Join Another Club</h2>
              {step === 'search' && (
                <p className="text-sm text-white/70">Search for clubs and submit an application</p>
              )}
              {step === 'preview' && selectedClub && (
                <p className="text-sm text-white/70">Review and submit your application to {selectedClub.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/15 transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search clubs by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border bg-slate-700/50 border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : filteredClubs.length === 0 ? (
                <div className="text-center py-12">
                  <Sailboat className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400">No clubs found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredClubs.map((club) => {
                    const alreadyMember = currentMemberships.includes(club.id);
                    return (
                      <button
                        key={club.id}
                        disabled={alreadyMember}
                        className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                          alreadyMember
                            ? 'border-slate-700/50 bg-slate-800/30 opacity-50 cursor-not-allowed'
                            : 'border-slate-700 bg-slate-800/40 hover:border-blue-500/50 hover:bg-slate-700/40 cursor-pointer'
                        }`}
                        onClick={() => !alreadyMember && handleSelectClub(club)}
                      >
                        <div className="flex items-start gap-3">
                          {club.logo ? (
                            <img src={club.logo} alt={club.name} className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-600/50 flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-slate-700/50 border border-slate-600/30 flex items-center justify-center flex-shrink-0">
                              <Sailboat className="w-6 h-6 text-slate-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white truncate">{club.name}</h3>
                            {club.abbreviation && (
                              <p className="text-sm text-slate-400">{club.abbreviation}</p>
                            )}
                            {club.state_associations && (
                              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {club.state_associations.name}
                              </p>
                            )}
                            {alreadyMember && (
                              <div className="flex items-center mt-2 text-green-400 text-xs font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                                Already a member
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && selectedClub && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/40">
                <div className="flex items-center gap-4">
                  {selectedClub.logo ? (
                    <img src={selectedClub.logo} alt={selectedClub.name} className="w-14 h-14 rounded-xl object-cover ring-1 ring-slate-600/50" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-slate-700/50 border border-slate-600/30 flex items-center justify-center">
                      <Sailboat className="w-7 h-7 text-slate-400" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-white">{selectedClub.name}</h3>
                    {selectedClub.state_associations && (
                      <p className="text-sm text-slate-400">{selectedClub.state_associations.name}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Membership Type</label>
                <select
                  value={selectedMembershipType}
                  onChange={(e) => handleMembershipTypeChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border bg-slate-700/50 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {membershipTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} - ${parseFloat(String(type.amount)).toFixed(2)}
                    </option>
                  ))}
                </select>
                {membershipTypes.length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">No membership types configured for this club</p>
                )}
              </div>

              {feeBreakdown && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-5">
                  <h4 className="font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    Fee Breakdown
                  </h4>

                  {currentMemberships.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-400">Associate Membership</p>
                          <p className="text-slate-400 mt-0.5">
                            Since you're already a member of another club, you'll join as an associate member.
                            {feeBreakdown.stateFee === 0 && ' State and national fees are already covered by your primary membership.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">Club Fee</span>
                      <span className="font-medium text-white">${feeBreakdown.clubFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">State Association Fee</span>
                      <span className="font-medium text-white">
                        {feeBreakdown.stateFee > 0 ? `$${feeBreakdown.stateFee.toFixed(2)}` : <span className="text-slate-500">Included</span>}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">National Association Fee</span>
                      <span className="font-medium text-white">
                        {feeBreakdown.nationalFee > 0 ? `$${feeBreakdown.nationalFee.toFixed(2)}` : <span className="text-slate-500">Included</span>}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-slate-700/50 flex justify-between items-center">
                      <span className="text-lg font-bold text-white">Total</span>
                      <span className="text-lg font-bold text-blue-400">${feeBreakdown.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {feeBreakdown && feeBreakdown.total > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">Payment Method</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stripeEnabled && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                          paymentMethod === 'card'
                            ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                            : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${paymentMethod === 'card' ? 'bg-blue-500/20' : 'bg-slate-700/50'}`}>
                            <CreditCard className={`w-5 h-5 ${paymentMethod === 'card' ? 'text-blue-400' : 'text-slate-400'}`} />
                          </div>
                          <div>
                            <h4 className="font-medium text-white text-sm">Pay Online</h4>
                            <p className="text-xs text-slate-400">Pay instantly via Stripe</p>
                          </div>
                        </div>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                        paymentMethod === 'bank_transfer'
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${paymentMethod === 'bank_transfer' ? 'bg-blue-500/20' : 'bg-slate-700/50'}`}>
                          <Building2 className={`w-5 h-5 ${paymentMethod === 'bank_transfer' ? 'text-blue-400' : 'text-slate-400'}`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-white text-sm">Bank Transfer</h4>
                          <p className="text-xs text-slate-400">Pay via direct deposit</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {paymentMethod === 'bank_transfer' && hasBankDetails && (
                    <div className="mt-4 p-4 rounded-xl bg-slate-700/30 border border-slate-600/30">
                      <h5 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Club Bank Details</h5>
                      <div className="space-y-2.5">
                        {bankDetails.bank_name && (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Bank</p>
                              <p className="text-sm text-white font-medium">{bankDetails.bank_name}</p>
                            </div>
                          </div>
                        )}
                        {bankDetails.bsb && (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">BSB</p>
                              <p className="text-sm text-white font-medium font-mono">{bankDetails.bsb}</p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(bankDetails.bsb, 'bsb')}
                              className="p-1.5 rounded-lg hover:bg-slate-600/50 transition-colors text-slate-400 hover:text-white"
                            >
                              {copiedField === 'bsb' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                        {bankDetails.account_number && (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Account Number</p>
                              <p className="text-sm text-white font-medium font-mono">{bankDetails.account_number}</p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(bankDetails.account_number, 'account')}
                              className="p-1.5 rounded-lg hover:bg-slate-600/50 transition-colors text-slate-400 hover:text-white"
                            >
                              {copiedField === 'account' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-3">
                        Please use your full name as the payment reference.
                      </p>
                    </div>
                  )}

                  {paymentMethod === 'bank_transfer' && !hasBankDetails && (
                    <div className="mt-4 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-yellow-400/90">
                          This club hasn't provided bank details yet. Contact the club administrator for payment instructions after your application is approved.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setStep('search');
                    setSelectedClub(null);
                    setFeeBreakdown(null);
                    setMembershipTypes([]);
                    setSelectedMembershipType('');
                  }}
                  className="flex-1 px-4 py-3 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700/50 font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={!selectedMembershipType}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Application
                </button>
              </div>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
              <p className="text-lg font-medium text-white">Submitting your application...</p>
              <p className="text-sm text-slate-400">This won't take long</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
