import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HeatManagement, HeatAssignment, HeatConfiguration, getSHRSRoundLabel, getSHRSHeatLabel, getSHRSPhase } from '../types/heat';
import { Skipper } from '../types';

interface ObserverInfo {
  skipperName: string;
  sailNumber: string;
}

interface ExportOptions {
  eventName?: string;
  eventDate?: string;
  venueName?: string;
  clubName?: string;
  observersByRoundAndHeat?: Map<string, ObserverInfo[]>;
}

const HEAT_COLORS: Record<string, [number, number, number]> = {
  'A': [14, 165, 233],
  'B': [34, 197, 94],
  'C': [168, 85, 247],
  'D': [249, 115, 22],
  'E': [236, 72, 153],
  'F': [20, 184, 166],
};

function getHeatColor(heat: string): [number, number, number] {
  return HEAT_COLORS[heat] || [100, 116, 139];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function renderRoundPage(
  doc: jsPDF,
  round: { round: number; heatAssignments: HeatAssignment[] },
  config: HeatConfiguration,
  skippers: Skipper[],
  options: ExportOptions,
  observers?: Map<string, ObserverInfo[]>
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = margin;

  const roundLabel = getSHRSRoundLabel(round.round, config);
  const phase = getSHRSPhase(round.round, config);
  const phaseLabel = phase === 'finals' ? 'Finals Series' : 'Qualifying Series';

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const title = options.eventName || 'Heat Assignments';
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const subtitleParts: string[] = [];
  if (options.clubName) subtitleParts.push(options.clubName);
  if (options.venueName) subtitleParts.push(options.venueName);
  if (options.eventDate) subtitleParts.push(formatDate(options.eventDate));
  if (subtitleParts.length > 0) {
    doc.text(subtitleParts.join('  |  '), pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  const roundTitle = `${roundLabel} - ${config.scoringSystem?.toUpperCase() || 'SHRS'} Heat Assignments`;
  doc.text(roundTitle, pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${phaseLabel}  •  ${round.heatAssignments.length} heats`, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setDrawColor(200, 210, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const sortedAssignments = [...round.heatAssignments].sort((a, b) =>
    a.heatDesignation.localeCompare(b.heatDesignation)
  );

  const numHeats = sortedAssignments.length;
  const colWidth = (pageWidth - margin * 2 - (numHeats - 1) * 4) / numHeats;

  sortedAssignments.forEach((assignment, heatIdx) => {
    const heatLabel = phase === 'finals'
      ? getSHRSHeatLabel(assignment.heatDesignation, round.round, config)
      : `Heat ${assignment.heatDesignation}`;

    const color = getHeatColor(assignment.heatDesignation);
    const xStart = margin + heatIdx * (colWidth + 4);

    const heatSkippers = assignment.skipperIndices
      .map(idx => skippers[idx])
      .filter(Boolean);

    const tableData = heatSkippers.map((skipper, i) => [
      String(i + 1),
      String(skipper.sailNo || ''),
      skipper.name || '',
      skipper.club || ''
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: xStart, right: pageWidth - xStart - colWidth },
      tableWidth: colWidth,
      head: [[
        { content: `${heatLabel}  (${heatSkippers.length})`, colSpan: 4, styles: {
          fillColor: color,
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 2.5,
        }}
      ]],
      body: tableData,
      columns: [
        { header: '#', dataKey: '0' },
        { header: 'Sail', dataKey: '1' },
        { header: 'Skipper', dataKey: '2' },
        { header: 'Club', dataKey: '3' },
      ],
      styles: {
        fontSize: 7.5,
        cellPadding: 1.5,
        lineColor: [220, 225, 230],
        lineWidth: 0.3,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: color,
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: colWidth * 0.08, halign: 'center', fontStyle: 'bold', textColor: [100, 116, 139] },
        1: { cellWidth: colWidth * 0.15, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: colWidth * 0.50 },
        3: { cellWidth: colWidth * 0.27, fontSize: 7, textColor: [100, 116, 139] },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didDrawPage: () => {},
    });

    const key = `${round.round}-${assignment.heatDesignation}`;
    const heatObservers = observers?.get(key);
    if (heatObservers && heatObservers.length > 0) {
      const tableEndY = (doc as any).lastAutoTable?.finalY || y;
      let obsY = tableEndY + 2;

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`Observers (${heatObservers.length})`, xStart + 2, obsY);
      obsY += 3;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      heatObservers.forEach(obs => {
        doc.setTextColor(30, 41, 59);
        doc.text(`${obs.skipperName}`, xStart + 4, obsY);
        if (obs.sailNumber) {
          doc.setTextColor(100, 116, 139);
          doc.text(`#${obs.sailNumber}`, xStart + colWidth - 4, obsY, { align: 'right' });
        }
        obsY += 3;
      });
    }
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(160, 170, 180);
  const totalSkippers = sortedAssignments.reduce((sum, a) => sum + a.skipperIndices.length, 0);
  doc.text(
    `${totalSkippers} skippers  •  ${config.scoringSystem?.toUpperCase()} Scoring  •  Generated ${new Date().toLocaleDateString('en-AU')}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );
}

export function exportSingleRoundPdf(
  heatManagement: HeatManagement,
  roundIndex: number,
  skippers: Skipper[],
  options: ExportOptions,
  observers?: Map<string, ObserverInfo[]>
) {
  const round = heatManagement.rounds[roundIndex];
  if (!round) return;

  const config = heatManagement.configuration;
  const roundLabel = getSHRSRoundLabel(round.round, config);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  renderRoundPage(doc, round, config, skippers, options, observers);

  const eventSlug = (options.eventName || 'heat_assignments').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${eventSlug}_${roundLabel}_Heat_Assignments.pdf`);
}

export function exportAllRoundsPdf(
  heatManagement: HeatManagement,
  skippers: Skipper[],
  options: ExportOptions,
  observers?: Map<string, ObserverInfo[]>
) {
  const config = heatManagement.configuration;
  const qualifyingRounds = config.shrsQualifyingRounds || heatManagement.rounds.length;
  const roundsToExport = heatManagement.rounds.filter(r => r.round <= qualifyingRounds);

  if (roundsToExport.length === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  roundsToExport.forEach((round, idx) => {
    if (idx > 0) doc.addPage();
    renderRoundPage(doc, round, config, skippers, options, observers);
  });

  const eventSlug = (options.eventName || 'heat_assignments').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`${eventSlug}_All_Qualifying_Rounds.pdf`);
}
