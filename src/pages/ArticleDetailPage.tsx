import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getArticleById, deleteArticle, getArticles, Article } from '../utils/articleStorage';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { AlfieIcon } from '../components/brand/AlfieIcon';
import { AAvatar } from '../components/alfie/Kit';
import { NewsCard, NewsCover, NewsSource } from '../components/news/NewsCard';
import { hasOwnExcerpt, longDate, placeholderColours, readMinutes, resolveCoverImage, splitName, stripHtml } from '../components/news/newsUtils';

/** getArticleById returns the raw row, so work out who it's from the same way the feed does. */
const withSource = (article: any): Article => {
  if (!article || article.source_type) return article;
  if (article.national_association_id) return { ...article, source_type: 'national' };
  if (article.state_association_id) return { ...article, source_type: 'state' };
  return { ...article, source_type: 'club' };
};

const hostOf = (url?: string | null) => {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
};

const ArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [moreNews, setMoreNews] = useState<Article[]>([]);
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [copied, setCopied] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchArticle = async () => {
      if (!id) {
        setError('Invalid article ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const fetchedArticle = await getArticleById(id);
        if (fetchedArticle) {
          setArticle(fetchedArticle);
        } else {
          setError('Article not found');
        }

        // Check if user is admin or editor
        if (currentClub) {
          setIsAdmin(currentClub.role === 'admin' || currentClub.role === 'editor');
        }
      } catch (err) {
        console.error('Error fetching article:', err);
        setError(err instanceof Error ? err.message : 'Failed to load article');
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id, currentClub]);

  // "More news": the latest other stories from the same feed. Purely extra, so failures are ignored.
  useEffect(() => {
    if (!article?.id) return;
    const orgId = currentOrganization?.id || currentClub?.clubId;
    const orgType = currentOrganization?.type || 'club';
    if (!orgId) return;
    let cancelled = false;
    const load = orgType === 'club'
      ? getArticles(orgId)
      : orgType === 'state' || orgType === 'national'
        ? getArticles(undefined, orgId, orgType)
        : Promise.resolve([] as Article[]);
    load
      .then(list => {
        if (cancelled) return;
        setMoreNews(list.filter(a => a.id !== article.id && a.status === 'published').slice(0, 3));
      })
      .catch(() => { /* optional section */ });
    return () => { cancelled = true; };
  }, [article?.id, currentClub?.clubId, currentOrganization?.id, currentOrganization?.type]);

  // Reading progress and the solid top bar follow whichever element scrolls the page
  const onScroll = useCallback(() => {
    const el = articleRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const span = rect.height - window.innerHeight * 0.6;
    setProgress(span > 0 ? Math.min(1, Math.max(0, -rect.top / span)) : 1);
    setScrolled(rect.top < 40);
  }, []);

  useEffect(() => {
    let frame = 0;
    const handler = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; onScroll(); });
    };
    window.addEventListener('scroll', handler, { passive: true, capture: true });
    window.addEventListener('resize', handler, { passive: true });
    handler();
    return () => {
      window.removeEventListener('scroll', handler, { capture: true } as any);
      window.removeEventListener('resize', handler);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [onScroll, article?.id]);

  // Image captions are stored on the image; copy them to the paragraph so they can be shown under it
  useEffect(() => {
    proseRef.current?.querySelectorAll<HTMLImageElement>('img[data-caption]').forEach(img => {
      const cap = img.getAttribute('data-caption');
      if (cap && img.parentElement && img.parentElement.tagName === 'P') img.parentElement.setAttribute('data-img-caption', cap);
    });
  }, [article?.content, loading]);

  // Opening another story from "More news" starts at the top
  useEffect(() => {
    articleRef.current?.closest('.a-nw-reader')?.scrollIntoView?.({ block: 'start' });
    window.scrollTo?.({ top: 0 });
  }, [id]);

  const handleEditArticle = () => {
    navigate(`/news/edit/${id}`);
  };

  const handleDeleteArticle = async () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    try {
      if (!id) return;

      await deleteArticle(id);
      navigate('/news');
    } catch (err) {
      console.error('Error deleting article:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share && window.matchMedia?.('(hover: none)').matches) {
        await navigator.share({ title: article?.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* share sheet closed or clipboard blocked */
    }
  };

  if (loading) {
    return (
      <div className="a-nw-reader">
        <div className="a-nw-rd" aria-busy="true" aria-label="Loading article">
          <div className="a-nw-rd-head">
            <span className="a-nw-shim a-nw-shim-line" style={{ width: 140 }} />
            <span className="a-nw-shim" style={{ height: 40, width: '92%', borderRadius: 10 }} />
            <span className="a-nw-shim" style={{ height: 40, width: '64%', borderRadius: 10 }} />
            <span className="a-nw-shim a-nw-shim-line" style={{ width: 220, marginTop: 8 }} />
          </div>
          <span className="a-nw-shim a-nw-rd-cover" style={{ aspectRatio: '16 / 9', display: 'block' }} />
          <div className="a-nw-prose">
            {[100, 96, 88, 100, 72].map((w, i) => <span key={i} className="a-nw-shim a-nw-shim-line" style={{ width: `${w}%`, marginBottom: 14 }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="a-nw-reader">
        <div className="a-nw-rd">
          <div className="a-card a-empty py-14 px-6 mt-10">
            <span className="a-tile a-tile-lg a-tile-danger"><AlfieIcon glyph="warn" size={24} /></span>
            <h2 className="a-ink m-0 text-[18px] font-semibold">{error === 'Article not found' ? 'Story not found' : 'Error'}</h2>
            <p className="a-mute m-0 text-[14px]">{error || 'Article not found'}</p>
            <button onClick={() => navigate('/news')} className="a-btn a-btn-p mt-2">
              <ArrowLeft size={16} />
              Back to News
            </button>
          </div>
        </div>
      </div>
    );
  }

  const story = withSource(article);
  const cover = resolveCoverImage(story.cover_image);
  const [first, last] = splitName(story.author_name);
  const source = hostOf(story.scraped_url);

  return (
    <div className="a-nw-reader">
      {cover ? (
        <div className="a-nw-rd-ambient" aria-hidden="true">
          <img src={cover} alt="" />
        </div>
      ) : (
        <div
          className="a-nw-rd-ambient a-nw-rd-ambient-ph"
          aria-hidden="true"
          style={{ ['--ph-a' as any]: placeholderColours(story.id || story.title || 'news')[0], ['--ph-b' as any]: placeholderColours(story.id || story.title || 'news')[1] }}
        />
      )}

      <div className={`a-nw-rd-bar ${scrolled ? 'is-solid' : ''}`}>
        <button onClick={() => navigate('/news')} className="a-btn a-btn-q a-nw-rd-back">
          <ArrowLeft size={17} />
          News
        </button>
        <span className="a-nw-rd-bar-title" aria-hidden={!scrolled}>{story.title}</span>
        <div className="a-nw-rd-bar-acts">
          <button type="button" className="a-ib" onClick={handleShare} aria-label={copied ? 'Link copied' : 'Share or copy link'} title={copied ? 'Link copied' : 'Copy link'}>
            <AlfieIcon glyph={copied ? 'check' : 'share'} size={18} />
          </button>
          {isAdmin && (
            <>
              <button type="button" className="a-btn a-btn-sm" onClick={handleEditArticle}>
                <AlfieIcon glyph="pen" size={15} />
                <span className="a-nw-rd-hide-sm">Edit</span>
              </button>
              <button type="button" className="a-ib a-ib-d" onClick={handleDeleteArticle} aria-label="Delete article" title="Delete">
                <AlfieIcon glyph="trash" size={17} />
              </button>
            </>
          )}
        </div>
        <span className="a-nw-progress" aria-hidden="true" style={{ transform: `scaleX(${progress})` }} />
      </div>

      <article ref={articleRef} className="a-nw-rd">
        <header className="a-nw-rd-head">
          <div className="a-nw-meta a-nw-rd-meta">
            <NewsSource article={story} />
            {story.event_name && (
              <span className="a-nw-event"><AlfieIcon glyph="flag" size={13} />{story.event_name}</span>
            )}
          </div>
          <h1 className="a-nw-rd-title">{story.title}</h1>
          {hasOwnExcerpt(story) && <p className="a-nw-rd-dek">{stripHtml(story.excerpt)}</p>}
          <div className="a-nw-rd-byline">
            <AAvatar first={first || 'A'} last={last} size={42} />
            <div className="min-w-0">
              <b>{story.author_name || 'Unknown Author'}</b>
              <span>
                {story.published_at ? longDate(story.published_at) : 'Draft'}
                <i className="a-nw-sep" aria-hidden="true" />
                {readMinutes(story.content)} min read
              </span>
            </div>
          </div>
        </header>

        {cover && (
          <figure className="a-nw-rd-cover">
            <NewsCover article={story} eager big naturalAspect={[1.5, 2.4]} />
          </figure>
        )}

        <div
          ref={proseRef}
          className="a-nw-prose"
          dangerouslySetInnerHTML={{ __html: story.content }}
        />

        {(story.tags?.length || (story.is_scraped && source)) ? (
          <footer className="a-nw-rd-foot">
            {story.tags?.length ? (
              <div className="a-nw-rd-tags">
                {story.tags.map((tag: string) => <span key={tag} className="a-nw-rd-tag">#{tag}</span>)}
              </div>
            ) : null}
            {story.is_scraped && source && (
              <a className="a-nw-rd-orig" href={story.scraped_url} target="_blank" rel="noopener noreferrer">
                <AlfieIcon glyph="ext" size={14} />
                Originally published on {source}
              </a>
            )}
          </footer>
        ) : null}
      </article>

      {moreNews.length > 0 && (
        <section className="a-nw-rd-more" aria-label="More news">
          <div className="a-nw-sec">
            <h2 className="a-display a-ink m-0 text-[22px] font-semibold">More news</h2>
          </div>
          <div className="a-nw-grid a-nw-grid-3">
            {moreNews.map((a, i) => (
              <NewsCard key={a.id} article={a} index={i} onOpen={() => navigate(`/news/${a.id}`)} />
            ))}
          </div>
        </section>
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Article"
        message="Are you sure you want to delete this article? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={true}
      />
    </div>
  );
};

export default ArticleDetailPage;
