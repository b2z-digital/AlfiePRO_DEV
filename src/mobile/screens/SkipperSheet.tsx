/**
 * Skipper card (phase 2 board, "Tap a skipper"): opened from any results or standings row.
 * Event: how they sailed it race by race (drops marked). Series: round by round.
 * Numbers come from the same results as the table it was opened from.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RaceSeries } from '../../types/race';
import type { MStandings } from '../data';
import { userIdForMember } from '../club';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { ordinal } from './Home';
import { calculateSkipperPerformance } from '../../utils/skipperPerformance';
import { eventRaceResults } from '../performance';
import type { MCalendarItem } from '../data';

export interface SheetSkipper {
  name: string;
  sailNo?: string;
  memberId?: string;
  position: number;
  of: number;
  /** Event mode */
  standings?: MStandings;
  index?: number;
  /** Series mode */
  series?: RaceSeries;
  seriesRow?: any;
  context?: string;
  /** The event, for the desktop's performance numbers (consistency) */
  item?: MCalendarItem;
  /** Results already worked out elsewhere (imported state / national results) */
  points?: { label: string; value: string; place: number | null; dropped: boolean }[];
  dropSaved?: number;
}

interface Point { label: string; value: string; place: number | null; dropped: boolean }

export function skipperPoints(s: SheetSkipper): Point[] {
  if (s.points) return s.points;
  if (s.standings && s.index != null) {
    return s.standings.races.map(r => {
      const v = s.standings!.cell(s.index!, r);
      const n = /^\d+(\.\d+)?$/.test(v) ? Number(v) : null;
      return { label: `R${r}`, value: v || '–', place: n, dropped: s.standings!.isDropped(s.index!, r) };
    }).filter(p => p.value !== '–');
  }
  if (s.series && s.seriesRow) {
    return s.series.rounds.map((r, i) => {
      if (!r.completed) return null;
      const p = s.seriesRow.roundPositions[i];
      return { label: `R${i + 1}`, value: p != null ? String(p) : 'DNC', place: p ?? null, dropped: !!s.seriesRow.droppedRounds?.has(i) };
    }).filter(Boolean) as Point[];
  }
  return [];
}

export function skipperStats(points: Point[]) {
  const placed = points.filter(p => p.place != null).map(p => p.place!) as number[];
  const avg = placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : null;
  return {
    sailed: points.length,
    finished: placed.length,
    avg,
    best: placed.length ? Math.min(...placed) : null,
    worst: placed.length ? Math.max(...placed) : null,
    wins: placed.filter(p => p === 1).length,
    top3: placed.filter(p => p <= 3).length,
  };
}

const place = (n: number | null) => (n == null ? '–' : `${n}${ordinal(n)}`);

