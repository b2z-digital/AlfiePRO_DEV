import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, MapPin, Clock, Video, FileText, User, Plus, Trash2, ArrowLeft, Save, AlertTriangle, Users, Shield, Repeat, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Meeting, MeetingFormData, MeetingCategory, RecurrenceType } from '../../types/meeting';
import { createMeeting, updateMeeting } from '../../utils/meetingStorage';
import { supabase } from '../../utils/supabase';
import { Member } from '../../types/member';
import { MemberSelect } from '../ui/MemberSelect';

interface MeetingFormProps {
  clubId?: string;
  associationId?: string;
  associationType?: 'state' | 'national';
  meeting?: Meeting | null;
  darkMode: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const MeetingForm: React.FC<MeetingFormProps> = ({
  clubId,
  associationId,
  associationType,
  meeting,
  darkMode,
  onSuccess,
  onCancel
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [creatingMeet, setCreatingMeet] = useState(false);
  const [hasGoogleIntegration, setHasGoogleIntegration] = useState(false);
  const [agendaItems, setAgendaItems] = useState<{
    item_number: number;
    item_name: string;
    owner_id?: string;
    type: 'for_noting' | 'for_action' | 'for_discussion';
    duration?: number;
  }[]>([
    { item_number: 1, item_name: 'Minutes', owner_id: undefined, type: 'for_noting' },
    { item_number: 2, item_name: '', owner_id: undefined, type: 'for_discussion' }
  ]);
  
  const [formData, setFormData] = useState<{
    name: string;
    location: string;
    date: string;
    start_time: string;
    end_time: string;
    conferencing_url: string;
    description: string;
    chairperson_id: string;
    minute_taker_id: string;
    meeting_type: 'in_person' | 'online' | 'hybrid';
    meeting_category: MeetingCategory;
    recurrence_type: RecurrenceType;
    recurrence_end_date: string;
  }>({
    name: '',
    location: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    conferencing_url: '',
    description: '',
    chairperson_id: '',
    minute_taker_id: '',
    meeting_type: 'in_person',
    meeting_category: 'general',
    recurrence_type: 'none',
    recurrence_end_date: ''
  });

  useEffect(() => {
    fetchMembers();
    checkGoogleIntegration();

    if (meeting) {
      setFormData({
        name: meeting.name,
        location: meeting.location || '',
        date: meeting.date,
        start_time: meeting.start_time?.substring(0, 5) || '09:00',
        end_time: meeting.end_time?.substring(0, 5) || '10:00',
        conferencing_url: meeting.conferencing_url || '',
        description: meeting.description || '',
        chairperson_id: meeting.chairperson_id || '',
        minute_taker_id: meeting.minute_taker_id || '',
        meeting_type: meeting.meeting_type || 'in_person',
        meeting_category: meeting.meeting_category || 'general',
        recurrence_type: meeting.recurrence_type || 'none',
        recurrence_end_date: meeting.recurrence_end_date || ''
      });

      // Fetch agenda items
      fetchAgendaItems();
    }
  }, [meeting, clubId, associationId, associationType]);

  const checkGoogleIntegration = async () => {
    try {
      if (clubId) {
        const { data, error } = await supabase
          .from('club_integrations')
          .select('is_enabled')
          .eq('club_id', clubId)
          .eq('provider', 'google')
          .eq('is_enabled', true)
          .maybeSingle();

        if (!error && data) {
          setHasGoogleIntegration(true);
        }
      } else if (associationId && associationType) {
        const tableName = associationType === 'state'
          ? 'state_association_integrations'
          : 'national_association_integrations';
        const idColumn = associationType === 'state'
          ? 'state_association_id'
          : 'national_association_id';

        const { data, error } = await supabase
          .from(tableName)
          .select('is_enabled')
          .eq(idColumn, associationId)
          .eq('provider', 'google')
          .eq('is_enabled', true)
          .maybeSingle();

        if (!error && data) {
          setHasGoogleIntegration(true);
        }
      }
    } catch (err) {
      console.error('Error checking Google integration:', err);
    }
  };

  const createGoogleMeet = async () => {
    if ((!clubId && !associationId) || !formData.name || !formData.date) {
      setError('Please fill in meeting name and date first');
      return;
    }

    setCreatingMeet(true);
    setError(null);

    try {
      // Combine date and time into ISO format
      const startDateTime = new Date(`${formData.date}T${formData.start_time}`).toISOString();
      const endDateTime = new Date(`${formData.date}T${formData.end_time}`).toISOString();

      // Get attendee emails
      const attendeeEmails = members
        .filter(m => m.email)
        .map(m => m.email)
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke('create-google-meet', {
        body: {
          clubId,
          associationId,
          associationType,
          meetingName: formData.name,
          meetingDescription: formData.description,
          startDateTime,
          endDateTime,
          attendeeEmails
        }
      });

      if (error) throw error;

      if (data.meetingUrl) {
        setFormData(prev => ({
          ...prev,
          conferencing_url: data.meetingUrl
        }));

        // If meeting type was in-person, switch to hybrid
        if (formData.meeting_type === 'in_person') {
          setFormData(prev => ({
            ...prev,
            meeting_type: 'hybrid'
          }));
        }
      }
    } catch (err) {
      console.error('Error creating Google Meet:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Google Meet');
    } finally {
      setCreatingMeet(false);
    }
  };

  const fetchCommitteeMembers = async (): Promise<Member[]> => {
    const memberFields = 'id, first_name, last_name, email, phone, club, street, city, state, postcode, date_joined, membership_level, membership_level_custom, is_financial, amount_paid, created_at, updated_at, avatar_url';

    if (clubId) {
      const { data: positions, error: posError } = await supabase
        .from('committee_positions')
        .select('member_id')
        .eq('club_id', clubId);

      if (posError) throw posError;

      const memberIds = (positions || []).map(p => p.member_id).filter(Boolean);
      if (memberIds.length === 0) return [];

      const { data, error } = await supabase
        .from('members')
        .select(memberFields)
        .eq('club_id', clubId)
        .in('id', memberIds)
        .order('first_name', { ascending: true });

      if (error) throw error;
      return (data as Member[]) || [];
    } else if (associationId && associationType) {
      const assocColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
      const { data: positions } = await supabase
        .from('committee_positions')
        .select('member_id')
        .eq(assocColumn, associationId);
      const committeeMemberIds = (positions || []).map(p => p.member_id).filter(Boolean);

      if (committeeMemberIds.length > 0) {
        const { data, error } = await supabase
          .from('members')
          .select(memberFields)
          .in('id', committeeMemberIds)
          .order('first_name', { ascending: true });
        if (error) throw error;
        return (data as Member[]) || [];
      }

      const tableName = associationType === 'state' ? 'user_state_associations' : 'user_national_associations';
      const idColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';

      const { data: userAssociations, error: assocError } = await supabase
        .from(tableName)
        .select('user_id')
        .eq(idColumn, associationId);

      if (assocError) throw assocError;
      if (!userAssociations || userAssociations.length === 0) return [];

      const userIds = userAssociations.map(ua => ua.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds)
        .order('first_name', { ascending: true });

      if (profilesError) throw profilesError;

      return (profiles || []).map((profile: any) => ({
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        club_id: '',
        phone: '',
        club: '',
        street: '',
        city: '',
        state: '',
        postcode: '',
        date_joined: '',
        membership_level: 'Full',
        is_financial: true,
        amount_paid: 0,
        created_at: '',
        updated_at: ''
      })) as Member[];
    }

    return [];
  };

  const fetchMembers = async (_category?: MeetingCategory) => {
    try {
      const committeeMembers = await fetchCommitteeMembers();
      setMembers(committeeMembers);
    } catch (err) {
      console.error('Error fetching members:', err);
      setError('Failed to load members');
    }
  };

  const fetchAgendaItems = async () => {
    if (!meeting) return;
    
    try {
      const { data, error } = await supabase
        .from('meeting_agendas')
        .select('*')
        .eq('meeting_id', meeting.id)
        .order('item_number', { ascending: true });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setAgendaItems(data.map(item => ({
          item_number: item.item_number,
          item_name: item.item_name,
          owner_id: item.owner_id || undefined,
          type: item.type as 'for_noting' | 'for_action' | 'for_discussion',
          duration: item.duration || undefined
        })));
      }
    } catch (err) {
      console.error('Error fetching agenda items:', err);
      setError('Failed to load agenda items');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddAgendaItem = () => {
    setAgendaItems(prev => [
      ...prev,
      {
        item_number: prev.length + 1,
        item_name: '',
        type: 'for_discussion'
      }
    ]);
  };

  const handleRemoveAgendaItem = (index: number) => {
    if (agendaItems.length <= 1) return;
    
    const newItems = agendaItems.filter((_, i) => i !== index);
    // Renumber items
    const renumberedItems = newItems.map((item, i) => ({
      ...item,
      item_number: i + 1
    }));
    
    setAgendaItems(renumberedItems);
  };

  const handleAgendaItemChange = (index: number, field: string, value: string | number) => {
    setAgendaItems(prev => {
      const newItems = [...prev];
      newItems[index] = {
        ...newItems[index],
        [field]: value
      };
      return newItems;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // Validate form
      if (!formData.name) {
        throw new Error('Meeting name is required');
      }
      
      if (!formData.date) {
        throw new Error('Meeting date is required');
      }

      if (formData.recurrence_type !== 'none' && !formData.recurrence_end_date) {
        throw new Error('Please select an end date for the recurring series');
      }
      
      const meetingData: any = {
        name: formData.name,
        location: formData.location,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        conferencing_url: formData.conferencing_url,
        description: formData.description,
        chairperson_id: formData.chairperson_id || undefined,
        minute_taker_id: formData.minute_taker_id || undefined,
        meeting_type: formData.meeting_type,
        meeting_category: formData.meeting_category,
        recurrence_type: formData.recurrence_type,
        recurrence_end_date: formData.recurrence_type !== 'none' ? formData.recurrence_end_date : undefined,
        agenda_items: agendaItems
      };
      
      if (meeting) {
        // Update existing meeting
        await updateMeeting(meeting.id, meetingData);
      } else {
        // Create new meeting
        await createMeeting(clubId, meetingData, associationId, associationType);
      }
      
      onSuccess();
    } catch (err: any) {
      console.error('Error saving meeting:', err);
      const msg = err?.message || err?.details || err?.hint || 'Failed to save meeting';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (category: MeetingCategory) => {
    setFormData(prev => ({ ...prev, meeting_category: category }));
    fetchMembers(category);
  };

  const recurrencePreviewDates = useMemo(() => {
    if (formData.recurrence_type === 'none' || !formData.date || !formData.recurrence_end_date) return [];
    const dates: string[] = [];
    const start = new Date(formData.date);
    const end = new Date(formData.recurrence_end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return [];

    let current = new Date(start);
    const advance = () => {
      switch (formData.recurrence_type) {
        case 'weekly': current.setDate(current.getDate() + 7); break;
        case 'fortnightly': current.setDate(current.getDate() + 14); break;
        case 'monthly': current.setMonth(current.getMonth() + 1); break;
        case 'quarterly': current.setMonth(current.getMonth() + 3); break;
        case 'yearly': current.setFullYear(current.getFullYear() + 1); break;
      }
    };

    advance();
    while (current <= end && dates.length < 52) {
      dates.push(current.toISOString().split('T')[0]);
      advance();
    }
    return dates;
  }, [formData.recurrence_type, formData.date, formData.recurrence_end_date]);

  const recurrenceLabels: Record<RecurrenceType, string> = {
    none: 'None',
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly'
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700">
              <Calendar className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {meeting ? 'Edit Meeting' : 'Create a New Meeting'}
              </h1>
              <p className="text-slate-400">Schedule and organize your club meetings</p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700"
          >
            <ArrowLeft size={16} />
            Back to Meetings
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/30">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {!meeting && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-medium text-white mb-4">Meeting Category</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleCategoryChange('general')}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all text-left
                    ${formData.meeting_category === 'general'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${formData.meeting_category === 'general' ? 'bg-blue-500/20' : 'bg-slate-600/50'}`}>
                      <Users size={20} className={formData.meeting_category === 'general' ? 'text-blue-400' : 'text-slate-400'} />
                    </div>
                    <span className={`font-semibold ${formData.meeting_category === 'general' ? 'text-white' : 'text-slate-300'}`}>
                      General Meeting
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 ml-11">
                    Committee members manage the meeting, all members can be assigned actions
                  </p>
                  {formData.meeting_category === 'general' && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleCategoryChange('committee')}
                  className={`
                    relative p-4 rounded-xl border-2 transition-all text-left
                    ${formData.meeting_category === 'committee'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                    }
                  `}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${formData.meeting_category === 'committee' ? 'bg-amber-500/20' : 'bg-slate-600/50'}`}>
                      <Shield size={20} className={formData.meeting_category === 'committee' ? 'text-amber-400' : 'text-slate-400'} />
                    </div>
                    <span className={`font-semibold ${formData.meeting_category === 'committee' ? 'text-white' : 'text-slate-300'}`}>
                      Committee Meeting
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 ml-11">
                    Only committee members can manage and be assigned actions
                  </p>
                  {formData.meeting_category === 'committee' && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  )}
                </button>
              </div>
              {formData.meeting_category === 'committee' && members.length === 0 && (
                <div className="mt-3 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 flex items-start gap-2">
                  <Info size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-300">
                    No committee members found. Please assign committee roles in the Committee Management section first.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-medium text-white mb-4">Meeting Details</h3>

            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Meeting Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Annual General Meeting 2025"
                />
              </div>
            
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Location
                  </label>
                  <div className="relative">
                    <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Meeting location"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Date *
                  </label>
                  <div className="relative">
                    <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      name="date"
                      required
                      value={formData.date}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Start Time
                  </label>
                  <div className="relative">
                    <Clock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="time"
                      name="start_time"
                      value={formData.start_time}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    End Time
                  </label>
                  <div className="relative">
                    <Clock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="time"
                      name="end_time"
                      value={formData.end_time}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Meeting Type
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, meeting_type: 'in_person' }))}
                    className={`
                      px-4 py-3 rounded-lg text-sm font-medium transition-all border
                      ${formData.meeting_type === 'in_person'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                      }
                    `}
                  >
                    <MapPin className="w-4 h-4 mx-auto mb-1" />
                    In Person
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, meeting_type: 'online' }))}
                    className={`
                      px-4 py-3 rounded-lg text-sm font-medium transition-all border
                      ${formData.meeting_type === 'online'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                      }
                    `}
                  >
                    <Video className="w-4 h-4 mx-auto mb-1" />
                    Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, meeting_type: 'hybrid' }))}
                    className={`
                      px-4 py-3 rounded-lg text-sm font-medium transition-all border
                      ${formData.meeting_type === 'hybrid'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" />
                      <Video className="w-3 h-3" />
                    </div>
                    Hybrid
                  </button>
                </div>
              </div>

              {(formData.meeting_type === 'online' || formData.meeting_type === 'hybrid') && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-300">
                      Conferencing URL
                    </label>
                    {hasGoogleIntegration && (
                      <button
                        type="button"
                        onClick={createGoogleMeet}
                        disabled={creatingMeet || !formData.name || !formData.date}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-gray-100 text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Video size={14} />
                        {creatingMeet ? 'Creating...' : 'Generate Google Meet'}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Video size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      name="conferencing_url"
                      value={formData.conferencing_url}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={hasGoogleIntegration ? "Generate Google Meet or enter another video link" : "e.g., Zoom or Teams meeting link"}
                    />
                  </div>
                  {hasGoogleIntegration && (
                    <p className="mt-1 text-xs text-slate-400">
                      Click "Generate Google Meet" to automatically create a meeting link, or enter your own Zoom/Teams link
                    </p>
                  )}
                  {!hasGoogleIntegration && (
                    <p className="mt-1 text-xs text-slate-400">
                      Connect Google Calendar in Settings to automatically generate Google Meet links
                    </p>
                  )}
                </div>
              )}
            
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Description
                </label>
                <div className="relative">
                  <FileText size={18} className="absolute left-3 top-3 text-slate-400" />
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Meeting description or additional information"
                  />
                </div>
              </div>
            
              {!meeting && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    <div className="flex items-center gap-2">
                      <Repeat size={16} className="text-slate-400" />
                      Recurring Meeting
                    </div>
                  </label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {(Object.entries(recurrenceLabels) as [RecurrenceType, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, recurrence_type: key }))}
                        className={`
                          px-3 py-2 rounded-lg text-sm font-medium transition-all border
                          ${formData.recurrence_type === key
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
                          }
                        `}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {formData.recurrence_type !== 'none' && (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Repeat until
                        </label>
                        <div className="relative max-w-xs">
                          <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            value={formData.recurrence_end_date}
                            min={formData.date}
                            onChange={(e) => setFormData(prev => ({ ...prev, recurrence_end_date: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      </div>

                      {recurrencePreviewDates.length > 0 && (
                        <div className="p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">
                          <p className="text-xs font-medium text-slate-300 mb-2">
                            {recurrencePreviewDates.length + 1} meeting{recurrencePreviewDates.length > 0 ? 's' : ''} will be created:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-600/30 text-blue-300 border border-blue-500/30">
                              {new Date(formData.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {recurrencePreviewDates.slice(0, 11).map((date, i) => (
                              <span key={i} className="px-2 py-0.5 rounded text-xs bg-slate-600/50 text-slate-300">
                                {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            ))}
                            {recurrencePreviewDates.length > 11 && (
                              <span className="px-2 py-0.5 rounded text-xs text-slate-400">
                                +{recurrencePreviewDates.length - 11} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {formData.recurrence_type !== 'none' && !formData.recurrence_end_date && (
                        <p className="text-xs text-amber-400 flex items-center gap-1">
                          <Info size={12} />
                          Please select an end date for the recurring series
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Chairperson
                  </label>
                  <MemberSelect
                    members={members}
                    value={formData.chairperson_id}
                    onChange={(value) => setFormData({ ...formData, chairperson_id: value })}
                    placeholder="Select chairperson"
                    allowEmpty={true}
                    emptyLabel="No chairperson"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Minute Taker
                  </label>
                  <MemberSelect
                    members={members}
                    value={formData.minute_taker_id}
                    onChange={(value) => setFormData({ ...formData, minute_taker_id: value })}
                    placeholder="Select minute taker"
                    allowEmpty={true}
                    emptyLabel="No minute taker"
                  />
                </div>
              </div>
            </div>
          </div>
        
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Agenda</h3>
              <button
                type="button"
                onClick={handleAddAgendaItem}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
              >
                <Plus size={18} />
                Add Item
              </button>
            </div>
          
            <div className="space-y-4">
              {agendaItems.map((item, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 flex items-center justify-center bg-slate-600 text-white rounded-full text-xs">
                        {item.item_number}
                      </span>
                      <h4 className="text-sm font-medium text-slate-200">Agenda Item</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAgendaItem(index)}
                      className="p-1 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Item
                      </label>
                      <input
                        type="text"
                        value={item.item_name}
                        onChange={(e) => handleAgendaItemChange(index, 'item_name', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Agenda item name"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Owner
                      </label>
                      <MemberSelect
                        members={members}
                        value={item.owner_id || ''}
                        onChange={(value) => handleAgendaItemChange(index, 'owner_id', value)}
                        placeholder="Select owner"
                        allowEmpty={true}
                        emptyLabel="No owner"
                      />
                    </div>
                  </div>
                
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Type
                      </label>
                      <select
                        value={item.type}
                        onChange={(e) => handleAgendaItemChange(index, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="for_noting">For Noting</option>
                        <option value="for_action">For Action</option>
                        <option value="for_discussion">For Discussion</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        value={item.duration || ''}
                        onChange={(e) => handleAgendaItemChange(index, 'duration', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Duration in minutes"
                        min="1"
                      />
                    </div>
                  </div>
                </div>
              ))}
            
              {agendaItems.length === 0 && (
                <div className="text-center py-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
                  <p className="text-slate-400">No agenda items added yet</p>
                  <button
                    type="button"
                    onClick={handleAddAgendaItem}
                    className="mt-2 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 text-sm transition-all"
                  >
                    Add First Item
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 text-xs text-slate-400">
              <p>To re-order agenda items, you can drag-and-drop them after saving the meeting.</p>
            </div>
          </div>
        
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={18} />
                  <span>{meeting ? 'Update Meeting' : 'Create Meeting'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};