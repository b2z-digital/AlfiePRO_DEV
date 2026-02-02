import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Calendar,
  Mail,
  Phone,
  Clock,
  RefreshCw,
  Download,
  Search,
  Filter
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { formatDate } from '../../utils/date';

interface ExpiringMember {
  member_id: string;
  first_name: string;
  last_name: string;
  email: string;
  renewal_date: string;
  days_until_expiry: number;
  membership_level: string;
  is_financial: boolean;
  phone: string;
}

interface ExpiringMembershipsPanelProps {
  darkMode: boolean;
}

export const ExpiringMembershipsPanel: React.FC<ExpiringMembershipsPanelProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [expiringMembers, setExpiringMembers] = useState<ExpiringMember[]>([]);
  const [overdueMembers, setOverdueMembers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDays, setFilterDays] = useState(30);
  const [activeTab, setActiveTab] = useState<'expiring' | 'overdue'>('expiring');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchExpiringMemberships();
    }
  }, [currentClub, filterDays]);

  const fetchExpiringMemberships = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoading(true);

      // Fetch expiring memberships using the database function
      const { data: expiringData, error: expiringError } = await supabase
        .rpc('get_expiring_memberships', {
          p_club_id: currentClub.clubId,
          p_days_ahead: filterDays
        });

      if (expiringError) throw expiringError;

      // Fetch overdue memberships
      const { data: overdueData, error: overdueError } = await supabase
        .rpc('get_overdue_memberships', {
          p_club_id: currentClub.clubId
        });

      if (overdueError) throw overdueError;

      setExpiringMembers(expiringData || []);
      setOverdueMembers(overdueData || []);
    } catch (error) {
      console.error('Error fetching expiring memberships:', error);
      addNotification('error', 'Failed to load expiring memberships');
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (memberId: string) => {
    try {
      const { error } = await supabase.functions.invoke('send-renewal-reminder', {
        body: {
          member_id: memberId,
          club_id: currentClub?.clubId
        }
      });

      if (error) throw error;

      addNotification('success', 'Renewal reminder sent successfully');
    } catch (error) {
      console.error('Error sending reminder:', error);
      addNotification('error', 'Failed to send renewal reminder');
    }
  };

  const handleBulkSendReminders = async () => {
    if (selectedMembers.size === 0) {
      addNotification('error', 'Please select members to send reminders to');
      return;
    }

    try {
      const promises = Array.from(selectedMembers).map(memberId =>
        handleSendReminder(memberId)
      );

      await Promise.all(promises);
      setSelectedMembers(new Set());
      addNotification('success', `Sent ${selectedMembers.size} renewal reminders`);
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      addNotification('error', 'Failed to send some reminders');
    }
  };

  const handleExportCSV = () => {
    const members = activeTab === 'expiring' ? expiringMembers : overdueMembers;
    const csvContent = [
      ['Name', 'Email', 'Phone', 'Membership Level', 'Renewal Date', 'Status'],
      ...members.map(m => [
        `${m.first_name} ${m.last_name}`,
        m.email,
        m.phone || '',
        m.membership_level,
        m.renewal_date,
        activeTab === 'expiring' ? `${m.days_until_expiry} days left` : `${m.days_overdue} days overdue`
      ])
    ]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-memberships-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const toggleSelectMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const toggleSelectAll = () => {
    const members = activeTab === 'expiring' ? expiringMembers : overdueMembers;
    if (selectedMembers.size === members.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(members.map(m => m.member_id)));
    }
  };

  const filteredMembers = (activeTab === 'expiring' ? expiringMembers : overdueMembers).filter(
    (member) => {
      const searchLower = searchQuery.toLowerCase();
      return (
        member.first_name.toLowerCase().includes(searchLower) ||
        member.last_name.toLowerCase().includes(searchLower) ||
        member.email.toLowerCase().includes(searchLower)
      );
    }
  );

  const getUrgencyColor = (days: number) => {
    if (days <= 7) return 'text-red-400 bg-red-900/20 border-red-500/30';
    if (days <= 14) return 'text-orange-400 bg-orange-900/20 border-orange-500/30';
    return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Membership Renewals</h3>
          <p className="text-slate-400 text-sm mt-1">
            Monitor and manage upcoming membership renewals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchExpiringMemberships}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-400">Expiring Soon</p>
              <p className="text-2xl font-bold text-white mt-1">{expiringMembers.length}</p>
            </div>
            <AlertTriangle className="text-yellow-400" size={32} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-400">Overdue</p>
              <p className="text-2xl font-bold text-white mt-1">{overdueMembers.length}</p>
            </div>
            <Clock className="text-red-400" size={32} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-400">Selected</p>
              <p className="text-2xl font-bold text-white mt-1">{selectedMembers.size}</p>
            </div>
            <Mail className="text-blue-400" size={32} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700">
        <button
          onClick={() => {
            setActiveTab('expiring');
            setSelectedMembers(new Set());
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'expiring'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Expiring ({expiringMembers.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('overdue');
            setSelectedMembers(new Set());
          }}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'overdue'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          Overdue ({overdueMembers.length})
        </button>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {activeTab === 'expiring' && (
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-slate-400" />
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(parseInt(e.target.value))}
              className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </div>
        )}

        {selectedMembers.size > 0 && (
          <button
            onClick={handleBulkSendReminders}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Mail size={16} />
            Send Reminders ({selectedMembers.size})
          </button>
        )}
      </div>

      {/* Members List */}
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={48} className="mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              {searchQuery
                ? 'No members found matching your search'
                : activeTab === 'expiring'
                ? 'No memberships expiring in the selected period'
                : 'No overdue memberships'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedMembers.size === filteredMembers.length && filteredMembers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Member</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Contact</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Membership</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Renewal Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-300">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredMembers.map((member) => (
                  <tr key={member.member_id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.member_id)}
                        onChange={() => toggleSelectMember(member.member_id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-white font-medium">
                          {member.first_name} {member.last_name}
                        </span>
                        <span className="text-slate-400 text-sm">{member.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col text-sm text-slate-300">
                        {member.phone && (
                          <span className="flex items-center gap-1">
                            <Phone size={14} />
                            {member.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">{member.membership_level}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300">{formatDate(member.renewal_date)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {activeTab === 'expiring' ? (
                        <span className={`px-2 py-1 text-xs rounded-full border ${getUrgencyColor(member.days_until_expiry)}`}>
                          {member.days_until_expiry} days left
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full border text-red-400 bg-red-900/20 border-red-500/30">
                          {member.days_overdue} days overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleSendReminder(member.member_id)}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                      >
                        Send Reminder
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
