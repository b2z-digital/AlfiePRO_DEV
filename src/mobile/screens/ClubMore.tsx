/**
 * Phase 2 board, Club as a tab:
 * - Members and connections: your club, your connections, requests to accept at the top
 * - A group: posts, members and (for moderators) join requests and reported posts
 * - My listings: selling, sold, saved, and buyers' questions
 * Same tables and calls as the web (socialStorage, social_connections, social_group_*, classifieds).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { socialStorage } from '../../utils/socialStorage';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, SubHeader } from '../ui';
import { timeAgo } from '../data';
import { SocialPost, loadFeed, money, toggleLike } from '../club';
import { PostCard } from './Club';

/* ─────────────── Members and connections ─────────────── */

type Conn = { state: 'pending-out' | 'pending-in' | 'connected'; id: string };
interface Person { key: string; userId?: string; memberId?: string; name: string; avatar?: string | null; sub?: string }

export const MembersScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const { memberIds, toast, tap } = useMobile();
  const [tab, setTab] = useState<'club' | 'connections'>('club');
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<Person[] | null>(null);
  const [conns, setConns] = useState<Map<string, Conn>>(new Map());
  const [requests, setRequests] = useState<any[]>([]);
  const [connected, setConnected] = useState<Person[] | null>(null);

  const loadConns = React.useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('social_connections').select('id, user_id, connected_user_id, status').or(`user_id.eq.${user.id},connected_user_id.eq.${user.id}`);
    const m = new Map<string, Conn>();
    ((data as any[]) || []).forEach(c => {
      const other = c.user_id === user.id ? c.connected_user_id : c.user_id;
      m.set(other, { id: c.id, state: c.status === 'accepted' ? 'connected' : c.user_id === user.id ? 'pending-out' : 'pending-in' });
    });
    setConns(m);
    socialStorage.getPendingConnectionRequests().then(r => setRequests(r || [])).catch(() => setRequests([]));
    socialStorage.getConnections().then((list: any[]) => setConnected((list || []).map(c => {
      const p = c.connected_user || {};
      return { key: p.id, userId: p.id, name: p.full_name || 'Member', avatar: p.avatar_url };
    }))).catch(() => setConnected([]));
  }, [user?.id]);

  useEffect(() => {
    if (!currentClub?.clubId) { setMembers([]); return; }
    (async () => {
      const { data } = await supabase.from('members').select('id, first_name, last_name, avatar_url, user_id, membership_status').eq('club_id', currentClub.clubId).order('first_name');
      const list = ((data as any[]) || []).filter(m => m.membership_status !== 'archived');
      const { data: boats } = list.length ? await supabase.from('member_boats').select('member_id, boat_type, sail_number').in('member_id', list.map(m => m.id)) : { data: [] as any[] };
      const byMember = new Map<string, string[]>();
      ((boats as any[]) || []).forEach(b => byMember.set(b.member_id, [...(byMember.get(b.member_id) || []), [b.boat_type, b.sail_number].filter(Boolean).join(' ')]));
      setMembers(list.map(m => ({ key: m.id, memberId: m.id, userId: m.user_id || undefined, name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Member', avatar: m.avatar_url, sub: (byMember.get(m.id) || []).slice(0, 2).join(' · ') })));
    })().catch(() => setMembers([]));
  }, [currentClub?.clubId]);
  useEffect(() => { loadConns().catch(() => {}); }, [loadConns]);

  const connect = async (p: Person) => {
    if (!p.userId) return;
    try { await socialStorage.sendConnectionRequest(p.userId, 'friend'); tap('success'); toast('Request sent'); loadConns(); } catch { toast("Couldn't send that. Try again."); }
  };
  const answer = async (r: any, yes: boolean) => {
    try { if (yes) await socialStorage.acceptConnectionRequest(r.id); else await socialStorage.rejectConnectionRequest(r.id); tap(yes ? 'success' : 'light'); loadConns(); } catch { toast("Couldn't save that. Try again."); }
  };

  const list = (tab === 'club' ? members : connected) || null;
  const shown = (list || []).filter(p => !memberIds.includes(p.memberId || '') && p.userId !== user?.id).filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sub || '').toLowerCase().includes(q.toLowerCase()));
  const open = (p: Person) => navigate(p.memberId ? `/skipper/m:${p.memberId}` : `/skipper/${p.userId}`);

  return (
    <div className="m-stack">
      <SubHeader title="Members" />
      <label className="m-search"><Icon name="search" size={17} /><input placeholder="Search by name or class" value={q} onChange={e => setQ(e.target.value)} /></label>
      <nav className="m-seg" aria-label="People">
        <button className={tab === 'club' ? 'm-on' : ''} onClick={() => setTab('club')}>My club {members ? members.length : ''}</button>
        <button className={tab === 'connections' ? 'm-on' : ''} onClick={() => setTab('connections')}>Connections {connected ? connected.length : ''}</button>
      </nav>
      {requests.length > 0 && (
        <div className="m-card">
          {requests.map(r => (
            <div key={r.id} className="m-li">
              <Avatar name={r.requester?.full_name || 'Member'} url={r.requester?.avatar_url} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}><div className="m-ell" style={{ fontWeight: 600 }}>{r.requester?.full_name || 'Member'}</div><div className="m-dim" style={{ fontSize: 12.5 }}>wants to connect</div></div>
              <button className="m-btn m-btn-g" style={{ height: 34, padding: '0 12px' }} onClick={() => void answer(r, false)}>Decline</button>
              <button className="m-btn m-btn-p" style={{ height: 34, padding: '0 12px' }} onClick={() => void answer(r, true)}>Accept</button>
            </div>
          ))}
        </div>
      )}
      {list === null ? <Skeleton h={300} /> : shown.length === 0 ? (
        <div className="m-card m-empty">{tab === 'connections' ? 'No connections yet. Connect with people from your club.' : q ? 'Nobody by that name.' : 'No members yet.'}</div>
      ) : (
        <div className="m-card">
          {shown.slice(0, 200).map(p => {
            const c = p.userId ? conns.get(p.userId) : undefined;
            return (
              <div key={p.key} className="m-li">
                <button onClick={() => open(p)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--m-ink)' }}>
                  <Avatar name={p.name} url={p.avatar} size={40} />
                  <span style={{ minWidth: 0 }}><span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>{p.sub && <span className="m-dim m-ell" style={{ display: 'block', fontSize: 12.5 }}>{p.sub}</span>}</span>
                </button>
                {p.userId && (c?.state === 'connected' ? <span className="m-dim" style={{ fontSize: 12.5 }}>Connected</span>
                  : c?.state === 'pending-out' ? <span className="m-dim" style={{ fontSize: 12.5 }}>Requested</span>
                  : c?.state === 'pending-in' ? <span className="m-dim" style={{ fontSize: 12.5 }}>Wants to connect</span>
                  : <button className="m-chip" style={{ height: 32 }} onClick={() => void connect(p)}>Connect</button>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ─────────────── Groups ─────────────── */

export const GroupsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[] | null>(null);
  useEffect(() => {
    socialStorage.getGroups({ userId: user?.id }).then((g: any[]) => setGroups(g || [])).catch(() => setGroups([]));
  }, [user?.id]);
  return (
    <div className="m-stack">
      <SubHeader title="Groups" />
      {groups === null ? <Skeleton h={240} /> : groups.length === 0 ? <div className="m-card m-empty">You're not in any groups yet.</div> : (
        <div className="m-card">
          {groups.map(g => (
            <button key={g.id} className="m-li" onClick={() => navigate(`/club/group/${g.id}`)}>
              <Avatar name={g.name} url={g.avatar_url} size={42} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{g.name}</span><span className="m-dim" style={{ fontSize: 12.5 }}>{g.member_count || 0} members{g.visibility === 'private' ? ' · private' : ''}</span></span>
              <Icon name="chevron" size={17} className="m-dim" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const GroupScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, tap } = useMobile();
  const [group, setGroup] = useState<any | null | undefined>(undefined);
  const [mod, setMod] = useState(false);
  const [tab, setTab] = useState<'posts' | 'members' | 'waiting'>('posts');
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [people, setPeople] = useState<any[] | null>(null);
  const [joins, setJoins] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [menu, setMenu] = useState<SocialPost | null>(null);

  const loadWaiting = React.useCallback(async () => {
    const [{ data: j }, { data: r }] = await Promise.all([
      supabase.from('social_group_members').select('id, user_id, joined_at').eq('group_id', id).eq('status', 'pending'),
      supabase.from('social_post_reports').select('*, post:social_posts(id, content, author_id, created_at)').eq('group_id', id).eq('status', 'pending').order('created_at', { ascending: false }),
    ]);
    const ids = [...new Set(((j as any[]) || []).map(x => x.user_id))];
    const { data: ps } = ids.length ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] as any[] };
    const pm = new Map(((ps as any[]) || []).map(p => [p.id, p]));
    setJoins(((j as any[]) || []).map(x => ({ ...x, profile: pm.get(x.user_id) })));
    setReports((r as any[]) || []);
  }, [id]);

  useEffect(() => {
    supabase.from('social_groups').select('*').eq('id', id).maybeSingle().then(({ data }) => setGroup(data || null), () => setGroup(null));
    loadFeed(id).then(setPosts).catch(() => setPosts([]));
    if (user?.id) supabase.from('social_group_moderators').select('id').eq('group_id', id).eq('user_id', user.id).maybeSingle().then(({ data }) => setMod(!!data));
  }, [id, user?.id]);
  useEffect(() => { if (group && user?.id && group.created_by === user.id) setMod(true); }, [group, user?.id]);
  useEffect(() => { if (mod) loadWaiting().catch(() => {}); }, [mod, loadWaiting]);
  useEffect(() => {
    if (tab !== 'members' || people) return;
    (async () => {
      const { data } = await supabase.from('social_group_members').select('user_id, role').eq('group_id', id).eq('status', 'active');
      const ids = ((data as any[]) || []).map(x => x.user_id);
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] as any[] };
      const pm = new Map(((ps as any[]) || []).map(p => [p.id, p]));
      setPeople(((data as any[]) || []).map(x => ({ ...x, profile: pm.get(x.user_id) })).sort((a, b) => String(a.profile?.full_name || '').localeCompare(String(b.profile?.full_name || ''))));
    })().catch(() => setPeople([]));
  }, [tab, id, people]);

  const like = async (p: SocialPost) => {
    const was = p.user_reaction === 'like';
    setPosts(list => (list || []).map(x => x.id === p.id ? { ...x, user_reaction: was ? undefined : 'like', like_count: Math.max(0, (x.like_count || 0) + (was ? -1 : 1)) } : x));
    try { await toggleLike(p.id); } catch { toast("Couldn't save that. Try again."); }
  };
  const approve = async (j: any, yes: boolean) => {
    const { error } = yes ? await supabase.from('social_group_members').update({ status: 'active' }).eq('id', j.id) : await supabase.from('social_group_members').delete().eq('id', j.id);
    if (error) { toast("Couldn't save that. Try again."); return; }
    tap(yes ? 'success' : 'light'); loadWaiting();
  };
  const handleReport = async (r: any, remove: boolean) => {
    try {
      if (remove && r.post?.id) await socialStorage.deletePostAsAdmin(r.post.id);
      await socialStorage.reviewReport(r.id, remove ? 'actioned' : 'dismissed', remove ? 'Post removed' : undefined);
      tap('success'); toast(remove ? 'Post removed' : 'Report dismissed'); loadWaiting();
      if (remove) setPosts(list => (list || []).filter(p => p.id !== r.post?.id));
    } catch { toast("Couldn't save that. Try again."); }
  };
  const removePost = async (p: SocialPost) => {
    setMenu(null);
    try { await socialStorage.deletePostAsAdmin(p.id); setPosts(list => (list || []).filter(x => x.id !== p.id)); toast('Post removed'); } catch { toast("Couldn't remove it. Try again."); }
  };

  if (group === undefined) return <div className="m-stack"><SubHeader title="Group" /><Skeleton h={120} /><Skeleton h={300} /></div>;
  if (!group) return <div className="m-stack"><SubHeader title="Group" /><div className="m-card m-empty">This group isn't available.</div></div>;
  const waiting = joins.length + reports.length;

  return (
    <div className="m-stack">
      <SubHeader title="Group" />
      <div className="m-row" style={{ gap: 12 }}>
        <Avatar name={group.name} url={group.avatar_url} size={56} />
        <div style={{ minWidth: 0 }}>
          <div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{group.name}</div>
          <div className="m-mut" style={{ fontSize: 13 }}>{group.member_count || 0} members{mod ? ' · you are a moderator' : ''}</div>
        </div>
      </div>
      {group.description && <p className="m-mut" style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{group.description}</p>}
      <nav className="m-seg" aria-label="Group sections">
        <button className={tab === 'posts' ? 'm-on' : ''} onClick={() => setTab('posts')}>Posts</button>
        <button className={tab === 'members' ? 'm-on' : ''} onClick={() => setTab('members')}>Members</button>
        {mod && <button className={tab === 'waiting' ? 'm-on' : ''} onClick={() => setTab('waiting')}>Waiting{waiting ? ` ${waiting}` : ''}</button>}
      </nav>
      {mod && waiting > 0 && tab === 'posts' && (
        <button className="m-card" onClick={() => setTab('waiting')} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', borderColor: 'rgba(255,159,10,.5)' }}>
          <Icon name="flag" size={18} style={{ color: '#E58A00' }} />
          <span style={{ flex: 1, fontSize: 14 }}>{[joins.length ? `${joins.length} asking to join` : '', reports.length ? `${reports.length} reported post${reports.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}</span>
          <Icon name="chevron" size={17} className="m-dim" />
        </button>
      )}
      {tab === 'posts' && (posts === null ? <Skeleton h={260} /> : posts.length === 0 ? <div className="m-card m-empty">No posts in this group yet.</div>
        : posts.map(p => <PostCard key={p.id} post={p} mine={p.author_id === user?.id} onLike={like} onOpenPerson={uid => navigate(`/skipper/${uid}`)} onMore={x => setMenu(x)} />))}
      {tab === 'members' && (people === null ? <Skeleton h={260} /> : (
        <div className="m-card">
          {people.map(m => (
            <button key={m.user_id} className="m-li" onClick={() => navigate(`/skipper/${m.user_id}`)}>
              <Avatar name={m.profile?.full_name || 'Member'} url={m.profile?.avatar_url} size={38} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>{m.profile?.full_name || 'Member'}</span>
              {m.role && m.role !== 'member' && <span className="m-due">{m.role}</span>}
            </button>
          ))}
        </div>
      ))}
      {tab === 'waiting' && mod && (
        <>
          {joins.length > 0 && <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Asking to join</p>}
          {joins.length > 0 && (
            <div className="m-card">
              {joins.map(j => (
                <div key={j.id} className="m-li">
                  <Avatar name={j.profile?.full_name || 'Member'} url={j.profile?.avatar_url} size={38} />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }} className="m-ell">{j.profile?.full_name || 'Member'}</span>
                  <button className="m-btn m-btn-g" style={{ height: 34, padding: '0 12px' }} onClick={() => void approve(j, false)}>Decline</button>
                  <button className="m-btn m-btn-p" style={{ height: 34, padding: '0 12px' }} onClick={() => void approve(j, true)}>Approve</button>
                </div>
              ))}
            </div>
          )}
          {reports.length > 0 && <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Reported posts</p>}
          {reports.map(r => (
            <div key={r.id} className="m-card" style={{ padding: 14 }}>
              <div className="m-dim" style={{ fontSize: 12.5 }}>Reported for {String(r.reason || 'another reason').replace(/_/g, ' ')} · {timeAgo(r.created_at)}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.45, margin: '6px 0 10px', whiteSpace: 'pre-wrap' }}>{r.post?.content || 'The post has already been removed.'}</div>
              {r.details && <div className="m-mut" style={{ fontSize: 13, marginBottom: 10 }}>"{r.details}"</div>}
              <div className="m-row" style={{ gap: 8 }}>
                <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => void handleReport(r, false)}>Keep it</button>
                <button className="m-btn" style={{ flex: 1, background: 'rgba(255,59,48,.14)', color: '#FF5A4F' }} onClick={() => void handleReport(r, true)} disabled={!r.post}>Remove post</button>
              </div>
            </div>
          ))}
          {waiting === 0 && <div className="m-card m-empty">Nothing waiting. Join requests and reported posts show here.</div>}
        </>
      )}
      {menu && (
        <>
          <div className="m-veil" onClick={() => setMenu(null)} />
          <div className="m-sheet" role="dialog" aria-label="Post options">
            <span className="m-grab" />
            {(mod || menu.author_id === user?.id) && <button className="m-li" style={{ width: '100%', color: '#FF5A4F' }} onClick={() => void removePost(menu)}><Icon name="trash" size={18} />Remove post</button>}
            <button className="m-li" style={{ width: '100%' }} onClick={() => setMenu(null)}><Icon name="close" size={18} />Cancel</button>
          </div>
        </>
      )}
    </div>
  );
};

/* ─────────────── My listings ─────────────── */

export const MyListingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<'selling' | 'sold' | 'saved'>('selling');
  const [mine, setMine] = useState<any[] | null>(null);
  const [saved, setSaved] = useState<any[] | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) { setMine([]); setSaved([]); return; }
    (async () => {
      const { data } = await supabase.from('classifieds').select('*').or(`user_id.eq.${user.id},created_by_user_id.eq.${user.id}`).neq('is_scraped', true).order('created_at', { ascending: false });
      const list = (data as any[]) || [];
      setMine(list);
      if (list.length) {
        const { data: qs } = await supabase.from('classified_inquiries').select('*').in('classified_id', list.map(c => c.id)).order('created_at', { ascending: false }).limit(30);
        const ids = [...new Set(((qs as any[]) || []).map(x => x.sender_id))];
        const { data: ps } = ids.length ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids) : { data: [] as any[] };
        const pm = new Map(((ps as any[]) || []).map(p => [p.id, p]));
        setQuestions(((qs as any[]) || []).map(x => ({ ...x, profile: pm.get(x.sender_id), listing: list.find(c => c.id === x.classified_id) })));
      }
      const { data: fav } = await supabase.from('classified_favorites').select('classified_id').eq('user_id', user.id);
      const favIds = ((fav as any[]) || []).map(f => f.classified_id);
      const { data: favs } = favIds.length ? await supabase.from('classifieds').select('*').in('id', favIds) : { data: [] as any[] };
      setSaved((favs as any[]) || []);
    })().catch(() => { setMine([]); setSaved([]); });
  }, [user?.id]);

  const selling = (mine || []).filter(c => c.status === 'active');
  const sold = (mine || []).filter(c => c.status === 'sold');
  const list = tab === 'selling' ? selling : tab === 'sold' ? sold : (saved || []);
  const qCount = useMemo(() => { const m = new Map<string, number>(); questions.forEach(x => m.set(x.classified_id, (m.get(x.classified_id) || 0) + 1)); return m; }, [questions]);
  const img = (c: any) => (Array.isArray(c.images) && c.images[0]) || '';

  return (
    <div className="m-stack">
      <SubHeader title="My listings" />
      <nav className="m-seg" aria-label="Listings">
        <button className={tab === 'selling' ? 'm-on' : ''} onClick={() => setTab('selling')}>Selling {selling.length || ''}</button>
        <button className={tab === 'sold' ? 'm-on' : ''} onClick={() => setTab('sold')}>Sold {sold.length || ''}</button>
        <button className={tab === 'saved' ? 'm-on' : ''} onClick={() => setTab('saved')}>Saved {saved?.length || ''}</button>
      </nav>
      {mine === null ? <Skeleton h={220} /> : list.length === 0 ? (
        <div className="m-card m-empty">{tab === 'saved' ? 'Tap the heart on a listing to save it here.' : tab === 'sold' ? 'Nothing sold yet.' : 'Nothing for sale. Sell something from Classifieds.'}</div>
      ) : (
        <div className="m-card">
          {list.map(c => (
            <button key={c.id} className="m-li" onClick={() => navigate(`/classifieds/${c.id}`)}>
              <span style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0, background: img(c) ? `#10233F url("${img(c)}") center / cover` : 'var(--m-fill-b)' }} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{c.title}</span>
                <span className="m-disp" style={{ display: 'block', fontWeight: 700 }}>{money(c.price)}</span>
                {tab !== 'saved' && <span className="m-dim" style={{ fontSize: 12 }}>{c.views_count || 0} views · {qCount.get(c.id) || 0} question{qCount.get(c.id) === 1 ? '' : 's'}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {tab !== 'saved' && questions.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Questions</p>
          <div className="m-card">
            {questions.slice(0, 10).map(x => (
              <button key={x.id} className="m-li" style={{ alignItems: 'flex-start' }} onClick={() => navigate(`/comms/chat/${x.sender_id}`)}>
                <Avatar name={x.profile?.full_name || 'Buyer'} url={x.profile?.avatar_url} size={34} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontSize: 13 }}><b style={{ fontWeight: 600 }}>{x.profile?.full_name || 'Buyer'}</b> <span className="m-dim">· {x.listing?.title}</span></span>
                  <span className="m-ell2" style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{x.offer_amount ? `Offer ${money(x.offer_amount)}. ` : ''}{x.message}</span>
                </span>
                <span className="m-dim" style={{ fontSize: 12 }}>{timeAgo(x.created_at)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <button className="m-btn m-btn-p" onClick={() => navigate('/classifieds?sell=1')}><Icon name="camera" size={18} />Sell something</button>
    </div>
  );
};
