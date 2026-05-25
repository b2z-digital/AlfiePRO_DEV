import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Anchor, CircleCheck as CheckCircle, Clock, Search, Users } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { getSignOnSheet, signOn, signOff, RaceDaySignOn } from '../utils/raceSignOnStorage';

interface EventSkipper {
  name: string;
  sailNo?: string;
  memberId?: string;
  hull?: string;
  [key: string]: any;
}

interface EventInfo {
  id: string;
  event_name: string;
  club_id: string;
  skippers: EventSkipper[];
  race_date?: string;
  end_date?: string;
  multi_day?: boolean;
  number_of_days?: number;
}

export default function SignOnKioskPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [clubName, setClubName] = useState('');
  const [entries, setEntries] = useState<RaceDaySignOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raceDay, setRaceDay] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (eventId) loadEvent();
  }, [eventId]);

  useEffect(() => {
    if (eventInfo) loadEntries();
  }, [eventInfo, raceDay]);

  const loadEvent = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('quick_races')
        .select('id, event_name, club_id, skippers, race_date, end_date, multi_day, number_of_days')
        .eq('id', eventId)
        .maybeSingle();

      if (err || !data) {
        setError('Event not found');
        setLoading(false);
        return;
      }

      setEventInfo(data as EventInfo);

      // Load club name
      if (data.club_id) {
        const { data: club } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', data.club_id)
          .maybeSingle();
        if (club) setClubName(club.name);
      }
    } catch {
      setError('Failed to load event');
    }
    setLoading(false);
  };

  const loadEntries = async () => {
    if (!eventInfo) return;
    const data = await getSignOnSheet(eventInfo.id, raceDay);
    setEntries(data);
  };

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  const getSkipperStatus = (skipper: EventSkipper) => {
    return entries.find(e =>
      e.skipper_name.toLowerCase() === skipper.name.toLowerCase() ||
      (skipper.sailNo && e.sail_number === skipper.sailNo)
    );
  };

  const handleTapSkipper = async (skipper: EventSkipper) => {
    if (!eventInfo) return;
    const existing = getSkipperStatus(skipper);

    if (!existing) {
      const result = await signOn({
        event_id: eventInfo.id,
        club_id: eventInfo.club_id,
        race_day: raceDay,
        skipper_name: skipper.name,
        sail_number: skipper.sailNo || '',
        member_id: skipper.memberId || null,
        user_id: null,
        signed_on_by: 'self',
        emergency_contact_name: null,
        emergency_contact_phone: null,
        notes: null,
      });
      if (result.success) {
        showSuccess(`${skipper.name} signed on`);
        loadEntries();
      }
    } else if (!existing.signed_off_at) {
      const result = await signOff(existing.id);
      if (result.success) {
        showSuccess(`${skipper.name} signed off`);
        loadEntries();
      }
    }
  };

  // Generate event day tabs for multi-day events
  const getEventDays = (): { date: string; label: string }[] => {
    if (!eventInfo?.multi_day || !eventInfo?.race_date) return [];
    const days: { date: string; label: string }[] = [];
    const numDays = eventInfo.number_of_days || (eventInfo.end_date
      ? Math.ceil((new Date(eventInfo.end_date).getTime() - new Date(eventInfo.race_date).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 1);
    for (let i = 0; i < numDays; i++) {
      const d = new Date(eventInfo.race_date);
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().split('T')[0],
        label: `Day ${i + 1}`,
      });
    }
    return days;
  };

  const eventDays = getEventDays();
  const skippers = eventInfo?.skippers || [];
  const signedOnCount = entries.length;

  // Filter skippers by search
  const filteredSkippers = skippers.filter(s => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return s.name.toLowerCase().includes(term) || (s.sailNo && s.sailNo.toLowerCase().includes(term));
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !eventInfo) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Anchor className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-2">Event Not Found</h1>
          <p className="text-slate-400">{error || 'This sign-on link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3 safe-area-top">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-900/40 rounded-xl">
              <Anchor className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-white truncate">{eventInfo.event_name}</h1>
              <p className="text-xs text-slate-400">
                {clubName && `${clubName} | `}Tap your name to sign on
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-400">{signedOnCount}</div>
              <div className="text-[10px] text-slate-500 uppercase">Signed On</div>
            </div>
          </div>
        </div>
      </header>

      {/* Day Selector for multi-day events */}
      {eventDays.length > 1 && (
        <div className="px-4 py-3 border-b border-slate-700/50">
          <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto">
            {eventDays.map(day => {
              const isSelected = raceDay === day.date;
              const isToday = day.date === new Date().toISOString().split('T')[0];
              return (
                <button
                  key={day.date}
                  onClick={() => setRaceDay(day.date)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : isToday
                        ? 'bg-blue-900/30 text-blue-300 border border-blue-700/50'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {day.label}
                  <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                    {new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-4 py-3">
        <div className="max-w-lg mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Find your name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-3 text-sm bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Success toast */}
      {successMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-green-600 text-white rounded-xl shadow-lg text-sm font-medium animate-bounce-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {successMessage}
          </div>
        </div>
      )}

      {/* Skipper Grid */}
      <div className="flex-1 px-4 pb-6">
        <div className="max-w-lg mx-auto">
          {skippers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No registered skippers for this event</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSkippers.map((skipper, idx) => {
                const entry = getSkipperStatus(skipper);
                const isSignedOn = entry && !entry.signed_off_at;
                const isSignedOff = !!entry?.signed_off_at;

                return (
                  <button
                    key={`${skipper.name}-${idx}`}
                    onClick={() => handleTapSkipper(skipper)}
                    disabled={isSignedOff}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all active:scale-[0.98] ${
                      isSignedOn
                        ? 'bg-blue-900/30 border-blue-600/50'
                        : isSignedOff
                          ? 'bg-green-900/10 border-green-800/30 opacity-50'
                          : 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:bg-slate-750'
                    }`}
                  >
                    {/* Status circle */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isSignedOn
                        ? 'bg-blue-600 text-white'
                        : isSignedOff
                          ? 'bg-green-600/20 text-green-500'
                          : 'bg-slate-700 text-slate-500'
                    }`}>
                      {isSignedOn ? (
                        <Anchor className="w-5 h-5" />
                      ) : isSignedOff ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <span className="text-lg font-bold">{skipper.name.charAt(0)}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${isSignedOff ? 'text-slate-500' : 'text-white'}`}>
                          {skipper.name}
                        </span>
                        {skipper.sailNo && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">
                            {skipper.sailNo}
                          </span>
                        )}
                      </div>
                      {skipper.hull && (
                        <p className="text-xs text-slate-500 mt-0.5">{skipper.hull}</p>
                      )}
                      {entry && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          <span>On {new Date(entry.signed_on_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {entry.signed_off_at && (
                            <span className="text-green-500">
                              Off {new Date(entry.signed_off_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Status label */}
                    <div className="flex-shrink-0">
                      {isSignedOn ? (
                        <span className="text-xs font-medium text-blue-400 px-2 py-1 rounded-lg bg-blue-900/30">
                          Tap to sign off
                        </span>
                      ) : isSignedOff ? (
                        <span className="text-xs font-medium text-green-500">Done</span>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 px-2 py-1 rounded-lg bg-slate-700/50">
                          Tap to sign on
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 px-4 py-3 bg-slate-800/50">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {new Date(raceDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-xs text-slate-500">
            {signedOnCount}/{skippers.length} signed on
          </p>
        </div>
      </footer>
    </div>
  );
}
