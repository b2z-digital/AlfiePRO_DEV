import React, { useState, useEffect } from 'react';
import { LogOut, Plus, Trash2, GripVertical, Save, Loader2, Image as ImageIcon, Upload, Video } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import imageCompression from 'browser-image-compression';
import { useNotification } from '../../contexts/NotificationContext';

interface SlideButton {
  id: string;
  text: string;
  url: string;
  link_type: string;
  bg_color: string;
  text_color: string;
  event_id?: string | null;
}

interface SliderSlide {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  media_type?: string;
  video_url?: string;
  button_text: string;
  button_url: string;
  link_type: string;
  button_bg_color: string;
  button_text_color: string;
  display_order: number;
  buttons?: SlideButton[];
  overlay_type?: string;
  overlay_color?: string;
  overlay_gradient_start?: string;
  overlay_gradient_end?: string;
  overlay_gradient_direction?: string;
  overlay_opacity?: number;
  logo_url?: string;
  logo_size?: number;
}

interface GroupedEvent {
  id: string;
  event_name: string;
  is_primary: boolean;
  display_order: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  websiteId: string;
  widgetId: string;
}

const extractYouTubeId = (url: string): string => {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : '';
};

interface SortableSlideProps {
  slide: SliderSlide;
  onEdit: (slide: SliderSlide) => void;
  onDelete: (id: string) => void;
}

