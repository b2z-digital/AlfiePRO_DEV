import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ClipboardList, Plus, Calendar, Trash2, Pencil, Play, ChevronRight, CircleCheck as CheckCircle2, Clock, UserCheck, ListFilter as Filter, Search, Layers, CalendarDays, ChevronDown, ChevronUp, Users, Anchor, ListChecks, FileText, Grid3x2 as Grid3X3, List, Download, TriangleAlert, CalendarPlus } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { getRosters, deleteRoster, getRosterWithDetails, activateRoster, createTasksForAssignments, updateAssignmentStatus, ensureTasksForRoster, getRosterAssignmentSummaries, sendProRosterReminderEmails } from '../../utils/proRosterStorage';
import type { RosterAssignmentSummary } from '../../utils/proRosterStorage';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredMembers } from '../../utils/storage';
import type { ProRoster, RosterWithDetails } from '../../types/proRoster';
import { getBoatClassImage } from '../../utils/boatClassImages';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RosterBuilder } from './RosterBuilder';
import { AAvatar } from '../alfie/Kit';
import { RosterGridView } from './RosterGridView';
import { RosterListView } from './RosterListView';
import { RosterCalendarView } from './RosterCalendarView';
import { getStoredRaceSeries, getStoredRaceEvents } from '../../utils/raceStorage';
import { syncClubRosters, findSeriesWithoutRoster, removeRosterRoundWithTask } from '../../utils/proRosterSync';
import type { RosterSyncIssue } from '../../utils/proRosterSync';
import type { RaceSeries } from '../../types/race';

const DISMISSED_KEY = 'alfie.proRoster.dismissedIssues';
const readDismissed = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); }
};
const writeDismissed = (ids: Set<string>) => {
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids))); } catch { /* per-viewer convenience only */ }
};
// "International One Metre (IOM)" → "IOM", so the class pill fits its column
const shortClass = (boatClass: string) => boatClass.match(/\(([^)]+)\)\s*$/)?.[1] || boatClass;
const fmtDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

interface ProRosteringPageProps {
  clubId: string;
  clubName: string;
  darkMode?: boolean;
}

interface RosterGroup {
  label: string;
  icon: React.ReactNode;
  rosters: ProRoster[];
  seriesId: string | null;
  boatClass: string;
}

