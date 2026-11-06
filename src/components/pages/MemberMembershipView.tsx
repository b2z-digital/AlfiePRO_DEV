import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CreditCard, Calendar, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Mail, Phone, MapPin, FileText, Download, SquarePen as Edit2, X, Sailboat, Shield, Clock, ChevronRight, User, Anchor, Heart, Users, TrendingUp, Award, Activity, ArrowRightLeft, Info, Landmark, Copy, Check, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/date';
import { MyClubMembershipsWidget } from '../membership/MyClubMembershipsWidget';
import { MemberEditModal } from '../membership/MemberEditModal';
import { Avatar } from '../ui/Avatar';
import { AAvatar } from '../alfie/Kit';

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
  is_active: boolean;
  replaces_membership_type_id: string | null;
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
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const { addNotification } = useNotifications();
  const location = useLocation();
  const pendingEditOpen = useRef(!!(location.state as any)?.edit);
  const pendingEditTab = useRef<'details' | 'boats' | undefined>((location.state as any)?.editTab);
  const [loading, setLoading] = useState(true);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [boats, setBoats] = useState<BoatData[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalTab, setEditModalTab] = useState<'details' | 'boats' | 'membership' | undefined>(undefined);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'credit_card' | 'bank_transfer'>('credit_card');
  const [processingPayment, setProcessingPayment] = useState(false);
  const [switchingToOnline, setSwitchingToOnline] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState<{ from: string; to: string } | null>(null);
  const [bankDetails, setBankDetails] = useState<{ bank_name: string; bsb: string; account_number: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [clubHasStripe, setClubHasStripe] = useState(false);

  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const effectiveMemberId = isImpersonating ? impersonationSession?.targetMemberId : null;

  useEffect(() => {
    if (currentClub?.clubId && (effectiveUserId || effectiveMemberId)) {
      fetchAllData();
    } else {
      setLoading(false);
    }
  }, [currentClub, effectiveUserId, effectiveMemberId]);

  useEffect(() => {
    if (pendingEditOpen.current && memberData && !loading) {
      pendingEditOpen.current = false;
      setEditModalTab(pendingEditTab.current);
      pendingEditTab.current = undefined;
      window.history.replaceState({}, '');
      setShowEditModal(true);
    }
  }, [memberData, loading]);

  const fetchAllData = async (showLoadingState = true) => {
    try {
      if (showLoadingState) setLoading(true);
      setError(null);

      let memberQuery = supabase
        .from('members')
        .select(`
          id, first_name, last_name, email, phone,
          street, city, state, postcode,
          is_financial, renewal_date, payment_status,
          membership_level, membership_level_custom,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          avatar_url, country, category, date_joined
        `)
        .eq('club_id', currentClub?.clubId);

      if (effectiveMemberId) {
        memberQuery = memberQuery.eq('id', effectiveMemberId);
      } else {
        memberQuery = memberQuery.eq('user_id', effectiveUserId);
      }

      const [memberResult, activeTypesResult, allTypesResult] = await Promise.all([
        memberQuery.maybeSingle(),
        supabase
          .from('membership_types')
          .select('*')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .neq('name', 'Life Member')
          .order('amount', { ascending: true }),
        supabase
          .from('membership_types')
          .select('id, name, is_active, replaces_membership_type_id')
          .eq('club_id', currentClub?.clubId)
      ]);

      if (memberResult.error) throw memberResult.error;

      const activeTypes = activeTypesResult.data || [];
      const allTypes = allTypesResult.data || [];

      if (memberResult.data) {
        setMemberData(memberResult.data as MemberData);

        const memberLevel = memberResult.data.membership_level_custom || memberResult.data.membership_level;
        const currentInactiveType = allTypes.find(t => !t.is_active && t.name === memberLevel);

        if (currentInactiveType) {
          const replacementType = allTypes.find(
            t => t.is_active && t.replaces_membership_type_id === currentInactiveType.id
          );
          if (replacementType) {
            setMigrationNotice({ from: currentInactiveType.name, to: replacementType.name });
            setSelectedMembershipType(replacementType.id);
          } else {
            const { data: fullInactiveType } = await supabase
              .from('membership_types')
              .select('*')
              .eq('id', currentInactiveType.id)
              .maybeSingle();
            if (fullInactiveType) {
              activeTypes.unshift(fullInactiveType);
              setSelectedMembershipType(fullInactiveType.id);
            }
          }
        } else {
          const currentActiveType = activeTypes.find(t => t.name === memberLevel);
          if (currentActiveType) {
            setSelectedMembershipType(currentActiveType.id);
          }
        }

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

      setMembershipTypes(activeTypes);

      const { data: clubBankData } = await supabase
        .from('clubs')
        .select('bank_name, bsb, account_number, stripe_account_id, stripe_enabled')
        .eq('id', currentClub?.clubId)
        .maybeSingle();
      if (clubBankData) {
        if (clubBankData.bank_name || clubBankData.bsb || clubBankData.account_number) {
          setBankDetails({ bank_name: clubBankData.bank_name, bsb: clubBankData.bsb, account_number: clubBankData.account_number });
        }
        const hasStripe = !!(clubBankData.stripe_account_id && clubBankData.stripe_enabled);
        setClubHasStripe(hasStripe);
        if (!hasStripe) {
          setSelectedPaymentMethod('bank_transfer');
        }
      }
    } catch (err) {
      console.error('Error fetching member data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load membership data');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBankField = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const membershipStatus = useMemo(() => {
    if (!memberData) return { status: 'unknown', text: 'Unknown', color: 'slate', needsRenewal: false, pendingPayment: false, daysLeft: 0 };

    if (memberData.payment_status === 'pending') {
      return { status: 'pending_payment', text: 'Awaiting Payment', color: 'yellow', needsRenewal: false, pendingPayment: true, daysLeft: 0 };
    }

    if (!memberData.is_financial) {
      return { status: 'expired', text: 'Not Financial', color: 'red', needsRenewal: true, pendingPayment: false, daysLeft: 0 };
    }

    if (!memberData.renewal_date) {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false, pendingPayment: false, daysLeft: 365 };
    }

    const renewalDate = new Date(memberData.renewal_date);
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilRenewal < 0) {
      return { status: 'expired', text: 'Expired', color: 'red', needsRenewal: true, pendingPayment: false, daysLeft: 0 };
    } else if (daysUntilRenewal <= 30) {
      return { status: 'expiring', text: 'Expiring Soon', color: 'yellow', needsRenewal: true, pendingPayment: false, daysLeft: daysUntilRenewal };
    } else {
      return { status: 'active', text: 'Financial', color: 'green', needsRenewal: false, pendingPayment: false, daysLeft: daysUntilRenewal };
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
        const { data: renewalResult, error: renewalError } = await supabase.rpc(
          'submit_membership_self_renewal',
          {
            p_member_id: memberData.id,
            p_membership_type_id: selectedType.id,
          }
        );

        if (renewalError) throw renewalError;
        if (!renewalResult?.success) {
          throw new Error(renewalResult?.error || 'Failed to submit renewal request');
        }

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

  const handleSwitchToOnlinePayment = async () => {
    if (!memberData || !currentClub) return;

    try {
      setSwitchingToOnline(true);
      const memberLevel = memberData.membership_level_custom || memberData.membership_level;
      const matchedType = membershipTypes.find(t => t.name === memberLevel);

      if (!matchedType) {
        addNotification('error', 'Could not determine membership type. Please contact your club administrator.');
        setSwitchingToOnline(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          club_id: currentClub.clubId,
          member_id: memberData.id,
          amount: matchedType.amount,
          currency: matchedType.currency,
          description: `${matchedType.name} Membership Renewal - ${currentClub.club?.name}`,
          success_url: `${window.location.origin}/dashboard/membership?payment=success`,
          cancel_url: `${window.location.origin}/dashboard/membership?payment=cancelled`,
          metadata: {
            type: 'membership_renewal',
            member_id: memberData.id,
            club_id: currentClub.clubId,
            membership_type_id: matchedType.id,
            membership_level: matchedType.name
          }
        }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (err: any) {
      console.error('Error switching to online payment:', err);
      addNotification('error', err.message || 'Failed to initiate online payment');
      setSwitchingToOnline(false);
    }
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    fetchAllData(false);
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

  const fmtLong = (d?: string) => d ? new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
  const fmtShort = (d?: string) => d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
  const statusTone = membershipStatus.color === 'green' ? 'g' : membershipStatus.color === 'yellow' ? 'a' : 'r';
  const ringColor = statusTone === 'g' ? '#30D158' : statusTone === 'a' ? '#FFB340' : '#FF6B6B';
  const ringDeg = Math.round(Math.max(0, Math.min(1, membershipStatus.daysLeft / 365)) * 360);
  const pctThrough = Math.round(Math.max(0, Math.min(100, ((365 - membershipStatus.daysLeft) / 365) * 100)));
  const durationLong = memberDuration ? memberDuration.replace(/(\d+)y/, (_, y) => `${y} year${y === '1' ? '' : 's'}`).replace(/(\d+)m/, (_, m) => `${m} month${m === '1' ? '' : 's'}`) : null;
  const section = (icon: React.ReactNode, title: string, sub?: string, action?: React.ReactNode) => (
    <div className="flex items-center gap-3">
      <span className="a-tile a-tile-sm">{icon}</span>
      <div className="flex-1 min-w-0">
        <h2 className="a-display a-ink m-0 text-[18px] font-semibold">{title}</h2>
        {sub && <p className="a-dim mt-0.5 text-[12.5px]">{sub}</p>}
      </div>
      {action}
    </div>
  );
  const editBtn = (label: string) => (
    <button onClick={() => setShowEditModal(true)} className="a-ib" aria-label={`Edit ${label}`} title={`Edit ${label}`}><Edit2 size={17} /></button>
  );
  const infoRow = (icon: React.ReactNode, label: string, value?: string) => (
    <div className="a-ir" key={label}>
      <span className="a-ir-l">{icon}{label}</span>
      <span className={`a-ir-v ${value ? '' : 'a-dim'}`}>{value || 'Not provided'}</span>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Users size={24} /></span>
          <div className="flex-1 min-w-0">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">My membership</h1>
            <p className="a-mute mt-1 text-[14.5px]">Your membership, details and boats</p>
          </div>
          <button onClick={() => setShowEditModal(true)} className="a-btn">
            <Edit2 size={16} />
            <span className="max-sm:hidden">Edit details</span>
          </button>
        </div>

        <div className="a-card a-spec-card flex flex-wrap items-center gap-[22px]" style={{ padding: '22px 24px' }}>
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => setShowEditModal(true)}>
            <span className="a-av-spec">
              <AAvatar url={memberData.avatar_url} first={memberData.first_name} last={memberData.last_name} size={84} />
            </span>
            <button className="a-gb absolute" style={{ right: -2, bottom: -2, width: 30, height: 30 }} aria-label="Change photo"><Camera size={14} /></button>
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="a-display a-ink text-[26px] font-bold">{memberData.first_name} {memberData.last_name}</div>
            <div className="flex gap-2 mt-2.5 flex-wrap">
              <span className="a-lb-fmt"><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: '#2E7BFF' }} />{memberData.membership_level_custom || memberData.membership_level || 'Member'}</span>
              {memberData.category && <span className="a-lb-fmt">{memberData.category}</span>}
              {durationLong && <span className="a-lb-fmt"><Clock size={12} />{durationLong}</span>}
            </div>
            {memberData.date_joined && <div className="a-dim text-[12.5px] mt-2">Member since {fmtLong(memberData.date_joined)}</div>}
          </div>
          <div className="a-ring-box flex items-center gap-[18px]">
            {memberData.renewal_date && membershipStatus.status !== 'expired' && !membershipStatus.pendingPayment ? (
              <div className="relative flex-shrink-0" style={{ width: 92, height: 92 }}>
                <div className="a-ring" style={{ background: `conic-gradient(${ringColor} 0deg ${ringDeg}deg, var(--a-ring-track) ${ringDeg}deg 360deg)` }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="a-display a-ink text-[24px] font-bold leading-none">{Math.max(0, membershipStatus.daysLeft)}</span>
                  <span className="a-dim text-[10.5px] mt-0.5">days left</span>
                </div>
              </div>
            ) : (
              <span className="a-tile" style={{ width: 64, height: 64, borderRadius: 999 }}>
                {membershipStatus.pendingPayment ? <Clock size={26} /> : <AlertCircle size={26} />}
              </span>
            )}
            <div>
              <span className={`a-st a-txt-${statusTone} text-[14px] font-semibold`}><span className={`a-light a-light-${statusTone}`} />{membershipStatus.text}</span>
              {memberData.renewal_date && <div className="a-mute text-[13px] mt-1.5">{membershipStatus.status === 'expired' ? 'Expired' : 'Renews'} {fmtLong(memberData.renewal_date)}</div>}
              {membershipStatus.needsRenewal && (
                <button onClick={() => setShowRenewalModal(true)} className="a-btn a-btn-p mt-2.5" style={{ height: 34, fontSize: 13 }}>
                  <CreditCard size={15} />Renew now
                </button>
              )}
            </div>
          </div>
        </div>

        {membershipStatus.pendingPayment && (
          <div className="a-card flex flex-col gap-3" style={{ padding: '16px 20px' }}>
            <div className="flex items-center gap-3">
              <span className="a-tile a-tile-sm a-txt-a"><Clock size={16} /></span>
              <div className="flex-1">
                <p className="a-txt-a m-0 font-semibold text-[14px]">Renewal submitted · awaiting payment</p>
                <p className="a-dim m-0 text-[12.5px] mt-0.5">Complete the bank transfer below and let your club administrator know.</p>
              </div>
            </div>
            {bankDetails && (
              <div className="a-grp">
                {bankDetails.bank_name && (
                  <div className="a-ir"><span className="a-ir-l"><Landmark size={15} />Bank</span><span className="a-ir-v">{bankDetails.bank_name}</span></div>
                )}
                {bankDetails.bsb && (
                  <div className="a-ir">
                    <span className="a-ir-l"><Landmark size={15} />BSB</span>
                    <span className="a-ir-v a-mono">{bankDetails.bsb}</span>
                    <button onClick={() => handleCopyBankField(bankDetails.bsb, 'bsb-banner')} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Copy BSB">
                      {copiedField === 'bsb-banner' ? <Check size={14} className="a-txt-g" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
                {bankDetails.account_number && (
                  <div className="a-ir">
                    <span className="a-ir-l"><Landmark size={15} />Account</span>
                    <span className="a-ir-v a-mono">{bankDetails.account_number}</span>
                    <button onClick={() => handleCopyBankField(bankDetails.account_number, 'acc-banner')} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Copy account number">
                      {copiedField === 'acc-banner' ? <Check size={14} className="a-txt-g" /> : <Copy size={14} />}
                    </button>
                  </div>
                )}
              </div>
            )}
            {clubHasStripe && (
              <div className="a-note flex items-center gap-3">
                <CreditCard size={18} className="a-txt-b flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="a-ink m-0 text-[13.5px] font-semibold">Prefer to pay online?</p>
                  <p className="a-dim m-0 text-[12.5px] mt-0.5">Pay instantly by card via Stripe</p>
                </div>
                <button onClick={handleSwitchToOnlinePayment} disabled={switchingToOnline} className="a-btn a-btn-p disabled:opacity-50" style={{ height: 36, fontSize: 13 }}>
                  {switchingToOnline ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />Processing…</> : <><CreditCard size={15} />Pay online</>}
                </button>
              </div>
            )}
          </div>
        )}

        {membershipStatus.needsRenewal && (
          <div className={`a-note ${statusTone === 'r' ? 'a-note-r' : ''} flex items-center gap-3`}>
            <AlertCircle size={18} className={statusTone === 'r' ? '' : 'a-txt-a'} />
            <div className="flex-1">
              <p className="m-0 font-semibold text-[13.5px]">{membershipStatus.status === 'expiring' ? 'Membership expiring soon' : 'Membership expired'}</p>
              <p className="a-dim m-0 text-[12.5px] mt-0.5">{membershipStatus.status === 'expiring' ? 'Renew now to keep your benefits.' : 'Renew now to keep enjoying club benefits.'}</p>
            </div>
            <button onClick={() => setShowRenewalModal(true)} className="a-btn a-btn-p" style={{ height: 36, fontSize: 13 }}>
              <CreditCard size={15} />Renew now
            </button>
          </div>
        )}

        {memberData.date_joined && memberData.renewal_date && (
          <div className="a-card" style={{ padding: '16px 20px' }}>
            <div className="a-dim flex justify-between gap-3 text-[12.5px]">
              <span>Joined {fmtShort(memberData.date_joined)}</span>
              <span className="a-ink font-semibold max-sm:hidden">Today · {pctThrough}% through this membership</span>
              <span>Renewal {fmtShort(memberData.renewal_date)}</span>
            </div>
            <div className="a-tl">
              <div className="a-tl-fill" style={{ width: `${pctThrough}%` }} />
              <span className="a-tl-dot" style={{ left: `calc(${pctThrough}% - 9px)` }} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="lg:col-span-1">
            <MyClubMembershipsWidget darkMode={darkMode} />
          </div>

          <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
            {section(<Shield size={16} />, 'Membership', undefined, editBtn('membership'))}
            <div className="a-grp">
              {infoRow(<FileText size={15} />, 'Type', memberData.membership_level_custom || memberData.membership_level || 'Standard')}
              {infoRow(<Calendar size={15} />, 'Renews', memberData.renewal_date ? fmtLong(memberData.renewal_date) : 'N/A')}
              {infoRow(<Clock size={15} />, 'Member since', memberData.date_joined ? fmtLong(memberData.date_joined) : 'N/A')}
            </div>
          </div>

          <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
            {section(<User size={16} />, 'Contact details', undefined, editBtn('contact details'))}
            <div className="a-grp">
              {infoRow(<Mail size={15} />, 'Email', memberData.email)}
              {infoRow(<Phone size={15} />, 'Phone', memberData.phone)}
              {infoRow(<MapPin size={15} />, 'Address', fullAddress)}
            </div>
          </div>

          <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
            {section(<Heart size={16} />, 'Emergency contact', undefined, editBtn('emergency contact'))}
            {memberData.emergency_contact_name ? (
              <div className="a-grp">
                {infoRow(<User size={15} />, 'Name', memberData.emergency_contact_name)}
                {infoRow(<Phone size={15} />, 'Phone', memberData.emergency_contact_phone)}
                {infoRow(<Shield size={15} />, 'Relationship', memberData.emergency_contact_relationship)}
              </div>
            ) : (
              <div className="a-grp a-empty text-center" style={{ padding: 18 }}>
                <p className="a-dim text-[13px] mb-2">No emergency contact on file</p>
                <button onClick={() => setShowEditModal(true)} className="a-btn a-btn-q a-txt-b" style={{ height: 32, fontSize: 13 }}>Add emergency contact</button>
              </div>
            )}
          </div>

          <div className="a-card flex flex-col gap-2.5" style={{ padding: '18px 20px' }}>
            {section(<Anchor size={16} />, 'My boats', `${boats.length} ${boats.length === 1 ? 'boat' : 'boats'}`,
              <button onClick={() => setShowEditModal(true)} className="a-btn a-btn-q a-txt-b" style={{ height: 32, fontSize: 13 }}>Manage</button>)}
            {boats.length > 0 ? (
              <div className="a-grp">
                {boats.map((boat) => (
                  <div key={boat.id} className="a-rr" style={{ padding: '10px 12px' }} onClick={() => setShowEditModal(true)} role="button" tabIndex={0}>
                    <span className="a-tile" style={{ width: 44, height: 44 }}><Sailboat size={19} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="a-ink text-[14.5px] font-semibold truncate">{boat.boat_name || boat.boat_type}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="a-lb-cls"><Sailboat size={11} />{boat.boat_type}{boat.sail_number && <span className="a-dim" style={{ fontWeight: 500, letterSpacing: 0 }}>{boat.sail_number}</span>}</span>
                        {boat.hull_number && <span className="a-dim text-[12px]">Hull {boat.hull_number}</span>}
                      </div>
                    </div>
                    {boat.handicap !== undefined && boat.handicap !== null && (
                      <span className="a-dim text-[12.5px]">Handicap <b className="a-num a-ink">{boat.handicap}</b></span>
                    )}
                    <ChevronRight size={16} className="a-dim" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="a-grp a-empty text-center" style={{ padding: 18 }}>
                <p className="a-dim text-[13px] mb-2">No boats registered</p>
                <button onClick={() => setShowEditModal(true)} className="a-btn a-btn-q a-txt-b" style={{ height: 32, fontSize: 13 }}>Add a boat</button>
              </div>
            )}
          </div>

          <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
            {section(<FileText size={16} />, 'Payment history', `${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`)}
            {payments.length > 0 ? (
              <div className="a-grp">
                {payments.map((payment) => {
                  const paid = payment.status === 'paid' || payment.status === 'completed';
                  return (
                    <div key={payment.id} className="a-ir">
                      <span className={`a-tile a-tile-sm ${paid ? 'a-txt-g' : 'a-txt-a'}`}>{paid ? <CheckCircle size={15} /> : <Clock size={15} />}</span>
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[14.5px] font-semibold truncate">{payment.description || 'Membership payment'}</div>
                        <div className="a-dim text-[12.5px] mt-0.5">{fmtShort(payment.payment_date)} · {payment.payment_method?.replace('_', ' ') || 'N/A'} · <span className={paid ? 'a-txt-g' : 'a-txt-a'}>{paid ? 'Paid' : (payment.status || 'Pending')}</span></div>
                      </div>
                      <span className="a-num a-ink text-[15px] font-semibold">${payment.amount?.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="a-grp a-empty text-center" style={{ padding: 18 }}>
                <p className="a-dim text-[13px]">No payment history yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showEditModal && memberData && currentClub?.clubId && (
        <MemberEditModal
          isOpen={showEditModal}
          onClose={() => { setShowEditModal(false); setEditModalTab(undefined); }}
          memberId={memberData.id}
          clubId={currentClub.clubId}
          darkMode={darkMode}
          onSuccess={handleEditSuccess}
          initialTab={editModalTab}
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
                {migrationNotice && (
                  <div className="mb-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                    <ArrowRightLeft size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Membership Type Updated</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Your previous "{migrationNotice.from}" membership has been replaced by "{migrationNotice.to}".
                        This has been pre-selected for you below.
                      </p>
                    </div>
                  </div>
                )}

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
                  <div className={`grid ${clubHasStripe ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                    {clubHasStripe && (
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
                    )}
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

                {selectedPaymentMethod === 'bank_transfer' && bankDetails && (
                  <div className="mb-6 bg-slate-800/60 border border-sky-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Landmark className="w-5 h-5 text-sky-400" />
                      <h3 className="text-white font-semibold text-sm">Bank Transfer Details</h3>
                    </div>
                    <p className="text-slate-400 text-xs mb-4">
                      Please transfer the membership fee to the following account using your name as the payment reference:
                    </p>
                    <div className="space-y-3">
                      {bankDetails.bank_name && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-500 text-xs">Bank</p>
                            <p className="text-white text-sm font-medium">{bankDetails.bank_name}</p>
                          </div>
                        </div>
                      )}
                      {bankDetails.bsb && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-500 text-xs">BSB</p>
                            <p className="text-white text-sm font-medium font-mono">{bankDetails.bsb}</p>
                          </div>
                          <button
                            onClick={() => handleCopyBankField(bankDetails.bsb, 'bsb-modal')}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                          >
                            {copiedField === 'bsb-modal' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                      {bankDetails.account_number && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-slate-500 text-xs">Account Number</p>
                            <p className="text-white text-sm font-medium font-mono">{bankDetails.account_number}</p>
                          </div>
                          <button
                            onClick={() => handleCopyBankField(bankDetails.account_number, 'acc-modal')}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                          >
                            {copiedField === 'acc-modal' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-700/50">
                      <p className="text-slate-500 text-xs">
                        Reference: <span className="text-slate-300">Your full name</span>
                      </p>
                    </div>
                  </div>
                )}

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
                    className="btn-primary-green flex-1 px-4 py-2.5 from-blue-600 to-cyan-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processingPayment ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Processing...
                      </div>
                    ) : (
                      selectedPaymentMethod === 'credit_card' ? 'Continue to Payment' : 'Submit Membership Renewal'
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
