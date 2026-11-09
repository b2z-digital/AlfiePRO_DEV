/**
 * A venue (old app's calendar › venue page): photo, where it is, directions, the wind there and
 * what's racing there next. Venues come from the same getStoredVenues as the desktop Venues page.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getStoredVenues } from '../../utils/venueStorage';
import type { Venue } from '../../types/venue';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { DateBadge, LevelPill, Skeleton, SubHeader, openCalendarItem, openExternalUrl } from '../ui';
import { todayISO } from '../data';

const norm = (s?: string | null) => String(s || '').trim().toLowerCase();
const VENUE_KEY = 'alfie-m-weather-venue';

export const VenueScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { calendar } = useMobile();
  const [venue, setVenue] = useState<Venue | null | undefined>(undefined);
  useEffect(() => {
    getStoredVenues().then(vs => setVenue((vs || []).find(v => v.id === id || norm(v.name) === norm(decodeURIComponent(id))) || null)).catch(() => setVenue(null));
  }, [id]);
  const next = useMemo(() => (venue ? calendar.filter(i => i.kind === 'race' && !i.cancelled && i.date >= todayISO() && norm(i.venue) === norm(venue.name)).slice(0, 6) : []), [calendar, venue]);

  if (venue === undefined) return <div className="m-stack"><SubHeader title="Venue" /><Skeleton h={200} /><Skeleton h={160} /></div>;
  if (!venue) return <div className="m-stack"><SubHeader title="Venue" /><div className="m-card m-empty">This venue isn't on AlfiePRO.</div></div>;
  const maps = venue.latitude && venue.longitude ? `https://maps.google.com/?q=${venue.latitude},${venue.longitude}` : `https://maps.google.com/?q=${encodeURIComponent(venue.address || venue.name)}`;

  return (
    <div className="m-stack">
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 'calc(var(--m-safe-top) + 240px)', zIndex: -1,
        background: `linear-gradient(180deg, rgba(6,11,22,.25) 0%, rgba(6,11,22,0) 35%, var(--m-bg) 100%), ${venue.image ? `url("${venue.image}") center / cover no-repeat` : 'linear-gradient(125deg,#0A3D7A 0%,#1C6FC2 50%,#9DD2FF 100%)'}` }} />
      <SubHeader />
      <div style={{ height: 90 }} />
      <h2 className="m-disp" style={{ margin: 0, fontSize: 27, fontWeight: 700, lineHeight: 1.1 }}>{venue.name}</h2>
      {venue.address && <div className="m-mut" style={{ fontSize: 14, marginTop: -6 }}>{venue.address}</div>}
      <div className="m-row" style={{ gap: 8 }}>
        <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={() => openExternalUrl(maps)}><Icon name="pin" size={18} />Directions</button>
        <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => { try { localStorage.setItem(VENUE_KEY, venue.id); } catch { /* private mode */ } navigate('/weather'); }}><Icon name="wind" size={18} />Wind &amp; tides</button>
      </div>
      {venue.description && <p className="m-mut" style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{venue.description}</p>}
      {venue.latitude && venue.longitude ? (
        <iframe title={`Map of ${venue.name}`} style={{ width: '100%', height: 200, border: 0, borderRadius: 18 }} loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${venue.longitude - 0.01},${venue.latitude - 0.006},${venue.longitude + 0.01},${venue.latitude + 0.006}&layer=mapnik&marker=${venue.latitude},${venue.longitude}`} />
      ) : null}
      <div className="m-sh"><h3>Racing here next</h3></div>
      {next.length === 0 ? <div className="m-card m-empty">Nothing in the calendar at {venue.name} yet.</div> : (
        <div className="m-card">
          {next.map(i => (
            <button key={i.key} className="m-li" onClick={() => openCalendarItem(navigate, i)}>
              <DateBadge date={i.date} />
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span className="m-ell" style={{ display: 'block', fontWeight: 600 }}>{i.title}</span>
                <span className="m-row" style={{ gap: 5, marginTop: 4 }}>{i.raceClass && <span className="m-cls">{i.raceClass}</span>}<LevelPill level={i.level} /></span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default VenueScreen;
