import React, { useState, useEffect, useRef } from 'react';
import { Send, MoveHorizontal as MoreHorizontal, Pencil, Trash2, X, Check } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
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
    <div className="flex flex-col gap-3" style={{ padding: '12px 14px 14px' }}>
      {comments.map(comment => {
        const isOwner = user?.id === comment.author_id;
        const isEditing = editingId === comment.id;

        return (
          <div key={comment.id} className="flex gap-2.5 group">
            <AAvatar url={comment.author?.avatar_url} first={(comment.author?.full_name || 'U').split(' ')[0]} last={(comment.author?.full_name || '').split(' ').slice(1).join(' ')} size={32} />

            <div className="flex-1 min-w-0">
              <div className="relative">
                <div className="a-cmt">
                  <div className="flex items-center justify-between">
                    <div className="a-ink font-semibold text-[13.5px]">
                      {comment.author?.full_name || 'Unknown User'}
                    </div>
                    {isOwner && !isEditing && (
                      <div className="relative" ref={menuOpenId === comment.id ? menuRef : undefined}>
                        <button
                          onClick={() => setMenuOpenId(menuOpenId === comment.id ? null : comment.id)}
                          className="a-dim opacity-0 group-hover:opacity-100 p-1 rounded-full transition-all" aria-label="Comment options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {menuOpenId === comment.id && (
                          <div className="a-pop absolute right-0 top-full mt-1 z-50 min-w-[150px]">
                            <button
                              onClick={() => handleEdit(comment)}
                              className="a-pop-item w-full"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => { setMenuOpenId(null); handleDelete(comment.id); }}
                              className="a-pop-item a-txt-r w-full"
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
                        className="a-inp flex-1" style={{ height: 34 }}
                      />
                      <button onClick={() => handleSaveEdit(comment.id)} className="a-ib a-txt-b" style={{ width: 32, height: 32 }} aria-label="Save">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="a-ib" style={{ width: 32, height: 32 }} aria-label="Cancel">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="a-ink text-[14px] mt-0.5 m-0">{comment.content}</p>
                  )}
                </div>
              </div>

              <div className="a-dim flex items-center gap-3.5 mt-1 px-3 text-[12px]">
                <button className="font-semibold hover:underline">
                  Like
                </button>
                <button className="font-semibold hover:underline">
                  Reply
                </button>
                <span>
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </span>
                {comment.updated_at && comment.updated_at !== comment.created_at && (
                  <span className="italic">edited</span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        <AAvatar first={user?.email?.charAt(0)} size={32} />
        <div className="a-cmt-field flex-1">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment…"
            disabled={isSubmitting}
          />
          <button
            type="submit"
            disabled={isSubmitting || !newComment.trim()}
            className="a-ib a-txt-b disabled:opacity-40"
            style={{ width: 30, height: 30 }}
            aria-label="Send comment"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
