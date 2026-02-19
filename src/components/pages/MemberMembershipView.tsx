import React, { useState, useEffect, useMemo } from 'react';
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
  Heart,
  Users,
  TrendingUp,
  Award,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
  })
};

const RenewalRing: React.FC<{ daysLeft: number; totalDays: number }> = ({ daysLeft, totalDays }) => {
  const progress = Math.max(0, Math.min(1, daysLeft / totalDays));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const color = daysLeft > 60 ? '#22c55e' : daysLeft > 30 ? '#eab308' : '#ef4444';

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-700/50" />
        <motion.circle
          cx="44" cy="44" r={radius} fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-white leading-none">{Math.max(0, daysLeft)}</span>
        <span className="text-[10px] text-slate-400 leading-tight">days</span>
      </div>
    </div>
  );
};

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

  const membershipStatus = useMemo(() => {
    if (!memberData) return { status: 'unknown', text: 'Unknown', color: 'slate', needsRenewal: false, daysLeft: 0 };

    if (!memberData.is_financial) {
      return { status: 'expired', text: 'Not Financial', color: 'red', needsRenewal: true, daysLeft: 0 };
    }

    if (!memberData.renewal_date) {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false, daysLeft: 365 };
    }

    const renewalDate = new Date(memberData.renewal_date);
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilRenewal < 0) {
      return { status: 'expired', text: 'Expired', color: 'red', needsRenewal: true, daysLeft: 0 };
    } else if (daysUntilRenewal <= 30) {
      return { status: 'expiring', text: 'Expiring Soon', color: 'yellow', needsRenewal: true, daysLeft: daysUntilRenewal };
    } else {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false, daysLeft: daysUntilRenewal };
    }
  }, [memberData]);

  const memberDuration = useMemo(() => {
    if (!memberData?.date_joined) return null;
    const joined = new Date(memberData.date_joined);
    const now = new Date();
    const months = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (years > 0 && remainingMonths > 0) return `${years}y ${remainingMonths}m`;
    if (years > 0) return `${years}y`;
    return `${remainingMonths}m`;
  }, [memberData?.date_joined]);

  const handleRenewal = async () => {
    if (!memberData || !currentClub || !selectedMembershipType) {
      addNotification('error', 'Please select a membership type');
      return;
    }

    try {
      setProcessingPayment(true);
      const selectedType = membershipTypes.find(t => t.id === selectedMembershipType);
      if (!selectedType) throw new Error('Selected membership type not found');

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
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-700/50 animate-pulse" />
            <div className="space-y-2">
              <div className="w-48 h-7 rounded-lg bg-slate-700/50 animate-pulse" />
              <div className="w-64 h-4 rounded bg-slate-700/40 animate-pulse" />
            </div>
          </div>
          <div className="w-full h-24 rounded-2xl bg-slate-800/30 border border-slate-700/50 animate-pulse mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-800/30 border border-slate-700/50 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 rounded-2xl bg-slate-800/30 border border-slate-700/50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !memberData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="mb-8 flex items-center gap-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
              <Users className="text-white" size={32} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white">My Membership</h1>
              <p className="text-slate-400 text-lg">Manage your membership, details, and boats</p>
            </div>
          </div>
          <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center min-h-[300px]"
            >
              <div className="text-center max-w-md mx-auto p-8 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 backdrop-blur-sm">
                <div className="w-16 h-16 rounded-2xl bg-yellow-500/15 border border-yellow-500/20 flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={28} className="text-yellow-400" />
                </div>
                <h2 className="text-xl font-semibold text-white mb-2">No Membership Record Found</h2>
                <p className="text-slate-400 mb-6">
                  You don't have a membership record yet for {currentClub?.club?.name || 'this club'}.
                </p>
                <div className="space-y-3 text-left">
                  {['Contact your club administrator to add you as a member', 'Ask them to link your account to your membership record', 'Once linked, you can manage your membership here'].map((step, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-700/20 border border-slate-700/30">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-blue-400">{i + 1}</span>
                      </div>
                      <p className="text-sm text-slate-300">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
        </div>
      </div>
    );
  }

  const fullAddress = [memberData.street, memberData.city, memberData.state, memberData.postcode].filter(Boolean).join(', ');

  const statCards = [
    {
      label: 'Status',
      value: membershipStatus.text,
      icon: membershipStatus.status === 'active' ? CheckCircle : AlertCircle,
      gradient: membershipStatus.color === 'green'
        ? 'from-green-500 to-emerald-600'
        : membershipStatus.color === 'yellow'
        ? 'from-yellow-500 to-amber-600'
        : 'from-red-500 to-rose-600',
      bg: membershipStatus.color === 'green'
        ? 'from-green-600/20 to-green-800/20 border-green-500/30'
        : membershipStatus.color === 'yellow'
        ? 'from-yellow-600/20 to-yellow-800/20 border-yellow-500/30'
        : 'from-red-600/20 to-red-800/20 border-red-500/30'
    },
    {
      label: 'Renewal',
      value: memberData.renewal_date ? formatDate(memberData.renewal_date) : 'N/A',
      icon: Calendar,
      gradient: 'from-blue-500 to-cyan-600',
      bg: 'from-blue-600/20 to-blue-800/20 border-blue-500/30'
    },
    {
      label: 'Boats',
      value: String(boats.length),
      icon: Anchor,
      gradient: 'from-cyan-500 to-teal-600',
      bg: 'from-cyan-600/20 to-cyan-800/20 border-cyan-500/30'
    },
    {
      label: 'Payments',
      value: String(payments.length),
      icon: CreditCard,
      gradient: 'from-amber-500 to-orange-600',
      bg: 'from-amber-600/20 to-amber-800/20 border-amber-500/30'
    }
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        <div className="space-y-6">

          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-between gap-4 mb-2"
          >
            <div className="flex items-center gap-4">
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
                <Users className="text-white" size={32} />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">My Membership</h1>
                <p className="text-lg text-slate-400">Manage your membership, details, and boats</p>
              </div>
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 transition-all duration-200"
            >
              <Edit2 size={16} />
              <span className="hidden sm:inline">Edit Details</span>
            </button>
          </motion.div>

          {/* Member Profile Hero */}
          <motion.div
            custom={1}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="rounded-2xl bg-gradient-to-br from-slate-800/60 to-slate-900/60 border border-slate-700/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="p-6">
              <div className="flex flex-col sm:flex-row items-start gap-5">
                <div className="relative flex-shrink-0">
                  <Avatar
                    src={memberData.avatar_url}
                    alt={`${memberData.first_name} ${memberData.last_name}`}
                    size="lg"
                    className="w-20 h-20 rounded-2xl ring-2 ring-slate-600/50"
                  />
                  {membershipStatus.status === 'active' && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-slate-800 flex items-center justify-center">
                      <CheckCircle size={12} className="text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {memberData.first_name} {memberData.last_name}
                      </h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
                          <Award size={12} />
                          {memberData.membership_level_custom || memberData.membership_level || 'Member'}
                        </span>
                        {memberData.category && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600/30">
                            {memberData.category}
                          </span>
                        )}
                        {memberDuration && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400 border border-teal-500/20">
                            <Clock size={12} />
                            {memberDuration}
                          </span>
                        )}
                      </div>
                      {memberData.date_joined && (
                        <p className="text-slate-500 text-xs mt-2">
                          Member since {formatDate(memberData.date_joined)}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {memberData.renewal_date && membershipStatus.status !== 'expired' && (
                        <RenewalRing daysLeft={membershipStatus.daysLeft} totalDays={365} />
                      )}
                      <div className={`px-4 py-2 rounded-xl flex items-center gap-2 flex-shrink-0 ${
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
              </div>

              {membershipStatus.needsRenewal && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ delay: 0.5 }}
                  className={`mt-5 p-4 rounded-xl flex items-center justify-between ${
                    membershipStatus.color === 'yellow'
                      ? 'bg-yellow-500/10 border border-yellow-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle size={20} className={membershipStatus.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'} />
                    <div>
                      <p className={`font-medium text-sm ${membershipStatus.color === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
                        {membershipStatus.status === 'expiring' ? 'Membership Expiring Soon' : 'Membership Expired'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {membershipStatus.status === 'expiring' ? 'Renew now to maintain your benefits.' : 'Renew now to continue enjoying club benefits.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRenewalModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all flex-shrink-0"
                  >
                    <CreditCard size={14} />
                    Renew Now
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Multi-Club Memberships */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <MyClubMembershipsWidget darkMode={darkMode} />
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  custom={i + 2}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className={`rounded-2xl bg-gradient-to-br ${stat.bg} border backdrop-blur-sm p-4 hover:scale-[1.02] transition-transform duration-200`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg flex-shrink-0`}>
                      <Icon className="text-white" size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</p>
                      <p className="text-base font-bold text-white mt-0.5 truncate">{stat.value}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Membership Timeline */}
          {memberData.date_joined && memberData.renewal_date && (
            <motion.div
              custom={6}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50 backdrop-blur-sm p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Activity size={16} className="text-blue-400" />
                <h3 className="text-sm font-semibold text-slate-300">Membership Timeline</h3>
              </div>
              <div className="relative">
                <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(5, Math.min(100, ((365 - membershipStatus.daysLeft) / 365) * 100))}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-slate-500">Joined {formatDate(memberData.date_joined)}</span>
                  <span className="text-xs text-slate-500">Renewal {formatDate(memberData.renewal_date)}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contact Details */}
            <motion.div
              custom={7}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl bg-gradient-to-br from-blue-600/15 to-blue-800/15 border border-blue-500/25 backdrop-blur-sm p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/20">
                  <User size={16} className="text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Contact Details</h3>
              </div>
              <div className="space-y-4">
                {[
                  { icon: Mail, label: 'Email', value: memberData.email },
                  { icon: Phone, label: 'Phone', value: memberData.phone },
                  { icon: MapPin, label: 'Address', value: fullAddress }
                ].map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-3 group">
                      <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/15 flex-shrink-0 mt-0.5">
                        <ItemIcon size={14} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">{item.label}</p>
                        <p className="text-sm text-white mt-0.5">{item.value || 'Not provided'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Membership Details */}
            <motion.div
              custom={8}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl bg-gradient-to-br from-green-600/15 to-green-800/15 border border-green-500/25 backdrop-blur-sm p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
                  <Shield size={16} className="text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Membership Details</h3>
              </div>
              <div className="space-y-4">
                {[
                  { icon: FileText, label: 'Membership Type', value: memberData.membership_level_custom || memberData.membership_level || 'Standard' },
                  { icon: Calendar, label: 'Renewal Date', value: memberData.renewal_date ? formatDate(memberData.renewal_date) : 'N/A' },
                  { icon: Clock, label: 'Member Since', value: memberData.date_joined ? formatDate(memberData.date_joined) : 'N/A' }
                ].map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={item.label} className="flex items-start gap-3 group">
                      <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/15 flex-shrink-0 mt-0.5">
                        <ItemIcon size={14} className="text-green-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">{item.label}</p>
                        <p className="text-sm text-white mt-0.5">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Emergency Contact */}
            <motion.div
              custom={9}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl bg-gradient-to-br from-rose-600/15 to-rose-800/15 border border-rose-500/25 backdrop-blur-sm p-6"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 shadow-lg shadow-rose-500/20">
                  <Heart size={16} className="text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Emergency Contact</h3>
              </div>
              {memberData.emergency_contact_name ? (
                <div className="space-y-4">
                  {[
                    { icon: User, label: 'Name', value: memberData.emergency_contact_name },
                    ...(memberData.emergency_contact_phone ? [{ icon: Phone, label: 'Phone', value: memberData.emergency_contact_phone }] : []),
                    ...(memberData.emergency_contact_relationship ? [{ icon: Shield, label: 'Relationship', value: memberData.emergency_contact_relationship }] : [])
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <div key={item.label} className="flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/15 flex-shrink-0 mt-0.5">
                          <ItemIcon size={14} className="text-rose-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">{item.label}</p>
                          <p className="text-sm text-white mt-0.5">{item.value}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/15 flex items-center justify-center mx-auto mb-3">
                    <Heart size={20} className="text-rose-400/50" />
                  </div>
                  <p className="text-sm text-slate-500 mb-2">No emergency contact on file</p>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                  >
                    Add emergency contact
                  </button>
                </div>
              )}
            </motion.div>

            {/* My Boats */}
            <motion.div
              custom={10}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              className="rounded-2xl bg-gradient-to-br from-cyan-600/15 to-cyan-800/15 border border-cyan-500/25 backdrop-blur-sm p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shadow-cyan-500/20">
                    <Anchor size={16} className="text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200">My Boats</h3>
                </div>
                <button
                  onClick={() => setShowEditModal(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/15"
                >
                  Manage
                </button>
              </div>
              {boats.length > 0 ? (
                <div className="space-y-3">
                  {boats.map((boat, idx) => (
                    <motion.div
                      key={boat.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + idx * 0.1 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-cyan-500/30 transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/15 group-hover:bg-cyan-500/20 transition-colors">
                        <Sailboat size={16} className="text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {boat.boat_type}
                          {boat.boat_name && <span className="text-slate-400 ml-1.5">- {boat.boat_name}</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          Sail: {boat.sail_number || 'N/A'}
                          {boat.hull_number && ` | Hull: ${boat.hull_number}`}
                          {boat.handicap !== undefined && boat.handicap !== null && ` | HC: ${boat.handicap}`}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/15 flex items-center justify-center mx-auto mb-3">
                    <Sailboat size={20} className="text-cyan-400/50" />
                  </div>
                  <p className="text-sm text-slate-500 mb-2">No boats registered</p>
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                  >
                    Add a boat
                  </button>
                </div>
              )}
            </motion.div>
          </div>

          {/* Payment History */}
          <motion.div
            custom={11}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="rounded-2xl bg-gradient-to-br from-amber-600/15 to-amber-800/15 border border-amber-500/25 backdrop-blur-sm p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
                  <FileText size={16} className="text-white" />
                </div>
                <h3 className="text-base font-semibold text-slate-200">Payment History</h3>
              </div>
              {!membershipStatus.needsRenewal && (
                <button className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors font-medium px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/15">
                  <Download size={14} />
                  Download Invoice
                </button>
              )}
            </div>

            {payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment, idx) => (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + idx * 0.08 }}
                    className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${
                        payment.status === 'paid' || payment.status === 'completed'
                          ? 'bg-green-500/10 border border-green-500/15'
                          : 'bg-yellow-500/10 border border-yellow-500/15'
                      }`}>
                        {payment.status === 'paid' || payment.status === 'completed'
                          ? <CheckCircle size={14} className="text-green-400" />
                          : <Clock size={14} className="text-yellow-400" />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {payment.description || 'Membership Payment'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(payment.payment_date)} · {payment.payment_method?.replace('_', ' ') || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-white">${payment.amount?.toFixed(2)}</p>
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${
                        payment.status === 'paid' || payment.status === 'completed' ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {payment.status || 'N/A'}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center mx-auto mb-3">
                  <FileText size={20} className="text-amber-400/50" />
                </div>
                <p className="text-sm text-slate-500">No payment history available</p>
              </div>
            )}
          </motion.div>

          {/* Renewal CTA */}
          {membershipStatus.needsRenewal && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="flex justify-center"
            >
              <button
                onClick={() => setShowRenewalModal(true)}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-xl hover:shadow-blue-500/25 hover:scale-105 transition-all duration-200"
              >
                <CreditCard size={18} />
                Renew Membership
              </button>
            </motion.div>
          )}
        </div>
      </div>

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

      <AnimatePresence>
        {showRenewalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => e.target === e.currentTarget && setShowRenewalModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="max-w-2xl w-full rounded-2xl shadow-2xl bg-slate-800 border border-slate-700"
            >
              <div className="p-6 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
                      <CreditCard size={18} className="text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white">Renew Your Membership</h3>
                  </div>
                  <button
                    onClick={() => setShowRenewalModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-xl transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <p className="text-slate-400 mb-6">Choose your membership type to continue with renewal:</p>

                <div className="space-y-3 mb-6">
                  {membershipTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedMembershipType(type.id)}
                      className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${
                        selectedMembershipType === type.id
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-white mb-1">{type.name}</h4>
                          {type.description && <p className="text-sm text-slate-400">{type.description}</p>}
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
                  <label className="block text-sm font-medium text-slate-300 mb-3">Payment Method</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedPaymentMethod('credit_card')}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                        selectedPaymentMethod === 'credit_card'
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
                      }`}
                    >
                      <CreditCard className={`mb-2 ${selectedPaymentMethod === 'credit_card' ? 'text-blue-400' : 'text-slate-400'}`} size={24} />
                      <h4 className="font-medium text-white mb-1">Credit Card</h4>
                      <p className="text-xs text-slate-400">Pay instantly via Stripe</p>
                    </button>
                    <button
                      onClick={() => setSelectedPaymentMethod('bank_transfer')}
                      className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                        selectedPaymentMethod === 'bank_transfer'
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                          : 'border-slate-700 hover:border-slate-600 bg-slate-800/50'
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
                    className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-xl hover:bg-slate-600 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRenewal}
                    disabled={!selectedMembershipType || processingPayment}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingPayment ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Processing...
                      </div>
                    ) : (
                      selectedPaymentMethod === 'credit_card' ? 'Continue to Payment' : 'Submit Renewal Request'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
