import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { livestreamStorage } from '../../utils/livestreamStorage';
import { supabase } from '../../utils/supabase';
import type { LivestreamSession } from '../../types/livestream';

interface ScheduleStreamModalProps {
  sessionId: string;
  currentScheduledTime?: string;
  onClose: () => void;
  onSchedule: (scheduledTime: string) => void;
}

export function ScheduleStreamModal({
  sessionId,
  currentScheduledTime,
  onClose,
  onSchedule
}: ScheduleStreamModalProps) {
  const { addNotification } = useNotifications();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<LivestreamSession | null>(null);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const data = await livestreamStorage.getSession(sessionId);
      setSession(data);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  useEffect(() => {
    // Initialize with current scheduled time or default to now + 1 hour
    if (currentScheduledTime) {
      const schedDate = new Date(currentScheduledTime);
      setDate(schedDate.toISOString().split('T')[0]);
      setTime(schedDate.toTimeString().slice(0, 5));
    } else {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      setDate(now.toISOString().split('T')[0]);
      setTime(now.toTimeString().slice(0, 5));
    }
  }, [currentScheduledTime]);

  const handleSave = async () => {
    if (!date || !time) {
      addNotification('Please select both date and time', 'warning');
      return;
    }

    try {
      setSaving(true);
      const scheduledDateTime = new Date(`${date}T${time}`);

      // Check if date is in the future
      if (scheduledDateTime <= new Date()) {
        addNotification('Scheduled time must be in the future', 'warning');
        setSaving(false);
        return;
      }

      // Get user session for YouTube API
      const { data: { session: userSession } } = await supabase.auth.getSession();
      if (!userSession || !session) {
        throw new Error('No active session found');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-youtube-livestream`;
      const headers = {
        'Authorization': `Bearer ${userSession.access_token}`,
        'Content-Type': 'application/json',
      };

      // If there's an existing YouTube broadcast, update it instead of creating new one
      if (session.youtube_broadcast_id) {
        try {
          // Update existing broadcast schedule
          await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'updateBroadcast',
              clubId: session.club_id,
              broadcastId: session.youtube_broadcast_id,
              sessionData: {
                scheduledStartTime: scheduledDateTime.toISOString()
              }
            })
          });
        } catch (youtubeError) {
          console.error('Error updating YouTube broadcast:', youtubeError);
          // Continue anyway - we'll still update the local session
        }
      } else {
        // Create new YouTube broadcast for this scheduled stream
        try {
          const broadcastResponse = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'createBroadcast',
              clubId: session.club_id,
              sessionData: {
                title: session.title,
                description: session.description,
                scheduledStartTime: scheduledDateTime.toISOString(),
                privacyStatus: session.is_public ? 'public' : 'unlisted'
              }
            })
          });

          if (broadcastResponse.ok) {
            const { broadcast } = await broadcastResponse.json();

            // Create stream and bind it
            const streamResponse = await fetch(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'createStream',
                clubId: session.club_id,
                sessionData: {
                  title: session.title,
                  description: session.description
                }
              })
            });

            if (streamResponse.ok) {
              const { stream } = await streamResponse.json();

              await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  action: 'bindBroadcastToStream',
                  clubId: session.club_id,
                  sessionData: {
                    broadcastId: broadcast.id,
                    streamId: stream.id
                  }
                })
              });

              // Update session with YouTube broadcast details
              await livestreamStorage.updateSession(sessionId, {
                youtube_broadcast_id: broadcast.id,
                youtube_stream_key: stream.cdn.ingestionInfo.streamName,
                youtube_rtmp_url: stream.cdn.ingestionInfo.ingestionAddress
              });
            }
          }
        } catch (youtubeError) {
          console.error('Error creating YouTube broadcast:', youtubeError);
          addNotification('Stream scheduled locally, but YouTube broadcast creation failed', 'warning');
        }
      }

      const updates: Partial<LivestreamSession> = {
        scheduled_start_time: scheduledDateTime.toISOString(),
        status: 'scheduled'
      };

      await livestreamStorage.updateSession(sessionId, updates);
      addNotification('Stream scheduled successfully!', 'success');
      onSchedule(scheduledDateTime.toISOString());
      onClose();
    } catch (error) {
      console.error('Error scheduling stream:', error);
      addNotification('Failed to schedule stream', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClearSchedule = async () => {
    try {
      setSaving(true);
      const updates: Partial<LivestreamSession> = {
        scheduled_start_time: undefined,
        status: 'draft'
      };

      await livestreamStorage.updateSession(sessionId, updates);
      addNotification('Schedule cleared successfully', 'success');
      onSchedule('');
      onClose();
    } catch (error) {
      console.error('Error clearing schedule:', error);
      addNotification('Failed to clear schedule', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getScheduledDateTime = () => {
    if (!date || !time) return null;
    return new Date(`${date}T${time}`);
  };

  const scheduledDateTime = getScheduledDateTime();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Schedule Stream</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-200/80">
              Schedule when your livestream should start. The stream will be ready to go live at the scheduled time.
            </p>
          </div>

          {/* Date Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Time Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              <Clock className="w-4 h-4 inline mr-2" />
              Time
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Preview */}
          {scheduledDateTime && (
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg p-4">
              <p className="text-sm text-gray-400 mb-1">Scheduled for</p>
              <p className="text-lg font-semibold text-white">
                {scheduledDateTime.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <p className="text-white mt-1">
                {scheduledDateTime.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-700">
          {currentScheduledTime && (
            <button
              onClick={handleClearSchedule}
              disabled={saving}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Clear Schedule
            </button>
          )}
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!date || !time || saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
