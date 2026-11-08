import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon } from '../icons';
import { Avatar, Skeleton } from '../ui';
import { PageHeader } from './Club';
import { Article, loadArticle, loadNews, readMinutes } from '../club';

const SAVED_KEY = 'alfie-m-saved-articles';
const readSaved = (): string[] => { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } };
const writeSaved = (ids: string[]) => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(ids)); } catch { /* private mode */ } };

const FALLBACKS = ['linear-gradient(130deg,#0B2E5C,#1C6FC2 55%,#9DD2FF)', 'linear-gradient(135deg,#0B4FA8,#4DA3FF)', 'linear-gradient(135deg,#5A2A10,#FF8A2B)', 'linear-gradient(135deg,#3B1C6E,#8A4DFF)'];
const cover = (a: Article, i = 0) => (a.cover_image ? `url("${a.cover_image}")` : FALLBACKS[i % FALLBACKS.length]);
const srcOf = (a: Article): 'club' | 'state' | 'national' => (a.source_type || 'club') as any;
const SRC_LABEL = { club: 'Club', state: 'State', national: 'National' };
const byline = (a: Article, clubName?: string) => {
  const author = a.author_name && a.author_name !== 'Unknown Author' ? a.author_name : '';
  return (srcOf(a) !== 'club' ? a.source_name : author || a.source_name || clubName) || 'AlfiePRO';
};

export const SourceTag: React.FC<{ a: Article }> = ({ a }) => <span className={`m-src m-src-${srcOf(a)}`}>{SRC_LABEL[srcOf(a)]}</span>;

export const NewsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [items, setItems] = useState<Article[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'club' | 'state' | 'national' | 'saved'>('all');
  const saved = useMemo(readSaved, [filter]);

  useEffect(() => {
    loadNews(currentClub?.clubId, currentOrganization ? { type: currentOrganization.type, id: currentOrganization.id } : null)
      .then(setItems).catch(() => setItems([]));
  }, [currentClub?.clubId, currentOrganization?.id, currentOrganization?.type]);

  const shown = (items || []).filter(a => filter === 'all' || (filter === 'saved' ? saved.includes(a.id) : srcOf(a) === filter));
  const [top, ...rest] = shown;
  const open = (a: Article) => navigate(`/news/${a.id}`);
  const meta = (a: Article) => [byline(a, currentClub?.club?.name), `${readMinutes(a.content || '')} min read`].filter(Boolean).join(' · ');

  return (
    <div className="m-stack">
      <PageHeader
        title="News"
        right={<button className="m-ibtn" aria-label="Saved stories" aria-pressed={filter === 'saved'} onClick={() => setFilter(f => (f === 'saved' ? 'all' : 'saved'))} style={filter === 'saved' ? { background: 'var(--m-blue)', color: '#fff', borderColor: 'var(--m-blue)' } : undefined}><Icon name="bookmark" /></button>}
      />
      <div className="m-chips">
        {(['all', 'club', 'state', 'national'] as const).map(f => (
          <button key={f} className={`m-chip ${filter === f ? 'm-chip-on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : SRC_LABEL[f]}</button>
        ))}
      </div>
      {items === null ? <><Skeleton h={300} /><Skeleton h={160} /></> : !top ? (
        <div className="m-card m-empty">{filter === 'saved' ? 'Save a story with the bookmark to read it later.' : 'No news here yet.'}</div>
      ) : (
        <>
          <button className="m-card" style={{ overflow: 'hidden', padding: 0, textAlign: 'left', color: 'inherit' }} onClick={() => open(top)}>
            <span style={{ display: 'block', height: 180, backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0) 50%,rgba(0,0,0,.4)), ${cover(top)}`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ padding: 14 }}>
              <SourceTag a={top} />
              <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.15, marginTop: 8 }}>{top.title}</div>
              <div className="m-dim" style={{ fontSize: 12.5, marginTop: 8 }}>{meta(top)}</div>
            </div>
          </button>
          {rest.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Also new</p>
              <div className="m-card">
                {rest.map((a, i) => (
                  <button key={a.id} className="m-li" onClick={() => open(a)}>
                    <span className="m-thumb" style={{ backgroundImage: cover(a, i + 1) }} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <SourceTag a={a} />
                      <span style={{ fontWeight: 600, fontSize: 14.5, marginTop: 5, lineHeight: 1.3 }}>{a.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const ArticleScreen: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast, tap } = useMobile();
  const { currentClub } = useAuth();
  const [a, setA] = useState<Article | null | undefined>(undefined);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState(() => readSaved().includes(id));
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadArticle(id).then(setA).catch(() => setA(null)); }, [id]);
  useEffect(() => {
    const el = document.querySelector('.m-scroll');
    if (!el) return;
    const on = () => setProgress(el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1);
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  const html = useMemo(() => (a?.content ? DOMPurify.sanitize(a.content, { ADD_ATTR: ['target'] }) : ''), [a?.content]);
  const toggleSave = () => {
    const ids = readSaved();
    const next = saved ? ids.filter(x => x !== id) : [...ids, id];
    writeSaved(next);
    setSaved(!saved);
    tap(saved ? 'light' : 'success');
    toast(saved ? 'Removed from saved' : 'Saved for later');
  };

  if (a === undefined) return <div className="m-stack"><Skeleton h={60} /><Skeleton h={220} /><Skeleton h={300} /></div>;
  if (a === null) return <div className="m-stack"><PageHeader title="News" /><div className="m-card m-empty">This story isn't available any more.</div></div>;

  const author = byline(a, currentClub?.club?.name);
  const date = a.published_at || a.created_at;
  return (
    <div className="m-stack">
      <div className="m-progress" style={{ width: `${Math.round(progress * 100)}%` }} />
      <header className="m-top" style={{ justifyContent: 'space-between' }}>
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/news'))}><Icon name="back" /></button>
        <button className="m-ibtn" aria-label={saved ? 'Remove from saved' : 'Save'} aria-pressed={saved} onClick={toggleSave} style={saved ? { color: 'var(--m-blue-ink)' } : undefined}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        </button>
      </header>
      <SourceTag a={a} />
      <h2 className="m-disp" style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.12 }}>{a.title}</h2>
      <div className="m-row" style={{ gap: 10 }}>
        <Avatar name={author} size={32} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{author}</div>
          <div className="m-dim" style={{ fontSize: 12 }}>
            {date ? new Date(date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : ''} · {readMinutes(a.content || '')} min read
          </div>
        </div>
      </div>
      {a.cover_image && <span style={{ display: 'block', height: 200, borderRadius: 16, backgroundImage: `url("${a.cover_image}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
      <div ref={bodyRef} className="m-article" dangerouslySetInnerHTML={{ __html: html }} />
      {a.scraped_url && <a href={a.scraped_url} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Read the original</a>}
    </div>
  );
};
