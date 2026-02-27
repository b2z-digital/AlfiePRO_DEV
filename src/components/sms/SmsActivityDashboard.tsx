import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, CheckCircle, XCircle, HelpCircle, Clock, ThumbsUp, ThumbsDown, Minus, BarChart3, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface EventLog {
  id: string;
  event_name: string;
  event_date: string | null;
  boat_class: string | null;
  venue: string | null;
  total_sent: number;
  total_delivered: number;
  total_responses: number;
  yes_count: number;
  no_count: number;
  maybe_count: number;
  tokens_used: number;
  status: string;
  trigger_type: string;
  sent_at: string | null;
  completed_at: string | null;
}

interface MessageDetail {
  id: string;
  member_name: string;
  phone_number_masked: string;
  status: string;
  response: string | null;
  sent_at: string | null;
  responded_at: string | null;
}

interface SmsActivityDashboardProps {
  darkMode?: boolean;
  clubId: string;
}

export const SmsActivityDashboard: React.FC<SmsActivityDashboardProps> = ({ darkMode = true, clubId }) => {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [messageDetails, setMessageDetails] = useState<Record<string, MessageDetail[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) fetchLogs();
  }, [clubId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sms_event_logs')
        .select('*')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false })
        .limit(50);

      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching SMS logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessageDetails = async (logId: string) => {
    if (messageDetails[logId]) {
      setExpandedLog(expandedLog === logId ? null : logId);
      return;
    }

    setLoadingDetails(logId);
    setExpandedLog(logId);
    try {
      const { data } = await supabase
        .from('sms_message_log')
        .select('id, member_name, phone_number_masked, status, response, sent_at, responded_at')
        .eq('event_log_id', logId)
        .order('member_name');

      setMessageDetails(prev => ({ ...prev, [logId]: data || [] }));
    } catch (err) {
      console.error('Error fetching message details:', err);
    } finally {
      setLoadingDetails(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      completed: { bg: 'bg-green-500/10', text: 'text-green-400', icon: <CheckCircle size={12} /> },
      sending: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: <Send size={12} /> },
      pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: <Clock size={12} /> },
      failed: { bg: 'bg-red-500/10', text: 'text-red-400', icon: <XCircle size={12} /> },
      cancelled: { bg: 'bg-slate-500/10', text: 'text-slate-400', icon: <XCircle size={12} /> },
    };
    const s = styles[status] || styles.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getResponseIcon = (response: string | null, status: string) => {
    if (response === 'yes') return <ThumbsUp size={14} className="text-green-400" />;
    if (response === 'no') return <ThumbsDown size={14} className="text-red-400" />;
    if (response === 'maybe') return <HelpCircle size={14} className="text-amber-400" />;
    if (status === 'failed') return <XCircle size={14} className="text-red-400" />;
    if (status === 'delivered') return <CheckCircle size={14} className="text-blue-400" />;
    if (status === 'sent') return <Send size={14} className="text-slate-400" />;
    return <Clock size={14} className="text-slate-500" />;
  };

  const totalSent = logs.reduce((sum, l) => sum + l.total_sent, 0);
  const totalResponses = logs.reduce((sum, l) => sum + l.total_responses, 0);
  const totalYes = logs.reduce((sum, l) => sum + l.yes_count, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Broadcasts', value: logs.length, icon: <Send size={16} />, color: 'blue' },
          { label: 'Total Sent', value: totalSent, icon: <MessageSquare size={16} />, color: 'teal' },
          { label: 'Responses', value: totalResponses, icon: <BarChart3 size={16} />, color: 'amber' },
          { label: 'Confirmed', value: totalYes, icon: <ThumbsUp size={16} />, color: 'green' },
        ].map((stat) => (
          <div
            key={stat.label}
            className={`p-4 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}
          >
            <div className={`flex items-center gap-1.5 mb-1 text-${stat.color}-400`}>
              {stat.icon}
              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</span>
            </div>
            <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Broadcast History
        </h3>
        <button
          onClick={fetchLogs}
          className={`p-2 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
          }`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {logs.length === 0 ? (
        <div className={`text-center py-12 rounded-xl ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
          <MessageSquare size={40} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
          <p className={`font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No broadcasts yet</p>
          <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            SMS broadcasts will appear here once you send your first event notification.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className={`rounded-xl overflow-hidden transition-all ${
              darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'
            }`}>
              <div
                className={`p-4 cursor-pointer transition-colors ${
                  darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                }`}
                onClick={() => fetchMessageDetails(log.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {log.event_name}
                      </h4>
                      {getStatusBadge(log.status)}
                      {log.trigger_type === 'auto' && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'
                        }`}>AUTO</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-4 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {log.event_date && (
                        <span>Event: {new Date(log.event_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                      )}
                      {log.boat_class && <span>{log.boat_class}</span>}
                      {log.sent_at && (
                        <span>Sent: {new Date(log.sent_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 ml-4">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{log.total_sent}</p>
                        <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sent</p>
                      </div>
                      <div className={`w-px h-8 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1" title="Yes">
                          <ThumbsUp size={12} className="text-green-400" />
                          <span className="text-sm font-semibold text-green-400">{log.yes_count}</span>
                        </div>
                        <div className="flex items-center gap-1" title="No">
                          <ThumbsDown size={12} className="text-red-400" />
                          <span className="text-sm font-semibold text-red-400">{log.no_count}</span>
                        </div>
                        <div className="flex items-center gap-1" title="Maybe">
                          <Minus size={12} className="text-amber-400" />
                          <span className="text-sm font-semibold text-amber-400">{log.maybe_count}</span>
                        </div>
                      </div>
                    </div>
                    {expandedLog === log.id ? (
                      <ChevronUp size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    ) : (
                      <ChevronDown size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    )}
                  </div>
                </div>

                {log.total_sent > 0 && (
                  <div className="mt-3 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                    {log.yes_count > 0 && (
                      <div
                        className="bg-green-500 rounded-l-full"
                        style={{ width: `${(log.yes_count / log.total_sent) * 100}%` }}
                      ></div>
                    )}
                    {log.no_count > 0 && (
                      <div
                        className="bg-red-500"
                        style={{ width: `${(log.no_count / log.total_sent) * 100}%` }}
                      ></div>
                    )}
                    {log.maybe_count > 0 && (
                      <div
                        className="bg-amber-500"
                        style={{ width: `${(log.maybe_count / log.total_sent) * 100}%` }}
                      ></div>
                    )}
                    <div
                      className={`${darkMode ? 'bg-slate-700' : 'bg-slate-200'} rounded-r-full flex-1`}
                    ></div>
                  </div>
                )}
              </div>

              {expandedLog === log.id && (
                <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  {loadingDetails === log.id ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-1 max-h-64 overflow-y-auto">
                      {(messageDetails[log.id] || []).map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                            darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {getResponseIcon(msg.response, msg.status)}
                            <div>
                              <p className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                {msg.member_name}
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {msg.phone_number_masked}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-xs font-medium ${
                              msg.response === 'yes' ? 'text-green-400' :
                              msg.response === 'no' ? 'text-red-400' :
                              msg.response === 'maybe' ? 'text-amber-400' :
                              msg.status === 'failed' ? 'text-red-400' :
                              darkMode ? 'text-slate-400' : 'text-slate-500'
                            }`}>
                              {msg.response
                                ? msg.response.toUpperCase()
                                : msg.status === 'failed' ? 'FAILED'
                                : msg.status === 'delivered' ? 'Delivered'
                                : 'Sent'}
                            </span>
                            {msg.responded_at && (
                              <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {new Date(msg.responded_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {(!messageDetails[log.id] || messageDetails[log.id].length === 0) && (
                        <p className={`text-center py-4 text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          No message details available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
