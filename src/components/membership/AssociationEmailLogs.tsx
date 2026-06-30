import React, { useState, useEffect } from 'react';
import { Mail, Search, RefreshCw, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Circle as XCircle, Clock, ListFilter as Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

interface EmailLog {
  id: string;
  club_id: string;
  recipient_email: string;
  subject: string;
  email_type: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  club_name?: string;
}

interface AssociationEmailLogsProps {
  darkMode: boolean;
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  welcome: 'Welcome',
  renewal_reminder: 'Renewal Reminder',
  renewal_pending: 'Renewal Pending',
  payment_confirmation: 'Payment Confirmation',
  application_approved: 'Application Approved',
  application_rejected: 'Application Rejected',
  application_received: 'Application Received',
  event: 'Event Invitation',
  membership_expired: 'Membership Expired',
  password_reset: 'Password Reset',
};

export const AssociationEmailLogs: React.FC<AssociationEmailLogsProps> = ({ darkMode }) => {
  const { currentOrganization } = useAuth();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterClub, setFilterClub] = useState<string>('all');
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, delivered: 0, failed: 0, clubsWithLogs: 0 });
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 50;

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchClubs().then((clubList) => {
        fetchLogs(true, clubList);
        fetchStats(clubList);
      });
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    if (currentOrganization?.id) {
      fetchLogs(true);
    }
  }, [filterType, filterStatus, filterClub, searchQuery]);

  const fetchClubs = async () => {
    const { data } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('state_association_id', currentOrganization!.id)
      .order('name');
    if (data) setClubs(data);
    return data || [];
  };

  const fetchStats = async (clubList: { id: string; name: string }[]) => {
    if (!currentOrganization?.id || clubList.length === 0) return;
    const clubIds = clubList.map(c => c.id);

    const { count: total } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .in('club_id', clubIds);

    const { count: delivered } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .in('club_id', clubIds)
      .eq('status', 'sent');

    const { count: failed } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .in('club_id', clubIds)
      .eq('status', 'failed');

    const { data: clubsWithLogsData } = await supabase
      .from('email_logs')
      .select('club_id')
      .in('club_id', clubIds);

    const uniqueClubs = new Set(clubsWithLogsData?.map(r => r.club_id) || []);

    setStats({
      total: total || 0,
      delivered: delivered || 0,
      failed: failed || 0,
      clubsWithLogs: uniqueClubs.size,
    });
  };

  const fetchLogs = async (reset = false, clubList?: { id: string; name: string }[]) => {
    if (!currentOrganization?.id) return;
    setLoading(true);

    const currentPage = reset ? 0 : page;
    if (reset) setPage(0);

    const availableClubs = clubList || clubs;
    const clubIds = availableClubs.length > 0
      ? availableClubs.map(c => c.id)
      : (await supabase
          .from('clubs')
          .select('id, name')
          .eq('state_association_id', currentOrganization.id)
        ).data?.map((c: { id: string; name: string }) => c.id) || [];

    if (clubIds.length === 0) {
      setLogs([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('email_logs')
      .select('*, clubs(name)')
      .in('club_id', filterClub !== 'all' ? [filterClub] : clubIds)
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (filterType !== 'all') {
      query = query.eq('email_type', filterType);
    }
    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus);
    }
    if (searchQuery.trim()) {
      query = query.or(`recipient_email.ilike.%${searchQuery.trim()}%,subject.ilike.%${searchQuery.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching email logs:', error);
      setLoading(false);
      return;
    }

    const enriched = (data || []).map((log: any) => ({
      ...log,
      club_name: log.clubs?.name || 'Unknown Club',
      clubs: undefined,
    }));

    if (reset) {
      setLogs(enriched);
    } else {
      setLogs(prev => [...prev, ...enriched]);
    }
    setHasMore((data || []).length === PAGE_SIZE);
    setLoading(false);
  };

  const loadMore = () => {
    setPage(prev => prev + 1);
    fetchLogs(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle size={14} className="text-green-500" />;
      case 'failed':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <Clock size={14} className="text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      sent: darkMode ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-green-50 text-green-700 border-green-200',
      failed: darkMode ? 'bg-red-900/30 text-red-400 border-red-800/50' : 'bg-red-50 text-red-700 border-red-200',
      pending: darkMode ? 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50' : 'bg-yellow-50 text-yellow-700 border-yellow-200',
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border ${darkMode ? 'border-gray-600/50' : 'border-gray-200'}`}>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Total Emails</div>
          <div className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{stats.total}</div>
        </div>
        <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border ${darkMode ? 'border-gray-600/50' : 'border-gray-200'}`}>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Delivered</div>
          <div className="text-xl font-bold text-green-500">{stats.delivered}</div>
        </div>
        <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border ${darkMode ? 'border-gray-600/50' : 'border-gray-200'}`}>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Failed</div>
          <div className="text-xl font-bold text-red-500">{stats.failed}</div>
        </div>
        <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} border ${darkMode ? 'border-gray-600/50' : 'border-gray-200'}`}>
          <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Clubs</div>
          <div className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{stats.clubsWithLogs}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            placeholder="Search by email or subject..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder:text-gray-400'
            } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          />
        </div>

        <select
          value={filterClub}
          onChange={e => setFilterClub(e.target.value)}
          className={`px-3 py-2 rounded-lg text-sm border ${
            darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          <option value="all">All Clubs</option>
          {clubs.map(club => (
            <option key={club.id} value={club.id}>{club.name}</option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className={`px-3 py-2 rounded-lg text-sm border ${
            darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          <option value="all">All Types</option>
          {Object.entries(EMAIL_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={`px-3 py-2 rounded-lg text-sm border ${
            darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
          }`}
        >
          <option value="all">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={() => fetchLogs(true)}
          className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1.5 ${
            darkMode ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Log Table */}
      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-blue-500 mr-2" />
          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Loading email logs...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <Mail size={40} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">No email logs found matching your filters.</p>
        </div>
      ) : (
        <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Status</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Date</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Club</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Recipient</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Type</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Subject</th>
                  <th className={`px-4 py-3 text-left font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
                {logs.map(log => (
                  <React.Fragment key={log.id}>
                    <tr
                      className={`cursor-pointer transition-colors ${
                        darkMode ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                      } ${expandedLog === log.id ? (darkMode ? 'bg-gray-800/50' : 'bg-blue-50/50') : ''}`}
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <td className="px-4 py-2.5">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadge(log.status)}`}>
                          {getStatusIcon(log.status)}
                          {log.status}
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 whitespace-nowrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {log.sent_at ? formatDate(log.sent_at) : formatDate(log.created_at)}
                      </td>
                      <td className={`px-4 py-2.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="truncate max-w-[150px] block">{log.club_name}</span>
                      </td>
                      <td className={`px-4 py-2.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="truncate max-w-[200px] block">{log.recipient_email}</span>
                      </td>
                      <td className={`px-4 py-2.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {EMAIL_TYPE_LABELS[log.email_type] || log.email_type}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="truncate max-w-[250px] block">{log.subject}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {expandedLog === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {expandedLog === log.id && (
                      <tr>
                        <td colSpan={7} className={`px-4 py-3 ${darkMode ? 'bg-gray-800/30' : 'bg-gray-50/80'}`}>
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Full Subject:</span>
                                <p className={`mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{log.subject}</p>
                              </div>
                              <div>
                                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Email Type:</span>
                                <p className={`mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{log.email_type}</p>
                              </div>
                              <div>
                                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Sent At:</span>
                                <p className={`mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {log.sent_at ? new Date(log.sent_at).toLocaleString() : 'N/A'}
                                </p>
                              </div>
                              <div>
                                <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>Created:</span>
                                <p className={`mt-0.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {new Date(log.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            {log.error_message && (
                              <div className={`mt-2 p-2 rounded text-xs ${darkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700'}`}>
                                <AlertCircle size={12} className="inline mr-1" />
                                Error: {log.error_message}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className={`px-4 py-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={loadMore}
                disabled={loading}
                className={`w-full py-2 text-sm rounded-lg ${
                  darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                }`}
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
