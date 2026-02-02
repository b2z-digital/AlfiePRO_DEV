import { useEffect } from 'react';
import { supabase } from '../../utils/supabase';
import type { Notification } from './types';
import { showDesktopNotification, requestNotificationPermission } from './utils';

interface UseRealtimeProps {
  userId: string;
  clubId: string;
  onNewNotification: (notification: Notification) => void;
  onNotificationUpdated: (notification: Notification) => void;
  onNotificationDeleted: (id: string) => void;
  desktopNotifications?: boolean;
  soundEnabled?: boolean;
}

export const useRealtime = ({
  userId,
  clubId,
  onNewNotification,
  onNotificationUpdated,
  onNotificationDeleted,
  desktopNotifications = false,
  soundEnabled = true,
}: UseRealtimeProps) => {
  useEffect(() => {
    // Request notification permission if needed
    if (desktopNotifications) {
      requestNotificationPermission();
    }

    // Subscribe to notifications for this user
    const channel = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const notification = payload.new as Notification;

          // Fetch full notification with sender details
          const { data } = await supabase
            .from('notifications')
            .select(`
              *,
              profiles:user_id (
                first_name,
                last_name,
                avatar_url
              )
            `)
            .eq('id', notification.id)
            .single();

          if (data) {
            const enrichedNotification = {
              ...data,
              sender_name: data.profiles
                ? `${data.profiles.first_name} ${data.profiles.last_name}`
                : 'Unknown',
              sender_avatar_url: data.profiles?.avatar_url,
            };

            onNewNotification(enrichedNotification);

            // Show desktop notification
            if (desktopNotifications && Notification.permission === 'granted') {
              showDesktopNotification(enrichedNotification.subject, {
                body: enrichedNotification.body.slice(0, 100),
                icon: enrichedNotification.sender_avatar_url || '/logo.png',
                tag: enrichedNotification.id,
              });
            }

            // Play sound
            if (soundEnabled) {
              try {
                const audio = new Audio('/notification-sound.mp3');
                audio.volume = 0.5;
                audio.play().catch(() => {
                  // Ignore errors if sound can't play
                });
              } catch (err) {
                // Ignore sound errors
              }
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNotificationUpdated(payload.new as Notification);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onNotificationDeleted((payload.old as any).id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, clubId, onNewNotification, onNotificationUpdated, onNotificationDeleted, desktopNotifications, soundEnabled]);
};
