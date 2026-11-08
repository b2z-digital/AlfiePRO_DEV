import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { getMeetingAgenda, getMeetingAttendees, updateMeetingRsvp } from '../../utils/meetingStorage';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, fmtDay } from '../ui';

const time = (t?: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Committee and general meetings: when, where, join link, your answer, agenda and minutes. */
export const MeetingScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast, tap, light } = useMobile();
  const [m, setM] = useState<any | null | undefined>(undefined);
  const [agenda, setAgenda] = useState<any[]>([]);
  const [attending, setAttending] = useState(0);
  const [mine, setMine] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [prev, setPrev] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle();
      if (!alive) return;
      setM(data || null);
      if (!data) return;
      const [items, people] = await Promise.all([getMeetingAgenda(id).catch(() => []), getMeetingAttendees(id)]);
      if (!alive) return;
      setAgenda(items as any[]);
      setAttending(people.filter(p => p.status === 'attending').length);
      setMine(people.find(p => p.user_id === user?.id)?.status || null);
      // The last meeting's minutes, like the board's "October minutes"
      let q = supabase.from('meetings').select('id, name, date').lt('date', data.date).in('minutes_status', ['completed']).order('date', { ascending: false }).limit(1);
      q = data.club_id ? q.eq('club_id', data.club_id) : data.state_association_id ? q.eq('state_association_id', data.state_association_id) : q.eq('national_association_id', data.national_association_id);
      if (data.meeting_category) q = q.eq('meeting_category', data.meeting_category);
      const { data: last } = await q;
      if (alive && last?.[0]) setPrev({ id: last[0].id, name: `${new Date(`${last[0].date}T00:00:00`).toLocaleDateString('en-AU', { month: 'long' })} minutes` });
    })().catch(() => alive && setM(null));
    return () => { alive = false; };
  }, [id, user?.id]);

  const answer = async (status: 'attending' | 'not_attending') => {
    if (!user?.id) return;
    const prev = mine;
    setMine(status);
    setAttending(n => n + (status === 'attending' ? 1 : 0) - (prev === 'attending' ? 1 : 0));
    tap(status === 'attending' ? 'success' : 'light');
    try {
      await updateMeetingRsvp(id, user.id, status);
      toast(status === 'attending' ? "You're attending" : 'Apologies sent');
    } catch {
      setMine(prev);
      toast("Couldn't save your answer. Try again.");
    }
  };

  if (m === undefined) return <div className="m-stack"><Skeleton h={180} /><Skeleton h={260} /></div>;
  if (m === null) return <div className="m-stack"><header className="m-top"><button className="m-ibtn" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button></header><div className="m-card m-empty">This meeting isn't available.</div></div>;

  const kind = m.meeting_category === 'committee' ? 'Committee meeting' : 'General meeting';
  const when = [fmtDay(m.date, { weekday: 'short', day: 'numeric', month: 'short' }), m.start_time ? `${time(m.start_time)}${m.end_time ? ` – ${time(m.end_time)}` : ''}` : '', m.location].filter(Boolean).join(' · ');
  const past = m.status === 'completed' || m.date < new Date().toISOString().slice(0, 10);
  const minutesReady = m.minutes_status === 'completed' || m.minutes_locked;
  const totalMins = agenda.reduce((t, a) => t + (a.duration || 0), 0);

  return (
    <div className="m-stack">
      <header className="m-top"><button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/calendar'))}><Icon name="back" /></button></header>
      <div className="m-lb" style={{ color: light ? '#C25E10' : '#FFB27A' }}>{kind}{m.status === 'cancelled' ? ' · Cancelled' : ''}</div>
      <h2 className="m-disp" style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.08 }}>{m.name}</h2>
      <div className="m-mut" style={{ fontSize: 14 }}>{when}</div>
      {m.conferencing_url && !past && (
        <a className="m-btn m-btn-g" href={m.conferencing_url} target="_blank" rel="noreferrer" style={{ width: '100%' }}><Icon name="video" />Join online</a>
      )}
      {m.location && m.location_lat && m.location_lng && (
        <a className="m-btn m-btn-g" href={`https://maps.google.com/?q=${m.location_lat},${m.location_lng}`} target="_blank" rel="noreferrer" style={{ width: '100%' }}><Icon name="pin" />Directions</a>
      )}
      {!past && m.status !== 'cancelled' && (
        <div className="m-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Will you be there?</div>
          <div className="m-row" style={{ gap: 8 }}>
            <button className={`m-btn ${mine === 'attending' ? 'm-btn-p' : 'm-btn-g'}`} style={{ flex: 1 }} aria-pressed={mine === 'attending'} onClick={() => answer('attending')}>
              {mine === 'attending' && <Icon name="check" size={18} />}Attending
            </button>
            <button className={`m-btn ${mine === 'not_attending' ? 'm-btn-on' : 'm-btn-g'}`} style={{ flex: 1 }} aria-pressed={mine === 'not_attending'} onClick={() => answer('not_attending')}>Apologies</button>
          </div>
        </div>
      )}
      {m.description && <p className="m-mut" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.description}</p>}
      <div className="m-row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{minutesReady ? 'Agenda and minutes' : 'Agenda'}</h3>
        <span className="m-mut" style={{ fontSize: 13 }}>{attending > 0 ? `${attending} attending` : totalMins ? `${totalMins} min` : ''}</span>
      </div>
      {agenda.length === 0 ? <div className="m-card m-empty">The agenda hasn't been set yet.</div> : (
        <div className="m-card">
          {agenda.map((a, i) => {
            const hasMinutes = minutesReady && (a.minutes_content || a.minutes_decision);
            return (
              <React.Fragment key={a.id}>
                <button className="m-li" onClick={() => hasMinutes && setOpen(o => (o === a.id ? null : a.id))} aria-expanded={hasMinutes ? open === a.id : undefined}>
                  <span className="m-disp m-dim" style={{ width: 18, fontWeight: 700 }}>{a.item_number || i + 1}</span>
                  <span style={{ flex: 1, fontSize: 14.5 }}>{a.item_name}</span>
                  {a.duration ? <span className="m-dim" style={{ fontSize: 12.5 }}>{a.duration} min</span> : null}
                  {hasMinutes && <Icon name={open === a.id ? 'down' : 'chevron'} size={16} className="m-dim" />}
                </button>
                {open === a.id && (
                  <div style={{ padding: '0 14px 12px 44px', fontSize: 14, lineHeight: 1.5 }} className="m-mut">
                    {a.minutes_content && <div className="m-article" style={{ fontFamily: 'inherit', fontSize: 14 }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(a.minutes_content) }} />}
                    {a.minutes_decision && <div style={{ marginTop: 6 }}><b style={{ color: 'var(--m-ink)' }}>Decision:</b> {a.minutes_decision}</div>}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {prev && (
        <button className="m-card m-row" style={{ padding: '12px 14px', gap: 10, textAlign: 'left', color: 'inherit' }} onClick={() => navigate(`/calendar/meeting/${prev.id}`)}>
          <Icon name="doc" className="m-dim" />
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>{prev.name}</span>
          <Icon name="chevron" size={17} className="m-dim" />
        </button>
      )}
    </div>
  );
};

export default MeetingScreen;
