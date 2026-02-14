import React from 'react';
import { AlertTriangle, Calendar, MapPin, Trophy, X } from 'lucide-react';
import { ClashingEvent } from '../../utils/publicEventStorage';

interface EventClashWarningModalProps {
  darkMode: boolean;
  clashingEvents: ClashingEvent[];
  eventName: string;
  onProceed: () => void;
  onCancel: () => void;
}

export const EventClashWarningModal: React.FC<EventClashWarningModalProps> = ({
  darkMode,
  clashingEvents,
  eventName,
  onProceed,
  onCancel,
}) => {
  const formatDate = (date: string, endDate?: string) => {
    try {
      const start = new Date(date + 'T00:00:00');
      const formatted = start.toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      if (endDate && endDate !== date) {
        const end = new Date(endDate + 'T00:00:00');
        const endFormatted = end.toLocaleDateString('en-AU', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        return `${formatted} - ${endFormatted}`;
      }
      return formatted;
    } catch {
      return date;
    }
  };

  const getLevelBadge = (level: string) => {
    if (level === 'national') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          National
        </span>
      );
    }
    if (level === 'club') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
          Club
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        State
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fadeIn">
      <div
        className={`
          w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border animate-slideUp
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}
      >
        <div className={`
          px-6 py-4 border-b flex items-center gap-3
          ${darkMode ? 'border-slate-700 bg-amber-900/20' : 'border-amber-200 bg-amber-50'}
        `}>
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={22} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Event Date Clash Detected
            </h3>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Your event overlaps with existing events
            </p>
          </div>
          <button
            onClick={onCancel}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4">
          <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            <strong>"{eventName}"</strong> overlaps with the following {clashingEvents.length === 1 ? 'event' : 'events'}:
          </p>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {clashingEvents.map((evt) => (
              <div
                key={evt.id}
                className={`
                  p-3 rounded-xl border
                  ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h4 className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {evt.event_name}
                  </h4>
                  {getLevelBadge(evt.event_level)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Calendar size={12} />
                    {formatDate(evt.date, evt.end_date)}
                  </div>
                  {evt.venue && (
                    <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <MapPin size={12} />
                      {evt.venue}
                    </div>
                  )}
                  {evt.race_class && (
                    <div className={`flex items-center gap-1.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      <Trophy size={12} />
                      {evt.race_class}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={`
            mt-4 p-3 rounded-xl text-sm
            ${darkMode ? 'bg-amber-900/20 text-amber-300' : 'bg-amber-50 text-amber-700'}
          `}>
            Would you like to proceed with creating this event despite the date clash?
          </div>
        </div>

        <div className={`
          px-6 py-4 border-t flex items-center justify-end gap-3
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onCancel}
            className={`
              px-5 py-2.5 rounded-xl font-medium text-sm transition-colors
              ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}
            `}
          >
            Go Back
          </button>
          <button
            onClick={onProceed}
            className="px-5 py-2.5 rounded-xl font-medium text-sm bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/20"
          >
            Acknowledge & Create Anyway
          </button>
        </div>
      </div>
    </div>
  );
};
