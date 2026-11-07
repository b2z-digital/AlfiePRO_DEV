import React, { useState, useCallback, useRef } from 'react';
import { AlfieIcon } from './brand/AlfieIcon';
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
        .neq('is_simulated', true)
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
    let successCount = 0;
    let errorCount = 0;

    for (const image of images) {
      if (image.status === 'success') { successCount++; continue; } // already uploaded on an earlier try
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
        successCount++;
      } catch (error) {
        errorCount++;
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

  const pendingCount = images.filter(img => img.status !== 'success').length;
  const doneCount = images.length - pendingCount;
  const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-6">
      <div className="a-veil absolute inset-0 backdrop-blur-[2px]" onClick={() => !uploading && handleClose()} aria-hidden="true" />
      <section
        className="a-sheet a-md-sheet relative w-full max-w-5xl flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="a-md-up-title"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <header className="a-sheet-head a-md-sheet-head">
          <span className="a-tile a-tile-rim" style={{ width: 44, height: 44 }}><AlfieIcon glyph="image" size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="a-md-up-title" className="a-display a-ink m-0 text-[20px] font-semibold leading-tight">Upload Images</h2>
            <p className="a-mute m-0 mt-0.5 text-[13.5px]">Upload multiple images to your media center</p>
          </div>
          <button type="button" onClick={handleClose} disabled={uploading} className="a-ib" aria-label="Close">
            <AlfieIcon glyph="x" size={20} />
          </button>
        </header>

        <div className="a-md-sheet-body">
          {images.length === 0 ? (
            <label className={`a-md-drop ${dragActive ? 'is-drag' : ''}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
              <span className="a-md-drop-ic"><AlfieIcon glyph={dragActive ? 'download' : 'image'} size={30} /></span>
              <b>{dragActive ? 'Drop your images here' : 'Drag and drop images'}</b>
              <span>or click to browse (supports multiple selection)</span>
              <span className="a-btn a-btn-p a-md-drop-btn"><AlfieIcon glyph="upload" size={16} />Choose Images</span>
              <small>Images will be automatically compressed to maintain quality while reducing file size</small>
            </label>
          ) : (
            <>
              <div className="a-md-up-top">
                <div className="min-w-0">
                  <h3 className="a-ink m-0 text-[16px] font-semibold">{images.length} image{images.length === 1 ? '' : 's'} selected</h3>
                  <p className="a-mute m-0 mt-0.5 text-[13px]">
                    {uploading ? `Uploading… ${doneCount} of ${images.length} done` : 'Give each one a title, or keep the file name. Drop more images anywhere here.'}
                  </p>
                </div>
                <label className={`a-btn ${uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                  <AlfieIcon glyph="plus" size={16} />
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

              {uploading && (
                <div className="a-md-progress" aria-hidden="true"><span style={{ width: `${(doneCount / Math.max(images.length, 1)) * 100}%` }} /></div>
              )}

              <label className="a-md-fl">
                <span>Event (Optional)</span>
                <select
                  value={selectedEventId}
                  onChange={(e) => handleEventChange(e.target.value)}
                  disabled={uploading}
                  className="a-inp"
                >
                  <option value="">No event - General media</option>
                  {availableEvents.map(event => (
                    <option key={`${event.type}-${event.id}`} value={event.id}>
                      {event.name} {event.date && `(${new Date(event.date).toLocaleDateString()})`}
                    </option>
                  ))}
                </select>
                <small>Allocate images to an event for better organization and reporting</small>
              </label>

              <div className={`a-md-up-grid ${dragActive ? 'is-drag' : ''}`}>
                {images.map((image) => (
                  <div key={image.id} className={`a-md-up-card is-${image.status}`}>
                    <div className="a-md-up-thumb">
                      <img src={image.preview} alt={image.title} />
                      {image.status === 'uploading' && (
                        <span className="a-md-up-state"><span className="a-nw-spin a-nw-spin-lg" /></span>
                      )}
                      {image.status === 'success' && (
                        <span className="a-md-up-state is-ok"><AlfieIcon glyph="check" size={22} strokeWidth={2.4} /></span>
                      )}
                      {image.status === 'error' && (
                        <span className="a-md-up-state is-err"><AlfieIcon glyph="warn" size={22} /></span>
                      )}
                      {image.status !== 'uploading' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(image.id)}
                          disabled={uploading}
                          className="a-nw-gb a-nw-gb-d a-md-up-rm"
                          aria-label={`Remove ${image.title}`}
                        >
                          <AlfieIcon glyph="trash" size={14} />
                        </button>
                      )}
                      <span className="a-md-up-size">{formatSize(image.compressed?.size || image.file.size)}</span>
                    </div>
                    <div className="a-md-up-fields">
                      <input
                        type="text"
                        value={image.title}
                        onChange={(e) => updateImageField(image.id, 'title', e.target.value)}
                        disabled={uploading}
                        placeholder="Image title"
                        aria-label="Image title"
                        className="a-inp a-md-up-title"
                      />
                      <textarea
                        value={image.description}
                        onChange={(e) => updateImageField(image.id, 'description', e.target.value)}
                        disabled={uploading}
                        placeholder="Description (optional)"
                        aria-label="Description"
                        rows={2}
                        className="a-inp a-md-up-desc"
                      />
                      {image.status === 'error' && (
                        <p className="a-md-up-err">{image.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {images.length > 0 && (
          <footer className="a-sheet-foot a-md-sheet-foot">
            <button onClick={handleClose} disabled={uploading} className="a-btn a-btn-q">
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || images.length === 0 || pendingCount === 0}
              className="a-btn a-btn-p a-md-foot-main"
            >
              {pendingCount === 0 ? (
                <>
                  <AlfieIcon glyph="check" size={17} />
                  Uploaded
                </>
              ) : uploading ? (
                <>
                  <span className="a-nw-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <AlfieIcon glyph="upload" size={17} />
                  Upload {pendingCount || images.length} Image{(pendingCount || images.length) === 1 ? '' : 's'}
                </>
              )}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
};
