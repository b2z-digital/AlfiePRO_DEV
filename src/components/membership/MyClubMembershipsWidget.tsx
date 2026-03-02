import React, { useState, useEffect } from 'react';
import { Building2, Plus, Crown, Users, Calendar, CreditCard, AlertCircle, Star } from 'lucide-react';
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

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center text-xs font-medium text-green-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></div>
            Paid
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
      <div className="rounded-2xl bg-gradient-to-br from-slate-800/40 to-slate-900/40 border border-slate-700/50 backdrop-blur-sm overflow-hidden">
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/20">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-200">My Club Memberships</h2>
                <p className="text-xs text-slate-500">
                  {memberships.length} {memberships.length === 1 ? 'club' : 'clubs'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>Join Another Club</span>
            </button>
          </div>
        </div>

        {totalFees.total > 0 && (
          <div className="px-5 py-4 border-b border-slate-700/50 bg-slate-800/20">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Annual Fees</p>
                <p className="text-lg font-bold text-white">${totalFees.total.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Paid</p>
                <p className="text-lg font-bold text-green-400">${totalFees.paid.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Pending</p>
                <p className="text-lg font-bold text-orange-400">${totalFees.pending.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-5 space-y-3">
          {memberships.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-slate-700/30 border border-slate-600/30 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-7 h-7 text-slate-500" />
              </div>
              <p className="text-base font-medium text-slate-300 mb-1">
                No Club Memberships
              </p>
              <p className="text-sm text-slate-500 mb-5">
                Join a club to start racing and tracking your results
              </p>
              <button
                onClick={() => setShowJoinModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Join a Club</span>
              </button>
            </div>
          ) : (
            memberships.map((membership) => (
              <div
                key={membership.id}
                className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {membership.clubs.logo ? (
                      <img
                        src={membership.clubs.logo}
                        alt={membership.clubs.name}
                        className="w-11 h-11 rounded-xl object-cover ring-1 ring-slate-600/50 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-slate-700/50 border border-slate-600/30 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="font-semibold text-white text-sm truncate">{membership.clubs.name}</h3>
                        {getRelationshipBadge(membership.relationship_type)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-400">
                            Joined {new Date(membership.joined_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-300 font-medium">
                            ${parseFloat(membership.annual_fee_amount || '0').toFixed(2)}/year
                          </span>
                        </div>
                        {getPaymentStatusBadge(membership.payment_status)}
                      </div>
                      {!membership.pays_association_fees && membership.relationship_type === 'associate' && (
                        <div className="mt-2 text-[11px] text-slate-500">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          State & national fees covered by primary membership
                        </div>
                      )}
                    </div>
                  </div>
                  {memberships.length > 1 && (
                    <div className="flex-shrink-0 ml-3">
                      {defaultClubId === membership.club_id ? (
                        <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          <Star className="w-3.5 h-3.5 mr-1 fill-current" />
                          Default
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(membership.club_id)}
                          disabled={settingDefault === membership.club_id}
                          className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-[10px] font-medium text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border border-slate-700/50 hover:border-amber-500/20 transition-colors disabled:opacity-50"
                        >
                          {settingDefault === membership.club_id ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current mr-1"></div>
                          ) : (
                            <Star className="w-3.5 h-3.5 mr-1" />
                          )}
                          Set Default
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
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
