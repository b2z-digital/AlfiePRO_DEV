import React, { useState, useEffect } from 'react';
import { Building2, Plus, Crown, Users, Calendar, CreditCard, CircleAlert as AlertCircle, Star, Landmark, Copy, Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { JoinAnotherClubModal } from './JoinAnotherClubModal';

interface ClubMembership {
  id: string;
  club_id: string;
  relationship_type: string;
  status: string;
  payment_status: string;
  joined_date: string;
  expiry_date: string;
  pays_association_fees: boolean;
  annual_fee_amount: number;
  clubs: {
    id: string;
    name: string;
    abbreviation: string;
    logo: string | null;
  };
}

interface MyClubMembershipsWidgetProps {
  darkMode: boolean;
}

export const MyClubMembershipsWidget: React.FC<MyClubMembershipsWidgetProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [totalFees, setTotalFees] = useState<{
    total: number;
    paid: number;
    pending: number;
  }>({ total: 0, paid: 0, pending: 0 });
  const [defaultClubId, setDefaultClubId] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [expandedBankDetails, setExpandedBankDetails] = useState<string | null>(null);
  const [bankDetailsCache, setBankDetailsCache] = useState<Record<string, { bank_name: string; bsb: string; account_number: string } | null>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (effectiveUserId) {
      fetchMemberships();
      fetchDefaultClub();
    }
  }, [effectiveUserId]);

  const fetchDefaultClub = async () => {
    if (!effectiveUserId) return;
    const { data } = await supabase
      .from('profiles')
      .select('default_club_id')
      .eq('id', effectiveUserId)
      .maybeSingle();

    setDefaultClubId(data?.default_club_id || null);
  };

  const handleSetDefault = async (clubId: string) => {
    if (!effectiveUserId || isImpersonating) return;

    setSettingDefault(clubId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ default_club_id: clubId })
        .eq('id', effectiveUserId);

      if (error) throw error;
      setDefaultClubId(clubId);
    } catch (err) {
      console.error('Error setting default club:', err);
    } finally {
      setSettingDefault(null);
    }
  };

  const fetchMemberships = async () => {
    if (!effectiveUserId) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          clubs:club_id (
            id,
            name,
            abbreviation,
            logo
          )
        `)
        .eq('member_id', effectiveUserId)
        .in('status', ['active', 'pending'])
        .order('relationship_type', { ascending: false });

      if (error) throw error;

      setMemberships(data || []);

      const total = data?.reduce((sum, m) => sum + parseFloat(m.annual_fee_amount || '0'), 0) || 0;
      const paid = data?.filter(m => m.payment_status === 'paid').reduce((sum, m) => sum + parseFloat(m.annual_fee_amount || '0'), 0) || 0;
      const pending = total - paid;

      setTotalFees({ total, paid, pending });
    } catch (err) {
      console.error('Error fetching memberships:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRelationshipBadge = (type: string) => {
    switch (type) {
      case 'primary':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/20">
            <Crown className="w-3 h-3 mr-1" />
            Primary
          </span>
        );
      case 'associate':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20">
            <Users className="w-3 h-3 mr-1" />
            Associate
          </span>
        );
      case 'social':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/15 text-green-400 border border-green-500/20">
            Social
          </span>
        );
      case 'family':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/20">
            Family
          </span>
        );
      default:
        return null;
    }
  };

  const handleCopyBankField = (value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleBankDetails = async (clubId: string) => {
    if (expandedBankDetails === clubId) {
      setExpandedBankDetails(null);
      return;
    }

    if (!bankDetailsCache[clubId]) {
      const { data } = await supabase
        .from('clubs')
        .select('bank_name, bsb, account_number')
        .eq('id', clubId)
        .maybeSingle();

      setBankDetailsCache(prev => ({
        ...prev,
        [clubId]: data && (data.bank_name || data.bsb || data.account_number) ? data : null
      }));
    }

    setExpandedBankDetails(clubId);
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center text-xs font-medium text-green-400">
            <div className="w-1.5 h-1.5 rounded-full mr-1.5"></div>
            Paid
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center text-xs font-medium text-yellow-400">
            <Clock className="w-3 h-3 mr-1" />
            Pending Payment
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center text-xs font-medium text-red-400">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"></div>
            Unpaid
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center text-xs font-medium text-yellow-400">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mr-1.5"></div>
            Partial
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center text-xs font-medium text-red-400">
            <AlertCircle className="w-3 h-3 mr-1" />
            Overdue
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50 backdrop-blur-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-700/50 rounded w-1/3"></div>
          <div className="h-20 bg-slate-700/40 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="a-card flex flex-col gap-3.5" style={{ padding: '18px 20px' }}>
        <div className="flex items-center gap-3">
          <span className="a-tile a-tile-sm"><Building2 size={16} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display a-ink m-0 text-[18px] font-semibold">My clubs</h2>
            <p className="a-dim mt-0.5 text-[12.5px]">{memberships.length} {memberships.length === 1 ? 'club' : 'clubs'}</p>
          </div>
          <button onClick={() => setShowJoinModal(true)} className="a-btn" style={{ height: 36 }}>
            <Plus size={16} />
            <span>Join another club</span>
          </button>
        </div>

        {totalFees.total > 0 && memberships.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="a-grp" style={{ padding: '10px 12px' }}><p className="a-cap">Annual fees</p><p className="a-num a-ink text-[16px] font-semibold mt-1">${totalFees.total.toFixed(2)}</p></div>
            <div className="a-grp" style={{ padding: '10px 12px' }}><p className="a-cap">Paid</p><p className="a-num a-txt-g text-[16px] font-semibold mt-1">${totalFees.paid.toFixed(2)}</p></div>
            <div className="a-grp" style={{ padding: '10px 12px' }}><p className="a-cap">Pending</p><p className="a-num a-txt-a text-[16px] font-semibold mt-1">${totalFees.pending.toFixed(2)}</p></div>
          </div>
        )}

        {memberships.length === 0 ? (
          <div className="a-grp a-empty text-center" style={{ padding: 22 }}>
            <p className="a-ink text-[14px] font-semibold mb-1">No club memberships</p>
            <p className="a-dim text-[12.5px] mb-3">Join a club to start racing and tracking your results</p>
            <button onClick={() => setShowJoinModal(true)} className="a-btn a-btn-p mx-auto" style={{ height: 36 }}>
              <Plus size={16} />Join a club
            </button>
          </div>
        ) : (
          <div className="a-grp">
            {memberships.map((membership) => {
              const isUnpaid = membership.payment_status === 'unpaid' || membership.payment_status === 'pending' || membership.payment_status === 'overdue';
              const isExpanded = expandedBankDetails === membership.club_id;
              const details = bankDetailsCache[membership.club_id];
              const tone = membership.payment_status === 'paid' ? 'g' : membership.payment_status === 'unpaid' || membership.payment_status === 'overdue' ? 'r' : 'a';
              const statusLabel = membership.payment_status === 'paid' ? 'Paid' : membership.payment_status === 'pending' ? 'Pending' : membership.payment_status === 'overdue' ? 'Overdue' : membership.payment_status === 'unpaid' ? 'Unpaid' : (membership.payment_status || '—');
              const rel = membership.relationship_type;
              const isDefault = defaultClubId === membership.club_id;

              return (
                <div key={membership.id} className="a-club-row">
                  <div
                    className={`a-ir ${isUnpaid ? 'cursor-pointer' : ''}`}
                    onClick={isUnpaid ? () => toggleBankDetails(membership.club_id) : undefined}
                  >
                    {membership.clubs.logo ? (
                      <img src={membership.clubs.logo} alt="" className="a-club-logo" />
                    ) : (
                      <span className="a-tile" style={{ width: 42, height: 42, borderRadius: 12 }}><Building2 size={18} /></span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="a-ink text-[15px] font-semibold truncate">{membership.clubs.name}</span>
                        {rel === 'primary' && <span className="a-lb-fmt a-txt-a" style={{ height: 22, fontSize: 11.5 }}>★ Primary</span>}
                        {rel && rel !== 'primary' && <span className="a-lb-fmt capitalize" style={{ height: 22, fontSize: 11.5 }}>{rel}</span>}
                        {memberships.length > 1 && isDefault && <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><Star size={11} className="fill-current a-txt-a" />Default</span>}
                      </div>
                      <div className="a-dim text-[12.5px] mt-[3px]">
                        Joined {new Date(membership.joined_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} · ${parseFloat(membership.annual_fee_amount || '0').toFixed(2)} / year
                      </div>
                      {!membership.pays_association_fees && rel === 'associate' && (
                        <div className="a-dim text-[11.5px] mt-1 flex items-center gap-1"><AlertCircle size={12} />State and national fees covered by primary membership</div>
                      )}
                    </div>
                    {memberships.length > 1 && !isDefault && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSetDefault(membership.club_id); }}
                        disabled={settingDefault === membership.club_id}
                        className="a-btn a-btn-q disabled:opacity-50"
                        style={{ height: 30, fontSize: 12, padding: '0 10px' }}
                      >
                        {settingDefault === membership.club_id ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current" /> : <Star size={13} />}
                        Set default
                      </button>
                    )}
                    <span className="a-st text-[13px]"><span className={`a-light a-light-${tone}`} />{statusLabel}</span>
                    {isUnpaid && (isExpanded ? <ChevronUp size={16} className="a-dim" /> : <ChevronDown size={16} className="a-dim" />)}
                  </div>
                  {isExpanded && details && (
                    <div style={{ padding: '0 16px 14px' }}>
                      <div className="a-grp">
                        {details.bank_name && <div className="a-ir"><span className="a-ir-l"><Landmark size={15} />Bank</span><span className="a-ir-v">{details.bank_name}</span></div>}
                        {details.bsb && (
                          <div className="a-ir">
                            <span className="a-ir-l"><Landmark size={15} />BSB</span>
                            <span className="a-ir-v a-mono">{details.bsb}</span>
                            <button onClick={(e) => { e.stopPropagation(); handleCopyBankField(details.bsb, `bsb-${membership.club_id}`); }} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Copy BSB">
                              {copiedField === `bsb-${membership.club_id}` ? <Check size={14} className="a-txt-g" /> : <Copy size={14} />}
                            </button>
                          </div>
                        )}
                        {details.account_number && (
                          <div className="a-ir">
                            <span className="a-ir-l"><Landmark size={15} />Account</span>
                            <span className="a-ir-v a-mono">{details.account_number}</span>
                            <button onClick={(e) => { e.stopPropagation(); handleCopyBankField(details.account_number, `acc-${membership.club_id}`); }} className="a-ib" style={{ width: 30, height: 30 }} aria-label="Copy account number">
                              {copiedField === `acc-${membership.club_id}` ? <Check size={14} className="a-txt-g" /> : <Copy size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="a-dim text-[11.5px] mt-2">Complete the bank transfer and let your club administrator know so they can confirm payment.</p>
                    </div>
                  )}
                  {isExpanded && !details && bankDetailsCache.hasOwnProperty(membership.club_id) && (
                    <p className="a-dim text-[12px] text-center" style={{ padding: '0 16px 14px' }}>No bank details are set up for this club. Please contact the club administrator.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showJoinModal && (
        <JoinAnotherClubModal
          darkMode={darkMode}
          onClose={() => setShowJoinModal(false)}
          onSuccess={fetchMemberships}
        />
      )}
    </>
  );
};
