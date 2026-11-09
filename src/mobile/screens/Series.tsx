/**
 * Series standings (Member app board, Racing › Results › Series standings): where you sit, how you
 * got there and what you need in the rounds left. Standings come from the same calculation as the
 * web's SeriesResultsDisplay (utils/seriesStandings), so both always agree.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoredRaceSeries } from '../../utils/raceStorage';
import { computeSeriesStandings, effectiveSeriesSkippers, seriesHasResults, type SeriesStandingRow } from '../../utils/seriesStandings';
import type { RaceSeries } from '../../types/race';
import { useMobile } from '../MobileContext';
import { Skeleton, SubHeader } from '../ui';
import { ordinal } from './Home';
import { shortName } from './Racing';
import { SkipperSheet, type SheetSkipper } from './SkipperSheet';

const fmt = (n: number | null | undefined, handicap: boolean) =>
  n == null ? '–' : handicap ? String(Number(n.toFixed(1))) : String(Math.round(n * 100) / 100);

export function standingsFor(series: RaceSeries, uptoRound?: number): SeriesStandingRow[] {
  const s = uptoRound == null ? series : { ...series, rounds: series.rounds.map((r, i) => (i > uptoRound ? { ...r, completed: false } : r)) };
  return computeSeriesStandings({ ...s, skippers: effectiveSeriesSkippers(s) } as RaceSeries);
}

export const SeriesScreen: React.FC = () => {
  const { id = '' } = useParams();
  const { memberIds, profile } = useMobile();
  const [series, setSeries] = useState<RaceSeries | null | undefined>(undefined);
  const [open, setOpen] = useState<SheetSkipper | null>(null);
  const fullName = `${profile.firstName} ${profile.lastName}`.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    getStoredRaceSeries().then(list => { if (!cancelled) setSeries(list.find(s => s.id === id) || null); }).catch(() => setSeries(null));
    return () => { cancelled = true; };
  }, [id]);

  const data = useMemo(() => {
    if (!series || !seriesHasResults(series)) return null;
    const rows = standingsFor(series);
    const done = series.rounds.map((r, i) => (r.completed ? i : -1)).filter(i => i >= 0);
    const last = done[done.length - 1];
    const prevRows = done.length > 1 ? standingsFor(series, done[done.length - 2]) : null;
    const prevPos = new Map(prevRows?.map((r, i) => [r.displayName || r.name, i + 1]) || []);
    const isMe = (r: SeriesStandingRow) => (r.memberId && memberIds.includes(r.memberId)) || (!!fullName && String(r.displayName || r.name || '').trim().toLowerCase() === fullName);
    const meIdx = rows.findIndex(isMe);
    return { rows, done, last, prevPos, isMe, meIdx };
  }, [series, memberIds, fullName]);

  if (series === undefined) return <div className="m-stack"><SubHeader title="Series" /><Skeleton h={160} /><Skeleton h={320} /></div>;
  if (!series) return <div className="m-stack"><SubHeader title="Series" /><div className="m-card m-empty">This series isn't available.</div></div>;

  const handicap = series.raceFormat === 'handicap';
  const name = (r: SeriesStandingRow) => String(r.displayName || r.name || '');
  const sail = (r: SeriesStandingRow) => String(r.displaySailNo || r.sailNo || r.sailNumber || '');
  const me = data && data.meIdx >= 0 ? data.rows[data.meIdx] : null;
  const ahead = data && data.meIdx > 0 ? data.rows[data.meIdx - 1] : null;
  const moved = (r: SeriesStandingRow, pos: number) => {
    const before = data?.prevPos.get(name(r));
    if (!before || before === pos) return <span className="m-dim">–</span>;
    return before > pos
      ? <span style={{ color: '#5FD47F', fontWeight: 700 }}>▲{before - pos}</span>
      : <span style={{ color: '#FF7B72', fontWeight: 700 }}>▼{pos - before}</span>;
  };

  return (
    <div className="m-stack">
      <SubHeader title="Series standings" />
      <div>
        <div className="m-mut" style={{ fontSize: 13 }}>{series.clubName || 'Club series'}</div>
        <h2 className="m-disp" style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{series.seriesName}</h2>
        <div className="m-row" style={{ gap: 6, marginTop: 8 }}>
          {series.raceClass && <span className="m-cls">{series.raceClass}</span>}
          <span className="m-cls" style={{ textTransform: 'capitalize' }}>{series.raceFormat}</span>
        </div>
      </div>

      {!data ? <div className="m-card m-empty">No rounds have been scored yet.</div> : (
        <>
          {me && (
            <div className="m-card m-spec" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="m-disp" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{data.meIdx + 1}<span style={{ fontSize: 20 }}>{ordinal(data.meIdx + 1)}</span></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>of {data.rows.length} · {fmt(me.total, handicap)} pts</div>
                <div className="m-mut" style={{ fontSize: 13, marginTop: 2, lineHeight: 1.4 }}>
                  {[`${data.done.length} of ${series.rounds.length} rounds`,
                    ahead ? `${fmt(me.total - ahead.total, handicap)} pts behind ${data.meIdx}${ordinal(data.meIdx)}` : 'leading the series',
                  ].join(' · ')}
                </div>
              </div>
            </div>
          )}

          <div className="m-card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              <thead>
                <tr style={{ color: 'var(--m-dim)', fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 8px' }}>#</th>
                  <th style={{ padding: '9px 6px', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--m-sheet)' }}>Skipper</th>
                  <th style={{ padding: '9px 4px' }} aria-label="Change since last round" />
                  {series.rounds.map((r, i) => r.completed ? <th key={i} style={{ padding: '9px 6px' }}>R{i + 1}</th> : null)}
                  <th style={{ padding: '9px 10px' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, pos) => {
                  const mine = data.isMe(r);
                  return (
                    <tr key={`${name(r)}-${pos}`} onClick={() => setOpen({ name: name(r), sailNo: sail(r), memberId: r.memberId, position: pos + 1, of: data.rows.length, series, seriesRow: r })}
                      style={{ borderTop: '1px solid var(--m-line)', background: mine ? 'rgba(10,132,255,.12)' : undefined, cursor: 'pointer' }}>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700 }} className="m-disp">{pos + 1}</td>
                      <td style={{ padding: '10px 6px', fontWeight: mine ? 700 : 500, position: 'sticky', left: 0, background: mine ? 'linear-gradient(rgba(10,132,255,.12), rgba(10,132,255,.12)), var(--m-sheet)' : 'var(--m-sheet)' }}>
                        {mine ? 'You' : shortName(name(r))} <span className="m-dim" style={{ fontWeight: 400 }}>{sail(r)}</span>
                      </td>
                      <td style={{ padding: '10px 4px', textAlign: 'center', fontSize: 11.5 }}>{moved(r, pos + 1)}</td>
                      {series.rounds.map((round, i) => {
                        if (!round.completed) return null;
                        const p = r.roundPositions[i];
                        const pts = r.roundPoints[i];
                        const dropped = r.droppedRounds?.has(i);
                        const v = p != null ? String(p) : pts != null ? `${fmt(pts, handicap)}` : '';
                        return <td key={i} style={{ padding: '10px 6px', textAlign: 'center', color: dropped ? 'var(--m-dim)' : p == null ? 'var(--m-mut)' : undefined, textDecoration: dropped ? 'line-through' : undefined }}>{v}</td>;
                      })}
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700 }}>{fmt(r.total, handicap)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="m-dim" style={{ margin: 0, fontSize: 12 }}>Struck-through rounds are dropped. A round with no place is points for not sailing it. Tap a skipper for their card.</p>
        </>
      )}
      {open && <SkipperSheet skipper={open} onClose={() => setOpen(null)} />}
    </div>
  );
};
