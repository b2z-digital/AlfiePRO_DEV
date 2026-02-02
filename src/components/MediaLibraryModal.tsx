import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, Search, Image as ImageIcon, Check } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { EventMedia } from '../types/media';
import imageCompression from 'browser-image-compression';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  darkMode: boolean;
  allowMultiple?: boolean;
  isHomepageMedia?: boolean;
}

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  darkMode,
  allowMultiple = false,
  isHomepageMedia = false
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (isOpen && currentClub) {
      fetchMedia();
    }
  }, [isOpen, currentClub]);

  const fetchMedia = async () => {
    if (!currentClub?.clubId) return;

    try {
      setLoading(true);
      const { data, error} = await supabase
        .from('event_media')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('media_type', 'image')
        .eq('is_homepage_media', isHomepageMedia)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMedia(data || []);
    } catch (error) {
      console.error('Error fetching media:', error);
      addNotification('error', 'Failed to load media library');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !currentClub?.clubId) return;

    try {
      setUploading(true);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.type.startsWith('image/')) {
          addNotification('error', `${file.name} is not an image file`);
          continue;
        }

        // Compress image
        const options = {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true
        };

        const compressedFile = await imageCompression(file, options);

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${currentClub.clubId}/${fileName}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('event-media')
          .upload(filePath, compressedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('event-media')
          .getPublicUrl(filePath);

        // Create thumbnail for images
        let thumbnailUrl: string | undefined;
        if (file.type.startsWith('image/')) {
          const thumbnailOptions = {
            maxSizeMB: 0.1,
            maxWidthOrHeight: 300,
            useWebWorker: true
          };
          const thumbnailFile = await imageCompression(file, thumbnailOptions);
          const thumbnailPath = `${currentClub.clubId}/thumbnails/${fileName}`;

          const { error: thumbError } = await supabase.storage
            .from('event-media')
            .upload(thumbnailPath, thumbnailFile, {
              cacheControl: '3600',
              upsert: false
            });

          if (!thumbError) {
            const { data: thumbUrlData } = supabase.storage
              .from('event-media')
              .getPublicUrl(thumbnailPath);
            thumbnailUrl = thumbUrlData.publicUrl;
          }
        }

        // Save metadata to database
        const { error: dbError } = await supabase
          .from('event_media')
          .insert({
            club_id: currentClub.clubId,
            title: file.name,
            url: urlData.publicUrl,
            thumbnail_url: thumbnailUrl,
            media_type: 'image',
            is_homepage_media: isHomepageMedia
          });

        if (dbError) throw dbError;
      }

      addNotification('success', `${files.length} file(s) uploaded successfully`);
      await fetchMedia();
    } catch (error) {
      console.error('Error uploading files:', error);
      addNotification('error', 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: EventMedia) => {
    if (!confirm(`Delete "${item.title || 'this image'}"? This action cannot be undone.`)) return;

    try {
      // Extract file path from URL
      const urlParts = item.url.split('/');
      const filePath = `${currentClub?.clubId}/${urlParts[urlParts.length - 1]}`;

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('event-media')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete thumbnail if exists
      if (item.thumbnail_url) {
        const thumbUrlParts = item.thumbnail_url.split('/');
        const thumbPath = `${currentClub?.clubId}/thumbnails/${thumbUrlParts[thumbUrlParts.length - 1]}`;
        await supabase.storage.from('event-media').remove([thumbPath]);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('event_media')
        .delete()
        .eq('id', item.id);

      if (dbError) throw dbError;

      addNotification('success', 'Media deleted successfully');
      await fetchMedia();
    } catch (error) {
      console.error('Error deleting media:', error);
      addNotification('error', 'Failed to delete media');
    }
  };

  const handleSelect = (item: EventMedia) => {
    if (allowMultiple) {
      const newSelected = new Set(selectedItems);
      if (newSelected.has(item.url)) {
        newSelected.delete(item.url);
      } else {
        newSelected.add(item.url);
      }
      setSelectedItems(newSelected);
    } else {
      onSelect(item.url);
      onClose();
    }
  };

  const handleConfirmSelection = () => {
    if (selectedItems.size > 0) {
      // For multiple selection, you might want to handle this differently
      // For now, just select the first one
      onSelect(Array.from(selectedItems)[0]);
      onClose();
    }
  };

  const filteredMedia = media.filter(item =>
    (item.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );


  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-6xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col ${
          darkMode ? 'bg-slate-800 text-white' : 'bg-white text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <h2 className="text-2xl font-bold">Media Library</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-700 text-slate-400'
                : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Toolbar */}
        <div className={`flex items-center justify-between p-4 border-b ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            {/* Upload Button */}
            <label
              className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                uploading
                  ? darkMode
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : darkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Upload size={18} />
              {uploading ? 'Uploading...' : 'Upload Images'}
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
              />
            </label>

            {/* Search */}
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                  darkMode ? 'text-slate-400' : 'text-gray-400'
                }`}
                size={18}
              />
              <input
                type="text"
                placeholder="Search media..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>

          <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            {filteredMedia.length} {filteredMedia.length === 1 ? 'item' : 'items'}
          </div>
        </div>

        {/* Media Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
                  Loading media...
                </p>
              </div>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <ImageIcon
                size={64}
                className={darkMode ? 'text-slate-600 mb-4' : 'text-gray-300 mb-4'}
              />
              <p className={`text-lg mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                {searchTerm ? 'No media found' : 'No media uploaded yet'}
              </p>
              <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                {searchTerm ? 'Try a different search term' : 'Upload your first image to get started'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredMedia.map((item) => (
                <div
                  key={item.id}
                  className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                    selectedItems.has(item.url)
                      ? 'border-blue-500 ring-2 ring-blue-500'
                      : darkMode
                      ? 'border-slate-700 hover:border-slate-600'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleSelect(item)}
                >
                  {/* Image */}
                  <img
                    src={item.thumbnail_url || item.url}
                    alt={item.title || 'Image'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* Selection Indicator */}
                  {selectedItems.has(item.url) && (
                    <div className="absolute top-2 right-2 bg-blue-600 rounded-full p-1">
                      <Check size={16} className="text-white" />
                    </div>
                  )}

                  {/* Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                    <p className="text-white text-sm font-medium text-center mb-2 line-clamp-2">
                      {item.title || 'Untitled'}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {allowMultiple && selectedItems.size > 0 && (
          <div className={`flex items-center justify-between p-4 border-t ${
            darkMode ? 'border-slate-700' : 'border-gray-200'
          }`}>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedItems(new Set())}
                className={`px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                Clear Selection
              </button>
              <button
                onClick={handleConfirmSelection}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Select
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
