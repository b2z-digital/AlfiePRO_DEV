import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle,
  Mail,
  Phone,
  MapPin,
  FileText,
  Download,
  Edit2,
  X,
  Sailboat,
  Shield,
  Clock,
  ChevronRight,
  User,
  Anchor,
  Heart
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/date';
import { MyClubMembershipsWidget } from '../membership/MyClubMembershipsWidget';
import { MemberEditModal } from '../membership/MemberEditModal';
import { Avatar } from '../ui/Avatar';

interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  is_financial: boolean;
  renewal_date: string;
  membership_level: string;
  membership_level_custom?: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  avatar_url?: string;
  country?: string;
  category?: string;
  date_joined?: string;
}

interface BoatData {
  id: string;
  boat_type: string;
  sail_number: string;
  hull_number?: string;
  boat_name?: string;
  handicap?: number;
}

interface MembershipType {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  renewal_period: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  status: string;
  description: string;
}

interface MemberMembershipViewProps {
  darkMode: boolean;
}

export const MemberMembershipView: React.FC<MemberMembershipViewProps> = ({ darkMode }) => {
  const { currentClub, user } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [boats, setBoats] = useState<BoatData[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card');
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    if (currentClub?.clubId && user?.id) {
      fetchAllData();
    } else {
      setLoading(false);
    }
  }, [currentClub, user]);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [memberResult, typesResult] = await Promise.all([
        supabase
          .from('members')
          .select(`
            id, first_name, last_name, email, phone,
            street, city, state, postcode,
            is_financial, renewal_date,
            membership_level, membership_level_custom,
            emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
            avatar_url, country, category, date_joined
          `)
          .eq('club_id', currentClub?.clubId)
          .eq('user_id', user?.id)
          .maybeSingle(),
        supabase
          .from('membership_types')
          .select('*')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .neq('name', 'Life Member')
          .order('amount', { ascending: true })
      ]);

      if (memberResult.error) throw memberResult.error;

      if (memberResult.data) {
        setMemberData(memberResult.data as MemberData);

        const [boatsResult, paymentsResult] = await Promise.all([
          supabase
            .from('member_boats')
            .select('id, boat_type, sail_number, hull_number, boat_name, handicap')
            .eq('member_id', memberResult.data.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('membership_transactions')
            .select('id, amount, payment_method, created_at, payment_status, description')
            .eq('member_id', memberResult.data.id)
            .order('created_at', { ascending: false })
            .limit(10)
        ]);

        setBoats(boatsResult.data || []);
        setPayments((paymentsResult.data || []).map(p => ({
          id: p.id,
          amount: p.amount,
          payment_method: p.payment_method,
          payment_date: p.created_at,
          status: p.payment_status,
          description: p.description
        })));
      } else {
        setError('Member record not found');
      }

      setMembershipTypes(typesResult.data || []);
    } catch (err) {
      console.error('Error fetching member data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load membership data');
    } finally {
      setLoading(false);
    }
  };

  const getMembershipStatus = () => {
    if (!memberData) return { status: 'unknown', text: 'Unknown', color: 'slate', needsRenewal: false };

    if (!memberData.is_financial) {
      return { status: 'expired', text: 'Not Financial', color: 'red', needsRenewal: true };
    }

    if (!memberData.renewal_date) {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false };
    }

    const renewalDate = new Date(memberData.renewal_date);
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilRenewal < 0) {
      return { status: 'expired', text: 'Expired', color: 'red', needsRenewal: true };
    } else if (daysUntilRenewal <= 30) {
      return { status: 'expiring', text: 'Expiring Soon', color: 'yellow', needsRenewal: true };
    } else {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false };
    }
  };

  const handleRenewal = async () => {
    if (!memberData || !currentClub || !selectedMembershipType) {
      addNotification('error', 'Please select a membership type');
      return;
    }

    try {
      setProcessingPayment(true);

      const selectedType = membershipTypes.find(t => t.id === selectedMembershipType);
      if (!selectedType) {
        throw new Error('Selected membership type not found');
      }

      if (selectedPaymentMethod === 'credit_card') {
        const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
          body: {
            club_id: currentClub.clubId,
            member_id: memberData.id,
            amount: selectedType.amount,
            currency: selectedType.currency,
            description: `${selectedType.name} Membership Renewal - ${currentClub.club?.name}`,
            success_url: `${window.location.origin}/dashboard/membership?payment=success`,
            cancel_url: `${window.location.origin}/dashboard/membership?payment=cancelled`,
            metadata: {
              type: 'membership_renewal',
              member_id: memberData.id,
              club_id: currentClub.clubId,
              membership_type_id: selectedType.id,
              membership_level: selectedType.name
            }
          }
        });

        if (error) throw error;

        if (data?.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL received');
        }
      } else {
        const { error: renewalError } = await supabase
          .from('membership_renewals')
          .insert({
            member_id: memberData.id,
            membership_type_id: selectedType.id,
            renewal_date: new Date().toISOString().split('T')[0],
            expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            amount_paid: selectedType.amount,
            payment_method: 'bank_transfer',
            payment_reference: null
          });

        if (renewalError) throw renewalError;

        addNotification('success', 'Renewal request submitted! Please complete the bank transfer and notify your club administrator.');
        setShowRenewalModal(false);
        setProcessingPayment(false);
        fetchAllData();
      }
    } catch (err: any) {
      console.error('Error creating payment:', err);
      addNotification('error', err.message || 'Failed to start renewal process');
      setProcessingPayment(false);
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    fetchAllData();
    addNotification('success', 'Details updated successfully');
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-8 md:p-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading your membership...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !memberData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-8 md:p-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center max-w-md mx-auto">
              <AlertCircle size={48} className="mx-auto mb-4 text-yellow-400" />
              <h2 className="text-xl font-semibold text-white mb-2">No Membership Record Found</h2>
              <p className="text-slate-400 mb-4">
                You don't have a membership record yet for {currentClub?.club?.name || 'this club'}.
              </p>
              <div className="rounded-xl bg-slate-800/30 border border-slate-700/50 p-4 mb-4">
                <p className="text-sm text-slate-300 mb-2">To get started:</p>
                <ul className="text-sm text-slate-400 text-left space-y-2">
                  <li className="flex items-start gap-2"><ChevronRight size={14} className="mt-1 text-blue-400 flex-shrink-0" /> Contact your club administrator to add you as a member</li>
                  <li className="flex items-start gap-2"><ChevronRight size={14} className="mt-1 text-blue-400 flex-shrink-0" /> Ask them to link your account to your membership record</li>
                  <li className="flex items-start gap-2"><ChevronRight size={14} className="mt-1 text-blue-400 flex-shrink-0" /> Once linked, you'll be able to manage your membership here</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const membershipStatus = getMembershipStatus();
  const fullAddress = [memberData.street, memberData.city, memberData.state, memberData.postcode].filter(Boolean).join(', ');

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 md:p-16">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">My Membership</h1>
              <p className="text-slate-400 mt-1">Manage your membership, details, and boats</p>
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              <Edit2 size={16} />
              Edit Details
            </button>
          </div>

          {/* Multi-Club Memberships */}
          <MyClubMembershipsWidget darkMode={darkMode} />

          {/* Member Profile Card */}
          <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start gap-5">
                <div className="flex-shrink-0">
                  <Avatar
                    src={memberData.avatar_url}
                    alt={`${memberData.first_name} ${memberData.last_name}`}
                    size="lg"
                    className="w-20 h-20 rounded-xl"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {memberData.first_name} {memberData.last_name}
                      </h2>
                      <p className="text-slate-400 text-sm mt-0.5">
                        {memberData.membership_level_custom || memberData.membership_level || 'Member'}
                        {memberData.category && ` - ${memberData.category}`}
                      </p>
                      {memberData.date_joined && (
                        <p className="text-slate-500 text-xs mt-1">
                          Member since {formatDate(memberData.date_joined)}
                        </p>
                      )}
                    </div>
                    <div className={`px-4 py-2 rounded-lg flex items-center gap-2 flex-shrink-0 ${
                      membershipStatus.color === 'green'
                        ? 'bg-green-500/15 text-green-400 border border-green-500/20'
                        : membershipStatus.color === 'yellow'
                        ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                        : 'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>
                      {membershipStatus.status === 'active' && <CheckCircle size={16} />}
                      {(membershipStatus.status === 'expiring' || membershipStatus.status === 'expired') && <AlertCircle size={16} />}
                      <span className="text-sm font-semibold">{membershipStatus.text}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Renewal Warning */}
              {membershipStatus.needsRenewal && (
                <div className={`mt-5 p-4 rounded-xl flex items-center justify-between ${
                  membershipStatus.color === 'yellow'
                    ? 'bg-yellow-500/10 border border-yellow-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}>
                  <div className="flex items-center gap-3">
                    <AlertCircle size={20} className={membershipStatus.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'} />
                    <div>
                      <p className={`font-medium text-sm ${membershipStatus.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
                        {membershipStatus.status === 'expiring' ? 'Membership Expiring Soon' : 'Membership Expired'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {membershipStatus.status === 'expiring'
                          ? 'Renew now to maintain your benefits.'
                          : 'Renew now to continue enjoying club benefits.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRenewalModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors flex-shrink-0"
                  >
                    <CreditCard size={14} />
                    Renew Now
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Details */}
            <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <User size={16} className="text-blue-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Contact Details</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Email</p>
                    <p className="text-sm text-white mt-0.5">{memberData.email || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Phone</p>
                    <p className="text-sm text-white mt-0.5">{memberData.phone || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Address</p>
                    <p className="text-sm text-white mt-0.5">{fullAddress || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Membership Details */}
            <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Shield size={16} className="text-green-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Membership Details</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <FileText size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Membership Type</p>
                    <p className="text-sm text-white mt-0.5">
                      {memberData.membership_level_custom || memberData.membership_level || 'Standard'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Renewal Date</p>
                    <p className="text-sm text-white mt-0.5">
                      {memberData.renewal_date ? formatDate(memberData.renewal_date) : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Member Since</p>
                    <p className="text-sm text-white mt-0.5">
                      {memberData.date_joined ? formatDate(memberData.date_joined) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <Heart size={16} className="text-red-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Emergency Contact</h3>
              </div>

              {memberData.emergency_contact_name ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <User size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">Name</p>
                      <p className="text-sm text-white mt-0.5">{memberData.emergency_contact_name}</p>
                    </div>
                  </div>
                  {memberData.emergency_contact_phone && (
                    <div className="flex items-start gap-3">
                      <Phone size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Phone</p>
                        <p className="text-sm text-white mt-0.5">{memberData.emergency_contact_phone}</p>
                      </div>
                    </div>
                  )}
                  {memberData.emergency_contact_relationship && (
                    <div className="flex items-start gap-3">
                      <Shield size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Relationship</p>
                        <p className="text-sm text-white mt-0.5">{memberData.emergency_contact_relationship}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-slate-500">No emergency contact on file</p>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-sm text-blue-400 hover:text-blue-300 mt-2 transition-colors"
                  >
                    Add emergency contact
                  </button>
                </div>
              )}
            </div>

            {/* My Boats */}
            <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Anchor size={16} className="text-cyan-400" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200">My Boats</h3>
                </div>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Manage
                </button>
              </div>

              {boats.length > 0 ? (
                <div className="space-y-3">
                  {boats.map(boat => (
                    <div
                      key={boat.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/20 border border-slate-700/30"
                    >
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <Sailboat size={16} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {boat.boat_type}
                          {boat.boat_name && <span className="text-slate-400 ml-1">- {boat.boat_name}</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          Sail: {boat.sail_number || 'N/A'}
                          {boat.hull_number && ` | Hull: ${boat.hull_number}`}
                          {boat.handicap !== undefined && boat.handicap !== null && ` | HC: ${boat.handicap}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Sailboat size={24} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm text-slate-500">No boats registered</p>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-sm text-blue-400 hover:text-blue-300 mt-2 transition-colors"
                  >
                    Add a boat
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Payment History */}
          <div className="rounded-2xl bg-slate-800/30 border border-slate-700/50 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <FileText size={16} className="text-amber-400" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Payment History</h3>
              </div>
              {!membershipStatus.needsRenewal && (
                <button
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  <Download size={14} />
                  Download Invoice
                </button>
              )}
            </div>

            {payments.length > 0 ? (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700/50">
                      <th className="text-left pb-3 font-medium">Date</th>
                      <th className="text-left pb-3 font-medium">Description</th>
                      <th className="text-left pb-3 font-medium">Method</th>
                      <th className="text-right pb-3 font-medium">Amount</th>
                      <th className="text-right pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {payments.map(payment => (
                      <tr key={payment.id} className="text-sm">
                        <td className="py-3 text-slate-400">{formatDate(payment.payment_date)}</td>
                        <td className="py-3 text-white">{payment.description || 'Membership Payment'}</td>
                        <td className="py-3 text-slate-400 capitalize">{payment.payment_method?.replace('_', ' ') || 'N/A'}</td>
                        <td className="py-3 text-right text-white font-medium">${payment.amount?.toFixed(2)}</td>
                        <td className="py-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            payment.status === 'paid' || payment.status === 'completed'
                              ? 'bg-green-500/15 text-green-400'
                              : payment.status === 'pending'
                              ? 'bg-yellow-500/15 text-yellow-400'
                              : 'bg-slate-500/15 text-slate-400'
                          }`}>
                            {payment.status === 'paid' || payment.status === 'completed' ? (
                              <CheckCircle size={10} />
                            ) : (
                              <Clock size={10} />
                            )}
                            {payment.status || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText size={24} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm text-slate-500">No payment history available</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {membershipStatus.needsRenewal && (
            <div className="flex justify-center">
              <button
                onClick={() => setShowRenewalModal(true)}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition-colors shadow-lg shadow-blue-500/20"
              >
                <CreditCard size={18} />
                Renew Membership
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal - Same as admin flow */}
      {showEditModal && memberData && currentClub?.clubId && (
        <MemberEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          memberId={memberData.id}
          clubId={currentClub.clubId}
          darkMode={darkMode}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Renewal Modal */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full rounded-2xl shadow-xl bg-slate-800 border border-slate-700">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Renew Your Membership</h3>
                <button
                  onClick={() => setShowRenewalModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-slate-400 mb-6">
                Choose your membership type to continue with renewal:
              </p>

              <div className="space-y-3 mb-6">
                {membershipTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedMembershipType(type.id)}
                    className={`w-full p-4 rounded-xl border text-left transition-colors ${
                      selectedMembershipType === type.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-white mb-1">{type.name}</h4>
                        {type.description && (
                          <p className="text-sm text-slate-400">{type.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-white">${type.amount}</p>
                        <p className="text-xs text-slate-400">{type.currency}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedPaymentMethod('credit_card')}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      selectedPaymentMethod === 'credit_card'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <CreditCard className={`mb-2 ${selectedPaymentMethod === 'credit_card' ? 'text-blue-400' : 'text-slate-400'}`} size={24} />
                    <h4 className="font-medium text-white mb-1">Credit Card</h4>
                    <p className="text-xs text-slate-400">Pay instantly via Stripe</p>
                  </button>

                  <button
                    onClick={() => setSelectedPaymentMethod('bank_transfer')}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      selectedPaymentMethod === 'bank_transfer'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <Calendar className={`mb-2 ${selectedPaymentMethod === 'bank_transfer' ? 'text-blue-400' : 'text-slate-400'}`} size={24} />
                    <h4 className="font-medium text-white mb-1">Bank Transfer</h4>
                    <p className="text-xs text-slate-400">Pay via direct deposit</p>
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRenewalModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenewal}
                  disabled={!selectedMembershipType || processingPayment}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingPayment ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </div>
                  ) : (
                    selectedPaymentMethod === 'credit_card' ? 'Continue to Payment' : 'Submit Renewal Request'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
