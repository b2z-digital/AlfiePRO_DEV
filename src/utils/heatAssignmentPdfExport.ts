import jsPDF from 'jspdf';
import { HeatManagement, HeatAssignment, HeatConfiguration, getSHRSRoundLabel, getSHRSHeatLabel, getSHRSPhase } from '../types/heat';

function getScoringLabel(config: HeatConfiguration): string {
  if (config.scoringSystem === 'shrs') {
    return `SHR-${config.shrsAssignmentMode === 'preset' ? 'B' : 'P'}`;
  }
  return config.scoringSystem?.toUpperCase() || 'HMS';
}
import { Skipper } from '../types';
import { getIOCCode } from './countryFlags';

interface ObserverInfo {
  skipperName: string;
  sailNumber: string;
  countryCode?: string;
}

interface ExportOptions {
  eventName?: string;
  eventDate?: string;
  venueName?: string;
  clubName?: string;
  showFlag?: boolean;
  showCountry?: boolean;
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

function toAcronym(name: string): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/);
  if (words.length <= 1) return name;
  return words.map(w => w.charAt(0).toUpperCase()).join('');
}

function getCountryFlagText(countryCode: string | undefined | null): string {
  if (!countryCode || countryCode.length !== 2) return '';
  const code = countryCode.toUpperCase();
  const codePoints = [...code].map(char =>
    0x1F1E6 + char.charCodeAt(0) - 'A'.charCodeAt(0)
  );
  return String.fromCodePoint(...codePoints);
}

