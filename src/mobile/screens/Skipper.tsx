import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton, fmtDay } from '../ui';
import { myResultFor } from '../data';
import { ordinal } from './Home';
import { ConnectionState, MPerson, connectionWith, loadPerson, requestConnection, userIdForMember } from '../club';

/** Season numbers for one skipper from the results already loaded for the calendar. */
function seasonStats(person: MPerson, items: ReturnType<typeof useMobile>['calendar']) {
  const year = String(new Date().getFullYear());
  let races = 0;
  let wins = 0;
  let podiums = 0;
  const recent: { key: string; title: string; date: string; position: number }[] = [];
  const lower = person.name.trim().toLowerCase();
  items.filter(i => i.kind === 'race' && i.event?.raceResults?.length).forEach(i => {
    const e = i.event!;
    const idx = (e.skippers || []).findIndex((s: any) => (s.memberId && person.memberIds.includes(s.memberId)) || (!s.memberId && s.name?.trim().toLowerCase() === lower));
    if (idx < 0) return;
    if (i.date.startsWith(year)) {
      (e.raceResults as any[]).filter(r => r.skipperIndex === idx).forEach(r => {
        if (r.position != null || (r.letterScore && !['DNC', 'DNS'].includes(r.letterScore))) races++;
        if (r.position === 1 && !r.letterScore) wins++;
      });
    }
    const res = myResultFor(i, person.memberIds, person.name);
    if (res) {
      if (i.date.startsWith(year) && res.position <= 3) podiums++;
      recent.push({ key: i.key, title: i.title, date: i.date, position: res.position });
    }
  });
  recent.sort((a, b) => b.date.localeCompare(a.date));
  return { races, wins, podiums, recent: recent.slice(0, 5) };
}

export const SkipperProfile: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, currentClub } = useAuth();
  const { calendar, toast, tap } = useMobile();
  const [person, setPerson] = useState<MPerson | null | undefined>(undefined);
  const [conn, setConn] = useState<ConnectionState>('none');

  useEffect(() => {
    let alive = true;
    (async () => {
      // /skipper/m:<memberId> comes from results sheets
      const userId = id.startsWith('m:') ? await userIdForMember(id.slice(2)) : id;
      if (!userId) { if (alive) setPerson(null); return; }
      const p = await loadPerson(userId, currentClub?.clubId);
      if (!alive) return;
      setPerson(p);
      if (p && user?.id && user.id !== userId) setConn(await connectionWith(user.id, userId));
    })().catch(() => alive && setPerson(null));
    return () => { alive = false; };
  }, [id, currentClub?.clubId, user?.id]);

  const stats = useMemo(() => (person ? seasonStats(person, calendar) : null), [person, calendar]);
  const isMe = person?.userId === user?.id;

  const connect = async () => {
    if (!person || conn !== 'none') return;
    setConn('pending');
    try { await requestConnection(person.userId); tap('success'); toast('Connection request sent'); } catch { setConn('none'); toast("Couldn't send that. Try again."); }
  };

  if (person === undefined) return <div className="m-stack"><Skeleton h={420} /></div>;
  if (person === null) {
    return (
      <div className="m-stack">
        <header className="m-top"><button className="m-ibtn" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button></header>
        <div className="m-card m-empty">This skipper doesn't have an AlfiePRO profile yet.</div>
      </div>
    );
  }

  const since = person.since ? new Date(person.since).getFullYear() : null;
  return (
    <div className="m-stack">
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(190px + var(--m-safe-top))', background: 'linear-gradient(180deg, rgba(6,11,22,0) 30%, var(--m-bg)), linear-gradient(130deg,#3A1E7A,#8A4DFF 50%,#FF3E9A)' }} />
      <header className="m-top" style={{ position: 'relative' }}>
        <button className="m-ibtn m-ibtn-d" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/club'))}><Icon name="back" /></button>
      </header>
      <div style={{ height: 34 }} />
      <span style={{ position: 'relative', alignSelf: 'flex-start', borderRadius: 999, boxShadow: '0 0 0 4px var(--m-bg)' }} className={person.online ? 'm-on-dot' : ''}>
        <Avatar name={person.name} url={person.avatar} size={84} />
      </span>
      <div>
        <div className="m-disp" style={{ fontSize: 26, fontWeight: 700 }}>{person.name}</div>
        <div className="m-mut" style={{ fontSize: 14 }}>{[person.clubName, since ? `member since ${since}` : ''].filter(Boolean).join(' · ')}</div>
      </div>
      {person.boats.length > 0 && (
        <div className="m-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {person.boats.map(b => <span key={`${b.type}-${b.sail}`} className="m-cls" style={{ height: 22, fontSize: 11 }}>{b.type}{b.sail ? ` · ${b.sail}` : ''}</span>)}
        </div>
      )}
      {!isMe && (
        <div className="m-row" style={{ gap: 8 }}>
          <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={() => navigate(`/comms/chat/${person.userId}`)}>Message</button>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={connect} disabled={conn === 'pending'}>
            {conn === 'connected' ? <><Icon name="check" size={18} />Connected</> : conn === 'pending' ? 'Requested' : 'Connect'}
          </button>
        </div>
      )}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{stats.races}</div><div className="m-dim" style={{ fontSize: 12 }}>races this year</div></div>
          <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{stats.wins}</div><div className="m-dim" style={{ fontSize: 12 }}>race wins</div></div>
          <div className="m-card" style={{ padding: 12, textAlign: 'center' }}><div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{stats.podiums}</div><div className="m-dim" style={{ fontSize: 12 }}>podiums</div></div>
        </div>
      )}
      {stats && stats.recent.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 0 0' }}>Recent results</p>
          <div className="m-card">
            {stats.recent.map(r => {
              const o = `${r.position}${ordinal(r.position)}`;
              return (
                <button key={r.key} className="m-li" onClick={() => navigate(`/calendar/event/${encodeURIComponent(r.key)}`)}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
                    <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{fmtDay(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  </span>
                  <span className="m-disp" style={{ fontWeight: 700 }}>{o}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default SkipperProfile;
