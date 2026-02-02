import React, { useState, useEffect, useRef } from 'react';
import { Mail, Send, Inbox, Search, User, Clock, Check, AlertTriangle, X, Plus, Users, Filter, Trash2, ChevronLeft, ChevronRight, Star, Archive, MessageSquare, Smile, Paperclip, Calendar, Sparkles, Reply, Forward, MailCheck, MailX, MailWarning, Trophy, UserCheck, Newspaper, Bell, FileText, Save, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { RichTextEditor } from './communications/RichTextEditor';
import { useRealtime } from './communications/useRealtime';
import { useKeyboardShortcuts, KeyboardShortcutsHelp } from './communications/useKeyboardShortcuts';
import * as commsUtils from './communications/utils';
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
}

interface Member {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

interface MemberNotificationComponentProps {
  darkMode: boolean;
}

export const MemberNotificationComponent: React.FC<MemberNotificationComponentProps> = ({ darkMode }) => {
  const { user, currentClub, currentOrganization } = useAuth();

  // Get current context ID (club or organization)
  const contextId = currentOrganization?.id || currentClub?.clubId;
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'compose' | 'drafts'>('inbox');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [sentNotifications, setSentNotifications] = useState<Notification[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingNotifications, setDeletingNotifications] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<{show: boolean; id: string | null}>({show: false, id: null});
  const [currentPage, setCurrentPage] = useState(1);
  const [notificationsPerPage] = useState(10);
  const [useRichText, setUseRichText] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<any>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [showMembersList, setShowMembersList] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{show: boolean; id: string | null}>({show: false, id: null});
  const [replyMode, setReplyMode] = useState<'reply' | 'forward' | null>(null);
  const [nonMemberRecipients, setNonMemberRecipients] = useState<Map<string, { id: string; first_name: string; last_name: string; email: string; avatar_url?: string }>>(new Map());
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  } | null>(null);

  // Compose form state
  const [composeForm, setComposeForm] = useState({
    recipients: [] as string[],
    externalEmails: [] as string[],
    subject: '',
    body: '',
    scheduled_send_at: null as string | null,
    notification_type: 'message',
    send_email: false
  });
  const [externalEmailInput, setExternalEmailInput] = useState('');

  // Calculate pagination
  const indexOfLastNotification = currentPage * notificationsPerPage;
  const indexOfFirstNotification = indexOfLastNotification - notificationsPerPage;
  const currentNotifications = notifications.slice(indexOfFirstNotification, indexOfLastNotification);
  const totalPages = Math.ceil(notifications.length / notificationsPerPage);

