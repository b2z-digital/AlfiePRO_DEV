import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { loadGoogleMaps } from '../../utils/googleMaps';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, fmtDay } from '../ui';
import { parseDay } from '../data';
import { FoundEvent, loadAllRacing, startingPoint, withDistance } from '../find';

const LEVEL_COLOUR = { club: '#0A84FF', state: '#8A4DFF', national: '#FF8A2B' };
const DARK_MAP: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#0B2440' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FA3BF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1222' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071A30' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#152740' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

type Filter = 'near' | 'month' | `class:${string}`;
const kmLabel = (km?: number) => (km == null ? '' : km < 1 ? '<1 km' : `${Math.round(km)} km`);

/** A map of racing near you from every club and association; drag the sheet up for the list. */
export const FindRacingScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { calendar, myClasses, light } = useMobile();
  const [all, setAll] = useState<FoundEvent[] | null>(null);
  const [from, setFrom] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [filters, setFilters] = useState<Set<Filter>>(new Set(['near']));
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<FoundEvent | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<any[]>([]);

  useEffect(() => { loadAllRacing().then(setAll).catch(() => setAll([])); }, []);
  useEffect(() => { startingPoint(currentClub?.clubId).then(setFrom).catch(() => {}); }, [currentClub?.clubId]);
  useEffect(() => {
    loadGoogleMaps(() => {
      const g = (window as any).google;
      if (!mapEl.current || !g?.maps) return;
      map.current = new g.maps.Map(mapEl.current, {
        center: { lat: -37.81, lng: 144.96 }, zoom: 9, disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false,
        styles: light ? undefined : DARK_MAP, backgroundColor: light ? '#E8EEF7' : '#0B2440',
      });
      setMapReady(true);
    });
  }, [light]);

  const toggle = (f: Filter) => setFilters(s => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });
  const monthEnd = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }, []);

  const { shown, radius } = useMemo(() => {
    let list = withDistance(all || [], from);
    const classes = [...filters].filter(f => f.startsWith('class:')).map(f => f.slice(6).toLowerCase());
    if (classes.length) list = list.filter(e => e.raceClass && classes.includes(e.raceClass.toLowerCase()));
    if (filters.has('month')) list = list.filter(e => e.date <= monthEnd);
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(e => `${e.title} ${e.venue} ${e.clubName}`.toLowerCase().includes(t));
    }
    let r: number | null = null;
    if (filters.has('near') && from && !q.trim()) {
      for (const km of [50, 100, 250]) {
        r = km;
        if (list.filter(e => (e.distanceKm ?? Infinity) <= km).length >= 3) break;
      }
      list = list.filter(e => (e.distanceKm ?? Infinity) <= (r as number));
      list.sort((a, b) => a.date.localeCompare(b.date) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }
    return { shown: list, radius: r };
  }, [all, from, filters, q, monthEnd]);

  // Pins: one per venue, numbered by how many events are there
  useEffect(() => {
    const g = (window as any).google;
    if (!mapReady || !map.current || !g?.maps) return;
    markers.current.forEach(m => m.setMap(null));
    markers.current = [];
    const byVenue = new Map<string, FoundEvent[]>();
    shown.filter(e => e.lat != null).forEach(e => { const k = `${e.lat},${e.lng}`; byVenue.set(k, [...(byVenue.get(k) || []), e]); });
    const bounds = new g.maps.LatLngBounds();
    byVenue.forEach(list => {
      const e = list[0];
      const pos = { lat: e.lat!, lng: e.lng! };
      bounds.extend(pos);
      const colour = LEVEL_COLOUR[list.some(x => x.level === 'national') ? 'national' : list.some(x => x.level === 'state') ? 'state' : 'club'];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="46" viewBox="0 0 38 46"><path d="M19 44C19 44 4 28 4 17a15 15 0 0 1 30 0c0 11-15 27-15 27z" fill="${colour}" stroke="#fff" stroke-width="2.5"/><text x="19" y="22" font-family="Helvetica,Arial" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">${list.length}</text></svg>`;
      const m = new g.maps.Marker({ position: pos, map: map.current, icon: { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new g.maps.Size(38, 46), anchor: new g.maps.Point(19, 44) }, title: e.venue });
      m.addListener('click', () => setOpen(list[0]));
      markers.current.push(m);
    });
    if (from) {
      bounds.extend(from);
      markers.current.push(new g.maps.Marker({ position: from, map: map.current, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4DA3FF', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }, title: 'You', zIndex: 1 }));
    }
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { top: 140, bottom: 380, left: 30, right: 30 });
      if (byVenue.size <= 1) map.current.setZoom(11);
    }
  }, [shown, from, mapReady]);

  const inCalendar = (e: FoundEvent) => calendar.find(i => i.eventId === e.id || i.key.includes(e.id));
  const sheetTop = expanded ? 'calc(var(--m-safe-top) + 130px)' : '52dvh';

  return (
    <div className="m-find">
      <div ref={mapEl} className="m-find-map" aria-label="Map of racing" role="application" />
      {!mapReady && (
        <div className="m-find-map m-find-fallback" aria-hidden="true">
          <span style={{ left: -60, top: 120, width: 300, height: 380, borderRadius: '48% 52% 40% 60%' }} />
          <span style={{ right: -80, top: 40, width: 330, height: 300, borderRadius: '60% 40% 55% 45%' }} />
          <span style={{ left: 120, top: 260, width: 200, height: 150, borderRadius: '50%' }} />
        </div>
      )}
      <div className="m-find-top">
        <div className="m-row" style={{ gap: 8 }}>
          <button className="m-ibtn m-ibtn-d" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/calendar'))}><Icon name="back" /></button>
          <label className="m-find-search">
            <Icon name="search" size={17} />
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Search</span>
            <input placeholder="Club, venue or event" value={q} onChange={e => setQ(e.target.value)} />
          </label>
        </div>
        <div className="m-chips">
          <button className={`m-chip ${filters.has('near') ? 'm-chip-on' : 'm-chip-d'}`} onClick={() => toggle('near')} disabled={!from}>Near me</button>
          {myClasses.map(c => <button key={c} className={`m-chip ${filters.has(`class:${c}`) ? 'm-chip-on' : 'm-chip-d'}`} onClick={() => toggle(`class:${c}`)}>{c}</button>)}
          <button className={`m-chip ${filters.has('month') ? 'm-chip-on' : 'm-chip-d'}`} onClick={() => toggle('month')}>This month</button>
        </div>
      </div>

      <div className="m-find-sheet" style={{ top: sheetTop }}>
        <button className="m-grab" aria-label={expanded ? 'Show the map' : 'Show the list'} onClick={() => setExpanded(x => !x)} style={{ border: 0, padding: 0 }} />
        <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{all === null ? 'Finding racing…' : `${shown.length} ${shown.length === 1 ? 'event' : 'events'}${radius ? ' near you' : ''}`}</span>
          {radius && <span className="m-mut" style={{ fontSize: 13 }}>within {radius} km{from?.label && from.label !== 'you' ? ` of ${from.label}` : ''}</span>}
        </div>
        <div className="m-stack" style={{ gap: 8, overflowY: 'auto', flex: 1, paddingBottom: 'calc(var(--m-tab-h) + 16px)' }}>
          {all === null ? <><Skeleton h={64} /><Skeleton h={64} /></> : shown.length === 0 ? (
            <div className="m-empty">No racing found. Try fewer filters.</div>
          ) : shown.map(e => (
            <button key={e.id} className="m-card m-row" style={{ padding: '10px 12px', gap: 10, textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(e)}>
              <div className="m-date" style={{ width: 46, height: 50 }}>
                <span className="m-lb m-dim" style={{ fontSize: 9.5 }}>{fmtDay(e.date, { weekday: 'short' })}</span>
                <span className="m-disp" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1 }}>{parseDay(e.date).getDate()}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="m-ell" style={{ fontWeight: 600, fontSize: 14.5 }}>{e.title}</div>
                <div className="m-mut m-ell" style={{ fontSize: 12.5 }}>{[e.venue || e.clubName, kmLabel(e.distanceKm)].filter(Boolean).join(' · ')}</div>
              </div>
              {e.raceClass && <span className="m-cls">{e.raceClass}</span>}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <>
          <div className="m-veil" onClick={() => setOpen(null)} />
          <div className="m-sheet" role="dialog" aria-label={open.title}>
            <span className="m-grab" />
            <span className="m-pill" style={{ background: `${LEVEL_COLOUR[open.level]}26`, color: LEVEL_COLOUR[open.level], textTransform: 'capitalize' }}>{open.level} event</span>
            <div className="m-disp" style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 4px' }}>{open.title}</div>
            <div className="m-mut" style={{ fontSize: 14 }}>{fmtDay(open.date, { weekday: 'long', day: 'numeric', month: 'long' })}{open.endDate && open.endDate !== open.date ? ` – ${fmtDay(open.endDate, { day: 'numeric', month: 'long' })}` : ''}</div>
            <div className="m-card" style={{ marginTop: 12 }}>
              {open.clubName && <div className="m-li"><Icon name="club" className="m-dim" /><span style={{ flex: 1 }}>{open.clubName}</span></div>}
              {open.venue && <div className="m-li"><Icon name="pin" className="m-dim" /><span style={{ flex: 1 }}>{open.venue}</span><span className="m-dim" style={{ fontSize: 13 }}>{kmLabel(open.distanceKm)}</span></div>}
              {open.raceClass && <div className="m-li"><Icon name="sail" className="m-dim" /><span style={{ flex: 1 }}>{open.raceClass}</span></div>}
            </div>
            <div className="m-row" style={{ gap: 8, marginTop: 12 }}>
              {open.lat != null && <a className="m-btn m-btn-g" style={{ flex: 1 }} href={`https://maps.google.com/?q=${open.lat},${open.lng}`} target="_blank" rel="noreferrer"><Icon name="pin" />Directions</a>}
              {inCalendar(open)
                ? <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={() => navigate(`/calendar/event/${encodeURIComponent(inCalendar(open)!.key)}`)}>Open event</button>
                : open.norUrl ? <a className="m-btn m-btn-p" style={{ flex: 1 }} href={open.norUrl} target="_blank" rel="noreferrer"><Icon name="doc" />Notice of race</a> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FindRacingScreen;
