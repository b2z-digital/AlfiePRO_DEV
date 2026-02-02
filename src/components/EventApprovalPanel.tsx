import React, { useState, useEffect } from 'react';
import { Check, X, Clock, AlertCircle, Calendar, MapPin, Trophy, User, Eye, FileText, DollarSign, Users } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface PendingEvent {
  id: string;
  event_name: string;
  date: string;
  end_date?: string;
  venue: string;
  event_level: 'club' | 'state' | 'national';
  approval_status: string;
  created_at: string;
  club_id?: string;
  created_by_type: string;
  created_by_id: string;
  race_class?: string;
  race_format?: string;
  multi_day?: boolean;
  number_of_days?: number;
  is_paid?: boolean;
  entry_fee?: number;
  is_interclub?: boolean;
  other_club_name?: string;
  notice_of_race_url?: string;
  sailing_instructions_url?: string;
  document_status?: string;
  document_contacts?: any;
  document_scheduled_task_ids?: any;
}

interface EventApprovalPanelProps {
  darkMode: boolean;
}

export const EventApprovalPanel: React.FC<EventApprovalPanelProps> = ({ darkMode }) => {
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PendingEvent | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const { user, currentOrganization } = useAuth();

  useEffect(() => {
    loadPendingEvents();
  }, [currentOrganization]);

  const loadPendingEvents = async () => {
    if (!currentOrganization) return;

    try {
      setLoading(true);

      let query = supabase
        .from('public_events')
        .select(`
          id,
          event_name,
          date,
          end_date,
          venue,
          event_level,
          approval_status,
          created_at,
          club_id,
          created_by_type,
          created_by_id,
          race_class,
          race_format,
          multi_day,
          number_of_days,
          is_paid,
          entry_fee,
          is_interclub,
          other_club_name,
          notice_of_race_url,
          sailing_instructions_url,
          document_status,
          document_contacts,
          document_scheduled_task_ids
        `);

      // Filter based on organization type
      if (currentOrganization.type === 'state') {
        // State association sees events that need state approval
        query = query
          .eq('state_association_id', currentOrganization.id)
          .in('approval_status', ['pending', 'pending_state']);
      } else if (currentOrganization.type === 'national') {
        // National association sees events that need national approval
        query = query
          .eq('national_association_id', currentOrganization.id)
          .in('approval_status', ['pending_national']);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      setPendingEvents(data || []);
    } catch (error) {
      console.error('Error loading pending events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (eventId: string, eventLevel: string) => {
    if (!user || !currentOrganization) return;

    try {
      setActionLoading(eventId);

      // Get the full event to check if it's a ranking event
      const { data: eventData } = await supabase
        .from('public_events')
        .select('is_ranking_event, event_level')
        .eq('id', eventId)
        .single();

      const updates: any = {};

      if (currentOrganization.type === 'national') {
        // National association approval - this is the final approval
        updates.national_approved_at = new Date().toISOString();
        updates.national_approved_by = user.id;
        updates.approval_status = 'approved';
      } else if (currentOrganization.type === 'state') {
        // State association approval
        updates.state_approved_at = new Date().toISOString();
        updates.state_approved_by = user.id;

        // Check if event needs national approval
        // National events or ranking state events need national approval after state approval
        const needsNationalApproval = eventLevel === 'national' ||
                                      (eventLevel === 'state' && eventData?.is_ranking_event);

        if (needsNationalApproval) {
          // Move to pending national approval
          updates.approval_status = 'pending_national';
        } else {
          // State approval is final for non-ranking state events
          updates.approval_status = 'approved';
        }
      }

      const { error } = await supabase
        .from('public_events')
        .update(updates)
        .eq('id', eventId);

      if (error) throw error;

      // Reload pending events
      await loadPendingEvents();
    } catch (error) {
      console.error('Error approving event:', error);
      alert('Failed to approve event. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (eventId: string) => {
    if (!user) return;

    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;

    try {
      setActionLoading(eventId);

      const { error } = await supabase
        .from('public_events')
        .update({
          approval_status: 'rejected',
          rejection_reason: reason,
          rejected_at: new Date().toISOString(),
          rejected_by: user.id
        })
        .eq('id', eventId);

      if (error) throw error;

      // Reload pending events
      await loadPendingEvents();
    } catch (error) {
      console.error('Error rejecting event:', error);
      alert('Failed to reject event. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
            <Clock size={12} />
            Pending Review
          </span>
        );
      case 'approved_national':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
            <Check size={12} />
            National Approved
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className={`rounded-lg p-8 ${darkMode ? 'bg-slate-800' : 'bg-white shadow-sm'}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (pendingEvents.length === 0) {
    return (
      <div className={`rounded-xl border backdrop-blur-sm p-8 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white/10 border-slate-200/20'}`}>
        <div className="text-center">
          <Check className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} size={48} />
          <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            All Caught Up!
          </h3>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            No events pending approval at this time.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg p-4 ${darkMode ? 'bg-blue-900/20 border border-blue-800/30' : 'bg-blue-50 border border-blue-200'}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="text-blue-400 mt-0.5" size={20} />
          <div>
            <h3 className={`font-medium mb-1 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
              Event Approval Required
            </h3>
            <p className={`text-sm ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
              {pendingEvents.length} event{pendingEvents.length !== 1 ? 's' : ''} awaiting your approval
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {pendingEvents.map((event) => (
          <div
            key={event.id}
            className={`
              rounded-lg p-5 border transition-all
              ${darkMode
                ? 'bg-slate-800 border-slate-700 hover:border-slate-600'
                : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}
            `}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    {event.event_name}
                  </h3>
                  {getStatusBadge(event.approval_status)}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                      {new Date(event.date).toLocaleDateString()}
                      {event.end_date && ` - ${new Date(event.end_date).toLocaleDateString()}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                      {event.venue}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Trophy size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                      {event.event_level.charAt(0).toUpperCase() + event.event_level.slice(1)} Event
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                      Created by: {event.created_by_type.charAt(0).toUpperCase() + event.created_by_type.slice(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
              <button
                onClick={() => {
                  setSelectedEvent(event);
                  setShowDetailsModal(true);
                }}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'}
                `}
              >
                <Eye size={16} />
                View Details
              </button>

              <button
                onClick={() => handleApprove(event.id, event.event_level)}
                disabled={actionLoading === event.id}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check size={16} />
                Approve
              </button>

              <button
                onClick={() => handleReject(event.id)}
                disabled={actionLoading === event.id}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  ${darkMode
                    ? 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/30'
                    : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'}
                `}
              >
                <X size={16} />
                Reject
              </button>

              {actionLoading === event.id && (
                <div className="ml-auto flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Processing...
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Event Details Modal */}
      {showDetailsModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`
            w-full max-w-3xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
            ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
          `}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trophy className="text-white" size={24} />
                <h2 className="text-2xl font-bold text-white">Event Details</h2>
              </div>
              <button
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedEvent(null);
                }}
                className="text-white/80 hover:text-white rounded-full p-2 hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Basic Info */}
                <div>
                  <h3 className={`text-lg font-semibold mb-3 ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                    {selectedEvent.event_name}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3">
                      <Calendar size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                      <div>
                        <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Date
                        </div>
                        <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {new Date(selectedEvent.date).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                          {selectedEvent.end_date && (
                            <span> - {new Date(selectedEvent.end_date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}</span>
                          )}
                        </div>
                        {selectedEvent.multi_day && (
                          <div className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Multi-day event ({selectedEvent.number_of_days} days)
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <MapPin size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                      <div>
                        <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Venue
                        </div>
                        <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                          {selectedEvent.venue}
                        </div>
                      </div>
                    </div>

                    {selectedEvent.race_class && (
                      <div className="flex items-start gap-3">
                        <Trophy size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Race Class
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {selectedEvent.race_class}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedEvent.race_format && (
                      <div className="flex items-start gap-3">
                        <Trophy size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Race Format
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {selectedEvent.race_format.charAt(0).toUpperCase() + selectedEvent.race_format.slice(1)} Racing
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Race Documents Section - Always Visible */}
                <div className={`rounded-lg p-4 border-2 ${darkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-300'}`}>
                  <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                    <FileText size={18} />
                    Race Documents
                  </h4>

                  {/* Show scheduled document notice */}
                  {selectedEvent.document_status === 'scheduled' && !selectedEvent.notice_of_race_url && !selectedEvent.sailing_instructions_url && (
                    <div className={`mb-3 p-3 rounded-lg border ${darkMode ? 'bg-amber-900/20 border-amber-700/50' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-start gap-2">
                        <Clock size={16} className={`mt-0.5 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                            Documents Scheduled for Creation
                          </p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-amber-300/70' : 'text-amber-600'}`}>
                            Notice of Race and Sailing Instructions are scheduled to be created and uploaded by the organizing club 2 months before the event date.
                          </p>
                          {selectedEvent.document_contacts && Array.isArray(selectedEvent.document_contacts) && selectedEvent.document_contacts.length > 0 && (
                            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Assigned to: {selectedEvent.document_contacts.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedEvent.notice_of_race_url || selectedEvent.sailing_instructions_url) ? (
                    <div className="space-y-2">
                      {selectedEvent.notice_of_race_url && (
                        <a
                          href={selectedEvent.notice_of_race_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                        >
                          <FileText size={16} />
                          View Notice of Race (PDF)
                        </a>
                      )}
                      {selectedEvent.sailing_instructions_url && (
                        <a
                          href={selectedEvent.sailing_instructions_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                        >
                          <FileText size={16} />
                          View Sailing Instructions (PDF)
                        </a>
                      )}
                    </div>
                  ) : selectedEvent.document_status !== 'scheduled' ? (
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      No race documents have been attached to this event.
                    </p>
                  ) : null}
                </div>

                {/* Additional Details */}
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedEvent.is_interclub && selectedEvent.other_club_name && (
                      <div className="flex items-start gap-3">
                        <Users size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Interclub Event
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            With {selectedEvent.other_club_name}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedEvent.is_paid && (
                      <div className="flex items-start gap-3">
                        <DollarSign size={18} className={`mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                        <div>
                          <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Entry Fee
                          </div>
                          <div className={`text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            ${selectedEvent.entry_fee?.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Event Level & Status */}
                <div className={`rounded-lg p-4 ${darkMode ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Event Level
                      </div>
                      <div className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        {selectedEvent.event_level.charAt(0).toUpperCase() + selectedEvent.event_level.slice(1)} Event
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Created By
                      </div>
                      <div className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        {selectedEvent.created_by_type.charAt(0).toUpperCase() + selectedEvent.created_by_type.slice(1)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Actions */}
            <div className={`p-6 border-t ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleApprove(selectedEvent.id, selectedEvent.event_level);
                  }}
                  disabled={actionLoading === selectedEvent.id}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={16} />
                  Approve Event
                </button>

                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    handleReject(selectedEvent.id);
                  }}
                  disabled={actionLoading === selectedEvent.id}
                  className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                    ${darkMode
                      ? 'bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/30'
                      : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'}
                  `}
                >
                  <X size={16} />
                  Reject Event
                </button>

                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedEvent(null);
                  }}
                  className={`
                    ml-auto px-5 py-2.5 rounded-lg font-medium transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                  `}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
