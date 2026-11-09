import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Avatar, OfflineBanner, RootHeader, Skeleton, fmtDay } from '../ui';
import { timeAgo, todayISO } from '../data';
import { supabase } from '../../utils/supabase';
import { MGroup, REPORT_REASONS, SocialPost, createPost, hidePost, loadChats, loadFeed, loadHiddenPosts, loadMyGroups, reportPost, toggleLike } from '../club';

/** Big-title header used across the Club screens (back, title, actions). */
export const PageHeader: React.FC<{ title: string; right?: React.ReactNode; onBack?: () => void }> = ({ title, right, onBack }) => {
  const navigate = useNavigate();
  return (
    <>
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => (onBack ? onBack() : window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <Icon name="back" />
        </button>
        <h1 className="m-ptitle m-disp">{title}</h1>
        {right}
      </header>
      <OfflineBanner />
    </>
  );
};

const SHORTCUTS: { key: string; label: string; icon: IconName; bg: string; fg: string; path: string }[] = [
  { key: 'chats', label: 'Chats', icon: 'chat', bg: 'rgba(10,132,255,.16)', fg: '#4DA3FF', path: '/comms' },
  { key: 'members', label: 'Members', icon: 'people', bg: 'rgba(52,199,89,.14)', fg: '#3FC46B', path: '/club/members' },
  { key: 'groups', label: 'Groups', icon: 'club', bg: 'rgba(138,77,255,.16)', fg: '#9C78FF', path: '/club/groups' },
  { key: 'meetings', label: 'Meetings', icon: 'calendar', bg: 'rgba(255,210,94,.16)', fg: '#E0A800', path: '/calendar?show=meetings' },
  { key: 'tasks', label: 'Tasks', icon: 'tasks', bg: 'rgba(77,163,255,.14)', fg: '#3D95FF', path: '/tasks' },
  { key: 'media', label: 'Media', icon: 'image', bg: 'rgba(52,199,89,.14)', fg: '#3FC46B', path: '/media' },
  { key: 'classifieds', label: 'Classifieds', icon: 'tag', bg: 'rgba(255,62,154,.14)', fg: '#FF5FA8', path: '/classifieds' },
  { key: 'news', label: 'News', icon: 'news', bg: 'rgba(255,138,43,.15)', fg: '#FF8A2B', path: '/news' },
  { key: 'shops', label: 'Shops', icon: 'bag', bg: 'var(--m-fill-b)', fg: 'var(--m-ink)', path: '/shops' },
];

/** A post's ⋯ menu: hide it from my feed, or report it to the club's admins. */
const PostMenu: React.FC<{ onHide: () => void; onReport: () => void; onClose: () => void }> = ({ onHide, onReport, onClose }) => (
  <>
    <div className="m-veil" onClick={onClose} />
    <div className="m-sheet" role="dialog" aria-label="Post options">
      <span className="m-grab" />
      <div className="m-card" style={{ overflow: 'hidden' }}>
        <button className="m-li" style={{ width: '100%', background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'left' }} onClick={onHide}>
          <Icon name="close" size={20} />
          <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>Hide this post</b><span className="m-dim" style={{ fontSize: 13 }}>Take it out of your feed</span></span>
        </button>
        <button className="m-li" style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--m-line)', color: 'var(--m-red-ink)', font: 'inherit', textAlign: 'left' }} onClick={onReport}>
          <Icon name="flag" size={20} />
          <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>Report post</b><span className="m-dim" style={{ fontSize: 13 }}>Your club's admins will take a look</span></span>
        </button>
      </div>
      <button className="m-btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Cancel</button>
    </div>
  </>
);

