import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Skeleton } from '../ui';
import { PageHeader } from './Club';
import { EventMedia, loadMedia, youTubeThumb } from '../club';

type Mode = 'photos' | 'videos' | 'events';

const thumbOf = (m: EventMedia) => m.thumbnail_url || (m.media_type === 'image' ? m.url : youTubeThumb(m.url)) || '';
const embedOf = (url: string) => {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?autoplay=1&playsinline=1` : url;
};

export const MediaScreen: React.FC = () => {
  const { currentClub } = useAuth();
  const { toast, tap } = useMobile();
  const [items, setItems] = useState<EventMedia[] | null>(null);
  const [mode, setMode] = useState<Mode>('photos');
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<EventMedia | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const press = useRef<ReturnType<typeof setTimeout>>();

  const load = React.useCallback(() => {
    if (!currentClub?.clubId) { setItems([]); return; }
    loadMedia(currentClub.clubId).then(setItems).catch(() => setItems([]));
  }, [currentClub?.clubId]);
  useEffect(() => { load(); }, [load]);

  const photos = (items || []).filter(m => m.media_type === 'image');
  const videos = (items || []).filter(m => m.media_type !== 'image');

  // Grouped by event (By event) or by month (Photos / Videos)
  const groups = useMemo(() => {
    const list = mode === 'videos' ? videos : mode === 'photos' ? photos : (items || []);
    const out: { key: string; title: string; sub: string; items: EventMedia[] }[] = [];
    const idx = new Map<string, number>();
    list.forEach(m => {
      const d = new Date(m.created_at);
      const key = mode === 'events' ? (m.event_name || 'Other') : `${d.getFullYear()}-${d.getMonth()}`;
      if (!idx.has(key)) {
        idx.set(key, out.length);
        out.push({
          key,
          title: mode === 'events' ? (m.event_name || 'Other') : d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
          sub: mode === 'events' ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '',
          items: [],
        });
      }
      out[idx.get(key)!].items.push(m);
    });
    return out;
  }, [items, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onTap = (m: EventMedia) => (selecting ? toggle(m.id) : setViewing(m));
  const startPress = (m: EventMedia) => {
    press.current = setTimeout(() => { tap('medium'); setSelecting(true); setSel(new Set([m.id])); }, 450);
  };
  const endPress = () => clearTimeout(press.current);

  const shareSelected = async () => {
    const urls = (items || []).filter(m => sel.has(m.id)).map(m => m.url);
    if (!urls.length) return;
    try {
      if (navigator.share) await navigator.share({ title: `${urls.length} from ${currentClub?.club?.name || 'the club'}`, text: urls.join('\n') });
      else { await navigator.clipboard.writeText(urls.join('\n')); toast('Links copied'); }
    } catch { /* dismissed */ }
  };

  // Same storage and table as the desktop media uploader
  const upload = async (files: File[]) => {
    if (!files.length || !currentClub?.clubId) return;
    setUploading(true);
    let done = 0;
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      for (const file of files) {
        const c = file.type.startsWith('image/') ? await compressImage(file, 'photo') : file;
        const path = `${currentClub.clubId}/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${c.name.split('.').pop()}`;
        const { data, error } = await supabase.storage.from('event-media').upload(path, c, { cacheControl: '3600', upsert: false });
        if (error || !data) continue;
        const url = supabase.storage.from('event-media').getPublicUrl(data.path).data.publicUrl;
        await supabase.from('event_media').insert({
          club_id: currentClub.clubId, url, media_type: 'image', title: file.name, description: null,
          event_ref_id: null, event_ref_type: 'quick_race', event_name: null, race_class: null, is_homepage_media: false,
        });
        done++;
      }
      tap('success');
      toast(done ? `${done} photo${done === 1 ? '' : 's'} added` : "Couldn't upload. Try again.");
      load();
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="m-stack">
      <PageHeader
        title="Media"
        right={selecting ? (
          <button className="m-pill-btn" style={{ background: 'var(--m-fill)', color: 'var(--m-ink)' }} onClick={() => { setSelecting(false); setSel(new Set()); }}>Done</button>
        ) : (
          <button className="m-pill-btn" onClick={() => fileRef.current?.click()} disabled={uploading}><Icon name="upload" size={17} />{uploading ? 'Uploading…' : 'Upload'}</button>
        )}
      />
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
      <div className="m-chips">
        <button className={`m-chip ${mode === 'photos' ? 'm-chip-on' : ''}`} onClick={() => setMode('photos')}>Photos {photos.length || ''}</button>
        <button className={`m-chip ${mode === 'videos' ? 'm-chip-on' : ''}`} onClick={() => setMode('videos')}>Videos {videos.length || ''}</button>
        <button className={`m-chip ${mode === 'events' ? 'm-chip-on' : ''}`} onClick={() => setMode('events')}>By event</button>
      </div>
      {items === null ? <Skeleton h={360} /> : groups.length === 0 ? (
        <div className="m-card m-empty">No {mode === 'videos' ? 'videos' : 'photos'} yet. Upload some from race day.</div>
      ) : groups.map((g, gi) => (
        <React.Fragment key={g.key}>
          <div className="m-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: gi ? 4 : 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{g.title} {g.sub && <span className="m-dim" style={{ fontWeight: 400, fontSize: 13 }}>· {g.sub}</span>}</span>
            {gi === 0 && !selecting && <button style={{ background: 'none', border: 0, padding: 0, color: 'var(--m-blue-ink)', fontSize: 13.5, fontWeight: 600 }} onClick={() => setSelecting(true)}>Select</button>}
          </div>
          <div className="m-g">
            {g.items.map(m => {
              const t = thumbOf(m);
              return (
                <button key={m.id} className={sel.has(m.id) ? 'm-sel' : ''} style={{ backgroundImage: t ? `url("${t}")` : undefined }}
                  aria-label={m.title || (m.media_type === 'image' ? 'Photo' : 'Video')}
                  onClick={() => onTap(m)} onTouchStart={() => startPress(m)} onTouchEnd={endPress} onTouchMove={endPress} onContextMenu={e => e.preventDefault()}>
                  {m.media_type !== 'image' && <Icon name="play" size={22} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.6))' }} />}
                  {selecting && (
                    <span style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, border: '2px solid #fff', background: sel.has(m.id) ? 'var(--m-blue)' : 'rgba(0,0,0,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel.has(m.id) && <Icon name="check" size={14} strokeWidth={3} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
      {selecting && sel.size > 0 && (
        <div className="m-bar" style={{ bottom: 'var(--m-tab-h)', paddingBottom: 12 }}>
          <span style={{ flex: 1, alignSelf: 'center', fontWeight: 600 }}>{sel.size} selected</span>
          <button className="m-btn m-btn-p" onClick={shareSelected}><Icon name="share" />Share</button>
        </div>
      )}
      {viewing && (
        <div className="m-viewer" role="dialog" aria-label={viewing.title || 'Media'}>
          <div className="m-row" style={{ padding: 'calc(var(--m-safe-top) + 8px) 16px 8px', color: '#fff' }}>
            <button className="m-ibtn m-ibtn-d" aria-label="Close" onClick={() => setViewing(null)}><Icon name="close" /></button>
            <span className="m-ell" style={{ flex: 1, fontWeight: 600 }}>{viewing.event_name || viewing.title || ''}</span>
            <button className="m-ibtn m-ibtn-d" aria-label="Share" onClick={async () => { try { if (navigator.share) await navigator.share({ url: viewing.url }); } catch { /* dismissed */ } }}><Icon name="share" /></button>
          </div>
          {viewing.media_type === 'image'
            ? <img src={viewing.url} alt={viewing.title || ''} />
            : <iframe src={embedOf(viewing.url)} title={viewing.title || 'Video'} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
        </div>
      )}
    </div>
  );
};

export default MediaScreen;
