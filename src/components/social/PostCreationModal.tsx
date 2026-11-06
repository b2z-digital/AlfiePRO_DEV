import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { X, Image, Video, Link as LinkIcon, MapPin, Smile, Users, Lock, Globe, MessageSquare, ChevronDown, User, Send } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadProfile();
      if (propGroups && propGroups.length > 0) {
        setUserGroups(propGroups);
        if (!groupId && currentClub?.clubId) {
          const clubGroup = propGroups.find(g => g.club_id === currentClub.clubId && g.group_type === 'club');
          if (clubGroup) setSelectedGroupId(clubGroup.id);
          else setSelectedGroupId(undefined);
        } else {
          setSelectedGroupId(groupId);
        }
      } else {
        loadUserGroups();
      }
      if (groupId) setSelectedGroupId(groupId);
    }
  }, [isOpen, user, groupId]);

  const loadUserGroups = async () => {
    try {
      const data = await socialStorage.getGroups({ userId: user?.id });
      setUserGroups(data || []);
      // Default to the user's club group if no specific group was passed
      if (!groupId && currentClub?.clubId && data) {
        const clubGroup = data.find(g => g.club_id === currentClub.clubId && g.group_type === 'club');
        if (clubGroup) setSelectedGroupId(clubGroup.id);
      }
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

  const selectedGroup = userGroups.find(g => g.id === selectedGroupId);
  const [pFirst, ...pRest] = (profile?.full_name || user?.email || 'You').split(' ');
  const tool = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button type="button" onClick={onClick} title={label} className="a-tool">
      <span className="a-tile a-tile-sm" style={{ width: 32, height: 32 }}>{icon}</span>
      {label}
    </button>
  );
  const groupLogo = (group: SocialGroup, size = 32) => {
    const logo = (group as any).club?.logo || group.avatar_url;
    return logo
      ? <img src={logo} alt="" className="rounded-[10px] object-cover flex-shrink-0" style={{ width: size, height: size }} />
      : <span className="a-grp-logo" style={{ width: size, height: size, borderRadius: 10, fontSize: 11 }}>{group.name.slice(0, 2).toUpperCase()}</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <section className="a-sheet w-full max-w-[520px] max-h-[90vh] flex flex-col animate-slideUp" role="dialog" aria-label="Create post">
        <div className="flex items-center gap-3" style={{ padding: '20px 18px 14px 22px' }}>
          <span className="a-tile a-tile-rim" style={{ width: 40, height: 40 }}><MessageSquare size={18} /></span>
          <div className="flex-1 min-w-0">
            <h2 className="a-display a-ink m-0 text-[20px] font-semibold">Create post</h2>
            <div className="a-dim text-[12.5px] mt-0.5">Share something with the community</div>
          </div>
          <button onClick={onClose} className="a-ib" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3.5" style={{ padding: '0 22px 18px' }}>
          <div className="flex items-center gap-3">
            <AAvatar url={profile?.avatar_url} first={pFirst} last={pRest.join(' ')} size={44} />
            <div className="min-w-0">
              <div className="a-ink text-[15px] font-semibold">{profile?.full_name || 'You'}</div>
              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                <div className="relative">
                  <button
                    onClick={() => { setShowPostTargetMenu(!showPostTargetMenu); setShowPrivacyMenu(false); }}
                    className="a-pick"
                    style={{ height: 30, padding: '0 10px', borderRadius: 9, fontSize: 12.5 }}
                    aria-expanded={showPostTargetMenu}
                  >
                    {selectedGroupId ? <Users size={14} /> : <User size={14} />}
                    <span className="truncate max-w-[180px]">{selectedGroup?.name || (selectedGroupId ? 'Group' : 'My feed')}</span>
                    <ChevronDown size={14} />
                  </button>

                  {showPostTargetMenu && (
                    <div className="a-pop absolute top-full left-0 mt-2 w-72 z-20 max-h-64 overflow-y-auto">
                      <button
                        onClick={() => { setSelectedGroupId(undefined); setShowPostTargetMenu(false); }}
                        className={`a-pop-item w-full ${!selectedGroupId ? 'a-pop-item-on' : ''}`}
                        style={{ height: 'auto', padding: '8px 10px' }}
                      >
                        <span className="a-tile" style={{ width: 32, height: 32, borderRadius: 10 }}><User size={15} /></span>
                        <div className="flex-1 text-left">
                          <div className="a-ink text-[13.5px] font-semibold">My feed</div>
                          <div className="a-dim text-[12px]">Post to your personal feed</div>
                        </div>
                      </button>
                      {userGroups.length > 0 && <div className="a-pop-rule" />}
                      {userGroups.length > 0 && <div className="a-ghd" style={{ padding: '6px 10px 4px' }}>My groups</div>}
                      {userGroups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => { setSelectedGroupId(group.id); setShowPostTargetMenu(false); }}
                          className={`a-pop-item w-full ${selectedGroupId === group.id ? 'a-pop-item-on' : ''}`}
                          style={{ height: 'auto', padding: '8px 10px' }}
                        >
                          {groupLogo(group)}
                          <div className="flex-1 text-left min-w-0">
                            <div className="a-ink text-[13.5px] font-semibold truncate">{group.name}</div>
                            <div className="a-dim text-[12px]">{group.member_count || 0} members</div>
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
                      className="a-pick"
                      style={{ height: 30, padding: '0 10px', borderRadius: 9, fontSize: 12.5 }}
                      aria-expanded={showPrivacyMenu}
                    >
                      {currentPrivacy && <currentPrivacy.icon size={14} />}
                      <span>{currentPrivacy?.label}</span>
                      <ChevronDown size={14} />
                    </button>
                    {showPrivacyMenu && (
                      <div className="a-pop absolute top-full left-0 mt-2 w-72 z-20">
                        {privacyOptions.filter(o => o.value !== 'group').map(option => (
                          <button
                            key={option.value}
                            onClick={() => { setPrivacy(option.value as any); setShowPrivacyMenu(false); }}
                            className={`a-pop-item w-full ${privacy === option.value ? 'a-pop-item-on' : ''}`}
                            style={{ height: 'auto', padding: '9px 10px', alignItems: 'flex-start' }}
                          >
                            <option.icon size={17} className="a-txt-b mt-0.5 flex-shrink-0" />
                            <div className="flex-1 text-left">
                              <div className="a-ink text-[13.5px] font-semibold">{option.label}</div>
                              <div className="a-dim text-[12px] mt-0.5">{option.description}</div>
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
            placeholder="What's happening on the water?"
            className="a-post-ta"
            autoFocus
          />

          {(videoUrl || linkUrl || location) && (
            <div className="flex flex-wrap gap-1.5">
              {videoUrl && (
                <span className="a-lb-fmt" style={{ height: 28 }}>
                  <Video size={14} className="a-txt-r" />YouTube video
                  <button onClick={() => setVideoUrl('')} className="a-dim flex" aria-label="Remove video"><X size={13} /></button>
                </span>
              )}
              {linkUrl && (
                <span className="a-lb-fmt" style={{ height: 28 }}>
                  <LinkIcon size={14} className="a-txt-b" /><span className="truncate max-w-[200px]">{linkTitle || 'Link'}</span>
                  <button onClick={() => { setLinkUrl(''); setLinkTitle(''); }} className="a-dim flex" aria-label="Remove link"><X size={13} /></button>
                </span>
              )}
              {location && (
                <span className="a-lb-fmt" style={{ height: 28 }}>
                  <MapPin size={14} className="a-txt-a" />{location}
                  <button onClick={() => setLocation('')} className="a-dim flex" aria-label="Remove location"><X size={13} /></button>
                </span>
              )}
            </div>
          )}

          {previews.length > 0 && (
            <div className="grid grid-cols-2 gap-1">
              {previews.map((preview, index) => (
                <div key={index} className="relative group overflow-hidden" style={{ borderRadius: 14 }}>
                  <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-40 object-cover block" />
                  <button
                    onClick={() => removeAttachment(index)}
                    className="a-gb absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ width: 30, height: 30 }}
                    aria-label="Remove photo"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5 relative">
            {tool('Photo', <Image size={16} />, () => fileInputRef.current?.click())}
            {tool('Video', <Video size={16} />, () => setShowVideoModal(true))}
            {tool('Link', <LinkIcon size={16} />, () => setShowLinkModal(true))}
            {tool('Place', <MapPin size={16} />, () => setShowLocationModal(true))}
            {tool('Feeling', <Smile size={16} />, () => setShowEmojiPicker(!showEmojiPicker))}
            {showEmojiPicker && (
              <div className="absolute bottom-full right-0 mb-2 z-50">
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    setContent(prev => prev + emojiData.emoji);
                    setShowEmojiPicker(false);
                  }}
                  theme={darkMode ? Theme.DARK : Theme.LIGHT}
                  width={320}
                  height={400}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t a-bd" style={{ padding: '14px 22px' }}>
          <span className="a-dim flex-1 text-[12.5px] truncate">
            {selectedGroup ? `Visible to ${selectedGroup.member_count || 0} members` : currentPrivacy?.description}
          </span>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (!content.trim() && attachments.length === 0 && !videoUrl && !linkUrl)}
            className="a-btn a-btn-p disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            {isSubmitting ? 'Posting…' : 'Post'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </section>

      {/* Video URL Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowVideoModal(false)}>
          <div className="a-sheet w-full max-w-md" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="a-display a-ink m-0 text-[18px] font-semibold">Add YouTube Video</h3>
              <button onClick={() => setShowVideoModal(false)} className="a-ib" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste YouTube URL..."
              className="a-inp w-full"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowVideoModal(false)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVideo}
                className="a-btn a-btn-p"
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
          <div className="a-sheet w-full max-w-md" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="a-display a-ink m-0 text-[18px] font-semibold">Add Link</h3>
              <button onClick={() => setShowLinkModal(false)} className="a-ib" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Enter URL..."
                className="a-inp w-full"
                autoFocus
              />
              <input
                type="text"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="Link title (optional)..."
                className="a-inp w-full"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowLinkModal(false)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLink}
                className="a-btn a-btn-p"
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
          <div className="a-sheet w-full max-w-md" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="a-display a-ink m-0 text-[18px] font-semibold">Add Location</h3>
              <button onClick={() => setShowLocationModal(false)} className="a-ib" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Where are you?"
              className="a-inp w-full"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowLocationModal(false)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowLocationModal(false); }}
                className="a-btn a-btn-p"
              >
                Add Location
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
