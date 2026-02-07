import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Users, UserPlus, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';

interface ScheduleDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  documentType: 'nor' | 'si';
  eventDate: string;
  eventName: string;
  onSchedule: (contacts: string[], contactEmails: string[], dueDate: string) => void;
  isLinked?: boolean;
}

interface ClubMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_id: string | null;
  avatar_url: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const ScheduleDocumentModal: React.FC<ScheduleDocumentModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  documentType,
  eventDate,
  eventName,
  onSchedule,
  isLinked = false
}) => {
  const { currentClub } = useAuth();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const eventDateObj = useMemo(() => eventDate ? new Date(eventDate + 'T00:00:00') : null, [eventDate]);

  useEffect(() => {
    if (isOpen && eventDate) {
      const evDate = new Date(eventDate + 'T00:00:00');
      const suggested = new Date(evDate);
      suggested.setDate(suggested.getDate() - 60);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (suggested < today) {
        suggested.setTime(today.getTime());
      }

      const dateStr = `${suggested.getFullYear()}-${String(suggested.getMonth() + 1).padStart(2, '0')}-${String(suggested.getDate()).padStart(2, '0')}`;
      setDueDate(dateStr);
      setCalendarMonth(suggested.getMonth());
      setCalendarYear(suggested.getFullYear());

      fetchMembers();
    }
  }, [isOpen, eventDate, currentClub]);

  const fetchMembers = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, user_id, avatar_url')
        .eq('club_id', currentClub.clubId)
        .eq('membership_status', 'active')
        .order('last_name');

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const relativeLabel = useMemo(() => {
    if (!dueDate || !eventDateObj) return '';
    const due = new Date(dueDate + 'T00:00:00');
    const diffMs = eventDateObj.getTime() - due.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'On the event date';
    if (diffDays === 1) return '1 day before the event';
    if (diffDays < 7) return `${diffDays} days before the event`;
    if (diffDays < 14) return '1 week before the event';
    const weeks = Math.round(diffDays / 7);
    if (diffDays < 28) return `${weeks} weeks before the event`;
    const months = Math.round(diffDays / 30);
    if (months === 1) return 'About 1 month before the event';
    return `About ${months} months before the event`;
  }, [dueDate, eventDateObj]);

  const isDateInPast = useMemo(() => {
    if (!dueDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(dueDate + 'T00:00:00') < today;
  }, [dueDate]);

  const isDateAfterEvent = useMemo(() => {
    if (!dueDate || !eventDateObj) return false;
    return new Date(dueDate + 'T00:00:00') > eventDateObj;
  }, [dueDate, eventDateObj]);

  const handleSubmit = () => {
    const selectedContacts = selectedMembers.map(id => {
      const member = members.find(m => m.id === id);
      return member?.user_id || member?.email || '';
    }).filter(Boolean);

    const emails = manualEmails
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    onSchedule([...selectedContacts, ...emails], emails, dueDate);
    onClose();
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

  const formatLocalDate = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const handleSelectDate = (day: number) => {
    setDueDate(formatLocalDate(calendarYear, calendarMonth, day));
    setShowCalendar(false);
  };

  const navigateMonth = (direction: -1 | 1) => {
    let newMonth = calendarMonth + direction;
    let newYear = calendarYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
  };

  const isDayDisabled = (day: number) => {
    if (!eventDateObj) return false;
    const date = new Date(calendarYear, calendarMonth, day);
    return date > eventDateObj;
  };

  const isDayToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && calendarMonth === today.getMonth() && calendarYear === today.getFullYear();
  };

  const isDaySelected = (day: number) => {
    if (!dueDate) return false;
    const d = new Date(dueDate + 'T00:00:00');
    return day === d.getDate() && calendarMonth === d.getMonth() && calendarYear === d.getFullYear();
  };

  const isDayEventDate = (day: number) => {
    if (!eventDateObj) return false;
    return day === eventDateObj.getDate() && calendarMonth === eventDateObj.getMonth() && calendarYear === eventDateObj.getFullYear();
  };

  if (!isOpen) return null;

  const documentLabel = documentType === 'nor' ? 'Notice of Race (NOR)' : 'Sailing Instructions (SI)';
  const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
  const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] flex flex-col ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Calendar className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Schedule {isLinked ? 'NOR & SI' : documentLabel} Creation
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {eventName} {isLinked && '(Linked Schedules)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-slate-700/50 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="relative">
            <div className={`p-4 rounded-xl border-2 transition-all ${
              isDateAfterEvent
                ? 'border-red-500/50 bg-red-900/10'
                : darkMode
                  ? 'border-slate-600 bg-slate-700/40'
                  : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="text-blue-500" size={16} />
                  <span className={`text-sm font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                    Document Due Date
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${darkMode
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'}
                  `}
                >
                  {showCalendar ? 'Close' : 'Change Date'}
                </button>
              </div>

              <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }) : 'Select a date'}
              </p>
              <p className={`text-sm mt-1 ${
                isDateAfterEvent ? 'text-red-400 font-medium' : darkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {isDateAfterEvent ? 'Due date cannot be after the event date' : relativeLabel}
              </p>

              {isDateInPast && !isDateAfterEvent && (
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-400">This date is in the past</span>
                </div>
              )}
            </div>

            {showCalendar && (
              <div className={`
                mt-2 rounded-xl border shadow-2xl overflow-hidden
                ${darkMode ? 'bg-slate-750 border-slate-600' : 'bg-white border-slate-200'}
              `} style={darkMode ? { backgroundColor: '#1e293b' } : {}}>
                <div className={`flex items-center justify-between px-4 py-3 ${
                  darkMode ? 'bg-slate-700/60' : 'bg-slate-50'
                }`}>
                  <button
                    type="button"
                    onClick={() => navigateMonth(-1)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-slate-600 text-slate-300' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {MONTH_NAMES[calendarMonth]} {calendarYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigateMonth(1)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-slate-600 text-slate-300' : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="p-3">
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_NAMES.map(d => (
                      <div key={d} className={`text-center text-xs font-medium py-1 ${
                        darkMode ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-0.5">
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const disabled = isDayDisabled(day);
                      const selected = isDaySelected(day);
                      const today = isDayToday(day);
                      const isEvent = isDayEventDate(day);

                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={disabled}
                          onClick={() => handleSelectDate(day)}
                          className={`
                            relative w-full aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-all
                            ${disabled
                              ? darkMode
                                ? 'text-slate-600 cursor-not-allowed'
                                : 'text-slate-300 cursor-not-allowed'
                              : selected
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105'
                                : isEvent
                                  ? darkMode
                                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : today
                                    ? darkMode
                                      ? 'bg-slate-600/50 text-white hover:bg-slate-600'
                                      : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                                    : darkMode
                                      ? 'text-slate-300 hover:bg-slate-700/60'
                                      : 'text-slate-700 hover:bg-slate-100'
                            }
                          `}
                        >
                          {day}
                          {today && !selected && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-700/50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Selected</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${darkMode ? 'bg-emerald-500/50' : 'bg-emerald-300'}`} />
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Event date</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Today</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-3 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <Users size={16} />
              Select Responsible Members
            </label>
            <div className={`max-h-48 overflow-y-auto rounded-lg border ${darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              {loading ? (
                <div className="p-4 text-center text-slate-400">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No members found</div>
              ) : (
                <div className="divide-y divide-slate-700">
                  {members.map(member => (
                    <label
                      key={member.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/30 transition-colors ${
                        selectedMembers.includes(member.id) ? (darkMode ? 'bg-blue-900/20' : 'bg-blue-50') : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-600 focus:ring-offset-slate-800"
                      />
                      <Avatar
                        src={member.avatar_url}
                        alt={`${member.first_name} ${member.last_name}`}
                        size="sm"
                      />
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {member.first_name} {member.last_name}
                        </div>
                        <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {member.email}
                          {member.user_id && (
                            <span className="ml-2 text-green-500">(In Alfie)</span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              <UserPlus size={16} />
              Add External Contacts (Optional)
            </label>
            <input
              type="text"
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className={`w-full px-4 py-2 rounded-lg ${
                darkMode
                  ? 'bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Separate multiple emails with commas. These contacts will receive task notifications via email.
            </p>
          </div>

          <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-900/30 border border-slate-700' : 'bg-slate-100 border border-slate-200'}`}>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {isLinked
                ? 'High-priority tasks will be created for BOTH Notice of Race and Sailing Instructions and assigned to the selected members.'
                : 'A high-priority task will be created and assigned to the selected members.'
              }
              {' '}The task{isLinked ? 's' : ''} will be due on{' '}
              <strong>
                {dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'the selected date'}
              </strong>
              {relativeLabel ? ` (${relativeLabel.toLowerCase()})` : ''}.
              {' '}You will automatically be added as a contributor to track progress.
            </p>
            <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <strong>Email Reminders:</strong> Selected members will receive initial task notification and reminder emails as the due date approaches. Follow-up reminders will be sent if the task remains incomplete.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={(selectedMembers.length === 0 && !manualEmails.trim()) || isDateAfterEvent}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              (selectedMembers.length === 0 && !manualEmails.trim()) || isDateAfterEvent
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30'
            }`}
          >
            Schedule Task
          </button>
        </div>
      </div>
    </div>
  );
};
