import React, { useState, useEffect, useRef } from 'react';
import { Send, MoreHorizontal, Pencil, Trash2, X, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { socialStorage, SocialComment } from '../../utils/socialStorage';
import { useNotification } from '../../contexts/NotificationContext';

interface CommentSectionProps {
  postId: string;
  darkMode?: boolean;
  onCommentAdded?: () => void;
  onCommentDeleted?: () => void;
}

export default function CommentSection({ postId, darkMode = false, onCommentAdded, onCommentDeleted }: CommentSectionProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadComments();
  }, [postId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

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

  const handleEdit = (comment: SocialComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setMenuOpenId(null);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      const updated = await socialStorage.updateComment(commentId, editContent.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updated : c));
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      console.error('Error updating comment:', error);
      addNotification('error', 'Failed to update comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await socialStorage.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      onCommentDeleted?.();
    } catch (error) {
      console.error('Error deleting comment:', error);
      addNotification('error', 'Failed to delete comment');
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
      {comments.map(comment => {
        const isOwner = user?.id === comment.author_id;
        const isEditing = editingId === comment.id;

        return (
          <div key={comment.id} className="flex space-x-3 group">
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

            <div className="flex-1 min-w-0">
              <div className="relative">
                <div className={`rounded-2xl px-4 py-3 ${lightMode ? 'bg-gray-100' : 'bg-slate-700/40'}`}>
                  <div className="flex items-center justify-between">
                    <div className={`font-semibold text-sm ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                      {comment.author?.full_name || 'Unknown User'}
                    </div>
                    {isOwner && !isEditing && (
                      <div className="relative" ref={menuOpenId === comment.id ? menuRef : undefined}>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === comment.id ? null : comment.id)}
                          className={`opacity-0 group-hover:opacity-100 p-1 rounded-full transition-all ${lightMode ? 'hover:bg-gray-200 text-gray-400' : 'hover:bg-slate-600/50 text-slate-500'}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpenId === comment.id && (
                          <div className={`absolute right-0 top-full mt-1 z-50 rounded-xl shadow-xl border min-w-[140px] py-1 ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                            <button
                              onClick={() => handleEdit(comment)}
                              className={`w-full flex items-center space-x-2 px-4 py-2 text-sm transition-colors ${lightMode ? 'text-gray-700 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700/50'}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => { setMenuOpenId(null); handleDelete(comment.id); }}
                              className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="flex items-center space-x-2 mt-1">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(comment.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                        className={`flex-1 px-3 py-1.5 rounded-lg text-sm border-0 focus:ring-2 focus:ring-blue-500 ${lightMode ? 'bg-white' : 'bg-slate-600/50 text-white'}`}
                      />
                      <button onClick={() => handleSaveEdit(comment.id)} className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className={`p-1.5 rounded-lg transition-colors ${lightMode ? 'text-gray-400 hover:bg-gray-200' : 'text-slate-400 hover:bg-slate-600/50'}`}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p className={`text-sm mt-1 ${lightMode ? 'text-gray-800' : 'text-slate-200'}`}>{comment.content}</p>
                  )}
                </div>
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
                {comment.updated_at && comment.updated_at !== comment.created_at && (
                  <span className={`text-xs italic ${lightMode ? 'text-gray-400' : 'text-slate-600'}`}>edited</span>
                )}
              </div>
            </div>
          </div>
        );
      })}

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
