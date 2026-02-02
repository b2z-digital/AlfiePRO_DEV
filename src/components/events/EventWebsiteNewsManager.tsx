import React, { useState, useEffect } from 'react';
import { Newspaper, Search, Plus, Calendar, User, ChevronRight, Edit2, Trash2, X, ArrowUpDown, LayoutGrid, List, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

const DEFAULT_COVER_IMAGE = '/RC-Yachts-image-custom_crop.jpg';

interface Article {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  author_id: string | null;
  custom_author_name: string | null;
  published_at: string | null;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  event_website_id: string | null;
  tags?: string[];
  author?: {
    first_name: string | null;
    last_name: string | null;
  };
}

interface EventWebsiteNewsManagerProps {
  websiteId: string;
  eventId: string;
}

export const EventWebsiteNewsManager: React.FC<EventWebsiteNewsManagerProps> = ({
  websiteId,
  eventId
}) => {
  const { currentClub, user } = useAuth();
  const navigate = useNavigate();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const { addNotification } = useNotifications();
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; articleId: string | null }>({
    show: false,
    articleId: null
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchArticles();
  }, [websiteId]);

  const fetchArticles = async () => {
    if (!websiteId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch articles for this event - without author join since FK doesn't exist
      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('*')
        .eq('event_website_id', websiteId)
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (articlesError) throw articlesError;

      // Fetch author details and tags for each article
      const articlesWithDetails = await Promise.all(
        (articlesData || []).map(async (article) => {
          // Fetch author if author_id exists
          let authorData = null;
          if (article.author_id) {
            const { data } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', article.author_id)
              .maybeSingle();
            authorData = data;
          }

          // Fetch tags
          const { data: tagsData } = await supabase
            .from('article_tags')
            .select('tag')
            .eq('article_id', article.id);

          return {
            ...article,
            author: authorData,
            tags: tagsData?.map(t => t.tag) || []
          };
        })
      );

      setArticles(articlesWithDetails);

      // Extract all unique tags
      const tags = new Set<string>();
      articlesWithDetails.forEach(article => {
        article.tags?.forEach(tag => tags.add(tag));
      });
      setAllTags(Array.from(tags));

    } catch (err) {
      console.error('Error fetching articles:', err);
      addNotification('error', 'Failed to load articles');
    } finally {
      setLoading(false);
    }
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (article.excerpt && article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTag = filterTag ? article.tags?.includes(filterTag) : true;
    return matchesSearch && matchesTag;
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

  const handleCreateArticle = () => {
    // Navigate to article editor with event context
    navigate(`/news/new?eventWebsiteId=${websiteId}&eventId=${eventId}`);
  };

  const handleEditArticle = (articleId: string) => {
    // Navigate to article editor
    navigate(`/news/edit/${articleId}`);
  };

  const handleDeleteArticle = async (articleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm({ show: true, articleId });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.articleId) return;

    try {
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', deleteConfirm.articleId);

      if (error) throw error;

      setArticles(articles.filter(article => article.id !== deleteConfirm.articleId));
      addNotification('Article deleted successfully', 'success');
    } catch (err) {
      console.error('Error deleting article:', err);
      addNotification('Failed to delete article', 'error');
    } finally {
      setDeleteConfirm({ show: false, articleId: null });
    }
  };

  const getAuthorName = (article: Article): string => {
    if (article.custom_author_name) return article.custom_author_name;
    if (article.author?.first_name || article.author?.last_name) {
      return `${article.author.first_name || ''} ${article.author.last_name || ''}`.trim();
    }
    return 'Unknown Author';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-xl">
              <Newspaper className="w-6 h-6 text-cyan-400" />
            </div>
            News & Updates
          </h3>
          <p className="text-sm text-slate-400 mt-2">
            {articles.length} {articles.length === 1 ? 'article' : 'articles'} published
          </p>
        </div>

        <button
          onClick={handleCreateArticle}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:from-cyan-600 hover:to-blue-600 transition-all"
        >
          <Plus size={18} />
          New Article
        </button>
      </div>

      {/* Search and Filters */}
      {articles.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          <button
            onClick={toggleSort}
            className="flex items-center gap-2 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700/50 transition-colors"
          >
            <ArrowUpDown size={18} />
            <span className="text-sm">
              {sortBy === 'date' ? 'Date' : 'Title'}
              {sortOrder === 'asc' ? ' ↑' : ' ↓'}
            </span>
          </button>

          <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-400">Filter by tag:</span>
          <button
            onClick={() => setFilterTag(null)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              filterTag === null
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-700/50'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                filterTag === tag
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:bg-slate-700/50'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Articles Grid/List */}
      {sortedArticles.length === 0 ? (
        <div className="relative overflow-hidden bg-slate-800/50 backdrop-blur-sm rounded-2xl p-16 border border-slate-700/50">
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 mb-6">
              <Newspaper className="w-10 h-10 text-cyan-400" />
            </div>
            <h4 className="text-2xl font-bold text-white mb-3">
              {searchTerm || filterTag ? 'No Articles Found' : 'No Articles Yet'}
            </h4>
            <p className="text-slate-400 max-w-md mx-auto">
              {searchTerm || filterTag
                ? 'Try adjusting your search or filter'
                : 'Create your first article to share news and updates about this event'}
            </p>
          </div>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {sortedArticles.map((article) => (
            <div
              key={article.id}
              onClick={() => handleEditArticle(article.id)}
              className={`group bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden hover:border-cyan-500/30 transition-all cursor-pointer ${
                viewMode === 'list' ? 'flex' : ''
              }`}
            >
              {/* Cover Image */}
              <div className={`relative overflow-hidden bg-slate-900 ${
                viewMode === 'list' ? 'w-48 flex-shrink-0' : 'h-48'
              }`}>
                <img
                  src={article.cover_image || DEFAULT_COVER_IMAGE}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-60" />

                {/* Status Badge */}
                <div className="absolute top-3 left-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    article.status === 'published'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {article.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDeleteArticle(article.id, e)}
                    className="p-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 flex-1">
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors line-clamp-2">
                  {article.title}
                </h3>

                {article.excerpt && (
                  <p className="text-slate-400 text-sm mb-4 line-clamp-2">
                    {article.excerpt}
                  </p>
                )}

                {/* Tags */}
                {article.tags && article.tags.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    {article.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-cyan-500/10 text-cyan-400 rounded text-xs border border-cyan-500/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Meta Info */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    <span>{getAuthorName(article)}</span>
                  </div>
                  {article.published_at && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      <span>{formatDate(article.published_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <ConfirmationModal
          isOpen={deleteConfirm.show}
          onClose={() => setDeleteConfirm({ show: false, articleId: null })}
          onConfirm={handleConfirmDelete}
          title="Delete Article"
          message="Are you sure you want to delete this article? This action cannot be undone."
          confirmText="Delete"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
        />
      )}
    </div>
  );
};
