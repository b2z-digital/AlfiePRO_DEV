import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Plus, Trash2, Check, AlertTriangle, User, Users, Clock, ChevronDown, ChevronUp, Paperclip, CheckSquare, FileText, Download, X, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Meeting, MeetingAgendaItem, MeetingAttendee, MeetingGuest } from '../../types/meeting';
import {
  getMeetingById,
  getMeetingAgenda,
  startMeeting,
  updateAgendaItemMinutes,
  completeMeetingMinutes,
  addAgendaItemToMeeting,
  deleteAgendaItem,
  getClubMembersForMeeting,
  updateAgendaItem
} from '../../utils/meetingStorage';
import { formatDate } from '../../utils/date';
import { WysiwygEditor } from '../ui/WysiwygEditor';
import { AgendaTaskManager } from './AgendaTaskManager';
import { ActionItemsSummary } from './ActionItemsSummary';
import { supabase } from '../../utils/supabase';
import '../../styles/minutes.css';

interface MinuteTakingPageProps {
  darkMode: boolean;
}

export const MinuteTakingPage: React.FC<MinuteTakingPageProps> = ({ darkMode }) => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const navigate = useNavigate();
  
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agendaItems, setAgendaItems] = useState<(MeetingAgendaItem & { 
    isExpanded?: boolean;
    isEditingTitle?: boolean;
    isEditingType?: boolean;
    isEditingOwner?: boolean;
    isEditingDuration?: boolean;
    editTitle?: string;
    editType?: 'for_noting' | 'for_action' | 'for_discussion';
    editOwner?: string;
    editDuration?: number;
    minutes_decision?: string;
    minutes_tasks?: string;
    minutes_attachments?: any[];
  })[]>([]);
  const [members, setMembers] = useState<MeetingAttendee[]>([]);
  const [guests, setGuests] = useState<MeetingGuest[]>([]);
  const [newGuest, setNewGuest] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [activeAgendaItemId, setActiveAgendaItemId] = useState<string | null>(null);
  const [newAgendaItem, setNewAgendaItem] = useState({
    item_name: '',
    type: 'for_discussion' as 'for_noting' | 'for_action' | 'for_discussion',
    duration: 5
  });
  const [isLastItem, setIsLastItem] = useState(false);
  const [showActionItemsSummary, setShowActionItemsSummary] = useState(false);
  const [agendaItemTasks, setAgendaItemTasks] = useState<{ [agendaItemId: string]: any[] }>({});
  const [uploadingAgendaItemId, setUploadingAgendaItemId] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Check if meeting is locked/completed (read-only mode)
  const isReadOnly = meeting?.status === 'completed' || meeting?.minutes_locked === true;

  useEffect(() => {
    if (meetingId) {
      fetchMeetingData();
    }
  }, [meetingId]);

  const fetchMeetingData = async () => {
    if (!meetingId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch meeting details
      const meetingData = await getMeetingById(meetingId);
      if (!meetingData) {
        throw new Error('Meeting not found');
      }
      setMeeting(meetingData);
      
      // Fetch agenda items
      const agendaData = await getMeetingAgenda(meetingId);
      
      // Set the first item as active by default
      if (agendaData.length > 0) {
        setActiveAgendaItemId(agendaData[0].id);
      }
      
      setAgendaItems(agendaData.map((item, index) => ({ 
        ...item, 
        isExpanded: index === 0, // Only expand the first item
        editTitle: item.item_name,
        editType: item.type,
        editOwner: item.owner_id || '',
        editDuration: item.duration || 0
      })));
      
      const meetingAssociationId = meetingData.state_association_id || meetingData.national_association_id || undefined;
      const meetingAssociationType = meetingData.state_association_id ? 'state' as const : meetingData.national_association_id ? 'national' as const : undefined;
      const clubMembers = await getClubMembersForMeeting(
        meetingData.club_id || undefined,
        meetingAssociationId,
        meetingAssociationType,
        meetingData.meeting_category
      );

      // If meeting has already started, load the saved attendance
      if (meetingData.minutes_status !== 'not_started' && meetingData.members_present) {
        const presentMemberIds = new Set(meetingData.members_present.map(m => m.id));

        // Mark members as present based on saved data
        const updatedMembers = clubMembers.map(member => ({
          ...member,
          isPresent: presentMemberIds.has(member.id)
        }));

        setMembers(updatedMembers);
        setGuests(meetingData.guests_present || []);
      } else {
        // Check if we have pre-selected attendees from the attendance modal
        const storedAttendees = sessionStorage.getItem(`meeting_${meetingId}_attendees`);
        if (storedAttendees) {
          try {
            const selectedIds = JSON.parse(storedAttendees);
            const selectedIdsSet = new Set(selectedIds);

            // Pre-select the members who were marked as attending
            const updatedMembers = clubMembers.map(member => ({
              ...member,
              isPresent: selectedIdsSet.has(member.id)
            }));

            setMembers(updatedMembers);
            // Clear the session storage after using it
            sessionStorage.removeItem(`meeting_${meetingId}_attendees`);

            // Show attendance modal to confirm/adjust
            setShowAttendanceModal(true);
          } catch (e) {
            console.error('Error parsing stored attendees:', e);
            setMembers(clubMembers);
            setShowAttendanceModal(true);
          }
        } else {
          setMembers(clubMembers);

          // If meeting hasn't started yet, show attendance modal
          setShowAttendanceModal(true);
        }
      }
    } catch (err) {
      console.error('Error fetching meeting data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load meeting data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartMeeting = async () => {
    if (!meetingId || !meeting) return;
    
    try {
      setSaving(true);
      
      // Prepare attendance data
      const presentMembers = members
        .filter(m => m.isPresent)
        .map(m => ({ id: m.id, name: m.name }));
      
      // Start the meeting
      await startMeeting(meetingId, presentMembers, guests);
      
      // Update local state
      setMeeting({
        ...meeting,
        minutes_status: 'in_progress',
        members_present: presentMembers,
        guests_present: guests
      });
      
      setShowAttendanceModal(false);
      setSuccess('Meeting started successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error starting meeting:', err);
      setError(err instanceof Error ? err.message : 'Failed to start meeting');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMinutes = async () => {
    if (!meetingId || !meeting) return;

    try {
      setSaving(true);
      setError(null);

      // Save minutes for each agenda item
      for (const item of agendaItems) {
        await updateAgendaItemMinutes(
          item.id,
          item.minutes_content || '',
          item.minutes_decision,
          item.minutes_tasks,
          item.minutes_attachments
        );
        // Note: Tasks are saved directly by AgendaTaskManager, no need to save them again here
      }

      setSuccess('Minutes saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving minutes:', err);
      setError(err instanceof Error ? err.message : 'Failed to save minutes');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteMinutes = async () => {
    if (!meetingId || !meeting) return;

    try {
      setSaving(true);

      // First save all minutes
      for (const item of agendaItems) {
        await updateAgendaItemMinutes(
          item.id,
          item.minutes_content || '',
          item.minutes_decision,
          item.minutes_tasks,
          item.minutes_attachments
        );
        // Note: Tasks are saved directly by AgendaTaskManager, no need to save them again here
      }

      // Then mark the meeting as completed
      await completeMeetingMinutes(meetingId);
      
      setSuccess('Minutes completed successfully');
      
      // Navigate back to meetings page after a short delay
      setTimeout(() => {
        navigate('/meetings');
      }, 2000);
    } catch (err) {
      console.error('Error completing minutes:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete minutes');
      setSaving(false);
    }
  };

  const handleAddAgendaItem = async () => {
    if (!meetingId || !meeting) return;
    
    try {
      if (!newAgendaItem.item_name.trim()) {
        setError('Agenda item name is required');
        return;
      }
      
      // Determine the next item number
      const nextItemNumber = agendaItems.length > 0 
        ? Math.max(...agendaItems.map(item => item.item_number)) + 1 
        : 1;
      
      // Add the new agenda item
      const newItem = await addAgendaItemToMeeting(meetingId, {
        item_number: nextItemNumber,
        item_name: newAgendaItem.item_name,
        type: newAgendaItem.type,
        duration: newAgendaItem.duration
      });
      
      // Update local state
      setAgendaItems([...agendaItems, { 
        ...newItem, 
        isExpanded: true,
        editTitle: newItem.item_name,
        editType: newItem.type,
        editOwner: newItem.owner_id || '',
        editDuration: newItem.duration || 0
      }]);
      
      // Reset the form
      setNewAgendaItem({
        item_name: '',
        type: 'for_discussion',
        duration: 5
      });
      
      setSuccess('Agenda item added successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error adding agenda item:', err);
      setError(err instanceof Error ? err.message : 'Failed to add agenda item');
    }
  };

  const handleDeleteAgendaItem = async (itemId: string) => {
    if (!meetingId) return;
    
    try {
      await deleteAgendaItem(itemId);
      
      // Update local state
      setAgendaItems(agendaItems.filter(item => item.id !== itemId));
      
      setSuccess('Agenda item deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting agenda item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agenda item');
    }
  };

  const handleMinutesChange = (itemId: string, content: string) => {
    setAgendaItems(agendaItems.map(item => 
      item.id === itemId ? { ...item, minutes_content: content } : item
    ));
  };

  const handleDecisionChange = (itemId: string, decision: string) => {
    setAgendaItems(agendaItems.map(item => 
      item.id === itemId ? { ...item, minutes_decision: decision } : item
    ));
  };

  const handleTasksChange = (agendaItemId: string, tasks: any[]) => {
    setAgendaItemTasks(prev => ({
      ...prev,
      [agendaItemId]: tasks
    }));
  };

  const handleAttachmentUpload = async (agendaItemId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !meetingId) return;

    setUploadingAgendaItemId(agendaItemId);
    try {
      const item = agendaItems.find(i => i.id === agendaItemId);
      const existingAttachments = item?.minutes_attachments || [];
      const newAttachments = [...existingAttachments];

      for (const file of Array.from(files)) {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${meetingId}/${agendaItemId}/${Date.now()}_${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
          .from('meeting-attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        newAttachments.push({
          name: file.name,
          path: filePath,
          size: file.size,
          type: file.type,
          uploaded_at: new Date().toISOString()
        });
      }

      setAgendaItems(agendaItems.map(i =>
        i.id === agendaItemId ? { ...i, minutes_attachments: newAttachments } : i
      ));

      await supabase
        .from('meeting_agendas')
        .update({ minutes_attachments: newAttachments })
        .eq('id', agendaItemId);

    } catch (err) {
      console.error('Error uploading attachment:', err);
      setError('Failed to upload attachment');
      setTimeout(() => setError(null), 3000);
    } finally {
      setUploadingAgendaItemId(null);
      if (fileInputRefs.current[agendaItemId]) {
        fileInputRefs.current[agendaItemId]!.value = '';
      }
    }
  };

  const handleAttachmentDelete = async (agendaItemId: string, attachmentIndex: number) => {
    try {
      const item = agendaItems.find(i => i.id === agendaItemId);
      if (!item?.minutes_attachments) return;

      const attachment = item.minutes_attachments[attachmentIndex];
      if (attachment?.path) {
        await supabase.storage
          .from('meeting-attachments')
          .remove([attachment.path]);
      }

      const updatedAttachments = item.minutes_attachments.filter((_: any, i: number) => i !== attachmentIndex);

      setAgendaItems(agendaItems.map(i =>
        i.id === agendaItemId ? { ...i, minutes_attachments: updatedAttachments } : i
      ));

      await supabase
        .from('meeting_agendas')
        .update({ minutes_attachments: updatedAttachments })
        .eq('id', agendaItemId);

    } catch (err) {
      console.error('Error deleting attachment:', err);
      setError('Failed to delete attachment');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleAttachmentDownload = async (attachment: any) => {
    try {
      const { data, error } = await supabase.storage
        .from('meeting-attachments')
        .download(attachment.path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading attachment:', err);
      setError('Failed to download attachment');
      setTimeout(() => setError(null), 3000);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const saveAgendaTasks = async (agendaItemId: string, tasks: any[]) => {
    if (!meeting?.club_id) return;

    try {
      // Get current user
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData.user?.id || '';

      // Delete existing tasks for this agenda item
      const { error: deleteError } = await supabase
        .from('club_tasks')
        .delete()
        .eq('meeting_agenda_id', agendaItemId);

      if (deleteError) throw deleteError;

      // Insert new tasks
      const tasksToInsert = tasks
        .filter(task => task.title && task.title.trim() !== '') // Only save tasks with a title
        .map(task => ({
          title: task.title,
          description: task.description || null,
          assignee_id: task.assignee_id || null,
          due_date: task.due_date || null,
          due_time: task.due_time || null,
          priority: task.priority,
          supporting_members: task.supporting_members || [],
          club_id: meeting.club_id,
          meeting_agenda_id: agendaItemId,
          created_by: currentUserId,
          status: 'pending'
        }));

      if (tasksToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('club_tasks')
          .insert(tasksToInsert);

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('Error saving agenda tasks:', error);
    }
  };

  const toggleAgendaItemExpansion = (itemId: string) => {
    setAgendaItems(agendaItems.map(item => 
      item.id === itemId 
        ? { ...item, isExpanded: !item.isExpanded } 
        : { ...item, isExpanded: false }
    ));
    setActiveAgendaItemId(itemId);
    
    // Check if this is the last item
    const currentIndex = agendaItems.findIndex(item => item.id === itemId);
    setIsLastItem(currentIndex === agendaItems.length - 1);
  };

  const handleToggleMemberAttendance = (memberId: string) => {
    setMembers(members.map(member => 
      member.id === memberId ? { ...member, isPresent: !member.isPresent } : member
    ));
  };

  const handleAddGuest = () => {
    if (!newGuest.trim()) return;
    
    setGuests([...guests, { name: newGuest.trim() }]);
    setNewGuest('');
  };

  const handleRemoveGuest = (index: number) => {
    setGuests(guests.filter((_, i) => i !== index));
  };

  const handleEditAgendaItem = async (itemId: string, field: string) => {
    const item = agendaItems.find(item => item.id === itemId);
    if (!item) return;
    
    try {
      let updates: Partial<MeetingAgendaItem> = {};
      
      if (field === 'title') {
        if (!item.editTitle?.trim()) {
          setError('Item name cannot be empty');
          return;
        }
        updates.item_name = item.editTitle;
      } else if (field === 'type') {
        updates.type = item.editType || 'for_discussion';
      } else if (field === 'owner') {
        updates.owner_id = item.editOwner || null;
      } else if (field === 'duration') {
        updates.duration = item.editDuration || null;
      }
      
      // Update the agenda item
      await updateAgendaItem(itemId, updates);
      
      // Update local state
      setAgendaItems(agendaItems.map(item => 
        item.id === itemId 
          ? { 
              ...item, 
              ...(field === 'title' ? { item_name: item.editTitle || '' } : {}),
              ...(field === 'type' ? { type: item.editType || 'for_discussion' } : {}),
              ...(field === 'owner' ? { owner_id: item.editOwner || null } : {}),
              ...(field === 'duration' ? { duration: item.editDuration || null } : {}),
              isEditingTitle: false,
              isEditingType: false,
              isEditingOwner: false,
              isEditingDuration: false
            } 
          : item
      ));
      
      setSuccess('Agenda item updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating agenda item:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agenda item');
    }
  };

  const handleNextItem = () => {
    const currentIndex = agendaItems.findIndex(item => item.id === activeAgendaItemId);
    if (currentIndex < agendaItems.length - 1) {
      const nextItem = agendaItems[currentIndex + 1];
      setActiveAgendaItemId(nextItem.id);
      
      // Expand the next item and collapse others
      setAgendaItems(agendaItems.map(item => 
        item.id === nextItem.id 
          ? { ...item, isExpanded: true } 
          : { ...item, isExpanded: false }
      ));
      
      // Scroll to the next item
      document.getElementById(`agenda-item-${nextItem.id}`)?.scrollIntoView({ behavior: 'smooth' });
      
      // Check if this is the last item
      setIsLastItem(currentIndex + 1 === agendaItems.length - 1);
    } else {
      // If we're at the last item, show a message or prompt to complete
      setSuccess('All agenda items completed. You can now complete the minutes.');
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-400">Meeting not found</p>
        <button
          onClick={() => navigate('/meetings')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Meetings
        </button>
      </div>
    );
  }

  // Get the type label and class for an agenda item
  const getAgendaItemTypeLabel = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'For Noting';
      case 'for_action':
        return 'For Action';
      case 'for_discussion':
        return 'For Discussion';
      default:
        return type;
    }
  };

  const getAgendaItemTypeClass = (type: string) => {
    switch (type) {
      case 'for_noting':
        return 'bg-blue-100 text-blue-800';
      case 'for_action':
        return 'bg-green-100 text-green-800';
      case 'for_discussion':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={() => navigate('/meetings')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200"
          >
            <ArrowLeft size={16} />
            Back to Meetings
          </button>
          
          <div className="flex gap-2">
            {/* Action Items Summary Button - Available when meeting is completed */}
            {isReadOnly && (
              <button
                onClick={() => setShowActionItemsSummary(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-lg hover:from-cyan-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl"
              >
                <FileText size={16} />
                <span>View Action Items</span>
              </button>
            )}

            {!isReadOnly && (
              <>
                <button
                  onClick={handleSaveMinutes}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCompleteMinutes}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <Check size={16} />
                  <span>Complete & Close</span>
                </button>
              </>
            )}
            {isReadOnly && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                <Check size={16} />
                <span className="font-medium">Minutes Completed</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-auto max-w-5xl px-4 py-2 mt-4">
          <div className="p-4 rounded-lg bg-red-50 border border-red-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-auto max-w-5xl px-4 py-2 mt-4">
          <div className="p-4 rounded-lg bg-green-50 border border-green-200">
            <div className="flex">
              <div className="flex-shrink-0">
                <Check className="h-5 w-5 text-green-500" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-700">{success}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{meeting.name} Minutes</h1>
          
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Clock size={16} />
              <span>{formatDate(meeting.date)}</span>
            </div>
            
            {meeting.location && (
              <div className="flex items-center gap-1">
                <Clock size={16} />
                <span>{meeting.location}</span>
              </div>
            )}
            
            {!isReadOnly && (
              <button
                onClick={() => setShowAttendanceModal(true)}
                className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Users size={16} />
                <span>
                  {members.filter(m => m.isPresent).length} members present
                  {guests.length > 0 && `, ${guests.length} guest${guests.length !== 1 ? 's' : ''}`}
                </span>
              </button>
            )}
            {isReadOnly && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Users size={16} />
                  <span className="font-medium">Members Present:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {members.filter(m => m.isPresent).map((member, index) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full"
                    >
                      <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt={member.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-700 font-bold text-xs">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-900">{member.name}</span>
                    </div>
                  ))}
                  {guests.length > 0 && guests.map((guest, index) => (
                    <div
                      key={`guest-${index}`}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0">
                        <Users size={12} className="text-blue-700" />
                      </div>
                      <span className="text-sm text-gray-900">{guest.name}</span>
                      <span className="text-xs text-blue-600">(Guest)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="space-y-6">
          {agendaItems.map((item, itemIndex) => {
            const agendaColors = [
              { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-600 text-white', hoverBg: 'hover:bg-blue-50/50' },
              { bg: 'bg-teal-50', border: 'border-teal-200', badge: 'bg-teal-600 text-white', hoverBg: 'hover:bg-teal-50/50' },
              { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-600 text-white', hoverBg: 'hover:bg-amber-50/50' },
              { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-600 text-white', hoverBg: 'hover:bg-rose-50/50' },
              { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-600 text-white', hoverBg: 'hover:bg-emerald-50/50' },
              { bg: 'bg-sky-50', border: 'border-sky-200', badge: 'bg-sky-600 text-white', hoverBg: 'hover:bg-sky-50/50' },
              { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-600 text-white', hoverBg: 'hover:bg-orange-50/50' },
              { bg: 'bg-cyan-50', border: 'border-cyan-200', badge: 'bg-cyan-600 text-white', hoverBg: 'hover:bg-cyan-50/50' },
            ];
            const color = agendaColors[itemIndex % agendaColors.length];

            return (
            <div
              key={item.id}
              id={`agenda-item-${item.id}`}
              className={`bg-white rounded-lg border ${item.isExpanded ? `${color.border} shadow-md` : 'border-gray-200'} overflow-hidden`}
            >
              <div
                className={`p-4 flex items-center justify-between cursor-pointer ${item.isExpanded ? color.bg : color.hoverBg}`}
                onClick={() => toggleAgendaItemExpansion(item.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${color.badge} flex items-center justify-center font-medium text-sm`}>
                    {item.item_number}
                  </div>
                  <div>
                    {item.isEditingTitle ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.editTitle || ''}
                          onChange={(e) => setAgendaItems(agendaItems.map(i => 
                            i.id === item.id ? { ...i, editTitle: e.target.value } : i
                          ))}
                          className="px-2 py-1 border border-gray-300 rounded"
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditAgendaItem(item.id, 'title');
                          }}
                          className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          <Check size={16} />
                        </button>
                      </div>
                    ) : (
                      <h3
                        className={`font-medium text-gray-900 ${!isReadOnly ? 'hover:text-blue-600 cursor-pointer' : ''}`}
                        onClick={(e) => {
                          if (isReadOnly) return;
                          e.stopPropagation();
                          setAgendaItems(agendaItems.map(i =>
                            i.id === item.id ? { ...i, isEditingTitle: true } : i
                          ));
                        }}
                      >
                        {item.item_name}
                      </h3>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      {item.isEditingType ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={item.editType}
                            onChange={(e) => setAgendaItems(agendaItems.map(i => 
                              i.id === item.id ? { ...i, editType: e.target.value as any } : i
                            ))}
                            className="px-2 py-1 border border-gray-300 rounded text-xs"
                          >
                            <option value="for_noting">For Noting</option>
                            <option value="for_action">For Action</option>
                            <option value="for_discussion">For Discussion</option>
                          </select>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAgendaItem(item.id, 'type');
                            }}
                            className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAgendaItemTypeClass(item.type)} ${!isReadOnly ? 'cursor-pointer' : ''}`}
                          onClick={(e) => {
                            if (isReadOnly) return;
                            e.stopPropagation();
                            setAgendaItems(agendaItems.map(i =>
                              i.id === item.id ? { ...i, isEditingType: true } : i
                            ));
                          }}
                        >
                          {getAgendaItemTypeLabel(item.type)}
                        </span>
                      )}
                      
                      {item.isEditingOwner ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={item.editOwner || ''}
                            onChange={(e) => setAgendaItems(agendaItems.map(i => 
                              i.id === item.id ? { ...i, editOwner: e.target.value } : i
                            ))}
                            className="px-2 py-1 border border-gray-300 rounded text-xs"
                          >
                            <option value="">No owner</option>
                            {members.map(member => (
                              <option key={member.id} value={member.id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAgendaItem(item.id, 'owner');
                            }}
                            className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        item.owner && (
                          <span
                            className={`text-gray-500 ${!isReadOnly ? 'cursor-pointer' : ''}`}
                            onClick={(e) => {
                              if (isReadOnly) return;
                              e.stopPropagation();
                              setAgendaItems(agendaItems.map(i =>
                                i.id === item.id ? { ...i, isEditingOwner: true } : i
                              ));
                            }}
                          >
                            Owner: {item.owner.first_name} {item.owner.last_name}
                          </span>
                        )
                      )}
                      
                      {item.isEditingDuration ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            value={item.editDuration || 0}
                            onChange={(e) => setAgendaItems(agendaItems.map(i => 
                              i.id === item.id ? { ...i, editDuration: parseInt(e.target.value) || 0 } : i
                            ))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                            min="1"
                          />
                          <span className="text-xs text-gray-500">min</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditAgendaItem(item.id, 'duration');
                            }}
                            className="p-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        item.duration && (
                          <span
                            className={`text-gray-500 ${!isReadOnly ? 'cursor-pointer' : ''}`}
                            onClick={(e) => {
                              if (isReadOnly) return;
                              e.stopPropagation();
                              setAgendaItems(agendaItems.map(i =>
                                i.id === item.id ? { ...i, isEditingDuration: true } : i
                              ));
                            }}
                          >
                            {item.duration} min
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAgendaItem(item.id);
                      }}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {item.isExpanded ? (
                    <ChevronUp size={18} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={18} className="text-gray-500" />
                  )}
                </div>
              </div>
              
              {item.isExpanded && (
                <div className="p-6 border-t border-gray-200">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Details
                      </label>
                      {isReadOnly ? (
                        <div
                          className="prose prose-sm max-w-none p-3 bg-gray-50 rounded-md border border-gray-200 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_ul]:mb-4 [&_ol]:mb-4 [&_li]:mb-2"
                          dangerouslySetInnerHTML={{ __html: item.minutes_content || '<p class="text-gray-400">No details recorded</p>' }}
                        />
                      ) : (
                        <WysiwygEditor
                          value={item.minutes_content || ''}
                          onChange={(content) => handleMinutesChange(item.id, content)}
                          darkMode={false}
                          height={200}
                          placeholder="Record notes here..."
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Attachments
                      </label>

                      {(item.minutes_attachments || []).length > 0 && (
                        <div className="space-y-2 mb-3">
                          {(item.minutes_attachments || []).map((att: any, attIdx: number) => (
                            <div
                              key={attIdx}
                              className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-md group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                                <span className="text-sm text-gray-700 truncate">{att.name}</span>
                                {att.size && (
                                  <span className="text-xs text-gray-400 flex-shrink-0">
                                    ({formatFileSize(att.size)})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleAttachmentDownload(att)}
                                  className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                  title="Download"
                                >
                                  <Download size={14} />
                                </button>
                                {!isReadOnly && (
                                  <button
                                    onClick={() => handleAttachmentDelete(item.id, attIdx)}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                                    title="Remove"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!isReadOnly && (
                        <>
                          <input
                            type="file"
                            ref={(el) => { fileInputRefs.current[item.id] = el; }}
                            onChange={(e) => handleAttachmentUpload(item.id, e.target.files)}
                            className="hidden"
                            multiple
                          />
                          <button
                            onClick={() => fileInputRefs.current[item.id]?.click()}
                            disabled={uploadingAgendaItemId === item.id}
                            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {uploadingAgendaItemId === item.id ? (
                              <>
                                <Loader2 size={16} className="animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Paperclip size={16} />
                                Add Attachments
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Decision
                      </label>
                      {isReadOnly ? (
                        <div className="px-3 py-2 bg-gray-50 rounded-md border border-gray-200 whitespace-pre-wrap">
                          {item.minutes_decision || <span className="text-gray-400">No decision recorded</span>}
                        </div>
                      ) : (
                        <textarea
                          value={item.minutes_decision || ''}
                          onChange={(e) => handleDecisionChange(item.id, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md resize-y min-h-[60px]"
                          placeholder="Add Decision"
                          rows={2}
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Action Items
                      </label>
                      <AgendaTaskManager
                        agendaItemId={item.id}
                        clubId={meeting.club_id}
                        isReadOnly={isReadOnly}
                        onTasksChange={(tasks) => handleTasksChange(item.id, tasks)}
                        meetingCategory={meeting.meeting_category}
                        associationId={meeting.state_association_id || meeting.national_association_id || undefined}
                        associationType={meeting.state_association_id ? 'state' : meeting.national_association_id ? 'national' : undefined}
                      />
                    </div>

                    {!isReadOnly && (
                      <div className="pt-4 border-t border-gray-200">
                        {!isLastItem ? (
                          <button
                            onClick={handleNextItem}
                            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                          >
                            Next Item
                          </button>
                        ) : (
                          <button
                            onClick={handleCompleteMinutes}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            Complete & Close Meeting
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {!isReadOnly && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Agenda Item</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  value={newAgendaItem.item_name}
                  onChange={(e) => setNewAgendaItem({...newAgendaItem, item_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter agenda item name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newAgendaItem.type}
                  onChange={(e) => setNewAgendaItem({
                    ...newAgendaItem, 
                    type: e.target.value as 'for_noting' | 'for_action' | 'for_discussion'
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="for_noting">For Noting</option>
                  <option value="for_action">For Action</option>
                  <option value="for_discussion">For Discussion</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleAddAgendaItem}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* Attendance Modal */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Meeting Attendance</h3>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h4 className="text-lg font-medium text-gray-900 mb-3">Members Present</h4>
                
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                  {members.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">
                      No members found
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {members.map(member => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                              {member.avatar_url ? (
                                <img
                                  src={member.avatar_url}
                                  alt={member.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-700 font-bold text-sm">
                                  {member.name.split(' ').map(n => n[0]).join('')}
                                </div>
                              )}
                            </div>
                            <div className="font-medium text-gray-900">
                              {member.name}
                            </div>
                          </div>
                          <div>
                            <input
                              type="checkbox"
                              checked={member.isPresent}
                              onChange={() => handleToggleMemberAttendance(member.id)}
                              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mb-6">
                <h4 className="text-lg font-medium text-gray-900 mb-3">Guests</h4>
                
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newGuest}
                      onChange={(e) => setNewGuest(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter guest name"
                    />
                    <button
                      onClick={handleAddGuest}
                      disabled={!newGuest.trim()}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                  
                  {guests.length > 0 ? (
                    <div className="space-y-2">
                      {guests.map((guest, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center gap-3">
                            <User size={18} className="text-gray-500" />
                            <div className="font-medium text-gray-900">
                              {guest.name}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveGuest(index)}
                            className="p-1 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-500">No guests added</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-3">
                {meeting.minutes_status !== 'not_started' && (
                  <button
                    onClick={() => setShowAttendanceModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                )}
                
                {meeting.minutes_status === 'not_started' && (
                  <button
                    onClick={handleStartMeeting}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Starting...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>Start Meeting</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Items Summary Modal */}
      {meeting && (
        <ActionItemsSummary
          meetingId={meetingId!}
          meetingName={meeting.name}
          meetingDate={meeting.date}
          isOpen={showActionItemsSummary}
          onClose={() => setShowActionItemsSummary(false)}
        />
      )}
    </div>
  );
};