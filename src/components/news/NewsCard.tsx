import React from 'react';
import { AlfieIcon } from '../brand/AlfieIcon';
import { AAvatar } from '../alfie/Kit';
import type { Article } from '../../utils/articleStorage';
import { SmartImage } from './SmartImage';
import { excerptOf, isFresh, placeholderColours, readMinutes, relativeDate, resolveCoverImage, sourceOf, splitName } from './newsUtils';

/** Designed stand-in for stories without a cover (or whose image fails to load). */
export const NewsPlaceholder: React.FC<{ article: Partial<Article>; big?: boolean }> = ({ article, big }) => {
  const [a, b] = placeholderColours(article.id || article.title || 'news');
  const src = sourceOf(article);
  return (
    <div className="a-nw-ph" style={{ ['--ph-a' as any]: a, ['--ph-b' as any]: b }} aria-hidden="true">
      <span className="a-nw-ph-glyph"><AlfieIcon glyph="news" size={big ? 64 : 40} strokeWidth={1.4} /></span>
      <span className="a-nw-ph-lbl">{src.label}</span>
    </div>
  );
};

export const NewsCover: React.FC<{
  article: Partial<Article>;
  className?: string;
  eager?: boolean;
  zoom?: boolean;
  big?: boolean;
  naturalAspect?: [number, number];
}> = ({ article, className = '', eager, zoom, big, naturalAspect }) => (
  <SmartImage
    src={resolveCoverImage(article.cover_image)}
    alt={article.title || ''}
    className={className}
    eager={eager}
    zoomOnHover={zoom}
    naturalAspect={naturalAspect}
    fallback={<NewsPlaceholder article={article} big={big} />}
  />
);

export const NewsSource: React.FC<{ article: Partial<Article>; short?: boolean }> = ({ article, short }) => {
  const s = sourceOf(article);
  return (
    <span className={`a-nw-src a-nw-src-${s.tone}`}>
      <i aria-hidden="true" />
      {short ? s.short : s.label}
    </span>
  );
};

interface CardActions {
  onOpen: () => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onTag?: (tag: string) => void;
}

const keyOpen = (onOpen: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
};

const AdminActions: React.FC<Pick<CardActions, 'onEdit' | 'onDelete'>> = ({ onEdit, onDelete }) =>
  onEdit || onDelete ? (
    <div className="a-nw-acts">
      {onEdit && (
        <button type="button" className="a-nw-gb" aria-label="Edit article" title="Edit" onClick={onEdit}>
          <AlfieIcon glyph="pen" size={15} />
        </button>
      )}
      {onDelete && (
        <button type="button" className="a-nw-gb a-nw-gb-d" aria-label="Delete article" title="Delete" onClick={onDelete}>
          <AlfieIcon glyph="trash" size={15} />
        </button>
      )}
    </div>
  ) : null;

const Byline: React.FC<{ article: Article; size?: number }> = ({ article, size = 22 }) => {
  const [first, last] = splitName(article.author_name);
  return (
    <span className="a-nw-by">
      <AAvatar first={first || 'A'} last={last} size={size} />
      <span className="a-nw-by-name">{article.author_name || 'Unknown Author'}</span>
      <span className="a-nw-sep" aria-hidden="true" />
      <span className="a-nw-by-time">{readMinutes(article.content)} min read</span>
    </span>
  );
};

const Tags: React.FC<{ tags?: string[]; onTag?: (t: string) => void; max?: number }> = ({ tags, onTag, max = 2 }) => {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className="a-nw-tags">
      {shown.map(t => (
        <button
          key={t}
          type="button"
          className="a-nw-tag"
          onClick={e => { e.stopPropagation(); onTag?.(t); }}
          title={`Show stories tagged ${t}`}
        >
          #{t}
        </button>
      ))}
      {tags.length > max && <span className="a-nw-tag a-nw-tag-more">+{tags.length - max}</span>}
    </span>
  );
};

