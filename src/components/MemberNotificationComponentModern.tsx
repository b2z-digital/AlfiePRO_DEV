import React, { useState, useEffect, useRef } from 'react';
import { Mail, Send, Inbox, Search, X, Plus, Users, Trash2, ChevronRight, Reply, Forward, FileText, Sparkles, Circle, Archive, Flag, Folder, PanelLeftClose, PanelLeft, Star, MoreHorizontal, RefreshCw, Paperclip, Download, ListChecks } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { supabase } from '../utils/supabase';
import { RichTextEditor } from './communications/RichTextEditor';
import EmojiPicker from 'emoji-picker-react';
import { useNotifications } from '../contexts/NotificationContext';
import { ConfirmationModal } from './ConfirmationModal';

interface Notification {
  id: string;
  user_id: string;
  club_id: string | null;
  type: string;
  subject: string;
  body: string;
  read: boolean;
  sent_at: string;
  email_status: string;
  email_error_message: string | null;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  recipient_name?: string;
  recipient_avatar_url?: string;
  is_starred?: boolean;
  is_archived?: boolean;
  labels?: string[];
  read_at?: string | null;
  opened_at?: string | null;
  reactions?: any[];
  parent_id?: string | null;
  thread_id?: string | null;
  is_rich_text?: boolean;
  club_name?: string;
  link_url?: string | null;
}

