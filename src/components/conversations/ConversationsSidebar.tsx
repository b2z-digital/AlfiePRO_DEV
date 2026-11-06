import React, { useState } from 'react';
import { Search, Plus, Inbox, Send, FileText, Star, MessageCircle, X, MessageSquare, Trash2, UserPlus, SquareCheck as CheckSquare, Square , Bell } from 'lucide-react';

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
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  onBulkDelete?: (ids: string[], isSent: boolean) => void;
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
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#131c31]" />
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
  onNewChat,
  onDeleteChat,
  onBulkDelete,
  unreadCount,
  darkMode,
  chatConversations,
  selectedChatId,
  onSelectChat,
  unreadChatsCount,
}) => {
  const [swipedChatId, setSwipedChatId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
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
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} />, count: unreadCount || undefined },
    { id: 'sent', label: 'Sent', icon: <Send size={16} /> },
    { id: 'starred', label: 'Starred', icon: <Star size={16} /> },
    { id: 'drafts', label: 'Drafts', icon: <FileText size={16} />, count: drafts.length || undefined },
  ];

  const handlePlusClick = () => {
    if (topLevelTab === 'chats') {
      onNewChat();
    } else {
      onCompose();
    }
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayList.length) {
      setSelectedIds(new Set());
      setSelectionMode(false);
    } else {
      setSelectedIds(new Set(displayList.map(n => n.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0 || !onBulkDelete) return;
    onBulkDelete(Array.from(selectedIds), activeTab === 'sent');
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  return (
    <div className="a-lp flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex flex-col gap-2.5" style={{ padding: '16px 16px 10px' }}>
        <label className="a-field" style={{ height: 40 }}>
          <Search size={16} />
          <input
            type="text"
            placeholder={topLevelTab === 'chats' ? 'Search chats' : 'Search messages'}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button
              onClick={() => onSearchChange('')}
              className="a-dim flex"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </label>

        {topLevelTab === 'inbox' && (
          <div className="a-seg" style={{ display: 'flex' }} role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`a-seg-i flex-1 justify-center ${activeTab === tab.id ? 'a-seg-on' : ''}`}
                style={{ padding: '0 6px', gap: 6 }}
                title={tab.label}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.count && tab.count > 0 && (
                  <span className="a-cnt">{tab.count > 99 ? '99+' : tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-2">
        {topLevelTab === 'chats' ? (
          filteredChats.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={22} />}
              title={searchTerm ? 'No matching chats' : 'No chats yet'}
              subtitle={searchTerm ? 'Try a different search' : 'Start a chat from the Community page'}
            />
          ) : (
            <div className="space-y-0.5">
              {filteredChats.map(chat => {
                const isSelected = selectedChatId === chat.id;
                const showDelete = swipedChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    className="relative group"
                    onMouseLeave={() => setSwipedChatId(null)}
                  >
                    <button
                      onClick={() => onSelectChat(chat)}
                      className={`a-it w-full text-left ${isSelected ? 'a-it-on' : ''}`}
                    >
                      {chat.is_unread && <span className="a-unread" />}
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <UserAvatar
                            name={chat.participant_name}
                            avatarUrl={chat.participant_avatar}
                            size={44}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`a-ink text-[14.5px] truncate ${chat.is_unread ? 'font-semibold' : 'font-medium'}`}>
                              {chat.participant_name}
                            </p>
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              {chat.last_message_at && (
                                <span className={`text-[12px] ${chat.is_unread ? 'a-txt-b' : 'a-dim'}`}>
                                  {formatTimeAgo(chat.last_message_at)}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className={`text-[13px] truncate mt-0.5 pr-6 ${chat.is_unread ? 'a-ink' : 'a-dim'}`}>
                            {chat.last_message_text || 'No messages yet'}
                          </p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/20 text-slate-600 hover:text-red-400"
                      title="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )
        ) : activeTab === 'drafts' ? (
          drafts.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No drafts" subtitle="Saved drafts will appear here" />
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
            icon={activeTab === 'inbox' ? <Inbox size={22} /> : activeTab === 'sent' ? <Send size={22} /> : <Star size={22} />}
            title={searchTerm ? 'No results' : `No ${activeTab} messages`}
            subtitle={searchTerm ? 'Try a different search term' : activeTab === 'inbox' ? 'New messages will appear here' : undefined}
          />
        ) : (
          <>
            {selectionMode && (
              <div className="a-bulkbar flex items-center gap-2 mx-2 mb-1" style={{ padding: '6px 8px' }}>
                <button
                  onClick={toggleSelectAll}
                  className="p-1 rounded hover:bg-slate-700/50 transition-colors"
                  title={selectedIds.size === displayList.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedIds.size === displayList.length ? (
                    <CheckSquare size={16} className="text-blue-400" />
                  ) : (
                    <Square size={16} className="text-slate-400" />
                  )}
                </button>
                <span className="text-xs text-blue-400 font-medium flex-1">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-medium transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <button
                  onClick={cancelSelection}
                  className="p-1 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {(() => {
              const now = new Date();
              const weekAgo = new Date(now.getTime() - 7 * 86400000);
              const groupLabel = (d: string) => {
                const dt = new Date(d);
                if (dt >= weekAgo) return 'This week';
                return dt.getFullYear() === now.getFullYear()
                  ? dt.toLocaleDateString('en-AU', { month: 'long' })
                  : dt.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
              };
              let lastGroup = '';
              return displayList.map(notification => {
                const isSent = activeTab === 'sent';
                const displayName = isSent
                  ? (notification.recipient_name || 'Unknown')
                  : (notification.sender_name || 'AlfiePRO');
                const displayAvatar = isSent
                  ? notification.recipient_avatar_url
                  : notification.sender_avatar_url;
                const isSystem = !isSent && !notification.sender_name;
                const isSelected = selectedId === notification.id;
                const isChecked = selectedIds.has(notification.id);
                const isUnread = !notification.read && activeTab === 'inbox';
                const g = groupLabel(notification.sent_at);
                const showGroup = g !== lastGroup;
                lastGroup = g;
                const sentDate = new Date(notification.sent_at);
                const when = sentDate >= weekAgo ? sentDate.toLocaleDateString('en-AU', { weekday: 'short' }) : `${sentDate.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][sentDate.getMonth()]}`;

                return (
                  <React.Fragment key={notification.id}>
                  {showGroup && <div className="a-ghd">{g}</div>}
                  <div
                    className={`a-it group ${isSelected ? 'a-it-on' : ''} ${isChecked ? 'a-it-chk' : ''}`}
                    onClick={() => {
                      if (selectionMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(notification.id)) next.delete(notification.id);
                          else next.add(notification.id);
                          if (next.size === 0) setSelectionMode(false);
                          return next;
                        });
                      } else {
                        onSelect(notification);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {isUnread && <span className="a-unread" />}
                    <button
                      onClick={(e) => {
                        if (!selectionMode) setSelectionMode(true);
                        toggleSelection(notification.id, e);
                      }}
                      className={`a-it-chkbox ${selectionMode || isChecked ? 'a-it-chkbox-on' : ''}`}
                      aria-label={isChecked ? 'Deselect' : 'Select'}
                    >
                      {isChecked ? (
                        <CheckSquare size={16} className="a-txt-b" />
                      ) : (
                        <Square size={16} className="a-dim" />
                      )}
                    </button>
                    {isSystem ? (
                      <span className="a-sys" style={{ width: 40, height: 40 }}><Bell size={18} /></span>
                    ) : (
                      <UserAvatar name={displayName} avatarUrl={displayAvatar} size={40} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={`a-ink flex-1 truncate text-[14.5px] ${isUnread ? 'font-semibold' : 'font-medium'}`}>{displayName}</span>
                        {notification.is_starred && <Star size={12} className="fill-amber-400 text-amber-400 self-center" />}
                        <span className={`text-[12px] ${isUnread ? 'a-txt-b' : 'a-dim'}`}>{when}</span>
                      </div>
                      <div className={`text-[13.5px] mt-0.5 truncate ${isUnread ? 'a-ink' : 'a-mute'}`}>{notification.subject}</div>
                      <div className="a-dim text-[12.5px] mt-0.5 truncate">{notification.body.replace(/<[^>]*>/g, '').slice(0, 80)}</div>
                      {(notification.club_name || (notification.type && notification.type !== 'general')) && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {notification.club_name && <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: '#2E7BFF' }} /><span className="truncate max-w-[180px]">{notification.club_name}</span></span>}
                          {notification.type && notification.type !== 'general' && <span className="a-lb-fmt capitalize" style={{ height: 22, fontSize: 11.5 }}><span className="inline-block w-[7px] h-[7px] rounded-full" style={{ background: notification.type === 'results' ? '#30D158' : notification.type === 'meeting' ? '#40C8C0' : '#9AA6BD' }} />{notification.type.replace(/_/g, ' ')}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  </React.Fragment>
                );
              });
            })()}
          </>
        )}
      </div>

      <div className="flex-shrink-0 border-t a-bd" style={{ padding: '10px 16px' }}>
        <div className="a-dim flex items-center justify-between text-[12px]">
          {topLevelTab === 'chats' ? (
            <>
              <span>{chatConversations.length} chats</span>
              {unreadChatsCount > 0 && (
                <span className="a-txt-b font-medium">{unreadChatsCount} unread</span>
              )}
            </>
          ) : (
            <>
              <span>{notifications.length} conversations</span>
              {unreadCount > 0 && (
                <span className="a-txt-b font-medium">{unreadCount} unread</span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <span className="a-tile mb-3" style={{ width: 52, height: 52 }}>
      {icon}
    </span>
    <p className="a-ink font-semibold text-[14px]">{title}</p>
    {subtitle && <p className="a-dim text-[12.5px] mt-1">{subtitle}</p>}
  </div>
);

export default ConversationsSidebar;
