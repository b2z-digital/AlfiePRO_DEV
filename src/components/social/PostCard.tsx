import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal, Globe, Users, Lock, Trash2, Flag, MapPin, Smile, ExternalLink, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SocialPost } from '../../utils/socialStorage';
import { socialStorage } from '../../utils/socialStorage';
import CommentSection from './CommentSection';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import ReportPostModal from './ReportPostModal';

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

interface PostCardProps {
  post: SocialPost;
  onUpdate?: () => void;
  darkMode?: boolean;
}

export default function PostCard({ post, onUpdate, darkMode = false }: PostCardProps) {
  const lightMode = !darkMode;
  const { addNotification } = useNotification();
  const { user, currentClub, isSuperAdmin, isStateOrgAdmin } = useAuth();
  const [showComments, setShowComments] = useState(true);
  const [isLiked, setIsLiked] = useState(!!post.user_reaction);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count || 0);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const isPostOwner = user?.id === post.author_id;
  const isClubAdmin = currentClub?.role === 'admin' || currentClub?.role === 'super_admin';
  const canDelete = isPostOwner || isClubAdmin || isSuperAdmin || isStateOrgAdmin;

  const handleLike = async () => {
    try {
      await socialStorage.toggleReaction(post.id, 'like');
      setIsLiked(!isLiked);
      setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDeleteClick = () => {
    setShowMenu(false);
    setShowDeleteConfirmation(true);
  };

  const handleDelete = async () => {
    try {
      if (isPostOwner) {
        await socialStorage.deletePost(post.id);
      } else {
        await socialStorage.deletePostAsAdmin(post.id);
      }
      setShowDeleteConfirmation(false);
      addNotification('Post deleted successfully', 'success');
      onUpdate?.();
    } catch (error: any) {
      console.error('Error deleting post:', error);
      const msg = error?.message?.includes('permission')
        ? 'You do not have permission to delete this post'
        : 'Failed to delete post. Please try again.';
      addNotification(msg, 'error');
      setShowDeleteConfirmation(false);
    }
  };

  const handleReportClick = () => {
    setShowMenu(false);
    setShowReportModal(true);
  };

  const getPrivacyIcon = () => {
    switch (post.privacy) {
      case 'public':
        return <Globe className="w-3 h-3" />;
      case 'friends':
        return <Users className="w-3 h-3" />;
      case 'group':
        return <Lock className="w-3 h-3" />;
      default:
        return <Globe className="w-3 h-3" />;
    }
  };

  return (
    <div className={`rounded-xl border ${lightMode ? 'bg-white/80 backdrop-blur-md shadow-lg border-slate-200/50' : 'bg-slate-800/60 backdrop-blur-md border-slate-700/50 shadow-xl'}`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            {post.author?.avatar_url ? (
              <img
                src={post.author.avatar_url}
                alt={post.author.full_name}
                className="w-12 h-12 rounded-full object-cover shadow-lg"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg">
                {post.author?.full_name?.charAt(0) || 'U'}
              </div>
            )}

            <div className="flex-1">
              <div className={`font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                {post.author?.full_name || 'Unknown User'}
              </div>
              <div className={`flex items-center space-x-2 text-sm ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
                <span>
                  {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                </span>
                <span>•</span>
                <div className="flex items-center space-x-1">
                  {getPrivacyIcon()}
                  <span className="capitalize">{post.privacy}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`p-2 rounded-full transition-colors ${lightMode ? 'hover:bg-gray-100' : 'hover:bg-slate-700/50'}`}
            >
              <MoreHorizontal className={`w-5 h-5 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`} />
            </button>

            {showMenu && (
              <div className={`absolute right-0 mt-2 w-48 rounded-xl shadow-xl border z-10 ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                {canDelete && (
                  <button
                    onClick={handleDeleteClick}
                    className={`w-full flex items-center space-x-2 px-4 py-3 text-red-600 first:rounded-t-xl last:rounded-b-xl transition-colors ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/50'}`}
                  >
                    {isPostOwner ? (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Post</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-4 h-4" />
                        <span>Delete Post (Admin)</span>
                      </>
                    )}
                  </button>
                )}
                {!isPostOwner && (
                  <button
                    onClick={handleReportClick}
                    className={`w-full flex items-center space-x-2 px-4 py-3 first:rounded-t-xl last:rounded-b-xl transition-colors ${lightMode ? 'text-gray-700 hover:bg-gray-50' : 'text-slate-300 hover:bg-slate-700/50'}`}
                  >
                    <Flag className="w-4 h-4" />
                    <span>Report Post</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <p className={`whitespace-pre-wrap ${lightMode ? 'text-gray-800' : 'text-slate-200'}`}>{post.content}</p>

          {/* Display location and feeling */}
          {(post.location || post.feeling) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {post.location && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${lightMode ? 'bg-orange-50 text-orange-700' : 'bg-orange-900/30 text-orange-300'}`}>
                  <MapPin size={14} />
                  <span>{post.location}</span>
                </div>
              )}
              {post.feeling && (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${lightMode ? 'bg-yellow-50 text-yellow-700' : 'bg-yellow-900/30 text-yellow-300'}`}>
                  <Smile size={14} />
                  <span>feeling {post.feeling}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Display link preview */}
        {post.link_url && (
          <a
            href={post.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-4 block rounded-xl border overflow-hidden transition-all hover:shadow-lg ${lightMode ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'}`}
          >
            <div className="p-4">
              <div className={`flex items-start justify-between gap-3`}>
                <div className="flex-1">
                  <div className={`font-semibold mb-1 ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                    {post.link_title || 'Link'}
                  </div>
                  <div className={`text-sm line-clamp-2 ${lightMode ? 'text-gray-600' : 'text-slate-400'}`}>
                    {post.link_url}
                  </div>
                </div>
                <ExternalLink size={16} className={lightMode ? 'text-gray-400' : 'text-slate-500'} />
              </div>
            </div>
          </a>
        )}

        {post.attachments && post.attachments.length > 0 && (
          <div className={`mt-4 grid gap-2 ${post.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {post.attachments.map((attachment, index) => {
              const youtubeId = attachment.file_type === 'video' ? extractYouTubeId(attachment.file_url) : null;
              const isBlobUrl = attachment.file_url?.startsWith('blob:');

              return (
                <div key={attachment.id} className="relative">
                  {attachment.file_type === 'image' ? (
                    isBlobUrl ? (
                      <div
                        className={`w-full rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100 text-gray-400' : 'bg-slate-700/50 text-slate-500'}`}
                        style={{ height: post.attachments!.length === 1 ? '300px' : '200px' }}
                      >
                        <span className="text-sm">Image unavailable</span>
                      </div>
                    ) : (
                    <img
                      src={attachment.file_url}
                      alt={`Attachment ${index + 1}`}
                      className="w-full rounded-xl object-cover shadow-lg"
                      style={{ maxHeight: post.attachments!.length === 1 ? '500px' : '300px' }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const placeholder = document.createElement('div');
                        placeholder.className = `w-full rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100 text-gray-400' : 'bg-slate-700/50 text-slate-500'}`;
                        placeholder.style.height = '200px';
                        placeholder.innerHTML = '<span class="text-sm">Image unavailable</span>';
                        target.parentNode?.appendChild(placeholder);
                      }}
                    />
                    )
                  ) : youtubeId ? (
                    <div className="relative w-full rounded-xl overflow-hidden shadow-lg" style={{ paddingTop: '56.25%' }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${youtubeId}`}
                        title={`YouTube video ${index + 1}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute top-0 left-0 w-full h-full"
                      />
                    </div>
                  ) : (
                    <video
                      src={attachment.file_url}
                      controls
                      className="w-full rounded-xl shadow-lg"
                      style={{ maxHeight: '500px' }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`px-6 py-3 border-t border-b ${lightMode ? 'border-gray-200' : 'border-slate-700/50'}`}>
        <div className={`flex items-center justify-between text-sm ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
          <button className={`transition-colors ${lightMode ? 'hover:text-blue-600 hover:underline' : 'hover:text-blue-400 hover:underline'}`}>
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className={`transition-colors ${lightMode ? 'hover:text-blue-600 hover:underline' : 'hover:text-blue-400 hover:underline'}`}
          >
            {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
          </button>
        </div>
      </div>

      <div className="px-6 py-3">
        <div className="flex items-center justify-around">
          <button
            onClick={handleLike}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all ${
              isLiked
                ? 'text-red-600 bg-red-50 hover:bg-red-100'
                : lightMode
                ? 'text-gray-600 hover:bg-gray-100'
                : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            <span className="font-medium">Like</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-colors ${lightMode ? 'text-gray-600 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700/50'}`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-medium">Comment</span>
          </button>

          <button className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-colors ${lightMode ? 'text-gray-600 hover:bg-gray-100' : 'text-slate-300 hover:bg-slate-700/50'}`}>
            <Share2 className="w-5 h-5" />
            <span className="font-medium">Share</span>
          </button>
        </div>
      </div>

      {showComments && (
        <div className={`border-t ${lightMode ? 'border-gray-200' : 'border-slate-700/50'}`}>
          <CommentSection postId={post.id} darkMode={darkMode} onCommentAdded={() => setCommentCount(prev => prev + 1)} onCommentDeleted={() => setCommentCount(prev => Math.max(0, prev - 1))} />
        </div>
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleDelete}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
        variant="danger"
      />

      <ReportPostModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        postId={post.id}
        clubId={post.club_id}
        groupId={post.group_id}
        darkMode={darkMode}
        onReported={() => {
          addNotification('Post reported. Club admins have been notified.', 'success');
        }}
      />
    </div>
  );
}
