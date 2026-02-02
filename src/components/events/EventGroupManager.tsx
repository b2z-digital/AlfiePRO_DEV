import React, { useState, useEffect } from 'react';
import { Plus, LogOut, GripVertical, Star, AlertCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface GroupedEvent {
  id: string;
  event_name: string;
  is_primary: boolean;
  display_order: number;
  date?: string;
  race_class?: string;
}

interface EventGroupManagerProps {
  eventWebsiteId: string;
  onEventsChanged?: () => void;
}

export const EventGroupManager: React.FC<EventGroupManagerProps> = ({
  eventWebsiteId,
  onEventsChanged
}) => {
  const [groupedEvents, setGroupedEvents] = useState<GroupedEvent[]>([]);
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  useEffect(() => {
    loadGroupedEvents();
    loadAvailableEvents();
  }, [eventWebsiteId]);

  const loadGroupedEvents = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('event_website_all_events')
        .select('*')
        .eq('event_website_id', eventWebsiteId)
        .maybeSingle();

      if (error) {
        console.error('Error loading grouped events:', error);
        setGroupedEvents([]);
        return;
      }

      if (data?.all_events) {
        setGroupedEvents(data.all_events.sort((a: GroupedEvent, b: GroupedEvent) =>
          a.display_order - b.display_order
        ));
      } else {
        setGroupedEvents([]);
      }
    } catch (error) {
      console.error('Error loading grouped events:', error);
      setGroupedEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userClubs } = await supabase
        .from('user_clubs')
        .select('club_id')
        .eq('user_id', user.id);

      if (!userClubs || userClubs.length === 0) return;

      const clubIds = userClubs.map(uc => uc.club_id);

      const { data, error } = await supabase
        .from('public_events')
        .select('id, event_name, date, race_class')
        .in('club_id', clubIds)
        .order('date', { ascending: false });

      if (error) throw error;

      setAvailableEvents(data || []);
    } catch (error) {
      console.error('Error loading available events:', error);
    }
  };

  const handleAddEvent = async () => {
    if (!selectedEventId) return;

    try {
      setSaving(true);

      const selectedEvent = availableEvents.find(e => e.id === selectedEventId);
      if (!selectedEvent) return;

      const maxOrder = Math.max(...groupedEvents.map(e => e.display_order), -1);

      const { error } = await supabase
        .from('event_website_events')
        .insert({
          event_website_id: eventWebsiteId,
          event_id: selectedEventId,
          is_primary: groupedEvents.length === 0,
          display_order: maxOrder + 1
        });

      if (error) throw error;

      await loadGroupedEvents();
      setShowAddModal(false);
      setSelectedEventId('');
      onEventsChanged?.();
    } catch (error) {
      console.error('Error adding event:', error);
      alert('Failed to add event to group');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    if (groupedEvents.length === 1) {
      alert('Cannot remove the last event from the group. At least one event is required.');
      return;
    }

    const eventToRemove = groupedEvents.find(e => e.id === eventId);
    if (eventToRemove?.is_primary && groupedEvents.length > 1) {
      alert('Cannot remove the primary event. Please set another event as primary first.');
      return;
    }

    if (!confirm('Are you sure you want to remove this event from the group?')) {
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('event_website_events')
        .delete()
        .eq('event_website_id', eventWebsiteId)
        .eq('event_id', eventId);

      if (error) throw error;

      await loadGroupedEvents();
      onEventsChanged?.();
    } catch (error) {
      console.error('Error removing event:', error);
      alert('Failed to remove event from group');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (eventId: string) => {
    try {
      setSaving(true);

      // First, set all events to non-primary
      await supabase
        .from('event_website_events')
        .update({ is_primary: false })
        .eq('event_website_id', eventWebsiteId);

      // Then set the selected event as primary
      const { error } = await supabase
        .from('event_website_events')
        .update({ is_primary: true })
        .eq('event_website_id', eventWebsiteId)
        .eq('event_id', eventId);

      if (error) throw error;

      // Also update the main event_websites record
      await supabase
        .from('event_websites')
        .update({ event_id: eventId })
        .eq('id', eventWebsiteId);

      await loadGroupedEvents();
      onEventsChanged?.();
    } catch (error) {
      console.error('Error setting primary event:', error);
      alert('Failed to set primary event');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (eventId: string, direction: 'up' | 'down') => {
    const currentIndex = groupedEvents.findIndex(e => e.id === eventId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= groupedEvents.length) return;

    try {
      setSaving(true);

      const newOrder = [...groupedEvents];
      [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

      // Update display orders
      const updates = newOrder.map((event, index) =>
        supabase
          .from('event_website_events')
          .update({ display_order: index })
          .eq('event_website_id', eventWebsiteId)
          .eq('event_id', event.id)
      );

      await Promise.all(updates);
      await loadGroupedEvents();
      onEventsChanged?.();
    } catch (error) {
      console.error('Error reordering events:', error);
      alert('Failed to reorder events');
    } finally {
      setSaving(false);
    }
  };

  const getUnaddedEvents = () => {
    const groupedEventIds = groupedEvents.map(e => e.id);
    return availableEvents.filter(e => !groupedEventIds.includes(e.id));
  };

  if (loading) {
    return <div className="text-slate-400 text-center py-8">Loading event group...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Event Group Management</h3>
          <p className="text-sm text-slate-400 mt-1">
            Configure multiple events for this website. Buttons and registration options will be created for each event.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          disabled={saving}
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {groupedEvents.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <p className="font-medium">No events in group</p>
            <p className="text-amber-300/80 mt-1">Add at least one event to enable multi-event features like grouped registration buttons.</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {groupedEvents.map((event, index) => (
          <div
            key={event.id}
            className="bg-slate-700 border border-slate-600 rounded-lg p-4 flex items-center gap-4"
          >
            <div className="flex flex-col gap-1">
              <button
                onClick={() => handleReorder(event.id, 'up')}
                disabled={index === 0 || saving}
                className="text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleReorder(event.id, 'down')}
                disabled={index === groupedEvents.length - 1 || saving}
                className="text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <GripVertical className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-white">{event.event_name}</h4>
                {event.is_primary && (
                  <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Primary Event
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Display Order: {event.display_order + 1}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!event.is_primary && (
                <button
                  onClick={() => handleSetPrimary(event.id)}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors disabled:opacity-50"
                >
                  Set as Primary
                </button>
              )}
              <button
                onClick={() => handleRemoveEvent(event.id)}
                disabled={saving || groupedEvents.length === 1}
                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={groupedEvents.length === 1 ? "Cannot remove the last event" : "Remove event"}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {groupedEvents.length > 1 && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
          <p className="text-sm text-cyan-200">
            <strong>Multi-Event Mode Active:</strong> Your slider and page widgets will automatically display separate registration buttons for each event in this group.
          </p>
        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Add Event to Group</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedEventId('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <LogOut className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Event
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Select an event --</option>
                  {getUnaddedEvents().map(event => (
                    <option key={event.id} value={event.id}>
                      {event.event_name} {event.date ? `(${event.date})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {getUnaddedEvents().length === 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                  <p className="text-sm text-amber-200">
                    No more events available to add. All your events are already in this group.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedEventId('');
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEvent}
                  disabled={!selectedEventId || saving}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Adding...' : 'Add Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
