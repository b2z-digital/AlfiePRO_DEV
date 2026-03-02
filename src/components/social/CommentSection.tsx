import React, { useState, useEffect } from 'react';
import { Send, Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { socialStorage, SocialComment } from '../../utils/socialStorage';
import { useNotification } from '../../contexts/NotificationContext';

interface CommentSectionProps {
  postId: string;
  darkMode?: boolean;
  onCommentAdded?: () => void;
}

export default function CommentSection({ postId, darkMode = false, onCommentAdded }: CommentSectionProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadComments();
  }, [postId]);

  const loadComments = async () => {
    try {
      const data = await socialStorage.getComments(postId);
      setComments(data || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const comment = await socialStorage.createComment({
        post_id: postId,
        content: newComment.trim()
      });

      setComments(prev => [...prev, comment]);
      setNewComment('');
      onCommentAdded?.();
    } catch (error) {
      console.error('Error creating comment:', error);
      addNotification('error', 'Failed to post comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className={`h-12 rounded ${lightMode ? 'bg-gray-200' : 'bg-slate-700/30'}`}></div>
          <div className={`h-12 rounded ${lightMode ? 'bg-gray-200' : 'bg-slate-700/30'}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {comments.map(comment => (
        <div key={comment.id} className="flex space-x-3">
          {comment.author?.avatar_url ? (
            <img
              src={comment.author.avatar_url}
              alt={comment.author.full_name}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-lg"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg">
              {comment.author?.full_name?.charAt(0) || 'U'}
            </div>
          )}

          <div className="flex-1">
            <div className={`rounded-2xl px-4 py-3 ${lightMode ? 'bg-gray-100' : 'bg-slate-700/40'}`}>
              <div className={`font-semibold text-sm ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                {comment.author?.full_name || 'Unknown User'}
              </div>
              <p className={`text-sm mt-1 ${lightMode ? 'text-gray-800' : 'text-slate-200'}`}>{comment.content}</p>
            </div>

            <div className="flex items-center space-x-4 mt-2 px-4">
              <button className={`text-xs font-medium transition-colors ${lightMode ? 'text-gray-500 hover:text-red-600' : 'text-slate-400 hover:text-red-400'}`}>
                Like
              </button>
              <button className={`text-xs font-medium transition-colors ${lightMode ? 'text-gray-500 hover:text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}>
                Reply
              </button>
              <span className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-500'}`}>
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
      ))}

      <form onSubmit={handleSubmit} className="flex items-start space-x-3 pt-2">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg">
          {user?.email?.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 flex items-center space-x-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className={`flex-1 px-4 py-2.5 rounded-full border-0 focus:ring-2 focus:ring-blue-500 transition-all ${lightMode ? 'bg-gray-100' : 'bg-slate-700/40 text-white placeholder-slate-400'}`}
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            className="p-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
