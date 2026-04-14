import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LivestreamSession } from '../../types/livestream';
import { useNotifications } from '../../contexts/NotificationContext';
import { LivestreamSetupWizard } from './LivestreamSetupWizard';
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
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadSession();
  }, [eventId]);

  const loadSession = async () => {
    try {
      setLoading(true);
      const { data, error } = await livestreamStorage.getSessionByEventId(eventId);

      if (error) throw error;

      if (data) {
        onClose();
        navigate(`/livestream?sessionId=${data.id}`);
      } else {
        setShowWizard(true);
      }
    } catch (error) {
      console.error('Error loading livestream session:', error);
      setShowWizard(true);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardComplete = (newSession: LivestreamSession) => {
    addNotification(
      'Live stream configured! Opening the Broadcast Studio.',
      'success'
    );
    onClose();
    navigate(`/livestream?sessionId=${newSession.id}`);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    onClose();
  };

  if (loading) return null;

  if (showWizard) {
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

  return null;
}
