import React, { useState, useEffect } from 'react';
import { Newspaper, Plus, ExternalLink, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { WidgetProps } from '../../../types/dashboard';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { NewsCover } from '../../news/NewsCard';

interface Article {
  id: string;
  title: string;
  published_at: string | null;
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
          .select('id, title, published_at, created_at, status, cover_image')
          .eq('status', 'published')
          .eq('state_association_id', orgId)
          .order('published_at', { ascending: false })
          .limit(3);
        if (error) throw error;
        setArticles(data || []);
      } else if (orgType === 'national') {
        const { data, error } = await supabase
          .from('articles')
          .select('id, title, published_at, created_at, status, cover_image')
          .eq('status', 'published')
          .eq('national_association_id', orgId)
          .order('published_at', { ascending: false })
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
          .select('id, title, published_at, created_at, status, cover_image')
          .eq('status', 'published')
          .or(orFilter)
          .order('published_at', { ascending: false })
          .limit(5);

        if (error) throw error;

        const sorted = (data || []).sort((a, b) => {
          const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
          const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
          return dateB - dateA;
        });
        setArticles(sorted.slice(0, 3));
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
    <div className={`a-widget relative rounded-2xl p-6 w-full h-full flex flex-col border backdrop-blur-sm ${themeColors.background} ${isEditMode ? 'animate-wiggle cursor-move' : ''}`}>
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

      <div className="a-widget-head flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="a-tile flex-shrink-0" style={{ width: 36, height: 36 }}><Newspaper size={19} /></span>
          <h3 className="a-display a-ink text-[19px] font-semibold truncate">
            {currentOrganization?.type === 'state' || currentOrganization?.type === 'national' ? 'Association News' : 'Latest News'}
          </h3>
        </div>
        <button
          onClick={handleCreateArticle}
          disabled={isEditMode}
          className={`a-ib flex-shrink-0 ${isEditMode ? 'pointer-events-none' : ''}`}
          style={{ width: 36, height: 36, borderRadius: 12 }}
          title="Create new article"
          aria-label="Add news"
        >
          <Plus size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-auto flex flex-col gap-2.5">
        {loading ? (
          <div className="a-dim text-center py-8 text-[13.5px]">Loading…</div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8">
            <p className="a-dim text-[13.5px] mb-4">No articles yet</p>
            <button
              onClick={handleCreateArticle}
              disabled={isEditMode}
              className={`a-btn a-btn-p ${isEditMode ? 'pointer-events-none' : ''}`}
            >
              <Plus size={16} />Write the first article
            </button>
          </div>
        ) : (
          articles.map((article) => (
            <div
              key={article.id}
              onClick={() => handleViewArticle(article.id)}
              className={`a-news group ${isEditMode ? 'pointer-events-none' : 'cursor-pointer'}`}
            >
              <div className="a-news-img">
                <NewsCover article={article as any} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="a-ink m-0 text-[14px] font-semibold leading-[1.35] line-clamp-2">{article.title}</p>
                <p className="a-dim m-0 mt-[5px] flex items-center gap-1.5 text-[12.5px]">
                  <Clock size={12} />
                  {formatDate(article.published_at || article.created_at)}
                  {article.status === 'published' ? (
                    <span className="a-txt-g ml-1.5">Published</span>
                  ) : (
                    <span className="a-txt-a ml-1.5">Draft</span>
                  )}
                </p>
              </div>
              <ExternalLink size={15} className="a-dim flex-shrink-0 mt-0.5" />
            </div>
          ))
        )}
      </div>

    </div>
  );
};
