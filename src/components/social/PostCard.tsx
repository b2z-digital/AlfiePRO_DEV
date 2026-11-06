import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, Ellipsis, Globe, Users, Lock, Trash2, Flag, MapPin, Smile, ExternalLink, ShieldAlert } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SocialPost } from '../../utils/socialStorage';
import { socialStorage } from '../../utils/socialStorage';
import CommentSection from './CommentSection';
import { AAvatar } from '../alfie/Kit';
import { ConfirmationModal } from '../ConfirmationModal';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import ReportPostModal from './ReportPostModal';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';

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
  onAuthorClick?: (author: { id: string; name: string; avatar?: string }) => void;
}

export default function PostCard({ post, onUpdate, darkMode = false, onAuthorClick }: PostCardProps) {
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

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
      addNotification('success', 'Post deleted successfully');
      onUpdate?.();
    } catch (error: any) {
      console.error('Error deleting post:', error);
      const msg = error?.message?.includes('permission')
        ? 'You do not have permission to delete this post'
        : 'Failed to delete post. Please try again.';
      addNotification('error', msg);
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
        return <Globe size={13} />;
      case 'friends':
        return <Users size={13} />;
      case 'group':
        return <Lock size={13} />;
      default:
        return <Globe size={13} />;
    }
  };

  const authorClick = () => onAuthorClick && post.author && onAuthorClick({ id: post.author_id, name: post.author.full_name, avatar: post.author.avatar_url });
  const [aFirst, ...aRest] = (post.author?.full_name || 'Unknown User').split(' ');
  const atts = post.attachments || [];
  const multi = atts.length > 1;
  const corner = (i: number) => {
    if (!multi) return '14px';
    const n = atts.length;
    const lastRow = Math.floor((n - 1) / 2);
    const row = Math.floor(i / 2), col = i % 2;
    const tl = row === 0 && col === 0 ? 14 : 4;
    const tr = row === 0 && (col === 1 || n === 1) ? 14 : 4;
    const bl = row === lastRow && col === 0 ? 14 : 4;
    const br = row === lastRow && (col === 1 || i === n - 1) ? 14 : 4;
    return `${tl}px ${tr}px ${br}px ${bl}px`;
  };

  return (
    <div className="a-card overflow-hidden">
      <div className="flex items-center gap-3" style={{ padding: '18px 18px 12px' }}>
        <span className={onAuthorClick ? 'cursor-pointer' : ''} onClick={authorClick}>
          <AAvatar url={post.author?.avatar_url} first={aFirst} last={aRest.join(' ')} size={44} />
        </span>
        <div className="flex-1 min-w-0">
          <div className={`a-ink text-[15px] font-semibold truncate ${onAuthorClick ? 'cursor-pointer hover:underline' : ''}`} onClick={authorClick}>
            {post.author?.full_name || 'Unknown User'}
          </div>
          <div className="a-dim flex items-center gap-1.5 text-[12.5px] mt-0.5">
            <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
            <span>·</span>
            {getPrivacyIcon()}
            <span className="capitalize">{post.privacy}</span>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="a-ib" aria-label="More" aria-expanded={showMenu}>
            <Ellipsis size={18} />
          </button>
          {showMenu && (
            <div className="a-pop absolute right-0 mt-2 w-52 z-10">
              {canDelete && (
                <button onClick={handleDeleteClick} className="a-pop-item a-txt-r w-full">
                  {isPostOwner ? <Trash2 size={16} /> : <ShieldAlert size={16} />}
                  {isPostOwner ? 'Delete post' : 'Delete post (admin)'}
                </button>
              )}
              {!isPostOwner && (
                <button onClick={handleReportClick} className="a-pop-item w-full">
                  <Flag size={16} />
                  Report post
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {post.content && <p className="a-ink m-0 whitespace-pre-wrap text-[15px] leading-[1.5]" style={{ padding: '0 18px 14px' }}>{post.content}</p>}

      {(post.location || post.feeling) && (
        <div className="flex flex-wrap gap-1.5" style={{ padding: '0 18px 14px' }}>
          {post.location && <span className="a-lb-fmt" style={{ height: 26 }}><MapPin size={13} className="a-txt-a" />{post.location}</span>}
          {post.feeling && <span className="a-lb-fmt" style={{ height: 26 }}><Smile size={13} className="a-txt-a" />feeling {post.feeling}</span>}
        </div>
      )}

      {post.link_url && (
        <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="a-grp flex items-start gap-3" style={{ margin: '0 18px 14px', padding: 14 }}>
          <div className="flex-1 min-w-0">
            <div className="a-ink text-[14.5px] font-semibold mb-0.5">{post.link_title || 'Link'}</div>
            <div className="a-dim text-[12.5px] line-clamp-2 break-all">{post.link_url}</div>
          </div>
          <ExternalLink size={16} className="a-dim flex-shrink-0" />
        </a>
      )}

      {atts.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: multi ? '1fr 1fr' : '1fr', gap: 4, padding: '0 12px' }}>
          {atts.map((attachment, index) => {
            const youtubeId = attachment.file_type === 'video' ? extractYouTubeId(attachment.file_url) : null;
            const isBlobUrl = attachment.file_url?.startsWith('blob:');
            const radius = corner(index);
            const h = multi ? 190 : undefined;

            return (
              <div key={attachment.id} className="relative overflow-hidden" style={{ borderRadius: radius }}>
                {attachment.file_type === 'image' ? (
                  isBlobUrl ? (
                    <div className="a-empty w-full flex items-center justify-center" style={{ height: multi ? 190 : 300 }}>
                      <span className="a-dim text-[13px]">Image unavailable</span>
                    </div>
                  ) : (
                  <img
                    src={attachment.file_url}
                    alt={`Attachment ${index + 1}`}
                    className="w-full object-cover block cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ height: h, maxHeight: multi ? undefined : 500 }}
                    onClick={() => {
                      const imageAttachments = atts.filter(a => a.file_type === 'image' && !a.file_url?.startsWith('blob:'));
                      const imageIndex = imageAttachments.findIndex(a => a.id === attachment.id);
                      setLightboxIndex(imageIndex >= 0 ? imageIndex : 0);
                      setLightboxOpen(true);
                    }}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const placeholder = document.createElement('div');
                      placeholder.className = 'a-empty a-dim w-full flex items-center justify-center text-[13px]';
                      placeholder.style.height = '190px';
                      placeholder.textContent = 'Image unavailable';
                      target.parentNode?.appendChild(placeholder);
                    }}
                  />
                  )
                ) : youtubeId ? (
                  <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${youtubeId}`}
                      title={`YouTube video ${index + 1}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="absolute top-0 left-0 w-full h-full"
                    />
                  </div>
                ) : (
                  <video src={attachment.file_url} controls className="w-full block" style={{ maxHeight: 500 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="a-dim flex justify-between text-[13px]" style={{ padding: '12px 18px 8px' }}>
        <span className="inline-flex items-center gap-1.5">
          {likeCount > 0 && <span className="inline-flex items-center justify-center rounded-full text-white" style={{ width: 20, height: 20, background: '#FF3E9A' }}><Heart size={11} className="fill-current" /></span>}
          {likeCount} {likeCount === 1 ? 'like' : 'likes'}
        </span>
        <button onClick={() => setShowComments(!showComments)} className="hover:underline">
          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </button>
      </div>

      <div className="flex gap-1 border-t a-bd" style={{ padding: '6px 10px 8px' }}>
        <button onClick={handleLike} className={`a-ab ${isLiked ? 'a-ab-liked' : ''}`} aria-pressed={isLiked}>
          <Heart size={18} className={isLiked ? 'fill-current' : ''} />
          {isLiked ? 'Liked' : 'Like'}
        </button>
        <button onClick={() => setShowComments(!showComments)} className="a-ab">
          <MessageCircle size={18} />
          Comment
        </button>
        <button className="a-ab">
          <Share2 size={18} />
          Share
        </button>
      </div>

      {showComments && (
        <div className="border-t a-bd">
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
          addNotification('success', 'Post reported. Club admins have been notified.');
        }}
      />

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={
          (post.attachments || [])
            .filter(a => a.file_type === 'image' && !a.file_url?.startsWith('blob:'))
            .map(a => ({ src: a.file_url }))
        }
        plugins={[Zoom]}
      />
    </div>
  );
}