export const SkipperSheet: React.FC<{ skipper: SheetSkipper; onClose: () => void }> = ({ skipper, onClose }) => {
  const navigate = useNavigate();
  const { toast } = useMobile();
  const points = useMemo(() => skipperPoints(skipper), [skipper]);
  const st = skipperStats(points);
  const row = skipper.standings && skipper.index != null ? skipper.standings.rows.find(r => r.index === skipper.index) : null;
  const perf = useMemo(() => (skipper.item && skipper.index != null ? calculateSkipperPerformance(eventRaceResults(skipper.item), skipper.index, skipper.item.event?.dropRules) : null), [skipper]);
  const dropSaved = skipper.dropSaved != null ? skipper.dropSaved : row ? row.gross - row.net : skipper.seriesRow
    ? (skipper.series!.rounds.reduce((sum, _r, i) => sum + (skipper.seriesRow.droppedRounds?.has(i) ? (skipper.seriesRow.roundPositions[i] ?? skipper.seriesRow.roundPoints[i] ?? 0) : 0), 0))
    : 0;
  const unit = skipper.series ? 'round' : 'race';
  const maxPlace = Math.max(...points.map(p => p.place || 0), skipper.of, 3);
  const initials = skipper.name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const message = async () => {
    if (!skipper.memberId) { toast('This skipper isn\'t on AlfiePRO yet'); return; }
    const uid = await userIdForMember(skipper.memberId).catch(() => null);
    if (!uid) { toast('This skipper isn\'t on AlfiePRO yet'); return; }
    navigate(`/comms/chat/${uid}`);
  };

  return (
    <>
      <div className="m-veil" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-label={`${skipper.name}'s results`}>
        <span className="m-grab" />
        <div className="m-row" style={{ gap: 12 }}>
          <span className="m-av" style={{ width: 48, height: 48, fontSize: 16, background: 'linear-gradient(135deg,#FF8A2B,#FF3E9A)' }}>{initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{skipper.name}</div>
            <div className="m-mut" style={{ fontSize: 13 }}>{[skipper.sailNo, `${place(skipper.position)} of ${skipper.of}`, skipper.context].filter(Boolean).join(' · ')}</div>
          </div>
          <button className="m-ibtn" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 14 }}>
          {[
            [st.avg != null ? String(Math.round(st.avg * 10) / 10) : '–', 'Avg finish'],
            [place(st.best), 'Best'],
            [place(st.worst), 'Worst'],
            [String(st.wins), `${unit === 'round' ? 'Round' : 'Race'} wins`],
            [`${st.top3}/${st.sailed}`, 'Top 3'],
            [dropSaved ? `−${Math.round(dropSaved * 10) / 10}` : '0', 'Drops saved'],
          ].map(([v, l]) => (
            <div key={l} className="m-card" style={{ padding: '10px 12px' }}>
              <div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{v}</div>
              <div className="m-mut" style={{ fontSize: 11.5 }}>{l}</div>
            </div>
          ))}
        </div>

        {points.length > 0 && (
          <>
            <p className="m-lb m-dim" style={{ margin: '16px 0 8px' }}>{unit === 'round' ? 'Round by round' : 'Race by race'}</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, overflowX: 'auto', paddingTop: 4 }}>
              {points.map(p => {
                const h = p.place != null ? Math.max(14, 100 - ((p.place - 1) / Math.max(maxPlace - 1, 1)) * 80) : 14;
                const bg = p.dropped ? 'rgba(255,123,114,.35)' : p.place === 1 ? 'linear-gradient(180deg,#FFD25E,#E8A26B)' : p.place != null && p.place <= 3 ? 'rgba(77,163,255,.55)' : 'var(--m-bar)';
                return (
                  <div key={p.label} style={{ flex: '1 0 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, textDecoration: p.dropped ? 'line-through' : undefined }}>{p.value}</span>
                    <span style={{ width: '100%', height: h, borderRadius: '8px 8px 4px 4px', background: bg }} />
                    <span className="m-dim" style={{ fontSize: 10.5 }}>{p.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="m-card" style={{ padding: '10px 12px', marginTop: 12, fontSize: 13.5, lineHeight: 1.45 }}>
              {perf && perf.racesCompleted > 1 && <><b>Consistency {perf.consistencyScore}</b> <span className="m-mut">(lower is steadier). </span></>}
              <b>Finished {st.finished} of {st.sailed} {unit}s.</b>{' '}
              <span className="m-mut">{points.some(p => p.dropped) ? `Dropped: ${points.filter(p => p.dropped).map(p => `${p.label} (${p.value})`).join(', ')}.` : 'Nothing dropped.'}</span>
            </div>
          </>
        )}

        <div className="m-row" style={{ gap: 8, marginTop: 14 }}>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} disabled={!skipper.memberId} onClick={() => skipper.memberId && navigate(`/skipper/m:${skipper.memberId}`)}>View profile</button>
          <button className="m-btn m-btn-g" style={{ flex: 1 }} onClick={() => navigate(`/compare?b=${encodeURIComponent(skipper.memberId ? `m:${skipper.memberId}` : skipper.name)}`)}>Compare</button>
          <button className="m-btn m-btn-p" style={{ flex: 1 }} onClick={() => void message()}><Icon name="chat" size={17} />Message</button>
        </div>
      </div>
    </>
  );
};
