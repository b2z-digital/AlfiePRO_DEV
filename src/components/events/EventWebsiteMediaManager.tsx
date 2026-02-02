import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Upload, ChevronDown, Play, Eye, Trash2, Camera, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { EventMedia } from '../../types/media';
import { ImageUploadModal } from '../ImageUploadModal';
import { UploadVideoModal } from '../UploadVideoModal';
import { AddYouTubeUrlModal } from '../AddYouTubeUrlModal';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface EventWebsiteMediaManagerProps {
  websiteId: string;
  eventId: string;
}

export const EventWebsiteMediaManager: React.FC<EventWebsiteMediaManagerProps> = ({ websiteId, eventId }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [media, setMedia] = useState<EventMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showImageUploadModal, setShowImageUploadModal] = useState(false);
  const [showVideoUploadModal, setShowVideoUploadModal] = useState(false);
  const [showYouTubeUrlModal, setShowYouTubeUrlModal] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  console.log('EventWebsiteMediaManager - eventId:', eventId, 'websiteId:', websiteId);

  useEffect(() => {
    fetchMedia();
  }, [eventId, currentClub?.clubId]);

  const fetchMedia = async () => {
    if (!currentClub?.clubId || !eventId) {
      console.log('Missing required data:', { clubId: currentClub?.clubId, eventId });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Fetching media for:', { clubId: currentClub.clubId, eventId });

      const { data, error } = await supabase
        .from('event_media')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('event_ref_id', eventId)
        .eq('is_homepage_media', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Media fetched:', data?.length || 0, 'items');
      setMedia(data || []);
    } catch (error) {
      console.error('Error fetching media:', error);
      addNotification('error', 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (mediaId: string) => {
    if (!confirm('Are you sure you want to delete this media?')) return;

    try {
      const { error } = await supabase
        .from('event_media')
        .delete()
        .eq('id', mediaId);

      if (error) throw error;

      addNotification('Media deleted successfully', 'success');
      fetchMedia();
    } catch (error) {
      console.error('Error deleting media:', error);
      addNotification('Failed to delete media', 'error');
    }
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const imageMedia = media.filter(m => m.media_type === 'image');
  const lightboxSlides = imageMedia.map(m => ({ src: m.url }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-white">Media Gallery</h3>
          <p className="text-sm text-slate-400 mt-1">Manage photos and videos for your event website</p>
        </div>

        {/* Upload Media Split Button */}
        <div className="relative">
          <div className="flex">
            <button
              onClick={() => setShowImageUploadModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-l-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl font-semibold"
            >
              <Upload size={18} />
              <span>Upload Media</span>
            </button>
            <button
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              className="px-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-r-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl border-l border-green-700/50"
            >
              <ChevronDown size={18} />
            </button>
          </div>

          {showUploadMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-xl border border-slate-700/50 py-2 z-50">
              <button
                onClick={() => {
                  setShowImageUploadModal(true);
                  setShowUploadMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-white hover:bg-slate-700/50 transition-colors flex items-center gap-3"
              >
                <ImageIcon size={18} className="text-cyan-400" />
                Upload Images
              </button>
              <button
                onClick={() => {
                  setShowVideoUploadModal(true);
                  setShowUploadMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-white hover:bg-slate-700/50 transition-colors flex items-center gap-3"
              >
                <Upload size={18} className="text-purple-400" />
                Upload Video
              </button>
              <button
                onClick={() => {
                  setShowYouTubeUrlModal(true);
                  setShowUploadMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-white hover:bg-slate-700/50 transition-colors flex items-center gap-3"
              >
                <Play size={18} className="text-red-400" />
                Add YouTube URL
              </button>
            </div>
          )}
        </div>
      </div>

      {media.length === 0 ? (
        <div className="relative overflow-hidden bg-slate-800/50 backdrop-blur-sm rounded-2xl p-16 border border-slate-700/50">
          <div className="relative text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-cyan-500/10 mb-6">
              <Camera className="w-10 h-10 text-cyan-400" />
            </div>
            <h4 className="text-2xl font-bold text-white mb-3">No Media Yet</h4>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Start building your event website gallery by uploading photos and videos
            </p>
            <button
              onClick={() => setShowImageUploadModal(true)}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
            >
              <Sparkles size={20} />
              Upload Your First Media
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {media.map((item, index) => (
            <div
              key={item.id}
              className="group relative bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700/50 hover:border-slate-600 transition-all aspect-square cursor-pointer"
            >
              {item.media_type === 'image' ? (
                <>
                  <img
                    src={item.url}
                    alt={item.title || 'Event media'}
                    className="w-full h-full object-cover"
                    onClick={() => openLightbox(imageMedia.findIndex(m => m.id === item.id))}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      {item.title && (
                        <p className="text-white text-sm font-medium truncate mb-2">{item.title}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openLightbox(imageMedia.findIndex(m => m.id === item.id));
                          }}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                        >
                          <Eye size={14} />
                          View
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full h-full bg-slate-900/50 flex items-center justify-center">
                    <Play className="w-12 h-12 text-red-400" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      {item.title && (
                        <p className="text-white text-sm font-medium truncate mb-2">{item.title}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-700/80 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Play size={14} />
                          Watch
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          className="px-3 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Modals */}
      <ImageUploadModal
        isOpen={showImageUploadModal}
        onClose={() => setShowImageUploadModal(false)}
        darkMode={true}
        preselectedEventId={eventId}
        onSuccess={() => {
          setShowImageUploadModal(false);
          fetchMedia();
        }}
      />

      <UploadVideoModal
        isOpen={showVideoUploadModal}
        onClose={() => setShowVideoUploadModal(false)}
        darkMode={true}
        preselectedEventId={eventId}
        preselectedEventType="quick_race"
        onSuccess={() => {
          setShowVideoUploadModal(false);
          fetchMedia();
        }}
      />

      <AddYouTubeUrlModal
        isOpen={showYouTubeUrlModal}
        onClose={() => setShowYouTubeUrlModal(false)}
        darkMode={true}
        preselectedEventId={eventId}
        onSuccess={() => {
          setShowYouTubeUrlModal(false);
          fetchMedia();
        }}
      />

      {/* Lightbox for images */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />
    </div>
  );
};