const ReportSheet: React.FC<{ post: SocialPost; onClose: () => void; onDone: () => void }> = ({ post, onClose, onDone }) => {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    if (!reason) return;
    setBusy(true); setErr(null);
    try { await reportPost(post, reason, details.trim() || undefined); onDone(); } catch { setErr(navigator.onLine ? 'Couldn\'t send that. Try again.' : 'No signal. Try again when you\'re back online.'); setBusy(false); }
  };
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="Report post">
        <span className="m-grab" />
        <p style={{ margin: '4px 0 2px', fontSize: 19, fontWeight: 700 }}>Report post</p>
        <p className="m-dim" style={{ margin: '0 0 12px', fontSize: 14 }}>What's wrong with it? Only your club's admins see reports.</p>
        <div className="m-card" style={{ overflow: 'hidden' }} role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r, i) => (
            <button key={r.id} role="radio" aria-checked={reason === r.id} className="m-li" onClick={() => setReason(r.id)}
              style={{ width: '100%', background: 'none', border: 0, borderTop: i ? '1px solid var(--m-line)' : 0, color: 'inherit', font: 'inherit', textAlign: 'left' }}>
              <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600, fontSize: 15 }}>{r.label}</b><span className="m-dim" style={{ fontSize: 13 }}>{r.description}</span></span>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, border: reason === r.id ? '7px solid var(--m-blue)' : '2px solid var(--m-fill-b)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
        {reason && (
          <label style={{ display: 'block', marginTop: 12 }}>
            <span className="m-dim" style={{ fontSize: 13 }}>Anything else? (optional)</span>
            <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} className="m-field" style={{ width: '100%', marginTop: 6, padding: 12, borderRadius: 12, background: 'var(--m-fill)', border: '1px solid var(--m-fill-b)', color: 'var(--m-ink)', font: 'inherit', fontSize: 15, resize: 'none', boxSizing: 'border-box' }} />
          </label>
        )}
        {err && <p style={{ color: 'var(--m-red-ink)', fontSize: 14, margin: '10px 0 0' }}>{err}</p>}
        <button className="m-btn m-btn-p" style={{ width: '100%', marginTop: 14 }} disabled={!reason || busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send report'}</button>
      </div>
    </>
  );
};

const HiddenPost: React.FC<{ onUndo: () => void }> = ({ onUndo }) => (
  <div className="m-card m-row" style={{ gap: 10, padding: '12px 14px' }}>
    <span className="m-dim" style={{ flex: 1, fontSize: 14 }}>Post hidden from your feed</span>
    <button className="m-btn" style={{ height: 36 }} onClick={onUndo}>Undo</button>
  </div>
);

export const PostCard: React.FC<{ post: SocialPost; groupName?: string; mine?: boolean; onLike: (p: SocialPost) => void; onOpenPerson: (id: string) => void; onMore: (p: SocialPost) => void }> = ({ post, groupName, mine, onLike, onOpenPerson, onMore }) => {
  const name = post.author?.full_name || 'Member';
  const images = (post.attachments || []).filter(a => a.file_type === 'image');
  const liked = post.user_reaction === 'like';
  const share = async () => {
    const text = `${name}: ${post.content}`.slice(0, 280);
    try { if (navigator.share) await navigator.share({ text }); } catch { /* dismissed */ }
  };
  return (
    <article className="m-card" style={{ overflow: 'hidden' }}>
      <div className="m-row" style={{ gap: 10, padding: '12px 14px 8px' }}>
        <button style={{ background: 'none', border: 0, padding: 0 }} onClick={() => onOpenPerson(post.author_id)} aria-label={`Open ${name}`}>
          <Avatar name={name} url={post.author?.avatar_url} size={38} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{name}</div>
          <div className="m-dim" style={{ fontSize: 12.5 }}>{groupName ? `${groupName} · ` : ''}{timeAgo(post.created_at)}</div>
        </div>
        {!mine && <button className="m-ibtn" style={{ background: 'none', borderColor: 'transparent' }} aria-label={`More for ${name}'s post`} onClick={() => onMore(post)}><Icon name="more" /></button>}
      </div>
      {post.content && <p style={{ margin: 0, padding: '0 14px 10px', fontSize: 14.5, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{post.content}</p>}
      {post.link_url && !images.length && (
        <a href={post.link_url} target="_blank" rel="noreferrer" className="m-li" style={{ borderTop: '1px solid var(--m-line)' }}>
          {post.link_image_url && <span className="m-thumb" style={{ backgroundImage: `url("${post.link_image_url}")` }} />}
          <span style={{ minWidth: 0 }}>
            <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 14, color: 'var(--m-ink)' }}>{post.link_title || post.link_url}</span>
            {post.link_description && <span className="m-dim m-ell" style={{ display: 'block', fontSize: 12.5 }}>{post.link_description}</span>}
          </span>
        </a>
      )}
      {images.length === 1 && <div className="m-post-grid" style={{ height: 220 }}><span style={{ backgroundImage: `url("${images[0].file_url}")` }} /></div>}
      {images.length >= 2 && (
        <div className="m-post-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <span style={{ backgroundImage: `url("${images[0].file_url}")` }} />
          <span style={{ display: 'grid', gridTemplateRows: images.length > 2 ? '1fr 1fr' : '1fr', gap: 3, background: 'none', alignItems: 'stretch', justifyContent: 'stretch' }}>
            <span style={{ backgroundImage: `url("${images[1].file_url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            {images.length > 2 && (
              <span style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url("${images[2].file_url}")`, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {images.length > 3 ? `+${images.length - 3}` : ''}
              </span>
            )}
          </span>
        </div>
      )}
      <div className="m-post-acts">
        <button onClick={() => onLike(post)} style={liked ? { color: '#FF7DB8' } : undefined} aria-pressed={liked} aria-label="Like">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
          {post.like_count || 0}
        </button>
        <span className="m-row" style={{ gap: 6 }}><Icon name="chat" size={18} />{post.comment_count || 0}</span>
        <button style={{ marginLeft: 'auto' }} onClick={share}><Icon name="share" size={18} />Share</button>
      </div>
    </article>
  );
};

