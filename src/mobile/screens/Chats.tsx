import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useVoiceCall } from '../../contexts/VoiceCallContext';
import { supabase } from '../../utils/supabase';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, fmtDay } from '../ui';
import { myResultFor } from '../data';
import { ordinal } from './Home';
import { PageHeader } from './Club';
import {
  MChat, MMessage, chatTime, findDirectConversation, fullName, isOnline, loadChats, loadMessages, markChatRead, sendChatMessage,
} from '../club';

/* ─────────────── Inbox ─────────────── */

export const ChatsInbox: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [chats, setChats] = useState<MChat[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [q, setQ] = useState('');
  const [picking, setPicking] = useState(params.get('new') === '1');

  // Desktop-style deep links (/comms?chatWith=…) open the thread directly
  useEffect(() => {
    const chatWith = params.get('chatWith') || params.get('recipientId');
    if (chatWith) navigate(`/comms/chat/${chatWith}${params.get('conversationId') ? `?c=${params.get('conversationId')}` : ''}`, { replace: true });
  }, [params, navigate]);

  useEffect(() => {
    let alive = true;
    const load = () => loadChats(user?.id).then(c => alive && setChats(c)).catch(() => alive && setChats([]));
    load();
    if (!user?.id) return;
    const ch = supabase
      .channel(`m-inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load())
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [user?.id]);

  const unreadCount = (chats || []).filter(c => c.unread).length;
  const shown = (chats || []).filter(c => (filter === 'all' || c.unread) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.lastText.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="m-stack">
      <PageHeader title="Chats" />
      <label className="m-search">
        <Icon name="search" size={17} />
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search chats</span>
        <input placeholder="Search chats and people" value={q} onChange={e => setQ(e.target.value)} />
      </label>
      <div className="m-chips">
        <button className={`m-chip ${filter === 'all' ? 'm-chip-on' : ''}`} onClick={() => setFilter('all')}>All</button>
        <button className={`m-chip ${filter === 'unread' ? 'm-chip-on' : ''}`} onClick={() => setFilter('unread')}>Unread{unreadCount ? ` ${unreadCount}` : ''}</button>
      </div>
      {chats === null ? <Skeleton h={320} /> : shown.length === 0 ? (
        <div className="m-card m-empty">{q || filter === 'unread' ? 'No chats match.' : 'No chats yet. Start one with the pencil button.'}</div>
      ) : (
        <div className="m-card">
          {shown.map(c => (
            <button key={c.id} className="m-li" onClick={() => navigate(`/comms/chat/${c.otherId}?c=${c.id}`)}>
              <span className={c.online ? 'm-on-dot' : ''} style={{ display: 'flex' }}><Avatar name={c.name} url={c.avatar} size={46} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="m-row" style={{ gap: 8 }}>
                  <span className="m-ell" style={{ fontWeight: c.unread ? 700 : 600, fontSize: 15, flex: 1 }}>{c.name}</span>
                  <span className="m-dim" style={{ fontSize: 12 }}>{chatTime(c.lastAt)}</span>
                </span>
                <span className="m-row" style={{ gap: 8, marginTop: 2 }}>
                  <span className={`m-ell ${c.unread ? '' : 'm-mut'}`} style={{ flex: 1, fontSize: 13.5 }}>
                    {c.lastSenderId === user?.id ? 'You: ' : ''}{c.lastText || 'Say hello'}
                  </span>
                  {c.unread && <span className="m-cnt">1</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button className="m-fab" aria-label="New chat" onClick={() => setPicking(true)}><Icon name="edit" size={24} /></button>
      {picking && <PeoplePicker onClose={() => setPicking(false)} onPick={id => navigate(`/comms/chat/${id}`)} />}
    </div>
  );
};

/* ─────────────── New chat: club members and connections ─────────────── */

const PeoplePicker: React.FC<{ onClose: () => void; onPick: (userId: string) => void }> = ({ onClose, onPick }) => {
  const { user, currentClub } = useAuth();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<{ id: string; name: string; avatar?: string; online: boolean }[] | null>(null);
  useEffect(() => {
    (async () => {
      const ids = new Set<string>();
      if (currentClub?.clubId) {
        const { data } = await supabase.from('members').select('user_id').eq('club_id', currentClub.clubId).not('user_id', 'is', null);
        (data || []).forEach((m: any) => ids.add(m.user_id));
      }
      if (user?.id) {
        const { data } = await supabase.from('social_connections').select('user_id, connected_user_id')
          .or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`).eq('status', 'accepted');
        (data || []).forEach((c: any) => ids.add(c.user_id === user.id ? c.connected_user_id : c.user_id));
        ids.delete(user.id);
      }
      if (!ids.size) { setPeople([]); return; }
      const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url, last_seen').in('id', [...ids]);
      setPeople((profiles || []).map((p: any) => ({ id: p.id, name: fullName(p) || 'Member', avatar: p.avatar_url || undefined, online: isOnline(p.last_seen) }))
        .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)));
    })().catch(() => setPeople([]));
  }, [user?.id, currentClub?.clubId]);
  const shown = (people || []).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="New chat" style={{ height: '82dvh' }}>
        <span className="m-grab" />
        <div className="m-row" style={{ marginBottom: 10 }}>
          <div className="m-disp" style={{ flex: 1, fontSize: 21, fontWeight: 700 }}>New chat</div>
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <label className="m-search" style={{ marginBottom: 10 }}>
          <Icon name="search" size={17} />
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search people</span>
          <input autoFocus placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} />
        </label>
        {people === null ? <Skeleton h={240} /> : shown.length === 0 ? <div className="m-empty">No one found.</div> : (
          <div className="m-card">
            {shown.slice(0, 80).map(p => (
              <button key={p.id} className="m-li" onClick={() => onPick(p.id)}>
                <span className={p.online ? 'm-on-dot' : ''} style={{ display: 'flex' }}><Avatar name={p.name} url={p.avatar} size={40} /></span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                <Icon name="chevron" className="m-dim" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

/* ─────────────── Thread ─────────────── */

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const ChatThread: React.FC = () => {
  const { userId: them = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, tap, calendar, memberIds, profile } = useMobile();
  const { startCall } = useVoiceCall();
  const [attaching, setAttaching] = useState(false);
  const me = user?.id || '';
  const [person, setPerson] = useState<{ name: string; avatar?: string; online: boolean } | null>(null);
  const [convId, setConvId] = useState<string | null>(params.get('c'));
  const [messages, setMessages] = useState<MMessage[] | null>(null);
  const [text, setText] = useState(params.get('draft') || '');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const convRef = useRef<string | null>(convId);

  useEffect(() => {
    supabase.from('profiles').select('first_name, last_name, avatar_url, last_seen').eq('id', them).maybeSingle()
      .then(({ data }) => setPerson({ name: fullName(data) || 'Member', avatar: data?.avatar_url || undefined, online: isOnline(data?.last_seen) }));
  }, [them]);

  useEffect(() => {
    if (!me || !them) return;
    let alive = true;
    (async () => {
      const id = convId || await findDirectConversation(me, them);
      if (!alive) return;
      convRef.current = id;
      setConvId(id);
      if (!id) { setMessages([]); return; }
      const msgs = await loadMessages(id);
      if (alive) setMessages(msgs);
      void markChatRead(id, me);
    })().catch(() => alive && setMessages([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, them]);

  // Live messages
  useEffect(() => {
    if (!convId || !me) return;
    const ch = supabase
      .channel(`m-chat-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${convId}` }, (payload: any) => {
        const m = payload.new as MMessage;
        setMessages(list => (list || []).some(x => x.id === m.id) ? list : [...(list || []).filter(x => !(x.id.startsWith('temp-') && x.content === m.content && x.sender_id === m.sender_id)), m]);
        if (m.sender_id !== me) { void markChatRead(convId, me); tap(); }
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [convId, me, tap]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || !me || sending) return;
    setText('');
    setSending(true);
    const temp: MMessage = { id: `temp-${Date.now()}`, conversation_id: convRef.current || '', sender_id: me, content: body, created_at: new Date().toISOString() };
    setMessages(list => [...(list || []), temp]);
    try {
      const { convId: id, message } = await sendChatMessage(convRef.current, me, them, body);
      if (!convRef.current) { convRef.current = id; setConvId(id); }
      setMessages(list => (list || []).some(x => x.id === message.id) ? (list || []).filter(x => x.id !== temp.id) : (list || []).map(x => x.id === temp.id ? message : x));
    } catch {
      setMessages(list => (list || []).filter(x => x.id !== temp.id));
      setText(body);
      toast("Message didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  const groups = useMemo(() => {
    const out: { day: string; items: MMessage[] }[] = [];
    (messages || []).forEach(m => {
      const day = dayLabel(m.created_at);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(m);
    });
    return out;
  }, [messages]);

  const name = person?.name || '';
  return (
    <div className="m-thread">
      <header className="m-top m-stick-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/comms'))}><Icon name="back" /></button>
        <button className="m-row" style={{ flex: 1, minWidth: 0, gap: 10, background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => navigate(`/skipper/${them}`)}>
          <span className={person?.online ? 'm-on-dot' : ''} style={{ display: 'flex' }}><Avatar name={name || '?'} url={person?.avatar} size={38} /></span>
          <span style={{ minWidth: 0 }}>
            <span className="m-ell" style={{ display: 'block', fontWeight: 700, fontSize: 15.5 }}>{name}</span>
            <span style={{ display: 'block', fontSize: 12, color: person?.online ? '#5FD47F' : 'var(--m-dim)' }}>{person ? (person.online ? 'Online' : 'Offline') : ''}</span>
          </span>
        </button>
        <button className="m-ibtn" aria-label={`Call ${name}`} onClick={() => { tap('medium'); void startCall(them, name, person?.avatar, convRef.current || undefined, undefined, false); }}><Icon name="phone" size={19} /></button>
      </header>
      {messages === null ? <Skeleton h={200} /> : messages.length === 0 ? (
        <div className="m-empty">Say hello to {name.split(' ')[0] || 'them'}.</div>
      ) : groups.map(g => (
        <React.Fragment key={g.day}>
          <div className="m-dim" style={{ textAlign: 'center', fontSize: 12, margin: '6px 0' }}>{g.day}</div>
          {g.items.map(m => (m.message_type && m.message_type !== 'text' ? (
            <div key={m.id} className="m-row m-dim" style={{ alignSelf: 'center', gap: 6, fontSize: 12.5, color: /missed|declined/.test(m.message_type) ? '#FF6B6B' : undefined }}>
              <Icon name="phone" size={14} />{m.content} · {new Date(m.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}
            </div>
          ) : (
            <div key={m.id} className={`m-mi ${m.sender_id === me ? 'm-mi-out' : 'm-mi-in'}`} style={m.id.startsWith('temp-') ? { opacity: .7 } : undefined}>{m.content}</div>
          )))}
        </React.Fragment>
      ))}
      <div ref={endRef} />
      <form className="m-comp" onSubmit={e => { e.preventDefault(); void send(); }}>
        <button type="button" className="m-cb" aria-label="Share a result" onClick={() => setAttaching(true)}><Icon name="plus" /></button>
        <label style={{ flex: 1, display: 'flex' }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Message</span>
          <input placeholder={`Message ${name.split(' ')[0] || ''}`.trim()} value={text} onChange={e => setText(e.target.value)} enterKeyHint="send" />
        </label>
        <button type="submit" className="m-cb m-cb-p" aria-label="Send" disabled={!text.trim() || sending}><Icon name="send" size={19} strokeWidth={2.2} /></button>
      </form>
      {attaching && (
        <ShareResultSheet
          results={calendar.map(i => myResultFor(i, memberIds, `${profile.firstName} ${profile.lastName}`.trim())).filter(Boolean).sort((a, b) => b!.item.date.localeCompare(a!.item.date)).slice(0, 8) as NonNullable<ReturnType<typeof myResultFor>>[]}
          onClose={() => setAttaching(false)}
          onPick={line => { setAttaching(false); setText(t => (t ? `${t} ${line}` : line)); }}
        />
      )}
    </div>
  );
};

/** Drop one of my results into the message box. */
const ShareResultSheet: React.FC<{ results: NonNullable<ReturnType<typeof myResultFor>>[]; onClose: () => void; onPick: (line: string) => void }> = ({ results, onClose, onPick }) => (
  <>
    <div className="m-veil" onClick={onClose} />
    <div className="m-sheet" role="dialog" aria-label="Share a result">
      <span className="m-grab" />
      <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Share a result</div>
      {results.length === 0 ? <div className="m-empty">Your results will show here after you race.</div> : (
        <div className="m-card">
          {results.map(r => {
            const place = `${r.position}${ordinal(r.position)} of ${r.of}`;
            return (
              <button key={r.item.key} className="m-li" onClick={() => onPick(`${r.item.title}: I finished ${place}${r.points != null ? ` (${r.points} pts)` : ''}.`)}>
                <Icon name="trophy" className="m-dim" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14.5 }}>{r.item.title}</span>
                  <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{fmtDay(r.item.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </span>
                <span className="m-disp" style={{ fontWeight: 700 }}>{r.position}{ordinal(r.position)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </>
);
