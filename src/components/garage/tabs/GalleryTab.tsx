import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { useNotifications } from '../../../contexts/NotificationContext';
import { useAuth } from '../../../contexts/AuthContext';
import imageCompression from 'browser-image-compression';

interface GalleryTabProps {
  boatId: string;
  darkMode: boolean;
}

interface BoatImage {
  id: string;
  image_url: string;
  caption?: string;
  created_at: string;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({ boatId, darkMode }) => {
  const { addNotification } = useNotifications();
  const { currentClub } = useAuth();
  const [images, setImages] = useState<BoatImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchImages();
  }, [boatId]);

  const fetchImages = async () => {
    try {
      const { data, error } = await supabase
        .from('boat_images')
        .select('*')
        .eq('boat_id', boatId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImages(data || []);
    } catch (err) {
      console.error('Error fetching images:', err);
      addNotification('error', 'Failed to load gallery images');
    } finally {
      setLoading(false);
    }
  };

  const handleFiles = async (files: FileList) => {
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const uploadedImages = [];

      for (let i = 0; i < files.length; i++) {
        let file = files[i];

        if (!file.type.startsWith('image/')) {
          addNotification('error', `${file.name} is not an image file`);
          continue;
        }

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
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${boatId}-${Date.now()}-${i}.${fileExt}`;
        const filePath = `${currentClub?.clubId}/boats/${fileName}`;

        const { error: uploadError, data } = await supabase.storage
          .from('media')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          addNotification('error', `Failed to upload ${file.name}`);
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);

        const { data: insertData, error: dbError } = await supabase
          .from('boat_images')
          .insert({
            boat_id: boatId,
            image_url: publicUrlData.publicUrl,
            is_primary: false,
            caption: null
          })
          .select()
          .single();

        if (dbError) {
          console.error('Error saving to database:', dbError);
          continue;
        }

        if (insertData) {
          uploadedImages.push(insertData);
        }
      }

      if (uploadedImages.length > 0) {
        setImages([...uploadedImages, ...images]);
        addNotification('success', `${uploadedImages.length} image(s) uploaded successfully`);
      }
    } catch (err) {
      console.error('Error handling files:', err);
      addNotification('error', 'Failed to upload images');
    } finally {
      setUploading(false);
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

  const handleDeleteImage = async (imageId: string, imageUrl: string) => {
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part === 'media');

      if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
        const pathParts = urlParts.slice(bucketIndex + 1);
        const storagePath = decodeURIComponent(pathParts.join('/').split('?')[0]);

        await supabase.storage.from('media').remove([storagePath]);
      }

      const { error } = await supabase
        .from('boat_images')
        .delete()
        .eq('id', imageId);

      if (error) throw error;

      setImages(images.filter(img => img.id !== imageId));
      addNotification('success', 'Image deleted successfully');
    } catch (err) {
      console.error('Error deleting image:', err);
      addNotification('error', 'Failed to delete image');
    }
  };

  if (loading) {
    return (
      <div className={`
        rounded-2xl p-12 text-center
        ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
      `}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Loading gallery...</p>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />

      {/* Image Grid with Upload Card */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* Upload Card - First Position */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`
            relative aspect-square rounded-xl border-2 border-dashed transition-all cursor-pointer
            ${dragActive
              ? 'border-cyan-500 bg-cyan-500/10'
              : darkMode
                ? 'border-slate-700 bg-slate-800 hover:bg-slate-700/50 hover:border-slate-600'
                : 'border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400'}
          `}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mb-2"></div>
                <p className={`text-xs font-medium text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Uploading...
                </p>
              </>
            ) : (
              <>
                <Upload className={`w-8 h-8 mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <p className={`text-xs font-bold text-center mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Add Photos
                </p>
                <p className={`text-[10px] text-center ${darkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  Click or drop
                </p>
              </>
            )}
          </div>
        </div>

        {/* Existing Images */}
        {images.map((image) => (
          <div
            key={image.id}
            className={`
              group relative aspect-square rounded-xl overflow-hidden
              ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}
            `}
          >
            <img
              src={image.image_url}
              alt={image.caption || 'Boat photo'}
              className="w-full h-full object-cover"
            />

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                onClick={() => handleDeleteImage(image.id, image.image_url)}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                title="Delete image"
              >
                <Trash2 size={18} />
              </button>
            </div>

            {/* Primary badge if applicable */}
            {image.is_primary && (
              <div className="absolute top-2 right-2 px-2 py-1 bg-yellow-500 text-white text-xs font-bold rounded-full">
                Primary
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State - only show if no images at all */}
      {images.length === 0 && (
        <div className={`
          rounded-2xl p-8 text-center mt-6
          ${darkMode ? 'bg-slate-800/50 border border-slate-700' : 'bg-slate-50 border border-slate-200'}
        `}>
          <Camera className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
          <h3 className={`text-lg font-bold mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            No photos yet
          </h3>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Click the card above to upload photos of your boat
          </p>
        </div>
      )}
    </div>
  );
};
