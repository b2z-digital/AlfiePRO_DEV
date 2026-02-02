import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Search, Filter, Mail, Phone, Calendar, DollarSign, Check, X, Eye, Edit, Trash2, Download, Send, AlertTriangle, CheckCircle, Clock, CreditCard, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { MembershipFormModal } from './MembershipFormModal';
import { AdminAddMemberModal } from '../AdminAddMemberModal';
import { sendWelcomeEmail, sendRenewalReminder, sendPaymentConfirmation } from '../../utils/membershipUtils';
import { MembershipApplicationsPanel } from '../MembershipApplicationsPanel';

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  date_joined?: string;
  membership_level?: string;
  membership_level_custom?: string;
  is_financial: boolean;
  amount_paid?: number;
  renewal_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  status?: 'pending' | 'approved' | 'rejected';
}

interface MembershipPayment {
  member_id: string;
  status: string;
  amount: number;
}

interface MembershipApplicationsManagerProps {
  darkMode: boolean;
}

export const MembershipApplicationsManager: React.FC<MembershipApplicationsManagerProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'financial' | 'non-financial' | 'pending'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdminAddModal, setShowAdminAddModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showMemberDetails, setShowMemberDetails] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [editingFinancialStatus, setEditingFinancialStatus] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchApplications();
    }
  }, [currentClub]);

  useEffect(() => {
    filterMembers();
  }, [members, searchTerm, filterStatus]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilterDropdown]);

  const fetchApplications = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch members
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('created_at', { ascending: false });

      if (membersError) throw membersError;

      // Fetch payment information for each member
      const memberIds = membersData?.map(member => member.id) || [];
      let paymentsData: any[] = [];

      if (memberIds.length > 0) {
        const { data, error: paymentsError } = await supabase
          .from('membership_payments')
          .select('member_id, status, amount')
          .in('member_id', memberIds);

        if (paymentsError) throw paymentsError;
        paymentsData = data || [];
      }

      // Combine member data with payment information
      const membersWithPayments = (membersData || []).map(member => {
        const payment = paymentsData.find(p => p.member_id === member.id);
        return {
          ...member,
          payment_status: payment?.status || 'none',
          payment_amount: payment?.amount || 0
        };
      });

      setMembers(membersWithPayments);
    } catch (err) {
      console.error('Error fetching applications:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch applications');
    } finally {
      setLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = members;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(member =>
        `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.phone?.includes(searchTerm)
      );
    }

    // Apply status filter
    switch (filterStatus) {
      case 'financial':
        filtered = filtered.filter(member => member.is_financial);
        break;
      case 'non-financial':
        filtered = filtered.filter(member => !member.is_financial);
        break;
      case 'pending':
        filtered = filtered.filter(member => member.status === 'pending' || (member as any).payment_status === 'pending');
        break;
    }

    setFilteredMembers(filtered);
  };

  const handleApproveApplication = async (memberId: string) => {
    try {
      setError(null);
      
      const { error } = await supabase
        .from('members')
        .update({ status: 'approved' })
        .eq('id', memberId);
      
      if (error) throw error;
      
      await fetchApplications();
    } catch (err) {
      console.error('Error approving application:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve application');
    }
  };

  const handleRejectApplication = async (memberId: string) => {
    try {
      setError(null);
      
      const { error } = await supabase
        .from('members')
        .update({ status: 'rejected' })
        .eq('id', memberId);
      
      if (error) throw error;
      
      await fetchApplications();
    } catch (err) {
      console.error('Error rejecting application:', err);
      setError(err instanceof Error ? err.message : 'Failed to reject application');
    }
  };

  const handleToggleFinancialStatus = async (memberId: string, currentStatus: boolean) => {
    try {
      setError(null);
      setEditingFinancialStatus(memberId);
      
      const { error } = await supabase
        .from('members')
        .update({ is_financial: !currentStatus })
        .eq('id', memberId);
      
      if (error) throw error;
      
      await fetchApplications();
    } catch (err) {
      console.error('Error updating financial status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update financial status');
    } finally {
      setEditingFinancialStatus(null);
    }
  };

  const handleApproveMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('members')
        .update({ 
          is_financial: true,
          renewal_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 year from now
        })
        .eq('id', memberId);

      if (error) throw error;

      // Send welcome email
      const member = members.find(m => m.id === memberId);
      if (member && currentClub?.club) {
        await sendWelcomeEmail({
          first_name: member.first_name,
          last_name: member.last_name,
          email: member.email,
          club_name: currentClub.club.name,
          club_id: currentClub.clubId,
          user_id: member.user_id
        });
      }

      await fetchApplications();
    } catch (err) {
      console.error('Error approving member:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve member');
    }
  };

  const handleRejectMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to reject this membership application?')) return;

    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      await fetchApplications();
    } catch (err) {
      console.error('Error rejecting member:', err);
      setError(err instanceof Error ? err.message : 'Failed to reject member');
    }
  };

  const handleSendRenewalReminders = async () => {
    try {
      setSendingEmails(true);
      setError(null);

      // Get members whose renewal is due within 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const membersToRemind = members.filter(member => {
        if (!member.renewal_date || member.is_financial) return false;
        const renewalDate = new Date(member.renewal_date);
        return renewalDate <= thirtyDaysFromNow;
      });

      let successCount = 0;
      for (const member of membersToRemind) {
        try {
          if (currentClub?.club) {
            await sendRenewalReminder({
              first_name: member.first_name,
              last_name: member.last_name,
              email: member.email,
              club_name: currentClub.club.name,
              renewal_date: member.renewal_date!,
              club_id: currentClub.clubId,
              user_id: member.user_id
            });
            successCount++;
          }
        } catch (err) {
          console.error(`Failed to send reminder to ${member.email}:`, err);
        }
      }

      setEmailSuccess(`Sent ${successCount} renewal reminder${successCount !== 1 ? 's' : ''}`);
      setTimeout(() => setEmailSuccess(null), 5000);
    } catch (err) {
      console.error('Error sending renewal reminders:', err);
      setError(err instanceof Error ? err.message : 'Failed to send renewal reminders');
    } finally {
      setSendingEmails(false);
    }
  };

  const getStatusBadge = (member: Member & { payment_status?: string }) => {
    if (member.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded-full">
          <Clock size={12} />
          Pending Approval
        </span>
      );
    }

    if (member.is_financial) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600/20 text-green-400 rounded-full">
          <CheckCircle size={12} />
          Financial
        </span>
      );
    }

    if (member.payment_status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded-full">
          <Clock size={12} />
          Payment Pending
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded-full">
        <X size={12} />
        Non-Financial
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
          <AlertTriangle className="text-red-400 mt-0.5" size={18} />
          <div>
            <h3 className="text-red-400 font-medium">Error</h3>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Pending Applications Panel */}
      {currentClub?.clubId && (
        <MembershipApplicationsPanel
          clubId={currentClub.clubId}
          darkMode={darkMode}
          onApplicationProcessed={fetchApplications}
        />
      )}

      {emailSuccess && (
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30 flex items-start gap-3">
          <CheckCircle className="text-green-400 mt-0.5" size={18} />
          <div>
            <h3 className="text-green-400 font-medium">Success</h3>
            <p className="text-green-300 text-sm">{emailSuccess}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-blue-400" size={32} />
          <div>
            <h2 className="text-2xl font-bold text-white">Membership Applications</h2>
            <p className="text-slate-400">
              Manage membership applications and member status
            </p>
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative w-80">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 placeholder-slate-400 rounded-lg transition-colors"
              />
            </div>
          )}

          {!showSearch && (
            <button
              onClick={() => setShowSearch(true)}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
              title="Search"
            >
              <Search size={18} />
            </button>
          )}

          {/* Filter Dropdown */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-200"
            >
              <Filter size={16} />
              Filters
              <ChevronDown size={16} />
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-80 rounded-lg shadow-xl border py-3 z-50 bg-slate-800 border-slate-700">
                {/* Status Filter */}
                <div className="px-4 py-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 block">
                    Status
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterStatus('all')}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        filterStatus === 'all'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      All Members
                    </button>
                    <button
                      onClick={() => setFilterStatus('financial')}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        filterStatus === 'financial'
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      Financial
                    </button>
                    <button
                      onClick={() => setFilterStatus('non-financial')}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        filterStatus === 'non-financial'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      Non-Financial
                    </button>
                    <button
                      onClick={() => setFilterStatus('pending')}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${
                        filterStatus === 'pending'
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      Pending
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSendRenewalReminders}
            disabled={sendingEmails}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {sendingEmails ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Sending...
              </>
            ) : (
              <>
                <Send size={16} />
                Send Renewal Reminders
              </>
            )}
          </button>

          <button
            onClick={() => setShowAdminAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Plus size={16} />
            Add Member
          </button>
        </div>
      </div>

      {/* Members List */}
      <div className={`
        rounded-xl border backdrop-blur-sm overflow-hidden
        ${darkMode 
          ? 'bg-slate-800/30 border-slate-700/50' 
          : 'bg-white/10 border-slate-200/20'}
      `}>
        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center">
            <Users size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
            <p className="text-slate-400 mb-2">No members found</p>
            <p className="text-sm text-slate-500">
              {searchTerm || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Add your first member to get started'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Member</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Contact</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Joined</th>
                  <th className="text-left p-4 text-sm font-medium text-slate-400">Renewal</th>
                  <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr 
                    key={member.id}
                    className={`
                      border-b transition-colors
                      ${darkMode 
                        ? 'border-slate-700 hover:bg-slate-700/50' 
                        : 'border-slate-200 hover:bg-slate-50'}
                    `}
                  >
                    <td className="p-4">
                      <div>
                        <p className="font-medium text-white">
                          {member.first_name} {member.last_name}
                        </p>
                        {member.membership_level && (
                          <p className="text-xs text-slate-400">
                            {member.membership_level_custom || member.membership_level}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm text-slate-300">
                          <Mail size={12} />
                          {member.email}
                        </div>
                        {member.phone && (
                          <div className="flex items-center gap-2 text-sm text-slate-400">
                            <Phone size={12} />
                            {member.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {member.status === 'pending' ? (
                        getStatusBadge(member as any)
                      ) : (
                        <div className="flex items-center gap-2">
                          {getStatusBadge(member as any)}
                          <button
                            onClick={() => handleToggleFinancialStatus(member.id, member.is_financial)}
                            disabled={editingFinancialStatus === member.id}
                            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                            title="Toggle financial status"
                          >
                            {editingFinancialStatus === member.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <Edit size={14} />
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Calendar size={12} />
                        {member.date_joined ? formatDate(member.date_joined) : 'N/A'}
                      </div>
                    </td>
                    <td className="p-4">
                      {member.renewal_date ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Calendar size={12} />
                          {formatDate(member.renewal_date)}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-sm">N/A</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        {member.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => handleApproveApplication(member.id)}
                              className="p-2 text-green-400 hover:text-green-300 transition-colors"
                              title="Approve application"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={() => handleRejectApplication(member.id)}
                              className="p-2 text-red-400 hover:text-red-300 transition-colors"
                              title="Reject application"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setSelectedMember(member);
                                setShowMemberDetails(true);
                              }}
                              className="p-2 text-slate-400 hover:text-white transition-colors"
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>

                            {!member.is_financial && (
                              <button
                                onClick={() => handleApproveMember(member.id)}
                                className="p-2 text-green-400 hover:text-green-300 transition-colors"
                                title="Approve membership"
                              >
                                <Check size={16} />
                              </button>
                            )}

                            <button
                              onClick={() => handleRejectMember(member.id)}
                              className="p-2 text-red-400 hover:text-red-300 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Member Details Modal */}
      {showMemberDetails && selectedMember && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-2xl rounded-xl shadow-xl overflow-hidden
            ${darkMode ? 'bg-slate-800' : 'bg-white'}
          `}>
            <div className={`
              flex items-center justify-between p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Member Details
              </h2>
              <button
                onClick={() => setShowMemberDetails(false)}
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

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Personal Information
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Name
                      </label>
                      <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                        {selectedMember.first_name} {selectedMember.last_name}
                      </p>
                    </div>
                    <div>
                      <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Email
                      </label>
                      <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                        {selectedMember.email}
                      </p>
                    </div>
                    {selectedMember.phone && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Phone
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {selectedMember.phone}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Membership Information
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Status
                      </label>
                      <div className="mt-1">
                        {getStatusBadge(selectedMember as any)}
                      </div>
                    </div>
                    {selectedMember.date_joined && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Date Joined
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {formatDate(selectedMember.date_joined)}
                        </p>
                      </div>
                    )}
                    {selectedMember.renewal_date && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Renewal Date
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {formatDate(selectedMember.renewal_date)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(selectedMember.street || selectedMember.city) && (
                <div>
                  <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Address
                  </h3>
                  <div className="space-y-1">
                    {selectedMember.street && (
                      <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                        {selectedMember.street}
                      </p>
                    )}
                    <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                      {[selectedMember.city, selectedMember.state, selectedMember.postcode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {(selectedMember.emergency_contact_name || selectedMember.emergency_contact_phone) && (
                <div>
                  <h3 className={`text-lg font-medium mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Emergency Contact
                  </h3>
                  <div className="space-y-2">
                    {selectedMember.emergency_contact_name && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Name
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {selectedMember.emergency_contact_name}
                        </p>
                      </div>
                    )}
                    {selectedMember.emergency_contact_phone && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Phone
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {selectedMember.emergency_contact_phone}
                        </p>
                      </div>
                    )}
                    {selectedMember.emergency_contact_relationship && (
                      <div>
                        <label className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Relationship
                        </label>
                        <p className={darkMode ? 'text-white' : 'text-slate-800'}>
                          {selectedMember.emergency_contact_relationship}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={`
              flex justify-end gap-3 p-6 border-t
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              {!selectedMember.is_financial && (
                <button
                  onClick={() => {
                    handleApproveMember(selectedMember.id);
                    setShowMemberDetails(false);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Approve Membership
                </button>
              )}
              <button
                onClick={() => setShowMemberDetails(false)}
                className={`
                  px-4 py-2 rounded-lg transition-colors
                  ${darkMode
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                `}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      <AdminAddMemberModal
        isOpen={showAdminAddModal}
        onClose={() => setShowAdminAddModal(false)}
        darkMode={darkMode}
        clubId={currentClub?.clubId || ''}
        onSuccess={() => {
          setShowAdminAddModal(false);
          fetchApplications();
        }}
      />
    </div>
  );
};