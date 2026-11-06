import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Star, Archive, Trash2, Reply, Forward, ChevronRight, Bell, ExternalLink, Trophy } from 'lucide-react';
import { sanitizeHtml } from '../../utils/sanitize';
import { AAvatar } from '../alfie/Kit';

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
  const [first, ...rest] = (name || '?').split(' ');
  return <AAvatar url={avatarUrl} first={first} last={rest.join(' ')} size={size} />;
};

const getTypeConfig = (type: string) => {
  switch (type) {
    case 'race_results': case 'results': return { label: 'Results', dot: '#30D158' };
    case 'club_news': return { label: 'News', dot: '#2E7BFF' };
    case 'membership': return { label: 'Membership', dot: '#FF9F0A' };
    case 'alert': return { label: 'Alert', dot: '#FF453A' };
    case 'meeting_invitation': case 'meeting': return { label: 'Meeting', dot: '#40C8C0' };
    default: return null;
  }
};

const Chip = ({ dot, children }: { dot: string; children: React.ReactNode }) => (
  <span className="a-lb-fmt" style={{ height: 22, fontSize: 11.5 }}>
    <span className="inline-block w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: dot }} />
    <span className="truncate max-w-[260px]">{children}</span>
  </span>
);

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
  const navigate = useNavigate();
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

  const headName = isSent ? (notification.recipient_name || 'Unknown') : senderName;
  const headAvatar = isSent ? notification.recipient_avatar_url : notification.sender_avatar_url;
  const isSystem = !isSent && !notification.sender_name;
  const isResults = typeConfig?.label === 'Results';
  const openLink = () => {
    if (!notification.link_url) return;
    if (notification.link_url.startsWith('http')) {
      window.open(notification.link_url, '_blank', 'noopener,noreferrer');
      return;
    }
    let url = notification.link_url;
    if (url.startsWith('/community/chat')) {
      const convId = new URLSearchParams(url.split('?')[1] || '').get('id');
      url = convId ? `/comms?tab=chats&conversationId=${convId}` : '/comms?tab=chats';
    }
    navigate(url);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 border-b a-bd" style={{ padding: '16px 20px' }}>
        {isSystem ? (
          <span className="a-sys" style={{ width: 44, height: 44 }}><Bell size={20} /></span>
        ) : (
          <UserAvatar name={headName} avatarUrl={headAvatar} size={44} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="a-ink text-[16px] font-semibold truncate">{isSystem ? 'AlfiePRO' : headName}</span>
            {notification.club_name && <Chip dot="#2E7BFF">{notification.club_name}</Chip>}
            {typeConfig && <Chip dot={typeConfig.dot}>{typeConfig.label}</Chip>}
          </div>
          <div className="a-dim text-[12.5px] mt-[3px]">{formatFullDate(notification.sent_at)}</div>
        </div>
        <button
          onClick={() => onStar(notification)}
          className={`a-ib ${notification.is_starred ? 'a-txt-a' : ''}`}
          aria-label={notification.is_starred ? 'Remove star' : 'Star'}
          title={notification.is_starred ? 'Remove star' : 'Star'}
        >
          <Star size={18} className={notification.is_starred ? 'fill-current' : ''} />
        </button>
        <button onClick={() => onArchive(notification)} className="a-ib" aria-label="Archive" title="Archive">
          <Archive size={18} />
        </button>
        <button onClick={() => onDelete(notification.id, isSent)} className="a-ib a-ib-d" aria-label="Delete" title="Delete">
          <Trash2 size={18} />
        </button>
        <button onClick={onClose} className="a-ib lg:hidden" aria-label="Close" title="Close">
          <X size={18} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5" style={{ padding: '32px 40px' }}>
          <h2 className="a-display a-ink m-0 text-[26px] font-bold leading-[1.15]">{notification.subject}</h2>
          <div
            className="a-msg-body a-mute text-[15px] leading-[1.6]"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(notification.body) }}
          />
          {notification.link_url && (
            <div className="a-card flex items-center gap-4" style={{ padding: 16, maxWidth: 520 }}>
              <span className="a-tile" style={{ width: 48, height: 48 }}>{isResults ? <Trophy size={22} /> : <ExternalLink size={20} />}</span>
              <div className="flex-1 min-w-0">
                <div className="a-ink text-[15px] font-semibold truncate">{notification.subject.replace(/^Results posted:\s*/i, '')}</div>
                {notification.club_name && <div className="a-dim text-[12.5px] mt-[3px] truncate">{notification.club_name}</div>}
              </div>
              <button onClick={openLink} className="a-btn a-btn-p">
                {notification.link_url.startsWith('http') ? <ExternalLink size={16} /> : <ChevronRight size={16} />}
                {isResults ? 'View results' : 'View item'}
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'inbox' && (
        <div className="flex gap-2.5 border-t a-bd" style={{ padding: '14px 20px' }}>
          {notification.sender_id && (
            <button onClick={() => onReply(notification)} className="a-btn a-btn-p">
              <Reply size={16} />
              Reply
            </button>
          )}
          <button onClick={() => onForward(notification)} className="a-btn">
            <Forward size={16} />
            Forward
          </button>
        </div>
      )}
    </div>
  );
};

export default ConversationThread;
