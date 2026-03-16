import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { supabase, getOrCreateChannel, removeChannelByName } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatViewProps {
  recipientId: string;
  recipientName: string;
  recipientAvatar?: string;
  onBack: () => void;
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

export const ChatView: React.FC<ChatViewProps> = ({ recipientId, recipientName, recipientAvatar, onBack, darkMode }) => {
  const { user } = useAuth();
  const { isImpersonating, effectiveUserId } = useImpersonation();
  const currentUserId = isImpersonating && effectiveUserId ? effectiveUserId : user?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convIdRef = useRef<string | null>(null);

  useEffect(() => {
    convIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (currentUserId && recipientId) {
      findExistingConversation();
    }
  }, [currentUserId, recipientId]);

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
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          last_message_text: '',
          last_message_sender_id: currentUserId,
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (convErr || !conv) {
        console.error('Failed to create conversation:', convErr);
        return null;
      }

      const { error: partErr } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conv.id, user_id: currentUserId },
          { conversation_id: conv.id, user_id: recipientId },
        ]);

      if (partErr) {
        console.error('Failed to add participants:', partErr);
        return null;
      }

      return conv.id;
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

    try {
      let convId = convIdRef.current;

      if (!convId) {
        convId = await createConversation();
        if (!convId) {
          setNewMessage(messageText);
          throw new Error('Failed to create conversation');
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
        throw msgErr;
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
          <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 ${darkMode ? 'border-slate-800' : 'border-white'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{recipientName}</div>
          <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>Connection</div>
        </div>
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
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
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
    </div>
  );
};

export default ChatView;
