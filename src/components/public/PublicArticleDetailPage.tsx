import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, User, Tag } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';

const DEFAULT_COVER_IMAGE = 'https://images.pexels.com/photos/273886/pexels-photo-273886.jpeg?auto=compress&cs=tinysrgb&w=800';

const getArticleImageUrl = (coverImage?: string | null): string => {
  if (!coverImage || coverImage === '/RC-Yachts-image-custom_crop.jpg') return DEFAULT_COVER_IMAGE;

  if (coverImage.startsWith('http://') || coverImage.startsWith('https://')) {
    return coverImage;
  }

  if (coverImage.startsWith('/')) {
    return DEFAULT_COVER_IMAGE;
  }

  const { data } = supabase.storage
    .from('article-images')
    .getPublicUrl(coverImage);

  return data.publicUrl || DEFAULT_COVER_IMAGE;
};

interface Article {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  cover_image: string | null;
  published_at: string;
  author_id: string;
  club_id: string;
  status: string;
  tags?: string[];
}

export const PublicArticleDetailPage: React.FC = () => {
  const { clubId: paramClubId, articleId } = useParams<{ clubId: string; articleId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [authorName, setAuthorName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clubId && articleId) {
      loadData();
    }
  }, [clubId, articleId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [clubRes, articleRes] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
        supabase
          .from('articles')
          .select('*')
          .eq('id', articleId)
          .eq('status', 'published')
          .maybeSingle()
      ]);

      if (clubRes.error) throw clubRes.error;
      if (articleRes.error) throw articleRes.error;

      if (!articleRes.data) {
        setError('Article not found or not published');
        setLoading(false);
        return;
      }

      setClub(clubRes.data as any);
      setArticle(articleRes.data as any);

      if (articleRes.data.author_id) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', articleRes.data.author_id)
          .maybeSingle();

        if (profileData?.full_name) {
          setAuthorName(profileData.full_name);
        }
      }
    } catch (err) {
      console.error('Error loading article:', err);
      setError('Failed to load article');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicHeader club={club} activePage="news" />
        <div className="pt-20 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
              <div className="h-64 bg-gray-200 rounded mb-8"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
        <PublicFooter club={club} clubId={clubId} />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="min-h-screen bg-white">
        <PublicHeader club={club} activePage="news" />
        <div className="pt-20 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Article Not Found</h2>
              <p className="text-gray-600 mb-6">{error || 'The article you are looking for could not be found.'}</p>
              <a
                href={`/club/${clubId}/public/news`}
                className="inline-block px-6 py-3 bg-gray-900 text-white font-semibold rounded hover:bg-gray-800 transition-colors uppercase tracking-wider"
              >
                Back to News
              </a>
            </div>
          </div>
        </div>
        <PublicFooter club={club} clubId={clubId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="news" />

      <div className="pt-20">
        <div className="bg-gray-900 py-12 px-6">
          <div className="max-w-4xl mx-auto">
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {article.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-blue-600/20 text-blue-300 rounded-full text-xs font-medium flex items-center gap-1 border border-blue-500/30"
                  >
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-wide">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                {formatDate(article.published_at)}
              </div>
              {authorName && (
                <div className="flex items-center gap-2">
                  <User size={16} />
                  {authorName}
                </div>
              )}
            </div>
          </div>
        </div>

        {article.cover_image && (
          <div className="w-full bg-gradient-to-br from-slate-700 to-slate-800">
            <img
              src={getArticleImageUrl(article.cover_image)}
              alt={article.title}
              className="w-full h-auto max-h-[600px] object-contain bg-gray-100"
              onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_COVER_IMAGE; }}
            />
          </div>
        )}

        <div className="max-w-4xl mx-auto px-6 py-12">
          {article.excerpt && (
            <p className="text-xl text-gray-700 mb-8 leading-relaxed font-medium">
              {article.excerpt}
            </p>
          )}

          <div
            className="prose prose-lg max-w-none article-content text-gray-900"
            style={{
              color: '#111827',
            }}
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </div>
      </div>

      <PublicFooter club={club} clubId={clubId} />
    </div>
  );
};
