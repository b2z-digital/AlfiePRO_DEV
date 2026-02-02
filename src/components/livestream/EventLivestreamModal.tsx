import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { LivestreamSession } from '../../types/livestream';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { LivestreamSetupWizard } from './LivestreamSetupWizard';
import { LivestreamControlPanel } from './LivestreamControlPanel';
import { livestreamStorage } from '../../utils/livestreamStorage';

interface EventLivestreamModalProps {
  eventId: string;
  eventName: string;
  eventDate?: string;
  clubId: string;
  onClose: () => void;
}

export function EventLivestreamModal({
  eventId,
  eventName,
  eventDate,
  clubId,
  onClose
}: EventLivestreamModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<LivestreamSession | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showControlPanel, setShowControlPanel] = useState(false);

  useEffect(() => {
    loadSession();
  }, [eventId]);

  const loadSession = async () => {
    try {
      setLoading(true);
      console.log('🎬 [EventLivestreamModal] Loading session for event:', {
        eventId,
        eventIdLength: eventId.length,
        eventIdParts: eventId.split('-'),
        eventName,
        eventDate,
        clubId
      });

      // Check if there's already a livestream session for this event
      const { data, error } = await livestreamStorage.getSessionByEventId(eventId);

      console.log('🎬 [EventLivestreamModal] Session query result:', {
        data,
        dataEventId: data?.event_id,
        error,
        hasSession: !!data
      });

      if (error) {
        console.error('🎬 [EventLivestreamModal] Error from query:', error);
        throw error;
      }

      if (data) {
        // Session exists - open control panel directly
        console.log('🎬 [EventLivestreamModal] Session found, opening control panel');
        setSession(data);
        setShowControlPanel(true);
      } else {
        // No session exists - open wizard to create one
        console.log('🎬 [EventLivestreamModal] No session found, opening wizard');
        setShowWizard(true);
      }
    } catch (error) {
      console.error('🎬 [EventLivestreamModal] Error loading livestream session:', error);
      // Show wizard even if there's an error
      setShowWizard(true);
    } finally {
      setLoading(false);
      console.log('🎬 [EventLivestreamModal] Loading complete, states:', {
        loading: false,
        showWizard,
        showControlPanel,
        hasSession: !!session
      });
    }
  };

  const handleWizardComplete = (newSession: LivestreamSession) => {
    setSession(newSession);
    setShowWizard(false);
    setShowControlPanel(true);

    // Show success notification
    addNotification(
      'Live stream successfully configured! You can now manage your stream from the control panel.',
      'success'
    );
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    onClose();
  };

  const handleControlPanelClose = () => {
    setShowControlPanel(false);
    onClose();
  };

  console.log('🎬 [EventLivestreamModal] Render state:', {
    loading,
    showWizard,
    showControlPanel,
    hasSession: !!session
  });

  if (loading) {
    console.log('🎬 [EventLivestreamModal] Rendering: Loading state (null)');
    return null;
  }

  if (showWizard) {
    console.log('🎬 [EventLivestreamModal] Rendering: LivestreamSetupWizard');
    return (
      <LivestreamSetupWizard
        clubId={clubId}
        preSelectedEventId={eventId}
        preSelectedEventName={eventName}
        preSelectedEventDate={eventDate}
        onComplete={handleWizardComplete}
        onClose={handleWizardClose}
      />
    );
  }

  if (showControlPanel && session) {
    console.log('🎬 [EventLivestreamModal] Rendering: LivestreamControlPanel with clubId:', clubId, 'sessionId:', session.id);
    return (
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Livestream Control Panel
            </h2>
            <button
              onClick={handleControlPanelClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
            <LivestreamControlPanel
              clubId={clubId}
              sessionId={session.id}
            />
          </div>
        </div>
      </div>
    );
  }

  console.log('🎬 [EventLivestreamModal] Rendering: null (no conditions met)');
  return null;
}
