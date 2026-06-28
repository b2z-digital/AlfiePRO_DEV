import React, { useMemo } from 'react';
import { Download, Calendar, User, CircleCheck as CheckCircle2, Circle as XCircle, Clock, FileText, Mail } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { updateAssignmentStatus } from '../../utils/proRosterStorage';
import type { RosterWithDetails, ProRosterAssignment } from '../../types/proRoster';

interface RosterListViewProps {
  roster: RosterWithDetails;
  members: Array<{ id: string; first_name: string; last_name: string; email?: string | null; avatar_url?: string | null }>;
  onRefresh: () => void;
  darkMode?: boolean;
}

export const RosterListView: React.FC<RosterListViewProps> = ({ roster, members, onRefresh }) => {
  const { addNotification } = useNotifications();

  const assignmentsByRound = useMemo(() => {
    const map = new Map<string, ProRosterAssignment>();
    roster.assignments.forEach(a => map.set(a.round_id, a));
    return map;
  }, [roster.assignments]);

  const getMemberInfo = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member
      ? { name: `${member.first_name} ${member.last_name}`, email: member.email, avatar: member.avatar_url }
      : { name: 'Unassigned', email: null, avatar: null };
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"><CheckCircle2 size={10} /> Confirmed</span>;
      case 'declined':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 border border-red-500/30"><XCircle size={10} /> Declined</span>;
      case 'completed':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30"><CheckCircle2 size={10} /> Completed</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"><Clock size={10} /> Pending</span>;
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Day', 'PRO Name', 'Email', 'Status'];
    const rows = roster.rounds.map(round => {
      const assignment = assignmentsByRound.get(round.id);
      const info = assignment ? getMemberInfo(assignment.member_id) : { name: 'Unassigned', email: null };
      const dateObj = new Date(round.date + 'T00:00:00');
      return [
        round.date,
        dateObj.toLocaleDateString('en-AU', { weekday: 'long' }),
        info.name,
        info.email || '',
        assignment?.status || 'unassigned',
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${roster.name.replace(/\s+/g, '_')}_roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification('success', 'Roster exported as CSV');
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableRows = roster.rounds.map(round => {
      const assignment = assignmentsByRound.get(round.id);
      const info = assignment ? getMemberInfo(assignment.member_id) : { name: 'Unassigned', email: null };
      const dateObj = new Date(round.date + 'T00:00:00');
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">${info.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${assignment?.status || 'unassigned'}</td>
      </tr>`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>${roster.name} - PRO Roster</title></head>
      <body style="font-family:system-ui;padding:40px;max-width:800px;margin:0 auto">
        <h1 style="font-size:24px;margin-bottom:4px">${roster.name}</h1>
        <p style="color:#666;margin-bottom:4px">${roster.boat_class} | ${new Date(roster.start_date).toLocaleDateString()} - ${new Date(roster.end_date).toLocaleDateString()}</p>
        ${roster.description ? `<p style="color:#888;margin-bottom:20px">${roster.description}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin-top:20px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd">Date</th>
              <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd">Principal Race Officer</th>
              <th style="padding:10px;text-align:left;border-bottom:2px solid #ddd">Status</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="color:#999;margin-top:30px;font-size:12px">Generated by AlfiePRO on ${new Date().toLocaleDateString()}</p>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleStatusChange = async (assignmentId: string, status: 'confirmed' | 'declined' | 'completed') => {
    try {
      await updateAssignmentStatus(assignmentId, status);
      addNotification('success', `Status updated to ${status}`);
      onRefresh();
    } catch (err) {
      addNotification('error', 'Failed to update status');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {roster.rounds.length} sailing days | {roster.assignments.length} assigned |{' '}
          {roster.assignments.filter(a => a.status === 'confirmed').length} confirmed
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-600 transition-all"
          >
            <FileText size={14} />
            Print / PDF
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Date</th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Day</th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">PRO Assigned</th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
              <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roster.rounds.map(round => {
              const assignment = assignmentsByRound.get(round.id);
              const info = assignment ? getMemberInfo(assignment.member_id) : null;
              const dateObj = new Date(round.date + 'T00:00:00');
              const isPast = round.date < today;
              const isToday = round.date === today;

              return (
                <tr
                  key={round.id}
                  className={`border-b border-slate-700/30 transition-colors ${
                    isToday ? 'bg-cyan-500/5' : isPast ? 'opacity-50' : 'hover:bg-slate-700/20'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isToday && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                      <span className={`text-sm ${isToday ? 'text-cyan-400 font-medium' : 'text-white'}`}>
                        {dateObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-400">
                      {dateObj.toLocaleDateString('en-AU', { weekday: 'long' })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {info ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-medium text-white overflow-hidden">
                          {info.avatar ? (
                            <img src={info.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            info.name.split(' ').map(n => n[0]).join('')
                          )}
                        </div>
                        <span className="text-sm text-white font-medium">{info.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {assignment ? getStatusBadge(assignment.status) : (
                      <span className="text-xs text-slate-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {assignment && assignment.status === 'assigned' && !isPast && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleStatusChange(assignment.id, 'confirmed')}
                          className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition-all"
                          title="Confirm"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                        <button
                          onClick={() => handleStatusChange(assignment.id, 'declined')}
                          className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-all"
                          title="Decline"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Summary</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Days</span>
              <span className="text-white font-medium">{roster.rounds.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Assigned</span>
              <span className="text-white font-medium">{roster.assignments.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Confirmed</span>
              <span className="text-emerald-400 font-medium">{roster.assignments.filter(a => a.status === 'confirmed').length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Pending</span>
              <span className="text-yellow-400 font-medium">{roster.assignments.filter(a => a.status === 'assigned').length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Declined</span>
              <span className="text-red-400 font-medium">{roster.assignments.filter(a => a.status === 'declined').length}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 col-span-2">
          <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Member Duty Count</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roster.members.filter(m => m.is_active).map(m => {
              const info = getMemberInfo(m.member_id);
              const count = roster.assignments.filter(a => a.member_id === m.member_id).length;
              return (
                <div key={m.member_id} className="flex items-center gap-2 px-2 py-1.5 bg-slate-900/30 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-medium text-white overflow-hidden flex-shrink-0">
                    {info.avatar ? (
                      <img src={info.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      info.name.split(' ').map(n => n[0]).join('')
                    )}
                  </div>
                  <span className="text-xs text-slate-300 truncate flex-1">{info.name}</span>
                  <span className="text-xs font-semibold text-cyan-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
