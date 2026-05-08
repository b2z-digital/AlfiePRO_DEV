import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Phone, Video, PhoneOff, Users } from 'lucide-react';
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

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b ${darkMode ? 'bg-slate-800/80 border-slate-700/50' : 'bg-white border-gray-200'}`}>
        <button
          onClick={onBack}
          className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="relative flex-shrink-0">
          {recipientAvatar ? (
            <img src={recipientAvatar} alt={recipientName} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
              {recipientName?.charAt(0) || '?'}
            </div>
          )}
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${darkMode ? 'border-slate-800' : 'border-white'} ${recipientOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{recipientName}</div>
          <div className={`text-xs ${recipientOnline ? 'text-green-500' : darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{recipientOnline ? 'Online' : 'Offline'}</div>
        </div>
        <button
          onClick={() => startCall(recipientId, recipientName, recipientAvatar, conversationId || undefined, undefined, false)}
          disabled={!!callState}
          className={`p-2 rounded-lg transition-colors ${
            callState
              ? 'opacity-40 cursor-not-allowed'
              : recipientOnline
                ? 'text-green-500 hover:bg-green-500/10 hover:text-green-400'
                : darkMode
                  ? 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="Voice call"
        >
          <Phone size={20} />
        </button>
        <button
          onClick={() => startCall(recipientId, recipientName, recipientAvatar, conversationId || undefined, undefined, true)}
          disabled={!!callState}
          className={`p-2 rounded-lg transition-colors ${
            callState
              ? 'opacity-40 cursor-not-allowed'
              : recipientOnline
                ? 'text-blue-500 hover:bg-blue-500/10 hover:text-blue-400'
                : darkMode
                  ? 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title="Video call"
        >
          <Video size={20} />
        </button>
        <button
          onClick={() => setShowGroupCallPicker(true)}
          disabled={!!callState}
          className={`p-2 rounded-lg transition-colors ${
            callState
              ? 'opacity-40 cursor-not-allowed'
              : darkMode
                ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
          title="Group call"
        >
          <Users size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="relative mb-4">
              {recipientAvatar ? (
                <img src={recipientAvatar} alt={recipientName} className="w-20 h-20 rounded-full object-cover" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold">
                  {recipientName?.charAt(0) || '?'}
                </div>
              )}
            </div>
            <p className={`font-semibold mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{recipientName}</p>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Start a conversation with {recipientName}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex items-center gap-3 my-4">
                  <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />
                  <span className={`text-xs font-medium px-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    {formatDateSeparator(group.msgs[0].created_at)}
                  </span>
                  <div className={`flex-1 h-px ${darkMode ? 'bg-slate-700/50' : 'bg-gray-200'}`} />
                </div>
                {group.msgs.map((msg) => {
                  const isOwn = msg.sender_id === currentUserId;
                  const isOptimistic = msg.id.startsWith('temp-');
                  const isCallEvent = msg.message_type && msg.message_type !== 'text';

                  if (isCallEvent) {
                    const isMissed = msg.message_type === 'missed_call';
                    const isDeclined = msg.message_type === 'declined_call';
                    const isCompleted = msg.message_type === 'completed_call';
                    return (
                      <div key={msg.id} className="flex justify-center mb-3">
                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${
                          isMissed || isDeclined
                            ? darkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'
                            : darkMode ? 'bg-slate-700/50 text-slate-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {isMissed || isDeclined ? (
                            <PhoneOff size={14} />
                          ) : (
                            <Phone size={14} />
                          )}
                          <span>{msg.content}</span>
                          <span className={`${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex mb-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] ${isOwn ? 'order-2' : ''}`}>
                        <div className={`px-4 py-2.5 rounded-2xl ${
                          isOwn
                            ? `bg-blue-500 text-white rounded-br-md ${isOptimistic ? 'opacity-70' : ''}`
                            : darkMode
                              ? 'bg-slate-700/80 text-slate-200 rounded-bl-md'
                              : 'bg-white text-gray-900 rounded-bl-md shadow-sm border border-gray-100'
                        }`}>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <p className={`text-[10px] mt-1 ${isOwn ? 'text-right' : ''} ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                          {isOptimistic ? 'Sending...' : formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className={`flex-shrink-0 p-3 border-t ${darkMode ? 'bg-slate-800/60 border-slate-700/50' : 'bg-white border-gray-200'}`}>
        {sendError && (
          <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between">
            <p className="text-xs text-red-400">{sendError}</p>
            <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-300 ml-2 text-xs font-medium">Dismiss</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => { setNewMessage(e.target.value); if (sendError) setSendError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className={`w-full px-4 py-2.5 rounded-2xl resize-none text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ${
                darkMode
                  ? 'bg-slate-700/60 border border-slate-600/50 text-white placeholder-slate-500'
                  : 'bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
              style={{ maxHeight: 120 }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              newMessage.trim()
                ? 'bg-blue-500 hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20'
                : darkMode ? 'bg-slate-700/60 text-slate-500' : 'bg-gray-200 text-gray-400'
            }`}
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
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .neq('id', user.id)
      .order('full_name');
    setMembers((data || []).map(p => ({ id: p.id, name: p.full_name || 'Unknown', avatar: p.avatar_url || undefined })));
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
