import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

interface YachtClass {
  id: string;
  class_name: string;
  event_id: string;
  event_name: string;
  event_date?: string;
}

export const useEventClassSelector = (eventWebsiteId: string | undefined) => {
  const [classes, setClasses] = useState<YachtClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'nor' | 'register'>('register');
  const [modalCallback, setModalCallback] = useState<((yachtClass: YachtClass) => void) | null>(null);

  useEffect(() => {
    if (eventWebsiteId) {
      loadClasses();
    }
  }, [eventWebsiteId]);

  const loadClasses = async () => {
    try {
      setLoading(true);

      if (!eventWebsiteId) {
        setClasses([]);
        return;
      }

      // Get all events associated with this event website
      const { data: websiteEvents, error: eventsError } = await supabase
        .from('event_website_all_events')
        .select('all_events')
        .eq('event_website_id', eventWebsiteId)
        .single();

      if (eventsError) throw eventsError;

      if (!websiteEvents?.all_events || websiteEvents.all_events.length === 0) {
        setClasses([]);
        return;
      }

      const eventIds = websiteEvents.all_events.map((e: any) => e.id);

      // Get race classes for each event from public_events table
      const { data: eventsData, error: classesError } = await supabase
        .from('public_events')
        .select('id, event_name, race_class, date')
        .in('id', eventIds)
        .order('date', { ascending: true });

      if (classesError) throw classesError;

      // Extract unique classes with their associated events
      const classesMap = new Map<string, YachtClass>();
      eventsData?.forEach((event) => {
        if (event.race_class) {
          const key = `${event.race_class}-${event.id}`;
          classesMap.set(key, {
            id: event.id,
            class_name: event.race_class,
            event_id: event.id,
            event_name: event.event_name,
            event_date: event.date
          });
        }
      });

      // Convert to array and sort by event date
      const classesArray = Array.from(classesMap.values());
      classesArray.sort((a, b) => {
        if (!a.event_date || !b.event_date) return 0;
        return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
      });

      setClasses(classesArray);
    } catch (error) {
      console.error('Error loading classes:', error);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (
    action: 'nor' | 'register',
    callback: (yachtClass: YachtClass) => void
  ) => {
    if (classes.length === 0) {
      console.warn('No classes available');
      return;
    }

    if (classes.length === 1) {
      // If only one class, execute directly
      callback(classes[0]);
    } else {
      // Show modal to select class
      setModalType(action);
      setModalCallback(() => callback);
      setShowModal(true);
    }
  };

  const handleClassSelect = (yachtClass: YachtClass) => {
    if (modalCallback) {
      modalCallback(yachtClass);
    }
    setShowModal(false);
    setModalCallback(null);
  };

  return {
    classes,
    loading,
    showModal,
    setShowModal,
    modalType,
    handleAction,
    handleClassSelect
  };
};
