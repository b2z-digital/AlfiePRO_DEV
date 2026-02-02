import React, { useState, useEffect } from 'react';
import { X, Search, DollarSign, CheckCircle, Clock, Calendar, User, Filter, Download } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { Avatar } from '../ui/Avatar';
import { updateMembershipTransactionStatus } from '../../utils/membershipFinanceUtils';

interface PaymentReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode?: boolean;
}

interface PendingPayment {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  membership_level: string;
  date_joined: string;
  is_financial: boolean;
  user_id: string;
  avatar_url?: string;
  application_data?: {
    membership_amount?: number;
    payment_method?: string;
  };
}

export const PaymentReconciliationModal: React.FC<PaymentReconciliationModalProps> = ({
  isOpen,
  onClose,
  clubId,
  darkMode = true,
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pending' | 'financial'>('pending');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPendingPayments();
    }
  }, [isOpen, clubId, filterType]);

  const fetchPendingPayments = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('members')
        .select('*')
        .eq('club_id', clubId)
        .order('date_joined', { ascending: false });

      if (filterType === 'pending') {
        query = query.eq('payment_status', 'pending');
      } else if (filterType === 'financial') {
        query = query.eq('payment_status', 'paid');
      }

      const { data: members, error: membersError } = await query;

      if (membersError) throw membersError;

      const userIds = members.filter(m => m.user_id).map(m => m.user_id);
      let profiles: any[] = [];

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);

        profiles = profilesData || [];
      }

      const { data: applications } = await supabase
        .from('membership_applications')
        .select('user_id, membership_amount, payment_method')
        .eq('club_id', clubId)
        .eq('status', 'approved');

      const membersWithData = members.map(member => {
        const profile = profiles.find(p => p.id === member.user_id);
        const application = applications?.find(a => a.user_id === member.user_id);

        return {
          ...member,
          avatar_url: profile?.avatar_url,
          application_data: {
            membership_amount: application?.membership_amount,
            payment_method: application?.payment_method,
          },
        };
      });

      setPendingPayments(membersWithData);
    } catch (error: any) {
      console.error('Error fetching pending payments:', error);
      addNotification('error', 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (memberId: string, isPaid: boolean = false) => {
    try {
      setProcessing(true);

      const today = new Date();
      const renewalDate = new Date(today.setFullYear(today.getFullYear() + 1));
      const newStatus = !isPaid ? 'paid' : 'pending';

      const { error } = await supabase
        .from('members')
        .update({
          is_financial: !isPaid,
          payment_status: newStatus,
          payment_confirmed_at: !isPaid ? new Date().toISOString() : null,
          renewal_date: !isPaid ? renewalDate.toISOString().split('T')[0] : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId);

      if (error) throw error;

      // Update finance transaction status
      if (!isPaid) {
        console.log('Updating finance transaction for member:', memberId);
        const result = await updateMembershipTransactionStatus(memberId, 'paid');
        if (!result.success) {
          console.error('Failed to update finance transaction:', result.error);
        } else {
          console.log('Finance transaction updated successfully');
        }
      }

      addNotification('success', isPaid ? 'Marked as unpaid' : 'Payment confirmed');
      fetchPendingPayments();
      setSelectedMembers(new Set());
    } catch (error: any) {
      console.error('Error updating payment status:', error);
      addNotification('error', 'Failed to update payment status');
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkMarkAsPaid = async () => {
    if (selectedMembers.size === 0) return;

    try {
      setProcessing(true);

      const today = new Date();
      const renewalDate = new Date(today.setFullYear(today.getFullYear() + 1));

      const { error } = await supabase
        .from('members')
        .update({
          is_financial: true,
          payment_status: 'paid',
          payment_confirmed_at: new Date().toISOString(),
          renewal_date: renewalDate.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .in('id', Array.from(selectedMembers));

      if (error) throw error;

      // Update finance transactions for each member
      const memberIds = Array.from(selectedMembers);
      for (const memberId of memberIds) {
        await updateMembershipTransactionStatus(memberId, 'paid');
      }

      addNotification('success', `${selectedMembers.size} payment(s) confirmed`);
      fetchPendingPayments();
      setSelectedMembers(new Set());
    } catch (error: any) {
      console.error('Error updating payments:', error);
      addNotification('error', 'Failed to update payments');
    } finally {
      setProcessing(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    const newSelection = new Set(selectedMembers);
    if (newSelection.has(memberId)) {
      newSelection.delete(memberId);
    } else {
      newSelection.add(memberId);
    }
    setSelectedMembers(newSelection);
  };

  const selectAll = () => {
    const allIds = filteredMembers.map(m => m.id);
    setSelectedMembers(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedMembers(new Set());
  };

  const filteredMembers = pendingPayments.filter(member => {
    const matchesSearch =
      `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const pendingCount = pendingPayments.filter(m => m.payment_status === 'pending').length;
  const financialCount = pendingPayments.filter(m => m.payment_status === 'paid').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl ${
        darkMode ? 'bg-slate-800/95 backdrop-blur-xl border border-slate-700/50' : 'bg-white/95 backdrop-blur-xl border border-slate-200'
      } shadow-2xl`}>
        <div className={`sticky top-0 p-6 border-b ${darkMode ? 'border-slate-700/50 bg-slate-800/95 backdrop-blur-xl' : 'border-slate-200 bg-white/95 backdrop-blur-xl'}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Payment Reconciliation
              </h2>
              <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage membership payments and financial status
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
              }`}
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg ${
                    darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white text-slate-900 border-slate-300'
                  } border focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-cyan-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                All ({pendingPayments.length})
              </button>
              <button
                onClick={() => setFilterType('pending')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'pending'
                    ? 'bg-orange-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Clock size={16} className="inline mr-1" />
                Pending ({pendingCount})
              </button>
              <button
                onClick={() => setFilterType('financial')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'financial'
                    ? 'bg-green-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <CheckCircle size={16} className="inline mr-1" />
                Financial ({financialCount})
              </button>
            </div>
          </div>

          {selectedMembers.size > 0 && (
            <div className="mt-4 flex items-center justify-between p-3 bg-cyan-500/20 rounded-lg">
              <span className={`text-sm font-medium ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`}>
                {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={deselectAll}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  Deselect All
                </button>
                <button
                  onClick={handleBulkMarkAsPaid}
                  disabled={processing}
                  className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  Mark All as Paid
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-240px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Loading payments...
              </div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
              <div className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No members found
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
                </span>
                {filterType === 'pending' && filteredMembers.length > 0 && (
                  <button
                    onClick={selectAll}
                    className={`text-sm font-medium ${darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'}`}
                  >
                    Select All
                  </button>
                )}
              </div>

              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className={`p-4 rounded-lg border transition-all ${
                    selectedMembers.has(member.id)
                      ? darkMode ? 'border-cyan-500 bg-cyan-500/10' : 'border-cyan-500 bg-cyan-50'
                      : darkMode ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {member.payment_status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.id)}
                        onChange={() => toggleMemberSelection(member.id)}
                        className="w-5 h-5 rounded border-slate-600 text-cyan-500 focus:ring-2 focus:ring-cyan-500"
                      />
                    )}

                    <Avatar
                      name={`${member.first_name} ${member.last_name}`}
                      imageUrl={member.avatar_url}
                      size="md"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {member.first_name} {member.last_name}
                        </h3>
                        {member.payment_status === 'paid' ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                            <CheckCircle size={12} />
                            Paid
                          </span>
                        ) : member.payment_status === 'pending' ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded-full text-xs font-medium">
                            <Clock size={12} />
                            Pending
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                            <Clock size={12} />
                            Overdue
                          </span>
                        )}
                      </div>
                      <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {member.membership_level}
                        {member.email && ` • ${member.email}`}
                      </div>
                      <div className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        Joined {new Date(member.date_joined).toLocaleDateString()}
                        {member.application_data?.membership_amount && (
                          <> • ${member.application_data.membership_amount}</>
                        )}
                        {member.application_data?.payment_method === 'bank_transfer' && (
                          <> • Bank Transfer</>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleMarkAsPaid(member.id, member.payment_status === 'paid')}
                      disabled={processing}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                        member.payment_status === 'paid'
                          ? darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {member.payment_status === 'paid' ? 'Mark Unpaid' : 'Confirm Payment'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
