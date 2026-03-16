import React from 'react';
import { Search, Plus, Inbox, Send, FileText, Star, MessageCircle, X, MessageSquare } from 'lucide-react';

export type SidebarTab = 'inbox' | 'sent' | 'starred' | 'drafts';
export type TopLevelTab = 'inbox' | 'chats';

interface Notification {
  id: string;
  user_id: string;
  club_id: string | null;
  type: string;
  subject: string;
  body: string;
  read: boolean;
  sent_at: string;
  sender_id?: string;
  sender_name?: string;
  sender_avatar_url?: string;
  recipient_name?: string;
  recipient_avatar_url?: string;
  is_starred?: boolean;
  is_archived?: boolean;
  club_name?: string;
  link_url?: string | null;
}

export interface ChatConversation {
  id: string;
  last_message_text: string;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  participant_name: string;
  participant_avatar?: string;
  participant_id: string;
  is_unread: boolean;
}

interface ConversationsSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  topLevelTab: TopLevelTab;
  onTopLevelTabChange: (tab: TopLevelTab) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  notifications: Notification[];
  sentNotifications: Notification[];
  drafts: any[];
  selectedId: string | null;
  onSelect: (notification: Notification) => void;
  onLoadDraft: (draft: any) => void;
  onCompose: () => void;
  unreadCount: number;
  darkMode: boolean;
  chatConversations: ChatConversation[];
  selectedChatId: string | null;
  onSelectChat: (chat: ChatConversation) => void;
  unreadChatsCount: number;
}

