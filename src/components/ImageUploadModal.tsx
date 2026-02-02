import React, { useState, useCallback, useRef } from 'react';
import { LogOut, Upload, Image as ImageIcon, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNotifications } from '../contexts/NotificationContext';

interface ImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  onSuccess: () => void;
  preselectedEventId?: string;
}

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  title: string;
  description: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  compressed?: File;
}

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  onSuccess,
  preselectedEventId,
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [selectedEventName, setSelectedEventName] = useState('');
  const [selectedRaceClass, setSelectedRaceClass] = useState('');
  const [availableEvents, setAvailableEvents] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen && currentClub?.clubId) {
      fetchAvailableEvents();
    }
  }, [isOpen, currentClub]);

  React.useEffect(() => {
    if (preselectedEventId && availableEvents.length > 0) {
      console.log('Attempting to preselect event:', preselectedEventId);
      console.log('Available events:', availableEvents.map(e => ({ id: e.id, name: e.name, type: e.type })));
      const event = availableEvents.find(e => e.id === preselectedEventId);
      console.log('Found event:', event);
      if (event) {
        setSelectedEventId(event.id);
        setSelectedEventType(event.type);
        setSelectedEventName(event.name);
        setSelectedRaceClass(event.raceClass || '');
      } else {
        console.warn('Event not found in available events list');
      }
    }
  }, [preselectedEventId, availableEvents]);

  const fetchAvailableEvents = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: quickRaces, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_class, race_date')
        .eq('club_id', currentClub.clubId)
        .order('race_date', { ascending: false });

      if (quickRacesError) throw quickRacesError;

      const { data: raceSeries, error: raceSeriesError } = await supabase
        .from('race_series')
        .select('id, series_name, race_class, rounds')
        .eq('club_id', currentClub.clubId)
        .order('created_at', { ascending: false });

      if (raceSeriesError) throw raceSeriesError;

      const { data: publicEvents, error: publicEventsError } = await supabase
        .from('public_events')
        .select('id, event_name, race_class, date')
        .order('date', { ascending: false });

      if (publicEventsError) throw publicEventsError;

      const seriesRounds: any[] = [];
      (raceSeries || []).forEach(series => {
        if (series.rounds && Array.isArray(series.rounds)) {
          series.rounds.forEach((round: any, index: number) => {
            seriesRounds.push({
              id: `${series.id}-round-${index}`,
              name: `${round.name || `Round ${index + 1}`} - ${series.series_name}`,
              race_class: series.race_class,
              type: 'series_round',
              date: round.date,
              seriesId: series.id,
              roundIndex: index
            });
          });
        }
      });

      const allEvents = [
        ...(quickRaces || []).map(event => ({
          id: event.id,
          name: event.event_name || 'Quick Race',
          race_class: event.race_class,
          type: 'quick_race',
          date: event.race_date
        })),
        ...seriesRounds,
        ...(publicEvents || []).map(event => ({
          id: event.id,
          name: event.event_name,
          race_class: event.race_class,
          type: 'public_event',
          date: event.date
        }))
      ].sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      setAvailableEvents(allEvents);
    } catch (err) {
      console.error('Error fetching available events:', err);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Max dimensions
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.85
          );
        };
      };
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      addNotification('error', 'Please select valid image files');
      return;
    }

    // Check file sizes before compression
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const oversized = imageFiles.filter(file => file.size > MAX_SIZE);
    if (oversized.length > 0) {
      addNotification('error', `${oversized.length} file(s) exceed 50MB limit`);
      return;
    }

    const newImages: UploadedImage[] = [];

    for (const file of imageFiles) {
      const compressed = await compressImage(file);
      const preview = URL.createObjectURL(compressed);

      newImages.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        compressed,
        preview,
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: '',
        status: 'pending'
      });
    }

    setImages(prev => [...prev, ...newImages]);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const handleEventChange = (eventId: string) => {
    const selectedEvent = availableEvents.find(event => event.id === eventId);
    if (selectedEvent) {
      setSelectedEventId(selectedEvent.id);
      setSelectedEventType(selectedEvent.type);
      setSelectedEventName(selectedEvent.name);
      setSelectedRaceClass(selectedEvent.race_class);
    } else {
      setSelectedEventId('');
      setSelectedEventType('');
      setSelectedEventName('');
      setSelectedRaceClass('');
    }
  };

  const updateImageField = (id: string, field: 'title' | 'description', value: string) => {
    setImages(prev =>
      prev.map(img => (img.id === id ? { ...img, [field]: value } : img))
    );
  };

  const handleUpload = async () => {
    if (!currentClub?.clubId) return;
    if (images.length === 0) {
      addNotification('error', 'Please select at least one image');
      return;
    }

    setUploading(true);

    for (const image of images) {
      try {
        setImages(prev =>
          prev.map(img => (img.id === image.id ? { ...img, status: 'uploading' } : img))
        );

        const fileToUpload = image.compressed || image.file;
        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${currentClub.clubId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

        const { data, error: uploadError } = await supabase.storage
          .from('event-media')
          .upload(fileName, fileToUpload, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event-media')
          .getPublicUrl(data.path);

        const { error: dbError } = await supabase
          .from('event_media')
          .insert({
            club_id: currentClub.clubId,
            url: publicUrl,
            media_type: 'image',
            title: image.title,
            description: image.description || null,
            event_ref_id: selectedEventId || null,
            event_ref_type: selectedEventType || null,
            event_name: selectedEventName || null,
            race_class: selectedRaceClass || null,
            is_homepage_media: false,
          });

        if (dbError) throw dbError;

        setImages(prev =>
          prev.map(img => (img.id === image.id ? { ...img, status: 'success' } : img))
        );
      } catch (error) {
        console.error('Error uploading image:', error);
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        addNotification('error', `Failed to upload ${image.title}: ${errorMessage}`);
        setImages(prev =>
          prev.map(img =>
            img.id === image.id
              ? { ...img, status: 'error', error: errorMessage }
              : img
          )
        );
      }
    }

    setUploading(false);

    const successCount = images.filter(img => img.status === 'success').length;
    const errorCount = images.filter(img => img.status === 'error').length;

    if (successCount > 0) {
      addNotification('success', `Successfully uploaded ${successCount} image(s)`);
    }
    if (errorCount > 0) {
      addNotification('error', `Failed to upload ${errorCount} image(s)`);
    }

    if (errorCount === 0) {
      setTimeout(() => {
        handleClose();
        onSuccess();
      }, 1000);
    }
  };

  const handleClose = () => {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setSelectedEventId('');
    setSelectedEventType('');
    setSelectedEventName('');
    setSelectedRaceClass('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold">Upload Images</h2>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Upload multiple images to your media center
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={uploading}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {images.length === 0 && (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                dragActive
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : darkMode
                  ? 'border-gray-700 hover:border-gray-600'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <ImageIcon className={`w-16 h-16 mx-auto mb-4 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
              <h3 className="text-xl font-semibold mb-2">
                {dragActive ? 'Drop your images here' : 'Drag and drop images'}
              </h3>
              <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                or click to browse (supports multiple selection)
              </p>
              <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
                <Upload className="w-5 h-5" />
                Choose Images
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className={`mt-4 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Images will be automatically compressed to maintain quality while reducing file size
              </p>
            </div>
          )}

          {images.length > 0 && (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{images.length} Image(s) Selected</h3>
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors text-sm">
                    <Upload className="w-4 h-4" />
                    Add More
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInput}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Event (Optional)
                  </label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => handleEventChange(e.target.value)}
                    disabled={uploading}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">No event - General media</option>
                    {availableEvents.map(event => (
                      <option key={`${event.type}-${event.id}`} value={event.id}>
                        {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                      </option>
                    ))}
                  </select>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Allocate images to an event for better organization and reporting
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {images.map((image) => (
                  <div
                    key={image.id}
                    className={`p-4 rounded-lg border ${
                      darkMode ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'
                    } ${image.status === 'success' ? 'ring-2 ring-green-500' : ''}
                    ${image.status === 'error' ? 'ring-2 ring-red-500' : ''}`}
                  >
                    <div className="flex gap-4">
                      <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden">
                        <img src={image.preview} alt={image.title} className="w-full h-full object-cover" />
                        {image.status === 'uploading' && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                          </div>
                        )}
                        {image.status === 'success' && (
                          <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                          </div>
                        )}
                        {image.status === 'error' && (
                          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <input
                          type="text"
                          value={image.title}
                          onChange={(e) => updateImageField(image.id, 'title', e.target.value)}
                          disabled={uploading}
                          placeholder="Image title"
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        />
                        <textarea
                          value={image.description}
                          onChange={(e) => updateImageField(image.id, 'description', e.target.value)}
                          disabled={uploading}
                          placeholder="Description (optional)"
                          rows={2}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        />
                        {image.status === 'error' && (
                          <p className="text-xs text-red-500">{image.error}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            {(image.compressed?.size || image.file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          {image.status !== 'uploading' && (
                            <button
                              onClick={() => handleRemoveImage(image.id)}
                              disabled={uploading}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {images.length > 0 && (
          <div className="flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              disabled={uploading}
              className={`px-6 py-3 rounded-lg font-medium ${
                darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || images.length === 0}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors ${
                uploading || images.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload {images.length} Image(s)
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
