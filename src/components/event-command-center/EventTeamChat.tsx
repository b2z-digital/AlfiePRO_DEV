import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, Paperclip, Hash, Lock, ChevronDown, Users, Plus } from 'lucide-react';
import { EventTeamChannel, EventChannelMessage } from '../../types/eventCommandCenter';
import { AddChannelModal } from './AddChannelModal';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { format } from 'date-fns';

interface EventTeamChatProps {
  eventId: string;
  darkMode: boolean;
}

export const EventTeamChat: React.FC<EventTeamChatProps> = ({ eventId, darkMode }) => {
  const [channels, setChannels] = useState<EventTeamChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<EventTeamChannel | null>(null);
  const [messages, setMessages] = useState<EventChannelMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAddChannelModal, setShowAddChannelModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadChannels();
  }, [eventId]);

  useEffect(() => {
    if (channels.length === 0 && !loading) {
      setShowAddChannelModal(true);
    }
  }, [channels, loading]);

  useEffect(() => {
    if (activeChannel) {
      loadMessages();
      setupRealtime();
    }
  }, [activeChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadChannels = async () => {
    try {
      setLoading(true);
      const channelsData = await EventCommandCenterStorage.getEventChannels(eventId);
      setChannels(channelsData);

      if (channelsData.length > 0 && !activeChannel) {
        setActiveChannel(channelsData[0]);
      }
    } catch (error) {
      console.error('Error loading channels:', error);
      addNotification('Failed to load channels', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    if (!activeChannel) return;

    try {
      const messagesData = await EventCommandCenterStorage.getChannelMessages(activeChannel.id);
      setMessages(messagesData);
    } catch (error) {
      console.error('Error loading messages:', error);
      addNotification('Failed to load messages', 'error');
    }
  };

  const setupRealtime = () => {
    if (!activeChannel) return;

    const unsubscribe = EventCommandCenterStorage.subscribeToChannel(activeChannel.id, {
      onMessage: (newMessage) => {
        setMessages((prev) => [...prev, newMessage]);
      },
      onMessageUpdated: (updatedMessage) => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === updatedMessage.id ? updatedMessage : msg))
        );
      },
      onMessageDeleted: (messageId) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      },
    });

    return unsubscribe;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMessage.trim() || !activeChannel || sending) return;

    try {
      setSending(true);

      const mentions = extractMentions(newMessage);

      await EventCommandCenterStorage.sendMessage({
        channel_id: activeChannel.id,
        message: newMessage,
        mentions,
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      addNotification('Failed to send message', 'error');
    } finally {
      setSending(false);
    }
  };

  const extractMentions = (text: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push(match[2]);
    }

    return mentions;
  };

  const handleAddChannel = async (name: string, type: string, isPrivate: boolean) => {
    try {
      const newChannel = await EventCommandCenterStorage.createChannel({
        event_id: eventId,
        name: name,
        type: type as any,
        is_private: isPrivate,
      });

      setChannels([...channels, newChannel]);
      setActiveChannel(newChannel);
      addNotification('Channel created successfully', 'success');
    } catch (error) {
      console.error('Error creating channel:', error);
      addNotification('Failed to create channel', 'error');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(date, 'h:mm a');
    } else if (diffInHours < 7 * 24) {
      return format(date, 'EEE h:mm a');
    } else {
      return format(date, 'MMM d, h:mm a');
    }
  };

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'general':
        return <Hash className="w-4 h-4" />;
      case 'logistics':
      case 'marketing':
      case 'race_management':
      case 'social':
        return <Hash className="w-4 h-4" />;
      default:
        return <Hash className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Channels Sidebar */}
      <div
        className={`w-64 border-r ${
          darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Channels
            </h3>
            <button
              onClick={() => setShowAddChannelModal(true)}
              className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
              title="Add Channel"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setActiveChannel(channel)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${
                    activeChannel?.id === channel.id
                      ? 'bg-blue-600 text-white'
                      : darkMode
                      ? 'text-gray-300 hover:bg-gray-800'
                      : 'text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {channel.is_private ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  getChannelIcon(channel.channel_type)
                )}
                <span className="truncate">{channel.name}</span>
                {channel.unread_count && channel.unread_count > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                    {channel.unread_count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <>
            {/* Channel Header */}
            <div
              className={`px-6 py-4 border-b ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {activeChannel.is_private ? (
                    <Lock className="w-5 h-5 text-gray-500" />
                  ) : (
                    <Hash className="w-5 h-5 text-gray-500" />
                  )}
                  <div>
                    <h2 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {activeChannel.name}
                    </h2>
                    {activeChannel.description && (
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {activeChannel.description}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    ${darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
                  `}
                >
                  <Users className="w-4 h-4" />
                  {activeChannel.members?.length || 0} members
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  {/* Avatar */}
                  {message.user?.avatar_url ? (
                    <img
                      src={message.user.avatar_url}
                      alt={`${message.user.first_name} ${message.user.last_name}`}
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        darkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-700'}`}>
                        {message.user?.first_name?.[0]}
                        {message.user?.last_name?.[0]}
                      </span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {message.user?.first_name} {message.user?.last_name}
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                        {formatMessageTime(message.created_at)}
                      </span>
                      {message.is_edited && (
                        <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          (edited)
                        </span>
                      )}
                    </div>

                    <div className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {message.message}
                    </div>

                    {/* Reactions */}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {message.reactions.map((reaction, idx) => (
                          <button
                            key={idx}
                            className={`
                              flex items-center gap-1 px-2 py-1 rounded-full text-xs
                              ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}
                            `}
                          >
                            <span>{reaction.emoji}</span>
                            <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                              {reaction.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div
              className={`px-6 py-4 border-t ${
                darkMode ? 'border-gray-700' : 'border-gray-200'
              }`}
            >
              <form onSubmit={handleSendMessage} className="flex items-end gap-3">
                <div className="flex-1">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder={`Message #${activeChannel.name}`}
                    rows={1}
                    className={`
                      w-full px-4 py-3 rounded-lg border resize-none
                      ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'}
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                    `}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`p-2 rounded-lg ${
                      darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    className={`p-2 rounded-lg ${
                      darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className={`
                      p-2 rounded-lg
                      ${
                        !newMessage.trim() || sending
                          ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }
                    `}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>
              Select a channel to start chatting
            </p>
          </div>
        )}
      </div>

      <AddChannelModal
        isOpen={showAddChannelModal}
        onClose={() => setShowAddChannelModal(false)}
        onSubmit={handleAddChannel}
        darkMode={darkMode}
      />
    </div>
  );
};
