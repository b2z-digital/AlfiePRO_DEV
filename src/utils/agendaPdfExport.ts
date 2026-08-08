import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { supabase } from './supabase';
import type { Meeting, MeetingAgendaItem } from '../types/meeting';
import { formatDate } from './date';

async function fetchLogoDataUrl(logoUrl: string): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  if (supabaseUrl && logoUrl.includes(supabaseUrl)) {
    try {
      const pathMatch = logoUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^?]+)/);
      if (pathMatch) {
        const fullPath = decodeURIComponent(pathMatch[1]);
        const slashIdx = fullPath.indexOf('/');
        const bucket = fullPath.substring(0, slashIdx);
        const filePath = fullPath.substring(slashIdx + 1);
        const { data } = await supabase.storage.from(bucket).download(filePath);
        if (data) {
          return await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(data);
          });
        }
      }
    } catch (_) {}
  }
  try {
    const resp = await fetch(logoUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch (_) {}
  return '';
}

function getAgendaTypeLabel(type: string): string {
  switch (type) {
    case 'for_noting': return 'For Noting';
    case 'for_action': return 'For Action';
    case 'for_discussion': return 'For Discussion';
    default: return type;
  }
}

interface OrgInfo {
  name: string;
  logo: string | null;
}

async function fetchOrgInfo(
  meeting: Meeting,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<OrgInfo> {
  try {
    if (associationId && associationType) {
      const table = associationType === 'state' ? 'state_associations' : 'national_associations';
      const { data } = await supabase.from(table).select('name, logo').eq('id', associationId).maybeSingle();
      if (data) return { name: data.name || '', logo: data.logo || null };
    }
    const { data } = await supabase.from('clubs').select('name, logo').eq('id', meeting.club_id).maybeSingle();
    if (data) return { name: data.name || '', logo: data.logo || null };
  } catch (_) {}
  return { name: '', logo: null };
}

export async function generateAgendaPdf(
  meeting: Meeting,
  agendaItems: MeetingAgendaItem[],
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<void> {
  const org = await fetchOrgInfo(meeting, associationId, associationType);
  let logoDataUrl = '';
  if (org.logo) {
    logoDataUrl = await fetchLogoDataUrl(org.logo);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 16;
  const marginR = 16;
  const contentW = pageW - marginL - marginR;
  let y = 14;

  const slate800: [number, number, number] = [30, 41, 59];
  const slate500: [number, number, number] = [100, 116, 139];
  const slate300: [number, number, number] = [203, 213, 225];
  const slate100: [number, number, number] = [241, 245, 249];
  const accent: [number, number, number] = [16, 185, 129];

  // --- Centred header: logo, club name, meeting title ---
  const centreX = pageW / 2;
  const logoSize = 24;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', centreX - logoSize / 2, y, logoSize, logoSize);
    } catch (_) {}
    y += logoSize + 3;
  }

  // Club name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...slate800);
  doc.text(org.name, centreX, y, { align: 'center' });
  y += 6;

  // Meeting name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...slate500);
  doc.text(meeting.name, centreX, y, { align: 'center' });
  y += 6;

  // "MEETING AGENDA" label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...accent);
  doc.text('MEETING AGENDA', centreX, y, { align: 'center' });
  y += 5;

  // Divider line
  doc.setDrawColor(...slate300);
  doc.setLineWidth(0.4);
  doc.line(marginL, y, pageW - marginR, y);
  y += 6;

  // --- Meeting details (compact 2-row, 3-col grid) ---
  const col1X = marginL;
  const col2X = marginL + contentW * 0.33;
  const col3X = marginL + contentW * 0.64;
  const labelSize = 7;
  const valueSize = 9;
  const rowGap = 11;

  // Row 1
  doc.setFontSize(labelSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...slate500);
  doc.text('DATE', col1X, y);
  doc.text('TIME', col2X, y);
  doc.text('LOCATION', col3X, y);

  doc.setFontSize(valueSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slate800);
  doc.text(formatDate(meeting.date), col1X, y + 4);

  const startTime = meeting.start_time ? meeting.start_time.substring(0, 5) : '';
  const endTime = meeting.end_time ? meeting.end_time.substring(0, 5) : '';
  const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime || 'TBC';
  doc.text(timeStr, col2X, y + 4);

  const locationText = meeting.location || 'TBC';
  const locLines = doc.splitTextToSize(locationText, contentW * 0.34);
  doc.text(locLines.slice(0, 2), col3X, y + 4);

  y += rowGap;

  // Row 2
  doc.setFontSize(labelSize);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...slate500);
  doc.text('CHAIRPERSON', col1X, y);
  doc.text('MINUTE TAKER', col2X, y);
  doc.text('TYPE', col3X, y);

  doc.setFontSize(valueSize);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slate800);

  const chairName = meeting.chairperson
    ? `${meeting.chairperson.first_name} ${meeting.chairperson.last_name}` : '—';
  doc.text(chairName, col1X, y + 4);

  const minuteTakerName = meeting.minute_taker
    ? `${meeting.minute_taker.first_name} ${meeting.minute_taker.last_name}` : '—';
  doc.text(minuteTakerName, col2X, y + 4);

  const typeLabels: Record<string, string> = { in_person: 'In Person', online: 'Online', hybrid: 'Hybrid' };
  doc.text(typeLabels[meeting.meeting_type || 'in_person'] || 'In Person', col3X, y + 4);

  y += rowGap + 2;

  // --- Description ---
  if (meeting.description) {
    doc.setDrawColor(...slate300);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 5;
    doc.setFontSize(valueSize);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...slate500);
    const descLines = doc.splitTextToSize(meeting.description, contentW);
    doc.text(descLines.slice(0, 3), marginL, y);
    y += Math.min(descLines.length, 3) * 4 + 4;
  }

  // Divider
  doc.setDrawColor(...slate300);
  doc.setLineWidth(0.4);
  doc.line(marginL, y, pageW - marginR, y);
  y += 7;

  // --- Agenda heading ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...slate800);
  doc.text('Agenda', marginL, y);

  const totalDuration = agendaItems.reduce((sum, item) => sum + (item.duration || 0), 0);
  if (totalDuration > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...slate500);
    doc.text(`Total duration: ${totalDuration} min`, pageW - marginR, y, { align: 'right' });
  }

  y += 4;

  // --- Agenda table ---
  if (agendaItems.length > 0) {
    const tableBody = agendaItems.map((item) => [
      String(item.item_number),
      item.item_name,
      item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : '—',
      getAgendaTypeLabel(item.type),
      item.duration ? `${item.duration} min` : '—',
    ]);

    (doc as any).autoTable({
      startY: y,
      head: [['#', 'Agenda Item', 'Owner', 'Type', 'Dur.']],
      body: tableBody,
      margin: { left: marginL, right: marginR },
      tableWidth: contentW,
      styles: {
        fontSize: 8,
        cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
        textColor: slate800,
        lineColor: [226, 232, 240],
        lineWidth: 0.25,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: slate100,
        textColor: slate500,
        fontStyle: 'bold',
        fontSize: 7,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 24 },
        4: { cellWidth: 16, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [252, 252, 253],
      },
    });

    y = (doc as any).lastAutoTable.finalY + 4;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...slate500);
    doc.text('No agenda items have been added.', marginL, y + 4);
    y += 12;
  }

  // --- Notes section ---
  const remainingSpace = pageH - y - 16;
  if (remainingSpace > 30) {
    y += 3;
    doc.setDrawColor(...slate300);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, pageW - marginR, y);
    y += 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...slate800);
    doc.text('Notes', marginL, y);
    y += 5;

    doc.setDrawColor(...slate300);
    doc.setLineWidth(0.2);
    const lineSpacing = 8;
    const maxLines = Math.floor((pageH - y - 14) / lineSpacing);
    for (let i = 0; i < maxLines; i++) {
      doc.line(marginL, y, pageW - marginR, y);
      y += lineSpacing;
    }
  }

  // --- Footer ---
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...slate300);
  doc.text(
    `${org.name}  |  ${meeting.name}  |  ${formatDate(meeting.date)}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );

  const safeName = meeting.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
  doc.save(`Agenda_${safeName}_${meeting.date}.pdf`);
}
