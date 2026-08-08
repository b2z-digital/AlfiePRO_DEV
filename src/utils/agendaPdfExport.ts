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
  const marginL = 18;
  const marginR = 18;
  const contentW = pageW - marginL - marginR;
  let y = 16;

  // --- Header band ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 52, 'F');

  // Accent bar
  doc.setFillColor(16, 185, 129); // emerald-500
  doc.rect(0, 52, pageW, 1.5, 'F');

  // Logo
  const logoSize = 28;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginL, y - 2, logoSize, logoSize);
    } catch (_) {}
  }

  const textStartX = logoDataUrl ? marginL + logoSize + 6 : marginL;

  // Org name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(org.name, textStartX, y + 6);

  // Document title
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('Meeting Agenda', textStartX, y + 14);

  // Meeting name (right aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const meetingNameLines = doc.splitTextToSize(meeting.name, contentW * 0.45);
  doc.text(meetingNameLines, pageW - marginR, y + 6, { align: 'right' });

  y = 62;

  // --- Meeting details grid ---
  const detailBoxH = 38;
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(marginL, y, contentW, detailBoxH, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139); // slate-500

  const col1X = marginL + 6;
  const col2X = marginL + contentW * 0.35;
  const col3X = marginL + contentW * 0.65;
  const rowY1 = y + 10;
  const rowY2 = y + 24;

  // Row 1: Date | Time | Location
  doc.text('DATE', col1X, rowY1);
  doc.text('TIME', col2X, rowY1);
  doc.text('LOCATION', col3X, rowY1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59); // slate-800

  doc.text(formatDate(meeting.date), col1X, rowY1 + 5);

  const startTime = meeting.start_time ? meeting.start_time.substring(0, 5) : '';
  const endTime = meeting.end_time ? meeting.end_time.substring(0, 5) : '';
  const timeStr = startTime && endTime ? `${startTime} - ${endTime}` : startTime || 'TBC';
  doc.text(timeStr, col2X, rowY1 + 5);

  const locationText = meeting.location || 'TBC';
  const locationLines = doc.splitTextToSize(locationText, contentW * 0.32);
  doc.text(locationLines[0] || 'TBC', col3X, rowY1 + 5);

  // Row 2: Chairperson | Minute Taker | Type
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);

  doc.text('CHAIRPERSON', col1X, rowY2);
  doc.text('MINUTE TAKER', col2X, rowY2);
  doc.text('TYPE', col3X, rowY2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  const chairName = meeting.chairperson
    ? `${meeting.chairperson.first_name} ${meeting.chairperson.last_name}`
    : '—';
  doc.text(chairName, col1X, rowY2 + 5);

  const minuteTakerName = meeting.minute_taker
    ? `${meeting.minute_taker.first_name} ${meeting.minute_taker.last_name}`
    : '—';
  doc.text(minuteTakerName, col2X, rowY2 + 5);

  const meetingTypeLabels: Record<string, string> = {
    in_person: 'In Person',
    online: 'Online',
    hybrid: 'Hybrid',
  };
  doc.text(meetingTypeLabels[meeting.meeting_type || 'in_person'] || 'In Person', col3X, rowY2 + 5);

  y += detailBoxH + 10;

  // --- Description (if present) ---
  if (meeting.description) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('NOTES', marginL, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // slate-700
    const descLines = doc.splitTextToSize(meeting.description, contentW);
    const maxDescLines = 3;
    const printLines = descLines.slice(0, maxDescLines);
    doc.text(printLines, marginL, y);
    y += printLines.length * 4 + 6;
  }

  // --- Agenda section header ---
  doc.setFillColor(16, 185, 129);
  doc.rect(marginL, y, 2, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Agenda Items', marginL + 6, y + 5.5);
  y += 12;

  // --- Agenda table ---
  if (agendaItems.length > 0) {
    const totalDuration = agendaItems.reduce((sum, item) => sum + (item.duration || 0), 0);

    const tableBody = agendaItems.map((item) => [
      String(item.item_number),
      item.item_name,
      item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : '—',
      getAgendaTypeLabel(item.type),
      item.duration ? `${item.duration} min` : '—',
    ]);

    // Footer row
    tableBody.push(['', '', '', 'Total Duration', totalDuration > 0 ? `${totalDuration} min` : '—']);

    (doc as any).autoTable({
      startY: y,
      head: [['No.', 'Item', 'Owner', 'Type', 'Duration']],
      body: tableBody,
      margin: { left: marginL, right: marginR },
      styles: {
        fontSize: 9,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 34 },
        3: { cellWidth: 28 },
        4: { cellWidth: 22, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      willDrawCell: (data: any) => {
        const isFooter = data.row.index === tableBody.length - 1 && data.section === 'body';
        if (isFooter) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [15, 23, 42];
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text('No agenda items have been added.', marginL, y + 4);
    y += 14;
  }

  // --- Notes section (blank lines for handwritten notes) ---
  const pageH = doc.internal.pageSize.getHeight();
  const remainingSpace = pageH - y - 20;

  if (remainingSpace > 40) {
    y += 4;
    doc.setFillColor(16, 185, 129);
    doc.rect(marginL, y, 2, 7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Notes', marginL + 6, y + 5.5);
    y += 14;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    const lineSpacing = 9;
    const maxLines = Math.floor((pageH - y - 18) / lineSpacing);
    for (let i = 0; i < maxLines; i++) {
      doc.line(marginL, y, pageW - marginR, y);
      y += lineSpacing;
    }
  }

  // --- Footer ---
  const footerY = pageH - 10;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${org.name}  |  ${meeting.name}  |  ${formatDate(meeting.date)}`,
    pageW / 2,
    footerY,
    { align: 'center' }
  );

  // Download
  const safeName = meeting.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
  doc.save(`Agenda_${safeName}_${meeting.date}.pdf`);
}
