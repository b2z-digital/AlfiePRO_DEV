/**
 * Race video thumbnail: the broadcast intro screen (venue photo, host club, event, race) drawn
 * off screen at 1280×720 and saved as a JPEG next to the recording. The upload function sets it
 * as the YouTube thumbnail, so the channel, playlist and AlfieTV all show the same picture.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { BroadcastScreen } from './LivestreamOverlayRenderer';
import { supabase } from '../../utils/supabase';

export interface ThumbnailInfo {
  title: string;
  race: string;
  round?: string | null;
  dateLabel?: string;
  venueName?: string;
  venueImage?: string;
  hostClubName?: string;
  hostClubLogo?: string;
}

const clip = (t: string, m: number) => (t && t.length > m ? `${t.slice(0, m - 1).trimEnd()}…` : t);

const waitForImages = (el: HTMLElement, urls: string[]) =>
  Promise.all(urls.filter(Boolean).map(src => new Promise<void>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
    setTimeout(resolve, 4000);
  }))).then(() => new Promise(r => requestAnimationFrame(() => r(el))));

export async function renderRaceThumbnail(info: ThumbnailInfo): Promise<Blob | null> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0', width: '1280px', height: '720px', pointerEvents: 'none' });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(
      <div className="alv-ov" style={{ position: 'absolute', inset: 0 }}>
        <BroadcastScreen
          variant="intro"
          venueImage={info.venueImage}
          hostClubName={info.hostClubName}
          hostClubLogo={info.hostClubLogo}
          chip="Race video"
          eyebrow={[info.dateLabel, info.venueName].filter(Boolean).join(' · ')}
          title={info.title}
          badges={[info.round, info.race]}
          clip={clip}
        />
      </div>
    );
    await waitForImages(host, [info.venueImage || '', info.hostClubLogo || '']);
    await new Promise(r => setTimeout(r, 150));
    const canvas = await html2canvas(host.firstElementChild as HTMLElement, {
      onclone: (doc: Document) => { doc.documentElement.classList.add('alv-h2c'); },
      width: 1280, height: 720, scale: 1, useCORS: true, backgroundColor: '#060B16', logging: false,
    });
    return await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9));
  } catch (err) {
    console.warn('[Thumbnail] Could not draw race thumbnail:', err);
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Draws and stores the thumbnail where the upload function looks for it: <club>/<segment>-thumb.jpg */
export async function saveRaceThumbnail(clubId: string, segmentId: string, info: ThumbnailInfo): Promise<boolean> {
  const blob = await renderRaceThumbnail(info);
  if (!blob) return false;
  const { error } = await supabase.storage
    .from('livestream-recordings')
    .upload(`${clubId}/${segmentId}-thumb.jpg`, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) console.warn('[Thumbnail] Upload failed:', error.message);
  return !error;
}
