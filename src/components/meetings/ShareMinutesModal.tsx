import React, { useState, useEffect } from 'react';
import { X, Mail, Search, Users, Check, AlertTriangle, Send, Download, FileText, Shield } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Member } from '../../types/member';
import { Meeting, MeetingAgendaItem } from '../../types/meeting';
import { formatDate } from '../../utils/date';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Avatar } from '../ui/Avatar';
import { MemberSelect } from '../ui/MemberSelect';

interface ShareMinutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting;
  agendaItems: MeetingAgendaItem[];
  clubId: string;
  darkMode: boolean;
  meetingCategory?: 'general' | 'committee';
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const ShareMinutesModal: React.FC<ShareMinutesModalProps> = ({
  isOpen,
  onClose,
  meeting,
  agendaItems,
  clubId,
  darkMode,
  meetingCategory = 'general',
  associationId,
  associationType
}) => {
  const [recipientType, setRecipientType] = useState<'all' | 'committee' | 'selected' | 'individual'>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [committeeMembers, setCommitteeMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [individualRecipient, setIndividualRecipient] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [subject, setSubject] = useState(`Minutes: ${meeting.name}`);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      // Generate default message
      const defaultMessage = `
Please find attached the minutes from our recent meeting:

Meeting: ${meeting.name}
Date: ${formatDate(meeting.date)}
${meeting.location ? `Location: ${meeting.location}` : ''}

The minutes are attached to this email.

Thank you.
      `.trim();
      
      setMessage(defaultMessage);
    }
  }, [isOpen, meeting]);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      const isAssociation = !!associationId && !!associationType;

      if (isAssociation) {
        if (associationType === 'state') {
          const { data: clubs, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('state_association_id', associationId);

          if (clubsError) throw clubsError;

          const clubIds = (clubs || []).map(c => c.id);
          if (clubIds.length > 0) {
            const { data, error } = await supabase
              .from('members')
              .select('id, first_name, last_name, email, avatar_url, club_id, club')
              .in('club_id', clubIds)
              .order('first_name', { ascending: true });

            if (error) throw error;
            setMembers((data || []).filter(m => m.email) as Member[]);
          } else {
            setMembers([]);
          }
        } else {
          const tableName = 'user_national_associations';
          const idColumn = 'national_association_id';

          const { data: userAssociations, error: assocError } = await supabase
            .from(tableName)
            .select('user_id')
            .eq(idColumn, associationId);

          if (assocError) throw assocError;

          const userIds = (userAssociations || []).map(ua => ua.user_id);
          if (userIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, first_name, last_name, email')
              .in('id', userIds)
              .order('first_name', { ascending: true });

            if (profilesError) throw profilesError;

            const transformed = (profiles || []).filter(p => p.email).map((p: any) => ({
              ...p,
              club_id: '',
              club: '',
            })) as Member[];
            setMembers(transformed);
          } else {
            setMembers([]);
          }
        }

        const assocTable = associationType === 'state' ? 'user_state_associations' : 'user_national_associations';
        const assocCol = associationType === 'state' ? 'state_association_id' : 'national_association_id';

        const { data: assocUsers, error: assocUsersError } = await supabase
          .from(assocTable)
          .select('user_id')
          .eq(assocCol, associationId);

        if (!assocUsersError && assocUsers && assocUsers.length > 0) {
          const userIds = assocUsers.map(au => au.user_id);
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', userIds)
            .order('first_name', { ascending: true });

          if (!profilesError) {
            const transformed = (profiles || []).filter(p => p.email).map((p: any) => ({
              ...p,
              club_id: '',
              club: '',
            })) as Member[];
            setCommitteeMembers(transformed);
          }
        }
      } else {
        const { data, error } = await supabase
          .from('members')
          .select('id, first_name, last_name, email, avatar_url')
          .eq('club_id', clubId)
          .order('first_name', { ascending: true });

        if (error) throw error;
        setMembers((data || []).filter(m => m.email) as Member[]);

        const { data: positions, error: posError } = await supabase
          .from('committee_positions')
          .select('member_id')
          .eq('club_id', clubId);

        if (!posError && positions) {
          const committeeMemberIds = positions.map(p => p.member_id).filter(Boolean);
          if (committeeMemberIds.length > 0) {
            const committeeList = (data || []).filter(m => committeeMemberIds.includes(m.id) && m.email);
            setCommitteeMembers(committeeList as Member[]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching members:', err);
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleShareMinutes = async () => {
    try {
      setSending(true);
      setError(null);
      
      let recipients: string[] = [];

      if (recipientType === 'all') {
        recipients = members.map(member => member.id);
      } else if (recipientType === 'committee') {
        recipients = committeeMembers.map(member => member.id);
      } else if (recipientType === 'selected') {
        recipients = selectedMembers;
      } else if (recipientType === 'individual') {
        recipients = [individualRecipient];
      }
      
      if (recipients.length === 0) {
        setError('Please select at least one recipient');
        setSending(false);
        return;
      }

      const allKnownMembers = [...members, ...committeeMembers.filter(cm => !members.some(m => m.id === cm.id))];
      const recipientMembers = allKnownMembers.filter(m => recipients.includes(m.id));
      const formattedRecipients = recipientMembers.map(member => ({
        user_id: member.user_id || member.id,
        email: member.email,
        name: `${member.first_name} ${member.last_name}`,
        first_name: member.first_name,
        last_name: member.last_name
      }));

      const { error: sendError } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'meeting_minutes',
          club_id: clubId,
          recipients: formattedRecipients,
          subject: subject,
          body: message,
          send_email: true,
          link_url: `/meetings`
        }
      });

      if (sendError) throw sendError;
      
      setSuccess(`Minutes shared with ${recipients.length} member${recipients.length !== 1 ? 's' : ''}`);
      
      // Reset form after successful send
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error sharing minutes:', err);
      setError(err instanceof Error ? err.message : 'Failed to share minutes');
    } finally {
      setSending(false);
    }
  };

  const toggleMemberSelection = (memberId: string) => {
    if (selectedMembers.includes(memberId)) {
      setSelectedMembers(selectedMembers.filter(id => id !== memberId));
    } else {
      setSelectedMembers([...selectedMembers, memberId]);
    }
  };

  const handleDownloadMinutes = () => {
    try {
      // Create a new PDF document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // Add custom fonts if needed
      // doc.addFont('fonts/Roboto-Regular.ttf', 'Roboto', 'normal');
      // doc.addFont('fonts/Roboto-Bold.ttf', 'Roboto', 'bold');
      
      // Set margins
      const margin = 20; // mm
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      
      // Start position
      let yPos = margin;
      
      // Add title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("MEETING MINUTES", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;
      
      // Add meeting name
      doc.setFontSize(14);
      doc.text(meeting.name, pageWidth / 2, yPos, { align: "center" });
      yPos += 15;
      
      // Add meeting details
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      
      // Date
      doc.text(`Date: ${formatDate(meeting.date)}`, margin, yPos);
      yPos += 6;
      
      // Location
      if (meeting.location) {
        doc.text(`Location: ${meeting.location}`, margin, yPos);
        yPos += 6;
      }
      
      // Chairperson
      if (meeting.chairperson) {
        doc.text(`Chairperson: ${meeting.chairperson.first_name} ${meeting.chairperson.last_name}`, margin, yPos);
        yPos += 6;
      }
      
      // Minute taker
      if (meeting.minute_taker) {
        doc.text(`Minute Taker: ${meeting.minute_taker.first_name} ${meeting.minute_taker.last_name}`, margin, yPos);
        yPos += 10;
      }
      
      // ATTENDANCE section
      yPos += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("ATTENDANCE", margin, yPos);
      yPos += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      
      // Members present
      if (meeting.members_present && meeting.members_present.length > 0) {
        const membersText = `Members Present: ${meeting.members_present.map(m => m.name).join(', ')}`;
        const splitMembers = doc.splitTextToSize(membersText, contentWidth);
        doc.text(splitMembers, margin, yPos);
        yPos += splitMembers.length * 6;
      }
      
      // Guests present
      if (meeting.guests_present && meeting.guests_present.length > 0) {
        yPos += 5;
        const guestsText = `Guests Present: ${meeting.guests_present.map(g => g.name).join(', ')}`;
        const splitGuests = doc.splitTextToSize(guestsText, contentWidth);
        doc.text(splitGuests, margin, yPos);
        yPos += splitGuests.length * 6;
      }
      
      // AGENDA AND MINUTES section
      yPos += 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("AGENDA AND MINUTES", margin, yPos);
      yPos += 10;
      
      // Process each agenda item
      for (const item of agendaItems) {
        // Check if we need a new page
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }
        
        // Agenda item title
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${item.item_number}. ${item.item_name}`, margin, yPos);
        yPos += 8;
        
        // Item details
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        // Create a table for item metadata
        const tableData = [];
        
        // Type
        tableData.push([`Type: ${getAgendaItemTypeLabel(item.type)}`]);
        
        // Owner
        if (item.owner) {
          tableData.push([`Owner: ${item.owner.first_name} ${item.owner.last_name}`]);
        }
        
        // Duration
        if (item.duration) {
          tableData.push([`Duration: ${item.duration} minutes`]);
        }
        
        // Add the table
        (doc as any).autoTable({
          startY: yPos,
          body: tableData,
          theme: 'plain',
          styles: {
            fontSize: 10,
            cellPadding: {top: 1, right: 5, bottom: 1, left: margin + 5},
            lineColor: [200, 200, 200],
            lineWidth: 0,
          },
          margin: { left: margin },
          tableWidth: contentWidth,
        });
        
        yPos = (doc as any).lastAutoTable.finalY + 5;
        
        // Minutes content
        if (item.minutes_content) {
          // Clean HTML content
          const cleanContent = item.minutes_content
            .replace(/<p>/g, '')
            .replace(/<\/p>/g, '\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]*>?/gm, '') // Remove remaining HTML tags
            .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
            .replace(/\n\s*\n/g, '\n\n') // Remove extra blank lines
            .trim();
          
          const splitContent = doc.splitTextToSize(cleanContent, contentWidth);
          
          // Check if we need a new page
          if (yPos + splitContent.length * 5 > pageHeight - 30) {
            doc.addPage();
            yPos = margin;
          }
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(splitContent, margin, yPos);
          yPos += splitContent.length * 5 + 5;
        }
        
        // Decision
        if (item.minutes_decision) {
          // Check if we need a new page
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = margin;
          }
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("Decision:", margin, yPos);
          
          doc.setFont("helvetica", "normal");
          const splitDecision = doc.splitTextToSize(item.minutes_decision, contentWidth - 20);
          doc.text(splitDecision, margin + 20, yPos);
          yPos += splitDecision.length * 5 + 5;
        }
        
        // Tasks
        if (item.minutes_tasks) {
          // Check if we need a new page
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = margin;
          }
          
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("Tasks:", margin, yPos);
          
          doc.setFont("helvetica", "normal");
          const splitTasks = doc.splitTextToSize(item.minutes_tasks, contentWidth - 20);
          doc.text(splitTasks, margin + 20, yPos);
          yPos += splitTasks.length * 5 + 5;
        }
        
        // Add space between items
        yPos += 8;
      }
      
      // Add page numbers
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
      }
      
      // Save the PDF
      doc.save(`${meeting.name.replace(/\s+/g, '_')}_Minutes.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('Failed to generate PDF. Please try again.');
    }
  };

  // Helper function to get agenda item type label
  const getAgendaItemTypeLabel = (type: string): string => {
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

  // Filter members based on search term
  const filteredMembers = members.filter(member => {
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase()) || 
           (member.email && member.email.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-3xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-700/50">
        <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-b border-slate-600/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <FileText className="text-blue-400" size={24} />
            </div>
            <h2 className="text-2xl font-bold text-white">Share Meeting Minutes</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
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
          
          {success && (
            <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-300">{success}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Meeting Minutes</h3>
              <button
                onClick={handleDownloadMinutes}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-slate-700 to-slate-600 text-white rounded-lg hover:from-slate-600 hover:to-slate-500 transition-all shadow-lg hover:shadow-xl"
              >
                <Download size={18} />
                Download Minutes
              </button>
            </div>

            <div className="p-5 rounded-xl bg-gradient-to-br from-slate-800/60 to-slate-700/40 border border-slate-600/50">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Meeting Details</h4>
              <p className="text-white font-semibold text-lg">{meeting.name}</p>
              <p className="text-slate-300 mt-1">{formatDate(meeting.date)}</p>
              {meeting.location && <p className="text-slate-300">{meeting.location}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Recipients
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="all-members"
                    checked={recipientType === 'all'}
                    onChange={() => setRecipientType('all')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                  />
                  <label htmlFor="all-members" className="text-slate-300 flex items-center gap-2">
                    <Users size={16} className="text-blue-400" />
                    All {associationId ? 'Association' : 'Club'} Members ({members.length})
                  </label>
                </div>

                {committeeMembers.length > 0 && (
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      id="committee-members"
                      checked={recipientType === 'committee'}
                      onChange={() => setRecipientType('committee')}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                    />
                    <label htmlFor="committee-members" className="text-slate-300 flex items-center gap-2">
                      <Shield size={16} className="text-amber-400" />
                      Committee Members ({committeeMembers.length})
                    </label>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="selected-members"
                    checked={recipientType === 'selected'}
                    onChange={() => setRecipientType('selected')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                  />
                  <label htmlFor="selected-members" className="text-slate-300">
                    Selected Members ({selectedMembers.length})
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    id="individual-member"
                    checked={recipientType === 'individual'}
                    onChange={() => setRecipientType('individual')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600 rounded"
                  />
                  <label htmlFor="individual-member" className="text-slate-300">
                    Individual Member
                  </label>
                </div>
                
                {recipientType === 'individual' && (
                  <div className="ml-7">
                    <MemberSelect
                      members={members}
                      value={individualRecipient}
                      onChange={setIndividualRecipient}
                      placeholder="Select a member"
                      allowEmpty={false}
                    />
                  </div>
                )}
                
                {recipientType === 'selected' && (
                  <div className="ml-7 mt-2">
                    <div className="mb-2">
                      <div className="relative">
                        <Search 
                          size={18} 
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />
                        <input
                          type="text"
                          placeholder="Search members..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 placeholder-slate-400 rounded-lg"
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-60 overflow-y-auto border border-slate-600 rounded-lg">
                      {loading ? (
                        <div className="text-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className="text-center py-4 text-slate-400">
                          No members found
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-700/50">
                          {filteredMembers.map(member => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between p-4 hover:bg-slate-700/30 transition-colors cursor-pointer"
                              onClick={() => toggleMemberSelection(member.id)}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Avatar
                                  firstName={member.first_name}
                                  lastName={member.last_name}
                                  imageUrl={member.avatar_url}
                                  size="md"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-white truncate">
                                    {member.first_name} {member.last_name}
                                  </div>
                                  {member.email && (
                                    <div className="text-sm text-slate-400 truncate">
                                      {member.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                <input
                                  type="checkbox"
                                  checked={selectedMembers.includes(member.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleMemberSelection(member.id);
                                  }}
                                  className="h-5 w-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedMembers.length > 0 && (
                      <div className="mt-2 text-sm text-slate-400">
                        {selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter email subject"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your message"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-8 py-6 bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-t border-slate-600/50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleShareMinutes}
            disabled={sending}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl font-medium"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span>Share Minutes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};