function drawSailIcon(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setFillColor(0, 102, 180);
  doc.triangle(
    x + w * 0.72, y,
    x + w * 0.2, y + h,
    x + w, y + h,
    'F'
  );

  doc.setFillColor(1, 162, 233);
  doc.triangle(
    x + w * 0.35, y + h * 0.17,
    x, y + h * 0.9,
    x + w * 0.55, y + h * 0.82,
    'F'
  );
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
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const roundLabel = getSHRSRoundLabel(round.round, config);
  const phase = getSHRSPhase(round.round, config);
  const phaseLabel = phase === 'finals' ? 'Finals Series' : 'Qualifying Series';
  const showCountry = options.showCountry ?? false;
  const showFlag = options.showFlag ?? false;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(options.eventName || 'Heat Assignments', pageWidth / 2, y, { align: 'center' });
  y += 5.5;

  const subtitleParts: string[] = [];
  if (options.clubName) subtitleParts.push(options.clubName);
  if (options.venueName) subtitleParts.push(options.venueName);
  if (options.eventDate) subtitleParts.push(formatDate(options.eventDate));
  if (subtitleParts.length > 0) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(subtitleParts.join('  |  '), pageWidth / 2, y, { align: 'center' });
    y += 5;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`${roundLabel} - ${getScoringLabel(config)} Heat Assignments`, pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const totalSkippers = round.heatAssignments.reduce((sum, a) => sum + a.skipperIndices.length, 0);
  doc.text(`${phaseLabel}  •  ${round.heatAssignments.length} heats  •  ${totalSkippers} skippers`, pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setDrawColor(200, 210, 220);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  const sortedAssignments = [...round.heatAssignments].sort((a, b) =>
    a.heatDesignation.localeCompare(b.heatDesignation)
  );

  const numHeats = sortedAssignments.length;
  const colGap = 3;
  const colWidth = (pageWidth - margin * 2 - (numHeats - 1) * colGap) / numHeats;
  const headerHeight = 5.5;
  const rowHeight = 3.8;
  const fontSize = 6.5;
  const headerFontSize = 8;

  const maxSkippersInAnyHeat = Math.max(...sortedAssignments.map(a => a.skipperIndices.length));
  const observerStartY = y + headerHeight + 1 + maxSkippersInAnyHeat * rowHeight;

  sortedAssignments.forEach((assignment, heatIdx) => {
    const heatLabel = phase === 'finals'
      ? getSHRSHeatLabel(assignment.heatDesignation, round.round, config)
      : `Heat ${assignment.heatDesignation}`;
    const color = getHeatColor(assignment.heatDesignation);
    const xStart = margin + heatIdx * (colWidth + colGap);
    const heatSkippers = assignment.skipperIndices.map(idx => skippers[idx]).filter(Boolean);

    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(xStart, y, colWidth, headerHeight, 1, 1, 'F');
    doc.setFontSize(headerFontSize);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${heatLabel}  (${heatSkippers.length})`, xStart + colWidth / 2, y + headerHeight / 2 + 1, { align: 'center' });

    let rowY = y + headerHeight + 1;

    const sailNumX = xStart + 2;
    const nameX = xStart + (showCountry ? 22 : 16);

    heatSkippers.forEach((skipper, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(xStart, rowY - 0.5, colWidth, rowHeight, 'F');
      }

      let xCursor = sailNumX;

      if (showCountry && skipper.country_code) {
        const iocCode = getIOCCode(skipper.country_code);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(iocCode, xCursor, rowY + 2.2);
        xCursor += 6;
      }

      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(String(skipper.sailNo || ''), xCursor, rowY + 2.2);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 60, 70);
      const clubAcronym = skipper.club ? toAcronym(skipper.club) : '';
      const clubWidth = clubAcronym ? doc.getTextWidth(clubAcronym) + 4 : 0;
      const nameMaxW = xStart + colWidth - nameX - clubWidth - 2;
      doc.text(skipper.name || '', nameX, rowY + 2.2, { maxWidth: Math.max(nameMaxW, 10) });

      if (clubAcronym) {
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(clubAcronym, xStart + colWidth - 2, rowY + 2.2, { align: 'right' });
      }

      rowY += rowHeight;
    });

    doc.setDrawColor(220, 225, 230);
    doc.setLineWidth(0.2);
    doc.rect(xStart, y, colWidth, headerHeight + 1 + heatSkippers.length * rowHeight);

    const key = `${round.round}-${assignment.heatDesignation}`;
    const heatObservers = observers?.get(key);
    if (heatObservers && heatObservers.length > 0) {
      let obsY = observerStartY + 6;

      doc.setDrawColor(180, 190, 200);
      doc.setLineWidth(0.15);
      doc.line(xStart + 2, obsY - 2, xStart + colWidth - 2, obsY - 2);

      doc.setFillColor(240, 242, 245);
      doc.roundedRect(xStart + 1, obsY - 0.5, colWidth - 2, 4, 0.5, 0.5, 'F');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`Observers (${heatObservers.length})`, xStart + colWidth / 2, obsY + 2, { align: 'center' });
      obsY += 6.5;

      const obsSailX = xStart + 4;
      const obsNameX = xStart + (showCountry ? 20 : 14);

      doc.setFontSize(6);
      heatObservers.forEach(obs => {
        let obsCursor = obsSailX;

        if (showCountry && obs.countryCode) {
          const obsIoc = getIOCCode(obs.countryCode);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 116, 139);
          doc.text(obsIoc, obsCursor, obsY);
          obsCursor += 6;
        }

        if (obs.sailNumber) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(100, 116, 139);
          doc.text(obs.sailNumber, obsCursor, obsY);
        }

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(50, 60, 70);
        doc.text(obs.skipperName, obsNameX, obsY);
        obsY += 3.5;
      });
    }
  });

  const footerY = pageHeight - 6;
  const footerText = `${getScoringLabel(config)} Scoring  •  Generated ${new Date().toLocaleDateString('en-AU')}`;

  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(160, 170, 180);

  const footerTextWidth = doc.getTextWidth(footerText);
  const alfieTextWidth = 18;
  const iconWidth = 3;
  const totalFooterWidth = iconWidth + 1 + alfieTextWidth + 6 + footerTextWidth;
  const footerStartX = (pageWidth - totalFooterWidth) / 2;

  drawSailIcon(doc, footerStartX, footerY - 3, 3, 4.5);

  const brandX = footerStartX + iconWidth + 1;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 60, 70);
  doc.text('Alfie', brandX, footerY);
  const alfieW = doc.getTextWidth('Alfie');
  doc.setFont('helvetica', 'bold');
  doc.text('PRO', brandX + alfieW, footerY);
  const proW = doc.getTextWidth('PRO');

  const separatorX = brandX + alfieW + proW + 3;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(160, 170, 180);
  doc.text(`•  ${footerText}`, separatorX, footerY);
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
