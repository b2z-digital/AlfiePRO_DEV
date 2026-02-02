import React, { useState, useEffect } from 'react';
import { X, Trophy, Calendar, MapPin, Sailboat, FileText, CalendarRange, Upload, DollarSign, Globe, AlertTriangle } from 'lucide-react';
import { RaceType, BoatType } from '../types';
import { PublicEvent } from '../types/race';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { addPublicEvent, updatePublicEvent } from '../utils/publicEventStorage';
import { getStoredVenues } from '../utils/venueStorage';
import { Venue } from '../types/venue';
import { Club } from '../types/club';

interface SuperAdminEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  editingEvent?: PublicEvent | null;
  onSuccess?: () => void;
}

export const SuperAdminEventModal: React.FC<SuperAdminEventModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  editingEvent,
  onSuccess
}) => {
  const [formData, setFormData] = useState<{
    event_name: string;
    date: string;
    end_date: string;
    venue: string;
    race_class: string;
    race_format: string;
    is_multi_day: boolean;
    number_of_days: number;
    is_paid: boolean;
    entry_fee: string;
    notice_of_race_url: string;
    sailing_instructions_url: string;
    is_interclub: boolean;
    other_club_name: string;
    event_level: 'club' | 'state' | 'national';
  }>({
    event_name: '',
    date: '',
    end_date: '',
    venue: '',
    race_class: '',
    race_format: 'handicap',
    is_multi_day: false,
    number_of_days: 1,
    is_paid: false,
    entry_fee: '',
    notice_of_race_url: '',
    sailing_instructions_url: '',
    is_interclub: false,
    other_club_name: '',
    event_level: 'club'
  });

  const [venues, setVenues] = useState<Venue[]>([]);
  const [clubId, setClubId] = useState('');
  const [availableOrganizations, setAvailableOrganizations] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { isSuperAdmin, isNationalOrgAdmin, isStateOrgAdmin, userClubs } = useAuth();

  useEffect(() => {
    if (isOpen) {
      loadAvailableOrganizations();
      fetchVenues();
      
      if (editingEvent) {
        setFormData({
          event_name: editingEvent.event_name,
          date: editingEvent.date,
          end_date: editingEvent.end_date || '',
          venue: editingEvent.venue,
          race_class: editingEvent.race_class,
          race_format: editingEvent.race_format,
          is_multi_day: editingEvent.multi_day,
          number_of_days: editingEvent.number_of_days,
          is_paid: editingEvent.is_paid,
          entry_fee: editingEvent.entry_fee?.toString() || '',
          notice_of_race_url: editingEvent.notice_of_race_url || '',
          sailing_instructions_url: editingEvent.sailing_instructions_url || '',
          is_interclub: editingEvent.is_interclub,
          other_club_name: editingEvent.other_club_name || '',
          event_level: (editingEvent as any).event_level || 'club'
        });
        setClubId(editingEvent.club_id || '');
      } else {
        // Reset form for new event
        setFormData({
          event_name: '',
          date: '',
          end_date: '',
          venue: '',
          race_class: '',
          race_format: 'handicap',
          is_multi_day: false,
          number_of_days: 1,
          is_paid: false,
          entry_fee: '',
          notice_of_race_url: '',
          sailing_instructions_url: '',
          is_interclub: false,
          other_club_name: '',
          event_level: 'club'
        });
      }
    }
  }, [isOpen, editingEvent]);

  const loadAvailableOrganizations = async () => {
    try {
      if (isSuperAdmin) {
        // Super admins can see all organizations
        const { data, error } = await supabase
          .from('clubs')
          .select('*')
          .in('organization_type', ['state_association', 'national_association'])
          .order('name');
        
        if (error) throw error;
        setAvailableOrganizations(data || []);
      } else {
        // Organization admins can only see their own organizations
        const orgClubs = userClubs.filter(uc => 
          uc.club?.organization_type === 'state_association' || 
          uc.club?.organization_type === 'national_association'
        );
        
        setAvailableOrganizations(orgClubs.map(uc => uc.club!));
        
        // Auto-select if only one organization
        if (orgClubs.length === 1) {
          setClubId(orgClubs[0].clubId);
        }
      }
    } catch (err) {
      console.error('Error loading organizations:', err);
    }
  };

  const fetchVenues = async () => {
    try {
      const venueData = await getStoredVenues();
      setVenues(venueData);
    } catch (error) {
      console.error('Error fetching venues:', error);
      setError('Failed to load venues');
    }
  };

  // Calculate end date based on start date and number of days
  useEffect(() => {
    if (formData.is_multi_day && formData.date) {
      const endDate = calculateEndDate(formData.date, formData.number_of_days);
      setFormData(prev => ({ ...prev, end_date: endDate }));
    }
  }, [formData.date, formData.number_of_days, formData.is_multi_day]);

  // Calculate days between two dates
  const calculateDaysBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
  };

  // Calculate end date based on start date and number of days
  const calculateEndDate = (startDate: string, days: number): string => {
    if (!startDate) return '';
    const date = new Date(startDate);
    date.setDate(date.getDate() + days - 1); // -1 because we count the start date as day 1
    return date.toISOString().split('T')[0];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    // Validate club_id for non-super-admins
    if (!isSuperAdmin && !clubId) {
      setError('Please select an organization');
      return;
    }

    try {
      // Determine creator type based on who is creating the event
      const selectedOrg = availableOrganizations.find(org => org.id === clubId);
      const createdByType = selectedOrg?.organization_type === 'national_association' ? 'national'
        : selectedOrg?.organization_type === 'state_association' ? 'state'
        : 'club';

      // Determine approval status
      // If created by state and is state event, or national and is national event, auto-approve
      let approvalStatus = 'pending';
      if (createdByType === 'state' && formData.event_level === 'state') {
        approvalStatus = 'approved';
      } else if (createdByType === 'national' && formData.event_level === 'national') {
        approvalStatus = 'approved';
      } else if (formData.event_level === 'club') {
        approvalStatus = 'approved';
      }

      const eventData: any = {
        event_name: formData.event_name,
        date: formData.date,
        end_date: formData.is_multi_day ? formData.end_date : undefined,
        venue: formData.venue,
        race_class: formData.race_class,
        race_format: formData.race_format,
        multi_day: formData.is_multi_day,
        number_of_days: formData.is_multi_day ? formData.number_of_days : 1,
        is_paid: formData.is_paid,
        entry_fee: formData.is_paid ? parseFloat(formData.entry_fee) : undefined,
        notice_of_race_url: formData.notice_of_race_url || undefined,
        sailing_instructions_url: formData.sailing_instructions_url || undefined,
        is_interclub: formData.is_interclub,
        other_club_name: formData.is_interclub ? formData.other_club_name : undefined,
        club_id: clubId || null,
        media: [], // Initialize with empty media array
        event_level: formData.event_level,
        created_by_type: createdByType,
        created_by_id: clubId || null,
        approval_status: approvalStatus
      };

      // Set association IDs based on event level
      if (formData.event_level === 'national' || formData.event_level === 'state') {
        // For now, we'll need to determine the appropriate association
        // This should be enhanced to allow selecting specific associations
        if (createdByType === 'national') {
          eventData.national_association_id = clubId;
        } else if (createdByType === 'state') {
          eventData.state_association_id = clubId;
        }
      }

      if (editingEvent) {
        // Update existing event
        // If the event was rejected, reset to pending status when club edits it
        if (editingEvent.approval_status === 'rejected') {
          eventData.approval_status = 'pending';
          eventData.rejection_reason = null;
          eventData.rejected_at = null;
          eventData.rejected_by = null;
        }
        await updatePublicEvent(editingEvent.id, eventData);

        // Link any corresponding quick_race when converting to state/national level
        // This ensures the club's local copy is properly linked to avoid duplicates
        if (formData.event_level !== 'club') {
          try {
            // Find quick_race with matching event details (name, date, and club)
            const { data: matchingRaces } = await supabase
              .from('quick_races')
              .select('id')
              .eq('club_id', clubId)
              .eq('event_name', formData.event_name)
              .eq('race_date', formData.date)
              .is('public_event_id', null)
              .limit(1);

            if (matchingRaces && matchingRaces.length > 0) {
              console.log('Found matching quick_race, linking to public_event:', matchingRaces[0].id, '->', editingEvent.id);
              // Link the quick_race to this public_event to prevent duplicates
              await supabase
                .from('quick_races')
                .update({ public_event_id: editingEvent.id })
                .eq('id', matchingRaces[0].id);
            } else {
              console.log('No matching quick_race found for linking');
            }
          } catch (err) {
            console.error('Error linking quick_race to public_event:', err);
          }
        }
      } else {
        // Create new event
        await addPublicEvent(eventData);
      }

      setSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error saving public event:', error);
      setError('Failed to save event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Allow super admins, organization admins, and club admins editing their own events
  // Note: userClubs has clubId (camelCase), editingEvent has club_id (snake_case)
  const isEditingOwnEvent = editingEvent && userClubs.some(club => club.clubId === editingEvent.club_id);

  if (!isSuperAdmin && !isNationalOrgAdmin && !isStateOrgAdmin && !isEditingOwnEvent) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Trophy className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              {editingEvent ? 'Edit Public Event' : 'Create Public Event'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                <div>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-green-900/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-green-400 mt-0.5" size={18} />
                <div>
                  <p className="text-green-300 text-sm">Event saved successfully!</p>
                </div>
              </div>
            </div>
          )}

          {/* Organization Selection */}
          {availableOrganizations.length > 0 && (
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Organization *
              </label>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                required={!isSuperAdmin}
                className={`
                  w-full px-3 py-2 rounded-lg transition-colors
                  ${darkMode
                    ? 'bg-slate-700 text-white border border-slate-600'
                    : 'bg-white text-slate-800 border border-slate-200'}
                `}
              >
                <option value="">Select an organization</option>
                {availableOrganizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.organization_type?.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Event Level Selection */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Event Level *
            </label>
            <select
              value={formData.event_level}
              onChange={(e) => setFormData(prev => ({ ...prev, event_level: e.target.value as 'club' | 'state' | 'national' }))}
              required
              className={`
                w-full px-3 py-2 rounded-lg transition-colors
                ${darkMode
                  ? 'bg-slate-700 text-white border border-slate-600'
                  : 'bg-white text-slate-800 border border-slate-200'}
              `}
            >
              <option value="club">Club Event</option>
              <option value="state">State Event</option>
              <option value="national">National Event</option>
            </select>
            <p className={`mt-1 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {formData.event_level === 'club' && 'Club-level event (auto-approved)'}
              {formData.event_level === 'state' && 'State-level event (requires State association approval)'}
              {formData.event_level === 'national' && 'National-level event (requires National and State association approval)'}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Event Name *
              </label>
              <div className="relative">
                <FileText 
                  size={18} 
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                />
                <input
                  type="text"
                  required
                  value={formData.event_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, event_name: e.target.value }))}
                  className={`
                    w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-white text-slate-900 border border-slate-200'}
                  `}
                  placeholder="Enter event name"
                />
              </div>
            </div>

            {/* Event Type Options */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, is_interclub: !prev.is_interclub }))}
                className={`
                  relative p-4 rounded-lg border transition-all text-left
                  ${formData.is_interclub 
                    ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                    : darkMode 
                      ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'}
                `}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`
                    p-2 rounded-lg
                    ${formData.is_interclub 
                      ? 'bg-blue-600 text-white' 
                      : darkMode 
                        ? 'bg-slate-600 text-slate-300' 
                        : 'bg-slate-100 text-slate-700'}
                  `}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      Interclub Event
                    </h3>
                  </div>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Event between two or more clubs with members from both clubs participating
                </p>
                <div className="absolute top-3 right-3">
                  <div className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${formData.is_interclub 
                      ? 'border-blue-500 bg-blue-500' 
                      : 'border-slate-400'}
                  `}>
                    {formData.is_interclub && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormData(prev => ({ 
                  ...prev, 
                  is_multi_day: !prev.is_multi_day,
                  end_date: !prev.is_multi_day ? calculateEndDate(prev.date, prev.number_of_days) : prev.date
                }))}
                className={`
                  relative p-4 rounded-lg border transition-all text-left
                  ${formData.is_multi_day 
                    ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                    : darkMode 
                      ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'}
                `}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`
                    p-2 rounded-lg
                    ${formData.is_multi_day 
                      ? 'bg-blue-600 text-white' 
                      : darkMode 
                        ? 'bg-slate-600 text-slate-300' 
                        : 'bg-slate-100 text-slate-700'}
                  `}>
                    <CalendarRange size={20} />
                  </div>
                  <div>
                    <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      Multi-day Event
                    </h3>
                  </div>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Event spanning multiple days with combined scoring
                </p>
                <div className="absolute top-3 right-3">
                  <div className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${formData.is_multi_day 
                      ? 'border-blue-500 bg-blue-500' 
                      : 'border-slate-400'}
                  `}>
                    {formData.is_multi_day && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                </div>
              </button>
            </div>

            {formData.is_interclub && (
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Interclub Name *
                </label>
                <input
                  type="text"
                  required={formData.is_interclub}
                  value={formData.other_club_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, other_club_name: e.target.value }))}
                  className={`
                    w-full px-3 py-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-white text-slate-900 border border-slate-200'}
                  `}
                  placeholder="Enter interclub name (e.g., NSW vs QLD)"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Start Date *
                </label>
                <div className="relative">
                  <Calendar 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                  />
                </div>
              </div>

              {formData.is_multi_day && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Number of Days *
                  </label>
                  <div className="relative">
                    <CalendarRange 
                      size={18} 
                      className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                    />
                    <select
                      required
                      value={formData.number_of_days}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        number_of_days: parseInt(e.target.value),
                        end_date: calculateEndDate(prev.date, parseInt(e.target.value))
                      }))}
                      className={`
                        w-full pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map(days => (
                        <option key={days} value={days}>{days} day{days > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {formData.is_multi_day && (
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    End Date
                  </label>
                  <div className="relative">
                    <Calendar 
                      size={18} 
                      className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                    />
                    <input
                      type="date"
                      disabled
                      value={formData.end_date}
                      className={`
                        w-full pl-10 pr-4 py-2 rounded-lg transition-colors cursor-not-allowed
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-400' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'}
                      `}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    End date is calculated automatically
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Venue *
              </label>
              <select
                required
                value={formData.venue}
                onChange={(e) => setFormData(prev => ({ ...prev, venue: e.target.value }))}
                className={`
                  w-full px-4 py-2 rounded-lg transition-colors appearance-none
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
              >
                <option value="">Select venue</option>
                {venues.map(venue => (
                  <option key={venue.id} value={venue.name}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Race Class *
              </label>
              <div className="relative">
                <Sailboat 
                  size={18} 
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                />
                <select
                  required
                  value={formData.race_class}
                  onChange={(e) => setFormData(prev => ({ ...prev, race_class: e.target.value }))}
                  className={`
                    w-full pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-white text-slate-900 border border-slate-200'}
                  `}
                >
                  <option value="">Select race class</option>
                  <option value="DF65">Dragon Force 65</option>
                  <option value="DF95">Dragon Force 95</option>
                  <option value="10R">10 Rater</option>
                  <option value="IOM">IOM</option>
                  <option value="Marblehead">Marblehead</option>
                  <option value="A Class">A Class</option>
                  <option value="RC Laser">RC Laser</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Race Format *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, race_format: 'handicap' }))}
                  className={`
                    p-3 rounded-lg text-sm font-medium transition-colors
                    ${formData.race_format === 'handicap'
                      ? 'bg-blue-600 text-white'
                      : darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }
                  `}
                >
                  Handicap Racing
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, race_format: 'scratch' }))}
                  className={`
                    p-3 rounded-lg text-sm font-medium transition-colors
                    ${formData.race_format === 'scratch'
                      ? 'bg-blue-600 text-white'
                      : darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }
                  `}
                >
                  Scratch Racing
                </button>
              </div>
            </div>

            {/* Document URLs */}
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Notice of Race URL
              </label>
              <input
                type="url"
                value={formData.notice_of_race_url}
                onChange={(e) => setFormData(prev => ({ ...prev, notice_of_race_url: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg transition-colors
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
                placeholder="Enter URL to Notice of Race document"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Sailing Instructions URL
              </label>
              <input
                type="url"
                value={formData.sailing_instructions_url}
                onChange={(e) => setFormData(prev => ({ ...prev, sailing_instructions_url: e.target.value }))}
                className={`
                  w-full px-3 py-2 rounded-lg transition-colors
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
                placeholder="Enter URL to Sailing Instructions document"
              />
            </div>

            {/* Payment Options */}
            <div className="pt-2 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, is_paid: !prev.is_paid }))}
                className={`
                  relative p-4 rounded-lg border transition-all text-left w-full
                  ${formData.is_paid 
                    ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                    : darkMode 
                      ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'}
                `}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`
                    p-2 rounded-lg
                    ${formData.is_paid 
                      ? 'bg-blue-600 text-white' 
                      : darkMode 
                        ? 'bg-slate-600 text-slate-300' 
                        : 'bg-slate-100 text-slate-700'}
                  `}>
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      Paid Event
                    </h3>
                  </div>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Collect entry fees for this event
                </p>
                <div className="absolute top-3 right-3">
                  <div className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${formData.is_paid 
                      ? 'border-blue-500 bg-blue-500' 
                      : 'border-slate-400'}
                  `}>
                    {formData.is_paid && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </div>
                </div>
              </button>

              {formData.is_paid && (
                <div className="mt-3">
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Entry Fee *
                  </label>
                  <div className="relative">
                    <DollarSign 
                      size={18} 
                      className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                    />
                    <input
                      type="number"
                      required={formData.is_paid}
                      value={formData.entry_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, entry_fee: e.target.value }))}
                      min="0"
                      step="0.01"
                      className={`
                        w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                      placeholder="0.00"
                    />
                  </div>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Payment will be collected on race day
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`
                px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                ${loading ? 'opacity-70 cursor-not-allowed' : ''}
              `}
            >
              {loading ? 'Saving...' : (editingEvent ? 'Update Event' : 'Create Event')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};