import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from './supabase';
import { formatDate } from './date';
import type { Meeting, MeetingAgendaItem } from '../types/meeting';

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

function getAgendaItemTypeLabel(type: string): string {
  switch (type) {
    case 'for_noting': return 'For Noting';
    case 'for_action': return 'For Action';
    case 'for_discussion': return 'For Discussion';
    default: return type;
  }
}

async function fetchOrgInfo(
  meeting: Meeting,
  associationId?: string,
  associationType?: 'state' | 'national'
): Promise<{ name: string; logo: string | null }> {
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

interface MinutesPdfOptions {
  meeting: Meeting;
  agendaItems: MeetingAgendaItem[];
  associationId?: string;
  associationType?: 'state' | 'national';
  orgName?: string;
  orgLogo?: string | null;
}

export async function generateMinutesPdf(options: MinutesPdfOptions): Promise<void> {
  const { meeting, agendaItems } = options;

  let orgName = options.orgName || '';
  let logoUrl = options.orgLogo;

  if (!orgName) {
    const org = await fetchOrgInfo(meeting, options.associationId, options.associationType);
    orgName = org.name;
    if (logoUrl === undefined) logoUrl = org.logo;
  }

  orgName = orgName || 'Organisation';

  let logoDataUrl = '';
  if (logoUrl) {
    logoDataUrl = await fetchLogoDataUrl(logoUrl);
  }

  const meetingDate = formatDate(meeting.date);
  const chairName = meeting.chairperson ? `${meeting.chairperson.first_name} ${meeting.chairperson.last_name}` : '';
  const minuteTakerName = meeting.minute_taker ? `${meeting.minute_taker.first_name} ${meeting.minute_taker.last_name}` : '';
  const presentList = meeting.members_present?.map(m => m.name).join(', ') || '';
  const guestsList = meeting.guests_present?.map(g => g.name).join(', ') || '';

  const buildAgendaHTML = () => {
    return agendaItems.map(item => {
      const ownerName = item.owner ? `${item.owner.first_name} ${item.owner.last_name}` : '';
      const typeLabel = getAgendaItemTypeLabel(item.type);

      let minutesHTML = '';
      if (item.minutes_content) {
        const cleaned = item.minutes_content
          .replace(/class="[^"]*"/g, '')
          .replace(/style="[^"]*"/g, '');
        minutesHTML = `<div class="minutes-content">${cleaned}</div>`;
      }

      let decisionHTML = '';
      if (item.minutes_decision) {
        const cleanDecision = item.minutes_decision
          .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        decisionHTML = `
          <div class="decision-box">
            <div class="decision-label">DECISION</div>
            <div class="decision-text">${cleanDecision}</div>
          </div>`;
      }

      let tasksHTML = '';
      if (item.minutes_tasks) {
        const cleanTasks = item.minutes_tasks
          .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        tasksHTML = `
          <div class="action-box">
            <div class="action-label">ACTION ITEMS</div>
            <div class="action-text">${cleanTasks}</div>
          </div>`;
      }

      const metaItems = [];
      if (ownerName) metaItems.push(`<span class="meta-item"><strong>Owner:</strong> ${ownerName}</span>`);
      if (typeLabel) metaItems.push(`<span class="meta-item"><strong>Type:</strong> ${typeLabel}</span>`);
      if (item.duration) metaItems.push(`<span class="meta-item"><strong>Duration:</strong> ${item.duration} min</span>`);

      return `
        <div class="agenda-item">
          <div class="agenda-header">
            <div class="agenda-number">${item.item_number}</div>
            <div class="agenda-title">${item.item_name}</div>
          </div>
          ${metaItems.length > 0 ? `<div class="agenda-meta">${metaItems.join('<span class="meta-sep">|</span>')}</div>` : ''}
          ${minutesHTML}
          ${decisionHTML}
          ${tasksHTML}
        </div>`;
    }).join('');
  };

  const fullHTML = `
    <div class="minutes-header">
      ${logoDataUrl ? `<img class="org-logo" src="${logoDataUrl}" />` : ''}
      <div class="org-name">${orgName}</div>
      <div class="doc-title">Meeting Minutes</div>
      <div class="meeting-name">${meeting.name}</div>
      <div class="header-line"></div>
    </div>
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Date</div>
        <div class="info-value">${meetingDate}</div>
      </div>
      ${meeting.location ? `
      <div class="info-card">
        <div class="info-label">Location</div>
        <div class="info-value">${meeting.location}</div>
      </div>` : ''}
      ${chairName ? `
      <div class="info-card">
        <div class="info-label">Chairperson</div>
        <div class="info-value">${chairName}</div>
      </div>` : ''}
      ${minuteTakerName ? `
      <div class="info-card">
        <div class="info-label">Minute Taker</div>
        <div class="info-value">${minuteTakerName}</div>
      </div>` : ''}
    </div>
    ${presentList ? `
    <div class="attendance-section">
      <div class="section-heading">Attendance</div>
      <div class="attendance-block">
        <div class="attendance-label">Members Present (${meeting.members_present?.length || 0})</div>
        <div class="attendance-names">${presentList}</div>
      </div>
      ${guestsList ? `
      <div class="attendance-block" style="margin-top: 8px;">
        <div class="attendance-label">Guests Present</div>
        <div class="attendance-names">${guestsList}</div>
      </div>` : ''}
    </div>` : ''}
    <div class="agenda-section">
      <div class="section-heading">Agenda &amp; Minutes</div>
      ${buildAgendaHTML()}
    </div>`;

  const A4_WIDTH_PX = 794;
  const A4_HEIGHT_PX = 1123;
  const SCALE = 2;
  const MARGIN_MM = 20;
  const FOOTER_HEIGHT_MM = 14;
  const CONTENT_HEIGHT_MM = 297 - MARGIN_MM - MARGIN_MM - FOOTER_HEIGHT_MM;
  const paddingPx = Math.round((MARGIN_MM / 210) * A4_WIDTH_PX);

  const documentStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { background: white; }
    .pdf-page {
      width: ${A4_WIDTH_PX}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      color: #1a1a1a;
    }
    .minutes-header { text-align: center; margin-bottom: 20px; }
    .org-logo { display: block; margin: 0 auto 12px; max-width: 80px; max-height: 80px; object-fit: contain; }
    .org-name { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 4px; }
    .doc-title { font-size: 26px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
    .meeting-name { font-size: 16px; font-weight: 500; color: #475569; margin-bottom: 12px; }
    .header-line { width: 60px; height: 3px; background: #0ea5e9; margin: 0 auto; border-radius: 2px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
    .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
    .info-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 2px; }
    .info-value { font-size: 13px; font-weight: 500; color: #1e293b; }
    .section-heading { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0f172a; padding-bottom: 8px; border-bottom: 2px solid #0ea5e9; margin-bottom: 14px; }
    .attendance-section { margin-bottom: 20px; }
    .attendance-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
    .attendance-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
    .attendance-names { font-size: 12.5px; color: #334155; line-height: 1.6; }
    .agenda-section { margin-bottom: 10px; }
    .agenda-item { margin-bottom: 16px; border-left: 3px solid #e2e8f0; padding-left: 14px; }
    .agenda-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
    .agenda-number { font-size: 22px; font-weight: 700; color: #0ea5e9; line-height: 1; min-width: 28px; }
    .agenda-title { font-size: 15px; font-weight: 700; color: #0f172a; }
    .agenda-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; padding: 4px 0; }
    .meta-item { font-size: 11px; color: #64748b; }
    .meta-item strong { color: #475569; font-weight: 600; }
    .meta-sep { color: #cbd5e1; font-size: 10px; margin: 0 2px; }
    .minutes-content { font-size: 12.5px; color: #334155; line-height: 1.65; }
    .minutes-content p { margin-bottom: 8px; }
    .minutes-content strong, .minutes-content b { font-weight: 700; color: #1e293b; }
    .minutes-content em, .minutes-content i { font-style: italic; }
    .minutes-content ul, .minutes-content ol { margin-left: 20px; margin-bottom: 8px; }
    .minutes-content li { margin-bottom: 2px; }
    .decision-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 14px; margin-top: 8px; }
    .decision-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #16a34a; margin-bottom: 4px; }
    .decision-text { font-size: 12.5px; color: #166534; line-height: 1.5; }
    .action-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-top: 8px; }
    .action-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #2563eb; margin-bottom: 4px; }
    .action-text { font-size: 12.5px; color: #1e40af; line-height: 1.5; }
    .pdf-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
    .pdf-footer-org { font-weight: 500; }
    .pdf-footer-page { font-weight: 500; }
  `;

  // --- Measure content and calculate page breaks ---
  const measuringContainer = document.createElement('div');
  measuringContainer.style.position = 'absolute';
  measuringContainer.style.left = '-9999px';
  measuringContainer.style.top = '0';

  const styleEl = document.createElement('style');
  styleEl.textContent = documentStyles;
  measuringContainer.appendChild(styleEl);

  const measurePage = document.createElement('div');
  measurePage.className = 'pdf-page';
  measurePage.style.padding = `${paddingPx}px`;
  measurePage.innerHTML = `<div class="pdf-content">${fullHTML}</div>`;
  measuringContainer.appendChild(measurePage);
  document.body.appendChild(measuringContainer);

  try {
    const images = measuringContainer.getElementsByTagName('img');
    await Promise.all(
      Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 5000);
        });
      })
    );

    const contentAreaHeightPx = Math.round((CONTENT_HEIGHT_MM / 297) * A4_HEIGHT_PX);
    const contentDiv = measurePage.querySelector('.pdf-content');
    const allBlockElements: HTMLElement[] = [];

    if (contentDiv) {
      const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|TABLE|HR|PRE|SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|FIGURE)$/;
      const collectLeafBlocks = (parent: Element) => {
        Array.from(parent.children).forEach(child => {
          const el = child as HTMLElement;
          if (!el.tagName) return;
          const tag = el.tagName.toUpperCase();
          const display = getComputedStyle(el).display;
          if (display === 'none') return;
          if (display === 'inline' || display === 'inline-block') return;

          if (tag === 'UL' || tag === 'OL') {
            Array.from(el.children).forEach(li => {
              const liEl = li as HTMLElement;
              if (liEl.tagName?.toUpperCase() === 'LI') allBlockElements.push(liEl);
            });
            return;
          }

          let hasBlockChildren = false;
          for (const ch of Array.from(el.children)) {
            const chEl = ch as HTMLElement;
            if (!chEl.tagName) continue;
            const chTag = chEl.tagName.toUpperCase();
            const chDisplay = getComputedStyle(chEl).display;
            if (chDisplay === 'block' || chDisplay === 'list-item' || chDisplay === 'flex' || chDisplay === 'grid' ||
                BLOCK_TAGS.test(chTag) || chTag === 'UL' || chTag === 'OL' || chTag === 'LI') {
              hasBlockChildren = true;
              break;
            }
          }
          if (hasBlockChildren) collectLeafBlocks(el);
          else if (display === 'block' || display === 'list-item' || display === 'grid' || display === 'flex' || BLOCK_TAGS.test(tag)) allBlockElements.push(el);
        });
      };
      collectLeafBlocks(contentDiv);
    }

    const measureRect = measurePage.getBoundingClientRect();
    const contentOrigin = measureRect.top + paddingPx;
    const breakOffsets: number[] = [0];
    let nextBoundary = contentAreaHeightPx;

    for (const el of allBlockElements) {
      const rect = el.getBoundingClientRect();
      const elTop = rect.top - contentOrigin;
      const elBottom = rect.bottom - contentOrigin;

      if (elBottom > nextBoundary - 4 && elTop > breakOffsets[breakOffsets.length - 1] + 4) {
        breakOffsets.push(elTop);
        nextBoundary = elTop + contentAreaHeightPx;
      }
      if (el.offsetHeight > contentAreaHeightPx && elTop >= breakOffsets[breakOffsets.length - 1]) {
        let extra = breakOffsets[breakOffsets.length - 1] + contentAreaHeightPx;
        while (extra < elBottom) {
          breakOffsets.push(extra);
          extra += contentAreaHeightPx;
        }
        nextBoundary = extra;
      }
    }

    const totalPages = breakOffsets.length;
    document.body.removeChild(measuringContainer);

    // --- Render each page ---
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      if (pageNum > 0) pdf.addPage();
      const pageOffset = breakOffsets[pageNum];

      const pageContainer = document.createElement('div');
      pageContainer.style.position = 'absolute';
      pageContainer.style.left = '-9999px';
      pageContainer.style.top = '0';

      const pageStyle = document.createElement('style');
      pageStyle.textContent = documentStyles;
      pageContainer.appendChild(pageStyle);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.style.width = `${A4_WIDTH_PX}px`;
      pageDiv.style.height = `${A4_HEIGHT_PX}px`;
      pageDiv.style.padding = `${paddingPx}px`;
      pageDiv.style.position = 'relative';
      pageDiv.style.overflow = 'hidden';

      const contentWrapper = document.createElement('div');
      contentWrapper.style.position = 'relative';
      contentWrapper.style.top = `-${pageOffset}px`;
      contentWrapper.style.width = '100%';
      contentWrapper.innerHTML = `<div class="pdf-content">${fullHTML}</div>`;

      const nextOffset = pageNum < totalPages - 1 ? breakOffsets[pageNum + 1] : pageOffset + contentAreaHeightPx;
      const clipHeight = Math.min(nextOffset - pageOffset, contentAreaHeightPx);

      const clipper = document.createElement('div');
      clipper.style.overflow = 'hidden';
      clipper.style.height = `${clipHeight}px`;
      clipper.appendChild(contentWrapper);
      pageDiv.appendChild(clipper);

      const footer = document.createElement('div');
      footer.className = 'pdf-footer';
      footer.style.position = 'absolute';
      footer.style.bottom = `${paddingPx}px`;
      footer.style.left = `${paddingPx}px`;
      footer.style.right = `${paddingPx}px`;
      footer.innerHTML = `<span class="pdf-footer-org">${orgName} &mdash; ${meeting.name}</span><span class="pdf-footer-page">Page ${pageNum + 1} of ${totalPages}</span>`;
      pageDiv.appendChild(footer);

      pageContainer.appendChild(pageDiv);
      document.body.appendChild(pageContainer);

      const pageImages = pageContainer.getElementsByTagName('img');
      await Promise.all(
        Array.from(pageImages).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 5000);
          });
        })
      );

      const canvas = await html2canvas(pageDiv, {
        scale: SCALE,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, `page-${pageNum}`, 'FAST');
      document.body.removeChild(pageContainer);
    }

    pdf.save(`${meeting.name.replace(/\s+/g, '_')}_Minutes.pdf`);
  } catch (err) {
    const leftover = document.querySelector('[style*="-9999px"]');
    if (leftover) leftover.remove();
    throw err;
  }
}
