import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, User, Edit2, Trash2, Tag, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/date';
import { getArticleById, deleteArticle } from '../utils/articleStorage';
import { ConfirmationModal } from '../components/ConfirmationModal';

const DEFAULT_COVER_IMAGE = '/alfie_app_logo.svg';

const ArticleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const [article, setArticle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
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
  
  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-slate-700 rounded w-1/2 mb-8"></div>
            <div className="h-64 bg-slate-700 rounded mb-8"></div>
            <div className="space-y-3">
              <div className="h-4 bg-slate-700 rounded"></div>
              <div className="h-4 bg-slate-700 rounded"></div>
              <div className="h-4 bg-slate-700 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || !article) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-900/10 border border-red-900/20 rounded-lg p-6 text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-red-500 opacity-50" />
            <h2 className="text-xl font-bold text-white mb-2">Error</h2>
            <p className="text-red-300">{error || 'Article not found'}</p>
            <button
              onClick={() => navigate('/news')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to News
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/news')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-slate-300 hover:text-slate-100 bg-slate-800/30 hover:bg-slate-700/40 border border-slate-700/50 mb-8"
        >
          <ArrowLeft size={16} />
          Back to News
        </button>
        
        <article className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden shadow-xl shadow-blue-900/5">
          <div className="w-full h-80 md:h-96 relative">
            <img
              src={article.cover_image || DEFAULT_COVER_IMAGE}
              alt={article.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_COVER_IMAGE; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent"></div>

            <div className="absolute bottom-0 left-0 right-0 p-8">
              <div className="flex flex-wrap gap-2 mb-4">
                {article.tags?.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-blue-600/80 text-white rounded-full text-xs font-medium backdrop-blur-sm flex items-center gap-1"
                  >
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
              </div>

              <h1 className="text-4xl font-bold text-white mb-4 drop-shadow-md">{article.title}</h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  {article.published_at ? formatDate(article.published_at) : 'Draft'}
                </div>
                <div className="flex items-center gap-1">
                  <User size={14} />
                  {article.author_name || 'Unknown Author'}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div 
              className="prose prose-invert max-w-none text-white article-content"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
            
            {isAdmin && (
              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-700/50">
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-700 text-white hover:bg-slate-600"
                  onClick={handleEditArticle}
                >
                  <Edit2 size={16} className="inline mr-2" />
                  Edit Article
                </button>
                <button 
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30"
                  onClick={handleDeleteArticle}
                >
                  <Trash2 size={16} className="inline mr-2" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </article>
      </div>

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