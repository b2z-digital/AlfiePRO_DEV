import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getArticles } from '../../utils/articleStorage';
import { useMobile } from '../MobileContext';
import { attendanceKey, daysUntil, isMyClass, myResultFor, todayISO, MCalendarItem } from '../data';
import { Icon } from '../icons';
import { DateBadge, EntriesPill, GoingStack, LevelPill, RootHeader, RsvpButtons, Skeleton, fmtDay, openCalendarItem } from '../ui';

const untilLabel = (d: number) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`);

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentClub, currentOrganization } = useAuth();
  const { calendar, calendarLoading, memberIds, profile, attendance, myClasses } = useMobile();
  const [news, setNews] = useState<any[]>([]);
  const today = todayISO();

  const upcoming = useMemo(() => calendar.filter(i => i.date >= today && !i.cancelled && !i.completed), [calendar, today]);
  // Most members only race at the club, so Home is built around club racing:
  // - Next up: the next race they've said they're going to (any level), else the next club race
  //   in their classes, else the next club race.
  // - State & national: championships in their classes, in their own section below.
  // - This week: club items, plus state / national ones in their classes.
  const going = (i: MCalendarItem) => { const k = attendanceKey(i); return !!k && attendance.mine[k] === 'yes'; };
  const mine = (i: MCalendarItem) => isMyClass(i.raceClass, myClasses);
  const clubRaces = upcoming.filter(i => i.kind === 'race' && i.level === 'club');
  const nextRace = upcoming.find(i => i.kind === 'race' && !i.external && going(i))
    || clubRaces.find(i => !myClasses.length || !i.raceClass || mine(i))
    || clubRaces[0];
  const championships = useMemo(() => upcoming
    .filter(i => i.kind === 'race' && i.level !== 'club' && i !== nextRace && mine(i) && daysUntil(i.date) <= 120)
    .slice(0, 3), [upcoming, nextRace, myClasses]);
  const thisWeek = upcoming
    .filter(i => i !== nextRace && !championships.includes(i) && daysUntil(i.date) <= 7 && (i.kind === 'meeting' || i.level === 'club' || mine(i)))
    .slice(0, 6);

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const latest = useMemo(() => {
    const past = calendar.filter(i => i.kind === 'race' && i.date <= today && (i.event?.raceResults?.length || 0) > 0)
      .sort((a, b) => b.date.localeCompare(a.date));
    for (const item of past.slice(0, 40)) {
      const r = myResultFor(item, memberIds, fullName);
      if (r) return r;
    }
    return null;
  }, [calendar, memberIds, fullName, today]);

  useEffect(() => {
    const clubId = currentClub?.clubId;
    const assocId = currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.id : undefined;
    getArticles(clubId, assocId, assocId ? (currentOrganization!.type as 'state' | 'national') : undefined)
      .then(a => setNews((a || []).filter((x: any) => x.status !== 'draft').slice(0, 3)))
      .catch(() => {});
  }, [currentClub?.clubId, currentOrganization?.id]);

  const open = (i: MCalendarItem) => openCalendarItem(navigate, i);

  return (
    <div className="m-stack">
      <RootHeader brand />

      {calendarLoading && !calendar.length ? (
        <Skeleton h={190} />
      ) : nextRace ? (
        <div className="m-card m-spec" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {nextRace.venueImage && (
            <button className="m-next-photo" onClick={() => open(nextRace)} aria-label={`Open ${nextRace.title}`}
              style={{ backgroundImage: `linear-gradient(180deg, rgba(6,11,22,0) 35%, rgba(6,11,22,.78) 100%), url("${nextRace.venueImage}")` }}>
              <span className="m-next-photo-tx">
                <span className="m-lb">{nextRace.venue}</span>
              </span>
            </button>
          )}
          <button onClick={() => open(nextRace)} style={{ display: 'flex', gap: 12, background: 'none', border: 0, padding: 0, textAlign: 'left' }}>
            <DateBadge date={nextRace.date} spec />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m-lb" style={{ color: 'var(--m-blue-ink)' }}>Next up · {untilLabel(daysUntil(nextRace.date))}</div>
              <div className="m-disp" style={{ fontSize: 19, fontWeight: 700, marginTop: 2, lineHeight: 1.15 }}>{nextRace.title}</div>
              <div className="m-mut" style={{ fontSize: 13, marginTop: 3 }}>{[nextRace.venue, nextRace.raceClass].filter(Boolean).join(' · ')}</div>
            </div>
          </button>
          <div className="m-row" style={{ justifyContent: 'space-between' }}>
            <GoingStack item={nextRace} />
            <LevelPill level={nextRace.level} />
          </div>
          <RsvpButtons item={nextRace} compact />
        </div>
      ) : (
        <div className="m-card m-empty">No racing in the calendar yet. When your club adds events they'll show here.</div>
      )}

      {latest && (
        <>
          <div className="m-sh"><h3>My latest result</h3><button onClick={() => navigate('/my-results')}>All results</button></div>
          <button className="m-card" onClick={() => open(latest.item)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <div style={{ textAlign: 'center', width: 58 }}>
              <div className="m-disp" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{latest.position}<span style={{ fontSize: 16 }}>{ordinal(latest.position)}</span></div>
              <div className="m-dim" style={{ fontSize: 12 }}>of {latest.of}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{latest.item.title}</div>
              <div className="m-mut" style={{ fontSize: 13 }}>{fmtDay(latest.item.date, { weekday: 'short', day: 'numeric', month: 'short' })}{latest.points != null ? ` · ${latest.points} pts` : ''}</div>
            </div>
            <Icon name="chevron" size={18} className="m-dim" />
          </button>
        </>
      )}

      {championships.length > 0 && (
        <>
          <div className="m-sh"><h3>State &amp; national</h3><button onClick={() => navigate('/calendar')}>Calendar</button></div>
          <div className="m-card">
            {championships.map(i => (
              <button key={i.key} className="m-li" onClick={() => open(i)} style={{ alignItems: 'center' }}>
                <DateBadge date={i.date} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.title}</div>
                  <div className="m-mut" style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[untilLabel(daysUntil(i.date)), i.venue].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                    {i.raceClass && <span className="m-cls">{i.raceClass}</span>}
                    <LevelPill level={i.level} />
                    <EntriesPill item={i} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {thisWeek.length > 0 && (
        <>
          <div className="m-sh"><h3>This week</h3><button onClick={() => navigate('/calendar')}>Calendar</button></div>
          <div className="m-chips" style={{ gap: 10 }}>
            {thisWeek.map(i => (
              <button key={i.key} className="m-card" onClick={() => open(i)} style={{ flex: '0 0 210px', padding: '12px 14px', textAlign: 'left' }}>
                <div className="m-lb" style={{ color: i.kind === 'meeting' ? '#FFB27A' : 'var(--m-blue-ink)' }}>
                  {fmtDay(i.date, { weekday: 'short', day: 'numeric' })}{i.startTime ? ` · ${i.startTime.slice(0, 5)}` : ''}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.title}</div>
                <div className="m-mut" style={{ fontSize: 12.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.venue || i.clubName}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {news.length > 0 && (
        <>
          <div className="m-sh"><h3>From the club</h3><button onClick={() => navigate('/news')}>News</button></div>
          <div className="m-card">
            {news.map((a: any) => (
              <button key={a.id} className="m-li" onClick={() => navigate(`/news/${a.id}`)}>
                <span style={{ width: 60, height: 60, borderRadius: 13, flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(135deg,#0B4FA8,#1C7FD6 60%,#9DD2FF)' }}>
                  {(a.cover_image || a.coverImage) && <img src={a.cover_image || a.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</div>
                  <div className="m-mut" style={{ fontSize: 12.5, marginTop: 3 }}>{a.published_at || a.created_at ? new Date(a.published_at || a.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : ''}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {user && !attendance && null}
    </div>
  );
};

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
