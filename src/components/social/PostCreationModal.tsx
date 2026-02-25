import React, { useState, useRef, useEffect } from 'react';
import { X, Image, Video, Link as LinkIcon, MapPin, Smile, Users, Lock, Globe, MessageSquare, ChevronDown, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { socialStorage, SocialGroup } from '../../utils/socialStorage';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';

interface PostCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId?: string;
  groups?: SocialGroup[];
  onPostCreated?: () => void;
  darkMode?: boolean;
}

export default function PostCreationModal({ isOpen, onClose, groupId, groups: propGroups, onPostCreated, darkMode = false }: PostCreationModalProps) {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'group'>('public');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [showPostTargetMenu, setShowPostTargetMenu] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(groupId);
  const [userGroups, setUserGroups] = useState<SocialGroup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [location, setLocation] = useState('');
  const [feeling, setFeeling] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showFeelingModal, setShowFeelingModal] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadProfile();
      if (propGroups && propGroups.length > 0) {
        setUserGroups(propGroups);
      } else {
        loadUserGroups();
      }
      setSelectedGroupId(groupId);
    }
  }, [isOpen, user, groupId]);

  const loadUserGroups = async () => {
    try {
      const data = await socialStorage.getGroups({ userId: user?.id });
      setUserGroups(data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('avatar_url, full_name')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setProfile(data);
    }
  };

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

  const handleAddVideo = () => {
    if (!videoUrl.trim()) {
      addNotification('Please enter a video URL', 'error');
      return;
    }

    const youtubeId = extractYouTubeId(videoUrl);
    if (!youtubeId) {
      addNotification('Please enter a valid YouTube URL', 'error');
      return;
    }

    setShowVideoModal(false);
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      addNotification('Please enter a URL', 'error');
      return;
    }
    setShowLinkModal(false);
  };

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim() && attachments.length === 0 && !videoUrl && !linkUrl) return;

    setIsSubmitting(true);
    try {
      // Determine content type
      let contentType = 'text';
      if (videoUrl) contentType = 'video';
      else if (linkUrl) contentType = 'link';
      else if (attachments.length > 0) contentType = 'image';

      const post = await socialStorage.createPost({
        content: content.trim(),
        privacy: selectedGroupId ? 'group' : privacy,
        group_id: selectedGroupId || undefined,
        club_id: currentClub?.clubId,
        content_type: contentType,
        link_url: linkUrl || undefined,
        link_title: linkTitle || undefined,
        location: location || undefined,
        feeling: feeling || undefined
      });

      // Upload image/video file attachments
      for (const file of attachments) {
        const fileUrl = await socialStorage.uploadSocialMedia(file);
        await socialStorage.createMediaAttachment({
          post_id: post.id,
          file_url: fileUrl,
          file_type: file.type.startsWith('image/') ? 'image' : 'video',
          file_size: file.size
        });
      }

      // Add YouTube video as attachment
      if (videoUrl) {
        const youtubeId = extractYouTubeId(videoUrl);
        if (youtubeId) {
          await socialStorage.createMediaAttachment({
            post_id: post.id,
            file_url: videoUrl,
            file_type: 'video',
            file_size: 0
          });
        }
      }

      setContent('');
      setAttachments([]);
      setPreviews([]);
      setVideoUrl('');
      setLinkUrl('');
      setLinkTitle('');
      setLocation('');
      setFeeling('');
      addNotification('Post created successfully', 'success');
      onPostCreated?.();
      onClose();
    } catch (error: any) {
      console.error('Error creating post:', error);
      const errorMessage = error?.message || 'Failed to create post';
      addNotification(`Failed to create post: ${errorMessage}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const privacyOptions = [
    { value: 'public', icon: Globe, label: 'Public', description: 'Anyone can see this post' },
    { value: 'friends', icon: Users, label: 'Friends', description: 'Only your connections can see' },
    { value: 'group', icon: Lock, label: 'Group Only', description: 'Only group members can see' }
  ];

  const currentPrivacy = privacyOptions.find(p => p.value === privacy);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className={`
        w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        {/* Modern Gradient Header - Same as Create Event Modal */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <MessageSquare className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                Create Post
              </h2>
              <p className="text-blue-100 text-sm mt-0.5">Share something with the community</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className={`flex-1 overflow-y-auto p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
          <div className="flex items-start space-x-3 mb-4">
            <div className="flex-shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name || 'You'}
                  className="w-14 h-14 rounded-full object-cover shadow-lg border-2 border-white/20"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className={`font-semibold text-lg ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                {profile?.full_name || 'You'}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <button
                    onClick={() => { setShowPostTargetMenu(!showPostTargetMenu); setShowPrivacyMenu(false); }}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'}`}
                  >
                    {selectedGroupId ? (
                      <>
                        <Users className="w-4 h-4" />
                        <span className="truncate max-w-[140px]">{userGroups.find(g => g.id === selectedGroupId)?.name || 'Group'}</span>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4" />
                        <span>My Feed</span>
                      </>
                    )}
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                  </button>

                  {showPostTargetMenu && (
                    <div className={`absolute top-full left-0 mt-2 w-72 rounded-xl shadow-xl border z-20 max-h-64 overflow-y-auto ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                      <button
                        onClick={() => {
                          setSelectedGroupId(undefined);
                          setShowPostTargetMenu(false);
                        }}
                        className={`w-full flex items-center space-x-3 p-3 transition-colors first:rounded-t-xl ${!selectedGroupId ? (lightMode ? 'bg-blue-50' : 'bg-blue-900/30') : ''} ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/50'}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white flex-shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className={`font-medium text-sm ${lightMode ? 'text-gray-900' : 'text-white'}`}>My Feed</div>
                          <div className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>Post to your personal feed</div>
                        </div>
                      </button>
                      {userGroups.length > 0 && (
                        <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${lightMode ? 'text-gray-400 bg-gray-50' : 'text-slate-500 bg-slate-800'}`}>
                          My Groups
                        </div>
                      )}
                      {userGroups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                            setShowPostTargetMenu(false);
                          }}
                          className={`w-full flex items-center space-x-3 p-3 transition-colors last:rounded-b-xl ${selectedGroupId === group.id ? (lightMode ? 'bg-blue-50' : 'bg-blue-900/30') : ''} ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/50'}`}
                        >
                          {group.avatar_url ? (
                            <img src={group.avatar_url} alt={group.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {group.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 text-left min-w-0">
                            <div className={`font-medium text-sm truncate ${lightMode ? 'text-gray-900' : 'text-white'}`}>{group.name}</div>
                            <div className={`text-xs ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>{group.member_count || 0} members</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!selectedGroupId && (
                  <div className="relative">
                    <button
                      onClick={() => { setShowPrivacyMenu(!showPrivacyMenu); setShowPostTargetMenu(false); }}
                      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'}`}
                    >
                      {currentPrivacy && <currentPrivacy.icon className="w-4 h-4" />}
                      <span>{currentPrivacy?.label}</span>
                    </button>
                    {showPrivacyMenu && (
                      <div className={`absolute top-full left-0 mt-2 w-72 rounded-xl shadow-xl border z-20 ${lightMode ? 'bg-white border-gray-200' : 'bg-slate-800 border-slate-700'}`}>
                        {privacyOptions.filter(o => o.value !== 'group').map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setPrivacy(option.value as any);
                              setShowPrivacyMenu(false);
                            }}
                            className={`w-full flex items-start space-x-3 p-4 transition-colors first:rounded-t-xl last:rounded-b-xl ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-slate-700/50'}`}
                          >
                            <option.icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" />
                            <div className="flex-1 text-left">
                              <div className={`font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>{option.label}</div>
                              <div className={`text-xs mt-0.5 ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>{option.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className={`w-full border-0 resize-none focus:ring-0 text-lg min-h-[140px] rounded-lg p-4 ${lightMode ? 'bg-gray-50 text-gray-900 placeholder-gray-400' : 'bg-slate-700/50 text-white placeholder-slate-500'}`}
            autoFocus
          />

          {/* Display added features */}
          {(videoUrl || linkUrl || location || feeling) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {videoUrl && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${lightMode ? 'bg-red-50 text-red-700' : 'bg-red-900/30 text-red-300'}`}>
                  <Video size={16} />
                  <span className="text-sm font-medium">YouTube Video</span>
                  <button onClick={() => setVideoUrl('')} className="ml-1 hover:opacity-70">
                    <X size={14} />
                  </button>
                </div>
              )}
              {linkUrl && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${lightMode ? 'bg-blue-50 text-blue-700' : 'bg-blue-900/30 text-blue-300'}`}>
                  <LinkIcon size={16} />
                  <span className="text-sm font-medium truncate max-w-[200px]">{linkTitle || 'Link'}</span>
                  <button onClick={() => { setLinkUrl(''); setLinkTitle(''); }} className="ml-1 hover:opacity-70">
                    <X size={14} />
                  </button>
                </div>
              )}
              {location && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${lightMode ? 'bg-orange-50 text-orange-700' : 'bg-orange-900/30 text-orange-300'}`}>
                  <MapPin size={16} />
                  <span className="text-sm font-medium">{location}</span>
                  <button onClick={() => setLocation('')} className="ml-1 hover:opacity-70">
                    <X size={14} />
                  </button>
                </div>
              )}
              {feeling && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${lightMode ? 'bg-yellow-50 text-yellow-700' : 'bg-yellow-900/30 text-yellow-300'}`}>
                  <Smile size={16} />
                  <span className="text-sm font-medium">{feeling}</span>
                  <button onClick={() => setFeeling('')} className="ml-1 hover:opacity-70">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  <img
                    src={preview}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-56 object-cover rounded-xl"
                  />
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute top-2 right-2 p-2 bg-black/70 hover:bg-black/90 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className={`flex items-center justify-between mt-6 pt-6 border-t ${lightMode ? 'border-gray-200' : 'border-slate-700'}`}>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`p-3 rounded-xl transition-all hover:scale-110 ${lightMode ? 'hover:bg-green-50' : 'hover:bg-green-900/30'}`}
                title="Add photos"
              >
                <Image className="w-6 h-6 text-green-500" />
              </button>
              <button
                onClick={() => setShowVideoModal(true)}
                className={`p-3 rounded-xl transition-all hover:scale-110 ${lightMode ? 'hover:bg-red-50' : 'hover:bg-red-900/30'}`}
                title="Add YouTube video"
              >
                <Video className="w-6 h-6 text-red-500" />
              </button>
              <button
                onClick={() => setShowLinkModal(true)}
                className={`p-3 rounded-xl transition-all hover:scale-110 ${lightMode ? 'hover:bg-blue-50' : 'hover:bg-blue-900/30'}`}
                title="Add link"
              >
                <LinkIcon className="w-6 h-6 text-blue-500" />
              </button>
              <button
                onClick={() => setShowLocationModal(true)}
                className={`p-3 rounded-xl transition-all hover:scale-110 ${lightMode ? 'hover:bg-orange-50' : 'hover:bg-orange-900/30'}`}
                title="Add location"
              >
                <MapPin className="w-6 h-6 text-orange-500" />
              </button>
              <button
                onClick={() => setShowFeelingModal(true)}
                className={`p-3 rounded-xl transition-all hover:scale-110 ${lightMode ? 'hover:bg-yellow-50' : 'hover:bg-yellow-900/30'}`}
                title="Add feeling"
              >
                <Smile className="w-6 h-6 text-yellow-500" />
              </button>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isSubmitting || (!content.trim() && attachments.length === 0 && !videoUrl && !linkUrl)}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-xl disabled:hover:shadow-lg transform hover:scale-105 disabled:hover:scale-100"
            >
              {isSubmitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Video URL Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowVideoModal(false)}>
          <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Add YouTube Video</h3>
              <button onClick={() => setShowVideoModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} className={lightMode ? 'text-gray-500' : 'text-gray-400'} />
              </button>
            </div>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste YouTube URL..."
              className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${lightMode ? 'bg-white border-gray-300 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'}`}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowVideoModal(false)}
                className={`px-4 py-2 rounded-lg ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddVideo}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                Add Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link URL Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowLinkModal(false)}>
          <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Add Link</h3>
              <button onClick={() => setShowLinkModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} className={lightMode ? 'text-gray-500' : 'text-gray-400'} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Enter URL..."
                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${lightMode ? 'bg-white border-gray-300 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'}`}
                autoFocus
              />
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Link title (optional)..."
                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${lightMode ? 'bg-white border-gray-300 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'}`}
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowLinkModal(false)}
                className={`px-4 py-2 rounded-lg ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddLink}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                Add Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowLocationModal(false)}>
          <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>Add Location</h3>
              <button onClick={() => setShowLocationModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} className={lightMode ? 'text-gray-500' : 'text-gray-400'} />
              </button>
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where are you?"
              className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${lightMode ? 'bg-white border-gray-300 text-gray-900' : 'bg-slate-700 border-slate-600 text-white'}`}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowLocationModal(false)}
                className={`px-4 py-2 rounded-lg ${lightMode ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLocationModal(false); }}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
              >
                Add Location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feeling Modal */}
      {showFeelingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowFeelingModal(false)}>
          <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${lightMode ? 'text-gray-900' : 'text-white'}`}>How are you feeling?</h3>
              <button onClick={() => setShowFeelingModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X size={20} className={lightMode ? 'text-gray-500' : 'text-gray-400'} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {['Happy', 'Excited', 'Blessed', 'Grateful', 'Loved', 'Motivated', 'Relaxed', 'Proud', 'Sad', 'Tired', 'Worried', 'Frustrated'].map(emotion => (
                <button
                  key={emotion}
                  onClick={() => {
                    setFeeling(emotion);
                    setShowFeelingModal(false);
                  }}
                  className={`px-4 py-3 rounded-lg text-left transition-colors ${
                    feeling === emotion
                      ? 'bg-blue-500 text-white'
                      : lightMode
                      ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  {emotion}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
