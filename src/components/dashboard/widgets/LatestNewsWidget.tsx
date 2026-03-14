import React, { useState, useEffect } from 'react';
import { Newspaper, Plus, ExternalLink, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';

interface Article {
  id: string;
  title: string;
  created_at: string;
  status: 'draft' | 'published';
  cover_image: string | null;
}

export const LatestNewsWidget: React.FC<WidgetProps> = ({ widgetId, isEditMode, onRemove, colorTheme = 'default' }) => {
  const navigate = useNavigate();
  const { currentClub, currentOrganization } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const themeColors = useWidgetTheme(colorTheme);

  useEffect(() => {
    loadArticles();
  }, [currentClub, currentOrganization]);

  const loadArticles = async () => {
    const orgId = currentOrganization?.id;
    const orgType = currentOrganization?.type;
    const clubId = currentClub?.clubId;

    if (!orgId && !clubId) {
      setLoading(false);
      return;
    }

    try {
      if (orgType === 'state') {
        const { data, error } = await supabase
          .from('articles')
          .select('id, title, created_at, status, cover_image')
          .eq('status', 'published')
          .eq('state_association_id', orgId)
          .order('created_at', { ascending: false })
          .limit(3);
        if (error) throw error;
        setArticles(data || []);
      } else if (orgType === 'national') {
        const { data, error } = await supabase
          .from('articles')
          .select('id, title, created_at, status, cover_image')
          .eq('status', 'published')
          .eq('national_association_id', orgId)
          .order('created_at', { ascending: false })
          .limit(3);
        if (error) throw error;
        setArticles(data || []);
      } else {
        const effectiveClubId = orgId || clubId;
        if (!effectiveClubId) { setLoading(false); return; }

        const { data: clubData } = await supabase
          .from('clubs')
          .select('state_association_id')
          .eq('id', effectiveClubId)
          .maybeSingle();

        const stateAssocId = clubData?.state_association_id;

        let nationalAssocId: string | null = null;
        if (stateAssocId) {
          const { data: stateData } = await supabase
            .from('state_associations')
            .select('national_association_id')
            .eq('id', stateAssocId)
            .maybeSingle();
          nationalAssocId = stateData?.national_association_id ?? null;
        }

        let orFilter = `club_id.eq.${effectiveClubId}`;
        if (stateAssocId) orFilter += `,state_association_id.eq.${stateAssocId}`;
        if (nationalAssocId) orFilter += `,national_association_id.eq.${nationalAssocId}`;

        const { data, error } = await supabase
          .from('articles')
          .select('id, title, created_at, status, cover_image')
          .eq('status', 'published')
          .or(orFilter)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setArticles((data || []).slice(0, 3));
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateArticle = () => {
    if (!isEditMode) navigate('/news');
  };

  const handleViewArticle = (articleId: string) => {
    if (!isEditMode) navigate(`/news/${articleId}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      if (diffInHours < 1) return 'Just now';
      return `${diffInHours}h ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`relative rounded-2xl p-6 w-full h-full flex flex-col border backdrop-blur-sm ${themeColors.background} ${isEditMode ? 'animate-wiggle cursor-move' : ''}`}>
      {isEditMode && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="text-amber-400" size={20} />
          <h2 className="text-lg font-semibold text-white">
            {currentOrganization?.type === 'state' || currentOrganization?.type === 'national' ? 'Association News' : 'Latest News'}
          </h2>
        </div>
        <button
          onClick={handleCreateArticle}
          disabled={isEditMode}
          className={`p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded-lg transition-colors ${isEditMode ? 'pointer-events-none' : ''}`}
          title="Create new article"
        >
          <Plus size={16} className="text-amber-400" />
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400 mb-4">No articles yet</p>
            <button
              onClick={handleCreateArticle}
              disabled={isEditMode}
              className={`px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors ${isEditMode ? 'pointer-events-none' : ''}`}
            >
              Create First Article
            </button>
          </div>
        ) : (
          articles.map((article) => (
            <div
              key={article.id}
              onClick={() => handleViewArticle(article.id)}
              className={`p-3 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl transition-all group ${isEditMode ? 'pointer-events-none' : 'cursor-pointer'}`}
            >
              <div className="flex items-center gap-3">
                {article.cover_image && (
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-700">
                    <img
                      src={article.cover_image}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-white text-sm leading-snug line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {article.title}
                    </div>
                    <ExternalLink size={14} className="text-slate-400 group-hover:text-amber-400 transition-colors flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(article.created_at)}
                    </span>
                    {article.status === 'published' ? (
                      <span className="text-green-400">Published</span>
                    ) : (
                      <span className="text-yellow-400">Draft</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
