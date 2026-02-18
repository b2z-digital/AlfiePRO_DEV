import React, { useState, useEffect } from 'react';
import { Newspaper, Search, Filter, Plus, Calendar, User, ChevronRight, Edit2, Trash2, AlertTriangle, X, ArrowUpDown, LayoutGrid, List } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { formatDate } from '../utils/date';
import { useNavigate } from 'react-router-dom';
import { getArticles, deleteArticle, Article } from '../utils/articleStorage';
import { useNotifications } from '../contexts/NotificationContext';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { usePermissions } from '../hooks/usePermissions';

const DEFAULT_COVER_IMAGE = '/RC-Yachts-image-custom_crop.jpg';
const FALLBACK_COVER_IMAGE = 'https://images.pexels.com/photos/273886/pexels-photo-273886.jpeg?auto=compress&cs=tinysrgb&w=800';

const getArticleImageUrl = (coverImage?: string): string => {
  if (!coverImage) return DEFAULT_COVER_IMAGE;

  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) {
    return coverImage;
  }

  if (coverImage.startsWith('/')) {
    return coverImage;
  }

  const { data } = supabase.storage
    .from('article-images')
    .getPublicUrl(coverImage);

  return data.publicUrl || DEFAULT_COVER_IMAGE;
};

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
  const [showHeaderSearch, setShowHeaderSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [pageTitle, setPageTitle] = useState('Club News');
  const [pageSubtitle, setPageSubtitle] = useState('');
  const [filterYachtClass, setFilterYachtClass] = useState<string | null>(null);
  const [availableYachtClasses, setAvailableYachtClasses] = useState<Array<{ id: string; name: string }>>([]);
  
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

        // Check if user is admin or editor
        setIsAdmin(
          currentClub?.role === 'admin' ||
          currentClub?.role === 'editor' ||
          currentOrganization?.role === 'state_admin' ||
          currentOrganization?.role === 'national_admin'
        );
      } catch (err) {
        console.error('Error fetching articles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load articles');
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, [currentClub, currentOrganization]);
  
  // Filter articles based on search term and tag
  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (article.excerpt && article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = filterTag ? article.tags?.includes(filterTag) : true;
    const matchesYachtClass = filterYachtClass ? (article as any).yacht_classes?.includes(filterYachtClass) : true;
    return matchesSearch && matchesTag && matchesYachtClass;
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
      addNotification('success', 'Article deleted successfully');
    } catch (err) {
      console.error('Error deleting article:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete article');
    } finally {
      setDeleteConfirm({ show: false, articleId: null });
    }
  };
  
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Newspaper className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{pageTitle}</h1>
              <p className="text-slate-400">
                {pageSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Expandable Search */}
            <div className="relative">
              {showHeaderSearch ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search articles..."
                    className="w-64 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setShowHeaderSearch(false);
                      setSearchTerm('');
                    }}
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowHeaderSearch(true)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Search articles"
                >
                  <Search size={20} />
                </button>
              )}
            </div>

            {/* Sort Button */}
            <button
              onClick={toggleSort}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title={`Sort by ${sortBy === 'date' ? 'date' : 'title'} (${sortOrder === 'asc' ? 'ascending' : 'descending'})`}
            >
              <ArrowUpDown size={20} />
            </button>

            {/* Filter by Yacht Class */}
            <div className="relative">
              <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={filterYachtClass || ''}
                onChange={(e) => setFilterYachtClass(e.target.value || null)}
                className="pl-9 pr-8 py-2 bg-slate-800 text-slate-200 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">All Classes</option>
                <option value="generic">Generic</option>
                {availableYachtClasses.map(yachtClass => (
                  <option key={yachtClass.id} value={yachtClass.id}>
                    {yachtClass.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter by Tag */}
            {allTags.length > 0 && (
              <div className="relative">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={filterTag || ''}
                  onChange={(e) => setFilterTag(e.target.value || null)}
                  className="pl-9 pr-8 py-2 bg-slate-800 text-slate-200 rounded-lg border border-slate-700 focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Tags</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Grid view"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="List view"
              >
                <List size={18} />
              </button>
            </div>

            {can('articles.create') && (
              <button
                onClick={handleNewArticle}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 animate-pulse"
              >
                <Plus size={18} />
                New Article
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-400">Loading articles...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-red-900/10 border border-red-900/20 rounded-lg">
            <AlertTriangle size={48} className="mx-auto mb-4 text-red-500 opacity-50" />
            <p className="text-lg font-medium text-red-400 mb-2">Error Loading Articles</p>
            <p className="text-red-300">{error}</p>
          </div>
        ) : sortedArticles.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Newspaper size={48} className="mx-auto mb-4 text-slate-600" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Articles Found</h3>
            <p className="text-slate-400">
              {searchTerm || filterTag 
                ? 'Try adjusting your search or filters' 
                : 'Be the first to publish news for your club'}
            </p>
            {isAdmin && (
              <button
                onClick={handleNewArticle}
                className="mt-4 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200"
              >
                Create First Article
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedArticles.map(article => (
              <div 
                key={article.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden transition-all hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-900/10 cursor-pointer group h-[500px] flex flex-col"
                onClick={() => handleReadMore(article.id)}
              >
                <div className="relative h-48 overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800">
                  <img
                    src={getArticleImageUrl(article.cover_image)}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_COVER_IMAGE; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent"></div>

                  {/* Source Label */}
                  {(article.source_type || article.event_name) && (
                    <div className="absolute top-3 left-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-sm ${
                        article.event_name && article.event_level === 'national'
                          ? 'bg-amber-500/90 text-white'
                          : article.event_name && article.event_level === 'state'
                          ? 'bg-emerald-500/90 text-white'
                          : article.source_type === 'national'
                          ? 'bg-amber-500/90 text-white'
                          : article.source_type === 'state'
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-blue-500/90 text-white'
                      }`}>
                        {article.event_name && article.event_level === 'national'
                          ? (article.source_name ? `${article.source_name} News` : 'National News')
                          : article.event_name && article.event_level === 'state'
                          ? (article.source_name ? `${article.source_name} News` : 'State News')
                          : article.source_type === 'national'
                          ? (article.source_name ? `${article.source_name} News` : 'National News')
                          : article.source_type === 'state'
                          ? (article.source_name ? `${article.source_name} News` : 'State News')
                          : 'Club News'}
                      </span>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex flex-wrap gap-2">
                      {article.tags?.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-blue-600/80 text-white rounded-full text-xs font-medium backdrop-blur-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterTag(tag);
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="p-6 flex flex-col flex-1">
                  <h2 className="text-xl font-bold text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                    {article.title}
                  </h2>
                  
                  <div className="flex items-center gap-4 text-sm text-slate-400 mb-4 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      {article.published_at ? formatDate(article.published_at) : 'Draft'}
                    </div>
                    <div className="flex items-center gap-1">
                      <User size={14} />
                      {article.author_name || 'Unknown Author'}
                    </div>
                    {article.event_name && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400">
                        <Calendar size={14} />
                        <span className="text-xs font-medium">{article.event_name}</span>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-slate-300 mb-4 line-clamp-4 flex-grow">
                    {article.excerpt || article.content.replace(/<[^>]*>/g, '').substring(0, 150) + '...'}
                  </p>
                  
                  <div className="flex justify-between items-center mt-auto pt-4 border-t border-slate-700/50">
                    <button 
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-1 group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-indigo-600"
                    >
                      Read more <ChevronRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </button>
                    
                    {isAdmin && (
                      <div className="flex gap-2">
                        <button 
                          className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 transition-colors"
                          onClick={(e) => handleEditArticle(article.id, e)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                          onClick={(e) => handleDeleteArticle(article.id, e)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedArticles.map(article => (
              <div
                key={article.id}
                className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden transition-all hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-900/10 cursor-pointer"
                onClick={() => handleReadMore(article.id)}
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="relative w-48 h-32 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800">
                    <img
                      src={getArticleImageUrl(article.cover_image)}
                      alt={article.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_COVER_IMAGE; }}
                    />
                    {/* Source Label for List View */}
                    {(article.source_type || article.event_name) && (
                      <div className="absolute top-2 left-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
                          article.event_name && article.event_level === 'national'
                            ? 'bg-amber-500/90 text-white'
                            : article.event_name && article.event_level === 'state'
                            ? 'bg-emerald-500/90 text-white'
                            : article.source_type === 'national'
                            ? 'bg-amber-500/90 text-white'
                            : article.source_type === 'state'
                            ? 'bg-emerald-500/90 text-white'
                            : 'bg-blue-500/90 text-white'
                        }`}>
                          {article.event_name && article.event_level === 'national'
                            ? (article.source_name || 'National')
                            : article.event_name && article.event_level === 'state'
                            ? (article.source_name || 'State')
                            : article.source_type === 'national'
                            ? (article.source_name || 'National')
                            : article.source_type === 'state'
                            ? (article.source_name || 'State')
                            : 'Club'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-white mb-2 line-clamp-1 hover:text-blue-400 transition-colors">
                          {article.title}
                        </h2>

                        <div className="flex items-center gap-4 text-sm text-slate-400 mb-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar size={14} />
                            {article.published_at ? formatDate(article.published_at) : 'Draft'}
                          </div>
                          <div className="flex items-center gap-1">
                            <User size={14} />
                            {article.author_name || 'Unknown Author'}
                          </div>
                          {article.event_name && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400">
                              <Calendar size={14} />
                              <span className="text-xs font-medium">{article.event_name}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-2">
                          {article.tags?.map(tag => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-blue-600/80 text-white rounded-full text-xs font-medium"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFilterTag(tag);
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <p className="text-slate-300 text-sm line-clamp-2">
                          {article.excerpt || article.content.replace(/<[^>]*>/g, '').substring(0, 150) + '...'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-1"
                        >
                          Read more <ChevronRight size={16} />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              className="p-2 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-700/50 transition-colors"
                              onClick={(e) => handleEditArticle(article.id, e)}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                              onClick={(e) => handleDeleteArticle(article.id, e)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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