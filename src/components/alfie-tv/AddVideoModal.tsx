import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { AlfieIcon } from '../brand/AlfieIcon';
import { alfieTVStorage, AlfieTVChannel } from '../../utils/alfieTVStorage';

interface AddVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  darkMode?: boolean;
}

export default function AddVideoModal({ isOpen, onClose, onSuccess, darkMode = false }: AddVideoModalProps) {
  const { currentClub } = useAuth();
  const { addNotification } = useNotification();
  const lightMode = !darkMode;

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<AlfieTVChannel[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentClub?.clubId) {
      loadChannels();
    }
  }, [isOpen, currentClub?.clubId]);

  const loadChannels = async () => {
    if (!currentClub?.clubId) return;

    try {
      const data = await alfieTVStorage.getChannels(currentClub.clubId);
      setChannels(data);
      if (data.length > 0) {
        setChannelId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading channels:', error);
    }
  };

  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  const handleSave = async () => {
    if (!youtubeUrl.trim() || !title.trim()) {
      addNotification('error', 'Please fill in YouTube URL and title');
      return;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      addNotification('error', 'Invalid YouTube URL');
      return;
    }

    setSaving(true);
    try {
      await alfieTVStorage.createVideo({
        youtube_id: videoId,
        title,
        description: description || null,
        thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        duration: 0,
        channel_id: channelId || null,
        boat_classes: [],
        content_type: 'other',
        skill_level: 'beginner'
      });

      addNotification('success', 'Video added successfully');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error adding video:', error);
      addNotification('error', error.message || 'Failed to add video');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setChannelId('');
    onClose();
  };

  if (!isOpen) return null;

  const previewId = extractYouTubeId(youtubeUrl.trim());

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6 atvm-modal">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !saving && handleClose()} aria-hidden="true" />
      <section className="a-sheet relative w-full max-w-xl flex flex-col max-h-[92vh] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="atvm-vid-title">
        <header className="a-sheet-head a-md-sheet-head">
          <span className="atvm-yt" aria-hidden="true"><i /></span>
          <div className="min-w-0 flex-1">
            <h2 id="atvm-vid-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Add YouTube Video</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Add a single video to AlfieTV</p>
          </div>
          <button type="button" onClick={handleClose} className="a-ib" aria-label="Close"><AlfieIcon glyph="x" size={20} /></button>
        </header>

        <div className="a-md-sheet-body">
          <label className="a-md-fl">
            <span>YouTube URL *</span>
            <span className={`a-field ${previewId ? 'atvm-ok' : ''}`}>
              <AlfieIcon glyph="link" size={16} />
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                autoFocus
              />
              {previewId && <AlfieIcon glyph="check" size={17} strokeWidth={2.2} className="a-txt-g" />}
            </span>
          </label>

          {previewId && (
            <div className="atvm-preview">
              <img src={`https://i.ytimg.com/vi/${previewId}/hqdefault.jpg`} alt="" />
              <span className="atvm-preview-play" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" /></svg>
              </span>
            </div>
          )}

          <label className="a-md-fl">
            <span>Video Title *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title"
              className="a-inp"
            />
          </label>

          <label className="a-md-fl">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description"
              rows={3}
              className="a-inp"
            />
          </label>

          <label className="a-md-fl">
            <span>Channel (Optional)</span>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="a-inp"
            >
              <option value="">Standalone Video (No Channel)</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>
                  {channel.channel_name}
                </option>
              ))}
            </select>
            <small>Leave as standalone if this video is not part of a YouTube channel</small>
          </label>
        </div>

        <footer className="a-sheet-foot a-md-sheet-foot">
          <button onClick={handleClose} disabled={saving} className="a-btn a-btn-q">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="a-btn a-btn-p">
            <AlfieIcon glyph="plus" size={16} />
            {saving ? 'Adding...' : 'Add Video'}
          </button>
        </footer>
      </section>
    </div>
  );
}
