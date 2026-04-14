import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { socialStorage, SocialPost } from '../../utils/socialStorage';
import PostCard from './PostCard';

interface ActivityFeedProps {
  groupId?: string;
  privacy?: string[];
  darkMode?: boolean;
  authorId?: string;
}

export default function ActivityFeed({ groupId, privacy, darkMode = false, authorId }: ActivityFeedProps) {
  const lightMode = !darkMode;
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const loadIdRef = useRef(0);

  const stablePrivacy = useMemo(() => privacy || ['public'], [privacy?.join(',')]);

  const loadPosts = useCallback(async (refresh = false, pageNum?: number) => {
    const thisLoadId = ++loadIdRef.current;

    if (refresh) {
      setPosts([]);
      setPage(0);
      setIsLoading(true);
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const offset = refresh ? 0 : (pageNum ?? 0) * 20;
      const data = await socialStorage.getFeed({
        limit: 20,
        offset,
        groupId,
        privacy: stablePrivacy,
        authorId,
      });

      if (thisLoadId !== loadIdRef.current) return;

      if (refresh) {
        setPosts(data || []);
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newPosts = (data || []).filter(p => !existingIds.has(p.id));
          return [...prev, ...newPosts];
        });
      }

      setHasMore((data || []).length === 20);
    } catch (error) {
      if (thisLoadId !== loadIdRef.current) return;
      console.error('Error loading posts:', error);
    } finally {
      if (thisLoadId === loadIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [groupId, stablePrivacy, authorId]);

  useEffect(() => {
    loadPosts(true);
  }, [loadPosts]);

  useEffect(() => {
    const unsubscribe = socialStorage.subscribeToFeed(async (payload) => {
      if (payload.eventType === 'INSERT' && payload.new?.id) {
        if (posts.some(p => p.id === payload.new.id)) return;
        try {
          const fullPost = await socialStorage.getPostById(payload.new.id);
          if (fullPost) {
            setPosts(prev => {
              if (prev.some(p => p.id === fullPost.id)) return prev;
              return [fullPost, ...prev];
            });
          }
        } catch (err) {
          console.error('Error fetching new post:', err);
        }
      } else if (payload.eventType === 'DELETE') {
        setPosts(prev => prev.filter(p => p.id !== payload.old?.id));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadPosts(false, nextPage);
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className={`rounded-xl p-6 animate-pulse border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
            <div className="flex items-start space-x-4">
              <div className={`w-12 h-12 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-slate-700/50'}`}></div>
              <div className="flex-1 space-y-3">
                <div className={`h-4 rounded w-1/4 ${lightMode ? 'bg-gray-200' : 'bg-slate-700/50'}`}></div>
                <div className={`h-4 rounded w-3/4 ${lightMode ? 'bg-gray-200' : 'bg-slate-700/50'}`}></div>
                <div className={`h-4 rounded w-1/2 ${lightMode ? 'bg-gray-200' : 'bg-slate-700/50'}`}></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={`rounded-xl p-12 text-center border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
        <div className={`mb-4 ${lightMode ? 'text-gray-400' : 'text-slate-500'}`}>
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className={`text-lg font-medium mb-2 ${lightMode ? 'text-gray-900' : 'text-white'}`}>No posts yet</h3>
        <p className={lightMode ? 'text-gray-500' : 'text-slate-400'}>Be the first to share something with the community!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Recent Activity</h2>
        <button
          onClick={() => loadPosts(true)}
          disabled={isRefreshing}
          className={`flex items-center space-x-2 px-4 py-2 text-sm rounded-xl transition-all ${lightMode ? 'text-gray-600 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700/50'}`}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          onUpdate={() => loadPosts(true)}
          darkMode={darkMode}
        />
      ))}

      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={isLoading}
          className={`w-full py-3 rounded-xl transition-all font-medium border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50 hover:shadow-xl text-gray-700' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl text-white hover:border-slate-600/50'}`}
        >
          {isLoading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