const UserAvatar = ({ name, avatarUrl, size = 48, isOnline }: { name: string; avatarUrl?: string; size?: number; isOnline?: boolean }) => {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = [
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-sky-500 to-blue-500',
    'from-green-500 to-emerald-500',
  ];
  const colorIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;

  return (
    <div className="relative flex-shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="rounded-full object-cover ring-2 ring-white/10"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className={`rounded-full flex items-center justify-center text-white font-semibold bg-gradient-to-br ${colors[colorIdx]} ring-2 ring-white/10`}
          style={{ width: size, height: size, fontSize: size * 0.38 }}
        >
          {initials || '?'}
        </div>
      )}
      {isOnline && (
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-[#131c31]" />
      )}
    </div>
  );
};

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const ConversationsSidebar: React.FC<ConversationsSidebarProps> = ({
  activeTab,
  onTabChange,
  topLevelTab,
  onTopLevelTabChange,
  searchTerm,
  onSearchChange,
  notifications,
  sentNotifications,
  drafts,
  selectedId,
  onSelect,
  onLoadDraft,
  onCompose,
  unreadCount,
  darkMode,
  chatConversations,
  selectedChatId,
  onSelectChat,
  unreadChatsCount,
}) => {
  const starredNotifications = notifications.filter(n => n.is_starred);

  const getDisplayList = () => {
    const filter = (list: Notification[]) =>
      list.filter(n =>
        n.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.body.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.sender_name && n.sender_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );

    switch (activeTab) {
      case 'inbox': return filter(notifications);
      case 'sent': return filter(sentNotifications);
      case 'starred': return filter(starredNotifications);
      default: return [];
    }
  };

  const displayList = getDisplayList();

  const filteredChats = chatConversations.filter(c =>
    c.participant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.last_message_text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const tabs: { id: SidebarTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={18} />, count: unreadCount || undefined },
    { id: 'sent', label: 'Sent', icon: <Send size={18} /> },
    { id: 'starred', label: 'Starred', icon: <Star size={18} /> },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={18} />, count: drafts.length || undefined },
  ];

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-800/80 via-slate-800/60 to-slate-900/80 backdrop-blur-sm border-r border-slate-700/50 overflow-hidden">
      <div className="flex-shrink-0 p-4 pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <MessageCircle size={18} className="text-white" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">Conversations</h2>
          </div>
          <button
            onClick={onCompose}
            className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-blue-600/20"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex gap-1 p-1 bg-slate-900/60 rounded-xl border border-slate-700/40">
          <button
            onClick={() => onTopLevelTabChange('inbox')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
              topLevelTab === 'inbox'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <Inbox size={16} />
            Inbox
            {unreadCount > 0 && (
              <span className={`min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                topLevelTab === 'inbox' ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
              }`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => onTopLevelTabChange('chats')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${
              topLevelTab === 'chats'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
            }`}
          >
            <MessageSquare size={16} />
            Chats
            {unreadChatsCount > 0 && (
              <span className={`min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                topLevelTab === 'chats' ? 'bg-white/20 text-white' : 'bg-blue-500 text-white'
              }`}>
                {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            placeholder={topLevelTab === 'chats' ? 'Search chats...' : 'Search conversations...'}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {topLevelTab === 'inbox' && (
          <div className="flex gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700/30">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-slate-700/80 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.icon}
                <span className="hidden xl:inline">{tab.label}</span>
                {tab.count && tab.count > 0 && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    tab.id === 'inbox' ? 'bg-blue-500 text-white' : 'bg-slate-600 text-slate-300'
                  }`}>
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {topLevelTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={32} />}
              title={searchTerm ? 'No matching chats' : 'No chats yet'}
              subtitle={searchTerm ? 'Try a different search' : 'Start a chat from the Community page'}
            />
          ) : (
            <div className="space-y-0.5">
              {filteredChats.map(chat => {
                const isSelected = selectedChatId === chat.id;
                return (
                  <button
                    key={chat.id}
                    onClick={() => onSelectChat(chat)}
                    className={`w-full text-left p-3 rounded-xl transition-all group relative ${
                      isSelected
                        ? 'bg-blue-600/15 border border-blue-500/30'
                        : chat.is_unread
                          ? 'bg-slate-700/30 hover:bg-slate-700/50 border border-transparent'
                          : 'hover:bg-slate-700/30 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <UserAvatar
                          name={chat.participant_name}
                          avatarUrl={chat.participant_avatar}
                          size={44}
                        />
                        {chat.is_unread && (
                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-[#131c31]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm truncate ${chat.is_unread ? 'font-semibold text-white' : 'font-medium text-slate-300'}`}>
                            {chat.participant_name}
                          </p>
                          {chat.last_message_at && (
                            <span className={`text-[11px] ml-2 flex-shrink-0 ${chat.is_unread ? 'text-blue-400 font-medium' : 'text-slate-600'}`}>
                              {formatTimeAgo(chat.last_message_at)}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${chat.is_unread ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                          {chat.last_message_text || 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : activeTab === 'drafts' ? (
          drafts.length === 0 ? (
            <EmptyState icon={<FileText size={32} />} title="No drafts" subtitle="Saved drafts will appear here" />
          ) : (
            <div className="space-y-0.5">
              {drafts.map(draft => (
                <button
                  key={draft.id}
                  onClick={() => onLoadDraft(draft)}
                  className="w-full text-left p-3 rounded-xl hover:bg-slate-700/40 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700/80 flex items-center justify-center flex-shrink-0">
                      <FileText size={18} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-300 truncate">
                          {draft.subject || 'No subject'}
                        </p>
                        <span className="text-[11px] text-slate-600 ml-2 flex-shrink-0">
                          {formatTimeAgo(draft.updated_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {draft.body?.replace(/<[^>]*>/g, '') || 'Empty draft'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : displayList.length === 0 ? (
          <EmptyState
            icon={activeTab === 'inbox' ? <Inbox size={32} /> : activeTab === 'sent' ? <Send size={32} /> : <Star size={32} />}
            title={searchTerm ? 'No results' : `No ${activeTab} messages`}
            subtitle={searchTerm ? 'Try a different search term' : activeTab === 'inbox' ? 'New messages will appear here' : undefined}
          />
        ) : (
          <div className="space-y-0.5">
            {displayList.map(notification => {
              const isSent = activeTab === 'sent';
              const displayName = isSent
                ? (notification.recipient_name || 'Unknown')
                : (notification.sender_name || 'System');
              const displayAvatar = isSent
                ? notification.recipient_avatar_url
                : notification.sender_avatar_url;
              const isSelected = selectedId === notification.id;
              const isUnread = !notification.read && activeTab === 'inbox';

              return (
                <button
                  key={notification.id}
                  onClick={() => onSelect(notification)}
                  className={`w-full text-left p-3 rounded-xl transition-all group relative ${
                    isSelected
                      ? 'bg-blue-600/15 border border-blue-500/30'
                      : isUnread
                        ? 'bg-slate-700/30 hover:bg-slate-700/50 border border-transparent'
                        : 'hover:bg-slate-700/30 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar
                        name={displayName}
                        avatarUrl={displayAvatar}
                        size={44}
                      />
                      {isUnread && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-[#131c31]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate ${isUnread ? 'font-semibold text-white' : 'font-medium text-slate-300'}`}>
                          {displayName}
                        </p>
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {notification.is_starred && (
                            <Star size={12} className="fill-amber-400 text-amber-400" />
                          )}
                          <span className={`text-[11px] ${isUnread ? 'text-blue-400 font-medium' : 'text-slate-600'}`}>
                            {formatTimeAgo(notification.sent_at)}
                          </span>
                        </div>
                      </div>
                      <p className={`text-xs truncate mt-0.5 ${isUnread ? 'text-slate-300 font-medium' : 'text-slate-500'}`}>
                        {notification.subject}
                      </p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">
                        {notification.body.replace(/<[^>]*>/g, '').slice(0, 60)}
                      </p>
                    </div>
                  </div>
                  {notification.club_name && (
                    <div className="mt-2 ml-[56px]">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-[10px] text-cyan-400 font-medium">
                        {notification.club_name}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-3 border-t border-slate-700/50">
        <div className="flex items-center justify-between text-xs text-slate-500">
          {topLevelTab === 'chats' ? (
            <>
              <span>{chatConversations.length} chats</span>
              {unreadChatsCount > 0 && (
                <span className="text-blue-400 font-medium">{unreadChatsCount} unread</span>
              )}
            </>
          ) : (
            <>
              <span>{notifications.length} conversations</span>
              {unreadCount > 0 && (
                <span className="text-blue-400 font-medium">{unreadCount} unread</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4">
    <div className="w-16 h-16 rounded-2xl bg-slate-700/40 flex items-center justify-center mb-4 text-slate-600">
      {icon}
    </div>
    <p className="text-slate-400 font-medium text-sm">{title}</p>
    {subtitle && <p className="text-slate-600 text-xs mt-1">{subtitle}</p>}
  </div>
);

export default ConversationsSidebar;
