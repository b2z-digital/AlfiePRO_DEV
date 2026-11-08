import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Avatar, OfflineBanner, Skeleton } from '../ui';
import { timeAgo } from '../data';
import { MGroup, SocialPost, createPost, loadChats, loadFeed, loadMyGroups, toggleLike } from '../club';

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

const SHORTCUTS: { label: string; icon: IconName; bg: string; fg: string; path: string }[] = [
  { label: 'Chats', icon: 'chat', bg: 'rgba(10,132,255,.16)', fg: '#4DA3FF', path: '/comms' },
  { label: 'Groups', icon: 'club', bg: 'rgba(138,77,255,.16)', fg: '#B08CFF', path: '/club' },
  { label: 'Classifieds', icon: 'tag', bg: 'rgba(255,62,154,.14)', fg: '#FF7DB8', path: '/classifieds' },
  { label: 'News', icon: 'news', bg: 'rgba(255,138,43,.15)', fg: '#FFA65C', path: '/news' },
  { label: 'Media', icon: 'image', bg: 'rgba(52,199,89,.14)', fg: '#5FD47F', path: '/media' },
];

const PostCard: React.FC<{ post: SocialPost; groupName?: string; onLike: (p: SocialPost) => void; onOpenPerson: (id: string) => void }> = ({ post, groupName, onLike, onOpenPerson }) => {
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
  const { profile, unread, toast } = useMobile();
  const [groups, setGroups] = useState<MGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [composing, setComposing] = useState(false);

  useEffect(() => { loadMyGroups(user?.id).then(setGroups); }, [user?.id]);
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

  return (
    <div className="m-stack">
      <PageHeader
        title="Club"
        right={(
          <>
            <button className="m-ibtn" aria-label="Search people" onClick={() => navigate('/comms?new=1')}><Icon name="search" /></button>
            <button className="m-ibtn" aria-label="Notifications" onClick={() => navigate('/notifications')}>
              <Icon name="bell" />
              {unread > 0 && <span className="m-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
          </>
        )}
      />
      <div className="m-scs">
        {SHORTCUTS.map(s => (
          <button key={s.label} className="m-sc" onClick={() => (s.label === 'Groups' ? document.getElementById('m-club-chips')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) : navigate(s.path))}>
            <span style={{ background: s.bg, color: s.fg }}>
              <Icon name={s.icon} size={22} />
              {s.label === 'Chats' && chatUnread > 0 && <b className="m-badge">{chatUnread}</b>}
            </span>
            {s.label}
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
      ) : posts.map(p => (
        <PostCard key={p.id} post={p} groupName={groupName(p.group_id)} onLike={like} onOpenPerson={id => navigate(`/skipper/${id}`)} />
      ))}
      {composing && <Composer groups={groups} groupId={groupId} onClose={() => setComposing(false)} onPosted={() => { setComposing(false); reload(); }} />}
    </div>
  );
};

export default ClubHub;
