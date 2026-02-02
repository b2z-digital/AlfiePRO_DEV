import React, { useState, useEffect } from 'react';
import { X, Upload, Image, Trash2, AlertTriangle, Check } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import imageCompression from 'browser-image-compression';

interface MediaUploadGalleryProps {
  media: any[];
  onMediaChange: (mediaItems: any[]) => void;
  darkMode: boolean;
  eventId: string;
  clubId: string;
  eventName?: string;
  raceClass?: string;
  eventType?: 'quick_race' | 'series_round' | 'public_event';
}

export const MediaUploadGallery: React.FC<MediaUploadGalleryProps> = ({
  media,
  onMediaChange,
  darkMode,
  eventId,
  clubId,
  eventName,
  raceClass,
  eventType
}) => {
  const [mediaItems, setMediaItems] = useState<any[]>(media || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { currentClub } = useAuth();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Update media items when props change
    setMediaItems(media || []);
  }, [media]);

  const handleFiles = async (files: FileList) => {
    if (!files || files.length === 0) return;
    
    setUploading(true);
    setError(null);
    
    try {
      // Use the event-media bucket directly
      const bucketName = 'event-media';
      
      const uploadedItems = [];
      
      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        // Compress image if it's an image file
        if (file.type.startsWith('image/')) {
          try {
            const options = {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
              fileType: file.type
            };
            file = await imageCompression(file, options);
          } catch (compressionError) {
            console.error('Error compressing image:', compressionError);
            // Continue with original file if compression fails
          }
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;

        // Create folder path based on club ID if available
        const folderPath = clubId || currentClub?.clubId
          ? `${clubId || currentClub?.clubId}/${fileName}`
          : fileName;

        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(folderPath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        if (error) {
          console.error('Error uploading file:', error);
          throw error;
        }
        
        if (data) {
          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from(bucketName)
            .getPublicUrl(data.path);

          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          const mediaType = isImage ? 'image' : 'youtube_video';

          // Insert into event_media table for media center
          const { error: dbError } = await supabase
            .from('event_media')
            .insert({
              club_id: clubId || currentClub?.clubId,
              url: publicUrl,
              media_type: mediaType,
              title: file.name,
              description: null,
              event_ref_id: eventId || null,
              event_ref_type: eventType || 'quick_race',
              event_name: eventName || null,
              race_class: raceClass || null,
              is_homepage_media: false,
            });

          if (dbError) {
            console.error('Error inserting into event_media:', dbError);
          }

          uploadedItems.push({
            id: data.id || `${Date.now()}-${i}`,
            type: isImage ? 'image' : isVideo ? 'video' : 'file',
            url: publicUrl,
            title: file.name,
            description: '',
            createdAt: new Date().toISOString(),
            createdBy: 'user'
          });
        }
      }
      
      // Update state with new media items
      const updatedItems = [...mediaItems, ...uploadedItems];
      setMediaItems(updatedItems);
      
      // Notify parent component
      onMediaChange(updatedItems);
      
      setSuccess('Files uploaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error handling files:', err);
      setError(err instanceof Error ? err.message : 'Error uploading files');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveItem = async (index: number) => {
    const itemToRemove = mediaItems[index];

    try {
      // Extract storage path from URL
      if (itemToRemove.url) {
        const urlParts = itemToRemove.url.split('/');
        const bucketIndex = urlParts.findIndex(part => part === 'event-media');

        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
          // Get the path after the bucket name
          const pathParts = urlParts.slice(bucketIndex + 1);
          const storagePath = decodeURIComponent(pathParts.join('/').split('?')[0]);

          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('event-media')
            .remove([storagePath]);

          if (storageError) {
            console.error('Error deleting from storage:', storageError);
          }
        }
      }

      // Delete from database if it has an id
      if (itemToRemove.id) {
        const { error: dbError } = await supabase
          .from('event_media')
          .delete()
          .eq('id', itemToRemove.id);

        if (dbError) {
          console.error('Error deleting from database:', dbError);
          setError('Failed to delete media from database');
          return;
        }
      }

      const updatedItems = [...mediaItems];
      updatedItems.splice(index, 1);
      setMediaItems(updatedItems);
      onMediaChange(updatedItems);
      setSuccess('Media deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting media:', err);
      setError('Failed to delete media');
    }
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Prepare slides for lightbox
  const slides = mediaItems
    .filter(item => item.type === 'image' || item.media_type === 'image')
    .map(item => ({ src: item.url, alt: item.title || 'Image' }));

  return (
    <div className="space-y-6">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-300">
                {error}
              </h3>
            </div>
          </div>
        </div>
      )}
      
      {success && (
        <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-300">
                {success}
              </h3>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        multiple
        accept="image/*,video/*,application/pdf"
        disabled={uploading}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Upload Tile */}
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer
            aspect-square flex items-center justify-center
            ${dragActive
              ? 'border-green-500 bg-green-900/20'
              : darkMode
                ? 'border-slate-600 hover:border-green-500/50 hover:bg-slate-700/50'
                : 'border-slate-300 hover:border-green-500/50 hover:bg-slate-100'}
          `}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-center">
            {uploading ? (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-2"></div>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Uploading...
                </p>
              </div>
            ) : (
              <>
                <Upload className={`mx-auto h-10 w-10 mb-2 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                <p className={`font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Upload Media
                </p>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Click to add images or videos
                </p>
              </>
            )}
          </div>
        </div>

        {/* Existing Media */}
        {mediaItems.map((item, index) => (
          <div 
            key={item.id || index}
            className={`
              relative rounded-lg overflow-hidden border group
              ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}
            `}
          >
            {(item.type === 'image' || item.media_type === 'image') ? (
              <div
                className="aspect-square cursor-pointer"
                onClick={() => openLightbox(mediaItems.filter(i => i.type === 'image' || i.media_type === 'image').findIndex(i => i.id === item.id))}
              >
                <img
                  src={item.url}
                  alt={item.title || 'Media item'}
                  className="w-full h-full object-cover transition-transform hover:scale-105"
                />
              </div>
            ) : (item.type === 'video' || item.media_type === 'video') ? (
              <div className="aspect-square bg-black flex items-center justify-center">
                <video 
                  src={item.url} 
                  className="max-w-full max-h-full"
                  controls
                />
              </div>
            ) : (
              <div className="aspect-square flex items-center justify-center bg-slate-700">
                <div className={`text-center p-4 ${darkMode ? 'text-slate-300' : 'text-slate-100'}`}>
                  {item.title || 'File'}
                </div>
              </div>
            )}
            
            <button
              onClick={() => handleRemoveItem(index)}
              className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <Trash2 size={14} />
            </button>

            {item.title && (
              <div className={`absolute bottom-0 left-0 right-0 p-2 text-xs truncate bg-gradient-to-t from-black/80 to-transparent text-white`}>
                {item.title}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox component */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={slides}
        plugins={[Zoom, Thumbnails]}
        carousel={{
          finite: slides.length <= 1
        }}
        thumbnails={{
          position: "bottom",
          width: 120,
          height: 80,
          border: 2,
          borderRadius: 4,
          padding: 4,
          gap: 16
        }}
        zoom={{
          scrollToZoom: true,
          maxZoomPixelRatio: 3
        }}
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, .9)" },
          thumbnailsContainer: { backgroundColor: "rgba(0, 0, 0, .8)" },
          thumbnail: { backgroundColor: "rgba(30, 41, 59, .8)" }
        }}
      />
    </div>
  );
};