export const ProRosteringPage: React.FC<ProRosteringPageProps> = ({ clubId, clubName, darkMode = true }) => {
  const { addNotification } = useNotifications();
  const { user } = useAuth();
  const [rosters, setRosters] = useState<ProRoster[]>([]);
  const [selectedRoster, setSelectedRoster] = useState<RosterWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingRoster, setEditingRoster] = useState<ProRoster | null>(null);
  const [view, setView] = useState<'dashboard' | 'grid' | 'list'>('dashboard');
  const [dashboardTab, setDashboardTab] = useState<'cards' | 'list' | 'calendar'>('list');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBoatClass, setFilterBoatClass] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Array<{ id: string; first_name: string; last_name: string; avatar_url?: string | null; boats?: Array<{ boat_type: string }> }>>([]);
  const [pendingActivationRosterId, setPendingActivationRosterId] = useState<string | null>(null);
  const [pendingDeleteRosterId, setPendingDeleteRosterId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Map<string, RosterAssignmentSummary>>(new Map());
  const [seriesList, setSeriesList] = useState<RaceSeries[]>([]);
  const [syncIssues, setSyncIssues] = useState<RosterSyncIssue[]>([]);
  const [dismissedIssues, setDismissedIssues] = useState<Set<string>>(() => readDismissed());
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [prefillSeriesId, setPrefillSeriesId] = useState<string | null>(null);
  const syncedOnce = useRef(false);

  const fetchMembers = useCallback(async () => {
    try {
      const data = await getStoredMembers();
      setMembers(data as any);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  }, []);

  const fetchRosters = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRosters(clubId);
      setRosters(data);
    } catch (err) {
      console.error('Error fetching rosters:', err);
      addNotification('error', 'Failed to load rosters');
    } finally {
      setLoading(false);
    }
  }, [clubId, addNotification]);

  useEffect(() => { fetchRosters(); fetchMembers(); }, [fetchRosters, fetchMembers]);

  // Bring rosters up to date with Race Events & Series once per visit. Never changes who is rostered.
  const runSeriesSync = useCallback(async (current: ProRoster[], notify: boolean) => {
    const [series, events] = await Promise.all([
      getStoredRaceSeries().catch(() => [] as RaceSeries[]),
      current.some(r => r.event_id) ? getStoredRaceEvents().catch(() => []) : Promise.resolve([]),
    ]);
    setSeriesList(series);
    const results = await syncClubRosters(current, series, events);
    setSyncIssues(results.flatMap(r => r.issues));
    const renamed = results.filter(r => r.renamed).length;
    const moved = results.reduce((n, r) => n + r.moved, 0);
    const added = results.reduce((n, r) => n + r.added, 0);
    if (renamed || moved || added) {
      setRosters(await getRosters(clubId));
      if (notify) {
        const parts = [
          renamed ? `${renamed} renamed` : '',
          moved ? `${moved} day${moved > 1 ? 's' : ''} moved` : '',
          added ? `${added} new day${added > 1 ? 's' : ''} added` : '',
        ].filter(Boolean);
        addNotification('info', `Rosters updated from Race Events & Series: ${parts.join(', ')}. Rostered PROs are unchanged.`);
      }
    }
  }, [clubId, addNotification]);

  useEffect(() => {
    if (loading || syncedOnce.current) return;
    syncedOnce.current = true;
    runSeriesSync(rosters, true).catch(err => console.error('PRO roster sync failed:', err));
  }, [loading, rosters, runSeriesSync]);

  const seriesWithoutRoster = useMemo(() => findSeriesWithoutRoster(rosters, seriesList), [rosters, seriesList]);
  const seriesNameById = useMemo(() => new Map(seriesList.map(s => [s.id, s.seriesName])), [seriesList]);
  const visibleIssues = syncIssues.filter(i => !dismissedIssues.has(i.roundId));

  const dismissIssue = (roundId: string) => {
    const next = new Set(dismissedIssues); next.add(roundId);
    setDismissedIssues(next); writeDismissed(next);
  };

  const handleRemoveIssueRound = async (issue: RosterSyncIssue) => {
    try {
      await removeRosterRoundWithTask(issue.roundId);
      setSyncIssues(prev => prev.filter(i => i.roundId !== issue.roundId));
      setConfirmRemoveId(null);
      const latest = await getRosters(clubId);
      setRosters(latest);
      addNotification('success', `Removed ${fmtDay(issue.date)} from ${issue.rosterName}`);
    } catch (err) {
      console.error('Error removing roster day:', err);
      addNotification('error', 'Failed to remove that day from the roster');
    }
  };

  const memberName = (id: string | null) => {
    if (!id) return null;
    const m = members.find(mem => mem.id === id);
    return m ? `${m.first_name} ${m.last_name}` : 'A member';
  };

  useEffect(() => {
    if (rosters.length > 0 && members.length > 0) {
      getRosterAssignmentSummaries(rosters.map(r => r.id), members).then(setSummaries).catch(console.error);
    }
  }, [rosters, members]);

  const handleSelectRoster = async (roster: ProRoster) => {
    try {
      const details = await getRosterWithDetails(roster.id);
      const enrichedMembers = details.members.map(m => {
        const member = members.find(mem => mem.id === m.member_id);
        return { ...m, member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown', member_avatar: member?.avatar_url };
      });
      const enrichedAssignments = details.assignments.map(a => {
        const member = members.find(mem => mem.id === a.member_id);
        return { ...a, member_name: member ? `${member.first_name} ${member.last_name}` : 'Unknown', member_avatar: member?.avatar_url };
      });
      setSelectedRoster({ ...details, members: enrichedMembers, assignments: enrichedAssignments });
      setView('grid');
    } catch (err) {
      console.error('Error loading roster:', err);
      addNotification('error', 'Failed to load roster details');
    }
  };

  const handleDeleteRoster = async (rosterId: string) => {
    try {
      await deleteRoster(rosterId);
      setRosters(prev => prev.filter(r => r.id !== rosterId));
      if (selectedRoster?.id === rosterId) {
        setSelectedRoster(null);
        setView('dashboard');
      }
      setPendingDeleteRosterId(null);
      addNotification('success', 'Roster and associated tasks deleted');
    } catch (err) {
      console.error('Error deleting roster:', err);
      addNotification('error', 'Failed to delete roster');
    }
  };

  const handleActivateRoster = async (rosterId: string) => {
    try {
      await activateRoster(rosterId);
      const details = await getRosterWithDetails(rosterId);
      if (details.assignments.length > 0 && user?.id) {
        await createTasksForAssignments(details, details.rounds, details.assignments, clubId, user.id);
        sendProRosterReminderEmails(details, details.rounds, details.assignments, clubId).catch(err =>
          console.error('Failed to send PRO roster emails:', err)
        );
        for (const assignment of details.assignments) {
          if (assignment.status === 'assigned') {
            await updateAssignmentStatus(assignment.id, 'confirmed');
          }
        }
      }
      await fetchRosters();
      if (selectedRoster?.id === rosterId) {
        const refreshed = await getRosterWithDetails(rosterId);
        setSelectedRoster(refreshed);
      }
      setPendingActivationRosterId(null);
      addNotification('success', 'Roster activated! All assignments confirmed and tasks created.');
    } catch (err) {
      console.error('Error activating roster:', err);
      addNotification('error', 'Failed to activate roster');
    }
  };

  const handleRosterCreated = async () => {
    setShowBuilder(false);
    setEditingRoster(null);
    setPrefillSeriesId(null);
    await fetchRosters();
    const latestRosters = await getRosters(clubId);
    const newestDraft = latestRosters.find(r => r.status === 'draft');
    if (newestDraft) {
      setPendingActivationRosterId(newestDraft.id);
    }
  };

  const handleRefresh = async () => {
    if (selectedRoster) {
      await handleSelectRoster(selectedRoster);
    }
  };

  const boatClasses = useMemo(() => {
    const classes = new Set(rosters.map(r => r.boat_class));
    return Array.from(classes).sort();
  }, [rosters]);

  const filteredRosters = useMemo(() => {
    let result = rosters;
    if (filterStatus !== 'all') result = result.filter(r => r.status === filterStatus);
    if (filterBoatClass !== 'all') result = result.filter(r => r.boat_class === filterBoatClass);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q) || r.boat_class.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    }
    return result;
  }, [rosters, filterStatus, filterBoatClass, searchQuery]);

  const { seriesGroups, singleEventRosters } = useMemo(() => {
    const seriesMap = new Map<string, ProRoster[]>();
    const singles: ProRoster[] = [];
    for (const roster of filteredRosters) {
      if (roster.series_id) {
        const key = roster.series_id;
        if (!seriesMap.has(key)) seriesMap.set(key, []);
        seriesMap.get(key)!.push(roster);
      } else {
        singles.push(roster);
      }
    }
    const groups: RosterGroup[] = [];
    for (const [seriesId, groupRosters] of Array.from(seriesMap.entries())) {
      const sortedRosters = groupRosters.sort((a, b) => a.boat_class.localeCompare(b.boat_class) || a.name.localeCompare(b.name));
      const seriesName = seriesNameById.get(seriesId) || extractSeriesName(sortedRosters);
      groups.push({ label: seriesName, icon: <Layers size={16} className="text-cyan-400" />, rosters: sortedRosters, seriesId, boatClass: sortedRosters.map(r => r.boat_class).join(', ') });
    }
    groups.sort((a, b) => a.label.localeCompare(b.label));
    singles.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
    return { seriesGroups: groups, singleEventRosters: singles };
  }, [filteredRosters, seriesNameById]);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'active': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'archived': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const handleExportAllPDF = async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 20;

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PRO Duty Rosters', margin, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(`${clubName}  •  Generated ${new Date().toLocaleDateString('en-AU')}`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 12;

    for (let i = 0; i < filteredRosters.length; i++) {
      const roster = filteredRosters[i];
      try {
        const details = await getRosterWithDetails(roster.id);
        const assignmentsByRound = new Map(details.assignments.map(a => [a.round_id, a]));

        if (y > doc.internal.pageSize.getHeight() - 40) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(roster.name, margin, y);
        y += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(`${roster.boat_class}  •  ${new Date(roster.start_date).toLocaleDateString('en-AU')} - ${new Date(roster.end_date).toLocaleDateString('en-AU')}  •  ${roster.status}`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 4;
        if (roster.description) {
          doc.setFontSize(8);
          doc.setTextColor(156, 163, 175);
          doc.text(roster.description, margin, y, { maxWidth: pageWidth - margin * 2 });
          doc.setTextColor(0, 0, 0);
          y += 4;
        }

        const tableRows = details.rounds.map(round => {
          const a = assignmentsByRound.get(round.id);
          const member = a ? members.find(m => m.id === a.member_id) : null;
          const name = member ? `${member.first_name} ${member.last_name}` : a ? 'Unknown' : 'Unassigned';
          const dateObj = new Date(round.date + 'T00:00:00');
          return [
            dateObj.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            name,
            a?.status || '-'
          ];
        });

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Principal Race Officer', 'Status']],
          body: tableRows,
          margin: { left: margin, right: margin },
          theme: 'grid',
          headStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontStyle: 'bold', fontSize: 9 },
          bodyStyles: { fontSize: 9, textColor: [55, 65, 81] },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          styles: { cellPadding: 3, lineColor: [229, 231, 235], lineWidth: 0.25 },
        });

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      } catch (err) {
        console.error('Error fetching roster for PDF:', err);
      }
    }

    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generated by AlfiePRO on ${new Date().toLocaleDateString('en-AU')}`, margin, doc.internal.pageSize.getHeight() - 10);

    doc.save(`PRO_Rosters_${clubName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    addNotification('success', 'PDF downloaded');
  };

  if (showBuilder || editingRoster) {
    return (
      <RosterBuilder clubId={clubId} clubName={clubName} members={members} existingRoster={editingRoster}
        initialSeriesId={editingRoster ? null : prefillSeriesId}
        onComplete={handleRosterCreated} onCancel={() => { setShowBuilder(false); setEditingRoster(null); setPrefillSeriesId(null); }} darkMode={darkMode} />
    );
  }

  if (selectedRoster && (view === 'grid' || view === 'list')) {
    return (
      <div className="h-full overflow-y-auto"><div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        <div className="flex items-center text-[13.5px]">
          <button onClick={() => { setSelectedRoster(null); setView('dashboard'); }} className="a-link inline-flex items-center gap-1"><ChevronRight size={15} className="rotate-180" />Rosters</button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><ClipboardList size={24} /></span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="a-display a-ink m-0 text-[28px] font-bold">{selectedRoster.name}</h1>
            <div className="a-mute flex flex-wrap items-center gap-2 mt-1.5 text-[13.5px]">
              <span className="a-st text-[13px]"><span className={`a-light ${selectedRoster.status === 'active' ? 'a-light-g' : selectedRoster.status === 'draft' ? 'a-light-a' : selectedRoster.status === 'completed' ? 'a-light-b' : 'a-light-n'}`} />{selectedRoster.status.charAt(0).toUpperCase() + selectedRoster.status.slice(1)}</span>
              <span className="a-dim">·</span>
              <span className="a-lb-cls"><svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" /></svg>{selectedRoster.boat_class}</span>
              <span className="a-dim">·</span>
              <span>{selectedRoster.rounds.length} sailing day{selectedRoster.rounds.length !== 1 ? 's' : ''}</span>
              <span className="a-dim">·</span>
              <span className={selectedRoster.assignments.length > 0 && selectedRoster.assignments.every(a => a.status === 'confirmed') ? 'a-txt-g' : ''}>{selectedRoster.assignments.filter(a => a.status === 'confirmed').length}/{selectedRoster.assignments.length} confirmed</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="a-seg" role="radiogroup" aria-label="View">
              <button onClick={() => setView('grid')} className={`a-seg-i ${view === 'grid' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="Grid" title="Grid">
                <Grid3X3 size={16} />
              </button>
              <button onClick={() => setView('list')} className={`a-seg-i ${view === 'list' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="List" title="List">
                <List size={16} />
              </button>
            </div>
            {selectedRoster.status === 'draft' && (
              <button onClick={() => handleActivateRoster(selectedRoster.id)} className="a-btn a-btn-g">
                <Play size={15} /> Activate
              </button>
            )}
            {selectedRoster.status === 'active' && user?.id && (
              <button
                onClick={async () => {
                  try {
                    const count = await ensureTasksForRoster(selectedRoster.id, clubId, user.id);
                    if (count > 0) { addNotification('success', `${count} missing task${count > 1 ? 's' : ''} created with reminders`); handleRefresh(); }
                    else { addNotification('info', 'All assignments already have tasks'); }
                  } catch { addNotification('error', 'Failed to sync tasks'); }
                }}
                className="a-btn"
                title="Create missing tasks for assignments that don't have them"
              >
                <ListChecks size={16} /> Sync tasks
              </button>
            )}
          </div>
        </div>
        {view === 'grid' ? (
          <RosterGridView roster={selectedRoster} members={members} onRefresh={handleRefresh} darkMode={darkMode} clubId={clubId} userId={user?.id} />
        ) : (
          <RosterListView roster={selectedRoster} members={members} onRefresh={handleRefresh} darkMode={darkMode} />
        )}
      </div></div>
    );
  }

  const activeCount = rosters.filter(r => r.status === 'active').length;
  const draftCount = rosters.filter(r => r.status === 'draft').length;

  return (
    <div className="h-full overflow-y-auto"><div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><ClipboardList size={24} /></span>
        <div className="flex-1 min-w-[220px]">
          <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">PRO Rostering</h1>
          <p className="a-mute mt-1 text-[14.5px]">Manage Principal Race Officer duty rosters for your club's sailing days</p>
        </div>
        {filteredRosters.length > 0 && (
          <button onClick={handleExportAllPDF} className="a-btn">
            <Download size={16} /> Export all PDF
          </button>
        )}
        <button onClick={() => setShowBuilder(true)} className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}>
          <Plus size={17} /> New roster
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total rosters" value={rosters.length} icon={<ClipboardList size={18} />} color="" />
        <StatCard label="Active" value={activeCount} icon={<Play size={18} />} color="" />
        <StatCard label="Draft" value={draftCount} icon={<Clock size={18} />} color="" />
        <StatCard label="Members rostered" value={new Set(Array.from(summaries.values()).flatMap(s => s.member_ids)).size} icon={<Users size={18} />} color="" />
      </div>

      {(seriesWithoutRoster.length > 0 || visibleIssues.length > 0) && (
        <section className="a-card overflow-hidden" aria-label="Rosters needing attention">
          <div className="a-row" style={{ paddingTop: 16, paddingBottom: 12 }}>
            <p className="a-cap flex-1">Needs attention</p>
            <span className="a-dim text-[12.5px]">Kept in step with Race Events &amp; Series</span>
          </div>
          {seriesWithoutRoster.map(series => {
            const upcoming = (series.rounds || []).filter(r => !r.cancelled && r.date).map(r => r.date.slice(0, 10)).sort();
            return (
              <div key={series.id} className="a-row flex-wrap">
                <span className="a-tile a-tile-sm"><CalendarPlus size={16} /></span>
                <div className="flex-1 min-w-[220px]">
                  <div className="a-ink text-[14.5px] font-semibold">{series.seriesName}</div>
                  <div className="a-mute text-[13px] mt-0.5">No PRO roster yet · {upcoming.length} round{upcoming.length !== 1 ? 's' : ''}{upcoming[0] ? ` from ${fmtDay(upcoming[0])}` : ''}</div>
                </div>
                <button className="a-btn a-btn-p a-btn-sm" onClick={() => { setPrefillSeriesId(series.id); setShowBuilder(true); }}>
                  <Plus size={15} /> Create roster
                </button>
              </div>
            );
          })}
          {visibleIssues.map(issue => {
            const who = memberName(issue.memberId);
            const confirming = confirmRemoveId === issue.roundId;
            return (
              <div key={issue.roundId} className="a-row flex-wrap">
                <span className="a-tile a-tile-sm a-txt-a"><TriangleAlert size={16} /></span>
                <div className="flex-1 min-w-[220px]">
                  <div className="a-ink text-[14.5px] font-semibold">{fmtDay(issue.date)} · {issue.rosterName}</div>
                  <div className="a-mute text-[13px] mt-0.5">
                    {issue.reason === 'cancelled' ? 'This round was cancelled in the series' : 'This day is no longer in the series'}
                    {' · '}{who ? <><span className="a-ink">{who}</span> is rostered</> : 'no PRO assigned'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="a-btn a-btn-q a-btn-sm" onClick={() => { dismissIssue(issue.roundId); setConfirmRemoveId(null); }}>Keep</button>
                  {confirming ? (
                    <button className="a-btn a-btn-d a-btn-sm" onClick={() => handleRemoveIssueRound(issue)}>
                      <Trash2 size={14} /> {who ? 'Remove day and duty' : 'Remove day'}
                    </button>
                  ) : (
                    <button className="a-btn a-btn-sm" onClick={() => setConfirmRemoveId(issue.roundId)}>Remove from roster</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* View Toggle & Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="a-seg" role="radiogroup" aria-label="View">
          <button onClick={() => setDashboardTab('cards')} className={`a-seg-i ${dashboardTab === 'cards' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="Cards" title="Cards">
            <Grid3X3 size={16} />
          </button>
          <button onClick={() => setDashboardTab('list')} className={`a-seg-i ${dashboardTab === 'list' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="List" title="List">
            <List size={16} />
          </button>
          <button onClick={() => setDashboardTab('calendar')} className={`a-seg-i ${dashboardTab === 'calendar' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="Calendar" title="Calendar">
            <CalendarDays size={16} />
          </button>
        </div>

        <label className="a-field flex-1 min-w-[200px]">
          <Search size={17} />
          <input type="text" placeholder="Search rosters" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </label>

        <div className="a-seg" role="radiogroup" aria-label="Status">
          {['all', 'active', 'draft', 'completed', 'archived'].map(status => (
            <button key={status} onClick={() => setFilterStatus(status)}
              className={`a-seg-i ${filterStatus === status ? 'a-seg-on' : ''}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {boatClasses.length > 1 && (
          <select value={filterBoatClass} onChange={e => setFilterBoatClass(e.target.value)}
            className="a-pick a-inp-sel" style={{ paddingRight: 36 }}>
            <option value="all">All classes</option>
            {boatClasses.map(bc => <option key={bc} value={bc}>{bc}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
        </div>
      ) : filteredRosters.length === 0 ? (
        <div className="a-card a-empty text-center py-20">
          <span className="a-tile mx-auto mb-2" style={{ width: 48, height: 48 }}><ClipboardList size={22} /></span>
          <h3 className="a-ink text-[16px] font-semibold mb-1">{rosters.length === 0 ? 'No Rosters Yet' : 'No Matching Rosters'}</h3>
          <p className="a-dim text-[13.5px] mb-5 max-w-md mx-auto">
            {rosters.length === 0 ? 'Create your first PRO roster to automatically assign race officers to your sailing days.' : 'Try adjusting your search or filters to find what you\'re looking for.'}
          </p>
          {rosters.length === 0 && (
            <button onClick={() => setShowBuilder(true)} className="a-btn a-btn-p">
              <Plus size={16} /> Create first roster
            </button>
          )}
        </div>
      ) : dashboardTab === 'calendar' ? (
        <RosterCalendarView rosters={filteredRosters} summaries={summaries} onSelectRoster={handleSelectRoster} />
      ) : dashboardTab === 'list' ? (
        <RosterListDashboard rosters={filteredRosters} summaries={summaries} getStatusColor={getStatusColor}
          onSelect={handleSelectRoster} onEdit={setEditingRoster} onDelete={setPendingDeleteRosterId} onActivate={handleActivateRoster} />
      ) : (
        <div className="space-y-6">
          {seriesGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Layers size={16} className="text-cyan-400" />
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Series Rosters</h2>
                <div className="flex-1 border-t border-slate-700/40" />
                <span className="text-xs text-slate-500">{seriesGroups.reduce((sum, g) => sum + g.rosters.length, 0)} rosters across {seriesGroups.length} series</span>
              </div>

              {seriesGroups.map(group => {
                const groupKey = group.seriesId || group.label;
                const isCollapsed = collapsedGroups.has(groupKey);
                const activeInGroup = group.rosters.filter(r => r.status === 'active').length;
                const draftInGroup = group.rosters.filter(r => r.status === 'draft').length;

                return (
                  <div key={groupKey} className="bg-slate-800/30 border border-slate-700/40 rounded-xl overflow-hidden">
                    <button onClick={() => toggleGroupCollapse(groupKey)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/50 transition-colors text-left">
                      <div className="p-1.5 bg-cyan-500/10 rounded-lg"><Layers size={16} className="text-cyan-400" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm">{group.label}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-500">{group.rosters.length} roster{group.rosters.length !== 1 ? 's' : ''}</span>
                          <span className="text-slate-700">|</span>
                          <span className="text-xs text-slate-500">{[...new Set(group.rosters.map(r => r.boat_class))].join(', ')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeInGroup > 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">{activeInGroup} active</span>}
                        {draftInGroup > 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">{draftInGroup} draft</span>}
                        {isCollapsed ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronUp size={16} className="text-slate-500" />}
                      </div>
                    </button>
                    {!isCollapsed && (
                      <div className="border-t border-slate-700/30 p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.rosters.map(roster => (
                          <RosterCard key={roster.id} roster={roster} summary={summaries.get(roster.id)} getStatusColor={getStatusColor}
                            onSelect={handleSelectRoster} onEdit={setEditingRoster} onDelete={setPendingDeleteRosterId} onActivate={handleActivateRoster} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {singleEventRosters.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CalendarDays size={16} className="text-orange-400" />
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Single Event Rosters</h2>
                <div className="flex-1 border-t border-slate-700/40" />
                <span className="text-xs text-slate-500">{singleEventRosters.length} roster{singleEventRosters.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {singleEventRosters.map(roster => (
                  <RosterCard key={roster.id} roster={roster} summary={summaries.get(roster.id)} getStatusColor={getStatusColor}
                    onSelect={handleSelectRoster} onEdit={setEditingRoster} onDelete={setPendingDeleteRosterId} onActivate={handleActivateRoster} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activation Confirmation Modal */}
      {pendingActivationRosterId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500/20 rounded-xl"><Play size={20} className="text-emerald-400" /></div>
              <h3 className="text-lg font-semibold text-white">Activate Roster?</h3>
            </div>
            <p className="text-slate-300 mb-6">Your roster has been created. Would you like to activate it now? This will create tasks and send reminders to assigned PROs.</p>
            <div className="flex items-center gap-3 justify-end">
              <button onClick={() => setPendingActivationRosterId(null)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Later</button>
              <button onClick={() => handleActivateRoster(pendingActivationRosterId)} className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl font-medium hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20">Activate Now</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteRosterId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/20 rounded-xl"><Trash2 size={20} className="text-red-400" /></div>
              <h3 className="text-lg font-semibold text-white">Delete Roster?</h3>
            </div>
            <p className="text-slate-300 mb-6">Are you sure you want to delete this roster? This will also remove all tasks created for members on this roster. This cannot be undone.</p>
            <div className="flex items-center gap-3 justify-end">
              <button onClick={() => setPendingDeleteRosterId(null)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => handleDeleteRoster(pendingDeleteRosterId)} className="px-5 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-xl font-medium hover:from-red-500 hover:to-red-400 transition-all shadow-lg shadow-red-500/20">Delete Roster</button>
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
};

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="a-card flex items-center gap-3.5" style={{ padding: '16px 18px' }}>
      <span className="a-tile">{icon}</span>
      <div>
        <p className="a-cap">{label}</p>
        <div className="a-num a-ink text-[28px] font-semibold leading-[1.1] mt-1">{value}</div>
      </div>
    </div>
  );
}

function RosterCard({
  roster, summary, getStatusColor, onSelect, onEdit, onDelete, onActivate,
}: {
  roster: ProRoster;
  summary?: RosterAssignmentSummary;
  getStatusColor: (s: string) => string;
  onSelect: (r: ProRoster) => void;
  onEdit: (r: ProRoster) => void;
  onDelete: (id: string) => void;
  onActivate: (id: string) => void;
}) {
  const classImage = getBoatClassImage(roster.boat_class);
  const startDate = new Date(roster.start_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
  const endDate = new Date(roster.end_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const maxAvatars = 5;
  const memberAvatars = summary ? summary.member_avatars.slice(0, maxAvatars) : [];
  const memberNames = summary ? summary.member_names.slice(0, maxAvatars) : [];
  const extraMembers = summary ? Math.max(0, summary.member_ids.length - maxAvatars) : 0;

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden hover:border-slate-600/60 transition-all group cursor-pointer" onClick={() => onSelect(roster)}>
      {/* Image header */}
      <div className="relative h-32 overflow-hidden">
        {classImage ? (
          <img src={classImage} alt={roster.boat_class} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
            <Anchor size={32} className="text-slate-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Date badge */}
        <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-lg">
          <div className="text-[10px] font-semibold text-cyan-600 uppercase leading-none">{new Date(roster.start_date).toLocaleDateString('en-AU', { month: 'short' })}</div>
          <div className="text-lg font-bold text-slate-900 leading-none mt-0.5">{new Date(roster.start_date).getDate()}</div>
        </div>

        {/* Status badge */}
        <div className={`absolute top-2.5 right-2.5 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${getStatusColor(roster.status)}`}>
          {roster.status}
        </div>

        {/* Boat class name */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5">
          <div className="flex items-center gap-1.5">
            <Anchor size={12} className="text-white/80 flex-shrink-0" />
            <span className="text-xs font-medium text-white/90">{roster.boat_class}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        <h3 className="font-semibold text-white text-sm group-hover:text-cyan-400 transition-colors truncate">{roster.name}</h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500">
          <Calendar size={11} />
          <span>{startDate} - {endDate}</span>
          {summary && (
            <>
              <span className="text-slate-700 mx-0.5">|</span>
              <span>{summary.total_rounds} days</span>
            </>
          )}
        </div>

        {/* Member avatars */}
        {summary && summary.member_ids.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <div className="flex -space-x-2">
              {memberAvatars.map((avatar, i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-slate-800 bg-slate-700 flex items-center justify-center text-[9px] font-medium text-white overflow-hidden flex-shrink-0" title={memberNames[i]}>
                  {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : memberNames[i]?.split(' ').map(n => n[0]).join('')}
                </div>
              ))}
              {extraMembers > 0 && (
                <div className="w-7 h-7 rounded-full border-2 border-slate-800 bg-slate-600 flex items-center justify-center text-[9px] font-medium text-white flex-shrink-0">+{extraMembers}</div>
              )}
            </div>
            <span className="text-[11px] text-slate-500">{summary.member_ids.length} member{summary.member_ids.length !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* Progress bar */}
        {summary && summary.total_rounds > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span>{summary.assigned_count} / {summary.total_rounds} assigned</span>
              <span>{summary.confirmed_count} confirmed</span>
            </div>
            <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all" style={{ width: `${Math.round((summary.assigned_count / summary.total_rounds) * 100)}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {roster.status === 'draft' && (
            <button onClick={e => { e.stopPropagation(); onActivate(roster.id); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Activate">
              <Play size={12} /> Activate
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onEdit(roster); }} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-all" title="Edit">
            <Pencil size={13} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(roster.id); }} className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterListDashboard({
  rosters, summaries, getStatusColor, onSelect, onEdit, onDelete, onActivate,
}: {
  rosters: ProRoster[];
  summaries: Map<string, RosterAssignmentSummary>;
  getStatusColor: (s: string) => string;
  onSelect: (r: ProRoster) => void;
  onEdit: (r: ProRoster) => void;
  onDelete: (id: string) => void;
  onActivate: (id: string) => void;
}) {
  const sorted = [...rosters].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  const cols = 'minmax(0,1.7fr) 110px minmax(0,1.15fr) 150px 170px 90px';
  const STATUS_GROUPS: { id: string; label: string; light: string }[] = [
    { id: 'active', label: 'Active', light: 'a-light-g' },
    { id: 'draft', label: 'Draft', light: 'a-light-a' },
    { id: 'completed', label: 'Completed', light: 'a-light-b' },
    { id: 'archived', label: 'Archived', light: 'a-light-n' },
  ];
  const known = new Set(STATUS_GROUPS.map(g => g.id));
  const groups = [...STATUS_GROUPS, { id: '__other', label: 'Other', light: 'a-light-n' }]
    .map(g => ({ ...g, rosters: sorted.filter(r => g.id === '__other' ? !known.has(r.status) : r.status === g.id) }))
    .filter(g => g.rosters.length > 0);
  const fmt = (d: string, y?: boolean) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });

  return (
    <div className="a-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 860 }}>
          <div className="grid gap-4 a-bd border-b" style={{ gridTemplateColumns: cols, padding: '12px 18px' }}>
            <p className="a-cap">Roster</p><p className="a-cap">Class</p><p className="a-cap">Dates</p><p className="a-cap">Members</p><p className="a-cap">Rostered</p><span />
          </div>
          {groups.map(g => (
            <React.Fragment key={g.id}>
              <div className="flex items-center gap-2.5" style={{ padding: '12px 18px 4px' }}>
                <span className={`a-light ${g.light}`} />
                <span className="a-display a-ink text-[14px] font-semibold">{g.label}</span>
                <span className="a-cnt">{g.rosters.length}</span>
              </div>
              {g.rosters.map(roster => {
                const summary = summaries.get(roster.id);
                const maxAvatars = 4;
                const avatars = summary ? summary.member_avatars.slice(0, maxAvatars) : [];
                const names = summary ? summary.member_names.slice(0, maxAvatars) : [];
                const extra = summary ? Math.max(0, summary.member_ids.length - maxAvatars) : 0;
                const pct = summary && summary.total_rounds > 0 ? Math.round((summary.assigned_count / summary.total_rounds) * 100) : 0;
                const segs = summary ? Math.min(summary.total_rounds, 12) : 0;
                const filled = summary && summary.total_rounds > 0 ? Math.round((summary.assigned_count / summary.total_rounds) * segs) : 0;
                const sameDay = roster.start_date === roster.end_date;
                return (
                  <div key={roster.id} onClick={() => onSelect(roster)} className="a-ros-row group grid gap-4 items-center cursor-pointer" style={{ gridTemplateColumns: cols, padding: '11px 18px' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="a-tile">{roster.series_id || (summary && summary.total_rounds > 1) ? <Layers size={17} /> : <CalendarDays size={17} />}</span>
                      <div className="min-w-0">
                        <div className="a-ink text-[14.5px] font-semibold truncate">{roster.name}</div>
                        <div className="a-dim text-[12px] mt-0.5">{roster.series_id || (summary && summary.total_rounds > 1) ? 'Series' : 'One-off'}{summary ? ` · ${summary.total_rounds} round${summary.total_rounds !== 1 ? 's' : ''}` : ''}</div>
                      </div>
                    </div>
                    <span className="min-w-0"><span className="a-lb-cls max-w-full" title={roster.boat_class}><svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" /></svg><span className="truncate">{shortClass(roster.boat_class)}</span></span></span>
                    <span className="a-mute a-num text-[13px]" style={{ letterSpacing: 0 }}>{sameDay ? fmt(roster.start_date, true) : `${fmt(roster.start_date, new Date(roster.start_date).getFullYear() !== new Date(roster.end_date).getFullYear())} – ${fmt(roster.end_date, true)}`}</span>
                    <div>
                      {summary && summary.member_ids.length > 0 ? (
                        <span className="inline-flex items-center">
                          {avatars.map((avatar, i) => (
                            <span key={i} className="inline-flex" style={{ marginLeft: i ? -7 : 0 }} title={names[i]}>
                              <AAvatar url={avatar} first={names[i]?.split(' ')[0]} last={names[i]?.split(' ').slice(-1)[0]} size={26} className="a-av-ring" />
                            </span>
                          ))}
                          {extra > 0 && <span className="a-av a-av-more" style={{ marginLeft: -7 }}>+{extra}</span>}
                        </span>
                      ) : (
                        <span className="a-dim text-[12.5px]">No one yet</span>
                      )}
                    </div>
                    <div>
                      {summary && summary.total_rounds > 0 ? (
                        <>
                          <div className="flex gap-0.5">
                            {Array.from({ length: segs }, (_, i) => (
                              <span key={i} className="flex-1 h-2 rounded-[2px]" style={{ background: i < filled ? (pct >= 100 ? '#30D158' : '#0A84FF') : 'var(--a-ring-track, rgba(255,255,255,0.08))' }} />
                            ))}
                          </div>
                          <div className="flex justify-between mt-[5px] text-[11.5px]">
                            <span className={pct >= 100 ? 'a-txt-g' : pct > 0 ? 'a-txt-b' : 'a-dim'}>{pct >= 100 ? 'Fully rostered' : pct > 0 ? `${summary.total_rounds - summary.assigned_count} to fill` : 'Not started'}</span>
                            <span className="a-num a-mute">{pct}%</span>
                          </div>
                        </>
                      ) : (
                        <span className="a-dim text-[12.5px]">No rounds</span>
                      )}
                    </div>
                    <div className="flex justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      {roster.status === 'draft' && (
                        <button onClick={() => onActivate(roster.id)} className="a-ib a-txt-g" title="Activate" aria-label="Activate">
                          <Play size={16} />
                        </button>
                      )}
                      <button onClick={() => onEdit(roster)} className="a-ib" title="Edit" aria-label="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => onDelete(roster.id)} className="a-ib a-ib-d" title="Delete" aria-label="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {sorted.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">No rosters match your filters</div>
      )}
    </div>
  );
}

function extractSeriesName(rosters: ProRoster[]): string {
  const names = rosters.map(r => r.name);
  if (names.length === 0) return 'Unknown Series';
  const suffixPatterns = [/\s+(scratch|handicap)\s+pro\s+roster$/i, /\s+pro\s+roster$/i, /\s+roster$/i];
  const stripped = names.map(n => { let result = n; for (const pat of suffixPatterns) result = result.replace(pat, ''); return result; });
  const boatClassPattern = /^(.*?)(?:\s+(?:scratch|handicap))?$/i;
  const bases = stripped.map(s => {
    const dayPatterns = [/\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekday)/i];
    let base = s; for (const dp of dayPatterns) base = base.replace(dp, '');
    const m = base.match(boatClassPattern);
    return m ? m[1].trim() : base.trim();
  });
  const freq = new Map<string, number>();
  for (const b of bases) freq.set(b, (freq.get(b) || 0) + 1);
  let bestBase = bases[0] || 'Unknown Series', bestCount = 0;
  for (const [b, c] of Array.from(freq.entries())) { if (c > bestCount) { bestCount = c; bestBase = b; } }
  if (bestBase.length < 3) {
    const longestName = names.reduce((a, b) => a.length >= b.length ? a : b, '');
    for (const pat of suffixPatterns) bestBase = longestName.replace(pat, '');
  }
  return bestBase || 'Series Rosters';
}
