import React, { useState, useEffect } from 'react';
import { Facebook, MessageSquare } from 'lucide-react';
import { AlfieIcon } from './brand/AlfieIcon';
import { MediaThumb } from './media/MediaParts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { EventMedia } from '../types/media';
import { useNotifications } from '../contexts/NotificationContext';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  selectedMedia: EventMedia[];
  onSuccess?: () => void;
}

interface SocialPlatform {
  id: string;
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  maxImages: number;
  maxVideos: number;
  supportsText: boolean;
  characterLimit?: number;
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  selectedMedia,
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [shareText, setShareText] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([]);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isOpen && currentClub?.clubId) {
      fetchConnectedPlatforms();
      generateDefaultShareText();
    }
  }, [isOpen, currentClub, selectedMedia]);

  const fetchConnectedPlatforms = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('platform, credentials, is_active')
        .eq('club_id', currentClub?.clubId)
        .eq('is_active', true);

      if (error) throw error;

      const availablePlatforms: SocialPlatform[] = [
        {
          id: 'facebook',
          name: 'Facebook',
          icon: <Facebook size={20} className="text-blue-600" />,
          connected: data?.some(integration => integration.platform === 'facebook') || false,
          maxImages: 10,
          maxVideos: 1,
          supportsText: true,
          characterLimit: 63206
        },
        {
          id: 'twitter',
          name: 'X (Twitter)',
          icon: <MessageSquare size={20} className="text-slate-900" />,
          connected: false, // Not implemented yet
          maxImages: 4,
          maxVideos: 1,
          supportsText: true,
          characterLimit: 280
        }
      ];

      setPlatforms(availablePlatforms);
    } catch (err) {
      console.error('Error fetching connected platforms:', err);
    }
  };

  const generateDefaultShareText = () => {
    const imageCount = selectedMedia.filter(item => item.media_type === 'image').length;
    const videoCount = selectedMedia.filter(item => item.media_type === 'youtube_video').length;
    
    let text = '';
    
    if (imageCount > 0 && videoCount > 0) {
      text = `Check out our latest photos and videos from ${currentClub?.club?.name || 'our club'}! 📸🎥`;
    } else if (imageCount > 0) {
      text = `New photos from ${currentClub?.club?.name || 'our club'}! 📸`;
    } else if (videoCount > 0) {
      text = `Watch our latest videos from ${currentClub?.club?.name || 'our club'}! 🎥`;
    }
    
    // Add event context if available
    const eventNames = [...new Set(selectedMedia.map(item => item.event_name).filter(Boolean))];
    if (eventNames.length === 1) {
      text += ` From our ${eventNames[0]} event.`;
    } else if (eventNames.length > 1) {
      text += ` From our recent events.`;
    }
    
    setShareText(text);
  };

  const handlePlatformToggle = (platformId: string) => {
    const newSelection = new Set(selectedPlatforms);
    if (newSelection.has(platformId)) {
      newSelection.delete(platformId);
    } else {
      newSelection.add(platformId);
    }
    setSelectedPlatforms(newSelection);
  };

  const validateShare = () => {
    if (selectedPlatforms.size === 0) {
      setError('Please select at least one platform to share to');
      return false;
    }

    // Check platform-specific limits
    for (const platformId of selectedPlatforms) {
      const platform = platforms.find(p => p.id === platformId);
      if (!platform) continue;

      const images = selectedMedia.filter(item => item.media_type === 'image');
      const videos = selectedMedia.filter(item => item.media_type === 'youtube_video');

      if (images.length > platform.maxImages) {
        setError(`${platform.name} supports a maximum of ${platform.maxImages} images per post`);
        return false;
      }

      if (videos.length > platform.maxVideos) {
        setError(`${platform.name} supports a maximum of ${platform.maxVideos} video per post`);
        return false;
      }

      if (platform.characterLimit && shareText.length > platform.characterLimit) {
        setError(`Text is too long for ${platform.name} (${shareText.length}/${platform.characterLimit} characters)`);
        return false;
      }
    }

    return true;
  };

  const handleShare = async () => {
    if (!validateShare()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const sharePromises = Array.from(selectedPlatforms).map(async (platformId) => {
        if (platformId === 'facebook') {
          return await shareToFacebook();
        }
        // Add other platforms here when implemented
        return Promise.resolve();
      });

      await Promise.all(sharePromises);

      addNotification('success', `Successfully shared to ${selectedPlatforms.size} platform${selectedPlatforms.size > 1 ? 's' : ''}!`);
      
      if (onSuccess) onSuccess();

    } catch (err) {
      console.error('Error sharing to social media:', err);
      setError(err instanceof Error ? err.message : 'Failed to share to social media');
    } finally {
      setLoading(false);
    }
  };

  const shareToFacebook = async () => {
    const { data, error } = await supabase.functions.invoke('publish-to-facebook', {
      body: {
        clubId: currentClub?.clubId,
        text: shareText,
        media: selectedMedia.map(item => ({
          id: item.id,
          type: item.media_type,
          url: item.url,
          title: item.title,
          description: item.description
        }))
      }
    });

    if (error) throw error;
    return data;
  };

  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  if (!isOpen) return null;

  const connectedPlatforms = platforms.filter(p => p.connected);
  const images = selectedMedia.filter(item => item.media_type === 'image');
  const videos = selectedMedia.filter(item => item.media_type === 'youtube_video');

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !loading && onClose()} aria-hidden="true" />
      <section className="a-sheet a-md-sheet relative w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="a-md-social-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}><AlfieIcon glyph="share" size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="a-md-social-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Share to Social Media</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Post your selected media to your connected accounts</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="a-ib" aria-label="Close">
            <AlfieIcon glyph="x" size={20} />
          </button>
        </header>

        <div className="a-md-sheet-body">
          {error && (
            <div className="a-nw-ed-msg a-nw-ed-msg-r" role="alert">
              <AlfieIcon glyph="warn" size={18} />
              <p><b>Error</b><br />{error}</p>
            </div>
          )}

          {success && (
            <div className="a-nw-ed-msg a-nw-ed-msg-g" role="status">
              <AlfieIcon glyph="check" size={18} />
              <p><b>Success</b><br />{success}</p>
            </div>
          )}

          <div className="a-md-fl">
            <span>Selected Media ({selectedMedia.length} items)</span>
            <div className="a-md-strip">
              {selectedMedia.slice(0, 8).map((item) => (
                <span key={item.id} className="a-md-strip-i">
                  <MediaThumb item={item} />
                  {item.media_type === 'youtube_video' && (
                    <span className="a-md-play a-md-play-sm" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
                    </span>
                  )}
                </span>
              ))}
              {selectedMedia.length > 8 && (
                <span className="a-md-strip-i a-md-strip-more">+{selectedMedia.length - 8} more</span>
              )}
            </div>
            <div className="a-md-counts">
              <span><AlfieIcon glyph="camera" size={14} />{images.length} image{images.length !== 1 ? 's' : ''}</span>
              <span><AlfieIcon glyph="video" size={14} />{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="a-md-fl">
            <span>Select Platforms</span>
            {connectedPlatforms.length === 0 ? (
              <div className="a-md-none">
                <AlfieIcon glyph="globe" size={26} />
                <b>No Social Media Platforms Connected</b>
                <p>Connect your social media accounts in Settings &gt; Integrations to share media.</p>
              </div>
            ) : (
              <div className="a-md-plat-grid">
                {connectedPlatforms.map((platform) => {
                  const on = selectedPlatforms.has(platform.id);
                  return (
                    <button
                      type="button"
                      key={platform.id}
                      onClick={() => handlePlatformToggle(platform.id)}
                      className={`a-md-pick-row a-md-plat ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                    >
                      <span className="a-md-plat-ic">{platform.icon}</span>
                      <span className="min-w-0 flex-1 text-left">
                        <b>{platform.name}</b>
                        <span>
                          Max: {platform.maxImages} images, {platform.maxVideos} video
                          {platform.characterLimit && ` • ${platform.characterLimit} chars`}
                        </span>
                      </span>
                      <span className={`a-chk ${on ? 'a-chk-on' : ''}`}>{on && <AlfieIcon glyph="check" size={12} strokeWidth={2.6} />}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {connectedPlatforms.length > 0 && (
            <label className="a-md-fl">
              <span>Share Message</span>
              <textarea
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                rows={4}
                className="a-inp"
                placeholder="Write a message to accompany your shared media..."
              />
              <small className="flex justify-between gap-3">
                <span>This message will be posted with your selected media</span>
                <span>{shareText.length} characters</span>
              </small>
            </label>
          )}
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button onClick={onClose} disabled={loading} className="a-btn a-btn-q">
            Cancel
          </button>
          {connectedPlatforms.length > 0 && (
            <button
              onClick={handleShare}
              disabled={loading || selectedPlatforms.size === 0}
              className="a-btn a-btn-p"
            >
              {loading ? (
                <>
                  <span className="a-nw-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <AlfieIcon glyph="send" size={16} />
                  Share to {selectedPlatforms.size} Platform{selectedPlatforms.size !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};