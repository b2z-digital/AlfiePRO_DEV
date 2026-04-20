import React, { useMemo, useCallback } from 'react';
import { Skipper } from '../types';
import { HeatManagement } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { breakTie } from '../utils/hmsHeatSystem';

interface HmsScoreSheetProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  dropRules: number[];
  darkMode: boolean;
  externalRaceResults?: any[];
}

const ROW_HEIGHT = 18;
const COL_W = 34;
const SEP_W = 3;

const COL_WIDTHS = {
  pos: 50,
  skipper: 120,
  sailNo: 42,
  club: 130,
  hull: 55,
  myaNo: 48,
  total: 48,
  score: 52,
};

const STICKY_OFFSETS = {
  pos: 0,
  skipper: COL_WIDTHS.pos,
  sailNo: COL_WIDTHS.pos + COL_WIDTHS.skipper,
  club: COL_WIDTHS.pos + COL_WIDTHS.skipper + COL_WIDTHS.sailNo,
  hull: COL_WIDTHS.pos + COL_WIDTHS.skipper + COL_WIDTHS.sailNo + COL_WIDTHS.club,
  myaNo: COL_WIDTHS.pos + COL_WIDTHS.skipper + COL_WIDTHS.sailNo + COL_WIDTHS.club + COL_WIDTHS.hull,
  total: COL_WIDTHS.pos + COL_WIDTHS.skipper + COL_WIDTHS.sailNo + COL_WIDTHS.club + COL_WIDTHS.hull + COL_WIDTHS.myaNo,
  score: COL_WIDTHS.pos + COL_WIDTHS.skipper + COL_WIDTHS.sailNo + COL_WIDTHS.club + COL_WIDTHS.hull + COL_WIDTHS.myaNo + COL_WIDTHS.total,
};

