import React, { useState, useEffect } from 'react';
import { X, Mail, Search, Users, Check, TriangleAlert as AlertTriangle, Send, Download, FileText, Shield } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Member } from '../../types/member';
import { Meeting, MeetingAgendaItem } from '../../types/meeting';
import { formatDate } from '../../utils/date';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Avatar } from '../ui/Avatar';
import { MemberSelect } from '../ui/MemberSelect';
import { useAuth } from '../../contexts/AuthContext';

interface ShareMinutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  meeting: Meeting;
  agendaItems: MeetingAgendaItem[];
  clubId?: string;
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
  const { currentClub } = useAuth();
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
  const [clubName, setClubName] = useState('');
  const [clubLogo, setClubLogo] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchClubData();
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

  const fetchClubData = async () => {
    try {
      if (associationId && associationType) {
        const assocTable = associationType === 'state' ? 'state_associations' : 'national_associations';
        const { data } = await supabase.from(assocTable).select('name, logo').eq('id', associationId).maybeSingle();
        if (data) {
          setClubName(data.name || '');
          setClubLogo(data.logo || null);
        }
      } else if (clubId) {
        const { data } = await supabase.from('clubs').select('name, logo').eq('id', clubId).maybeSingle();
        if (data) {
          setClubName(data.name || '');
          setClubLogo(data.logo || null);
        }
      }
    } catch (err) {
      console.error('Error fetching club data:', err);
      setClubName(currentClub?.name || '');
    }
  };

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

      const meetingDate = meeting.date
        ? new Date(meeting.date).toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
        : '';

      const meetingTime = meeting.start_time
        ? new Date(`2000-01-01T${meeting.start_time}`).toLocaleTimeString('en-AU', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          })
        : '';

      const orgName = clubName || currentClub?.name || 'Your Organisation';

      const { error: sendError } = await supabase.functions.invoke('send-notification', {
        body: {
          type: 'meeting_minutes',
          club_id: clubId,
          recipients: formattedRecipients,
          subject: subject,
          body: message,
          send_email: true,
          link_url: `/meetings`,
          club_name: orgName,
          club_logo: clubLogo,
          meeting_name: meeting.name,
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          meeting_location: meeting.location || ''
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

  const handleDownloadMinutes = async () => {
    try {
      setError(null);

      let logoDataUrl = '';
      if (clubLogo) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        if (supabaseUrl && clubLogo.includes(supabaseUrl)) {
          try {
            const pathMatch = clubLogo.match(/\/storage\/v1\/object\/(?:public|sign)\/([^?]+)/);
            if (pathMatch) {
              const fullPath = decodeURIComponent(pathMatch[1]);
              const slashIdx = fullPath.indexOf('/');
              const bucket = fullPath.substring(0, slashIdx);
              const filePath = fullPath.substring(slashIdx + 1);
              const { data } = await supabase.storage.from(bucket).download(filePath);
              if (data) {
                logoDataUrl = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(data);
                });
              }
            }
          } catch (_) {}
        }
        if (!logoDataUrl) {
          try {
            const resp = await fetch(clubLogo);
            if (resp.ok) {
              const blob = await resp.blob();
              logoDataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch (_) {}
        }
      }

      const orgName = clubName || 'Organisation';
      const meetingDate = formatDate(meeting.date);
      const chairName = meeting.chairperson ? `${meeting.chairperson.first_name} ${meeting.chairperson.last_name}` : '';
      const minuteTakerName = meeting.minute_taker ? `${meeting.minute_taker.first_name} ${meeting.minute_taker.last_name}` : '';
      const presentList = meeting.members_present?.map(m => m.name).join(', ') || '';
      const guestsList = meeting.guests_present?.map(g => g.name).join(', ') || '';

      const buildAgendaHTML = () => {
        return agendaItems.map(item => {
          const ownerName = item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : '';
          const typeLabel = getAgendaItemTypeLabel(item.type);

          let minutesHTML = '';
          if (item.minutes_content) {
            const cleaned = item.minutes_content
              .replace(/class="[^"]*"/g, '')
              .replace(/style="[^"]*"/g, '');
            minutesHTML = `<div class="minutes-content">${cleaned}</div>`;
          }

          let decisionHTML = '';
          if (item.minutes_decision) {
            const cleanDecision = item.minutes_decision
              .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            decisionHTML = `
              <div class="decision-box">
                <div class="decision-label">DECISION</div>
                <div class="decision-text">${cleanDecision}</div>
              </div>`;
          }

          let tasksHTML = '';
          if (item.minutes_tasks) {
            const cleanTasks = item.minutes_tasks
              .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            tasksHTML = `
              <div class="action-box">
                <div class="action-label">ACTION ITEMS</div>
                <div class="action-text">${cleanTasks}</div>
              </div>`;
          }

          const metaItems = [];
          if (ownerName) metaItems.push(`<span class="meta-item"><strong>Owner:</strong> ${ownerName}</span>`);
          if (typeLabel) metaItems.push(`<span class="meta-item"><strong>Type:</strong> ${typeLabel}</span>`);
          if (item.duration) metaItems.push(`<span class="meta-item"><strong>Duration:</strong> ${item.duration} min</span>`);

          return `
            <div class="agenda-item">
              <div class="agenda-header">
                <div class="agenda-number">${item.item_number}</div>
                <div class="agenda-title">${item.item_name}</div>
              </div>
              ${metaItems.length > 0 ? `<div class="agenda-meta">${metaItems.join('<span class="meta-sep">|</span>')}</div>` : ''}
              ${minutesHTML}
              ${decisionHTML}
              ${tasksHTML}
            </div>`;
        }).join('');
      };

      const fullHTML = `
        <div class="minutes-header">
          ${logoDataUrl ? `<img class="org-logo" src="${logoDataUrl}" />` : ''}
          <div class="org-name">${orgName}</div>
          <div class="doc-title">Meeting Minutes</div>
          <div class="meeting-name">${meeting.name}</div>
          <div class="header-line"></div>
        </div>
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">Date</div>
            <div class="info-value">${meetingDate}</div>
          </div>
          ${meeting.location ? `
          <div class="info-card">
            <div class="info-label">Location</div>
            <div class="info-value">${meeting.location}</div>
          </div>` : ''}
          ${chairName ? `
          <div class="info-card">
            <div class="info-label">Chairperson</div>
            <div class="info-value">${chairName}</div>
          </div>` : ''}
          ${minuteTakerName ? `
          <div class="info-card">
            <div class="info-label">Minute Taker</div>
            <div class="info-value">${minuteTakerName}</div>
          </div>` : ''}
        </div>
        ${presentList ? `
        <div class="attendance-section">
          <div class="section-heading">Attendance</div>
          <div class="attendance-block">
            <div class="attendance-label">Members Present (${meeting.members_present?.length || 0})</div>
            <div class="attendance-names">${presentList}</div>
          </div>
          ${guestsList ? `
          <div class="attendance-block" style="margin-top: 8px;">
            <div class="attendance-label">Guests Present</div>
            <div class="attendance-names">${guestsList}</div>
          </div>` : ''}
        </div>` : ''}
        <div class="agenda-section">
          <div class="section-heading">Agenda &amp; Minutes</div>
          ${buildAgendaHTML()}
        </div>`;

      const A4_WIDTH_PX = 794;
      const A4_HEIGHT_PX = 1123;
      const SCALE = 2;
      const MARGIN_MM = 20;
      const FOOTER_HEIGHT_MM = 14;
      const CONTENT_HEIGHT_MM = 297 - MARGIN_MM - MARGIN_MM - FOOTER_HEIGHT_MM;
      const paddingPx = Math.round((MARGIN_MM / 210) * A4_WIDTH_PX);

      const documentStyles = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, html { background: white; }
        .pdf-page {
          width: ${A4_WIDTH_PX}px;
          background: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          color: #1a1a1a;
        }
        .minutes-header { text-align: center; margin-bottom: 20px; }
        .org-logo { display: block; margin: 0 auto 12px; max-width: 80px; max-height: 80px; object-fit: contain; }
        .org-name { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 4px; }
        .doc-title { font-size: 26px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
        .meeting-name { font-size: 16px; font-weight: 500; color: #475569; margin-bottom: 12px; }
        .header-line { width: 60px; height: 3px; background: #0ea5e9; margin: 0 auto; border-radius: 2px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
        .info-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 2px; }
        .info-value { font-size: 13px; font-weight: 500; color: #1e293b; }
        .section-heading { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; padding-bottom: 8px; border-bottom: 2px solid #0ea5e9; margin-bottom: 14px; }
        .attendance-section { margin-bottom: 20px; }
        .attendance-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
        .attendance-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
        .attendance-names { font-size: 12.5px; color: #334155; line-height: 1.6; }
        .agenda-section { margin-bottom: 10px; }
        .agenda-item { margin-bottom: 16px; border-left: 3px solid #e2e8f0; padding-left: 14px; }
        .agenda-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
        .agenda-number { font-size: 22px; font-weight: 700; color: #0ea5e9; line-height: 1; min-width: 28px; }
        .agenda-title { font-size: 15px; font-weight: 700; color: #0f172a; }
        .agenda-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; padding: 4px 0; }
        .meta-item { font-size: 11px; color: #64748b; }
        .meta-item strong { color: #475569; font-weight: 600; }
        .meta-sep { color: #cbd5e1; font-size: 10px; margin: 0 2px; }
        .minutes-content { font-size: 12.5px; color: #334155; line-height: 1.65; }
        .minutes-content p { margin-bottom: 8px; }
        .minutes-content strong, .minutes-content b { font-weight: 700; color: #1e293b; }
        .minutes-content em, .minutes-content i { font-style: italic; }
        .minutes-content ul, .minutes-content ol { margin-left: 20px; margin-bottom: 8px; }
        .minutes-content li { margin-bottom: 2px; }
        .decision-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 14px; margin-top: 8px; }
        .decision-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #16a34a; margin-bottom: 4px; }
        .decision-text { font-size: 12.5px; color: #166534; line-height: 1.5; }
        .action-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-top: 8px; }
        .action-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #2563eb; margin-bottom: 4px; }
        .action-text { font-size: 12.5px; color: #1e40af; line-height: 1.5; }
        .pdf-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
        .pdf-footer-org { font-weight: 500; }
        .pdf-footer-page { font-weight: 500; }
      `;

      const measuringContainer = document.createElement('div');
      measuringContainer.style.position = 'absolute';
      measuringContainer.style.left = '-9999px';
      measuringContainer.style.top = '0';

      const styleEl = document.createElement('style');
      styleEl.textContent = documentStyles;
      measuringContainer.appendChild(styleEl);

      const measurePage = document.createElement('div');
      measurePage.className = 'pdf-page';
      measurePage.style.padding = `${paddingPx}px`;
      measurePage.innerHTML = `<div class="pdf-content">${fullHTML}</div>`;
      measuringContainer.appendChild(measurePage);
      document.body.appendChild(measuringContainer);

      try {
        const images = measuringContainer.getElementsByTagName('img');
        await Promise.all(
          Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 5000);
            });
          })
        );

        const contentAreaHeightPx = Math.round((CONTENT_HEIGHT_MM / 297) * A4_HEIGHT_PX);
        const contentDiv = measurePage.querySelector('.pdf-content');
        const allBlockElements: HTMLElement[] = [];

        if (contentDiv) {
          const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|TABLE|HR|PRE|SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|FIGURE)$/;
          const collectLeafBlocks = (parent: Element) => {
            Array.from(parent.children).forEach(child => {
              const el = child as HTMLElement;
              if (!el.tagName) return;
              const tag = el.tagName.toUpperCase();
              const display = getComputedStyle(el).display;
              if (display === 'none') return;
              if (display === 'inline' || display === 'inline-block') return;

              if (tag === 'UL' || tag === 'OL') {
                Array.from(el.children).forEach(li => {
                  const liEl = li as HTMLElement;
                  if (liEl.tagName?.toUpperCase() === 'LI') allBlockElements.push(liEl);
                });
                return;
              }

              let hasBlockChildren = false;
              for (const ch of Array.from(el.children)) {
                const chEl = ch as HTMLElement;
                if (!chEl.tagName) continue;
                const chTag = chEl.tagName.toUpperCase();
                const chDisplay = getComputedStyle(chEl).display;
                if (chDisplay === 'block' || chDisplay === 'list-item' || chDisplay === 'flex' || chDisplay === 'grid' ||
                    BLOCK_TAGS.test(chTag) || chTag === 'UL' || chTag === 'OL' || chTag === 'LI') {
                  hasBlockChildren = true;
                  break;
                }
              }
              if (hasBlockChildren) collectLeafBlocks(el);
              else if (display === 'block' || display === 'list-item' || display === 'grid' || display === 'flex' || BLOCK_TAGS.test(tag)) allBlockElements.push(el);
            });
          };
          collectLeafBlocks(contentDiv);
        }

        const measureRect = measurePage.getBoundingClientRect();
        const contentOrigin = measureRect.top + paddingPx;
        const breakOffsets: number[] = [0];
        let nextBoundary = contentAreaHeightPx;

        for (const el of allBlockElements) {
          const rect = el.getBoundingClientRect();
          const elTop = rect.top - contentOrigin;
          const elBottom = rect.bottom - contentOrigin;

          if (elBottom > nextBoundary - 4 && elTop > breakOffsets[breakOffsets.length - 1] + 4) {
            breakOffsets.push(elTop);
            nextBoundary = elTop + contentAreaHeightPx;
          }
          if (el.offsetHeight > contentAreaHeightPx && elTop >= breakOffsets[breakOffsets.length - 1]) {
            let extra = breakOffsets[breakOffsets.length - 1] + contentAreaHeightPx;
            while (extra < elBottom) {
              breakOffsets.push(extra);
              extra += contentAreaHeightPx;
            }
            nextBoundary = extra;
          }
        }

        const totalPages = breakOffsets.length;
        document.body.removeChild(measuringContainer);

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
          if (pageNum > 0) pdf.addPage();
          const pageOffset = breakOffsets[pageNum];

          const pageContainer = document.createElement('div');
          pageContainer.style.position = 'absolute';
          pageContainer.style.left = '-9999px';
          pageContainer.style.top = '0';

          const pageStyle = document.createElement('style');
          pageStyle.textContent = documentStyles;
          pageContainer.appendChild(pageStyle);

          const pageDiv = document.createElement('div');
          pageDiv.className = 'pdf-page';
          pageDiv.style.width = `${A4_WIDTH_PX}px`;
          pageDiv.style.height = `${A4_HEIGHT_PX}px`;
          pageDiv.style.padding = `${paddingPx}px`;
          pageDiv.style.position = 'relative';
          pageDiv.style.overflow = 'hidden';

          const contentWrapper = document.createElement('div');
          contentWrapper.style.position = 'relative';
          contentWrapper.style.top = `-${pageOffset}px`;
          contentWrapper.style.width = '100%';
          contentWrapper.innerHTML = `<div class="pdf-content">${fullHTML}</div>`;

          const nextOffset = pageNum < totalPages - 1 ? breakOffsets[pageNum + 1] : pageOffset + contentAreaHeightPx;
          const clipHeight = Math.min(nextOffset - pageOffset, contentAreaHeightPx);

          const clipper = document.createElement('div');
          clipper.style.overflow = 'hidden';
          clipper.style.height = `${clipHeight}px`;
          clipper.appendChild(contentWrapper);
          pageDiv.appendChild(clipper);

          const footer = document.createElement('div');
          footer.className = 'pdf-footer';
          footer.style.position = 'absolute';
          footer.style.bottom = `${paddingPx}px`;
          footer.style.left = `${paddingPx}px`;
          footer.style.right = `${paddingPx}px`;
          footer.innerHTML = `<span class="pdf-footer-org">${orgName} &mdash; ${meeting.name}</span><span class="pdf-footer-page">Page ${pageNum + 1} of ${totalPages}</span>`;
          pageDiv.appendChild(footer);

          pageContainer.appendChild(pageDiv);
          document.body.appendChild(pageContainer);

          const pageImages = pageContainer.getElementsByTagName('img');
          await Promise.all(
            Array.from(pageImages).map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 5000);
              });
            })
          );

          const canvas = await html2canvas(pageDiv, {
            scale: SCALE,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: A4_WIDTH_PX,
            height: A4_HEIGHT_PX
          });

          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, `page-${pageNum}`, 'FAST');
          document.body.removeChild(pageContainer);
        }

        pdf.save(`${meeting.name.replace(/\s+/g, '_')}_Minutes.pdf`);
      } catch (err) {
        const leftover = document.querySelector('[style*="-9999px"]');
        if (leftover) leftover.remove();
        throw err;
      }
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
        <div className="flex items-center justify-between px-8 py-6 from-slate-800/80 to-slate-700/80 border-b border-slate-600/50">
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
                className="btn-primary-green flex items-center gap-2 px-4 py-2.5 from-slate-700 to-slate-600 text-white rounded-lg hover:from-slate-600 hover:to-slate-500 transition-all shadow-lg hover:shadow-xl"
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

        <div className="flex justify-end gap-3 px-8 py-6 from-slate-800/80 to-slate-700/80 border-t border-slate-600/50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleShareMinutes}
            disabled={sending}
            className="btn-primary-green flex items-center gap-2 px-6 py-2.5 from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl font-medium"
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