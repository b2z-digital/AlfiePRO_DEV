import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { completeTask, createTask } from '../../utils/taskStorage';
import type { Task } from '../../types/task';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, fmtDay } from '../ui';
import { PageHeader } from './Club';
import { todayISO } from '../data';

type View = 'mine' | 'club' | 'done';
type MTask = Task & { tags?: string[] | null; meeting_agenda_id?: string | null };

const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** One task row: round tick, title, due and tag pills, assignee. */
const TaskRow: React.FC<{ t: MTask; overdue?: boolean; onTick: (t: MTask) => void; showAssignee?: boolean }> = ({ t, overdue, onTick, showAssignee }) => {
  const done = t.status === 'completed';
  const today = todayISO();
  const soon = t.due_date && t.due_date <= plusDays(2) && t.due_date >= today;
  return (
    <div className="m-li" style={done ? { opacity: .6 } : undefined}>
      <button className="m-ck" aria-label={done ? `Mark ${t.title} not done` : `Mark ${t.title} done`} aria-pressed={done} onClick={() => onTick(t)}
        style={done ? { background: '#34C759', borderColor: '#34C759' } : overdue ? { borderColor: '#FF7B72' } : undefined}>
        {done && <Icon name="check" size={14} strokeWidth={3} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: done ? 400 : 600, textDecoration: done ? 'line-through' : undefined }}>{t.title}</div>
        {!done && (t.due_date || t.tags?.length || t.meeting_agenda_id) && (
          <div className="m-row" style={{ gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {t.due_date && (
              <span className="m-due" style={overdue ? { background: 'rgba(255,59,48,.16)', color: '#FF8C82' } : soon ? { background: 'rgba(255,159,10,.16)', color: '#FFB341' } : undefined}>
                {overdue ? 'Due ' : ''}{fmtDay(t.due_date, { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            )}
            {t.meeting_agenda_id && <span className="m-due">Meeting</span>}
            {(t.tags || []).slice(0, 2).map(g => <span key={g} className="m-due">{g}</span>)}
          </div>
        )}
      </div>
      {showAssignee && t.assignee_name && <Avatar name={t.assignee_name} size={28} />}
    </div>
  );
};

/** Jobs the club has given you, and your own. Same club_tasks as desktop. */
export const TasksScreen: React.FC = () => {
  const { user, currentClub } = useAuth();
  const { memberIds, toast, tap } = useMobile();
  const [tasks, setTasks] = useState<MTask[] | null>(null);
  const [view, setView] = useState<View>('mine');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const clubId = currentClub?.clubId;

  const load = React.useCallback(async () => {
    if (!clubId) { setTasks([]); return; }
    const { data } = await supabase.from('club_tasks').select('*, assignee:members(id, first_name, last_name)').eq('club_id', clubId).order('due_date', { ascending: true, nullsFirst: false });
    setTasks((data || []).map((t: any) => ({ ...t, assignee_name: t.assignee ? `${t.assignee.first_name || ''} ${t.assignee.last_name || ''}`.trim() : undefined })));
  }, [clubId]);
  useEffect(() => { load().catch(() => setTasks([])); }, [load]);

  const isMine = (t: MTask) => (t.assignee_id && memberIds.includes(t.assignee_id)) || (!t.assignee_id && t.created_by === user?.id);
  const today = todayISO();
  const weekEnd = plusDays(7);
  const open = (tasks || []).filter(t => t.status !== 'completed' && t.status !== 'cancelled' as any);
  const list = view === 'mine' ? open.filter(isMine) : open;
  const groups = useMemo(() => {
    if (view === 'done') return [{ key: 'done', label: 'Done recently', items: (tasks || []).filter(t => t.status === 'completed' && (view !== 'done' || true)).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).slice(0, 30) }];
    const overdue = list.filter(t => t.due_date && t.due_date < today);
    const week = list.filter(t => t.due_date && t.due_date >= today && t.due_date <= weekEnd);
    const later = list.filter(t => !t.due_date || t.due_date > weekEnd);
    return [
      { key: 'overdue', label: 'Overdue', items: overdue },
      { key: 'week', label: 'This week', items: week },
      { key: 'later', label: 'Later', items: later },
    ].filter(g => g.items.length);
  }, [list, view, tasks, today, weekEnd]);
  const recentDone = view === 'mine' ? (tasks || []).filter(t => t.status === 'completed' && isMine(t) && t.completed_at && Date.now() - new Date(t.completed_at).getTime() < 7 * 864e5).slice(0, 3) : [];

  const tick = async (t: MTask) => {
    const done = t.status === 'completed';
    setTasks(ts => (ts || []).map(x => x.id === t.id ? { ...x, status: done ? 'pending' : 'completed', completed_at: done ? null : new Date().toISOString() } as MTask : x));
    tap(done ? 'light' : 'success');
    try {
      if (done) {
        const { error } = await supabase.from('club_tasks').update({ status: 'pending', completed_at: null }).eq('id', t.id);
        if (error) throw error;
      } else await completeTask(t.id);
    } catch { toast("Couldn't save that. Try again."); load(); }
  };

  const add = async () => {
    if (!title.trim() || !clubId || !user?.id) return;
    try {
      const { data: me } = await supabase.from('members').select('id').eq('user_id', user.id).eq('club_id', clubId).maybeSingle();
      await createTask(clubId, user.id, { title: title.trim(), description: '', due_date: due || null, priority: 'medium' as any, assignee_id: me?.id || null, send_reminder: false, repeat_type: 'none' });
      tap('success'); toast('Task added'); setTitle(''); setDue(''); setAdding(false); load();
    } catch { toast("Couldn't add the task. Try again."); }
  };

  const mineCount = open.filter(isMine).length;
  return (
    <div className="m-stack">
      <PageHeader title="Tasks" />
      <nav className="m-seg" aria-label="Task lists">
        <button className={view === 'mine' ? 'm-on' : ''} onClick={() => setView('mine')}>Mine{mineCount ? ` ${mineCount}` : ''}</button>
        <button className={view === 'club' ? 'm-on' : ''} onClick={() => setView('club')}>Club</button>
        <button className={view === 'done' ? 'm-on' : ''} onClick={() => setView('done')}>Done</button>
      </nav>
      {tasks === null ? <Skeleton h={240} /> : groups.length === 0 && !recentDone.length ? (
        <div className="m-card m-empty">{view === 'done' ? 'Nothing ticked off yet.' : view === 'mine' ? 'Nothing on your list. Add a job with the plus button.' : 'No open club tasks.'}</div>
      ) : (
        <>
          {groups.map(g => (
            <React.Fragment key={g.key}>
              <p className="m-lb" style={{ margin: '4px 0 0', color: g.key === 'overdue' ? '#FF8C82' : 'var(--m-dim)' }}>{g.label}</p>
              <div className="m-card">{g.items.map(t => <TaskRow key={t.id} t={t} overdue={g.key === 'overdue'} onTick={tick} showAssignee={view !== 'mine'} />)}</div>
            </React.Fragment>
          ))}
          {recentDone.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Done recently</p>
              <div className="m-card">{recentDone.map(t => <TaskRow key={t.id} t={t} onTick={tick} />)}</div>
            </>
          )}
        </>
      )}
      <button className="m-fab" aria-label="New task" onClick={() => setAdding(true)}><Icon name="plus" size={26} /></button>
      {adding && (
        <>
          <div className="m-veil" onClick={() => setAdding(false)} />
          <div className="m-sheet" role="dialog" aria-label="New task">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 12 }}>New task</div>
            <label style={{ display: 'block' }}>
              <span className="m-lb m-dim">What needs doing</span>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Charge the start box battery" className="m-field" />
            </label>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span className="m-lb m-dim">Due</span>
              <input type="date" value={due} onChange={e => setDue(e.target.value)} className="m-field" />
            </label>
            <div className="m-row" style={{ gap: 8, marginTop: 10 }}>
              {[['Today', 0], ['Tomorrow', 1], ['Next week', 7]].map(([l, n]) => (
                <button key={String(l)} className={`m-chip ${due === plusDays(n as number) ? 'm-chip-on' : ''}`} onClick={() => setDue(plusDays(n as number))}>{l}</button>
              ))}
            </div>
            <button className="m-btn m-btn-p" style={{ width: '100%', marginTop: 14 }} disabled={!title.trim()} onClick={add}>Add task</button>
          </div>
        </>
      )}
    </div>
  );
};

export default TasksScreen;
