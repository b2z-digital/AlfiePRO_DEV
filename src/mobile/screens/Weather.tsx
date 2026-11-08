import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getStoredVenues } from '../../utils/venueStorage';
import { getAllWeatherData, getWindBearing, DailyForecast, MarineData, WeatherData, WindForecast } from '../../utils/weatherAPI';
import type { Venue } from '../../types/venue';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton, fmtDay } from '../ui';
import { askAlfie } from '../ask';
import { todayISO } from '../data';

const VENUE_KEY = 'alfie-m-weather-venue';
const norm = (s?: string) => (s || '').trim().toLowerCase();
const hourLabel = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T'));
  const h = d.getHours();
  return h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}` : `${h}`;
};

interface Wx { current: WeatherData | null; hourly: WindForecast[]; daily: DailyForecast[]; marine: MarineData | null }

/** Compass with the arrow showing which way the wind is blowing. */
const Compass: React.FC<{ deg: number }> = ({ deg }) => (
  <div style={{ position: 'relative', width: 104, height: 104, borderRadius: 999, border: '1.5px solid var(--m-card-b)', flexShrink: 0 }} aria-hidden="true">
    {['N', 'E', 'S', 'W'].map((l, i) => (
      <span key={l} className="m-dim" style={{ position: 'absolute', fontSize: 10, fontWeight: 700, ...[{ top: 4, left: '50%', transform: 'translateX(-50%)' }, { right: 6, top: '50%', transform: 'translateY(-50%)' }, { bottom: 4, left: '50%', transform: 'translateX(-50%)' }, { left: 6, top: '50%', transform: 'translateY(-50%)' }][i] }}>{l}</span>
    ))}
    <svg width="104" height="104" viewBox="0 0 104 104" style={{ position: 'absolute', inset: 0, transform: `rotate(${deg + 180}deg)` }}>
      <path d="M52 18 L60 52 L52 46 L44 52 Z" fill="var(--m-blue-ink)" />
      <path d="M52 86 L52 52" stroke="var(--m-blue-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </div>
);

/** Wind, temperature and tides for a venue, from the same forecast service and cache as AlfiePRO's weather data. */
export const WeatherScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { calendar, light } = useMobile();
  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(() => { try { return localStorage.getItem(VENUE_KEY); } catch { return null; } });
  const [wx, setWx] = useState<Wx | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  const nextRace = useMemo(() => calendar.filter(i => i.kind === 'race' && !i.cancelled && i.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date))[0], [calendar]);

  useEffect(() => { getStoredVenues().then(v => setVenues((v || []).filter(x => x.latitude && x.longitude))).catch(() => setVenues([])); }, [currentClub?.clubId]);

  const venue = useMemo(() => {
    if (!venues?.length) return null;
    return venues.find(v => v.id === venueId)
      || (nextRace && venues.find(v => norm(v.name) === norm(nextRace.venue)))
      || venues.find(v => (v as any).isDefault || (v as any).is_default) || venues[0];
  }, [venues, venueId, nextRace]);
  const forNextRace = !!(venue && nextRace && norm(venue.name) === norm(nextRace.venue));

  useEffect(() => {
    if (!venue) { if (venues) setWx(null); return; }
    setWx(undefined);
    getAllWeatherData(venue.latitude!, venue.longitude!, venue.name)
      .then(d => setWx(d?.current || d?.hourly?.length ? { current: d.current || null, hourly: d.hourly || [], daily: d.daily || [], marine: d.marine || null } : null))
      .catch(() => setWx(null));
  }, [venue?.id, venues === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const raceDay = forNextRace && wx?.daily?.find(d => d.date === nextRace!.date);
  const maxWind = Math.max(10, ...(wx?.hourly || []).map(h => h.windGust || h.windSpeed));
  const tides = (wx?.marine?.tides || []).filter(t => new Date(t.time).getTime() > Date.now() - 6 * 3600e3).slice(0, 4);
  const nextHigh = tides.find(t => t.type === 'high' && new Date(t.time).getTime() > Date.now());
  const c = wx?.current;

  return (
    <div className="m-stack">
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/me'))}><Icon name="back" /></button>
        <button onClick={() => setPicking(true)} style={{ flex: 1, minWidth: 0, background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--m-ink)' }} disabled={!venues?.length}>
          <div className="m-dim" style={{ fontSize: 12 }}>{forNextRace ? `${fmtDay(nextRace!.date, { weekday: 'long' })} · next race` : 'Wind & tides'}</div>
          <div className="m-row" style={{ gap: 4, fontWeight: 700, fontSize: 17 }}><span className="m-ell">{venue?.name || 'Your venues'}</span>{(venues?.length || 0) > 1 && <Icon name="down" size={16} />}</div>
        </button>
      </header>

      {venues === null || wx === undefined ? <><Skeleton h={140} /><Skeleton h={180} /></> : !venue ? (
        <div className="m-card m-empty">Add your club's venues with their map location on the desktop, and the forecast for each shows here.</div>
      ) : wx === null ? (
        <>
          <div className="m-card m-empty">The forecast isn't available right now. Here's the live wind map for {venue.name}.</div>
          <iframe title={`Wind map for ${venue.name}`} style={{ width: '100%', height: 360, border: 0, borderRadius: 20 }}
            src={`https://embed.windy.com/embed.html?type=map&location=coordinates&metricWind=kt&metricTemp=%C2%B0C&zoom=11&overlay=wind&product=ecmwf&level=surface&lat=${venue.latitude}&lon=${venue.longitude}&detailLat=${venue.latitude}&detailLon=${venue.longitude}&marker=true`} />
        </>
      ) : (
        <>
          {c && (
            <div className="m-card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
              <Compass deg={c.windDirection} />
              <div>
                <div className="m-disp" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{Math.round(c.windSpeed)}<span style={{ fontSize: 20 }}> kn</span></div>
                <div className="m-mut" style={{ fontSize: 14, marginTop: 4 }}>{getWindBearing(c.windDirection)}{c.windGust ? ` · gusts ${Math.round(c.windGust)} kn` : ''}</div>
                <div className="m-dim" style={{ fontSize: 13 }}>{Math.round(c.temperature)}° · {c.description}</div>
              </div>
            </div>
          )}
          {raceDay && (
            <div className="m-card m-row" style={{ padding: '12px 14px', gap: 10 }}>
              <Icon name="calendar" className="m-dim" />
              <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 600 }}>{fmtDay(raceDay.date, { weekday: 'long' })}</b> <span className="m-mut">{Math.round(raceDay.windSpeedMin)}–{Math.round(raceDay.windSpeedMax)} kn {getWindBearing(raceDay.windDirection)} · {Math.round(raceDay.tempMax)}°</span></span>
            </div>
          )}
          {wx.hourly.length > 0 && (
            <div className="m-card" style={{ padding: 14 }}>
              <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Wind, next 24 hours</span>
                <span className="m-lb" style={{ color: 'var(--m-blue-ink)' }}>knots</span>
              </div>
              <div className="m-row" style={{ alignItems: 'flex-end', height: 120, marginTop: 10, gap: 2 }} role="img"
                aria-label={wx.hourly.map(h => `${hourLabel(h.time)} ${Math.round(h.windSpeed)} knots`).join(', ')}>
                {wx.hourly.map(h => (
                  <div key={h.time} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 11.5 }}>
                    <span className="m-num" style={{ fontSize: 11, fontWeight: 600 }}>{Math.round(h.windSpeed)}</span>
                    <span style={{ position: 'relative', width: 16, height: Math.max(6, (h.windSpeed / maxWind) * 74), borderRadius: 5, background: 'linear-gradient(180deg,#4DA3FF,#0A6FD6)' }}>
                    </span>
                    <span className="m-dim">{hourLabel(h.time)}</span>
                  </div>
                ))}
              </div>
              {(() => {
                const s = wx.hourly.map(h => h.windSpeed);
                const lo = Math.round(Math.min(...s)), hi = Math.round(Math.max(...s));
                const peak = wx.hourly[s.indexOf(Math.max(...s))];
                return <div className="m-dim" style={{ fontSize: 12.5, marginTop: 6 }}>Between {lo} and {hi} kn, strongest around {new Date(peak.time.replace(' ', 'T')).toLocaleTimeString('en-AU', { hour: 'numeric' })}.</div>;
              })()}
            </div>
          )}
          {tides.length > 0 ? (
            <div className="m-card" style={{ padding: 14 }}>
              <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Tide</span>
                {nextHigh && <span className="m-mut" style={{ fontSize: 13 }}>High {new Date(nextHigh.time).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })} · {nextHigh.height.toFixed(1)} m</span>}
              </div>
              <div className="m-row" style={{ marginTop: 10, gap: 8 }}>
                {tides.map(t => (
                  <div key={t.time} style={{ flex: 1, textAlign: 'center' }}>
                    <Icon name={t.type === 'high' ? 'send' : 'down'} size={16} className="m-dim" />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{new Date(t.time).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}</div>
                    <div className="m-dim" style={{ fontSize: 12 }}>{t.type === 'high' ? 'High' : 'Low'} {t.height.toFixed(1)} m</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {wx.daily.length > 1 && (
            <div className="m-card">
              {wx.daily.slice(0, 5).map(d => (
                <div key={d.date} className="m-li" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <span style={{ width: 44, fontWeight: 600, fontSize: 14 }}>{fmtDay(d.date, { weekday: 'short' })}</span>
                  <span className="m-mut" style={{ flex: 1, fontSize: 13.5 }}>{d.description}</span>
                  <span className="m-num" style={{ fontSize: 14, fontWeight: 600 }}>{Math.round(d.windSpeedMin)}–{Math.round(d.windSpeedMax)} kn</span>
                  <span className="m-dim" style={{ width: 34, textAlign: 'right', fontSize: 13 }}>{getWindBearing(d.windDirection)}</span>
                </div>
              ))}
            </div>
          )}
          {c && (
            <button className="m-card m-row" style={{ padding: '12px 14px', gap: 10, textAlign: 'left', color: 'inherit' }}
              onClick={() => askAlfie(`Which rig should I use${forNextRace ? ` for ${nextRace!.title}` : ''} at ${venue.name}? The forecast is ${Math.round(raceDay ? raceDay.windSpeedMin : c.windSpeed)}–${Math.round(raceDay ? raceDay.windSpeedMax : (c.windGust || c.windSpeed))} knots from the ${getWindBearing(raceDay ? raceDay.windDirection : c.windDirection)}.`)}>
              <span className="m-av" style={{ width: 30, height: 30, padding: 2, background: 'conic-gradient(from 200deg,#2E7BFF,#8A4DFF,#FF3E9A,#FF8A2B,#2E7BFF)' }}><span className="m-av" style={{ width: '100%', height: '100%', background: light ? '#fff' : '#0B1222' }} /></span>
              <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 600 }}>Ask Alfie which rig</b> <span className="m-mut">for these conditions</span></span>
              <Icon name="chevron" size={17} className="m-dim" />
            </button>
          )}
        </>
      )}

      {picking && venues && (
        <>
          <div className="m-veil" onClick={() => setPicking(false)} />
          <div className="m-sheet" role="dialog" aria-label="Venues">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Venue</div>
            <div className="m-card">
              {venues.map(v => (
                <button key={v.id} className="m-li" onClick={() => { setVenueId(v.id); try { localStorage.setItem(VENUE_KEY, v.id); } catch { /* ignore */ } setPicking(false); }}>
                  <Icon name="pin" className="m-dim" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{v.name}</span>
                    {(v as any).city && <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>{(v as any).city}</span>}
                  </span>
                  {venue?.id === v.id && <Icon name="check" className="m-dim" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherScreen;