const SortableSlide: React.FC<SortableSlideProps> = ({ slide, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-slate-700 rounded-lg border border-slate-600"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="w-5 h-5 text-slate-400" />
      </div>

      <div className="w-20 h-14 bg-slate-600 rounded overflow-hidden flex-shrink-0">
        {slide.image_url ? (
          <img src={slide.image_url} alt={slide.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-slate-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {slide.title || 'Untitled Slide'}
        </div>
        {slide.subtitle && (
          <div className="text-xs text-slate-400 truncate">{slide.subtitle}</div>
        )}
      </div>

      <button
        onClick={() => onEdit(slide)}
        className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors"
      >
        Edit
      </button>

      <button
        onClick={() => onDelete(slide.id)}
        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

interface SortableButtonItemProps {
  button: SlideButton;
  event: any;
  index: number;
  onUpdate: (button: SlideButton) => void;
}

const SortableButtonItem: React.FC<SortableButtonItemProps> = ({ button, event, index, onUpdate }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: button.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="p-4 bg-slate-700 rounded-lg border border-slate-600 space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-300">
          <GripVertical className="w-5 h-5" />
        </div>
        <h5 className="flex-1 font-medium text-white">{event?.event_name || 'Event'}</h5>
        {event?.is_primary && (
          <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">
            Primary Event
          </span>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">
          Button Text
        </label>
        <input
          type="text"
          value={button.text}
          onChange={(e) => onUpdate({ ...button, text: e.target.value })}
          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
          placeholder={`Register for ${event?.event_name}`}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300 mb-1">
          Button Action
        </label>
        <select
          value={button.link_type}
          onChange={(e) => onUpdate({ ...button, link_type: e.target.value })}
          className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
        >
          <option value="registration">Register for {event?.event_name}</option>
          <option value="custom">Custom URL</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={button.bg_color}
              onChange={(e) => onUpdate({ ...button, bg_color: e.target.value })}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={button.bg_color}
              onChange={(e) => onUpdate({ ...button, bg_color: e.target.value })}
              className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Text Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={button.text_color}
              onChange={(e) => onUpdate({ ...button, text_color: e.target.value })}
              className="w-10 h-10 rounded cursor-pointer"
            />
            <input
              type="text"
              value={button.text_color}
              onChange={(e) => onUpdate({ ...button, text_color: e.target.value })}
              className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const SliderManagementModal: React.FC<Props> = ({ isOpen, onClose, websiteId, widgetId }) => {
  const { addNotification } = useNotification();
  const [slides, setSlides] = useState<SliderSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingSlide, setEditingSlide] = useState<SliderSlide | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [eventPages, setEventPages] = useState<Array<{ id: string; title: string; slug: string }>>([]);
  const [groupedEvents, setGroupedEvents] = useState<GroupedEvent[]>([]);
  const [slideButtons, setSlideButtons] = useState<SlideButton[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    image_url: '',
    media_type: 'image' as 'image' | 'video',
    video_url: '',
    button_text: '',
    button_url: '',
    link_type: 'custom',
    button_bg_color: '#ffffff',
    button_text_color: '#1f2937',
    overlay_type: 'none',
    overlay_color: '#000000',
    overlay_gradient_start: '#000000',
    overlay_gradient_end: '#ffffff',
    overlay_gradient_direction: 'to-bottom',
    overlay_opacity: 30,
    logo_url: '',
    logo_size: 100
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isOpen) {
      loadSlides();
      loadEventPages();
      loadGroupedEvents();
    }
  }, [isOpen, websiteId, widgetId]);

  const loadGroupedEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('event_website_all_events')
        .select('all_events')
        .eq('event_website_id', websiteId)
        .single();

      if (error) throw error;

      const events = data?.all_events || [];
      setGroupedEvents(events);
    } catch (error) {
      console.error('Error loading grouped events:', error);
    }
  };

  const loadEventPages = async () => {
    try {
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('id, title, slug')
        .eq('event_website_id', websiteId)
        .order('title');

      if (error) throw error;
      setEventPages(data || []);
    } catch (error) {
      console.error('Error loading event pages:', error);
    }
  };

  const loadSlides = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('event_slider_slides')
        .select('*')
        .eq('event_website_id', websiteId)
        .eq('widget_id', widgetId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setSlides(data || []);
    } catch (error) {
      console.error('Error loading slides:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setSlides((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleButtonDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setSlideButtons((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSaveOrder = async () => {
    try {
      setIsSaving(true);
      const updates = slides.map((slide, index) => ({
        id: slide.id,
        display_order: index
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('event_slider_slides')
          .update({ display_order: update.display_order })
          .eq('id', update.id);

        if (error) throw error;
      }

      addNotification('Slide order saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving order:', error);
      addNotification('Failed to save slide order', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNew = () => {
    setFormData({
      title: '',
      subtitle: '',
      image_url: '',
      media_type: 'image',
      video_url: '',
      button_text: '',
      button_url: '',
      link_type: 'custom',
      button_bg_color: '#ffffff',
      button_text_color: '#1f2937',
      overlay_type: 'none',
      overlay_color: '#000000',
      overlay_gradient_start: '#000000',
      overlay_gradient_end: '#ffffff',
      overlay_gradient_direction: 'to-bottom',
      overlay_opacity: 30,
      logo_url: '',
      logo_size: 100
    });

    // Initialize buttons for grouped events
    if (groupedEvents.length > 1) {
      const defaultButtons: SlideButton[] = groupedEvents.map(event => ({
        id: event.id,
        text: `Register for ${event.event_name}`,
        url: '',
        link_type: 'registration',
        bg_color: '#ffffff',
        text_color: '#1f2937',
        event_id: event.id
      }));
      setSlideButtons(defaultButtons);
    } else {
      setSlideButtons([]);
    }

    setEditingSlide(null);
    setIsAddingNew(true);
  };

  const handleEdit = (slide: SliderSlide) => {
    setFormData({
      title: slide.title || '',
      subtitle: slide.subtitle || '',
      image_url: slide.image_url || '',
      media_type: (slide.media_type as 'image' | 'video') || 'image',
      video_url: slide.video_url || '',
      button_text: slide.button_text || '',
      button_url: slide.button_url || '',
      link_type: slide.link_type || 'custom',
      button_bg_color: slide.button_bg_color || '#ffffff',
      button_text_color: slide.button_text_color || '#1f2937',
      overlay_type: slide.overlay_type || 'none',
      overlay_color: slide.overlay_color || '#000000',
      overlay_gradient_start: slide.overlay_gradient_start || '#000000',
      overlay_gradient_end: slide.overlay_gradient_end || '#ffffff',
      overlay_gradient_direction: slide.overlay_gradient_direction || 'to-bottom',
      overlay_opacity: slide.overlay_opacity ?? 30,
      logo_url: slide.logo_url || '',
      logo_size: slide.logo_size ?? 100
    });

    // Initialize buttons from slide data or create from grouped events
    if (groupedEvents.length > 1) {
      // Merge existing buttons with all events in the group
      const existingButtons = (slide.buttons && Array.isArray(slide.buttons)) ? slide.buttons : [];

      const mergedButtons: SlideButton[] = groupedEvents.map(event => {
        // Check if we already have a button for this event
        const existing = existingButtons.find(btn => btn.event_id === event.id);

        if (existing) {
          return existing;
        } else {
          // Create a new button for this event
          return {
            id: event.id,
            text: `Register for ${event.event_name}`,
            url: '',
            link_type: 'registration',
            bg_color: '#ffffff',
            text_color: '#1f2937',
            event_id: event.id
          };
        }
      });

      setSlideButtons(mergedButtons);
    } else if (slide.buttons && Array.isArray(slide.buttons)) {
      setSlideButtons(slide.buttons);
    } else {
      setSlideButtons([]);
    }

    setEditingSlide(slide);
    setIsAddingNew(true);
  };

  const handleSaveSlide = async () => {
    try {
      setIsSaving(true);

      // Validate media based on type
      if (formData.media_type === 'video' && !formData.video_url) {
        alert('Please provide a YouTube URL');
        return;
      }
      if (formData.media_type === 'image' && !formData.image_url) {
        alert('Please upload an image');
        return;
      }

      // Prepare the data to save
      const slideData = {
        title: formData.title,
        subtitle: formData.subtitle,
        image_url: formData.image_url,
        media_type: formData.media_type || 'image',
        video_url: formData.video_url || null,
        button_text: formData.button_text,
        button_url: formData.button_url,
        link_type: formData.link_type,
        button_bg_color: formData.button_bg_color,
        button_text_color: formData.button_text_color,
        // Include buttons if we have multiple events
        buttons: slideButtons.length > 0 ? slideButtons : null,
        // Include overlay settings
        overlay_type: formData.overlay_type,
        overlay_color: formData.overlay_color,
        overlay_gradient_start: formData.overlay_gradient_start,
        overlay_gradient_end: formData.overlay_gradient_end,
        overlay_gradient_direction: formData.overlay_gradient_direction,
        overlay_opacity: formData.overlay_opacity,
        // Include logo settings
        logo_url: formData.logo_url || null,
        logo_size: formData.logo_size
      };

      if (editingSlide) {
        const { error } = await supabase
          .from('event_slider_slides')
          .update(slideData)
          .eq('id', editingSlide.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('event_slider_slides')
          .insert({
            event_website_id: websiteId,
            widget_id: widgetId,
            ...slideData,
            display_order: slides.length
          });

        if (error) throw error;
      }

      setIsAddingNew(false);
      setEditingSlide(null);
      setSlideButtons([]);
      loadSlides();
      addNotification('Slide saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving slide:', error);
      addNotification('Failed to save slide', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;

    try {
      const slideToDelete = slides.find(s => s.id === id);

      if (slideToDelete?.image_url) {
        const urlParts = slideToDelete.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        if (fileName.startsWith('slider-')) {
          await supabase.storage
            .from('media')
            .remove([`event-sliders/${websiteId}/${fileName}`]);
        }
      }

      const { error } = await supabase
        .from('event_slider_slides')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadSlides();
    } catch (error) {
      console.error('Error deleting slide:', error);
      alert('Failed to delete slide');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      setIsUploading(true);

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name.split('.').pop();
      const fileName = `slider-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `event-sliders/${websiteId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setFormData({ ...formData, image_url: publicUrl });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">Manage Slider</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
            </div>
          ) : isAddingNew ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">
                {editingSlide ? 'Edit Slide' : 'Add New Slide'}
              </h3>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Welcome to our event"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Subtitle
                </label>
                <textarea
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  rows={2}
                  placeholder="Join us for an amazing experience"
                />
              </div>

              {/* Logo Section */}
              <div className="space-y-3 border border-slate-600 rounded-lg p-4 bg-slate-700/30">
                <h4 className="text-sm font-semibold text-white">Event Logo (Optional)</h4>
                <p className="text-xs text-slate-400">Add a logo that appears above the title</p>

                {formData.logo_url ? (
                  <div className="space-y-3">
                    <div className="relative w-full bg-slate-700 rounded-lg overflow-hidden p-4 flex items-center justify-center">
                      <img
                        src={formData.logo_url}
                        alt="Logo preview"
                        className="max-w-full h-auto object-contain"
                        style={{
                          width: `${formData.logo_size}%`,
                          maxHeight: '150px'
                        }}
                      />
                      <button
                        onClick={() => setFormData({ ...formData, logo_url: '' })}
                        className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Logo Size ({formData.logo_size}%)
                      </label>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={formData.logo_size}
                        onChange={(e) => setFormData({ ...formData, logo_size: parseInt(e.target.value) })}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>20% (Small)</span>
                        <span>100% (Full Width)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block w-full px-4 py-6 bg-slate-700 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 hover:bg-slate-650 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setIsUploading(true);
                            try {
                              const options = {
                                maxSizeMB: 2,
                                maxWidthOrHeight: 1920,
                                useWebWorker: true,
                                fileType: file.type as any
                              };
                              const compressedFile = await imageCompression(file, options);
                              const fileExt = compressedFile.name.split('.').pop();
                              const fileName = `${websiteId}/logo_${Date.now()}.${fileExt}`;
                              const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('media')
                                .upload(`event-media/${fileName}`, compressedFile, {
                                  cacheControl: '3600',
                                  upsert: false
                                });
                              if (uploadError) throw uploadError;
                              const { data: { publicUrl } } = supabase.storage
                                .from('media')
                                .getPublicUrl(`event-media/${fileName}`);
                              setFormData({ ...formData, logo_url: publicUrl });
                              addNotification('Logo uploaded successfully!', 'success');
                            } catch (error) {
                              console.error('Error uploading logo:', error);
                              addNotification('Failed to upload logo', 'error');
                            } finally {
                              setIsUploading(false);
                            }
                          }
                        }}
                        disabled={isUploading}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center">
                        {isUploading ? (
                          <>
                            <Loader2 className="w-6 h-6 text-cyan-500 animate-spin mb-2" />
                            <p className="text-sm text-slate-300">Uploading logo...</p>
                          </>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-slate-400 mb-2" />
                            <p className="text-sm text-slate-300 mb-1">Click to upload logo</p>
                            <p className="text-xs text-slate-400">PNG or transparent background recommended</p>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Media Type *
                </label>
                <div className="flex gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, media_type: 'image', video_url: '' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      formData.media_type === 'image'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <ImageIcon className="w-5 h-5 inline-block mr-2" />
                    Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, media_type: 'video', image_url: '' })}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      formData.media_type === 'video'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <Video className="w-5 h-5 inline-block mr-2" />
                    Video
                  </button>
                </div>

                {formData.media_type === 'image' ? (
                  formData.image_url ? (
                    <div className="space-y-3">
                      <div className="relative w-full h-48 bg-slate-700 rounded-lg overflow-hidden">
                        <img
                          src={formData.image_url}
                          alt="Slide preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          onClick={() => setFormData({ ...formData, image_url: '' })}
                          className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">Click the trash icon to upload a different image</p>
                    </div>
                  ) : (
                    <div>
                      <label className="block w-full px-4 py-8 bg-slate-700 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-cyan-500 hover:bg-slate-650 transition-colors">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploading}
                          className="hidden"
                        />
                        <div className="flex flex-col items-center">
                          {isUploading ? (
                            <>
                              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-2" />
                              <p className="text-sm text-slate-300">Uploading image...</p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-8 h-8 text-slate-400 mb-2" />
                              <p className="text-sm text-slate-300 mb-1">Click to upload slide image</p>
                              <p className="text-xs text-slate-400">PNG, JPG up to 10MB (will be optimized)</p>
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={formData.video_url}
                      onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                    <p className="text-xs text-slate-400">
                      Paste a YouTube URL. The video will auto-play in the background.
                    </p>
                    {formData.video_url && (
                      <div className="relative w-full h-48 bg-slate-700 rounded-lg overflow-hidden">
                        <iframe
                          src={`https://www.youtube.com/embed/${extractYouTubeId(formData.video_url)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(formData.video_url)}`}
                          className="w-full h-full"
                          frameBorder="0"
                          allow="autoplay; encrypted-media"
                          title="Video preview"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-Button Configuration for Grouped Events */}
              {groupedEvents.length > 1 && slideButtons.length > 0 && (
                <div className="space-y-4 border border-cyan-500/30 rounded-lg p-4 bg-cyan-500/5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-white">
                      Registration Buttons ({groupedEvents.length} Events)
                    </h4>
                    <span className="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded">
                      Multi-Event Configuration
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Configure a separate button for each event in this group
                  </p>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleButtonDragEnd}
                  >
                    <SortableContext
                      items={slideButtons.map(b => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {slideButtons.map((button, index) => {
                        const event = groupedEvents.find(e => e.id === button.event_id);
                        return (
                          <SortableButtonItem
                            key={button.id}
                            button={button}
                            event={event}
                            index={index}
                            onUpdate={(updated) => {
                              const newButtons = [...slideButtons];
                              newButtons[index] = updated;
                              setSlideButtons(newButtons);
                            }}
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>
              )}

              {/* Single Button Configuration (legacy or single event) */}
              {groupedEvents.length <= 1 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Button Text
                    </label>
                    <input
                      type="text"
                      value={formData.button_text}
                      onChange={(e) => setFormData({ ...formData, button_text: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                      placeholder="Register Now"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Button Link Type
                    </label>
                    <select
                      value={formData.link_type}
                      onChange={(e) => setFormData({ ...formData, link_type: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="registration">Event Registration</option>
                      <option value="custom">Custom URL</option>
                    </select>
                  </div>

                  {formData.link_type === 'custom' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Button URL
                      </label>
                      <div className="space-y-2">
                        {eventPages.length > 0 && (
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">
                              Link to Event Page
                            </label>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  setFormData({ ...formData, button_url: `/${e.target.value}` });
                                }
                              }}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            >
                              <option value="">Select a page...</option>
                              {eventPages.map((page) => (
                                <option key={page.id} value={page.slug}>
                                  {page.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            Or enter custom URL
                          </label>
                          <input
                            type="text"
                            value={formData.button_url}
                            onChange={(e) => setFormData({ ...formData, button_url: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            placeholder="/custom-page or https://external-site.com"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Button Background Color
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden">
                          <input
                            type="color"
                            value={formData.button_bg_color}
                            onChange={(e) => setFormData({ ...formData, button_bg_color: e.target.value })}
                            className="w-full h-full cursor-pointer border-0"
                            style={{ padding: 0, margin: 0 }}
                          />
                        </div>
                        <input
                          type="text"
                          value={formData.button_bg_color}
                          onChange={(e) => setFormData({ ...formData, button_bg_color: e.target.value })}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                          placeholder="#ffffff"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Button Text Color
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden">
                          <input
                            type="color"
                            value={formData.button_text_color}
                            onChange={(e) => setFormData({ ...formData, button_text_color: e.target.value })}
                            className="w-full h-full cursor-pointer border-0"
                            style={{ padding: 0, margin: 0 }}
                          />
                        </div>
                        <input
                          type="text"
                          value={formData.button_text_color}
                          onChange={(e) => setFormData({ ...formData, button_text_color: e.target.value })}
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                          placeholder="#1f2937"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Overlay Settings */}
              <div className="space-y-4 border border-slate-600 rounded-lg p-4 bg-slate-700/30">
                <h4 className="text-lg font-semibold text-white">Color Overlay</h4>
                <p className="text-sm text-slate-400">Add a colored overlay on top of the image/video (appears behind text and buttons)</p>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Overlay Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, overlay_type: 'none' })}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        formData.overlay_type === 'none'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, overlay_type: 'solid' })}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        formData.overlay_type === 'solid'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Solid Color
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, overlay_type: 'gradient' })}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                        formData.overlay_type === 'gradient'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>

                {formData.overlay_type === 'solid' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Overlay Color
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden">
                        <input
                          type="color"
                          value={formData.overlay_color}
                          onChange={(e) => setFormData({ ...formData, overlay_color: e.target.value })}
                          className="w-full h-full cursor-pointer border-0"
                          style={{ padding: 0, margin: 0 }}
                        />
                      </div>
                      <input
                        type="text"
                        value={formData.overlay_color}
                        onChange={(e) => setFormData({ ...formData, overlay_color: e.target.value })}
                        className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                )}

                {formData.overlay_type === 'gradient' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Start Color
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden">
                            <input
                              type="color"
                              value={formData.overlay_gradient_start}
                              onChange={(e) => setFormData({ ...formData, overlay_gradient_start: e.target.value })}
                              className="w-full h-full cursor-pointer border-0"
                              style={{ padding: 0, margin: 0 }}
                            />
                          </div>
                          <input
                            type="text"
                            value={formData.overlay_gradient_start}
                            onChange={(e) => setFormData({ ...formData, overlay_gradient_start: e.target.value })}
                            className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            placeholder="#000000"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          End Color
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden">
                            <input
                              type="color"
                              value={formData.overlay_gradient_end}
                              onChange={(e) => setFormData({ ...formData, overlay_gradient_end: e.target.value })}
                              className="w-full h-full cursor-pointer border-0"
                              style={{ padding: 0, margin: 0 }}
                            />
                          </div>
                          <input
                            type="text"
                            value={formData.overlay_gradient_end}
                            onChange={(e) => setFormData({ ...formData, overlay_gradient_end: e.target.value })}
                            className="flex-1 px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                            placeholder="#ffffff"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Gradient Direction
                      </label>
                      <select
                        value={formData.overlay_gradient_direction}
                        onChange={(e) => setFormData({ ...formData, overlay_gradient_direction: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="to-bottom">Top to Bottom</option>
                        <option value="to-top">Bottom to Top</option>
                        <option value="to-right">Left to Right</option>
                        <option value="to-left">Right to Left</option>
                        <option value="to-bottom-right">Top-Left to Bottom-Right</option>
                        <option value="to-bottom-left">Top-Right to Bottom-Left</option>
                      </select>
                    </div>
                  </>
                )}

                {formData.overlay_type !== 'none' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Overlay Opacity ({formData.overlay_opacity}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.overlay_opacity}
                      onChange={(e) => setFormData({ ...formData, overlay_opacity: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>0% (Transparent)</span>
                      <span>100% (Opaque)</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleSaveSlide}
                  disabled={isSaving}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Slide
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingSlide(null);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {slides.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No slides yet</p>
                  <button
                    onClick={handleAddNew}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Slide
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-slate-400">
                      Drag slides to reorder them
                    </p>
                    <button
                      onClick={handleAddNew}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Slide
                    </button>
                  </div>

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {slides.map((slide) => (
                          <SortableSlide
                            key={slide.id}
                            slide={slide}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  <div className="pt-4">
                    <button
                      onClick={handleSaveOrder}
                      disabled={isSaving}
                      className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving Order...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Slide Order
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
