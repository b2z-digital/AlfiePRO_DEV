import React, { useState, useEffect } from 'react';
import { Building2, Plus, Crown, Users, Calendar, CreditCard, AlertCircle, ExternalLink, Star } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
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
    if (user) {
      fetchMemberships();
      fetchDefaultClub();
    }
  }, [user]);

  const fetchDefaultClub = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('default_club_id')
      .eq('id', user.id)
      .maybeSingle();

    setDefaultClubId(data?.default_club_id || null);
  };

  const handleSetDefault = async (clubId: string) => {
    if (!user) return;

    setSettingDefault(clubId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ default_club_id: clubId })
        .eq('id', user.id);

      if (error) throw error;
      setDefaultClubId(clubId);
    } catch (err) {
      console.error('Error setting default club:', err);
    } finally {
      setSettingDefault(null);
    }
  };

  const fetchMemberships = async () => {
    if (!user) return;

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
        .eq('member_id', user.id)
        .in('status', ['active', 'pending'])
        .order('relationship_type', { ascending: false }); // Primary first

      if (error) throw error;

      setMemberships(data || []);

      // Calculate total fees
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
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            <Crown className="w-3 h-3 mr-1" />
            Primary
          </span>
        );
      case 'associate':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
            <Users className="w-3 h-3 mr-1" />
            Associate
          </span>
        );
      case 'social':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Social
          </span>
        );
      case 'family':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
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
          <span className="inline-flex items-center text-xs font-medium text-green-600 dark:text-green-400">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>
            Paid
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center text-xs font-medium text-red-600 dark:text-red-400">
            <div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div>
            Unpaid
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center text-xs font-medium text-yellow-600 dark:text-yellow-400">
            <div className="w-2 h-2 rounded-full bg-yellow-500 mr-1"></div>
            Partial
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center text-xs font-medium text-red-600 dark:text-red-400">
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
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-20 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow`}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">My Club Memberships</h2>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {memberships.length} {memberships.length === 1 ? 'club' : 'clubs'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Join Another Club</span>
            </button>
          </div>
        </div>

        {/* Fee Summary */}
        {totalFees.total > 0 && (
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'}`}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Annual Fees</p>
                <p className="text-xl font-bold">${totalFees.total.toFixed(2)}</p>
              </div>
              <div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Paid</p>
                <p className="text-xl font-bold text-green-500">${totalFees.paid.toFixed(2)}</p>
              </div>
              <div>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Pending</p>
                <p className="text-xl font-bold text-orange-500">${totalFees.pending.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Memberships List */}
        <div className="p-6 space-y-4">
          {memberships.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                No Club Memberships
              </p>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                Join a club to start racing and tracking your results
              </p>
              <button
                onClick={() => setShowJoinModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Plus className="w-4 h-4" />
                <span>Join a Club</span>
              </button>
            </div>
          ) : (
            memberships.map((membership) => (
              <div
                key={membership.id}
                className={`p-4 rounded-lg border ${
                  darkMode ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-white'
                } hover:shadow-md transition-shadow`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {membership.clubs.logo ? (
                      <img
                        src={membership.clubs.logo}
                        alt={membership.clubs.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className={`w-12 h-12 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                        <Building2 className="w-6 h-6" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h3 className="font-semibold truncate">{membership.clubs.name}</h3>
                        {getRelationshipBadge(membership.relationship_type)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <div className="flex items-center space-x-1">
                          <Calendar className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                            Joined {new Date(membership.joined_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <CreditCard className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                          <span className="font-medium">
                            ${parseFloat(membership.annual_fee_amount || '0').toFixed(2)}/year
                          </span>
                        </div>
                        {getPaymentStatusBadge(membership.payment_status)}
                      </div>
                      {!membership.pays_association_fees && membership.relationship_type === 'associate' && (
                        <div className={`mt-2 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          State & national fees covered by primary membership
                        </div>
                      )}
                    </div>
                  </div>
                  {memberships.length > 1 && (
                    <div className="flex-shrink-0 ml-3">
                      {defaultClubId === membership.club_id ? (
                        <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          <Star className="w-3.5 h-3.5 mr-1 fill-current" />
                          Default
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(membership.club_id)}
                          disabled={settingDefault === membership.club_id}
                          className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            darkMode
                              ? 'text-gray-400 hover:text-amber-400 hover:bg-amber-900/20 border border-gray-700 hover:border-amber-500/30'
                              : 'text-gray-500 hover:text-amber-700 hover:bg-amber-50 border border-gray-200 hover:border-amber-300'
                          } disabled:opacity-50`}
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
