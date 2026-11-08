import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { MNotification, loadNotifications, markNotificationsRead, stripHtml, timeAgo } from '../data';
import { mapAppRoute } from '../../lib/native/deepLinks';
import { Icon, IconName } from '../icons';
import { Skeleton, SubHeader } from '../ui';

type Filter = 'all' | 'racing' | 'messages' | 'club';

const kindOf = (n: MNotification): { f: Filter; icon: IconName; bg: string; fg: string } => {
  const t = `${n.type} ${n.category || ''}`.toLowerCase();
  if (/result/.test(t)) return { f: 'racing', icon: 'trophy', bg: 'rgba(255,138,43,.15)', fg: '#FFA65C' };
  if (/race|calendar|event|reminder|pro_duty/.test(t)) return { f: 'racing', icon: 'calendar', bg: 'rgba(10,132,255,.15)', fg: '#4DA3FF' };
  if (/message|chat|inquir/.test(t)) return { f: 'messages', icon: 'chat', bg: 'rgba(138,77,255,.16)', fg: '#B08CFF' };
  if (/classified/.test(t)) return { f: 'club', icon: 'tag', bg: 'rgba(255,62,154,.14)', fg: '#FF7DB8' };
  if (/task/.test(t)) return { f: 'club', icon: 'tasks', bg: 'rgba(52,199,89,.14)', fg: '#5FD47F' };
  if (/live|stream/.test(t)) return { f: 'club', icon: 'tv', bg: 'rgba(255,59,48,.15)', fg: '#FF6B61' };
  return { f: 'club', icon: 'news', bg: 'var(--m-fill)', fg: 'var(--m-ink)' };
};

const Group: React.FC<{ title: string; list: MNotification[]; onOpen: (n: MNotification) => void }> = ({ title, list, onOpen }) => list.length === 0 ? null : (
  <>
    <p className="m-lb m-dim" style={{ margin: '6px 0 0' }}>{title}</p>
    <div className="m-card">
      {list.map(n => {
        const k = kindOf(n);
        return (
          <button key={n.id} className="m-li" onClick={() => onOpen(n)}>
            <span className="m-tile" style={{ background: k.bg, color: k.fg }}><Icon name={k.icon} size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stripHtml(n.subject) || 'AlfiePRO'}</div>
              <div className="m-mut" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stripHtml(n.body).slice(0, 120)} · {timeAgo(n.created_at)}</div>
            </div>
            {!n.read && <span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--m-blue)', flexShrink: 0 }} />}
          </button>
        );
      })}
    </div>
  </>
);

export const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshUnread } = useMobile();
  const [items, setItems] = useState<MNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { loadNotifications(user?.id).then(setItems); }, [user?.id]);

  const shown = useMemo(() => (items || []).filter(n => filter === 'all' || kindOf(n).f === filter), [items, filter]);
  const today = new Date().toDateString();
  const todayItems = shown.filter(n => new Date(n.created_at).toDateString() === today);
  const earlier = shown.filter(n => new Date(n.created_at).toDateString() !== today);

  const markAll = async () => {
    const ids = (items || []).filter(n => !n.read).map(n => n.id);
    setItems(list => (list || []).map(n => ({ ...n, read: true })));
    await markNotificationsRead(ids);
    refreshUnread();
  };

  const openN = async (n: MNotification) => {
    if (!n.read) { setItems(list => (list || []).map(x => x.id === n.id ? { ...x, read: true } : x)); markNotificationsRead([n.id]).then(refreshUnread); }
    const route = n.link_url && n.link_url.startsWith('/') ? mapAppRoute(n.link_url) : kindOf(n).f === 'messages' ? '/comms' : null;
    if (route) navigate(route);
  };

  return (
    <div className="m-stack">
      <SubHeader title="Notifications" right={<button className="m-btn" style={{ height: 36, padding: '0 6px', background: 'none', color: 'var(--m-blue-ink)' }} onClick={markAll}>Mark all read</button>} />
      <div className="m-chips">
        {(['all', 'racing', 'messages', 'club'] as Filter[]).map(f => (
          <button key={f} className={`m-chip ${filter === f ? 'm-chip-on' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
        ))}
      </div>
      {items === null ? <><Skeleton h={70} /><Skeleton h={70} /><Skeleton h={70} /></> :
        shown.length === 0 ? <div className="m-card m-empty">You're all caught up.</div> : (
          <>
            <Group title="Today" list={todayItems} onOpen={openN} />
            <Group title="Earlier" list={earlier} onOpen={openN} />
          </>
        )}
    </div>
  );
};
