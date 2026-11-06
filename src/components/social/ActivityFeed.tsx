import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw, MessageCircle } from 'lucide-react';
import { socialStorage, SocialPost } from '../../utils/socialStorage';
import PostCard from './PostCard';

interface ActivityFeedProps {
  groupId?: string;
  privacy?: string[];
  darkMode?: boolean;
  authorId?: string;
  onAuthorClick?: (author: { id: string; name: string; avatar?: string }) => void;
}

export default function ActivityFeed({ groupId, privacy, darkMode = false, authorId, onAuthorClick }: ActivityFeedProps) {
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
          <div key={i} className="a-card animate-pulse" style={{ padding: 18 }}>
            <div className="flex items-start space-x-4">
              <div className={`w-12 h-12 rounded-full a-skel`}></div>
              <div className="flex-1 space-y-3">
                <div className={`h-4 rounded w-1/4 a-skel`}></div>
                <div className={`h-4 rounded w-3/4 a-skel`}></div>
                <div className={`h-4 rounded w-1/2 a-skel`}></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="a-card a-empty text-center" style={{ padding: 48 }}>
        <span className="a-tile mx-auto mb-3" style={{ width: 52, height: 52 }}><MessageCircle size={22} /></span>
        <h3 className="a-ink text-[16px] font-semibold mb-1">No posts yet</h3>
        <p className="a-dim text-[13.5px]">Be the first to share something with the community!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <h2 className="a-display a-ink flex-1 m-0 text-[17px] font-semibold">Recent activity</h2>
        <button
          onClick={() => loadPosts(true)}
          disabled={isRefreshing}
          className="a-btn a-btn-q" style={{ height: 34, fontSize: 13 }}
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          onUpdate={() => loadPosts(true)}
          darkMode={darkMode}
          onAuthorClick={onAuthorClick}
        />
      ))}

      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={isLoading}
          className="a-btn w-full justify-center"
        >
          {isLoading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
