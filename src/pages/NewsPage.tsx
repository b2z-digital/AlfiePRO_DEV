import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { getArticles, getDraftArticles, deleteArticle, Article } from '../utils/articleStorage';
import { useNotifications } from '../contexts/NotificationContext';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { usePermissions } from '../hooks/usePermissions';
import { AlfieIcon } from '../components/brand/AlfieIcon';
import { NewsCard, NewsCardSkeleton, NewsFeature, NewsRow } from '../components/news/NewsCard';
import { NewsTone, sourceOf } from '../components/news/newsUtils';

const SOURCE_LABELS: Record<NewsTone, string> = { club: 'Club', state: 'State', national: 'National' };

const NewsPage: React.FC = () => {
  const { currentClub, currentOrganization, user } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const { addNotification } = useNotifications();
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; articleId: string | null }>({ show: false, articleId: null });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageTitle, setPageTitle] = useState('Club News');
  const [pageSubtitle, setPageSubtitle] = useState('');
  const [filterYachtClass, setFilterYachtClass] = useState<string | null>(null);
  const [availableYachtClasses, setAvailableYachtClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [viewTab, setViewTab] = useState<'published' | 'drafts'>('published');
  const [draftArticles, setDraftArticles] = useState<Article[]>([]);
  const [filterSource, setFilterSource] = useState<NewsTone | null>(null);
  
  useEffect(() => {
    const fetchArticles = async () => {
      // Determine the organization ID and type
      const orgId = currentOrganization?.id || currentClub?.clubId;
      const orgType = currentOrganization?.type || 'club';

      if (!orgId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch yacht classes
        const { data: yachtClasses } = await supabase
          .from('boat_classes')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (yachtClasses) {
          setAvailableYachtClasses(yachtClasses);
        }

        let fetchedArticles: Article[] = [];

        // Set page title based on organization type
        if (orgType === 'state') {
          // Fetch state association info to get abbreviation
          const { data: stateAssoc } = await supabase
            .from('state_associations')
            .select('name, abbreviation')
            .eq('id', orgId)
            .maybeSingle();

          const displayName = stateAssoc?.abbreviation || stateAssoc?.name || 'State';
          setPageTitle(`${displayName} News`);
          setPageSubtitle(`Latest updates and announcements from ${stateAssoc?.name || 'the state association'}`);
        } else if (orgType === 'national') {
          // Fetch national association info
          const { data: nationalAssoc } = await supabase
            .from('national_associations')
            .select('name, abbreviation')
            .eq('id', orgId)
            .maybeSingle();

          const displayName = nationalAssoc?.abbreviation || nationalAssoc?.name || 'National';
          setPageTitle(`${displayName} News`);
          setPageSubtitle(`Latest updates and announcements from ${nationalAssoc?.name || 'the national association'}`);
        } else {
          setPageTitle('Club News');
          setPageSubtitle(`Latest updates and announcements from ${currentClub?.club?.name || 'your club'}`);
        }

        if (orgType === 'club') {
          fetchedArticles = await getArticles(orgId);
        } else if (orgType === 'state' || orgType === 'national') {
          fetchedArticles = await getArticles(undefined, orgId, orgType);
        }

        setArticles(fetchedArticles);

        // Extract all unique tags
        const tags = new Set<string>();
        fetchedArticles.forEach(article => {
          article.tags?.forEach(tag => tags.add(tag));
        });
        setAllTags(Array.from(tags));

        const userIsAdmin =
          currentClub?.role === 'admin' ||
          currentClub?.role === 'editor' ||
          currentOrganization?.role === 'state_admin' ||
          currentOrganization?.role === 'national_admin';
        setIsAdmin(userIsAdmin);

        if (userIsAdmin) {
          try {
            const drafts = await getDraftArticles(
              orgType === 'club' ? orgId : undefined,
              orgType !== 'club' ? orgId : undefined,
              orgType !== 'club' ? orgType as 'state' | 'national' : undefined
            );
            setDraftArticles(drafts);
          } catch {
            setDraftArticles([]);
          }
        }
      } catch (err) {
        console.error('Error fetching articles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load articles');
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [currentClub, currentOrganization]);
  
  useEffect(() => {
    if (viewTab === 'drafts' && draftArticles.length === 0) {
      setViewTab('published');
    }
  }, [draftArticles.length, viewTab]);

  // Filter articles based on search term and tag
  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (article.excerpt && article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = filterTag ? article.tags?.includes(filterTag) : true;
    const matchesYachtClass = filterYachtClass ? (article as any).yacht_classes?.includes(filterYachtClass) : true;
    const matchesSource = filterSource ? sourceOf(article).tone === filterSource : true;
    return matchesSearch && matchesTag && matchesYachtClass && matchesSource;
  });

  const sortedArticles = [...filteredArticles].sort((a, b) => {
    if (sortBy === 'title') {
      const comparison = a.title.localeCompare(b.title);
      return sortOrder === 'asc' ? comparison : -comparison;
    } else {
      const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
      const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    }
  });

  const toggleSort = () => {
    if (sortBy === 'date') {
      if (sortOrder === 'desc') {
        setSortOrder('asc');
      } else {
        setSortBy('title');
        setSortOrder('asc');
      }
    } else {
      setSortBy('date');
      setSortOrder('desc');
    }
  };

  const handleReadMore = (articleId: string) => {
    navigate(`/news/${articleId}`);
  };

  const handleNewArticle = () => {
    navigate('/news/new');
  };

  const handleEditArticle = (articleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/news/edit/${articleId}`);
  };

  const handleDeleteArticle = async (articleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ show: true, articleId });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.articleId) return;

    try {
      await deleteArticle(deleteConfirm.articleId);
      setArticles(articles.filter(article => article.id !== deleteConfirm.articleId));
      setDraftArticles(prev => prev.filter(article => article.id !== deleteConfirm.articleId));
      addNotification('success', 'Article deleted successfully');
    } catch (err) {
      console.error('Error deleting article:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    } finally {
      setDeleteConfirm({ show: false, articleId: null });
    }
  };
  
  const sourcesPresent = useMemo(() => {
    const set = new Set<NewsTone>();
    articles.forEach(a => set.add(sourceOf(a).tone));
    return (['club', 'state', 'national'] as NewsTone[]).filter(t => set.has(t));
  }, [articles]);

  const filtersActive = !!(searchTerm || filterTag || filterYachtClass || filterSource);
  const sortLabel = sortBy === 'title' ? 'A–Z' : sortOrder === 'desc' ? 'Newest' : 'Oldest';
  const showFeature = viewTab === 'published' && viewMode === 'grid' && !filtersActive && sortBy === 'date' && sortOrder === 'desc' && sortedArticles.length >= 2;
  const lead = showFeature ? sortedArticles[0] : null;
  const side = showFeature ? sortedArticles.slice(1, 5) : [];
  const rest = showFeature ? sortedArticles.slice(1 + side.length) : sortedArticles;

  const clearFilters = () => {
    setSearchTerm('');
    setFilterTag(null);
    setFilterYachtClass(null);
    setFilterSource(null);
  };

  const adminProps = (article: Article) =>
    isAdmin
      ? {
          onEdit: (e: React.MouseEvent) => handleEditArticle(article.id, e),
          onDelete: (e: React.MouseEvent) => handleDeleteArticle(article.id, e),
        }
      : {};

  return (
    <div className="h-full overflow-y-auto">
      <div className="a-nw-page flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}>
            <AlfieIcon glyph="news" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">{pageTitle}</h1>
            {pageSubtitle && <p className="a-mute m-0 mt-1 text-[14px]">{pageSubtitle}</p>}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="a-field a-nw-search">
              <Search size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search news"
                aria-label="Search articles"
              />
              {searchTerm && (
                <button type="button" className="a-nw-clear" onClick={() => setSearchTerm('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </label>
            {can('articles.create') && (
              <button onClick={handleNewArticle} className="a-btn a-btn-p a-nw-newbtn whitespace-nowrap" aria-label="New article">
                <Plus size={17} />
                <span className="a-nw-newbtn-lbl">New article</span>
              </button>
            )}
          </div>
        </header>

        {/* Toolbar */}
        <div className="a-nw-toolbar">
          {isAdmin && draftArticles.length > 0 && (
            <div className="a-seg" role="tablist" aria-label="Article status">
              <button role="tab" aria-selected={viewTab === 'published'} className={`a-seg-i ${viewTab === 'published' ? 'a-seg-on' : ''}`} onClick={() => setViewTab('published')}>
                Published<span className="a-cnt">{articles.length}</span>
              </button>
              <button role="tab" aria-selected={viewTab === 'drafts'} className={`a-seg-i ${viewTab === 'drafts' ? 'a-seg-on' : ''}`} onClick={() => setViewTab('drafts')}>
                Drafts<span className="a-cnt a-cnt-amber">{draftArticles.length}</span>
              </button>
            </div>
          )}

          {viewTab === 'published' && sourcesPresent.length > 1 && (
            <div className="a-nw-chips" role="group" aria-label="Filter by source">
              <button type="button" className={`a-nw-chip ${!filterSource ? 'a-nw-chip-on' : ''}`} onClick={() => setFilterSource(null)}>All news</button>
              {sourcesPresent.map(t => (
                <button key={t} type="button" className={`a-nw-chip a-nw-chip-${t} ${filterSource === t ? 'a-nw-chip-on' : ''}`} onClick={() => setFilterSource(filterSource === t ? null : t)}>
                  <i aria-hidden="true" />{SOURCE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {viewTab === 'published' && (
            <div className="a-nw-tools">
              <select
                value={filterYachtClass || ''}
                onChange={(e) => setFilterYachtClass(e.target.value || null)}
                className="a-pick a-nw-pick"
                aria-label="Filter by class"
              >
                <option value="">All classes</option>
                <option value="generic">Generic</option>
                {availableYachtClasses.map(yachtClass => (
                  <option key={yachtClass.id} value={yachtClass.id}>
                    {yachtClass.name}
                  </option>
                ))}
              </select>

              {allTags.length > 0 && (
                <select
                  value={filterTag || ''}
                  onChange={(e) => setFilterTag(e.target.value || null)}
                  className="a-pick a-nw-pick"
                  aria-label="Filter by tag"
                >
                  <option value="">All tags</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={toggleSort}
                className="a-btn a-nw-sort"
                title={`Sort by ${sortBy === 'date' ? 'date' : 'title'} (${sortOrder === 'asc' ? 'ascending' : 'descending'})`}
              >
                <AlfieIcon glyph="sort" size={16} />
                {sortLabel}
              </button>

              <div className="a-seg" role="group" aria-label="Layout">
                <button type="button" className={`a-seg-i a-nw-seg-ic ${viewMode === 'grid' ? 'a-seg-on' : ''}`} onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
                  <AlfieIcon glyph="grid" size={16} />
                </button>
                <button type="button" className={`a-seg-i a-nw-seg-ic ${viewMode === 'list' ? 'a-seg-on' : ''}`} onClick={() => setViewMode('list')} title="List view" aria-label="List view" aria-pressed={viewMode === 'list'}>
                  <AlfieIcon glyph="list" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {filterTag && viewTab === 'published' && (
          <div className="a-nw-active">
            <span className="a-mute">Tagged</span>
            <button type="button" className="a-nw-chip a-nw-chip-on" onClick={() => setFilterTag(null)}>
              #{filterTag}<X size={13} />
            </button>
          </div>
        )}

        {/* Content */}
        {viewTab === 'drafts' && isAdmin ? (
          draftArticles.length === 0 ? (
            <div className="a-card a-empty py-14">
              <span className="a-tile a-tile-lg"><AlfieIcon glyph="doc" size={24} /></span>
              <h3 className="a-ink m-0 text-[17px] font-semibold">No drafts</h3>
              <p className="a-mute m-0 text-[14px]">All articles have been published</p>
            </div>
          ) : (
            <div className="a-nw-list">
              {draftArticles.map((article, i) => (
                <NewsRow
                  key={article.id}
                  article={article}
                  index={i}
                  draft
                  showExcerpt
                  onOpen={() => navigate(`/news/edit/${article.id}`)}
                  onEdit={(e) => { e.stopPropagation(); navigate(`/news/edit/${article.id}`); }}
                  onDelete={(e) => handleDeleteArticle(article.id, e)}
                />
              ))}
            </div>
          )
        ) : loading ? (
          <div className="a-nw-grid" aria-busy="true" aria-label="Loading articles">
            {Array.from({ length: 6 }).map((_, i) => <NewsCardSkeleton key={i} index={i} />)}
          </div>
        ) : error ? (
          <div className="a-card a-empty py-14">
            <span className="a-tile a-tile-lg a-tile-danger"><AlfieIcon glyph="warn" size={24} /></span>
            <h3 className="a-ink m-0 text-[17px] font-semibold">Couldn't load the news</h3>
            <p className="a-mute m-0 text-[14px]">{error}</p>
          </div>
        ) : sortedArticles.length === 0 ? (
          <div className="a-card a-empty py-14 px-6">
            <span className="a-tile a-tile-lg a-tile-rim"><AlfieIcon glyph={filtersActive ? 'search' : 'news'} size={24} /></span>
            <h3 className="a-ink m-0 text-[17px] font-semibold">{filtersActive ? 'No stories match' : 'No news yet'}</h3>
            <p className="a-mute m-0 text-[14px]">
              {filtersActive
                ? 'Try adjusting your search or filters'
                : 'Be the first to publish news for your club'}
            </p>
            {filtersActive ? (
              <button type="button" onClick={clearFilters} className="a-btn mt-2">Clear filters</button>
            ) : isAdmin && (
              <button onClick={handleNewArticle} className="a-btn a-btn-p mt-2">
                <Plus size={17} />
                Create first article
              </button>
            )}
          </div>
        ) : (
          <>
            {lead && (
              <section className="a-nw-top" aria-label="Top stories">
                <NewsFeature
                  article={lead}
                  onOpen={() => handleReadMore(lead.id)}
                  onTag={setFilterTag}
                  {...adminProps(lead)}
                />
                {side.length > 0 && (
                  <div className="a-nw-side">
                    <p className="a-cap a-nw-side-cap">Also new</p>
                    {side.map((article, i) => (
                      <NewsRow
                        key={article.id}
                        article={article}
                        index={i + 1}
                        size="sm"
                        onOpen={() => handleReadMore(article.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {rest.length > 0 && (
              <section className="flex flex-col gap-4" aria-label="Latest stories">
                {lead && (
                  <div className="a-nw-sec">
                    <h2 className="a-display a-ink m-0 text-[20px] font-semibold">More stories</h2>
                    <span className="a-cnt">{rest.length}</span>
                  </div>
                )}
                {viewMode === 'grid' ? (
                  <div className="a-nw-grid">
                    {rest.map((article, i) => (
                      <NewsCard
                        key={article.id}
                        article={article}
                        index={i}
                        onOpen={() => handleReadMore(article.id)}
                        onTag={setFilterTag}
                        {...adminProps(article)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="a-nw-list">
                    {rest.map((article, i) => (
                      <NewsRow
                        key={article.id}
                        article={article}
                        index={i}
                        showExcerpt
                        onOpen={() => handleReadMore(article.id)}
                        onTag={setFilterTag}
                        {...adminProps(article)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteConfirm.show}
        onClose={() => setDeleteConfirm({ show: false, articleId: null })}
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

export default NewsPage;
