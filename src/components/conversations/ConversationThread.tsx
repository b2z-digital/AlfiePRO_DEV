import React, { useRef, useEffect } from 'react';
import { X, Star, Archive, Trash2, Reply, Forward, ChevronRight, MoveHorizontal as MoreHorizontal, Bell, Paperclip, Download, ExternalLink } from 'lucide-react';

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

interface ConversationThreadProps {
  notification: Notification;
  activeTab: string;
  onClose: () => void;
  onReply: (notification: Notification) => void;
  onForward: (notification: Notification) => void;
  onStar: (notification: Notification) => void;
  onArchive: (notification: Notification) => void;
  onDelete: (id: string, isSent: boolean) => void;
  darkMode: boolean;
}

const UserAvatar = ({ name, avatarUrl, size = 48 }: { name: string; avatarUrl?: string; size?: number }) => {
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

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover ring-2 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold bg-gradient-to-br ${colors[colorIdx]} ring-2 ring-white/10`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  );
};

const getTypeConfig = (type: string) => {
  switch (type) {
    case 'race_results': return { label: 'Results', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    case 'club_news': return { label: 'News', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    case 'membership': return { label: 'Membership', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    case 'alert': return { label: 'Alert', color: 'bg-red-500/10 text-red-400 border-red-500/20' };
    case 'meeting_invitation': return { label: 'Meeting', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
    default: return null;
  }
};

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  notification,
  activeTab,
  onClose,
  onReply,
  onForward,
  onStar,
  onArchive,
  onDelete,
  darkMode,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const senderName = notification.sender_name || 'System';
  const typeConfig = getTypeConfig(notification.type);
  const isSent = activeTab === 'sent';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [notification.id]);

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/40">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 bg-slate-900/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex -space-x-2">
            <UserAvatar
              name={senderName}
              avatarUrl={notification.sender_avatar_url}
              size={36}
            />
            {isSent && notification.recipient_name && (
              <UserAvatar
                name={notification.recipient_name}
                avatarUrl={notification.recipient_avatar_url}
                size={36}
              />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">
              {isSent ? (notification.recipient_name || 'Unknown') : senderName}
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {notification.subject}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onStar(notification)}
            className={`p-2 rounded-lg transition-all ${
              notification.is_starred
                ? 'text-amber-400 hover:bg-amber-400/10'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
            }`}
            title={notification.is_starred ? 'Remove star' : 'Star'}
          >
            <Star size={16} className={notification.is_starred ? 'fill-amber-400' : ''} />
          </button>
          <button
            onClick={() => onArchive(notification)}
            className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-lg transition-all"
            title="Archive"
          >
            <Archive size={16} />
          </button>
          <button
            onClick={() => onDelete(notification.id, isSent)}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
          <div className="w-px h-5 bg-slate-700/50 mx-1" />
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800/60 rounded-lg transition-all"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
          <div className="flex items-start gap-4">
            <UserAvatar
              name={senderName}
              avatarUrl={notification.sender_avatar_url}
              size={48}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-semibold text-white">{senderName}</span>
                {notification.club_name && (
                  <span className="inline-flex items-center px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md text-[11px] text-cyan-400 font-medium">
                    {notification.club_name}
                  </span>
                )}
                {typeConfig && (
                  <span className={`inline-flex items-center px-2 py-0.5 border rounded-md text-[11px] font-medium ${typeConfig.color}`}>
                    {typeConfig.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {formatFullDate(notification.sent_at)}
              </p>
            </div>
          </div>

          <div className="ml-16">
            <div className="bg-slate-800/40 rounded-2xl rounded-tl-md p-5 border border-slate-700/30">
              <h3 className="text-lg font-semibold text-white mb-4">{notification.subject}</h3>
              <div
                className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed [&_p]:mb-3 [&_a]:text-blue-400 [&_a]:no-underline hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                dangerouslySetInnerHTML={{ __html: notification.body }}
              />

              {notification.link_url && (
                <div className="mt-5 pt-4 border-t border-slate-700/30">
                  <a
                    href={notification.link_url}
                    target={notification.link_url.startsWith('http') ? '_blank' : undefined}
                    rel={notification.link_url.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/20 text-sm font-medium"
                  >
                    <ChevronRight size={16} />
                    View Item
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'inbox' && (
        <div className="px-6 py-4 border-t border-slate-700/40 bg-slate-900/60">
          <div className="flex items-center gap-2">
            {notification.sender_id && (
              <button
                onClick={() => onReply(notification)}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/20 text-sm font-medium"
              >
                <Reply size={15} />
                Reply
              </button>
            )}
            <button
              onClick={() => onForward(notification)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all text-sm font-medium border border-slate-700/50"
            >
              <Forward size={15} />
              Forward
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationThread;
