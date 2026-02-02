import React, { useState, useEffect } from 'react';
import { X, Share2, Facebook, MessageSquare, Image, Video, Youtube, Send, AlertTriangle, CheckCircle, Globe } from 'lucide-react';
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
        .from('club_integrations')
        .select('provider, page_name, youtube_channel_name')
        .eq('club_id', currentClub?.clubId);

      if (error) throw error;

      const availablePlatforms: SocialPlatform[] = [
        {
          id: 'facebook',
          name: 'Facebook',
          icon: <Facebook size={20} className="text-blue-600" />,
          connected: data?.some(integration => integration.provider === 'meta') || false,
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex items-center gap-3">
            <Share2 className="text-blue-400" size={24} />
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Share to Social Media
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30 flex items-start gap-3">
              <AlertTriangle className="text-red-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-red-400 font-medium">Error</h3>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30 flex items-start gap-3">
              <CheckCircle className="text-green-400 mt-0.5" size={18} />
              <div>
                <h3 className="text-green-400 font-medium">Success</h3>
                <p className="text-green-300 text-sm">{success}</p>
              </div>
            </div>
          )}

          {/* Selected Media Preview */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Selected Media ({selectedMedia.length} items)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {selectedMedia.slice(0, 8).map((item) => (
                <div key={item.id} className={`
                  relative aspect-video rounded-lg overflow-hidden
                  ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}
                `}>
                  {item.media_type === 'youtube_video' ? (
                    <>
                      <img
                        src={item.thumbnail_url || `https://img.youtube.com/vi/${getYouTubeVideoId(item.url)}/maxresdefault.jpg`}
                        alt={item.title || 'Video thumbnail'}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <Youtube size={20} className="text-white" />
                      </div>
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.title || 'Image'}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
              {selectedMedia.length > 8 && (
                <div className={`
                  aspect-video rounded-lg flex items-center justify-center
                  ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}
                `}>
                  <span className="text-sm font-medium">+{selectedMedia.length - 8} more</span>
                </div>
              )}
            </div>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Image size={16} className="text-blue-400" />
                <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                  {images.length} image{images.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Video size={16} className="text-red-400" />
                <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>
                  {videos.length} video{videos.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Platform Selection */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Select Platforms
            </h3>
            
            {connectedPlatforms.length === 0 ? (
              <div className={`
                p-6 rounded-lg border text-center
                ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
              `}>
                <Globe size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                <h4 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  No Social Media Platforms Connected
                </h4>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Connect your social media accounts in Settings &gt; Integrations to share media.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connectedPlatforms.map((platform) => (
                  <div
                    key={platform.id}
                    onClick={() => handlePlatformToggle(platform.id)}
                    className={`
                      p-4 rounded-lg border cursor-pointer transition-all
                      ${selectedPlatforms.has(platform.id)
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                        : darkMode
                          ? 'border-slate-600 hover:border-slate-500'
                          : 'border-slate-300 hover:border-slate-400'
                      }
                      ${darkMode ? 'bg-slate-700' : 'bg-white'}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {platform.icon}
                        <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                          {platform.name}
                        </span>
                      </div>
                      <div className={`
                        w-5 h-5 rounded-full border-2 transition-colors
                        ${selectedPlatforms.has(platform.id)
                          ? 'bg-blue-500 border-blue-500'
                          : darkMode
                            ? 'border-slate-400'
                            : 'border-slate-300'
                        }
                      `}>
                        {selectedPlatforms.has(platform.id) && (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Max: {platform.maxImages} images, {platform.maxVideos} video
                      {platform.characterLimit && ` • ${platform.characterLimit} chars`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Share Text */}
          {connectedPlatforms.length > 0 && (
            <div>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Share Message
              </h3>
              <textarea
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                rows={4}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
                placeholder="Write a message to accompany your shared media..."
              />
              <div className="flex justify-between mt-2">
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  This message will be posted with your selected media
                </p>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {shareText.length} characters
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            disabled={loading}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          
          {connectedPlatforms.length > 0 && (
            <button
              onClick={handleShare}
              disabled={loading || selectedPlatforms.size === 0}
              className={`
                flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors text-white
                ${loading || selectedPlatforms.size === 0
                  ? 'opacity-50 cursor-not-allowed bg-slate-600'
                  : 'bg-blue-600 hover:bg-blue-700'}
              `}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sharing...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Share to {selectedPlatforms.size} Platform{selectedPlatforms.size !== 1 ? 's' : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};