/** Grid card */
export const NewsCard: React.FC<{ article: Article; index?: number; preview?: boolean } & CardActions> = ({ article, index = 0, preview, onOpen, onEdit, onDelete, onTag }) => (
  <article
    className={`a-nw-card group ${preview ? 'a-nw-card-preview' : 'a-nw-in'}`}
    style={{ ['--i' as any]: index }}
    {...(preview
      ? {}
      : { role: 'link', tabIndex: 0, 'aria-label': article.title, onClick: onOpen, onKeyDown: keyOpen(onOpen) })}
  >
    <div className="a-nw-card-media">
      <NewsCover article={article} zoom />
      {isFresh(article.published_at) && <span className="a-nw-new">New</span>}
      <AdminActions onEdit={onEdit} onDelete={onDelete} />
    </div>
    <div className="a-nw-card-body">
      <div className="a-nw-meta">
        <NewsSource article={article} />
        <span className="a-nw-sep" aria-hidden="true" />
        <span>{article.published_at ? relativeDate(article.published_at) : 'Draft'}</span>
      </div>
      <h3 className="a-nw-title">{article.title}</h3>
      <p className="a-nw-ex">{excerptOf(article)}</p>
      {article.event_name && (
        <span className="a-nw-event"><AlfieIcon glyph="flag" size={13} />{article.event_name}</span>
      )}
      <div className="a-nw-foot">
        <Byline article={article} />
        {!preview && <Tags tags={article.tags} onTag={onTag} />}
        {preview && article.tags?.length ? <span className="a-nw-tags">{article.tags.slice(0, 2).map(t => <span key={t} className="a-nw-tag">#{t}</span>)}</span> : null}
      </div>
    </div>
  </article>
);

/** Large lead story */
export const NewsFeature: React.FC<{ article: Article } & CardActions> = ({ article, onOpen, onEdit, onDelete, onTag }) => {
  const cover = resolveCoverImage(article.cover_image);
  return (
    <article
      className="a-nw-feature a-nw-in group"
      role="link"
      tabIndex={0}
      aria-label={article.title}
      onClick={onOpen}
      onKeyDown={keyOpen(onOpen)}
    >
      {cover && <img className="a-nw-ambient-img" src={cover} alt="" aria-hidden="true" loading="lazy" />}
      <div className="a-nw-feature-media">
        <NewsCover article={article} zoom big eager />
        <span className="a-nw-glass-tag"><AlfieIcon glyph="spark" size={13} />Top story</span>
        <AdminActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <div className="a-nw-feature-body">
        <div className="a-nw-meta">
          <NewsSource article={article} />
          <span className="a-nw-sep" aria-hidden="true" />
          <span>{relativeDate(article.published_at)}</span>
          {isFresh(article.published_at) && <span className="a-nw-new a-nw-new-inline">New</span>}
        </div>
        <h2 className="a-nw-feature-title">{article.title}</h2>
        <p className="a-nw-ex a-nw-ex-lg">{excerptOf(article, 240)}</p>
        {article.event_name && (
          <span className="a-nw-event"><AlfieIcon glyph="flag" size={13} />{article.event_name}</span>
        )}
        <div className="a-nw-foot">
          <Byline article={article} size={28} />
          <Tags tags={article.tags} onTag={onTag} max={3} />
          <span className="a-nw-read">Read story<AlfieIcon glyph="chevR" size={15} /></span>
        </div>
      </div>
    </article>
  );
};

/** Compact row: side list, list view and drafts */
export const NewsRow: React.FC<{
  article: Article;
  index?: number;
  size?: 'sm' | 'md';
  draft?: boolean;
  showExcerpt?: boolean;
} & CardActions> = ({ article, index = 0, size = 'md', draft, showExcerpt, onOpen, onEdit, onDelete, onTag }) => (
  <article
    className={`a-nw-row a-nw-row-${size} a-nw-in group ${draft ? 'a-nw-row-draft' : ''}`}
    style={{ ['--i' as any]: index }}
    role="link"
    tabIndex={0}
    aria-label={article.title || 'Untitled Article'}
    onClick={onOpen}
    onKeyDown={keyOpen(onOpen)}
  >
    <div className="a-nw-row-media">
      <NewsCover article={article} zoom />
    </div>
    <div className="a-nw-row-body">
      <div className="a-nw-meta">
        {draft ? (
          <>
            <span className="a-nw-draft">Draft</span>
            <span>Last edited {article.updated_at ? relativeDate(article.updated_at) : 'recently'}</span>
          </>
        ) : (
          <>
            <NewsSource article={article} short={size === 'sm'} />
            <span className="a-nw-sep" aria-hidden="true" />
            <span>{article.published_at ? relativeDate(article.published_at) : 'Draft'}</span>
            {isFresh(article.published_at) && <span className="a-nw-new a-nw-new-inline">New</span>}
          </>
        )}
      </div>
      <h3 className="a-nw-row-title">{article.title || 'Untitled Article'}</h3>
      {showExcerpt && <p className="a-nw-ex a-nw-ex-1">{draft ? (excerptOf(article, 140) || 'No content yet') : excerptOf(article, 200)}</p>}
      {size === 'md' && !draft && (
        <div className="a-nw-foot">
          <Byline article={article} />
          {article.event_name && <span className="a-nw-event a-nw-event-sm"><AlfieIcon glyph="flag" size={12} />{article.event_name}</span>}
          <Tags tags={article.tags} onTag={onTag} />
        </div>
      )}
    </div>
    {draft ? (
      <div className="a-nw-row-side">
        {onEdit && (
          <button type="button" className="a-btn a-btn-sm" onClick={onEdit}>
            <AlfieIcon glyph="pen" size={14} />Edit
          </button>
        )}
        {onDelete && (
          <button type="button" className="a-ib a-ib-d" aria-label="Delete draft" onClick={onDelete}>
            <AlfieIcon glyph="trash" size={16} />
          </button>
        )}
      </div>
    ) : size === 'md' ? (
      <div className="a-nw-row-side">
        {(onEdit || onDelete) && (
          <span className="a-nw-row-admin">
            {onEdit && (
              <button type="button" className="a-ib" aria-label="Edit article" onClick={onEdit}>
                <AlfieIcon glyph="pen" size={16} />
              </button>
            )}
            {onDelete && (
              <button type="button" className="a-ib a-ib-d" aria-label="Delete article" onClick={onDelete}>
                <AlfieIcon glyph="trash" size={16} />
              </button>
            )}
          </span>
        )}
        <AlfieIcon glyph="chevR" size={18} className="a-nw-row-chev" />
      </div>
    ) : null}
  </article>
);

export const NewsCardSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => (
  <div className="a-nw-card a-nw-skel" style={{ ['--i' as any]: index }} aria-hidden="true">
    <div className="a-nw-card-media"><span className="a-nw-shim" /></div>
    <div className="a-nw-card-body">
      <span className="a-nw-shim a-nw-shim-line" style={{ width: '38%' }} />
      <span className="a-nw-shim a-nw-shim-line a-nw-shim-h" style={{ width: '92%' }} />
      <span className="a-nw-shim a-nw-shim-line a-nw-shim-h" style={{ width: '70%' }} />
      <span className="a-nw-shim a-nw-shim-line" style={{ width: '100%' }} />
      <span className="a-nw-shim a-nw-shim-line" style={{ width: '84%' }} />
    </div>
  </div>
);