function getOrdinalLabel(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmt1(val: number | undefined | null): string {
  if (val == null || !Number.isFinite(val)) return '-';
  return val.toFixed(1);
}

export const HmsScoreSheet: React.FC<HmsScoreSheetProps> = ({
  skippers,
  heatManagement,
  dropRules,
  externalRaceResults,
}) => {
  const numberOfHeats = heatManagement?.configuration?.numberOfHeats || 2;
  const useHMSTieBreak = numberOfHeats > 1;

  const raceResults = useMemo(() => {
    try {
      if (externalRaceResults && externalRaceResults.length > 0) return externalRaceResults;
      if (!heatManagement?.rounds?.length) return [];
      return convertHeatResultsToRaceResults(heatManagement, skippers);
    } catch (e) {
      console.error('Error converting race results:', e);
      return [];
    }
  }, [heatManagement, skippers, externalRaceResults]);

  const completedRaces = useMemo(() => {
    const races = new Set(raceResults.map((r: any) => r.race));
    return Array.from(races).sort((a: any, b: any) => a - b) as number[];
  }, [raceResults]);

  const standings = useMemo(() => {
    try {
      if (!skippers || skippers.length === 0 || raceResults.length === 0) return [];

      const skipperIndicesWithResults = new Set(
        raceResults.map((r: any) => r.skipperIndex).filter((idx: any) => idx != null)
      );

      const allStandings = Array.from(skipperIndicesWithResults).map((skipperIndex: any) => {
        const skipper = skippers[skipperIndex];
        if (!skipper) return null;

        const skipperRaceResults = raceResults
          .filter((r: any) => r.skipperIndex === skipperIndex)
          .sort((a: any, b: any) => a.race - b.race);

        const points = skipperRaceResults.map((r: any) => r.position || 999);
        const total = points.reduce((sum: number, p: number) => sum + p, 0);

        let drops = 0;
        if (Array.isArray(dropRules)) {
          for (const rule of dropRules) {
            if (points.length >= rule) drops++;
          }
        }

        let totalDropped = 0;
        const droppedRaceIndices = new Set<number>();
        if (drops > 0) {
          const indexedScores = points.map((score: number, idx: number) => ({ score, idx }));
          indexedScores.sort((a: any, b: any) => b.score - a.score);
          for (let i = 0; i < drops && i < indexedScores.length; i++) {
            droppedRaceIndices.add(indexedScores[i].idx);
            totalDropped += indexedScores[i].score;
          }
        }

        const net = total - totalDropped;

        const sortedAllScores = [...points].sort((a, b) => a - b);

        const droppedScoreValues = points
          .map((score: number, idx: number) => ({ score, idx }))
          .filter(({ idx }: { idx: number }) => droppedRaceIndices.has(idx))
          .map(({ score }: { score: number }) => score)
          .sort((a: number, b: number) => b - a);

        return {
          skipperIndex: skipperIndex as number,
          skipper,
          raceResults: skipperRaceResults,
          points,
          total,
          drops,
          droppedRaceIndices,
          totalDropped,
          net,
          sortedAllScores,
          droppedScoreValues,
          racesScored: points.length,
        };
      }).filter(Boolean) as any[];

      const hmsBreakTieCompare = (a: any, b: any): number => {
        try {
          const allRR = raceResults.map((r: any) => ({
            ...r, race: r.race, skipperIndex: r.skipperIndex, position: r.position || null,
          }));
          const tieResult = breakTie([a.skipperIndex, b.skipperIndex], allRR, new Map(), useHMSTieBreak);
          return tieResult.indexOf(a.skipperIndex) - tieResult.indexOf(b.skipperIndex);
        } catch { return 0; }
      };

      return allStandings.sort((a: any, b: any) => {
        if (a.net !== b.net) return a.net - b.net;
        return hmsBreakTieCompare(a, b);
      });
    } catch (e) {
      console.error('Error computing standings:', e);
      return [];
    }
  }, [skippers, raceResults, dropRules, useHMSTieBreak]);

  const maxDropCols = useMemo(() => {
    if (standings.length === 0) return 0;
    const maxActual = Math.max(...standings.map((s: any) => s.droppedScoreValues?.length || 0));
    return Math.max(maxActual, 1);
  }, [standings]);

  const maxBestCols = useMemo(() => {
    if (standings.length === 0) return 0;
    const maxActual = Math.max(...standings.map((s: any) => s.sortedAllScores?.length || 0));
    return Math.min(Math.max(maxActual, 1), 10);
  }, [standings]);

  const getSailNo = useCallback((skipper: any) => {
    return skipper?.sailNo || skipper?.sailNumber || skipper?.boat_sail_number || '-';
  }, []);

  if (completedRaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        No completed races yet. Start scoring heats to see the score sheet.
      </div>
    );
  }

  const dropScheduleText = dropRules.length > 0 ? `Dis.Sched: ${dropRules.join(', ')}` : '';

  const th = 'px-0.5 py-0.5 text-[9px] font-extrabold text-center whitespace-nowrap border-b border-r border-slate-400';
  const td = 'px-0.5 py-0 text-[10px] text-center font-medium tabular-nums border-b border-r border-slate-200';

  const frozenHeaderStyle = (left: number, bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    backgroundColor: bg,
    position: 'sticky',
    left,
    zIndex: 30,
    ...extra,
  });

  const frozenCellStyle = (left: number, bg: string, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'sticky',
    left,
    backgroundColor: bg,
    zIndex: 10,
    ...extra,
  });

  return (
    <div className="h-full overflow-auto bg-white text-black">
      <table className="border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: COL_WIDTHS.pos }} />
          <col style={{ width: COL_WIDTHS.skipper }} />
          <col style={{ width: COL_WIDTHS.sailNo }} />
          <col style={{ width: COL_WIDTHS.club }} />
          <col style={{ width: COL_WIDTHS.hull }} />
          <col style={{ width: COL_WIDTHS.myaNo }} />
          <col style={{ width: COL_WIDTHS.total }} />
          <col style={{ width: COL_WIDTHS.score }} />
          {completedRaces.map(r => (
            <col key={`r${r}`} style={{ width: COL_W }} />
          ))}
          <col style={{ width: SEP_W }} />
          {Array.from({ length: maxDropCols }).map((_, i) => (
            <col key={`d${i}`} style={{ width: COL_W }} />
          ))}
          <col style={{ width: COL_W + 6 }} />
          <col style={{ width: SEP_W }} />
          {Array.from({ length: maxBestCols }).map((_, i) => (
            <col key={`b${i}`} style={{ width: COL_W }} />
          ))}
          <col style={{ width: SEP_W }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 38 }} />
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.pos, '#FFFF00')}>Position</th>
            <th className={`${th} text-left`} style={frozenHeaderStyle(STICKY_OFFSETS.skipper, '#00FFFF')}>Skipper</th>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.sailNo, '#00FFFF')}>Sail #</th>
            <th className={`${th} text-left`} style={frozenHeaderStyle(STICKY_OFFSETS.club, '#00FFFF')}>Club/City</th>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.hull, '#00FFFF')}>Hull</th>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.myaNo, '#00FFFF')}>MYA No.</th>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.total, '#00FFFF')}>Total</th>
            <th className={th} style={frozenHeaderStyle(STICKY_OFFSETS.score, '#90EE90', { borderRight: '3px solid #333' })}>Score</th>
            {completedRaces.map(race => (
              <th key={race} className={th} style={{ backgroundColor: '#D3D3D3' }}>{race}</th>
            ))}
            <th style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #9ca3af' }}></th>
            {Array.from({ length: maxDropCols }).map((_, i) => (
              <th key={`d${i}`} className={th} style={{ backgroundColor: '#FFB6C1' }}>dis {i + 1}</th>
            ))}
            <th className={th} style={{ backgroundColor: '#FFB6C1' }}>Total Dis</th>
            <th style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #9ca3af' }}></th>
            {Array.from({ length: maxBestCols }).map((_, i) => (
              <th key={`b${i}`} className={th} style={{ backgroundColor: '#ADD8E6' }}>
                {i === 0 ? 'Best' : getOrdinalLabel(i + 1)}
              </th>
            ))}
            <th style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #9ca3af' }}></th>
            <th className={th} style={{ backgroundColor: '#FFFACD' }}>Avg</th>
            <th className={th} style={{ backgroundColor: '#FFFACD' }}>Races</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing: any, index: number) => {
            const sailNo = getSailNo(standing.skipper);
            const boat = standing.skipper?.boatModel || standing.skipper?.boat_class || '-';
            const club = standing.skipper?.club || '-';
            const myaNo = (standing.skipper as any)?.myaNumber || (standing.skipper as any)?.mya_number || '';

            return (
              <tr key={standing.skipperIndex} className="hover:bg-yellow-50" style={{ height: ROW_HEIGHT }}>
                <td className={td} style={frozenCellStyle(STICKY_OFFSETS.pos, '#FFFF00', { fontWeight: 700 })}>{index + 1}</td>
                <td className={`${td} text-left truncate`} style={frozenCellStyle(STICKY_OFFSETS.skipper, '#fff', { maxWidth: COL_WIDTHS.skipper })}>
                  {standing.skipper?.name || 'Unknown'}
                </td>
                <td className={td} style={frozenCellStyle(STICKY_OFFSETS.sailNo, '#fff', { fontWeight: 600 })}>{sailNo}</td>
                <td className={`${td} text-left truncate`} style={frozenCellStyle(STICKY_OFFSETS.club, '#fff', { maxWidth: COL_WIDTHS.club, fontSize: 9 })}>
                  {club}
                </td>
                <td className={`${td} text-left truncate`} style={frozenCellStyle(STICKY_OFFSETS.hull, '#fff', { maxWidth: COL_WIDTHS.hull, fontSize: 9 })}>
                  {boat}
                </td>
                <td className={td} style={frozenCellStyle(STICKY_OFFSETS.myaNo, '#fff')}>
                  {myaNo}
                </td>
                <td className={td} style={frozenCellStyle(STICKY_OFFSETS.total, '#fff')}>
                  {fmt1(standing.total)}
                </td>
                <td className={td} style={frozenCellStyle(STICKY_OFFSETS.score, '#90EE90', { fontWeight: 700, borderRight: '3px solid #333' })}>
                  {fmt1(standing.net)}
                </td>

                {completedRaces.map((race: number, raceIdx: number) => {
                  const result = standing.raceResults?.find((r: any) => r.race === race);
                  const position = result?.position;
                  const isDropped = standing.droppedRaceIndices?.has(raceIdx);
                  return (
                    <td
                      key={race}
                      className={td}
                      style={isDropped ? { backgroundColor: '#D3D3D3', color: '#666' } : undefined}
                    >
                      {position != null ? fmt1(position) : '-'}
                    </td>
                  );
                })}

                <td style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #e2e8f0' }}></td>

                {Array.from({ length: maxDropCols }).map((_, i) => (
                  <td key={`d${i}`} className={td} style={{ backgroundColor: '#D3D3D3', color: '#666' }}>
                    {standing.droppedScoreValues?.[i] != null ? fmt1(standing.droppedScoreValues[i]) : ''}
                  </td>
                ))}

                <td className={td} style={{ backgroundColor: '#D3D3D3', color: '#666', fontWeight: 600 }}>
                  {standing.totalDropped > 0 ? fmt1(standing.totalDropped) : ''}
                </td>

                <td style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #e2e8f0' }}></td>

                {Array.from({ length: maxBestCols }).map((_, i) => (
                  <td key={`b${i}`} className={td} style={{ backgroundColor: '#F0F8FF' }}>
                    {standing.sortedAllScores?.[i] != null ? standing.sortedAllScores[i] : ''}
                  </td>
                ))}

                <td style={{ backgroundColor: '#333', width: SEP_W, padding: 0, borderBottom: '1px solid #e2e8f0' }}></td>

                <td className={td} style={{ backgroundColor: '#FFFFF0' }}>
                  {standing.racesScored > 0 ? (standing.net / standing.racesScored).toFixed(1) : ''}
                </td>
                <td className={td} style={{ backgroundColor: '#FFFFF0' }}>{standing.racesScored}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-2 py-1 text-[9px] text-slate-500 border-t border-slate-300 bg-white sticky left-0">
        {standings.length} skippers &bull; {completedRaces.length} races &bull; {dropScheduleText}
      </div>
    </div>
  );
};
