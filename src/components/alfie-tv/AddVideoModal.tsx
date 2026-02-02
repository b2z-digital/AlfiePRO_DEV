import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { Youtube, LogOut } from 'lucide-react';
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
      addNotification('Please fill in YouTube URL and title', 'error');
      return;
    }

    const videoId = extractYouTubeId(youtubeUrl);
    if (!videoId) {
      addNotification('Invalid YouTube URL', 'error');
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

      addNotification('Video added successfully', 'success');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error adding video:', error);
      addNotification(error.message || 'Failed to add video', 'error');
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto ${lightMode ? 'bg-white' : 'bg-slate-800'}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-2xl font-bold ${lightMode ? 'text-gray-900' : 'text-white'}`}>
            Add YouTube Video
          </h2>
          <button
            onClick={handleClose}
            className={`p-2 rounded-xl transition-colors ${
              lightMode ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-slate-700/50 text-slate-400'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
              YouTube URL *
            </label>
            <div className="relative">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className={`w-full pl-10 pr-4 py-3 rounded-xl transition-colors ${
                  lightMode
                    ? 'bg-gray-50 border border-gray-200 text-gray-900'
                    : 'bg-slate-700/50 border border-slate-600 text-white'
                }`}
              />
              <Youtube className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${
                lightMode ? 'text-gray-400' : 'text-slate-500'
              }`} />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
              Video Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter video title"
              className={`w-full px-4 py-3 rounded-xl transition-colors ${
                lightMode
                  ? 'bg-gray-50 border border-gray-200 text-gray-900'
                  : 'bg-slate-700/50 border border-slate-600 text-white'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter video description"
              rows={3}
              className={`w-full px-4 py-3 rounded-xl transition-colors resize-none ${
                lightMode
                  ? 'bg-gray-50 border border-gray-200 text-gray-900'
                  : 'bg-slate-700/50 border border-slate-600 text-white'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${lightMode ? 'text-gray-700' : 'text-slate-300'}`}>
              Channel (Optional)
            </label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl transition-colors ${
                lightMode
                  ? 'bg-gray-50 border border-gray-200 text-gray-900'
                  : 'bg-slate-700/50 border border-slate-600 text-white'
              }`}
            >
              <option value="">Standalone Video (No Channel)</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>
                  {channel.channel_name}
                </option>
              ))}
            </select>
            <p className={`mt-2 text-sm ${lightMode ? 'text-gray-500' : 'text-slate-400'}`}>
              Leave as standalone if this video is not part of a YouTube channel
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 mt-6">
          <button
            onClick={handleClose}
            disabled={saving}
            className={`px-6 py-3 rounded-xl transition-colors ${
              lightMode ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-slate-700/50 text-slate-300'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Adding...' : 'Add Video'}
          </button>
        </div>
      </div>
    </div>
  );
}
