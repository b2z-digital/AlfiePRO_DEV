import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { supabase, getOrCreateChannel, removeChannelByName } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';
import { ConversationsSidebar, SidebarTab, TopLevelTab, ChatConversation } from './ConversationsSidebar';
import { ConversationThread } from './ConversationThread';
import { ComposeModal } from './ComposeModal';
import { ChatView } from './ChatView';
import { NewChatModal } from './NewChatModal';

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

interface ConversationsProps {
  darkMode: boolean;
  initialShowCompose?: boolean;
  initialRecipientId?: string;
  initialChatWith?: string;
  initialChatName?: string;
  initialChatAvatar?: string;
  initialTab?: TopLevelTab;
}

export const Conversations: React.FC<ConversationsProps> = ({
  darkMode,
  initialShowCompose = false,
  initialRecipientId,
  initialChatWith,
  initialChatName,
  initialChatAvatar,
  initialTab,
}) => {
  const { user, currentClub, currentOrganization } = useAuth();
  const { isImpersonating, effectiveUserId, effectiveProfile: impersonatedProfile } = useImpersonation();
  const contextId = currentOrganization?.id || currentClub?.clubId;
  const { addNotification } = useNotifications();
  const viewingUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;

  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>(initialTab || 'inbox');
  const [activeTab, setActiveTab] = useState<SidebarTab>('inbox');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sentNotifications, setSentNotifications] = useState<Notification[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showCompose, setShowCompose] = useState(initialShowCompose);
  const [showNewChat, setShowNewChat] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [useRichText, setUseRichText] = useState(true);
  const editorRef = useRef<any>(null);
  const [replyMode, setReplyMode] = useState<'reply' | 'forward' | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; id: string | null; isSent?: boolean }>({ show: false, id: null });
  const [deleteChatConfirmation, setDeleteChatConfirmation] = useState<{ show: boolean; chatId: string | null }>({ show: false, chatId: null });
  const [marketingLists, setMarketingLists] = useState<MarketingList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [listMemberEmails, setListMemberEmails] = useState<Map<string, string[]>>(new Map());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatConversation | null>(null);
  const [directChatTarget, setDirectChatTarget] = useState<{ id: string; name: string; avatar?: string } | null>(
    initialChatWith && initialChatName ? { id: initialChatWith, name: initialChatName, avatar: initialChatAvatar } : null
  );

  const [composeForm, setComposeForm] = useState({
    recipients: [] as string[],
    externalEmails: [] as string[],
    subject: '',
    body: '',
    scheduled_send_at: null as string | null,
    notification_type: 'message',
    send_email: false,
  });

  const [nonMemberRecipients, setNonMemberRecipients] = useState<Map<string, { id: string; first_name: string; last_name: string; email: string; avatar_url?: string }>>(new Map());
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  } | null>(null);

  useEffect(() => {
    if (viewingUserId) {
      fetchNotifications();
      fetchMembers();
      fetchCurrentUserProfile();
      fetchDrafts();
      fetchMarketingLists();
      fetchChatConversations();
    }
  }, [contextId, viewingUserId]);

  useEffect(() => {
    if (initialRecipientId && initialShowCompose) {
      setComposeForm(prev => ({
        ...prev,
        recipients: prev.recipients.includes(initialRecipientId) ? prev.recipients : [...prev.recipients, initialRecipientId],
      }));
    }
  }, [initialRecipientId, initialShowCompose]);

  useEffect(() => {
    if (initialChatWith && initialChatName) {
      setTopLevelTab('chats');
      setDirectChatTarget({ id: initialChatWith, name: initialChatName, avatar: initialChatAvatar });
    }
  }, [initialChatWith, initialChatName, initialChatAvatar]);

  useEffect(() => {
    if (!viewingUserId) return;
    const channelName = `chats-list-${viewingUserId}`;
    getOrCreateChannel(channelName, (ch) =>
      ch.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
      }, () => {
        fetchChatConversations();
      }).on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_messages',
      }, () => {
        fetchChatConversations();
      }).subscribe()
    );
    return () => { removeChannelByName(channelName); };
  }, [viewingUserId]);

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
            avatar_url: avatarUrl,
          });
        }
      }
      setNonMemberRecipients(newNonMembers);
    };
    fetchNonMemberRecipients();
  }, [composeForm.recipients, members, contextId]);

  const fetchChatConversations = useCallback(async () => {
    if (!viewingUserId) return;
    try {
      const { data: myParticipations, error: partErr } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at, hidden_at, hidden_message_id')
        .eq('user_id', viewingUserId);

      if (partErr || !myParticipations || myParticipations.length === 0) {
        setChatConversations([]);
        return;
      }

      const convIds = myParticipations.map(p => p.conversation_id);
      const lastReadMap = new Map(myParticipations.map(p => [p.conversation_id, p.last_read_at]));
      const hiddenAtMap = new Map(myParticipations.map(p => [p.conversation_id, p.hidden_at]));

      const { data: conversations, error: convErr } = await supabase
        .from('conversations')
        .select('id, last_message_text, last_message_at, last_message_sender_id')
        .in('id', convIds)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (convErr || !conversations) {
        setChatConversations([]);
        return;
      }

      const visibleConversations = conversations.filter(conv => {
        const hiddenAt = hiddenAtMap.get(conv.id);
        if (!hiddenAt) return true;
        if (!conv.last_message_at) return false;
        return new Date(conv.last_message_at) > new Date(hiddenAt);
      });

      if (visibleConversations.length === 0) {
        setChatConversations([]);
        return;
      }

      const visibleIds = visibleConversations.map(c => c.id);

      const { data: allParticipants } = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_id')
        .in('conversation_id', visibleIds)
        .neq('user_id', viewingUserId);

      const otherUserIds = new Set((allParticipants || []).map(p => p.user_id));
      const participantMap = new Map<string, string>();
      (allParticipants || []).forEach(p => {
        participantMap.set(p.conversation_id, p.user_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .in('id', Array.from(otherUserIds));

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      const chatList: ChatConversation[] = visibleConversations.map(conv => {
        const otherUserId = participantMap.get(conv.id) || '';
        const profile = profileMap.get(otherUserId);
        const lastRead = lastReadMap.get(conv.id);
        const isUnread = conv.last_message_at
          ? (!lastRead || new Date(conv.last_message_at) > new Date(lastRead))
            && conv.last_message_sender_id !== viewingUserId
          : false;

        return {
          id: conv.id,
          last_message_text: conv.last_message_text || '',
          last_message_at: conv.last_message_at,
          last_message_sender_id: conv.last_message_sender_id,
          participant_name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
          participant_avatar: profile?.avatar_url || undefined,
          participant_id: otherUserId,
          is_unread: isUnread,
        };
      });

      setChatConversations(chatList);
    } catch (err) {
      console.error('Error fetching chat conversations:', err);
    }
  }, [viewingUserId]);

  const handleDeleteChat = async (chatId: string) => {
    setDeleteChatConfirmation({ show: true, chatId });
  };

  const confirmDeleteChat = async () => {
    const chatId = deleteChatConfirmation.chatId;
    if (!chatId || !viewingUserId) return;

    try {
      const { data: lastMsg } = await supabase
        .from('conversation_messages')
        .select('id')
        .eq('conversation_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      await supabase
        .from('conversation_participants')
        .update({
          hidden_at: new Date().toISOString(),
          hidden_message_id: lastMsg?.id || null,
        })
        .eq('conversation_id', chatId)
        .eq('user_id', viewingUserId);

      setChatConversations(prev => prev.filter(c => c.id !== chatId));
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        setDirectChatTarget(null);
      }
      setDeleteChatConfirmation({ show: false, chatId: null });
    } catch (err) {
      console.error('Error hiding chat:', err);
      addNotification('error', 'Failed to delete chat');
    }
  };

  const handleNewChatSelect = (userId: string, name: string, avatar?: string) => {
    setDirectChatTarget({ id: userId, name, avatar });
    setSelectedChat(null);
    setSelectedNotification(null);
    setTopLevelTab('chats');
  };

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
        inboxData?.forEach(n => { if (n.sender_id) allUserIds.add(n.sender_id); if (n.user_id) allUserIds.add(n.user_id); });
        sentData?.forEach(n => { if (n.user_id) allUserIds.add(n.user_id); });

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
            club_name: (notification as any).clubs?.name,
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
            club_name: (notification as any).clubs?.name,
          };
        });

        setNotifications(enrichedInbox);
        setSentNotifications(enrichedSent);
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      addNotification('error', 'Failed to load conversations');
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
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_club_subscriber_lists', { p_club_id: contextId });
        if (rpcError) return;
        setMarketingLists((rpcData || []).map((l: any) => ({
          id: l.id, name: l.name, total_contacts: l.total_contacts, active_subscriber_count: l.active_subscriber_count,
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
      return [];
    }
  };

  const handleToggleList = async (listId: string) => {
    if (selectedListIds.includes(listId)) {
      setSelectedListIds(prev => prev.filter(id => id !== listId));
      const emails = listMemberEmails.get(listId) || [];
      setComposeForm(prev => ({
        ...prev,
        externalEmails: prev.externalEmails.filter(e => !emails.includes(e)),
      }));
    } else {
      setSelectedListIds(prev => [...prev, listId]);
      let emails = listMemberEmails.get(listId);
      if (!emails) emails = await loadListMembers(listId);
      const memberEmails = members.map(m => m.email);
      const existingEmails = new Set(composeForm.externalEmails);
      const newEmails = emails.filter(e => !existingEmails.has(e) && !memberEmails.includes(e));
      if (newEmails.length > 0) {
        setComposeForm(prev => ({ ...prev, externalEmails: [...prev.externalEmails, ...newEmails] }));
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
        const { error: uploadError } = await supabase.storage.from('message-attachments').upload(path, file);
        if (uploadError) { addNotification('error', `Failed to upload "${file.name}"`); continue; }
        const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(path);
        setAttachments(prev => [...prev, { name: file.name, url: urlData.publicUrl, size: file.size, type: file.type }]);
      }
    } catch (err) {
      addNotification('error', 'Failed to upload file');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const sendNotification = async () => {
    if ((composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0) || !composeForm.subject || !composeForm.body) {
      addNotification('error', 'Please fill in all required fields');
      return;
    }
    try {
      setSending(true);
      const recipientsData: any[] = [];
      const allExternalEmails = new Set(composeForm.externalEmails);

      for (const id of composeForm.recipients) {
        const member = members.find(m => m.user_id === id);
        if (member) {
          recipientsData.push({
            id: member.id, user_id: member.user_id, email: member.email,
            name: `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email || 'Unknown',
          });
        } else {
          const { data: profile } = await supabase.from('profiles').select('id, first_name, last_name, email').eq('id', id).maybeSingle();
          if (profile) {
            recipientsData.push({
              id: profile.id, user_id: id, email: profile.email,
              name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Unknown',
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
          id: null, user_id: null, email,
          name: memberMatch ? `${memberMatch.first_name || ''} ${memberMatch.last_name || ''}`.trim() || email : email,
        });
      }

      const hasExternalOnly = allExternalEmails.size > 0 && composeForm.recipients.filter(id => !id.startsWith('email:')).length === 0;

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
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      });

      if (error) throw error;
      addNotification('success', `Message sent to ${recipientsData.length} recipient(s)`);

      if (currentDraftId) {
        await supabase.from('notification_drafts').delete().eq('id', currentDraftId);
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
      recipients: [], externalEmails: [], subject: '', body: '',
      send_email: false, scheduled_send_at: null, notification_type: 'message',
    });
    setCurrentDraftId(null);
    setReplyMode(null);
    setShowCompose(false);
    setAttachments([]);
    setSelectedListIds([]);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', notificationId);
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleDeleteNotification = async () => {
    const { id: notificationId, isSent } = deleteConfirmation;
    if (!notificationId) return;
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', notificationId);
      if (error) throw error;
      if (isSent) setSentNotifications(prev => prev.filter(n => n.id !== notificationId));
      else setNotifications(prev => prev.filter(n => n.id !== notificationId));
      addNotification('success', 'Message deleted');
      setSelectedNotification(null);
      setDeleteConfirmation({ show: false, id: null });
    } catch (err) {
      addNotification('error', 'Failed to delete message');
    }
  };

  const handleReply = (notification: Notification) => {
    if (!notification.sender_id) return;
    setComposeForm({
      recipients: [notification.sender_id],
      externalEmails: [],
      subject: notification.subject.startsWith('Re: ') ? notification.subject : `Re: ${notification.subject}`,
      body: `\n\n\n\n---\nOn ${new Date(notification.sent_at).toLocaleString()}, ${notification.sender_name} wrote:\n${notification.body}`,
      send_email: true, scheduled_send_at: null, notification_type: 'message',
    });
    setReplyMode('reply');
    setShowCompose(true);
    setTimeout(() => { editorRef.current?.editor?.commands?.focus('start'); }, 100);
  };

  const handleForward = (notification: Notification) => {
    setComposeForm({
      recipients: [],
      externalEmails: [],
      subject: notification.subject.startsWith('Fwd: ') ? notification.subject : `Fwd: ${notification.subject}`,
      body: `\n\n\n\n---\nForwarded message from ${notification.sender_name || 'Unknown'} on ${new Date(notification.sent_at).toLocaleString()}:\n\nSubject: ${notification.subject}\n\n${notification.body}`,
      send_email: true, scheduled_send_at: null, notification_type: 'message',
    });
    setReplyMode('forward');
    setShowCompose(true);
    setTimeout(() => { editorRef.current?.editor?.commands?.focus('start'); }, 100);
  };

  const handleArchive = async (notification: Notification) => {
    try {
      const { error } = await supabase.from('notifications').update({ is_archived: true }).eq('id', notification.id);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setSelectedNotification(null);
      addNotification('success', 'Message archived');
    } catch (err) {
      addNotification('error', 'Failed to archive message');
    }
  };

  const handleToggleStar = async (notification: Notification) => {
    try {
      const { error } = await supabase.from('notifications').update({ is_starred: !notification.is_starred }).eq('id', notification.id);
      if (error) throw error;
      const updater = (n: Notification) => n.id === notification.id ? { ...n, is_starred: !n.is_starred } : n;
      setNotifications(prev => prev.map(updater));
      setSentNotifications(prev => prev.map(updater));
      if (selectedNotification?.id === notification.id) {
        setSelectedNotification({ ...selectedNotification, is_starred: !selectedNotification.is_starred });
      }
    } catch (err) {
      addNotification('error', 'Failed to update message');
    }
  };

  const handleSelect = (notification: Notification) => {
    setSelectedNotification(notification);
    setSelectedChat(null);
    setDirectChatTarget(null);
    if (!notification.read && activeTab === 'inbox') markAsRead(notification.id);
  };

  const handleSelectChat = (chat: ChatConversation) => {
    setSelectedChat(chat);
    setDirectChatTarget(null);
    setSelectedNotification(null);
  };

  const loadDraft = (draft: any) => {
    setComposeForm({
      recipients: draft.recipients || [], externalEmails: [], subject: draft.subject || '',
      body: draft.body || '', send_email: draft.send_email !== false,
      scheduled_send_at: null, notification_type: draft.type || 'message',
    });
    setUseRichText(draft.is_rich_text !== false);
    setCurrentDraftId(draft.id);
    setShowCompose(true);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const unreadChatsCount = chatConversations.filter(c => c.is_unread).length;

  const activeChatTarget = directChatTarget || (selectedChat ? {
    id: selectedChat.participant_id,
    name: selectedChat.participant_name,
    avatar: selectedChat.participant_avatar,
  } : null);

  const showChatView = topLevelTab === 'chats' && activeChatTarget;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="w-[320px] xl:w-[360px] flex-shrink-0 h-full overflow-hidden">
        <ConversationsSidebar
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedNotification(null); }}
          topLevelTab={topLevelTab}
          onTopLevelTabChange={(tab) => {
            setTopLevelTab(tab);
            setSelectedNotification(null);
            setSelectedChat(null);
            setDirectChatTarget(null);
          }}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          notifications={notifications}
          sentNotifications={sentNotifications}
          drafts={drafts}
          selectedId={selectedNotification?.id || null}
          onSelect={handleSelect}
          onLoadDraft={loadDraft}
          onCompose={() => setShowCompose(true)}
          onNewChat={() => setShowNewChat(true)}
          onDeleteChat={handleDeleteChat}
          unreadCount={unreadCount}
          darkMode={darkMode}
          chatConversations={chatConversations}
          selectedChatId={selectedChat?.id || null}
          onSelectChat={handleSelectChat}
          unreadChatsCount={unreadChatsCount}
        />
      </div>

      <div className="flex-1 min-w-0 h-full overflow-hidden">
        {showChatView ? (
          <ChatView
            recipientId={activeChatTarget.id}
            recipientName={activeChatTarget.name}
            recipientAvatar={activeChatTarget.avatar}
            existingConversationId={selectedChat?.id}
            onBack={() => {
              setSelectedChat(null);
              setDirectChatTarget(null);
              fetchChatConversations();
            }}
            darkMode={darkMode}
          />
        ) : topLevelTab === 'chats' ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-3xl bg-slate-700/40 border border-slate-600/50 flex items-center justify-center mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">Select a chat</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Choose a chat from the sidebar, or start a new one.
            </p>
            <button
              onClick={() => setShowNewChat(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/20 text-sm font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Chat
            </button>
          </div>
        ) : selectedNotification ? (
          <ConversationThread
            notification={selectedNotification}
            activeTab={activeTab}
            onClose={() => setSelectedNotification(null)}
            onReply={handleReply}
            onForward={handleForward}
            onStar={handleToggleStar}
            onArchive={handleArchive}
            onDelete={(id, isSent) => setDeleteConfirmation({ show: true, id, isSent })}
            darkMode={darkMode}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-sm">
            <div className="w-20 h-20 rounded-3xl bg-slate-700/40 border border-slate-600/50 flex items-center justify-center mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">Select a conversation</h3>
            <p className="text-sm text-slate-500 max-w-sm">
              Choose a message from the sidebar, or start a new conversation.
            </p>
            <button
              onClick={() => setShowCompose(true)}
              className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/20 text-sm font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Conversation
            </button>
          </div>
        )}
      </div>

      {showCompose && (
        <ComposeModal
          composeForm={composeForm}
          onComposeFormChange={setComposeForm}
          members={members}
          marketingLists={marketingLists}
          nonMemberRecipients={nonMemberRecipients}
          onNonMemberRemove={(id) => {
            setComposeForm(prev => ({ ...prev, recipients: prev.recipients.filter(r => r !== id) }));
            setNonMemberRecipients(prev => { const m = new Map(prev); m.delete(id); return m; });
          }}
          selectedListIds={selectedListIds}
          onToggleList={handleToggleList}
          attachments={attachments}
          onAttachFile={handleAttachFile}
          onRemoveAttachment={(index) => setAttachments(prev => prev.filter((_, i) => i !== index))}
          uploadingAttachment={uploadingAttachment}
          sending={sending}
          replyMode={replyMode}
          onSend={sendNotification}
          onClose={clearCompose}
          darkMode={darkMode}
          useRichText={useRichText}
          onToggleRichText={() => setUseRichText(!useRichText)}
          editorRef={editorRef}
        />
      )}

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onSelectUser={handleNewChatSelect}
          darkMode={darkMode}
        />
      )}

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

      {deleteChatConfirmation.show && (
        <ConfirmationModal
          isOpen={deleteChatConfirmation.show}
          onClose={() => setDeleteChatConfirmation({ show: false, chatId: null })}
          onConfirm={confirmDeleteChat}
          title="Delete Chat"
          message="This will remove the chat from your list. If the other person sends a new message, it will reappear."
          confirmText="Delete"
          cancelText="Cancel"
          darkMode={darkMode}
          variant="danger"
        />
      )}
    </div>
  );
};

export default Conversations;
