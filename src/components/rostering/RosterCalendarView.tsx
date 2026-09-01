import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, User } from 'lucide-react';
import type { ProRoster } from '../../types/proRoster';
import type { RosterAssignmentSummary } from '../../utils/proRosterStorage';
import { getBoatClassImage } from '../../utils/boatClassImages';

interface RosterCalendarViewProps {
  rosters: ProRoster[];
  summaries: Map<string, RosterAssignmentSummary>;
  onSelectRoster: (roster: ProRoster) => void;
}

interface CalendarEvent {
  date: string;
  roster: ProRoster;
  memberName: string | null;
  memberAvatar: string | null;
}

export const RosterCalendarView: React.FC<RosterCalendarViewProps> = ({ rosters, summaries, onSelectRoster }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split('T')[0];

  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    for (const roster of rosters) {
      if (roster.status === 'archived') continue;
      const summary = summaries.get(roster.id);

      if (summary && summary.round_dates.length > 0) {
        for (const roundDate of summary.round_dates) {
          if (!roundDate.startsWith(monthPrefix)) continue;
          const assignment = summary.round_assignments.get(roundDate);
          events.push({
            date: roundDate,
            roster,
            memberName: assignment?.member_name || null,
            memberAvatar: assignment?.member_avatar || null,
          });
        }
      } else {
        if (roster.start_date.startsWith(monthPrefix)) {
          events.push({ date: roster.start_date, roster, memberName: null, memberAvatar: null });
        }
      }
    }
    return events;
  }, [rosters, summaries, year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of calendarEvents) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    }
    return map;
  }, [calendarEvents]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/80';
      case 'draft': return 'bg-yellow-500/80';
      case 'completed': return 'bg-blue-500/80';
      default: return 'bg-slate-500/80';
    }
  };

  const cells: React.ReactNode[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} className="min-h-[100px] bg-slate-900/20 border border-slate-800/30 rounded-lg" />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const dayEvents = eventsByDate.get(dateStr) || [];

    cells.push(
      <div
        key={dateStr}
        className={`min-h-[100px] border rounded-lg p-1.5 transition-colors ${
          isToday
            ? 'border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/30'
            : 'border-slate-700/40 bg-slate-800/30 hover:bg-slate-800/50'
        }`}
      >
        <div className={`text-xs font-medium mb-1 ${isToday ? 'text-cyan-400' : 'text-slate-500'}`}>
          {day}
        </div>
        <div className="space-y-1">
          {dayEvents.slice(0, 3).map((ev, idx) => {
            const img = getBoatClassImage(ev.roster.boat_class);
            return (
              <button
                key={`${ev.roster.id}-${idx}`}
                onClick={() => onSelectRoster(ev.roster)}
                className="w-full text-left group"
              >
                <div className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium text-white truncate ${statusColor(ev.roster.status)} hover:opacity-90 transition-opacity`}>
                  {img && <img src={img} alt="" className="w-3.5 h-3.5 rounded-sm object-cover flex-shrink-0" />}
                  <span className="truncate">{ev.roster.boat_class}</span>
                </div>
                {ev.memberName && (
                  <div className="flex items-center gap-1 mt-0.5 px-1">
                    {ev.memberAvatar ? (
                      <img src={ev.memberAvatar} alt="" className="w-3 h-3 rounded-full object-cover" />
                    ) : (
                      <User size={8} className="text-slate-500" />
                    )}
                    <span className="text-[9px] text-slate-500 truncate">{ev.memberName}</span>
                  </div>
                )}
              </button>
            );
          })}
          {dayEvents.length > 3 && (
            <div className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 3} more</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-lg font-semibold text-white min-w-[180px] text-center">{monthName}</h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            <ChevronRight size={16} />
          </button>
          <button onClick={goToday} className="px-3 py-1 rounded-lg text-xs bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            Today
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" /> Active</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" /> Draft</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500/80" /> Completed</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-medium text-slate-500 uppercase tracking-wider py-2">{d}</div>
        ))}
        {cells}
      </div>

      {calendarEvents.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm">
          No rosters scheduled this month
        </div>
      )}
    </div>
  );
};