interface Member {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

interface MarketingList {
  id: string;
  name: string;
  total_contacts: number;
  active_subscriber_count: number;
}

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface MemberNotificationComponentModernProps {
  darkMode: boolean;
  initialShowCompose?: boolean;
}

export const MemberNotificationComponentModern: React.FC<MemberNotificationComponentModernProps> = ({ darkMode, initialShowCompose = false }) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { isImpersonating, effectiveUserId, effectiveProfile: impersonatedProfile } = useImpersonation();
  const contextId = currentOrganization?.id || currentClub?.clubId;
  const { addNotification } = useNotifications();
  const viewingUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;

  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'drafts'>('inbox');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sentNotifications, setSentNotifications] = useState<Notification[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showCompose, setShowCompose] = useState(initialShowCompose);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [useRichText, setUseRichText] = useState(true);
  const [showMembersList, setShowMembersList] = useState(false);
  const [externalEmailInput, setExternalEmailInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const editorRef = useRef<any>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [replyMode, setReplyMode] = useState<'reply' | 'forward' | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{show: boolean; id: string | null; isSent?: boolean}>({show: false, id: null});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([]);
  const [showMarketingLists, setShowMarketingLists] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [listMemberEmails, setListMemberEmails] = useState<Map<string, string[]>>(new Map());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  const [composeForm, setComposeForm] = useState({
    recipients: [] as string[],
    externalEmails: [] as string[],
    subject: '',
    body: '',
    scheduled_send_at: null as string | null,
    notification_type: 'message',
    send_email: false
  });

  const [nonMemberRecipients, setNonMemberRecipients] = useState<Map<string, { id: string; first_name: string; last_name: string; email: string; avatar_url?: string }>>(new Map());
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  } | null>(null);

  // Load sidebar preference from database
  useEffect(() => {
    const loadSidebarPreference = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('ui_preferences')
          .eq('id', user.id)
          .maybeSingle();

        if (data?.ui_preferences?.comms_sidebar_collapsed !== undefined) {
          setSidebarCollapsed(data.ui_preferences.comms_sidebar_collapsed);
        }
      } catch (err) {
        console.error('Error loading sidebar preference:', err);
      }
    };

    loadSidebarPreference();
  }, [user?.id]);

  useEffect(() => {
    if (viewingUserId) {
      fetchNotifications();
      fetchMembers();
      fetchCurrentUserProfile();
      fetchDrafts();
      fetchMarketingLists();
    }
  }, [contextId, viewingUserId]);

  // Fetch non-member recipient details when recipients change
  useEffect(() => {
    const fetchNonMemberRecipients = async () => {
      const nonMemberIds = composeForm.recipients.filter(id =>
        !members.some(m => m.user_id === id)
      );

      if (nonMemberIds.length === 0) return;

      const newNonMembers = new Map(nonMemberRecipients);

      for (const id of nonMemberIds) {
        if (newNonMembers.has(id)) continue;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, avatar_url')
          .eq('id', id)
          .maybeSingle();

        if (profile) {
          let firstName = profile.first_name;
          let lastName = profile.last_name;
          let avatarUrl = profile.avatar_url;

          if (!firstName || !lastName || !avatarUrl) {
            const { data: application } = await supabase
              .from('membership_applications')
              .select('application_data')
              .eq('user_id', id)
              .eq('club_id', contextId)
              .maybeSingle();

            if (application?.application_data) {
              firstName = firstName || application.application_data.firstName;
              lastName = lastName || application.application_data.lastName;
              avatarUrl = avatarUrl || application.application_data.avatarUrl;
            }
          }

          newNonMembers.set(id, {
            id: profile.id,
            first_name: firstName || '',
            last_name: lastName || '',
            email: profile.email || '',
            avatar_url: avatarUrl
          });
        }
      }

      setNonMemberRecipients(newNonMembers);
    };

    fetchNonMemberRecipients();
  }, [composeForm.recipients, members, contextId]);

  const fetchCurrentUserProfile = async () => {
    if (isImpersonating && impersonatedProfile) {
      setCurrentUserProfile({
        first_name: impersonatedProfile.firstName,
        last_name: impersonatedProfile.lastName,
        avatar_url: impersonatedProfile.avatarUrl || undefined,
      });
      return;
    }

    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();

      if (error) throw error;
      setCurrentUserProfile(data);
    } catch (err) {
      console.error('Error fetching current user profile:', err);
    }
  };

  const getSenderName = () => {
    if (currentUserProfile?.first_name || currentUserProfile?.last_name) {
      return `${currentUserProfile.first_name || ''} ${currentUserProfile.last_name || ''}`.trim();
    }
    return user?.email || 'Unknown Sender';
  };

  const fetchNotifications = async () => {
    if (!viewingUserId) return;

    try {
      setLoading(true);

      const { data: inboxData, error: inboxError } = await supabase
        .from('notifications')
        .select('*, clubs(name)')
        .eq('user_id', viewingUserId)
        .order('sent_at', { ascending: false });

      const { data: sentData, error: sentError } = await supabase
        .from('notifications')
        .select('*, clubs(name)')
        .eq('sender_id', viewingUserId)
        .order('sent_at', { ascending: false });

      if (inboxError) throw inboxError;
      if (sentError) throw sentError;

      if (inboxData || sentData) {
        const allUserIds = new Set<string>();

        inboxData?.forEach(n => {
          if (n.sender_id) allUserIds.add(n.sender_id);
          if (n.user_id) allUserIds.add(n.user_id);
        });
        sentData?.forEach(n => {
          if (n.user_id) allUserIds.add(n.user_id);
        });

        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', Array.from(allUserIds));

        const profileMap = new Map(profilesData?.map(p => [p.id, p]) || []);

        const enrichedInbox = (inboxData || []).map(notification => {
          const senderProfile = notification.sender_id ? profileMap.get(notification.sender_id) : null;
          return {
            ...notification,
            sender_name: senderProfile ? `${senderProfile.first_name || ''} ${senderProfile.last_name || ''}`.trim() : null,
            sender_avatar_url: senderProfile?.avatar_url,
            club_name: (notification as any).clubs?.name
          };
        });

        const enrichedSent = (sentData || []).map(notification => {
          const recipientProfile = profileMap.get(notification.user_id);
          return {
            ...notification,
            sender_name: getSenderName(),
            sender_avatar_url: currentUserProfile?.avatar_url,
            recipient_name: recipientProfile ? `${recipientProfile.first_name || ''} ${recipientProfile.last_name || ''}`.trim() : null,
            recipient_avatar_url: recipientProfile?.avatar_url,
            club_name: (notification as any).clubs?.name
          };
        });

        setNotifications(enrichedInbox);
        setSentNotifications(enrichedSent);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      addNotification('error', 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!contextId) return;

    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, user_id, first_name, last_name, email, avatar_url')
        .eq('club_id', contextId)
        .order('first_name');

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const fetchDrafts = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('notification_drafts')
        .select('*, clubs(name)')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (err) {
      console.error('Error fetching drafts:', err);
    }
  };

  const fetchMarketingLists = async () => {
    if (!contextId) return;
    try {
      const { data, error } = await supabase
        .from('marketing_subscriber_lists')
        .select('id, name, total_contacts, active_subscriber_count')
        .eq('club_id', contextId)
        .order('name');
      if (error) {
        console.warn('Table query failed for marketing lists, trying RPC fallback:', error);
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_club_subscriber_lists', { p_club_id: contextId });
        if (rpcError) {
          console.error('RPC fallback also failed:', rpcError);
          return;
        }
        setMarketingLists((rpcData || []).map((l: any) => ({
          id: l.id,
          name: l.name,
          total_contacts: l.total_contacts,
          active_subscriber_count: l.active_subscriber_count
        })));
        return;
      }
      setMarketingLists(data || []);
    } catch (err) {
      console.error('Error fetching marketing lists:', err);
    }
  };

  const loadListMembers = async (listId: string) => {
    try {
      const { data, error } = await supabase
        .from('marketing_list_members')
        .select('email, first_name, last_name')
        .eq('list_id', listId)
        .eq('status', 'active');
      if (error) throw error;
      const emails = (data || []).map(m => m.email).filter(Boolean);
      setListMemberEmails(prev => new Map(prev).set(listId, emails));
      return emails;
    } catch (err) {
      console.error('Error loading list members:', err);
      return [];
    }
  };

  const handleToggleList = async (listId: string) => {
    if (selectedListIds.includes(listId)) {
      setSelectedListIds(prev => prev.filter(id => id !== listId));
      const emails = listMemberEmails.get(listId) || [];
      setComposeForm(prev => ({
        ...prev,
        externalEmails: prev.externalEmails.filter(e => !emails.includes(e))
      }));
    } else {
      setSelectedListIds(prev => [...prev, listId]);
      let emails = listMemberEmails.get(listId);
      if (!emails) {
        emails = await loadListMembers(listId);
      }
      const memberEmails = members.map(m => m.email);
      const existingEmails = new Set(composeForm.externalEmails);
      const newEmails = emails.filter(e => !existingEmails.has(e) && !memberEmails.includes(e));
      if (newEmails.length > 0) {
        setComposeForm(prev => ({
          ...prev,
          externalEmails: [...prev.externalEmails, ...newEmails]
        }));
      }
    }
  };

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingAttachment(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          addNotification('error', `File "${file.name}" exceeds 10MB limit`);
          continue;
        }
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${contextId}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(path, file);

        if (uploadError) {
          addNotification('error', `Failed to upload "${file.name}"`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('message-attachments')
          .getPublicUrl(path);

        setAttachments(prev => [...prev, {
          name: file.name,
          url: urlData.publicUrl,
          size: file.size,
          type: file.type
        }]);
      }
    } catch (err) {
      console.error('Error uploading attachment:', err);
      addNotification('error', 'Failed to upload file');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sendNotification = async () => {
    if ((composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0) || !composeForm.subject || !composeForm.body) {
      addNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSending(true);

      const selectedRecipients = composeForm.recipients;
      const recipientsData = [];
      const allExternalEmails = new Set(composeForm.externalEmails);

      for (const id of selectedRecipients) {
        const member = members.find(m => m.user_id === id);

        if (member) {
          recipientsData.push({
            id: member.id,
            user_id: member.user_id,
            email: member.email,
            name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || 'Unknown'
          });
        } else {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email')
            .eq('id', id)
            .maybeSingle();

          if (profile) {
            recipientsData.push({
              id: profile.id,
              user_id: id,
              email: profile.email,
              name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Unknown'
            });
          }
        }
      }

      for (const member of members) {
        if (!member.user_id && member.email && composeForm.recipients.includes(`email:${member.id}`)) {
          allExternalEmails.add(member.email);
        }
      }

      for (const email of allExternalEmails) {
        const memberMatch = members.find(m => m.email === email);
        recipientsData.push({
          id: null,
          user_id: null,
          email: email,
          name: memberMatch ? `${memberMatch.first_name || ''} ${memberMatch.last_name || ''}`.trim() || email : email
        });
      }

      const hasExternalOnly = allExternalEmails.size > 0 && selectedRecipients.filter(id => !id.startsWith('email:')).length === 0;

      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          recipients: recipientsData,
          subject: composeForm.subject,
          body: composeForm.body,
          type: composeForm.notification_type,
          club_id: contextId,
          send_email: hasExternalOnly ? true : composeForm.send_email,
          skip_notifications: hasExternalOnly,
          sender_name: getSenderName(),
          sender_avatar: currentUserProfile?.avatar_url || user?.user_metadata?.avatar_url,
          club_name: currentClub?.club?.name || currentOrganization?.name,
          sender_first_name: currentUserProfile?.first_name || user?.user_metadata?.first_name || '',
          sender_last_name: currentUserProfile?.last_name || user?.user_metadata?.last_name || '',
          attachments: attachments.length > 0 ? attachments : undefined
        }
      });

      if (error) throw error;

      const totalRecipients = recipientsData.length;
      addNotification('success', `Message sent to ${totalRecipients} recipient(s)`);

      if (currentDraftId) {
        await supabase
          .from('notification_drafts')
          .delete()
          .eq('id', currentDraftId);
        await fetchDrafts();
      }

      clearCompose();
      setActiveTab('sent');
      await fetchNotifications();
    } catch (err) {
      console.error('Error sending notification:', err);
      addNotification('error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const clearCompose = () => {
    setComposeForm({
      recipients: [],
      externalEmails: [],
      subject: '',
      body: '',
      send_email: false,
      scheduled_send_at: null,
      notification_type: 'message'
    });
    setExternalEmailInput('');
    setCurrentDraftId(null);
    setReplyMode(null);
    setShowCompose(false);
    setShowMembersList(false);
    setAttachments([]);
    setSelectedListIds([]);
    setMemberSearchTerm('');
    setShowMarketingLists(false);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const confirmDelete = (notificationId: string, isSent: boolean = false) => {
    setDeleteConfirmation({ show: true, id: notificationId, isSent });
  };

  const handleDeleteNotification = async () => {
    const { id: notificationId, isSent } = deleteConfirmation;
    if (!notificationId) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      if (isSent) {
        setSentNotifications(prev => prev.filter(n => n.id !== notificationId));
      } else {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }

      addNotification('success', 'Message deleted successfully');
      setSelectedNotification(null);
      setDeleteConfirmation({ show: false, id: null });
    } catch (err) {
      console.error('Error deleting notification:', err);
      addNotification('error', 'Failed to delete message');
    }
  };

  const loadDraft = (draft: any) => {
    setComposeForm({
      recipients: draft.recipients || [],
      externalEmails: [],
      subject: draft.subject || '',
      body: draft.body || '',
      send_email: draft.send_email !== false,
      scheduled_send_at: null,
      notification_type: draft.type || 'message'
    });
    setUseRichText(draft.is_rich_text !== false);
    setCurrentDraftId(draft.id);
    setShowCompose(true);
  };

  const handleReply = (notification: Notification) => {
    if (!notification.sender_id) return;

    setComposeForm({
      recipients: [notification.sender_id],
      externalEmails: [],
      subject: notification.subject.startsWith('Re: ') ? notification.subject : `Re: ${notification.subject}`,
      body: `\n\n\n\n---\nOn ${new Date(notification.sent_at).toLocaleString()}, ${notification.sender_name} wrote:\n${notification.body}`,
      send_email: true,
      scheduled_send_at: null,
      notification_type: 'message'
    });
    setReplyMode('reply');
    setShowCompose(true);

    // Set cursor position at the start after a short delay to ensure editor is ready
    setTimeout(() => {
      if (editorRef.current?.editor) {
        editorRef.current.editor.commands.focus('start');
      }
    }, 100);
  };

  const handleForward = (notification: Notification) => {
    setComposeForm({
      recipients: [],
      externalEmails: [],
      subject: notification.subject.startsWith('Fwd: ') ? notification.subject : `Fwd: ${notification.subject}`,
      body: `\n\n\n\n---\nForwarded message from ${notification.sender_name || 'Unknown'} on ${new Date(notification.sent_at).toLocaleString()}:\n\nSubject: ${notification.subject}\n\n${notification.body}`,
      send_email: true,
      scheduled_send_at: null,
      notification_type: 'message'
    });
    setReplyMode('forward');
    setShowCompose(true);

    // Set cursor position at the start after a short delay to ensure editor is ready
    setTimeout(() => {
      if (editorRef.current?.editor) {
        editorRef.current.editor.commands.focus('start');
      }
    }, 100);
  };

  const handleArchive = async (notification: Notification) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_archived: true })
        .eq('id', notification.id);

      if (error) throw error;

      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setSelectedNotification(null);
      addNotification('success', 'Message archived');
    } catch (err) {
      console.error('Error archiving notification:', err);
      addNotification('error', 'Failed to archive message');
    }
  };

  const handleToggleStar = async (notification: Notification) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_starred: !notification.is_starred })
        .eq('id', notification.id);

      if (error) throw error;

      setNotifications(prev => prev.map(n =>
        n.id === notification.id ? { ...n, is_starred: !n.is_starred } : n
      ));
      setSentNotifications(prev => prev.map(n =>
        n.id === notification.id ? { ...n, is_starred: !n.is_starred } : n
      ));
      if (selectedNotification?.id === notification.id) {
        setSelectedNotification({ ...selectedNotification, is_starred: !selectedNotification.is_starred });
      }
      addNotification('success', notification.is_starred ? 'Star removed' : 'Message starred');
    } catch (err) {
      console.error('Error toggling star:', err);
      addNotification('error', 'Failed to update message');
    }
  };

  const handleRefresh = () => {
    fetchNotifications();
    fetchMembers();
    addNotification('success', 'Messages refreshed');
  };

  const handleToggleSidebar = async () => {
    const newCollapsedState = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsedState);

    // Save preference to database
    if (user?.id) {
      try {
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('ui_preferences')
          .eq('id', user.id)
          .maybeSingle();

        const currentPreferences = currentProfile?.ui_preferences || {};

        await supabase
          .from('profiles')
          .update({
            ui_preferences: {
              ...currentPreferences,
              comms_sidebar_collapsed: newCollapsedState
            }
          })
          .eq('id', user.id);
      } catch (err) {
        console.error('Error saving sidebar preference:', err);
      }
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = notifications.filter(n =>
    n.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (n.sender_name && n.sender_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredSentNotifications = sentNotifications.filter(n =>
    n.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    n.body.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const UserAvatar = ({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string; size?: number }) => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={name}
          className="rounded-full object-cover flex-shrink-0"
          style={{ width: size, height: size }}
        />
      );
    }

    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-medium bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initials}
      </div>
    );
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const currentList = activeTab === 'inbox' ? filteredNotifications : activeTab === 'sent' ? filteredSentNotifications : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Mail className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Communications</h1>
            <p className="text-slate-400">Send and receive messages with your club members</p>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div className="w-64 border-r border-slate-700/50 flex flex-col bg-slate-900/30 backdrop-blur-sm flex-shrink-0">
          {/* Navigation */}
          <nav className="flex-1 px-3 pt-4 space-y-1">
          <button
            onClick={() => setActiveTab('inbox')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeTab === 'inbox'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}
            `}
          >
            <Inbox size={20} />
            <span className="flex-1 text-left font-medium">Inbox</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeTab === 'sent'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}
            `}
          >
            <Send size={20} />
            <span className="flex-1 text-left font-medium">Sent</span>
          </button>

          <button
            onClick={() => setActiveTab('drafts')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all
              ${activeTab === 'drafts'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'}
            `}
          >
            <FileText size={20} />
            <span className="flex-1 text-left font-medium">Drafts</span>
            {drafts.length > 0 && (
              <span className="px-2 py-0.5 bg-slate-600 text-slate-300 text-xs rounded-full">
                {drafts.length}
              </span>
            )}
          </button>
        </nav>

        {/* Quick Stats */}
        <div className="p-4 border-t border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Total Messages</span>
            <span className="text-white font-medium">{notifications.length}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Unread</span>
            <span className="text-blue-400 font-medium">{unreadCount}</span>
          </div>
        </div>
      </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${sidebarCollapsed ? 'pl-4' : ''}`}>
        {/* Header with Toolbar */}
        <div className="border-b border-slate-700/50 bg-slate-900/30 backdrop-blur-sm">
          {/* Top Bar - Search and Compose */}
          <div className="px-6 py-3 border-b border-slate-700/30">
            <div className="flex items-center gap-3">
              {/* Sidebar Toggle */}
              <button
                onClick={handleToggleSidebar}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
              >
                {sidebarCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
              </button>

              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border bg-slate-800/50 border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <button
                onClick={() => setShowCompose(true)}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/30 transition-all hover:scale-[1.02] font-medium whitespace-nowrap text-sm animate-pulse"
              >
                <Plus size={18} />
                Compose
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          {selectedNotification && (
            <div className="px-6 py-2 flex items-center gap-2">
              <button
                onClick={() => handleReply(selectedNotification)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Reply"
                disabled={!selectedNotification.sender_id}
              >
                <Reply size={18} />
              </button>
              <button
                onClick={() => handleForward(selectedNotification)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Forward"
              >
                <Forward size={18} />
              </button>
              <button
                onClick={() => handleArchive(selectedNotification)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Archive"
              >
                <Archive size={18} />
              </button>
              <button
                onClick={() => setDeleteConfirmation({ show: true, id: selectedNotification.id, isSent: activeTab === 'sent' })}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={() => handleToggleStar(selectedNotification)}
                className="p-2 text-slate-400 hover:text-yellow-400 hover:bg-slate-800/50 rounded-lg transition-colors"
                title={selectedNotification.is_starred ? "Remove star" : "Star message"}
              >
                <Star size={18} className={selectedNotification.is_starred ? 'fill-yellow-400 text-yellow-400' : ''} />
              </button>

              <div className="h-6 w-px bg-slate-700/50 mx-1"></div>

              <button
                onClick={handleRefresh}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          )}
        </div>

        {/* Messages List/Detail View */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Message List */}
          <div className={`${selectedNotification ? 'w-96' : 'flex-1'} border-r border-slate-700/50 overflow-y-auto bg-slate-800/30 backdrop-blur-sm`}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : activeTab === 'drafts' ? (
              drafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                    <FileText size={28} className="text-slate-500" />
                  </div>
                  <p className="text-slate-400 font-medium mb-1">No drafts</p>
                  <p className="text-sm text-slate-500">Your drafts will appear here</p>
                </div>
              ) : (
                <div>
                  {drafts.map((draft) => (
                    <div
                      key={draft.id}
                      onClick={() => loadDraft(draft)}
                      className="px-6 py-4 border-b border-slate-700/30 cursor-pointer transition-all hover:bg-slate-800/40"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <FileText size={20} className="text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-semibold text-white">
                              {draft.subject || 'No subject'}
                            </p>
                            <span className="text-xs text-slate-500">
                              {formatTimeAgo(draft.updated_at)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 line-clamp-2">
                            {draft.body?.replace(/<[^>]*>/g, '') || 'Empty draft'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                  {activeTab === 'inbox' ? <Inbox size={28} className="text-slate-500" /> : <Send size={28} className="text-slate-500" />}
                </div>
                <p className="text-slate-400 font-medium mb-1">No messages</p>
                <p className="text-sm text-slate-500">
                  {searchTerm ? 'Try a different search' : activeTab === 'inbox' ? 'Your inbox is empty' : 'No sent messages'}
                </p>
              </div>
            ) : (
              <div>
                {currentList.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      setSelectedNotification(notification);
                      if (!notification.read && activeTab === 'inbox') {
                        markAsRead(notification.id);
                      }
                    }}
                    className={`
                      px-6 py-4 border-b border-slate-700/30 cursor-pointer transition-all hover:bg-slate-800/40
                      ${selectedNotification?.id === notification.id ? 'bg-slate-800/50 border-l-4 border-l-blue-500' : ''}
                      ${!notification.read && activeTab === 'inbox' ? 'bg-slate-800/20' : ''}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        name={activeTab === 'sent' ? (notification.recipient_name || 'Unknown') : (notification.sender_name || 'System')}
                        avatarUrl={activeTab === 'sent' ? notification.recipient_avatar_url : notification.sender_avatar_url}
                        size={48}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <p className={`font-semibold truncate ${!notification.read && activeTab === 'inbox' ? 'text-white' : 'text-slate-300'}`}>
                              {activeTab === 'sent' ? (notification.recipient_name || 'Unknown') : (notification.sender_name || 'System')}
                            </p>
                            {notification.is_starred && (
                              <Star size={14} className="fill-yellow-400 text-yellow-400 flex-shrink-0" />
                            )}
                          </div>
                          <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                            {formatTimeAgo(notification.sent_at)}
                          </span>
                        </div>
                        <p className={`text-sm mb-1 ${!notification.read && activeTab === 'inbox' ? 'text-white font-medium' : 'text-slate-400'}`}>
                          {notification.subject}
                        </p>
                        <p className="text-sm text-slate-500 line-clamp-1">
                          {notification.body.replace(/<[^>]*>/g, '')}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          {!notification.read && activeTab === 'inbox' && (
                            <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
                              <Circle size={8} className="fill-blue-400" />
                              <span>Unread</span>
                            </div>
                          )}
                          {notification.club_name && (
                            <div className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/30 rounded text-xs text-cyan-400">
                              {notification.club_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message Detail */}
          {selectedNotification && (
            <div className="flex-1 overflow-y-auto bg-slate-800/30 backdrop-blur-sm">
              <div className="max-w-4xl mx-auto p-8">
                <div className="mb-8">
                  <div className="flex items-start justify-between mb-6">
                    <h1 className="text-2xl font-bold text-white">
                      {selectedNotification.subject}
                    </h1>
                    <button
                      onClick={() => setSelectedNotification(null)}
                      className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex items-center gap-4">
                    <UserAvatar
                      name={selectedNotification.sender_name || 'System'}
                      avatarUrl={selectedNotification.sender_avatar_url}
                      size={56}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-semibold text-lg">
                          {selectedNotification.sender_name || 'System'}
                        </p>
                        {selectedNotification.club_name && (
                          <div className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded text-xs text-cyan-400">
                            {selectedNotification.club_name}
                          </div>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm">
                        {new Date(selectedNotification.sent_at).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none">
                  <div
                    className="text-slate-300 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: selectedNotification.body }}
                  />
                </div>

                {selectedNotification.link_url && (
                  <div className="mt-6">
                    <a
                      href={selectedNotification.link_url}
                      target={selectedNotification.link_url.startsWith('http') ? '_blank' : undefined}
                      rel={selectedNotification.link_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl font-medium text-sm"
                    >
                      <ChevronRight size={16} />
                      View Item
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-8 pt-8 border-t border-slate-700/50">
                  {activeTab === 'inbox' && (
                    <>
                      <button
                        onClick={() => {
                          setReplyMode('reply');
                          setComposeForm({
                            ...composeForm,
                            recipients: selectedNotification.sender_id ? [selectedNotification.sender_id] : [],
                            subject: `Re: ${selectedNotification.subject}`
                          });
                          setShowCompose(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Reply size={16} />
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setReplyMode('forward');
                          setComposeForm({
                            ...composeForm,
                            recipients: [],
                            subject: `Fwd: ${selectedNotification.subject}`,
                            body: selectedNotification.body
                          });
                          setShowCompose(true);
                          setShowMembersList(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        <Forward size={16} />
                        Forward
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => confirmDelete(selectedNotification.id, activeTab === 'sent')}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors ml-auto"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-slate-700/50 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 p-6 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/95 backdrop-blur-xl z-10">
              <h2 className="text-xl font-bold text-white">New Message</h2>
              <button
                onClick={clearCompose}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Recipients */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">To</label>

                {/* External Email Input */}
                {replyMode !== 'reply' && (
                  <div className="mb-3">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={externalEmailInput}
                        onChange={(e) => setExternalEmailInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && externalEmailInput.trim()) {
                            e.preventDefault();
                            const email = externalEmailInput.trim();
                            if (email && !composeForm.externalEmails.includes(email)) {
                              setComposeForm({
                                ...composeForm,
                                externalEmails: [...composeForm.externalEmails, email]
                              });
                              setExternalEmailInput('');
                            }
                          }
                        }}
                        placeholder="Add external email address (press Enter)"
                        className="flex-1 px-4 py-2.5 rounded-lg border bg-slate-900/50 border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => {
                          const email = externalEmailInput.trim();
                          if (email && !composeForm.externalEmails.includes(email)) {
                            setComposeForm({
                              ...composeForm,
                              externalEmails: [...composeForm.externalEmails, email]
                            });
                            setExternalEmailInput('');
                          }
                        }}
                        className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        Add
                      </button>
                    </div>

                    {composeForm.externalEmails.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {composeForm.externalEmails.map((email, index) => (
                          <div key={index} className="flex items-center gap-2 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                            <Mail size={16} className="text-purple-400 flex-shrink-0" />
                            <span className="text-white text-sm flex-1">{email}</span>
                            <button
                              onClick={() => {
                                setComposeForm({
                                  ...composeForm,
                                  externalEmails: composeForm.externalEmails.filter((_, i) => i !== index)
                                });
                              }}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Members Selection */}
                <div>
                  <button
                    onClick={() => setShowMembersList(!showMembersList)}
                    className="flex items-center justify-between w-full px-4 py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={18} />
                      <span className="font-medium">Club Members</span>
                      <span className="text-xs text-slate-400">
                        ({composeForm.recipients.length} selected)
                      </span>
                    </div>
                    <ChevronRight size={18} className={`transition-transform ${showMembersList ? 'rotate-90' : ''}`} />
                  </button>

                  {showMembersList && (
                    <div className="mt-3 space-y-3 border border-slate-700 rounded-lg p-4 bg-slate-900/30">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={memberSearchTerm}
                          onChange={(e) => setMemberSearchTerm(e.target.value)}
                          placeholder="Search members..."
                          className="w-full pl-9 pr-4 py-2 rounded-lg border bg-slate-900/50 border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const allIds = members.map(m => m.user_id ? m.user_id : `email:${m.id}`);
                            setComposeForm({ ...composeForm, recipients: allIds });
                          }}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          Select All
                        </button>
                        <button
                          onClick={() => setComposeForm({ ...composeForm, recipients: [] })}
                          className="px-3 py-1.5 text-xs bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                        >
                          Clear All
                        </button>
                      </div>

                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {Array.from(nonMemberRecipients.values()).map((profile) => (
                          <div
                            key={profile.id}
                            className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg"
                          >
                            <UserAvatar
                              name={`${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Unknown'}
                              avatarUrl={profile.avatar_url}
                              size={32}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium">
                                {`${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Unknown'}
                              </p>
                              <p className="text-slate-400 text-xs truncate">{profile.email}</p>
                              <p className="text-blue-400 text-xs">Pending Applicant</p>
                            </div>
                            <button
                              onClick={() => {
                                setComposeForm({
                                  ...composeForm,
                                  recipients: composeForm.recipients.filter(id => id !== profile.id)
                                });
                                const newNonMembers = new Map(nonMemberRecipients);
                                newNonMembers.delete(profile.id);
                                setNonMemberRecipients(newNonMembers);
                              }}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}

                        {members
                          .filter(m => {
                            if (replyMode === 'reply') return !!m.user_id;
                            if (m.user_id && nonMemberRecipients.has(m.user_id)) return false;
                            if (!memberSearchTerm) return true;
                            const term = memberSearchTerm.toLowerCase();
                            return (
                              (m.first_name || '').toLowerCase().includes(term) ||
                              (m.last_name || '').toLowerCase().includes(term) ||
                              (m.email || '').toLowerCase().includes(term)
                            );
                          })
                          .map((member) => {
                            const recipientKey = member.user_id ? member.user_id : `email:${member.id}`;
                            const isEmailOnly = !member.user_id;
                            return (
                              <label
                                key={member.id}
                                className="flex items-center gap-3 p-3 hover:bg-slate-700/30 cursor-pointer transition-colors rounded-lg"
                              >
                                <input
                                  type="checkbox"
                                  checked={composeForm.recipients.includes(recipientKey)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setComposeForm({
                                        ...composeForm,
                                        recipients: [...composeForm.recipients, recipientKey]
                                      });
                                    } else {
                                      setComposeForm({
                                        ...composeForm,
                                        recipients: composeForm.recipients.filter(id => id !== recipientKey)
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 text-green-600 rounded flex-shrink-0"
                                />
                                <UserAvatar
                                  name={`${member.first_name} ${member.last_name}`}
                                  avatarUrl={member.avatar_url}
                                  size={32}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium truncate">
                                    {member.first_name} {member.last_name}
                                  </p>
                                  <p className="text-slate-400 text-xs truncate">{member.email}</p>
                                  {isEmailOnly && (
                                    <p className="text-amber-400 text-xs">Email only</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Marketing Lists */}
                {marketingLists.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowMarketingLists(!showMarketingLists)}
                      className="flex items-center justify-between w-full px-4 py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <ListChecks size={18} />
                        <span className="font-medium">Subscriber Lists</span>
                        {selectedListIds.length > 0 && (
                          <span className="text-xs text-green-400">
                            ({selectedListIds.length} list{selectedListIds.length !== 1 ? 's' : ''} selected)
                          </span>
                        )}
                      </div>
                      <ChevronRight size={18} className={`transition-transform ${showMarketingLists ? 'rotate-90' : ''}`} />
                    </button>

                    {showMarketingLists && (
                      <div className="mt-3 space-y-2 border border-slate-700 rounded-lg p-4 bg-slate-900/30 max-h-48 overflow-y-auto">
                        {marketingLists.map((list) => (
                          <label
                            key={list.id}
                            className="flex items-center gap-3 p-3 hover:bg-slate-700/30 cursor-pointer transition-colors rounded-lg"
                          >
                            <input
                              type="checkbox"
                              checked={selectedListIds.includes(list.id)}
                              onChange={() => handleToggleList(list.id)}
                              className="w-4 h-4 text-green-600 rounded flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{list.name}</p>
                              <p className="text-slate-400 text-xs">
                                {list.active_subscriber_count || list.total_contacts || 0} subscriber{(list.active_subscriber_count || list.total_contacts || 0) !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-slate-400 mt-2">
                  {composeForm.recipients.length + composeForm.externalEmails.length} recipient(s) selected
                </p>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
                <input
                  type="text"
                  value={composeForm.subject}
                  onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border bg-slate-900/50 border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter subject..."
                />
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-300">Message</label>
                  <button
                    onClick={() => setUseRichText(!useRichText)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  >
                    <Sparkles size={14} />
                    {useRichText ? 'Plain text' : 'Rich text'}
                  </button>
                </div>

                {useRichText ? (
                  <RichTextEditor
                    content={composeForm.body}
                    onChange={(content) => setComposeForm({ ...composeForm, body: content })}
                    placeholder="Write your message..."
                    darkMode={darkMode}
                    onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    editorRef={editorRef}
                    emojiButtonRef={emojiButtonRef}
                  />
                ) : (
                  <textarea
                    value={composeForm.body}
                    onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-3 rounded-lg border bg-slate-900/50 border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Type your message..."
                  />
                )}

                {showEmojiPicker && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowEmojiPicker(false)}
                  >
                    <div
                      ref={emojiPickerRef}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EmojiPicker
                        onEmojiClick={(emoji) => {
                          if (useRichText && editorRef.current) {
                            editorRef.current.chain().focus().insertContent(emoji.emoji).run();
                          } else {
                            setComposeForm({ ...composeForm, body: composeForm.body + emoji.emoji });
                          }
                          setShowEmojiPicker(false);
                        }}
                        theme={darkMode ? ('dark' as any) : ('light' as any)}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleAttachFile}
                  className="hidden"
                />
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Paperclip size={16} />
                    {uploadingAttachment ? 'Uploading...' : 'Attach Files'}
                  </button>
                  <span className="text-xs text-slate-500">Max 10MB per file</span>
                </div>
                {attachments.length > 0 && (
                  <div className="space-y-1.5">
                    {attachments.map((att, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-2 bg-slate-700/30 border border-slate-700/50 rounded-lg">
                        <FileText size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="text-sm text-white truncate flex-1">{att.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">{formatFileSize(att.size)}</span>
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="p-0.5 text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Options */}
              {composeForm.recipients.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Notification Type</label>
                    <select
                      value={composeForm.notification_type}
                      onChange={(e) => setComposeForm({ ...composeForm, notification_type: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border bg-slate-900/50 border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="message">General Message</option>
                      <option value="club_news">Club News</option>
                      <option value="race_results">Race Results</option>
                      <option value="membership">Membership</option>
                      <option value="alert">Alert</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={composeForm.send_email}
                      onChange={(e) => setComposeForm({ ...composeForm, send_email: e.target.checked })}
                      className="rounded border-slate-600 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm">Also send as email</span>
                  </label>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 p-6 border-t border-slate-700/50 flex items-center justify-between bg-slate-800/95 backdrop-blur-xl">
              <button
                onClick={clearCompose}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={sendNotification}
                disabled={sending || !composeForm.subject || !composeForm.body || (composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0)}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/30 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 font-medium"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Message
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <ConfirmationModal
          isOpen={deleteConfirmation.show}
          onClose={() => setDeleteConfirmation({ show: false, id: null })}
          onConfirm={handleDeleteNotification}
          title="Delete Message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          darkMode={darkMode}
          variant="danger"
        />
      )}
    </div>
  );
};

export default MemberNotificationComponentModern;
