import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { Search, Calendar, ChevronRight } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { GoogleAnalytics } from '../GoogleAnalytics';

interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image?: string;
  published_at: string;
  author: string;
  tags?: string[];
}

const DEFAULT_COVER_IMAGE = 'https://images.pexels.com/photos/273886/pexels-photo-273886.jpeg?auto=compress&cs=tinysrgb&w=800';

const getClubInitials = (clubName: string): string => {
  return clubName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
};

const getArticleImageUrl = (coverImage?: string): string => {
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

export const PublicNewsPage: React.FC = () => {
  const { clubId, buildPublicUrl } = usePublicNavigation();
  const [club, setClub] = useState<Club | null>(null);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    if (clubId) {
      loadClubData();
      loadArticles();
    }
  }, [clubId]);

  useEffect(() => {
    filterArticles();
  }, [articles, searchTerm, selectedTag]);

  const loadClubData = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (error) throw error;
      if (data) setClub(data as any);
    } catch (error) {
      console.error('Error loading club:', error);
    }
  };

  const loadArticles = async () => {
    try {
      setLoading(true);

      let articleFilter = `club_id.eq.${clubId}`;

      const { data: clubDetail } = await supabase
        .from('clubs')
        .select('state_association_id')
        .eq('id', clubId)
        .maybeSingle();

      if (clubDetail?.state_association_id) {
        const stateId = clubDetail.state_association_id;
        articleFilter += `,state_association_id.eq.${stateId}`;
        const { data: stateAssoc } = await supabase
          .from('state_associations')
          .select('national_association_id')
          .eq('id', stateId)
          .maybeSingle();
        if (stateAssoc?.national_association_id) {
          articleFilter += `,national_association_id.eq.${stateAssoc.national_association_id}`;
        }
      }

      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .or(articleFilter)
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (data) {
        setArticles(data as any);

        const tags = new Set<string>();
        data.forEach((article: any) => {
          article.tags?.forEach((tag: string) => tags.add(tag));
        });
        setAllTags(Array.from(tags));
      }
    } catch (error) {
      console.error('Error loading articles:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterArticles = () => {
    let filtered = [...articles];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(term) ||
        article.excerpt?.toLowerCase().includes(term) ||
        article.content?.toLowerCase().includes(term)
      );
    }

    if (selectedTag) {
      filtered = filtered.filter(article =>
        article.tags?.includes(selectedTag)
      );
    }

    setFilteredArticles(filtered);
  };

  const clubInitials = club?.name ? getClubInitials(club.name) : '';
  const clubName = club?.name || 'Loading...';

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="news" />

      <div className="pt-20">
        {/* Hero Section */}
        <div className="relative h-64 bg-gradient-to-br from-blue-900 to-blue-700">
        <div className="absolute inset-0 bg-black/30"></div>
        <div className="relative h-full flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-wider">LATEST NEWS</h1>
            <p className="text-gray-200 text-lg">Stay up to date with club news and announcements</p>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedTag(null)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedTag === null ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>All</button>
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setSelectedTag(tag === selectedTag ? null : tag)} className={`px-4 py-2 rounded text-sm font-medium transition-colors ${selectedTag === tag ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'}`}>{tag}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading articles...</p>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">{searchTerm || selectedTag ? 'No articles found matching your criteria.' : 'No articles published yet.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredArticles.map((article) => (
              <article key={article.id} className="bg-white rounded-sm overflow-hidden shadow-md hover:shadow-xl transition-shadow group">
                <div className="relative h-56 overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800">
                  <img src={getArticleImageUrl(article.cover_image)} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_COVER_IMAGE; }} />
                </div>
                <div className="p-6">
                  <div className="flex items-center text-xs text-gray-500 mb-3">
                    <Calendar className="h-4 w-4 mr-1" />
                    {formatDate(article.published_at)}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3 uppercase tracking-wide line-clamp-2 group-hover:text-gray-700 transition-colors">{article.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">{article.excerpt}</p>
                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {article.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                  <Link to={buildPublicUrl(`/news/${article.id}`)} className="inline-flex items-center text-gray-900 font-semibold text-sm hover:text-gray-700 transition-colors uppercase tracking-wider">
                    Read More
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

        <PublicFooter club={club} clubId={clubId} />
      </div>
    </div>
  );
};
