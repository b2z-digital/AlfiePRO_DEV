import React, { useState, useEffect } from 'react';
import { Send, Calendar, Users, Sailboat, MapPin, AlertTriangle, CheckCircle, Loader2, MessageSquare, Coins } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface UpcomingEvent {
  id: string;
  name: string;
  date: string;
  boat_class: string;
  venue: string;
  isSeriesRound: boolean;
}

interface SmsManualSendProps {
  darkMode?: boolean;
  clubId: string;
}

export const SmsManualSend: React.FC<SmsManualSendProps> = ({ darkMode = true, clubId }) => {
  const { addNotification } = useNotifications();
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<UpcomingEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [checkingEligible, setCheckingEligible] = useState(false);

  useEffect(() => {
    if (clubId) {
      fetchUpcomingEvents();
      fetchTokenBalance();
    }
  }, [clubId]);

  const fetchTokenBalance = async () => {
    const { data } = await supabase
      .from('sms_token_balances')
      .select('balance')
      .eq('club_id', clubId)
      .maybeSingle();
    setTokenBalance(data?.balance || 0);
  };

  const fetchUpcomingEvents = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 60);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const { data: quickRaces } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_class, race_venue, club_id, archived, completed')
        .eq('club_id', clubId)
        .gte('race_date', today)
        .lte('race_date', futureDateStr)
        .eq('completed', false)
        .eq('archived', false)
        .order('race_date');

      const upcomingEvents: UpcomingEvent[] = [];

      if (quickRaces) {
        for (const race of quickRaces) {
          upcomingEvents.push({
            id: race.id,
            name: race.event_name || 'Club Race',
            date: race.race_date,
            boat_class: race.race_class || '',
            venue: race.race_venue || '',
            isSeriesRound: false,
          });
        }
      }

      const { data: series } = await supabase
        .from('race_series')
        .select('id, series_name, club_id, rounds, race_class')
        .eq('club_id', clubId)
        .eq('completed', false);

      if (series) {
        for (const s of series) {
          if (!s.rounds) continue;
          let rounds: any[] = [];
          try {
            rounds = typeof s.rounds === 'string' ? JSON.parse(s.rounds) : s.rounds;
          } catch { continue; }

          for (const round of rounds) {
            const roundDate = round.date || round.round_date;
            if (roundDate && roundDate >= today && roundDate <= futureDateStr && !round.completed) {
              upcomingEvents.push({
                id: `${s.id}__${round.name || round.round_name}`,
                name: `${s.series_name} - ${round.name || round.round_name}`,
                date: roundDate,
                boat_class: s.race_class || '',
                venue: round.venue || '',
                isSeriesRound: true,
              });
            }
          }
        }
      }

      upcomingEvents.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(upcomingEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkEligibleMembers = async (event: UpcomingEvent) => {
    setCheckingEligible(true);
    try {
      let query = supabase
        .from('members')
        .select('id, phone')
        .eq('club_id', clubId)
        .not('phone', 'is', null)
        .neq('phone', '');

      const { data: members } = await query;
      let count = members?.length || 0;

      if (event.boat_class && members && members.length > 0) {
        const memberIds = members.map(m => m.id);
        const { data: boats } = await supabase
          .from('member_boats')
          .select('member_id')
          .in('member_id', memberIds)
          .eq('boat_type', event.boat_class);

        if (boats) {
          const boatMemberIds = new Set(boats.map((b: any) => b.member_id));
          count = members.filter(m => boatMemberIds.has(m.id)).length;
        }
      }

      setEligibleCount(count);
    } catch (err) {
      console.error('Error checking eligible members:', err);
    } finally {
      setCheckingEligible(false);
    }
  };

  const handleSelectEvent = (event: UpcomingEvent) => {
    setSelectedEvent(event);
    setSendResult(null);
    setEligibleCount(null);
    checkEligibleMembers(event);
  };

  const handleSend = async () => {
    if (!selectedEvent) return;

    setSending(true);
    setSendResult(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-event-sms`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          club_id: clubId,
          event_id: selectedEvent.id,
          event_name: selectedEvent.name,
          event_date: selectedEvent.date,
          boat_class: selectedEvent.boat_class,
          venue: selectedEvent.venue,
          trigger_type: 'manual',
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to send SMS');
      }

      setSendResult(result);
      addNotification('success', `${result.sent} SMS messages sent successfully!`);
      fetchTokenBalance();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to send SMS');
      setSendResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`flex items-center justify-between p-4 rounded-xl ${
        darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <Coins size={18} className={tokenBalance > 10 ? 'text-teal-400' : 'text-red-400'} />
          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Available tokens: <strong className={darkMode ? 'text-white' : 'text-slate-900'}>{tokenBalance}</strong>
          </span>
        </div>
      </div>

      <div>
        <h3 className={`text-sm font-semibold mb-3 uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Upcoming Events
        </h3>

        {events.length === 0 ? (
          <div className={`text-center py-12 rounded-xl ${darkMode ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
            <Calendar size={40} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <p className={`font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No upcoming events</p>
            <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Events in the next 60 days will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const isSelected = selectedEvent?.id === event.id;
              return (
                <div
                  key={event.id}
                  onClick={() => handleSelectEvent(event)}
                  className={`p-4 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? darkMode
                        ? 'bg-blue-500/10 border-2 border-blue-500/40 ring-1 ring-blue-500/20'
                        : 'bg-blue-50 border-2 border-blue-300'
                      : darkMode
                        ? 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600'
                        : 'bg-white border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {event.name}
                      </h4>
                      <div className={`flex items-center gap-4 mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {new Date(event.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        {event.boat_class && (
                          <span className="flex items-center gap-1">
                            <Sailboat size={12} />
                            {event.boat_class}
                          </span>
                        )}
                        {event.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} />
                            {event.venue}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className={`ml-4 px-3 py-1 rounded-full text-xs font-medium ${
                        darkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                      }`}>
                        Selected
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className={`p-5 rounded-xl ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-white border border-slate-200'}`}>
          <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Send SMS for: {selectedEvent.name}
          </h3>

          <div className={`p-4 rounded-xl mb-4 ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
            <div className="flex items-center gap-3 mb-2">
              <Users size={16} className={darkMode ? 'text-slate-300' : 'text-slate-700'} />
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Eligible Members
              </span>
            </div>
            {checkingEligible ? (
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-blue-400" />
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Checking...</span>
              </div>
            ) : eligibleCount !== null ? (
              <div>
                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{eligibleCount}</p>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  members with phone numbers{selectedEvent.boat_class ? ` and ${selectedEvent.boat_class} boats` : ''}
                </p>
                {eligibleCount > tokenBalance && (
                  <div className="mt-2 flex items-center gap-2 text-red-400">
                    <AlertTriangle size={14} />
                    <span className="text-xs font-medium">
                      Not enough tokens. Need {eligibleCount}, have {tokenBalance}.
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {sendResult?.success ? (
            <div className={`p-4 rounded-xl ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-400" />
                <div>
                  <p className={`font-medium ${darkMode ? 'text-green-300' : 'text-green-800'}`}>
                    SMS Sent Successfully!
                  </p>
                  <p className={`text-sm ${darkMode ? 'text-green-400/70' : 'text-green-600'}`}>
                    {sendResult.sent} messages sent. {sendResult.failed > 0 ? `${sendResult.failed} failed. ` : ''}
                    {sendResult.tokens_remaining} tokens remaining.
                  </p>
                </div>
              </div>
            </div>
          ) : sendResult?.error ? (
            <div className={`p-4 rounded-xl ${darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-red-400" />
                <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-800'}`}>{sendResult.error}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || (eligibleCount !== null && eligibleCount === 0) || (eligibleCount !== null && eligibleCount > tokenBalance)}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-teal-500 text-white rounded-xl font-semibold hover:bg-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-500/20"
            >
              {sending ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Sending SMS...
                </>
              ) : (
                <>
                  <Send size={18} />
                  Send SMS to {eligibleCount || 0} Members
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
