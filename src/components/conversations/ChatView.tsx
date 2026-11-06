import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Phone, Video, PhoneOff, UserPlus } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
import { supabase, getOrCreateChannel, removeChannelByName } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { useVoiceCall } from '../../contexts/VoiceCallContext';

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type?: string;
}

interface ChatViewProps {
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
  existingConversationId?: string;
  onBack: () => void;
  onRead?: () => void;
  darkMode: boolean;
}

const formatMessageTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatDateSeparator = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const dayMs = 86400000;
  if (diff < dayMs && d.getDate() === now.getDate()) return 'Today';
  if (diff < 2 * dayMs) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

export const ChatView: React.FC<ChatViewProps> = ({ recipientId, recipientName, recipientAvatar, existingConversationId, onBack, onRead, darkMode }) => {
  const { user } = useAuth();
  const { isImpersonating, effectiveUserId } = useImpersonation();
  const currentUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;
  const { startCall, startGroupCall, callState } = useVoiceCall();
  const [showGroupCallPicker, setShowGroupCallPicker] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recipientOnline, setRecipientOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(null);

  useEffect(() => {
    convIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!recipientId) return;
    const checkStatus = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('last_seen')
        .eq('id', recipientId)
        .maybeSingle();
      if (data?.last_seen) {
        setRecipientOnline(Date.now() - new Date(data.last_seen).getTime() < 15 * 60 * 1000);
      } else {
        setRecipientOnline(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [recipientId]);

  useEffect(() => {
    if (!currentUserId || !recipientId) return;
    if (existingConversationId) {
      setConversationId(existingConversationId);
      convIdRef.current = existingConversationId;
      setLoading(true);
      Promise.all([
        loadMessages(existingConversationId),
        updateReadStatus(existingConversationId),
        unhideConversation(existingConversationId),
      ]).finally(() => setLoading(false));
    } else {
      findExistingConversation();
    }
  }, [currentUserId, recipientId, existingConversationId]);

  useEffect(() => {
    if (!conversationId) return;
    const channelName = `chat-messages-${conversationId}`;
    getOrCreateChannel(channelName, (ch) =>
      ch.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload: any) => {
        const msg = payload.new as ChatMessage;
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        updateReadStatus(conversationId);
      }).subscribe()
    );
    return () => { removeChannelByName(channelName); };
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'auto' });
  }, [messages]);

  const findExistingConversation = async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const { data: myConvos } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', currentUserId);

      if (!myConvos || myConvos.length === 0) {
        setConversationId(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      const myConvIds = myConvos.map(c => c.conversation_id);

      const { data: theirConvos } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', recipientId)
        .in('conversation_id', myConvIds);

      if (!theirConvos || theirConvos.length === 0) {
        setConversationId(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      let foundConvId: string | null = null;
      for (const conv of theirConvos) {
        const { count } = await supabase
          .from('conversation_participants')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.conversation_id);

        if (count === 2) {
          foundConvId = conv.conversation_id;
          break;
        }
      }

      if (foundConvId) {
        setConversationId(foundConvId);
        convIdRef.current = foundConvId;
        await loadMessages(foundConvId);
        await updateReadStatus(foundConvId);
        await unhideConversation(foundConvId);
      } else {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Error loading conversation:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    if (!error && data) setMessages(data);
  };

  const updateReadStatus = async (convId?: string) => {
    const id = convId || convIdRef.current;
    if (!id || !currentUserId) return;
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', id)
      .eq('user_id', currentUserId);
    onRead?.();
  };

  const unhideConversation = async (convId: string) => {
    if (!currentUserId) return;
    await supabase
      .from('conversation_participants')
      .update({ hidden_at: null, hidden_message_id: null })
      .eq('conversation_id', convId)
      .eq('user_id', currentUserId);
  };

  const createConversation = async (): Promise<string | null> => {
    if (!currentUserId) return null;
    try {
      // Generate a UUID client-side so we can reference it without needing SELECT
      const convId = crypto.randomUUID();

      const { error: convErr } = await supabase
        .from('conversations')
        .insert({
          id: convId,
          last_message_text: '',
          last_message_sender_id: currentUserId,
          last_message_at: new Date().toISOString(),
        });

      if (convErr) {
        console.error('Failed to create conversation:', convErr);
        return null;
      }

      const { error: partErr } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: convId, user_id: currentUserId },
          { conversation_id: convId, user_id: recipientId },
        ]);

      if (partErr) {
        console.error('Failed to add participants:', partErr);
        return null;
      }

      return convId;
    } catch (err) {
      console.error('Error creating conversation:', err);
      return null;
    }
  };

  const handleSend = useCallback(async () => {
    if (!newMessage.trim() || !currentUserId || sending) return;
    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);
    setSendError(null);

    try {
      let convId = convIdRef.current;

      if (!convId) {
        convId = await createConversation();
        if (!convId) {
          setNewMessage(messageText);
          setSendError('Unable to start conversation. Please try again.');
          setSending(false);
          return;
        }
        setConversationId(convId);
        convIdRef.current = convId;
      }

      const optimisticMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: convId,
        sender_id: currentUserId,
        content: messageText,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimisticMsg]);

      const { data: inserted, error: msgErr } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: convId,
          sender_id: currentUserId,
          content: messageText,
        })
        .select('*')
        .single();

      if (msgErr) {
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setNewMessage(messageText);
        console.error('Failed to send message:', msgErr);
        setSendError('Message failed to send. Please try again.');
        setSending(false);
        return;
      }

      setMessages(prev =>
        prev.map(m => m.id === optimisticMsg.id ? inserted : m)
      );

      await supabase
        .from('conversations')
        .update({
          last_message_text: messageText,
          last_message_at: new Date().toISOString(),
          last_message_sender_id: currentUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', convId);

      await updateReadStatus(convId);
      inputRef.current?.focus();
    } catch (err) {
      console.error('Error sending message:', err);
      setSendError('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  }, [newMessage, currentUserId, sending, recipientId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const groupedMessages = messages.reduce<{ date: string; msgs: ChatMessage[] }[]>((acc, msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = acc[acc.length - 1];
    if (last && last.date === dateKey) {
      last.msgs.push(msg);
    } else {
      acc.push({ date: dateKey, msgs: [msg] });
    }
    return acc;
  }, []);

  const [rFirst, ...rRest] = (recipientName || '?').split(' ');
  const rLast = rRest.join(' ');
  const dot = (size: number) => (
    <span className="a-pres" style={{ width: size, height: size, background: recipientOnline ? '#30D158' : '#6B7488' }} />
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-3 border-b a-bd" style={{ padding: '14px 18px' }}>
        <button onClick={onBack} className="a-ib lg:hidden" aria-label="Back to chats">
          <ArrowLeft size={18} />
        </button>
        <span className="relative inline-flex flex-shrink-0">
          <AAvatar url={recipientAvatar} first={rFirst} last={rLast} size={42} />
          {dot(12)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="a-ink text-[16px] font-semibold truncate">{recipientName}</div>
          <div className={`text-[12.5px] mt-0.5 ${recipientOnline ? 'a-txt-g' : 'a-dim'}`}>{recipientOnline ? 'Online' : 'Offline'}</div>
        </div>
        <button
          onClick={() => startCall(recipientId, recipientName, recipientAvatar, conversationId || undefined, undefined, false)}
          disabled={!!callState}
          className="a-ib a-ib-call-g disabled:opacity-40"
          style={{ width: 40, height: 40 }}
          aria-label="Voice call"
          title="Voice call"
        >
          <Phone size={18} />
        </button>
        <button
          onClick={() => startCall(recipientId, recipientName, recipientAvatar, conversationId || undefined, undefined, true)}
          disabled={!!callState}
          className="a-ib a-ib-call-b disabled:opacity-40"
          style={{ width: 40, height: 40 }}
          aria-label="Video call"
          title="Video call"
        >
          <Video size={18} />
        </button>
        <button
          onClick={() => setShowGroupCallPicker(true)}
          disabled={!!callState}
          className="a-ib disabled:opacity-40"
          aria-label="Add people"
          title="Group call"
        >
          <UserPlus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '18px 24px' }}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <span className="mb-4"><AAvatar url={recipientAvatar} first={rFirst} last={rLast} size={80} /></span>
            <p className="a-display a-ink text-[19px] font-semibold mb-1">{recipientName}</p>
            <p className="a-mute text-[14px]">Start a conversation with {recipientName}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {groupedMessages.map((group) => (
              <React.Fragment key={group.date}>
                <div className="a-chat-sep">{formatDateSeparator(group.msgs[0].created_at)}</div>
                {group.msgs.map((msg) => {
                  const isOwn = msg.sender_id === currentUserId;
                  const isOptimistic = msg.id.startsWith('temp-');
                  const isCallEvent = msg.message_type && msg.message_type !== 'text';

                  if (isCallEvent) {
                    const isMissed = msg.message_type === 'missed_call';
                    const isDeclined = msg.message_type === 'declined_call';
                    return (
                      <div key={msg.id} className={`a-chat-call ${isMissed || isDeclined ? '' : 'a-chat-call-n'}`}>
                        {isMissed || isDeclined ? <PhoneOff size={14} /> : <Phone size={14} />}
                        <span>{msg.content} · {formatMessageTime(msg.created_at)}</span>
                      </div>
                    );
                  }

                  if (isOwn) {
                    return (
                      <div key={msg.id} className="flex flex-col items-end">
                        <div className={`a-bub a-bout ${isOptimistic ? 'opacity-70' : ''}`}>
                          <p className="whitespace-pre-wrap break-words m-0">{msg.content}</p>
                        </div>
                        <span className="a-chat-tm">{isOptimistic ? 'Sending…' : formatMessageTime(msg.created_at)}</span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className="flex items-end gap-2">
                      <AAvatar url={recipientAvatar} first={rFirst} last={rLast} size={28} />
                      <div className="flex flex-col" style={{ maxWidth: '62%' }}>
                        <div className="a-bub a-bin" style={{ maxWidth: 'none' }}>
                          <p className="whitespace-pre-wrap break-words m-0">{msg.content}</p>
                        </div>
                        <span className="a-chat-tm">{formatMessageTime(msg.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0" style={{ margin: '0 16px 16px' }}>
        {sendError && (
          <div className="a-note a-note-r mb-2 flex items-center justify-between">
            <p className="text-[12.5px] m-0">{sendError}</p>
            <button onClick={() => setSendError(null)} className="a-txt-r ml-2 text-[12px] font-semibold">Dismiss</button>
          </div>
        )}
        <div className="a-composer">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => { setNewMessage(e.target.value); if (sendError) setSendError(null); }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${rFirst}…`}
            rows={1}
            style={{ maxHeight: 120 }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="a-send"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
      {showGroupCallPicker && (
        <GroupCallPickerModal
          currentRecipient={{ userId: recipientId, name: recipientName, avatar: recipientAvatar }}
          conversationId={conversationId || undefined}
          onClose={() => setShowGroupCallPicker(false)}
          onStartGroupCall={startGroupCall}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

function GroupCallPickerModal({
  currentRecipient,
  conversationId,
  onClose,
  onStartGroupCall,
  darkMode,
}: {
  currentRecipient: { userId: string; name: string; avatar?: string };
  conversationId?: string;
  onClose: () => void;
  onStartGroupCall: (participants: { userId: string; name: string; avatar?: string }[], isVideo: boolean, conversationId?: string) => Promise<boolean>;
  darkMode: boolean;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [selected, setSelected] = useState<{ userId: string; name: string; avatar?: string }[]>([currentRecipient]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Get user's clubs
      const { data: userClubs } = await supabase
        .from('user_clubs')
        .select('club_id, role')
        .eq('user_id', user.id);

      const clubIds = (userClubs || []).map(uc => uc.club_id);
      const isAdmin = (userClubs || []).some(uc => uc.role === 'admin' || uc.role === 'owner');

      if (clubIds.length > 0) {
        // Fetch all members from user's clubs
        const { data: clubMembers } = await supabase
          .from('members')
          .select('user_id, first_name, last_name, avatar_url')
          .in('club_id', clubIds)
          .not('user_id', 'is', null)
          .neq('user_id', user.id);

        // Deduplicate by user_id
        const seen = new Set<string>();
        const memberList: { id: string; name: string; avatar?: string }[] = [];
        for (const m of (clubMembers || [])) {
          if (!m.user_id || seen.has(m.user_id)) continue;
          const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim();
          if (!name) continue;
          seen.add(m.user_id);
          memberList.push({ id: m.user_id, name, avatar: m.avatar_url || undefined });
        }
        memberList.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(memberList);
      } else {
        // Fallback: show social connections
        const { data: connections } = await supabase
          .from('social_connections')
          .select('user_id, connected_user_id')
          .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`)
          .eq('status', 'accepted');

        const connectedIds = (connections || []).map(c =>
          c.user_id === user.id ? c.connected_user_id : c.user_id
        );

        if (connectedIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url')
            .in('id', connectedIds);

          setMembers((profiles || [])
            .filter(p => p.full_name)
            .map(p => ({ id: p.id, name: p.full_name!, avatar: p.avatar_url || undefined }))
            .sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      }
    } catch (e) {
      console.error('Error fetching members:', e);
    }
    setLoading(false);
  };

  const toggleMember = (member: { id: string; name: string; avatar?: string }) => {
    if (selected.find(s => s.userId === member.id)) {
      if (member.id === currentRecipient.userId) return;
      setSelected(selected.filter(s => s.userId !== member.id));
    } else {
      if (selected.length >= 5) return; // max 5 others + self = 6
      setSelected([...selected, { userId: member.id, name: member.name, avatar: member.avatar }]);
    }
  };

  const handleStart = async (isVideo: boolean) => {
    if (selected.length < 1) return;
    const success = await onStartGroupCall(selected, isVideo, conversationId);
    if (success) onClose();
  };

  const filteredMembers = members.filter(m => {
    if (m.id === user?.id) return false;
    if (!search) return true;
    return m.name.toLowerCase().includes(search.toLowerCase());
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className={`rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Start Group Call</h3>
          <button onClick={onClose} className={`p-1 rounded ${darkMode ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* Selected participants */}
        {selected.length > 0 && (
          <div className={`px-4 py-3 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
            <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Participants ({selected.length + 1}/6 including you)
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.map(s => (
                <span key={s.userId} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'}`}>
                  {s.name}
                  {s.userId !== currentRecipient.userId && (
                    <button onClick={() => toggleMember({ id: s.userId, name: s.name, avatar: s.avatar })} className="ml-0.5 hover:text-red-400">&times;</button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="p-4">
          <input
            type="text"
            placeholder="Search members to add..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg text-sm border-0 mb-3 ${darkMode ? 'bg-slate-700 text-white placeholder-slate-400' : 'bg-gray-100 text-gray-900 placeholder-gray-500'}`}
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading ? (
              <p className={`text-center py-4 text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Loading...</p>
            ) : (
              filteredMembers.slice(0, 20).map(member => {
                const isSelected = selected.some(s => s.userId === member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => toggleMember(member)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
                      isSelected
                        ? darkMode ? 'bg-blue-900/30' : 'bg-blue-50'
                        : darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                    }`}
                  >
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${darkMode ? 'bg-slate-600 text-slate-300' : 'bg-blue-100 text-blue-600'}`}>
                        {getInitials(member.name)}
                      </div>
                    )}
                    <span className={`text-sm flex-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{member.name}</span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                        <span className="text-white text-xs">&#10003;</span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`flex items-center gap-3 p-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <button
            onClick={() => handleStart(false)}
            disabled={selected.length < 1}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
          >
            <Phone size={16} />
            Audio Call
          </button>
          <button
            onClick={() => handleStart(true)}
            disabled={selected.length < 1}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
          >
            <Video size={16} />
            Video Call
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatView;
