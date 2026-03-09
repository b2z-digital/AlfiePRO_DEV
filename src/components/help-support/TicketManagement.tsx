import { useState, useEffect, useRef } from 'react';
import {
  Ticket, Search, Filter, Clock, User, MessageSquare, Send,
  ChevronRight, AlertCircle, CheckCircle, ArrowUpRight, X,
  BarChart3, TrendingUp, Timer, Star, ArrowLeft, Paperclip,
  BookmarkIcon, Eye, MoreVertical, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ticketStorage, cannedResponseStorage } from '../../utils/helpSupportStorage';
import { TICKET_STATUSES, TICKET_PRIORITIES, TICKET_CATEGORIES, PLATFORM_AREAS } from '../../types/helpSupport';
import type { SupportTicket, SupportTicketMessage, SupportTicketActivity, SupportAnalytics, SupportCannedResponse } from '../../types/helpSupport';

interface Props {
  darkMode?: boolean;
  onNotify: (message: string, type: 'success' | 'error') => void;
}

type View = 'list' | 'detail' | 'analytics';

export default function TicketManagement({ darkMode = false, onNotify }: Props) {
  const { user } = useAuth();
  const [view, setView] = useState<View>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [activityLog, setActivityLog] = useState<SupportTicketActivity[]>([]);
  const [analytics, setAnalytics] = useState<SupportAnalytics | null>(null);
  const [cannedResponses, setCannedResponses] = useState<SupportCannedResponse[]>([]);
  const [showCannedResponses, setShowCannedResponses] = useState(false);

  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadTickets(); }, [filterStatus, filterPriority, filterCategory, searchQuery]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await ticketStorage.getTickets({
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        category: filterCategory || undefined,
        search: searchQuery || undefined,
      });
      setTickets(data);
    } catch (err: any) {
      onNotify(err.message || 'Failed to load tickets', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setView('detail');
    try {
      const [msgs, activity, canned] = await Promise.all([
        ticketStorage.getMessages(ticket.id),
        ticketStorage.getActivityLog(ticket.id),
        cannedResponseStorage.getAll(),
      ]);
      setMessages(msgs);
      setActivityLog(activity);
      setCannedResponses(canned);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err: any) {
      onNotify(err.message || 'Failed to load ticket details', 'error');
    }
  };

  const loadAnalytics = async () => {
    setView('analytics');
    try {
      const data = await ticketStorage.getAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      onNotify(err.message || 'Failed to load analytics', 'error');
    }
  };

  const sendReply = async () => {
    if (!replyMessage.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      await ticketStorage.addMessage({
        ticket_id: selectedTicket.id,
        sender_user_id: user?.id,
        sender_name: user?.user_metadata?.full_name || user?.email || 'Support Agent',
        sender_role: 'agent',
        message: replyMessage,
        is_internal_note: isInternalNote,
        is_from_admin: true,
      });

      if (!isInternalNote && selectedTicket.status === 'open') {
        await ticketStorage.updateTicket(selectedTicket.id, {
          status: 'in_progress',
        }, user?.id, user?.user_metadata?.full_name || 'Admin');
      }

      setReplyMessage('');
      setIsInternalNote(false);
      const [msgs, activity] = await Promise.all([
        ticketStorage.getMessages(selectedTicket.id),
        ticketStorage.getActivityLog(selectedTicket.id),
      ]);
      setMessages(msgs);
      setActivityLog(activity);
      const updatedTicket = await ticketStorage.getTicket(selectedTicket.id);
      if (updatedTicket) setSelectedTicket(updatedTicket);
      onNotify(isInternalNote ? 'Internal note added' : 'Reply sent', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to send reply', 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const updateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const updates: Partial<SupportTicket> = { status: status as SupportTicket['status'] };
      if (status === 'resolved') updates.resolved_at = new Date().toISOString();
      if (status === 'closed') updates.closed_at = new Date().toISOString();

      const updated = await ticketStorage.updateTicket(
        selectedTicket.id, updates, user?.id,
        user?.user_metadata?.full_name || 'Admin'
      );
      setSelectedTicket(updated);
      const activity = await ticketStorage.getActivityLog(selectedTicket.id);
      setActivityLog(activity);
      loadTickets();
      onNotify(`Ticket status updated to ${status.replace('_', ' ')}`, 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to update status', 'error');
    }
  };

  const updateTicketPriority = async (priority: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await ticketStorage.updateTicket(
        selectedTicket.id, { priority: priority as SupportTicket['priority'] },
        user?.id, user?.user_metadata?.full_name || 'Admin'
      );
      setSelectedTicket(updated);
      const activity = await ticketStorage.getActivityLog(selectedTicket.id);
      setActivityLog(activity);
      loadTickets();
    } catch (err: any) {
      onNotify(err.message || 'Failed to update priority', 'error');
    }
  };

  const assignToMe = async () => {
    if (!selectedTicket || !user) return;
    try {
      const updated = await ticketStorage.updateTicket(
        selectedTicket.id,
        { assigned_to: user.id, assigned_to_name: user.user_metadata?.full_name || user.email || '' },
        user.id, user.user_metadata?.full_name || 'Admin'
      );
      setSelectedTicket(updated);
      const activity = await ticketStorage.getActivityLog(selectedTicket.id);
      setActivityLog(activity);
      loadTickets();
      onNotify('Ticket assigned to you', 'success');
    } catch (err: any) {
      onNotify(err.message || 'Failed to assign ticket', 'error');
    }
  };

  const useCannedResponse = (response: SupportCannedResponse) => {
    setReplyMessage(response.content);
    setShowCannedResponses(false);
    cannedResponseStorage.incrementUsage(response.id);
  };

  const statusColor = (s: string) => TICKET_STATUSES.find(ts => ts.value === s)?.color || 'bg-slate-500';
  const priorityColor = (p: string) => TICKET_PRIORITIES.find(tp => tp.value === p)?.color || 'bg-slate-500';
  const categoryLabel = (c: string) => TICKET_CATEGORIES.find(tc => tc.value === c)?.label || c;

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (view === 'analytics') return <AnalyticsView analytics={analytics} onBack={() => setView('list')} />;

  if (view === 'detail' && selectedTicket) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-1 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); setSelectedTicket(null); }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-400">{selectedTicket.ticket_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${statusColor(selectedTicket.status)}`}>
                  {selectedTicket.status.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${priorityColor(selectedTicket.priority)}`}>
                  {selectedTicket.priority}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1">{selectedTicket.subject}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={assignToMe} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">
              <User size={14} /> Assign to me
            </button>
            <select
              value={selectedTicket.status}
              onChange={e => updateTicketStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select
              value={selectedTicket.priority}
              onChange={e => updateTicketPriority(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {TICKET_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-1 gap-4 mt-4 min-h-0">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <User size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{selectedTicket.reporter_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{selectedTicket.reporter_email} {selectedTicket.reporter_club && `- ${selectedTicket.reporter_club}`}</p>
                  </div>
                  <span className="ml-auto text-xs text-slate-500">{timeAgo(selectedTicket.created_at)}</span>
                </div>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedTicket.description}</p>
                {selectedTicket.browser_info && (
                  <p className="text-xs text-slate-500 mt-3 border-t border-slate-700/50 pt-2">Browser: {selectedTicket.browser_info}</p>
                )}
              </div>

              {messages.map(msg => (
                <div key={msg.id} className={`rounded-xl border p-4 ${
                  msg.is_internal_note
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : msg.is_from_admin
                    ? 'border-sky-500/30 bg-sky-500/5'
                    : 'border-slate-700/50 bg-slate-800/50'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      msg.is_internal_note ? 'bg-amber-500/20' : msg.is_from_admin ? 'bg-sky-500/20' : 'bg-blue-500/20'
                    }`}>
                      {msg.is_internal_note ? <BookmarkIcon size={16} className="text-amber-400" />
                        : <User size={16} className={msg.is_from_admin ? 'text-sky-400' : 'text-blue-400'} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {msg.sender_name}
                        {msg.is_internal_note && <span className="ml-2 text-xs text-amber-400">(Internal Note)</span>}
                        {msg.is_from_admin && !msg.is_internal_note && <span className="ml-2 text-xs text-sky-400">(Support)</span>}
                      </p>
                    </div>
                    <span className="ml-auto text-xs text-slate-500">{timeAgo(msg.created_at)}</span>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{msg.message}</p>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="mt-4 border-t border-slate-700/50 pt-4">
              <div className="flex items-center gap-2 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={e => setIsInternalNote(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-600 text-amber-500 focus:ring-amber-500 bg-slate-700"
                  />
                  <span className="text-xs text-slate-400">Internal note</span>
                </label>
                <button
                  onClick={() => setShowCannedResponses(!showCannedResponses)}
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  <BookmarkIcon size={12} /> Canned responses
                </button>
              </div>
              {showCannedResponses && cannedResponses.length > 0 && (
                <div className="mb-2 p-2 rounded-lg bg-slate-700/50 border border-slate-600 max-h-32 overflow-y-auto">
                  {cannedResponses.map(cr => (
                    <button
                      key={cr.id}
                      onClick={() => useCannedResponse(cr)}
                      className="block w-full text-left px-3 py-1.5 rounded hover:bg-slate-600 text-sm text-slate-300 truncate"
                    >
                      {cr.title}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
                  placeholder={isInternalNote ? 'Write an internal note...' : 'Type your reply...'}
                  className={`flex-1 px-4 py-3 rounded-xl border text-white text-sm focus:outline-none focus:ring-2 resize-none h-20 ${
                    isInternalNote
                      ? 'bg-amber-500/5 border-amber-500/30 focus:ring-amber-500'
                      : 'bg-slate-700/50 border-slate-600 focus:ring-sky-500'
                  }`}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyMessage.trim() || sendingReply}
                  className="self-end px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="w-72 shrink-0 space-y-4 overflow-y-auto">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Details</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Category</span>
                  <span className="text-white">{categoryLabel(selectedTicket.category)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Area</span>
                  <span className="text-white">{PLATFORM_AREAS.find(a => a.value === selectedTicket.platform_area)?.label || selectedTicket.platform_area}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned</span>
                  <span className="text-white">{selectedTicket.assigned_to_name || 'Unassigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Created</span>
                  <span className="text-white">{new Date(selectedTicket.created_at).toLocaleDateString()}</span>
                </div>
                {selectedTicket.first_response_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">First Response</span>
                    <span className="text-white">{timeAgo(selectedTicket.first_response_at)}</span>
                  </div>
                )}
                {selectedTicket.resolved_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Resolved</span>
                    <span className="text-white">{new Date(selectedTicket.resolved_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {activityLog.length > 0 && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                <h4 className="text-sm font-semibold text-white mb-3">Activity Log</h4>
                <div className="space-y-2">
                  {activityLog.map(a => (
                    <div key={a.id} className="text-xs text-slate-400 border-l-2 border-slate-700 pl-3 py-1">
                      <span className="text-slate-300">{a.actor_name || 'System'}</span> {a.action.replace('_', ' ')}
                      {a.new_value && <span className="text-sky-400"> {a.new_value.replace('_', ' ')}</span>}
                      <div className="text-slate-500 mt-0.5">{timeAgo(a.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Support Tickets</h2>
          <p className="text-sm text-slate-400 mt-1">
            {tickets.length} tickets
            {tickets.filter(t => t.status === 'open').length > 0 && (
              <span className="text-amber-400 ml-2">({tickets.filter(t => t.status === 'open').length} open)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadAnalytics} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
            <BarChart3 size={16} /> Analytics
          </button>
          <button onClick={loadTickets} className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All Statuses</option>
          {TICKET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All Priorities</option>
          {TICKET_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">All Categories</option>
          {TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <Ticket size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No tickets found</p>
          <p className="text-sm mt-1">Tickets will appear here when users submit support requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => loadTicketDetail(ticket)}
              className="flex items-center gap-4 px-5 py-4 rounded-xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/30 hover:border-slate-600 cursor-pointer transition-all group"
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor(ticket.status)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{ticket.ticket_number}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded text-white ${priorityColor(ticket.priority)}`}>{ticket.priority}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{categoryLabel(ticket.category)}</span>
                </div>
                <h4 className="text-sm font-medium text-white mt-1 truncate">{ticket.subject}</h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span>{ticket.reporter_name || ticket.reporter_email}</span>
                  {ticket.reporter_club && <span>{ticket.reporter_club}</span>}
                  <span className="flex items-center gap-1"><Clock size={12} /> {timeAgo(ticket.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {ticket.assigned_to_name && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <User size={12} /> {ticket.assigned_to_name}
                  </span>
                )}
                <ChevronRight size={18} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsView({ analytics, onBack }: { analytics: SupportAnalytics | null; onBack: () => void }) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Tickets', value: analytics.totalTickets, icon: Ticket, color: 'text-sky-400', bg: 'from-sky-500/20 to-sky-700/20', border: 'border-sky-500/30' },
    { label: 'Open', value: analytics.openTickets, icon: AlertCircle, color: 'text-blue-400', bg: 'from-blue-500/20 to-blue-700/20', border: 'border-blue-500/30' },
    { label: 'In Progress', value: analytics.inProgressTickets, icon: Clock, color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-700/20', border: 'border-amber-500/30' },
    { label: 'Resolved', value: analytics.resolvedTickets, icon: CheckCircle, color: 'text-emerald-400', bg: 'from-emerald-500/20 to-emerald-700/20', border: 'border-emerald-500/30' },
    { label: 'This Week', value: analytics.ticketsThisWeek, icon: TrendingUp, color: 'text-cyan-400', bg: 'from-cyan-500/20 to-cyan-700/20', border: 'border-cyan-500/30' },
    { label: 'This Month', value: analytics.ticketsThisMonth, icon: BarChart3, color: 'text-teal-400', bg: 'from-teal-500/20 to-teal-700/20', border: 'border-teal-500/30' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-white">Support Analytics</h2>
          <p className="text-sm text-slate-400 mt-1">Overview of support ticket metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map(card => (
          <div key={card.label} className={`rounded-2xl border ${card.border} p-4 bg-gradient-to-br ${card.bg}`}>
            <card.icon size={16} className={card.color} />
            <p className="text-2xl font-bold text-white mt-2">{card.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Timer size={16} className="text-sky-400" /> Response Metrics
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Avg First Response</span>
                <span className="text-white font-medium">{analytics.avgFirstResponseHours}h</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.min(100, (analytics.avgFirstResponseHours / 24) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Avg Resolution Time</span>
                <span className="text-white font-medium">{analytics.avgResolutionHours}h</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, (analytics.avgResolutionHours / 72) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Customer Satisfaction</span>
                <span className="text-white font-medium flex items-center gap-1">
                  <Star size={14} className="text-amber-400" /> {analytics.satisfactionAvg}/5
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-amber-500"
                  style={{ width: `${(analytics.satisfactionAvg / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">By Category</h3>
          <div className="space-y-2">
            {Object.entries(analytics.ticketsByCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{categoryLabel(cat)}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${analytics.totalTickets > 0 ? (count / analytics.totalTickets) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-white font-medium w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">By Priority</h3>
          <div className="space-y-2">
            {TICKET_PRIORITIES.map(p => {
              const count = analytics.ticketsByPriority[p.value] || 0;
              return (
                <div key={p.value} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${p.color}`} />
                    <span className="text-slate-400">{p.label}</span>
                  </span>
                  <span className="text-white font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Status Breakdown</h3>
          <div className="space-y-2">
            {TICKET_STATUSES.map(s => {
              const count = s.value === 'open' ? analytics.openTickets
                : s.value === 'in_progress' ? analytics.inProgressTickets
                : s.value === 'waiting_on_customer' ? analytics.waitingTickets
                : s.value === 'resolved' ? analytics.resolvedTickets
                : analytics.closedTickets;
              return (
                <div key={s.value} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.color}`} />
                    <span className="text-slate-400">{s.label}</span>
                  </span>
                  <span className="text-white font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
