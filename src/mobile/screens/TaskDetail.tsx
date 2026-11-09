/**
 * Phase 2 board, Club › Tasks: a task (who, when, how often, what's attached, comments) and the full
 * New task form. Same club_tasks, task_comments and task_attachments as the web's Tasks page, and
 * tasks are created through the same createTask / updateTask / completeTask as desktop.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { completeTask, createTask, getTaskAttachments, updateTask } from '../../utils/taskStorage';
import type { Task, TaskPriority } from '../../types/task';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, SubHeader, fmtDay, openExternalUrl } from '../ui';
import { todayISO, timeAgo } from '../data';

type MTask = Task & { tags?: string[] | null; assignee?: { id: string; first_name?: string; last_name?: string } | null };
interface Person { id: string; name: string; avatar?: string | null }

export const PRIORITY: Record<TaskPriority, { label: string; bg: string; fg: string }> = {
  low: { label: 'Low', bg: 'var(--m-fill-b)', fg: 'var(--m-mut)' },
  medium: { label: 'Medium', bg: 'rgba(77,163,255,.16)', fg: 'var(--m-blue-ink)' },
  high: { label: 'High', bg: 'rgba(255,159,10,.18)', fg: '#E58A00' },
  urgent: { label: 'Urgent', bg: 'rgba(255,59,48,.16)', fg: '#FF5A4F' },
};
const REPEATS: Record<string, string> = { none: 'Doesn’t repeat', daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };
const STATUS: Record<string, string> = { pending: 'To do', in_progress: 'In progress', completed: 'Done', cancelled: 'Cancelled' };

export async function loadClubMembers(clubId: string): Promise<Person[]> {
  const { data } = await supabase.from('members').select('id, first_name, last_name, avatar_url').eq('club_id', clubId).order('first_name');
  return ((data as any[]) || []).map(m => ({ id: m.id, name: `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Member', avatar: m.avatar_url }));
}

export const TaskDetailScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, tap } = useMobile();
  const [task, setTask] = useState<MTask | null | undefined>(undefined);
  const [from, setFrom] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);
  const [comments, setComments] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = React.useCallback(async () => {
    const { data } = await supabase.from('club_tasks').select('*, assignee:members(id, first_name, last_name)').eq('id', id).maybeSingle();
    if (!data) { setTask(null); return; }
    const t = data as unknown as MTask;
    setTask({ ...t, assignee_name: t.assignee ? `${t.assignee.first_name || ''} ${t.assignee.last_name || ''}`.trim() : undefined });
    if (t.assignee_id && !t.assignee) supabase.from('members').select('first_name, last_name').eq('id', t.assignee_id).maybeSingle()
      .then(({ data: m }) => m && setTask(x => (x ? { ...x, assignee_name: `${m.first_name || ''} ${m.last_name || ''}`.trim() } : x)));
    if (t.created_by) supabase.from('profiles').select('first_name, last_name').eq('id', t.created_by).maybeSingle().then(({ data: p }) => setFrom(p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : ''));
    getTaskAttachments(id).then(a => setFiles(a || [])).catch(() => setFiles([]));
  }, [id]);

  const loadComments = React.useCallback(async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', id).order('created_at', { ascending: true });
    const list = (data as any[]) || [];
    const ids = [...new Set(list.map(c => c.user_id))];
    const { data: ps } = ids.length ? await supabase.from('profiles').select('id, first_name, last_name, avatar_url').in('id', ids) : { data: [] as any[] };
    const map = new Map(((ps as any[]) || []).map(p => [p.id, p]));
    setComments(list.map(c => ({ ...c, user: map.get(c.user_id) })));
  }, [id]);

  useEffect(() => { load().catch(() => setTask(null)); loadComments().catch(() => setComments([])); }, [load, loadComments]);

  if (task === undefined) return <div className="m-stack"><SubHeader title="Task" /><Skeleton h={200} /><Skeleton h={160} /></div>;
  if (!task) return <div className="m-stack"><SubHeader title="Task" /><div className="m-card m-empty">This task isn't available any more.</div></div>;

  const done = task.status === 'completed';
  const overdue = !done && !!task.due_date && task.due_date < todayISO();
  const pr = PRIORITY[task.priority] || PRIORITY.medium;

  const setStatus = async (status: 'pending' | 'in_progress' | 'completed') => {
    setBusy(true);
    try {
      if (status === 'completed') await completeTask(task.id);
      else {
        const { error } = await supabase.from('club_tasks').update({ status, completed_at: null }).eq('id', task.id);
        if (error) throw error;
      }
      tap(status === 'completed' ? 'success' : 'light');
      toast(status === 'completed' ? 'Marked as done' : status === 'in_progress' ? 'Marked in progress' : 'Reopened');
      await load();
    } catch { toast("Couldn't save that. Try again."); } finally { setBusy(false); }
  };

  const comment = async () => {
    if (!text.trim() || !user?.id) return;
    const body = text.trim();
    setText('');
    const { error } = await supabase.from('task_comments').insert({ task_id: task.id, user_id: user.id, comment: body });
    if (error) { setText(body); toast("Couldn't post that. Try again."); return; }
    tap('light');
    loadComments();
  };

  const row = (icon: React.ComponentProps<typeof Icon>['name'], label: string, value: React.ReactNode) => (
    <div className="m-li">
      <span className="m-tile" style={{ background: 'var(--m-fill-b)', color: 'var(--m-mut)' }}><Icon name={icon} size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}><div className="m-dim" style={{ fontSize: 12 }}>{label}</div><div style={{ fontWeight: 600, fontSize: 14.5 }}>{value}</div></div>
    </div>
  );

  return (
    <div className="m-stack">
      <SubHeader title="Task" right={<button className="m-ibtn" aria-label="Edit task" onClick={() => navigate(`/tasks/${task.id}/edit`)}><Icon name="edit" size={18} /></button>} />
      <h2 className="m-disp" style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.15, textDecoration: done ? 'line-through' : undefined }}>{task.title}</h2>
      <div className="m-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <span className="m-pill" style={{ background: pr.bg, color: pr.fg }}>{pr.label}</span>
        <span className="m-pill" style={{ background: done ? 'rgba(52,199,89,.16)' : task.status === 'in_progress' ? 'rgba(77,163,255,.16)' : 'var(--m-fill-b)', color: done ? '#2FB765' : task.status === 'in_progress' ? 'var(--m-blue-ink)' : 'var(--m-mut)' }}>{STATUS[task.status] || task.status}</span>
        {overdue && <span className="m-pill" style={{ background: 'rgba(255,59,48,.16)', color: '#FF5A4F' }}>Overdue</span>}
        {(task.tags || []).map(g => <span key={g} className="m-due">{g}</span>)}
      </div>
      <div className="m-card">
        {row('people', 'Assigned to', task.assignee_name || 'Nobody yet')}
        {row('calendar', 'Due', task.due_date ? fmtDay(task.due_date, { weekday: 'short', day: 'numeric', month: 'short', year: task.due_date.slice(0, 4) !== String(new Date().getFullYear()) ? 'numeric' : undefined }) : 'No due date')}
        {task.repeat_type && task.repeat_type !== 'none' && row('undo', 'Repeats', `${REPEATS[task.repeat_type]}${task.repeat_end_date ? ` until ${fmtDay(task.repeat_end_date, { day: 'numeric', month: 'short' })}` : ''}`)}
        {task.send_reminder && task.reminder_date && row('bell', 'Reminder', fmtDay(task.reminder_date.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' }))}
        {from && row('me', 'From', from)}
      </div>
      {task.description?.trim() && <div className="m-card" style={{ padding: 14, fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{task.description}</div>}
      {files.length > 0 && (
        <div className="m-card">
          {files.map(f => (
            <button key={f.id} className="m-li" onClick={() => openExternalUrl(f.url)}>
              {String(f.type || '').startsWith('image/')
                ? <span style={{ width: 40, height: 40, borderRadius: 10, background: `#10233F url("${f.url}") center / cover`, flexShrink: 0 }} />
                : <span className="m-tile" style={{ background: 'var(--m-fill-b)' }}><Icon name="doc" size={18} /></span>}
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }} className="m-ell"><b style={{ fontWeight: 600 }}>{f.name}</b></span>
              <Icon name="external" size={16} className="m-dim" />
            </button>
          ))}
        </div>
      )}

      <div className="m-row" style={{ gap: 8 }}>
        {done ? (
          <button className="m-btn m-btn-g" style={{ flex: 1 }} disabled={busy} onClick={() => void setStatus('pending')}><Icon name="undo" size={18} />Reopen</button>
        ) : (
          <>
            {task.status !== 'in_progress' && <button className="m-btn m-btn-g" style={{ flex: 1 }} disabled={busy} onClick={() => void setStatus('in_progress')}>Start</button>}
            <button className="m-btn m-btn-p" style={{ flex: 2 }} disabled={busy} onClick={() => void setStatus('completed')}><Icon name="check" size={18} />Mark as done</button>
          </>
        )}
      </div>
      <p className="m-lb m-dim" style={{ margin: '6px 0 0' }}>Comments</p>
      <div className="m-card">
        {comments === null ? <div style={{ padding: 14 }}><Skeleton h={40} /></div> : comments.length === 0 ? <div className="m-empty" style={{ padding: 18 }}>No comments yet.</div> : comments.map(c => {
          const nm = c.user ? `${c.user.first_name || ''} ${c.user.last_name || ''}`.trim() : 'Member';
          return (
            <div key={c.id} className="m-li" style={{ alignItems: 'flex-start' }}>
              <Avatar name={nm} url={c.user?.avatar_url} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}><b style={{ fontWeight: 600 }}>{c.user_id === user?.id ? 'You' : nm}</b> <span className="m-dim">· {timeAgo(c.created_at)}</span></div>
                <div style={{ fontSize: 14.5, lineHeight: 1.45, marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.comment}</div>
              </div>
            </div>
          );
        })}
        <div className="m-li" style={{ gap: 8 }}>
          <input className="m-field" style={{ marginTop: 0, flex: 1 }} placeholder="Add a comment" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void comment(); }} />
          <button className="m-ibtn" aria-label="Post comment" disabled={!text.trim()} onClick={() => void comment()} style={{ background: 'var(--m-blue)', color: '#fff', border: 0 }}><Icon name="send" size={17} /></button>
        </div>
      </div>

    </div>
  );
};

/* ─────────────── New / edit task ─────────────── */

