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
      let minutesHTML = '';
      if (item.minutes_content) {
        const cleaned = item.minutes_content
          .replace(/class="[^"]*"/g, '')
          .replace(/style="[^"]*"/g, '');
        minutesHTML = `<div class="body-text">${cleaned}</div>`;
      }

      let decisionHTML = '';
      if (item.minutes_decision) {
        const cleanDecision = item.minutes_decision
          .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (cleanDecision) {
          decisionHTML = `<p class="body-text"><strong>Resolution:</strong> ${cleanDecision}</p>`;
        }
      }

      let tasksHTML = '';
      if (item.minutes_tasks) {
        const cleanTasks = item.minutes_tasks
          .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (cleanTasks) {
          tasksHTML = `<p class="body-text"><strong>Action:</strong> ${cleanTasks}</p>`;
        }
      }

      return `
        <div class="agenda-item">
          <h2 class="item-heading">${item.item_number}. ${item.item_name}</h2>
          ${minutesHTML}
          ${decisionHTML}
          ${tasksHTML}
        </div>`;
    }).join('');
  };

  // Build meeting details as two lines
  const line1Parts: string[] = [];
  line1Parts.push(`<strong>Date:</strong> ${meetingDate}`);
  if (meeting.location) line1Parts.push(`<strong>Location:</strong> ${meeting.location}`);

  const line2Parts: string[] = [];
  if (chairName) line2Parts.push(`<strong>Chairperson:</strong> ${chairName}`);
  if (minuteTakerName) line2Parts.push(`<strong>Minute Taker:</strong> ${minuteTakerName}`);

  const fullHTML = `
    <div class="minutes-header">
      ${logoDataUrl ? `<img class="org-logo" src="${logoDataUrl}" />` : ''}
      <div class="org-name">${orgName}</div>
      <div class="doc-title">Meeting Minutes</div>
      <div class="meeting-name">${meeting.name}</div>
      <div class="header-line"></div>
    </div>

    <div class="detail-line">${line1Parts.join('&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;')}</div>
    ${line2Parts.length ? `<div class="detail-line">${line2Parts.join('&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;')}</div>` : ''}

    ${presentList ? `
      <p class="body-text"><strong>Present:</strong> ${presentList}.</p>
    ` : ''}
    ${guestsList ? `
      <p class="body-text"><strong>Guests/Visitors:</strong> ${guestsList}.</p>
    ` : ''}

    ${buildAgendaHTML()}`;

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
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #222;
    }
    .pdf-page div, .pdf-page p, .pdf-page h1, .pdf-page h2, .pdf-page h3, .pdf-page section {
      border: none; border-radius: 0; box-shadow: none; background: transparent;
    }

    .minutes-header { text-align: center; margin-bottom: 20px; border: none !important; border-bottom: none !important; box-shadow: none !important; background: transparent !important; padding: 0 !important; }
    .org-logo { display: block; margin: 0 auto 8px; max-width: 64px; max-height: 64px; object-fit: contain; }
    .org-name { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px; color: #555; margin-bottom: 6px; }
    .doc-title { font-size: 24px; font-weight: 700; color: #111; margin-bottom: 2px; }
    .meeting-name { font-size: 13px; color: #444; margin-bottom: 20px; }
    .header-line { display: none; }

    .detail-line { font-size: 11px; color: #333; text-align: center; margin-bottom: 20px; }
    .detail-line strong { font-weight: 700; }

    .body-text { font-size: 12px; color: #222; line-height: 1.6; margin-bottom: 12px; }
    .body-text:last-child { margin-bottom: 0; }
    .body-text strong, .body-text b { font-weight: 700; }
    .body-text em, .body-text i { font-style: italic; }
    .body-text p { margin-bottom: 10px; }
    .body-text p:last-child { margin-bottom: 0; }
    .body-text ul { list-style-type: disc !important; padding-left: 28px !important; margin-bottom: 10px; }
    .body-text ol { list-style-type: decimal !important; padding-left: 28px !important; margin-bottom: 10px; }
    .body-text ul ul { list-style-type: circle !important; }
    .body-text li { margin-bottom: 3px; display: list-item !important; list-style-position: outside !important; }
    .body-text li::marker { color: #333; }

    .agenda-item { margin-top: 16px; padding-top: 12px; border: none !important; border-radius: 0 !important; background: transparent !important; box-shadow: none !important; overflow: visible !important; border-top: 1px solid #ccc !important; }
    .agenda-item:first-child { border-top: none !important; padding-top: 0; }
    .item-heading { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 6px; }

    .pdf-footer { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #999; padding-top: 6px; border-top: 1px solid #ddd; }
    .pdf-footer-generated { font-style: italic; color: #bbb; }
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
      footer.innerHTML = `<span class="pdf-footer-org">${orgName} &mdash; ${meeting.name}</span><span class="pdf-footer-generated">Generated with AlfiePRO</span><span class="pdf-footer-page">Page ${pageNum + 1} of ${totalPages}</span>`;
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
