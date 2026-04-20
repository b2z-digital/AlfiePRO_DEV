import React, { useMemo, useCallback, useRef, useState } from 'react';
import { Download, Image, ZoomIn, ZoomOut, CircleCheck as CheckCircle, CircleAlert as AlertCircle, ShieldCheck } from 'lucide-react';
import { Skipper } from '../types';
import { HeatManagement } from '../types/heat';
import { convertHeatResultsToRaceResults } from '../utils/heatUtils';
import { breakTie } from '../utils/hmsHeatSystem';
import html2canvas from 'html2canvas';

interface HmsScoreSheetProps {
  skippers: Skipper[];
  heatManagement: HeatManagement;
  dropRules: number[];
  darkMode: boolean;
  externalRaceResults?: any[];
  eventName?: string;
}

const ROW_HEIGHT = 18;
const COL_W = 34;

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

const SECTION_BORDER = '3px solid #333';

const ZOOM_LEVELS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0];
const DEFAULT_ZOOM_INDEX = 5; // 1.0

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
  eventName,
}) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoom = ZOOM_LEVELS[zoomIndex];
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

  const hmsVerification = useMemo(() => {
    const hasHmsPoints = raceResults.some((r: any) => r.hmsPoints != null && r.hmsPoints > 0);
    if (!hasHmsPoints) return null;

    const hmsLookup = new Map<string, number>();
    raceResults.forEach((r: any) => {
      if (r.hmsPoints != null && r.hmsPoints > 0) {
        hmsLookup.set(`${r.skipperIndex}-${r.race}`, r.hmsPoints);
      }
    });

    let matched = 0;
    let mismatched = 0;
    let total = 0;
    const mismatches: { skipperIndex: number; race: number; alfie: number; hms: number }[] = [];

    standings.forEach((s: any) => {
      s.raceResults?.forEach((r: any) => {
        const key = `${s.skipperIndex}-${r.race}`;
        const hmsVal = hmsLookup.get(key);
        if (hmsVal == null) return;
        total++;
        const alfieVal = r.position;
        if (alfieVal != null && Math.abs(alfieVal - hmsVal) < 0.01) {
          matched++;
        } else {
          mismatched++;
          mismatches.push({ skipperIndex: s.skipperIndex, race: r.race, alfie: alfieVal, hms: hmsVal });
        }
      });
    });

    return { matched, mismatched, total, mismatches, hmsLookup };
  }, [raceResults, standings]);

  const getSailNo = useCallback((skipper: any) => {
    return skipper?.sailNo || skipper?.sailNumber || skipper?.boat_sail_number || '-';
  }, []);

  const exportCsv = useCallback(() => {
    const headers = [
      'Position', 'Skipper', 'Sail #', 'Club/City', 'Hull', 'MYA No.', 'Total', 'Score',
      ...completedRaces.map(r => `Race ${r}`),
      ...Array.from({ length: maxDropCols }, (_, i) => `dis ${i + 1}`),
      'Total Dis',
      ...Array.from({ length: maxBestCols }, (_, i) => i === 0 ? 'Best' : getOrdinalLabel(i + 1)),
      'Avg', 'Races',
    ];

    const rows = standings.map((s: any, idx: number) => {
      const sailNo = getSailNo(s.skipper);
      const boat = s.skipper?.boatModel || s.skipper?.boat_class || '';
      const club = s.skipper?.club || '';
      const myaNo = (s.skipper as any)?.myaNumber || (s.skipper as any)?.mya_number || '';

      const raceScores = completedRaces.map((race: number, raceIdx: number) => {
        const result = s.raceResults?.find((r: any) => r.race === race);
        const pos = result?.position;
        const isDropped = s.droppedRaceIndices?.has(raceIdx);
        if (pos == null) return '';
        return isDropped ? `(${pos.toFixed(1)})` : pos.toFixed(1);
      });

      const dropValues = Array.from({ length: maxDropCols }, (_, i) =>
        s.droppedScoreValues?.[i] != null ? s.droppedScoreValues[i].toFixed(1) : ''
      );

      const bestValues = Array.from({ length: maxBestCols }, (_, i) =>
        s.sortedAllScores?.[i] != null ? String(s.sortedAllScores[i]) : ''
      );

      const avg = s.racesScored > 0 ? (s.net / s.racesScored).toFixed(1) : '';

      return [
        idx + 1,
        s.skipper?.name || 'Unknown',
        sailNo,
        club,
        boat,
        myaNo,
        s.total.toFixed(1),
        s.net.toFixed(1),
        ...raceScores,
        ...dropValues,
        s.totalDropped > 0 ? s.totalDropped.toFixed(1) : '',
        ...bestValues,
        avg,
        s.racesScored,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(v => {
        const str = String(v);
        return str.includes(',') ? `"${str}"` : str;
      }).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eventName || 'score-sheet'}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [standings, completedRaces, maxDropCols, maxBestCols, getSailNo, eventName]);

  const exportJpg = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const el = tableRef.current;
      const scrollLeft = el.scrollLeft;
      const scrollTop = el.scrollTop;
      el.scrollLeft = 0;
      el.scrollTop = 0;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      el.scrollLeft = scrollLeft;
      el.scrollTop = scrollTop;

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${eventName || 'score-sheet'}_results.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);
    } catch (e) {
      console.error('Error exporting JPG:', e);
    }
  }, [eventName]);

  const handleZoomIn = useCallback(() => {
    setZoomIndex(prev => Math.min(prev + 1, ZOOM_LEVELS.length - 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
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
  const tdNoBorder = 'px-0.5 py-0 text-[10px] text-center font-medium tabular-nums';
  const thNoBorder = 'px-0.5 py-0.5 text-[9px] font-extrabold text-center whitespace-nowrap border-b border-slate-400';

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

  const scaledOffsets = Object.fromEntries(
    Object.entries(STICKY_OFFSETS).map(([k, v]) => [k, v * zoom])
  ) as typeof STICKY_OFFSETS;

  const scaledColWidths = Object.fromEntries(
    Object.entries(COL_WIDTHS).map(([k, v]) => [k, v * zoom])
  ) as typeof COL_WIDTHS;

  const scaledColW = COL_W * zoom;

  const frozenWidth = Object.values(scaledColWidths).reduce((a, b) => a + b, 0);
  const raceColsWidth = completedRaces.length * scaledColW;
  const dropColsWidth = maxDropCols * scaledColW;
  const totalDisWidth = (COL_W + 6) * zoom;
  const bestColsWidth = maxBestCols * scaledColW;
  const avgWidth = 48 * zoom;
  const racesWidth = 38 * zoom;
  const tableMinWidth = frozenWidth + raceColsWidth + dropColsWidth + totalDisWidth + bestColsWidth + avgWidth + racesWidth;

  return (
    <div className="h-full flex flex-col bg-white text-black">
      {hmsVerification && (
        <div className={`flex items-center gap-2 px-2 py-1 border-b shrink-0 ${
          hmsVerification.mismatched === 0
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          {hmsVerification.mismatched === 0 ? (
            <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
          )}
          <span className="text-[10px] font-medium">
            {hmsVerification.mismatched === 0 ? (
              <span className="text-emerald-700">
                HMS Verified: All {hmsVerification.total} race scores match the original HMS file
              </span>
            ) : (
              <span className="text-amber-700">
                HMS Comparison: {hmsVerification.matched}/{hmsVerification.total} scores match
                {' '}&bull;{' '}{hmsVerification.mismatched} discrepancies
              </span>
            )}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-200 bg-slate-50 shrink-0">
        <span className="text-[10px] text-slate-500 mr-auto">
          {standings.length} skippers &bull; {completedRaces.length} races &bull; {dropScheduleText}
        </span>
        <div className="flex items-center gap-1 border border-slate-300 rounded bg-white px-1">
          <button
            onClick={handleZoomOut}
            disabled={zoomIndex === 0}
            className="p-0.5 text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={12} />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-1 py-0.5 text-[9px] font-semibold text-slate-600 hover:text-slate-900 transition-colors min-w-[32px]"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="p-0.5 text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={12} />
          </button>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        >
          <Download size={11} />
          CSV
        </button>
        <button
          onClick={exportJpg}
          className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
        >
          <Image size={11} />
          JPG
        </button>
      </div>
      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <colgroup>
            <col style={{ width: scaledColWidths.pos }} />
            <col style={{ width: scaledColWidths.skipper }} />
            <col style={{ width: scaledColWidths.sailNo }} />
            <col style={{ width: scaledColWidths.club }} />
            <col style={{ width: scaledColWidths.hull }} />
            <col style={{ width: scaledColWidths.myaNo }} />
            <col style={{ width: scaledColWidths.total }} />
            <col style={{ width: scaledColWidths.score }} />
            {completedRaces.map(r => (
              <col key={`r${r}`} style={{ width: scaledColW }} />
            ))}
            {Array.from({ length: maxDropCols }).map((_, i) => (
              <col key={`d${i}`} style={{ width: scaledColW }} />
            ))}
            <col style={{ width: (COL_W + 6) * zoom }} />
            {Array.from({ length: maxBestCols }).map((_, i) => (
              <col key={`b${i}`} style={{ width: scaledColW }} />
            ))}
            <col style={{ width: 48 * zoom }} />
            <col style={{ width: 38 * zoom }} />
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr style={{ fontSize: 9 * zoom }}>
              <th className={thNoBorder} style={frozenHeaderStyle(scaledOffsets.pos, '#FFFF00')}>Position</th>
              <th className={`${th} text-left`} style={frozenHeaderStyle(scaledOffsets.skipper, '#00FFFF')}>Skipper</th>
              <th className={th} style={frozenHeaderStyle(scaledOffsets.sailNo, '#00FFFF')}>Sail #</th>
              <th className={`${th} text-left`} style={frozenHeaderStyle(scaledOffsets.club, '#00FFFF')}>Club/City</th>
              <th className={th} style={frozenHeaderStyle(scaledOffsets.hull, '#00FFFF')}>Hull</th>
              <th className={th} style={frozenHeaderStyle(scaledOffsets.myaNo, '#00FFFF')}>MYA No.</th>
              <th className={th} style={frozenHeaderStyle(scaledOffsets.total, '#00FFFF')}>Total</th>
              <th className={thNoBorder} style={frozenHeaderStyle(scaledOffsets.score, '#90EE90', { borderRight: SECTION_BORDER, borderBottom: '1px solid #94a3b8' })}>Score</th>
              {completedRaces.map((race, i) => (
                <th
                  key={race}
                  className={th}
                  style={{
                    backgroundColor: '#D3D3D3',
                    ...(i === completedRaces.length - 1 ? { borderRight: SECTION_BORDER } : {}),
                  }}
                >
                  {race}
                </th>
              ))}
              {Array.from({ length: maxDropCols }).map((_, i) => (
                <th key={`d${i}`} className={th} style={{ backgroundColor: '#FFB6C1' }}>dis {i + 1}</th>
              ))}
              <th className={th} style={{ backgroundColor: '#FF9999', fontWeight: 800, borderRight: SECTION_BORDER }}>Total Dis</th>
              {Array.from({ length: maxBestCols }).map((_, i) => (
                <th
                  key={`b${i}`}
                  className={th}
                  style={{
                    backgroundColor: '#87CEEB',
                    ...(i === maxBestCols - 1 ? { borderRight: SECTION_BORDER } : {}),
                  }}
                >
                  {i === 0 ? 'Best' : getOrdinalLabel(i + 1)}
                </th>
              ))}
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
                <tr
                  key={standing.skipperIndex}
                  className="hms-row-hover"
                  style={{ height: ROW_HEIGHT * zoom }}
                >
                  <td className={tdNoBorder} style={frozenCellStyle(scaledOffsets.pos, '#FFFF00', { fontWeight: 700, fontSize: 10 * zoom })}>
                    {index + 1}
                  </td>
                  <td className={`${td} text-left truncate`} style={frozenCellStyle(scaledOffsets.skipper, '#fff', { maxWidth: scaledColWidths.skipper, fontSize: 10 * zoom })}>
                    {standing.skipper?.name || 'Unknown'}
                  </td>
                  <td className={td} style={frozenCellStyle(scaledOffsets.sailNo, '#fff', { fontWeight: 600, fontSize: 10 * zoom })}>{sailNo}</td>
                  <td className={`${td} text-left truncate`} style={frozenCellStyle(scaledOffsets.club, '#fff', { maxWidth: scaledColWidths.club, fontSize: 9 * zoom })}>
                    {club}
                  </td>
                  <td className={`${td} text-left truncate`} style={frozenCellStyle(scaledOffsets.hull, '#fff', { maxWidth: scaledColWidths.hull, fontSize: 9 * zoom })}>
                    {boat}
                  </td>
                  <td className={td} style={frozenCellStyle(scaledOffsets.myaNo, '#fff', { fontSize: 10 * zoom })}>
                    {myaNo}
                  </td>
                  <td className={td} style={frozenCellStyle(scaledOffsets.total, '#fff', { fontSize: 10 * zoom })}>
                    {fmt1(standing.total)}
                  </td>
                  <td className={tdNoBorder} style={frozenCellStyle(scaledOffsets.score, '#90EE90', { fontWeight: 700, borderRight: SECTION_BORDER, fontSize: 10 * zoom })}>
                    {fmt1(standing.net)}
                  </td>

                  {completedRaces.map((race: number, raceIdx: number) => {
                    const result = standing.raceResults?.find((r: any) => r.race === race);
                    const position = result?.position;
                    const isDropped = standing.droppedRaceIndices?.has(raceIdx);
                    const isLast = raceIdx === completedRaces.length - 1;

                    let verifyBg = '';
                    let verifyTitle = '';
                    if (hmsVerification && position != null) {
                      const hmsVal = hmsVerification.hmsLookup.get(`${standing.skipperIndex}-${race}`);
                      if (hmsVal != null) {
                        if (Math.abs(position - hmsVal) < 0.01) {
                          verifyBg = isDropped ? '#b8d4b8' : '#d4edda';
                          verifyTitle = `HMS: ${hmsVal} = Match`;
                        } else {
                          verifyBg = '#f8d7da';
                          verifyTitle = `HMS: ${hmsVal} vs AlfiePRO: ${fmt1(position)}`;
                        }
                      }
                    }

                    return (
                      <td
                        key={race}
                        className={td}
                        title={verifyTitle || undefined}
                        style={{
                          fontSize: 10 * zoom,
                          backgroundColor: verifyBg || (isDropped ? '#D3D3D3' : undefined),
                          color: isDropped && !verifyBg ? '#666' : undefined,
                          ...(isLast ? { borderRight: SECTION_BORDER } : {}),
                        }}
                      >
                        {position != null ? fmt1(position) : '-'}
                      </td>
                    );
                  })}

                  {Array.from({ length: maxDropCols }).map((_, i) => (
                    <td key={`d${i}`} className={td} style={{ backgroundColor: '#D3D3D3', color: '#666', fontSize: 10 * zoom }}>
                      {standing.droppedScoreValues?.[i] != null ? fmt1(standing.droppedScoreValues[i]) : ''}
                    </td>
                  ))}

                  <td className={td} style={{ backgroundColor: '#BEBEBE', color: '#333', fontWeight: 700, borderRight: SECTION_BORDER, fontSize: 10 * zoom }}>
                    {standing.totalDropped > 0 ? fmt1(standing.totalDropped) : ''}
                  </td>

                  {Array.from({ length: maxBestCols }).map((_, i) => (
                    <td
                      key={`b${i}`}
                      className={td}
                      style={{
                        backgroundColor: '#F0F8FF',
                        fontSize: 10 * zoom,
                        ...(i === maxBestCols - 1 ? { borderRight: SECTION_BORDER } : {}),
                      }}
                    >
                      {standing.sortedAllScores?.[i] != null ? standing.sortedAllScores[i] : ''}
                    </td>
                  ))}

                  <td className={td} style={{ backgroundColor: '#FFFFF0', fontSize: 10 * zoom }}>
                    {standing.racesScored > 0 ? (standing.net / standing.racesScored).toFixed(1) : ''}
                  </td>
                  <td className={td} style={{ backgroundColor: '#FFFFF0', fontSize: 10 * zoom }}>{standing.racesScored}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