const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export const TaskFormScreen: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const { memberIds, toast, tap } = useMobile();
  const clubId = currentClub?.clubId;
  const [people, setPeople] = useState<Person[]>([]);
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assignee, setAssignee] = useState<string>('');
  const [repeat, setRepeat] = useState<string>('none');
  const [remind, setRemind] = useState(false);
  const [remindOn, setRemindOn] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (clubId) loadClubMembers(clubId).then(setPeople).catch(() => {}); }, [clubId]);
  useEffect(() => { if (!id && !assignee && memberIds.length && people.some(p => memberIds.includes(p.id))) setAssignee(people.find(p => memberIds.includes(p.id))!.id); }, [people, memberIds, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!id) return;
    supabase.from('club_tasks').select('*').eq('id', id).maybeSingle().then(({ data: t }) => {
      if (t) {
        setTitle(t.title || ''); setDetails(t.description || ''); setDue(t.due_date || ''); setPriority(t.priority || 'medium');
        setAssignee(t.assignee_id || ''); setRepeat(t.repeat_type || 'none'); setRemind(!!t.send_reminder); setRemindOn(t.reminder_date ? String(t.reminder_date).slice(0, 10) : '');
      }
      setLoaded(true);
    });
  }, [id]);

  const save = async () => {
    if (!title.trim() || !clubId || !user?.id) return;
    setBusy(true);
    const data = {
      title: title.trim(), description: details.trim(), due_date: due || null, priority, assignee_id: assignee || null,
      repeat_type: repeat as any, send_reminder: remind, reminder_type: remind ? 'notification' as const : undefined,
      reminder_date: remind ? (remindOn || due || null) : null,
    };
    try {
      if (id) await updateTask(id, { ...data, attachments: files.length ? files : undefined });
      else await createTask(clubId, user.id, { ...data, attachments: files });
      tap('success'); toast(id ? 'Task saved' : 'Task added');
      navigate(-1);
    } catch { toast("Couldn't save the task. Try again."); } finally { setBusy(false); }
  };

  const who = people.find(p => p.id === assignee);
  const found = people.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);

  if (!loaded) return <div className="m-stack"><SubHeader title="Task" /><Skeleton h={300} /></div>;
  return (
    <div className="m-stack">
      <SubHeader title={id ? 'Edit task' : 'New task'} right={<button className="m-pill-btn" disabled={busy || !title.trim()} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>} />
      <input className="m-field m-disp" style={{ fontSize: 20, fontWeight: 700, height: 52 }} autoFocus={!id} placeholder="What needs doing?" value={title} onChange={e => setTitle(e.target.value)} />
      <label className="m-card" style={{ padding: '10px 12px', display: 'block' }}>
        <span className="m-lb m-dim">Details</span>
        <textarea className="m-textarea" style={{ minHeight: 80 }} placeholder="Anything they need to know" value={details} onChange={e => setDetails(e.target.value)} />
      </label>

      <div className="m-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span className="m-lb m-dim">Due</span>
          <input type="date" className="m-field" value={due} onChange={e => setDue(e.target.value)} />
          <div className="m-row" style={{ gap: 8, marginTop: 8 }}>
            {([['Today', 0], ['Tomorrow', 1], ['Next week', 7]] as [string, number][]).map(([l, n]) => (
              <button key={l} className={`m-chip ${due === plusDays(n) ? 'm-chip-on' : ''}`} onClick={() => setDue(plusDays(n))}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <span className="m-lb m-dim">Priority</span>
          <div className="m-seg" style={{ marginTop: 6 }}>
            {(Object.keys(PRIORITY) as TaskPriority[]).map(p => <button key={p} className={priority === p ? 'm-on' : ''} onClick={() => setPriority(p)}>{PRIORITY[p].label}</button>)}
          </div>
        </div>
        <button onClick={() => setPicking(true)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--m-ink)' }}>
          <span className="m-lb m-dim">Assign to</span>
          <span className="m-row" style={{ gap: 10, marginTop: 6 }}>
            {who ? <Avatar name={who.name} url={who.avatar} size={32} /> : <span className="m-tile" style={{ background: 'var(--m-fill-b)' }}><Icon name="people" size={18} /></span>}
            <span style={{ flex: 1, fontWeight: 600 }}>{who ? (memberIds.includes(who.id) ? `${who.name} (you)` : who.name) : 'Nobody yet'}</span>
            <Icon name="chevron" size={18} className="m-dim" />
          </span>
        </button>
        <label>
          <span className="m-lb m-dim">Repeats</span>
          <select className="m-field" value={repeat} onChange={e => setRepeat(e.target.value)}>
            {Object.entries(REPEATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div>
          <label className="m-row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>Remind {who && !memberIds.includes(who.id) ? who.name.split(' ')[0] : 'me'}</span>
            <input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} style={{ width: 22, height: 22 }} />
          </label>
          {remind && <input type="date" className="m-field" value={remindOn || due} onChange={e => setRemindOn(e.target.value)} />}
        </div>
      </div>

      <div className="m-card">
        {files.map((f, i) => (
          <div key={f.name + i} className="m-li">
            <span className="m-tile" style={{ background: 'var(--m-fill-b)' }}><Icon name={f.type.startsWith('image/') ? 'image' : 'doc'} size={18} /></span>
            <span className="m-ell" style={{ flex: 1, minWidth: 0 }}>{f.name}</span>
            <button className="m-ibtn" aria-label={`Remove ${f.name}`} onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
          </div>
        ))}
        <button className="m-li" onClick={() => fileRef.current?.click()}>
          <span className="m-tile" style={{ background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="upload" size={18} /></span>
          <span style={{ fontWeight: 600 }}>Attach photos or files</span>
        </button>
      </div>
      <input ref={fileRef} type="file" multiple hidden onChange={e => { setFiles(fs => [...fs, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />

      {picking && (
        <>
          <div className="m-veil" onClick={() => setPicking(false)} />
          <div className="m-sheet" role="dialog" aria-label="Assign to" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <span className="m-grab" />
            <label className="m-search"><Icon name="search" size={18} /><input placeholder="Search members" value={q} onChange={e => setQ(e.target.value)} /></label>
            <div style={{ overflowY: 'auto', marginTop: 10 }}>
              <button className="m-li" style={{ width: '100%' }} onClick={() => { setAssignee(''); setPicking(false); }}>
                <span className="m-tile" style={{ background: 'var(--m-fill-b)' }}><Icon name="close" size={16} /></span><span>Nobody yet</span>
              </button>
              {found.map(p => (
                <button key={p.id} className="m-li" style={{ width: '100%' }} onClick={() => { setAssignee(p.id); setPicking(false); setQ(''); }}>
                  <Avatar name={p.name} url={p.avatar} size={34} />
                  <span style={{ flex: 1, textAlign: 'left', fontWeight: assignee === p.id ? 700 : 500 }}>{p.name}{memberIds.includes(p.id) ? ' (you)' : ''}</span>
                  {assignee === p.id && <Icon name="check" size={18} style={{ color: 'var(--m-blue-ink)' }} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