const Composer: React.FC<{ groups: MGroup[]; groupId: string; onClose: () => void; onPosted: () => void }> = ({ groups, groupId, onClose, onPosted }) => {
  const { currentClub } = useAuth();
  const { profile, toast, tap, requireFinancial } = useMobile();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState(groupId);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = React.useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews]);
  const post = async () => {
    if (!text.trim() && !files.length) return;
    if (!requireFinancial()) return;
    setBusy(true);
    try {
      await createPost({ content: text, clubId: currentClub?.clubId, groupId: target || undefined, files });
      tap('success');
      toast('Posted to the club');
      onPosted();
    } catch {
      toast("Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label="New post">
        <span className="m-grab" />
        <div className="m-row" style={{ marginBottom: 10 }}>
          <Avatar name={name || 'Me'} url={profile.avatarUrl} size={36} />
          <div style={{ flex: 1, fontWeight: 600 }}>{name}</div>
          <button className="m-btn m-btn-p" style={{ height: 36 }} disabled={busy || (!text.trim() && !files.length)} onClick={post}>{busy ? 'Posting…' : 'Post'}</button>
        </div>
        {groups.length > 0 && (
          <div className="m-chips" style={{ marginBottom: 10 }}>
            <button className={`m-chip ${!target ? 'm-chip-on' : ''}`} onClick={() => setTarget('')}>Everyone</button>
            {groups.map(g => <button key={g.id} className={`m-chip ${target === g.id ? 'm-chip-on' : ''}`} onClick={() => setTarget(g.id)}>{g.name}</button>)}
          </div>
        )}
        <label style={{ display: 'block' }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Post</span>
          <textarea className="m-textarea" autoFocus placeholder="Share something with the club" value={text} onChange={e => setText(e.target.value)} />
        </label>
        {previews.length > 0 && (
          <div className="m-g" style={{ marginBottom: 10 }}>
            {previews.map((u, i) => <span key={u} style={{ backgroundImage: `url("${u}")` }}><button className="m-heart" aria-label="Remove photo" onClick={() => setFiles(f => f.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button></span>)}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { setFiles(f => [...f, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
        <button className="m-btn m-btn-g" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}><Icon name="image" />Add photos</button>
      </div>
    </>
  );
};

export const ClubHub: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, toast } = useMobile();
  const [groups, setGroups] = useState<MGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [composing, setComposing] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [justHidden, setJustHidden] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<SocialPost | null>(null);
  const [reporting, setReporting] = useState<SocialPost | null>(null);

  useEffect(() => { loadMyGroups(user?.id).then(setGroups); }, [user?.id]);
  useEffect(() => { loadHiddenPosts(user?.id).then(setHidden).catch(() => {}); }, [user?.id]);
  const hide = async (p: SocialPost, on: boolean) => {
    if (!user?.id) return;
    setJustHidden(s => { const n = new Set(s); if (on) n.add(p.id); else n.delete(p.id); return n; });
    if (!(await hidePost(user.id, p.id, on))) {
      setJustHidden(s => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; });
      toast("Couldn't do that. Try again.");
    } else if (!on) setHidden(h => { const n = new Set(h); n.delete(p.id); return n; });
  };
  useEffect(() => { loadChats(user?.id).then(c => setChatUnread(c.filter(x => x.unread).length)).catch(() => {}); }, [user?.id]);
  const reload = React.useCallback(() => {
    setPosts(null);
    loadFeed(groupId || undefined).then(setPosts).catch(() => setPosts([]));
  }, [groupId]);
  useEffect(() => { reload(); }, [reload]);

  const groupName = (id?: string) => groups.find(g => g.id === id)?.name;
  const like = async (p: SocialPost) => {
    const was = p.user_reaction === 'like';
    setPosts(list => (list || []).map(x => x.id === p.id ? { ...x, user_reaction: was ? undefined : 'like', like_count: Math.max(0, (x.like_count || 0) + (was ? -1 : 1)) } : x));
    try { await toggleLike(p.id); } catch { toast("Couldn't save that. Try again."); reload(); }
  };
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';
  const { currentClub } = useAuth();
  const { calendar, memberIds } = useMobile();
  const [counts, setCounts] = useState<{ members?: number; tasks?: number; media?: number; classifieds?: number }>({});
  useEffect(() => {
    const clubId = currentClub?.clubId;
    if (!clubId) return;
    Promise.all([
      supabase.from('members').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
      memberIds.length ? supabase.from('club_tasks').select('id', { count: 'exact', head: true }).eq('club_id', clubId).in('assignee_id', memberIds).neq('status', 'completed') : Promise.resolve({ count: 0 } as any),
      supabase.from('event_media').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('media_type', 'image'),
      supabase.from('classifieds').select('id', { count: 'exact', head: true }).eq('status', 'active').gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()),
    ]).then(([m, t, me, c]) => setCounts({ members: m.count ?? undefined, tasks: t.count ?? undefined, media: me.count ?? undefined, classifieds: c.count ?? undefined })).catch(() => {});
  }, [currentClub?.clubId, memberIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextMeeting = calendar.find(i => i.kind === 'meeting' && i.date >= todayISO());
  const subs: Record<string, string> = {
    chats: chatUnread ? `${chatUnread} unread` : 'Messages',
    members: counts.members != null ? `${counts.members} people` : 'People',
    groups: groups.length ? `${groups.length} group${groups.length === 1 ? '' : 's'}` : 'Join one',
    meetings: nextMeeting ? fmtDay(nextMeeting.date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'None booked',
    tasks: counts.tasks ? `${counts.tasks} for you` : 'All clear',
    media: counts.media != null ? `${counts.media} photos` : 'Photos',
    classifieds: counts.classifieds ? `${counts.classifieds} new` : 'Buy and sell',
    news: 'Club news',
    shops: 'Suppliers',
  };

  return (
    <div className="m-stack">
      <RootHeader title="Club" right={<button className="m-ibtn" aria-label="Search people" onClick={() => navigate('/comms?new=1')}><Icon name="search" /></button>} />
      <div className="m-club-grid">
        {SHORTCUTS.map(sc => (
          <button key={sc.key} className="m-card" onClick={() => navigate(sc.path)} style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, textAlign: 'left', position: 'relative' }}>
            <span className="m-tile" style={{ width: 36, height: 36, borderRadius: 11, background: sc.bg, color: sc.fg }}><Icon name={sc.icon} size={19} /></span>
            <span style={{ minWidth: 0, width: '100%' }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{sc.label}</span>
              <span className="m-dim m-ell" style={{ display: 'block', fontSize: 11.5 }}>{subs[sc.key] || '\u00a0'}</span>
            </span>
            {sc.key === 'chats' && chatUnread > 0 && <b className="m-badge" style={{ top: 8, right: 8 }}>{chatUnread}</b>}
          </button>
        ))}
      </div>
      <div className="m-chips" id="m-club-chips">
        <button className={`m-chip ${!groupId ? 'm-chip-on' : ''}`} onClick={() => setGroupId('')}>Everyone</button>
        {groups.map(g => <button key={g.id} className={`m-chip ${groupId === g.id ? 'm-chip-on' : ''}`} onClick={() => setGroupId(g.id)}>{g.name}</button>)}
      </div>
      <button className="m-card m-row" style={{ gap: 10, padding: '10px 12px', textAlign: 'left', color: 'inherit' }} onClick={() => setComposing(true)}>
        <Avatar name={name} url={profile.avatarUrl} size={34} />
        <span className="m-dim" style={{ flex: 1, fontSize: 14.5 }}>Share something with the club</span>
        <Icon name="image" className="m-mut" />
      </button>
      {posts === null ? (
        <><Skeleton h={260} /><Skeleton h={200} /></>
      ) : posts.length === 0 ? (
        <div className="m-card m-empty">Nothing here yet. Be the first to share something.</div>
      ) : posts.filter(p => !hidden.has(p.id) || justHidden.has(p.id)).map(p => (justHidden.has(p.id)
        ? <HiddenPost key={p.id} onUndo={() => void hide(p, false)} />
        : <PostCard key={p.id} post={p} groupName={groupName(p.group_id)} mine={p.author_id === user?.id} onLike={like} onOpenPerson={id => navigate(`/skipper/${id}`)} onMore={setMenuFor} />
      ))}
      {menuFor && <PostMenu onClose={() => setMenuFor(null)} onHide={() => { const p = menuFor; setMenuFor(null); void hide(p, true); }} onReport={() => { setReporting(menuFor); setMenuFor(null); }} />}
      {reporting && <ReportSheet post={reporting} onClose={() => setReporting(null)} onDone={() => { const p = reporting; setReporting(null); toast('Thanks. Your club\'s admins will take a look.'); void hide(p, true); }} />}
      {composing && <Composer groups={groups} groupId={groupId} onClose={() => setComposing(false)} onPosted={() => { setComposing(false); reload(); }} />}
    </div>
  );
};

export default ClubHub;