  // Real-time updates
  useRealtime({
    userId: user?.id || '',
    clubId: contextId || '',
    onNewNotification: (notification) => {
      setNotifications(prev => [notification, ...prev]);
    },
    onNotificationUpdated: (notification) => {
      setNotifications(prev => prev.map(n => n.id === notification.id ? notification : n));
    },
    onNotificationDeleted: (id) => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    },
    desktopNotifications: true,
    soundEnabled: true
  });

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCompose: () => setActiveTab('compose'),
    onReply: () => notifications[selectedIndex] && setSelectedNotification(notifications[selectedIndex]),
    onDelete: () => notifications[selectedIndex] && confirmDelete(notifications[selectedIndex].id),
    onStar: () => notifications[selectedIndex] && handleToggleStar(notifications[selectedIndex]),
    onArchive: () => notifications[selectedIndex] && handleToggleArchive(notifications[selectedIndex]),
    onSelectNext: () => setSelectedIndex(i => Math.min(i + 1, notifications.length - 1)),
    onSelectPrevious: () => setSelectedIndex(i => Math.max(i - 1, 0)),
    onOpenSelected: () => notifications[selectedIndex] && setSelectedNotification(notifications[selectedIndex]),
    onSearch: () => searchInputRef.current?.focus(),
    onShowHelp: () => setShowKeyboardHelp(true),
    onEscape: () => setSelectedNotification(null)
  });

  useEffect(() => {
    if (contextId) {
      fetchNotifications();
      fetchMembers();
      fetchCurrentUserProfile();
    }
  }, [contextId, user]);

  // Fetch drafts on component mount
  useEffect(() => {
    if (user?.id && currentClub?.club?.id) {
      fetchDrafts();
    }
  }, [user?.id, currentClub?.club?.id]);

  // Auto-save removed - users must manually save drafts

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
          // Try to get name and avatar from membership application if not in profile
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
            ...profile,
            first_name: firstName,
            last_name: lastName,
            avatar_url: avatarUrl
          });
        }
      }

      if (newNonMembers.size !== nonMemberRecipients.size) {
        setNonMemberRecipients(newNonMembers);
      }
    };

    fetchNonMemberRecipients();
  }, [composeForm.recipients, members]);

  // Emoji picker is now handled by modal overlay click

  const fetchCurrentUserProfile = async () => {
    if (!user) return;
    
    try {
      // First try to get from profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }
      
      // If no profile data, try to get from members table
      if (!profileData?.first_name && contextId) {
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('first_name, last_name')
          .eq('user_id', user.id)
          .eq('club_id', contextId)
          .maybeSingle();
        
        if (memberError && memberError.code !== 'PGRST116') {
          console.error('Error fetching member data:', memberError);
        }
        
        setCurrentUserProfile({
          first_name: memberData?.first_name || user.user_metadata?.first_name || '',
          last_name: memberData?.last_name || user.user_metadata?.last_name || '',
          avatar_url: profileData?.avatar_url || user.user_metadata?.avatar_url || null
        });
      } else {
        setCurrentUserProfile({
          first_name: profileData?.first_name || user.user_metadata?.first_name || '',
          last_name: profileData?.last_name || user.user_metadata?.last_name || '',
          avatar_url: profileData?.avatar_url || user.user_metadata?.avatar_url || null
        });
      }
    } catch (err) {
      console.error('Error fetching current user profile:', err);
      // Fallback to user metadata
      setCurrentUserProfile({
        first_name: user.user_metadata?.first_name || '',
        last_name: user.user_metadata?.last_name || '',
        avatar_url: user.user_metadata?.avatar_url || null
      });
    }
  };

  const fetchNotifications = async () => {
    if (!user || !contextId) return;

    try {
      setLoading(true);

      // Get all clubs and associations the user belongs to
      const [clubsData, stateAssocData, nationalAssocData] = await Promise.all([
        supabase.from('user_clubs').select('club_id').eq('user_id', user.id),
        supabase.from('user_state_associations').select('state_association_id').eq('user_id', user.id),
        supabase.from('user_national_associations').select('national_association_id').eq('user_id', user.id)
      ]);

      const userClubIds = clubsData.data?.map(c => c.club_id) || [];
      const userStateIds = stateAssocData.data?.map(s => s.state_association_id) || [];
      const userNationalIds = nationalAssocData.data?.map(n => n.national_association_id) || [];

      // Fetch inbox notifications (received by current user from ANY of their clubs)
      const { data: inboxData, error: inboxError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .in('club_id', [...userClubIds, ...userStateIds, ...userNationalIds, contextId].filter(Boolean))
        .order('sent_at', { ascending: false });

      if (inboxError) throw inboxError;

      // Fetch sent notifications (if user is admin/editor)
      const { data: userClub } = await supabase
        .from('user_clubs')
        .select('role')
        .eq('user_id', user.id)
        .eq('club_id', contextId)
        .single();

      // Fetch sent notifications (sent by current user)
      const { data: sentData, error: sentError } = await supabase
        .from('notifications')
        .select('*')
        .eq('sender_id', user.id)
        .eq('club_id', contextId)
        .order('sent_at', { ascending: false });

      if (sentError) throw sentError;

      // Get sender and recipient profiles
      const allNotifications = [...(inboxData || []), ...(sentData || [])];
      const senderIds = [...new Set(allNotifications.map(n => n.sender_id).filter(Boolean))];
      const recipientIds = [...new Set(allNotifications.map(n => n.user_id))];
      const allUserIds = [...new Set([...senderIds, ...recipientIds])];

      if (allUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, avatar_url')
          .in('id', allUserIds);

        const profileMap = new Map();

        // Also fetch membership applications for names if profile is incomplete
        const { data: applications } = await supabase
          .from('membership_applications')
          .select('user_id, application_data')
          .in('user_id', allUserIds)
          .eq('club_id', contextId);

        const applicationMap = new Map();
        applications?.forEach(app => {
          applicationMap.set(app.user_id, app.application_data);
        });

        profiles?.forEach(profile => {
          let firstName = profile.first_name;
          let lastName = profile.last_name;

          // If profile name is empty, try to get from application
          if (!firstName || !lastName) {
            const appData = applicationMap.get(profile.id);
            if (appData) {
              firstName = firstName || appData.firstName;
              lastName = lastName || appData.lastName;
            }
          }

          profileMap.set(profile.id, {
            name: `${firstName || ''} ${lastName || ''}`.trim() || 'Unknown',
            avatar_url: profile.avatar_url
          });
        });

        // Fetch club/association names
        const allClubIds = [...new Set(allNotifications.map(n => n.club_id).filter(Boolean))];
        const clubNamesMap = new Map();

        if (allClubIds.length > 0) {
          const [clubsResult, stateResult, nationalResult] = await Promise.all([
            supabase.from('clubs').select('id, name').in('id', allClubIds),
            supabase.from('state_associations').select('id, name').in('id', allClubIds),
            supabase.from('national_associations').select('id, name').in('id', allClubIds)
          ]);

          clubsResult.data?.forEach(c => clubNamesMap.set(c.id, c.name));
          stateResult.data?.forEach(s => clubNamesMap.set(s.id, s.name));
          nationalResult.data?.forEach(n => clubNamesMap.set(n.id, n.name));
        }

        // Add sender and recipient info to inbox notifications
        const enrichedInbox = (inboxData || []).map(notification => {
          const senderProfile = notification.sender_id ? profileMap.get(notification.sender_id) : null;
          const recipientProfile = profileMap.get(notification.user_id);

          // Use sender_name from notification if profile is empty/unknown
          const senderName = (senderProfile?.name && senderProfile.name !== 'Unknown')
            ? senderProfile.name
            : notification.sender_name || 'Unknown';

          // Use sender_avatar_url from notification if profile doesn't have one
          const senderAvatar = senderProfile?.avatar_url || notification.sender_avatar_url;

          return {
            ...notification,
            sender_name: senderName,
            sender_avatar_url: senderAvatar,
            recipient_name: recipientProfile?.name,
            recipient_avatar_url: recipientProfile?.avatar_url,
            club_name: notification.club_id ? clubNamesMap.get(notification.club_id) : undefined
          };
        });

        // For sent notifications, current user is the sender
        const enrichedSent = (sentData || []).map(notification => {
          const recipientProfile = profileMap.get(notification.user_id);
          return {
            ...notification,
            sender_name: getSenderName(),
            sender_avatar_url: currentUserProfile?.avatar_url,
            recipient_name: recipientProfile?.name || 'Unknown',
            recipient_avatar_url: recipientProfile?.avatar_url,
            club_name: notification.club_id ? clubNamesMap.get(notification.club_id) : undefined
          };
        });

        setNotifications(enrichedInbox);
        setSentNotifications(enrichedSent);
      } else {
        setNotifications(inboxData || []);
        setSentNotifications(sentData);
      }

    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!contextId) return;

    try {
      // Fetch members with their user profiles to get avatar URLs
      const { data: membersData, error } = await supabase
        .from('members')
        .select('id, user_id, first_name, last_name, email')
        .eq('club_id', contextId)
        .order('first_name');

      if (error) throw error;

      // Fetch avatar URLs from profiles
      const userIds = membersData?.filter(m => m.user_id).map(m => m.user_id) || [];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', userIds);

        const avatarMap = new Map();
        profiles?.forEach(profile => {
          avatarMap.set(profile.id, profile.avatar_url);
        });

        // Enrich members with avatar URLs
        const enrichedMembers = membersData?.map(member => ({
          ...member,
          avatar_url: member.user_id ? avatarMap.get(member.user_id) : null
        }));

        setMembers(enrichedMembers || []);
      } else {
        setMembers(membersData || []);
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  // Helper function to strip HTML tags from text
  const stripHtml = (html: string): string => {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const getSenderName = () => {
    if (currentUserProfile?.first_name && currentUserProfile?.last_name) {
      return `${currentUserProfile.first_name} ${currentUserProfile.last_name}`;
    }
    if (user?.user_metadata?.first_name && user?.user_metadata?.last_name) {
      return `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
    }
    return user?.email || 'Unknown User';
  };

  // New feature handlers
  const handleToggleStar = async (notification: Notification) => {
    try {
      await commsUtils.toggleStar(notification.id, notification.is_starred || false);
      setNotifications(prev => prev.map(n =>
        n.id === notification.id ? { ...n, is_starred: !n.is_starred } : n
      ));
    } catch (err) {
      console.error('Error toggling star:', err);
    }
  };

  const handleToggleArchive = async (notification: Notification) => {
    try {
      await commsUtils.toggleArchive(notification.id, notification.is_archived || false);
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      addNotification('success', 'Message archived');
    } catch (err) {
      console.error('Error toggling archive:', err);
    }
  };

  const handleBulkMarkAsRead = async () => {
    if (!user || selectedForBulk.length === 0) return;
    try {
      await commsUtils.bulkMarkAsRead(selectedForBulk, user.id);
      setNotifications(prev => prev.map(n =>
        selectedForBulk.includes(n.id) ? { ...n, read: true } : n
      ));
      setSelectedForBulk([]);
      addNotification('success', 'Marked as read');
    } catch (err) {
      console.error('Error bulk marking as read:', err);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForBulk.length === 0) return;
    try {
      await commsUtils.bulkDelete(selectedForBulk);
      setNotifications(prev => prev.filter(n => !selectedForBulk.includes(n.id)));
      setSelectedForBulk([]);
      addNotification('success', 'Messages deleted');
    } catch (err) {
      console.error('Error bulk deleting:', err);
    }
  };

  const handleAddReaction = async (notificationId: string, emoji: string) => {
    if (!user) return;
    try {
      await commsUtils.addReaction(notificationId, user.id, emoji);
      // Refresh the notification to show new reaction
      if (selectedNotification && selectedNotification.id === notificationId) {
        const reactions = await commsUtils.getReactions(notificationId);
        setSelectedNotification({ ...selectedNotification, reactions });
      }
    } catch (err) {
      console.error('Error adding reaction:', err);
    }
  };

  const getDisplayName = (notification: any, isInbox: boolean) => {
    // For inbox items, show sender name
    if (isInbox) {
      if (notification.sender_name && notification.sender_name !== 'null null') {
        return notification.sender_name;
      }
      // Fallback to extracting from user_id if sender_name is not available
      return 'Unknown Sender';
    } else {
      // For sent items, show recipient name
      if (notification.recipient_name && notification.recipient_name !== 'null null') {
        return notification.recipient_name;
      }
      // Fallback to extracting from the recipients list
      if (composeForm.recipients && composeForm.recipients.length > 0) {
        const recipientUserId = composeForm.recipients[0];
        const recipientMember = members.find(m => m.user_id === recipientUserId);
        if (recipientMember) {
          return `${recipientMember.first_name} ${recipientMember.last_name}`;
        }
      }
      return 'Unknown Recipient';
    }
  };

  const getSenderInitials = () => {
    const firstName = currentUserProfile?.first_name || user?.user_metadata?.first_name || '';
    const lastName = currentUserProfile?.last_name || user?.user_metadata?.last_name || '';
    
    if (firstName || lastName) {
      return `${currentUserProfile.first_name?.charAt(0) || ''}${currentUserProfile.last_name?.charAt(0) || ''}`.toUpperCase();
    }
    
    const email = user?.email || '';
    return email.charAt(0).toUpperCase() || 'U';
  };

  const confirmDelete = (notificationId: string) => {
    setDeleteConfirmation({ show: true, id: notificationId });
  };

  const handleDeleteNotification = async (isSent: boolean = false) => {
    const notificationId = deleteConfirmation.id;
    if (!notificationId) return;

    try {
      setDeletingNotifications(prev => new Set(prev).add(notificationId));

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      // Remove from local state
      if (isSent) {
        setSentNotifications(prev => prev.filter(n => n.id !== notificationId));
      } else {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }

      // If we're on the last page and it becomes empty, go to previous page
      if (currentNotifications.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }

      // Show success notification
      addNotification('success', 'Message deleted successfully');

      // Close modal and confirmation
      setSelectedNotification(null);
      setDeleteConfirmation({ show: false, id: null });
    } catch (err) {
      console.error('Error deleting notification:', err);
      addNotification('error', 'Failed to delete message');
    } finally {
      setDeletingNotifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', user?.id);

      if (error) throw error;

      // Update local state
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const sendNotification = async () => {
    if ((composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0) || !composeForm.subject || !composeForm.body) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSending(true);
      setError(null);

      const selectedRecipients = composeForm.recipients;

      // First, try to get recipient data from members
      const recipientsData = [];
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
          // If not a member, fetch profile directly (e.g., for pending applicants)
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
          } else {
            // Last resort: get user email from auth.users via user_id
            const { data: authUser } = await supabase.auth.admin.getUserById(id);
            if (authUser?.user) {
              recipientsData.push({
                id: id,
                user_id: id,
                email: authUser.user.email,
                name: authUser.user.email || 'Unknown'
              });
            }
          }
        }
      }

      // Add external email recipients
      for (const email of composeForm.externalEmails) {
        recipientsData.push({
          id: null,
          user_id: null,
          email: email,
          name: email
        });
      }

      // If only external emails, force email sending and skip notifications
      const hasExternalOnly = composeForm.externalEmails.length > 0 && composeForm.recipients.length === 0;

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
          club_name: currentClub.club?.name,
          sender_first_name: currentUserProfile?.first_name || user?.user_metadata?.first_name || '',
          sender_last_name: currentUserProfile?.last_name || user?.user_metadata?.last_name || ''
        }
      });

      if (error) throw error;

      // Show success toast notification
      const totalRecipients = composeForm.recipients.length + composeForm.externalEmails.length;
      addNotification('success', `Message sent to ${totalRecipients} recipient(s)`);

      // Delete the draft if this was from a draft
      if (currentDraftId) {
        await supabase
          .from('notification_drafts')
          .delete()
          .eq('id', currentDraftId);
        await fetchDrafts();
      }

      clearCompose();
      setActiveTab('sent');

      // Refresh notifications
      await fetchNotifications();
    } catch (err) {
      console.error('Error sending notification:', err);
      setError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const filteredNotifications = notifications.filter(notification =>
    notification.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notification.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (notification.sender_name && notification.sender_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSentNotifications = sentNotifications.filter(notification =>
    notification.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notification.body.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationTypeInfo = (type: string) => {
    switch (type) {
      case 'race_results':
        return {
          icon: <Trophy size={14} />,
          label: 'Race Results',
          bgClass: 'bg-yellow-900/30 text-yellow-400'
        };
      case 'membership':
        return {
          icon: <UserCheck size={14} />,
          label: 'Membership',
          bgClass: 'bg-green-900/30 text-green-400'
        };
      case 'club_news':
        return {
          icon: <Newspaper size={14} />,
          label: 'Club News',
          bgClass: 'bg-blue-900/30 text-blue-400'
        };
      case 'alert':
        return {
          icon: <Bell size={14} />,
          label: 'Alert',
          bgClass: 'bg-red-900/30 text-red-400'
        };
      case 'message':
      default:
        return {
          icon: <MessageSquare size={14} />,
          label: 'Message',
          bgClass: 'bg-slate-700 text-slate-300'
        };
    }
  };

  // Draft management functions
  const saveDraft = async (auto = false) => {
    if (!composeForm.subject && !composeForm.body) return;

    try {
      if (!auto) setSavingDraft(true);

      const draftData = {
        user_id: user?.id,
        club_id: currentClub?.club?.id,
        recipients: composeForm.recipients,
        subject: composeForm.subject,
        body: composeForm.body,
        send_email: composeForm.send_email,
        type: composeForm.notification_type,
        is_rich_text: useRichText
      };

      console.log('Saving draft with data:', draftData);

      if (currentDraftId) {
        // Update existing draft
        const { error } = await supabase
          .from('notification_drafts')
          .update(draftData)
          .eq('id', currentDraftId);

        if (error) {
          console.error('Update draft error:', error);
          throw error;
        }
        if (!auto) addNotification('success', 'Draft updated');
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from('notification_drafts')
          .insert([draftData])
          .select()
          .single();

        if (error) {
          console.error('Insert draft error:', error);
          throw error;
        }
        if (data) setCurrentDraftId(data.id);
        if (!auto) addNotification('success', 'Draft saved');
      }

      await fetchDrafts();
    } catch (err: any) {
      console.error('Error saving draft:', err);
      console.error('Error details:', err.message, err.details, err.hint);
      if (!auto) setError(`Failed to save draft: ${err.message || 'Unknown error'}`);
    } finally {
      if (!auto) setSavingDraft(false);
    }
  };

  const fetchDrafts = async () => {
    if (!user?.id || !currentClub?.club?.id) return;

    try {
      const { data, error } = await supabase
        .from('notification_drafts')
        .select('*')
        .eq('user_id', user.id)
        .eq('club_id', currentClub.club.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setDrafts(data || []);
    } catch (err) {
      console.error('Error fetching drafts:', err);
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
    setActiveTab('compose');
  };

  const confirmDeleteDraftHandler = (draftId: string) => {
    setConfirmDeleteDraft({ show: true, id: draftId });
  };

  const deleteDraft = async () => {
    if (!confirmDeleteDraft.id) return;

    try {
      const { error } = await supabase
        .from('notification_drafts')
        .delete()
        .eq('id', confirmDeleteDraft.id);

      if (error) throw error;
      await fetchDrafts();
      if (currentDraftId === confirmDeleteDraft.id) {
        clearCompose();
      }
      addNotification('success', 'Draft deleted');
      setConfirmDeleteDraft({ show: false, id: null });
    } catch (err) {
      console.error('Error deleting draft:', err);
      addNotification('error', 'Failed to delete draft');
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
    setActiveTab('inbox');
  };

  const getEmailStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <span title="Email sent">
            <MailCheck size={16} className="text-green-400" />
          </span>
        );
      case 'failed':
        return (
          <span title="Email failed">
            <MailX size={16} className="text-red-400" />
          </span>
        );
      case 'pending':
        return (
          <span title="Email pending">
            <MailWarning size={16} className="text-amber-400" />
          </span>
        );
      case 'not_sent':
        return null; // Don't show icon for not_sent
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  // Avatar component helper
  const UserAvatar: React.FC<{
    name: string;
    avatarUrl?: string;
    size?: number;
    isRead?: boolean;
  }> = ({ name, avatarUrl, size = 40, isRead = false }) => {
    const initials = name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={name}
          className={`rounded-full object-cover ${isRead ? 'opacity-75' : ''}`}
          style={{ width: size, height: size }}
          onError={(e) => {
            // Fallback to initials if image fails to load
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling?.classList.remove('hidden');
          }}
        />
      );
    }

    return (
      <div
        className={`rounded-full flex items-center justify-center text-white font-medium ${
          isRead ? 'bg-slate-600' : 'bg-blue-600'
        }`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initials}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab('inbox')}
          className={`
            flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
            ${activeTab === 'inbox'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'}
          `}
        >
          <Inbox size={16} />
          <span>Inbox</span>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sent')}
          className={`
            flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
            ${activeTab === 'sent'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'}
          `}
        >
          <Send size={16} />
          <span>Sent</span>
        </button>

        <button
          onClick={() => setActiveTab('drafts')}
          className={`
            flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
            ${activeTab === 'drafts'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'}
          `}
        >
          <FileText size={16} />
          <span>Drafts</span>
          {drafts.length > 0 && (
            <span className="bg-slate-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {drafts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('compose')}
          className={`
            ml-auto flex items-center gap-2 px-6 py-2.5 text-sm font-medium transition-all bg-green-600 hover:bg-green-700 text-white rounded-t-lg shadow-lg
            ${activeTab === 'compose' ? 'ring-2 ring-green-400' : ''}
          `}
        >
          <Plus size={16} />
          <span>Compose</span>
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
          <AlertTriangle className="text-red-400 mt-0.5" size={18} />
          <div>
            <h3 className="text-red-400 font-medium">Error</h3>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X size={16} />
          </button>
        </div>
      )}


      {/* Search Bar */}
      {(activeTab === 'inbox' || activeTab === 'sent') && (
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`
              w-full pl-10 pr-4 py-2 rounded-lg transition-colors
              ${darkMode 
                ? 'bg-slate-700 text-slate-200 placeholder-slate-400 border border-slate-600' 
                : 'bg-white text-slate-800 placeholder-slate-400 border border-slate-200'}
            `}
          />
        </div>
      )}

      {/* Content */}
      {activeTab === 'inbox' && (
        <div onClick={() => selectedNotification && setSelectedNotification(null)}>
          {/* Notification Detail View (shown above list when selected) */}
          {selectedNotification && (
            <div
              className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 border ${darkMode ? 'border-slate-700' : 'border-slate-200'} mb-4`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with Close Button */}
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {selectedNotification.subject}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => confirmDelete(selectedNotification.id)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    onClick={() => setSelectedNotification(null)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Message Header */}
              <div className="mb-6">
                <div className="flex items-start gap-4">
                  <UserAvatar
                    name={selectedNotification.sender_name || 'System'}
                    avatarUrl={selectedNotification.sender_avatar_url}
                    size={48}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {selectedNotification.sender_name || 'System'}
                      </p>
                      {(() => {
                        const typeInfo = getNotificationTypeInfo(selectedNotification.type);
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${typeInfo.bgClass}`}>
                            {typeInfo.icon}
                            <span>{typeInfo.label}</span>
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span>{formatDate(selectedNotification.sent_at)}</span>
                      {getEmailStatusIcon(selectedNotification.email_status)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Message Body */}
              <div className={`prose max-w-none mb-6 ${darkMode ? 'prose-invert' : ''}`}>
                <div className={darkMode ? 'text-slate-300' : 'text-slate-700'} dangerouslySetInnerHTML={{ __html: selectedNotification.body }} />
              </div>

              {/* Meeting Attendance Buttons */}
              {selectedNotification.type === 'meeting_invite' && (
                <MeetingAttendanceButtons
                  notificationId={selectedNotification.id}
                  darkMode={darkMode}
                  onResponse={() => {
                    // Refresh notifications to update status
                    fetchNotifications();
                  }}
                />
              )}

              {selectedNotification.email_error_message && (
                <div className="mb-6 p-3 rounded-lg bg-red-900/20 border border-red-900/30">
                  <p className="text-red-400 text-sm">
                    <strong>Email Error:</strong> {selectedNotification.email_error_message}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-slate-700">
                <button
                  onClick={async () => {
                    setReplyMode('reply');
                    setShowMembersList(true); // Auto-expand members list when replying
                    // Find the member who sent this notification
                    const senderMember = members.find(m => m.user_id === selectedNotification.sender_id);

                    // If sender is not a member (e.g., pending applicant), use their sender_id directly
                    const recipientList = senderMember?.user_id
                      ? [senderMember.user_id]
                      : selectedNotification.sender_id
                        ? [selectedNotification.sender_id]
                        : [];

                    // Check if this is a non-member (pending applicant)
                    const isNonMember = !senderMember && selectedNotification.sender_id;

                    // If non-member, fetch their profile and avatar to populate nonMemberRecipients
                    if (isNonMember && selectedNotification.sender_id) {
                      const { data: profile } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name, email, avatar_url')
                        .eq('id', selectedNotification.sender_id)
                        .maybeSingle();

                      if (profile) {
                        // Also try to get avatar from membership application if not in profile
                        let avatarUrl = profile.avatar_url;
                        if (!avatarUrl) {
                          const { data: application } = await supabase
                            .from('membership_applications')
                            .select('application_data')
                            .eq('user_id', selectedNotification.sender_id)
                            .maybeSingle();

                          if (application?.application_data?.avatarUrl) {
                            avatarUrl = application.application_data.avatarUrl;
                          }
                        }

                        const newNonMembers = new Map(nonMemberRecipients);
                        newNonMembers.set(profile.id, { ...profile, avatar_url: avatarUrl });
                        setNonMemberRecipients(newNonMembers);
                      }
                    }

                    setComposeForm({
                      ...composeForm,
                      recipients: recipientList,
                      externalEmails: [],
                      subject: `Re: ${selectedNotification.subject}`,
                      body: `<p><br></p><p><br></p><hr><p><em>On ${formatDate(selectedNotification.sent_at)}, ${selectedNotification.sender_name} wrote:</em></p><blockquote>${selectedNotification.body}</blockquote>`,
                      send_email: isNonMember ? true : composeForm.send_email // Auto-enable email for non-members
                    });
                    setActiveTab('compose');
                    setSelectedNotification(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Reply size={16} />
                  Reply
                </button>
                <button
                  onClick={() => {
                    setReplyMode('forward');
                    setShowMembersList(true); // Auto-expand members list when forwarding
                    setComposeForm({
                      ...composeForm,
                      recipients: [],
                      externalEmails: [],
                      subject: `Fwd: ${selectedNotification.subject}`,
                      body: `<p><br></p><p><br></p><hr><p><em>Forwarded message from ${selectedNotification.sender_name} on ${formatDate(selectedNotification.sent_at)}:</em></p><blockquote>${selectedNotification.body}</blockquote>`
                    });
                    setActiveTab('compose');
                    setSelectedNotification(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Forward size={16} />
                  Forward
                </button>
              </div>
            </div>
          )}

          {/* Notifications List */}
          <div className="space-y-3 mb-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-slate-400">Loading notifications...</p>
              </div>
            ) : currentNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Inbox size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                <p className="text-slate-400 mb-2">No notifications</p>
                <p className="text-sm text-slate-500">
                  {searchTerm ? 'No notifications match your search' : 'You have no notifications yet'}
                </p>
              </div>
            ) : (
              currentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => {
                    setSelectedNotification(notification);
                    if (!notification.read) {
                      markAsRead(notification.id);
                    }
                  }}
                  className={`
                    p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.01]
                    ${notification.read
                      ? darkMode 
                        ? 'bg-slate-700/50 border-slate-600' 
                        : 'bg-slate-50 border-slate-200'
                      : darkMode 
                        ? 'bg-slate-700 border-slate-600 ring-1 ring-blue-500/20' 
                        : 'bg-white border-slate-200 ring-1 ring-blue-500/20'
                    }
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <UserAvatar
                        name={getDisplayName(notification, true)}
                        avatarUrl={notification.sender_avatar_url}
                        size={40}
                        isRead={notification.read}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-medium ${notification.read ? 'text-slate-400' : 'text-white'}`}>
                            {getDisplayName(notification, true)}
                          </p>
                          {(() => {
                            const typeInfo = getNotificationTypeInfo(notification.type);
                            return (
                              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${typeInfo.bgClass}`}>
                                {typeInfo.icon}
                                <span>{typeInfo.label}</span>
                              </span>
                            );
                          })()}
                          {getEmailStatusIcon(notification.email_status)}
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className={`font-medium ${notification.read ? 'text-slate-300' : 'text-white'}`}>
                            {notification.subject}
                          </p>
                          {notification.club_name && (
                            <span className="px-2 py-0.5 text-xs rounded-md bg-blue-500/20 text-blue-300 flex items-center gap-1">
                              <Building2 size={12} />
                              {notification.club_name}
                            </span>
                          )}
                        </div>
                        <p className={`text-sm line-clamp-2 ${notification.read ? 'text-slate-500' : 'text-slate-400'}`}>
                          {stripHtml(notification.body)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-start gap-2">
                      <div>
                        <p className="text-xs text-slate-400">
                          {formatDate(notification.sent_at)}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 ml-auto"></div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStar(notification);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          notification.is_starred
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-slate-400 hover:text-yellow-400 hover:bg-yellow-900/20'
                        }`}
                        title={notification.is_starred ? 'Unstar' : 'Star'}
                      >
                        <Star size={16} fill={notification.is_starred ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleArchive(notification);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Archive"
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(notification.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete notification"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="text-center py-8">
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                
                <span className="px-4 py-2 text-slate-300 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sent' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading sent notifications...</p>
            </div>
          ) : filteredSentNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Send size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
              <p className="text-slate-400 mb-2">No sent notifications</p>
              <p className="text-sm text-slate-500">
                {searchTerm ? 'No sent notifications match your search' : 'You have not sent any notifications yet'}
              </p>
            </div>
          ) : (
            filteredSentNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`
                  p-4 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700/50 border-slate-600' 
                    : 'bg-slate-50 border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-white">{notification.subject}</p>
                      {(() => {
                        const typeInfo = getNotificationTypeInfo(notification.type);
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${typeInfo.bgClass}`}>
                            {typeInfo.icon}
                            <span>{typeInfo.label}</span>
                          </span>
                        );
                      })()}
                      {getEmailStatusIcon(notification.email_status)}
                    </div>
                    <p className="text-sm text-slate-400 line-clamp-2 mb-2">
                      {stripHtml(notification.body)}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>To: {notification.recipient_name || 'Member'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDelete(notification.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete message"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    {formatDate(notification.sent_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'compose' && (
        <div className={`
          p-6 rounded-lg border
          ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}
        `}>
          <h3 className="text-lg font-semibold text-white mb-4">
            {composeForm.externalEmails.length > 0 && composeForm.recipients.length === 0 ? 'Compose Email' : 'Compose Notification'}
          </h3>
          
          <div className="space-y-4">
            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Recipients *
              </label>
              <div className="space-y-2">
                {/* External Email Input - Hidden in reply mode */}
                {replyMode !== 'reply' && (
                  <>
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
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
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
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        Add
                      </button>
                    </div>

                    {/* Display external email recipients */}
                    {composeForm.externalEmails.length > 0 && (
                      <div className="space-y-1">
                        {composeForm.externalEmails.map((email, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                            <Mail size={16} className="text-purple-400 flex-shrink-0" />
                            <span className="text-white text-sm flex-1">{email}</span>
                            <button
                              onClick={() => {
                                setComposeForm({
                                  ...composeForm,
                                  externalEmails: composeForm.externalEmails.filter((_, i) => i !== index)
                                });
                              }}
                              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                              title="Remove email"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div>
                  <button
                    onClick={() => setShowMembersList(!showMembersList)}
                    className="flex items-center justify-between w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={18} />
                      <span className="font-medium">Members</span>
                      <span className="text-xs text-slate-400">
                        ({composeForm.recipients.length} selected)
                      </span>
                    </div>
                    <ChevronRight size={18} className={`transition-transform ${showMembersList ? 'rotate-90' : ''}`} />
                  </button>
                </div>

                {showMembersList && (
                  <div className="space-y-3 border border-slate-600 rounded-lg p-3 bg-slate-800/50">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setComposeForm({
                          ...composeForm,
                          recipients: members.filter(m => m.user_id).map(m => m.user_id)
                        })}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Select All Members
                      </button>
                      <button
                        onClick={() => setComposeForm({ ...composeForm, recipients: [] })}
                        className="px-3 py-1.5 text-xs bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-slate-700 rounded-lg">
                      {/* Display non-member recipients FIRST (e.g., pending applicants) */}
                      {Array.from(nonMemberRecipients.values()).map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-3 p-3 bg-blue-900/20 border-b border-blue-500/30"
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
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors flex-shrink-0"
                        title="Remove recipient"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Then display regular members (exclude pending applicants unless in reply mode) */}
                  {members.filter(m => m.user_id && (replyMode === 'reply' || !nonMemberRecipients.has(m.user_id))).map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-3 p-3 hover:bg-slate-700/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={composeForm.recipients.includes(member.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setComposeForm({
                              ...composeForm,
                              recipients: [...composeForm.recipients, member.user_id]
                            });
                          } else {
                            setComposeForm({
                              ...composeForm,
                              recipients: composeForm.recipients.filter(id => id !== member.user_id)
                            });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded flex-shrink-0"
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
                      </div>
                    </label>
                  ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-400">
                  {composeForm.recipients.length + composeForm.externalEmails.length} recipient(s) selected
                </p>
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Subject *
              </label>
              <input
                type="text"
                value={composeForm.subject}
                onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
                placeholder="Enter notification subject"
              />
            </div>

            {/* Message Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-300">
                  Message *
                </label>
                <button
                  onClick={() => setUseRichText(!useRichText)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                  type="button"
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
                  rows={6}
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                  placeholder="Enter your message here..."
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
                          // Insert emoji at current cursor position in rich text editor
                          editorRef.current.chain().focus().insertContent(emoji.emoji).run();
                        } else {
                          // Insert emoji in plain text
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

            {/* Options - Hide when only external emails */}
            {composeForm.recipients.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Notification Type
                  </label>
                  <select
                    value={composeForm.notification_type}
                    onChange={(e) => setComposeForm({ ...composeForm, notification_type: e.target.value })}
                    className={`
                      w-full px-3 py-2 rounded-lg border
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'}
                    `}
                  >
                    <option value="message">💬 Message</option>
                    <option value="race_results">🏆 Race Results</option>
                    <option value="membership">👤 Membership</option>
                    <option value="club_news">📰 Club News</option>
                    <option value="alert">⚠️ Alert</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={composeForm.send_email}
                      onChange={(e) => setComposeForm({ ...composeForm, send_email: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-slate-300">Also send via email</span>
                  </label>
                  <p className="text-xs text-slate-400 mt-1">
                    When enabled, recipients will receive both an in-app notification and an email
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-700">
              <div className="flex gap-3">
                <button
                  onClick={clearCompose}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  onClick={() => saveDraft(false)}
                  disabled={savingDraft || (!composeForm.subject && !composeForm.body)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingDraft ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Save Draft
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={sendNotification}
                disabled={sending || (composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0) || !composeForm.subject || !composeForm.body}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    {composeForm.externalEmails.length > 0 && composeForm.recipients.length === 0 ? 'Send Email' : 'Send Notification'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'drafts' && (
        <div className={`
          p-6 rounded-lg border
          ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}
        `}>
          <h3 className="text-lg font-semibold text-white mb-4">Draft Messages</h3>

          {drafts.length === 0 ? (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto text-slate-500 mb-3" />
              <p className="text-slate-400">No drafts saved</p>
              <p className="text-slate-500 text-sm mt-2">Click 'Save Draft' when composing to save your work</p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="p-4 border border-slate-600 rounded-lg hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-medium truncate">
                        {draft.subject || '(No Subject)'}
                      </h4>
                      <div
                        className="text-slate-400 text-sm mt-1 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: draft.body || '(No content)' }}
                      />
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {draft.recipients?.length || 0} recipient(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatDate(draft.updated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadDraft(draft)}
                        className="p-2 text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Edit draft"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        onClick={() => confirmDeleteDraftHandler(draft.id)}
                        className="p-2 text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete draft"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showKeyboardHelp && (
        <KeyboardShortcutsHelp
          onClose={() => setShowKeyboardHelp(false)}
          darkMode={darkMode}
        />
      )}

      {/* Delete Message Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmation.show}
        onClose={() => setDeleteConfirmation({ show: false, id: null })}
        onConfirm={() => handleDeleteNotification(activeTab === 'sent')}
        title="Delete Message"
        message="Are you sure you want to delete this message? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />

      {/* Delete Draft Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmDeleteDraft.show}
        onClose={() => setConfirmDeleteDraft({ show: false, id: null })}
        onConfirm={deleteDraft}
        title="Delete Draft"
        message="Are you sure you want to delete this draft? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />
    </div>
  );
};

// Meeting Attendance Buttons Component
interface MeetingAttendanceButtonsProps {
  notificationId: string;
  darkMode: boolean;
  onResponse: () => void;
}

const MeetingAttendanceButtons: React.FC<MeetingAttendanceButtonsProps> = ({ notificationId, darkMode, onResponse }) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [attendance, setAttendance] = useState<{status: string, responded_at: string} | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchAttendance();
  }, [notificationId]);

  const fetchAttendance = async () => {
    try {
      setLoading(true);

      // Find the attendance record for this user and meeting
      // We need to get the meeting_id from the notification first
      const { data: notif } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .single();

      if (!notif) return;

      // Extract meeting_id from notification metadata if available
      // For now, query by user_id to find their attendance record
      const { data, error } = await supabase
        .from('meeting_attendance')
        .select('status, responded_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setAttendance(data);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (status: 'attending' | 'not_attending' | 'maybe') => {
    try {
      setUpdating(true);

      // Update attendance
      const { error } = await supabase
        .from('meeting_attendance')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      setAttendance({ status, responded_at: new Date().toISOString() });

      const statusMessages = {
        attending: 'You marked yourself as attending',
        not_attending: 'You marked yourself as not attending',
        maybe: 'You marked yourself as maybe attending'
      };

      addNotification('success', statusMessages[status]);
      onResponse();
    } catch (error) {
      console.error('Error updating attendance:', error);
      addNotification('error', 'Failed to update attendance');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-6 p-6 rounded-lg bg-slate-800/50 border border-slate-700 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className={`mb-6 p-6 rounded-lg ${darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-slate-100 border border-slate-300'}`}>
      <h4 className={`text-lg font-semibold mb-4 text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
        Will you be attending?
      </h4>

      {attendance && attendance.responded_at && (
        <p className="text-sm text-center mb-4 text-slate-400">
          You responded on {new Date(attendance.responded_at).toLocaleDateString()}
        </p>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => handleResponse('attending')}
          disabled={updating}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
            ${attendance?.status === 'attending'
              ? 'bg-green-600 text-white ring-2 ring-green-400'
              : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'}
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[110px] justify-center
          `}
        >
          <Check size={18} />
          Yes
        </button>

        <button
          onClick={() => handleResponse('maybe')}
          disabled={updating}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
            ${attendance?.status === 'maybe'
              ? 'bg-amber-600 text-white ring-2 ring-amber-400'
              : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'}
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[110px] justify-center
          `}
        >
          <AlertTriangle size={18} />
          Maybe
        </button>

        <button
          onClick={() => handleResponse('not_attending')}
          disabled={updating}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all
            ${attendance?.status === 'not_attending'
              ? 'bg-red-600 text-white ring-2 ring-red-400'
              : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'}
            disabled:opacity-50 disabled:cursor-not-allowed
            min-w-[110px] justify-center
          `}
        >
          <X size={18} />
          No
        </button>
      </div>
    </div>
  );
};

export default MemberNotificationComponent;