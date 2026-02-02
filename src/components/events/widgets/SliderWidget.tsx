import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Settings as SettingsIcon } from 'lucide-react';
import type { EventWidgetConfig } from '../../../types/eventWidgets';
import { supabase } from '../../../utils/supabase';

const extractYouTubeId = (url: string): string => {
  if (!url) return '';
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : '';
};

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
  title: string | null;
  subtitle: string | null;
  image_url: string;
  media_type?: string | null;
  video_url?: string | null;
  button_text: string | null;
  button_url: string | null;
  link_type: string | null;
  button_bg_color: string | null;
  button_text_color: string | null;
  display_order: number;
  buttons?: SlideButton[];
  overlay_type?: string | null;
  overlay_color?: string | null;
  overlay_gradient_start?: string | null;
  overlay_gradient_end?: string | null;
  overlay_gradient_direction?: string | null;
  overlay_opacity?: number | null;
  logo_url?: string | null;
  logo_size?: number | null;
}

interface Props {
  widget: EventWidgetConfig;
  websiteId: string;
  darkMode?: boolean;
  isEditing?: boolean;
  onManageSlides?: () => void;
  onOpenRegistration?: (eventId?: string) => void;
}

export const SliderWidget: React.FC<Props> = ({
  widget,
  websiteId,
  darkMode = false,
  isEditing = false,
  onManageSlides,
  onOpenRegistration
}) => {
  const settings = widget.settings || {};
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slides, setSlides] = useState<SliderSlide[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const height = settings.height || 500;
  const autoRotate = settings.auto_rotate !== false;
  const rotationSpeed = settings.rotation_speed || 5;
  const showNavigation = settings.show_navigation !== false;
  const showIndicators = settings.show_indicators !== false;

  useEffect(() => {
    loadSlides();
  }, [websiteId, widget.id]);

  useEffect(() => {
    if (autoRotate && slides.length > 1 && !isEditing) {
      const interval = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, rotationSpeed * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRotate, slides.length, rotationSpeed, isEditing]);

  const loadSlides = async () => {
    try {
      const { data, error } = await supabase
        .from('event_slider_slides')
        .select('*')
        .eq('event_website_id', websiteId)
        .eq('widget_id', widget.id)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setSlides(data || []);
    } catch (error) {
      console.error('Error loading slides:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  if (isLoading) {
    return (
      <div
        className="relative overflow-hidden bg-gray-100 flex items-center justify-center"
        style={{ height: `${height}px` }}
      >
        <div className="text-gray-500">Loading slides...</div>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div
        className="relative overflow-hidden bg-gray-100 flex flex-col items-center justify-center"
        style={{ height: `${height}px` }}
      >
        <div className="text-gray-500 mb-4">No slides added yet</div>
        {isEditing && onManageSlides && (
          <button
            onClick={onManageSlides}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
          >
            <SettingsIcon className="w-4 h-4" />
            Add Slides
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden w-full" style={{ height: `${height}px` }}>
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            index === currentSlide ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {slide.media_type === 'video' && slide.video_url ? (
            <div className="w-full h-full relative">
              <iframe
                src={`https://www.youtube.com/embed/${extractYouTubeId(slide.video_url)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(slide.video_url)}&playsinline=1&rel=0&modestbranding=1`}
                className="absolute inset-0 w-full h-full pointer-events-none"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                title={slide.title || 'Video background'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scale(1.5)',
                  transformOrigin: 'center'
                }}
              />
            </div>
          ) : (
            <img
              src={slide.image_url}
              alt={slide.title || 'Slide'}
              className="w-full h-full object-cover select-none pointer-events-none"
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
          {/* Overlay layer */}
          {slide.overlay_type && slide.overlay_type !== 'none' && (
            <div
              className="absolute inset-0"
              style={{
                background: slide.overlay_type === 'gradient'
                  ? `linear-gradient(${slide.overlay_gradient_direction || 'to-bottom'}, ${slide.overlay_gradient_start || '#000000'}, ${slide.overlay_gradient_end || '#ffffff'})`
                  : slide.overlay_color || '#000000',
                opacity: (slide.overlay_opacity ?? 30) / 100
              }}
            />
          )}

          {(slide.logo_url || slide.title || slide.subtitle || slide.button_text) && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-white px-4 pointer-events-auto relative z-10">
                {slide.logo_url && (
                  <div className="flex justify-center mb-6">
                    <img
                      src={slide.logo_url}
                      alt="Event Logo"
                      className="max-w-full h-auto object-contain"
                      style={{
                        width: `${slide.logo_size || 100}%`,
                        maxHeight: '200px'
                      }}
                    />
                  </div>
                )}
                {slide.title && (
                  <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
                    {slide.title}
                  </h1>
                )}
                {slide.subtitle && (
                  <p className="text-base md:text-lg lg:text-xl mb-4 max-w-2xl mx-auto">
                    {slide.subtitle}
                  </p>
                )}
                {/* Render multiple buttons if available, otherwise fall back to single button */}
                {slide.buttons && slide.buttons.length > 0 ? (
                  <div className="flex flex-wrap gap-3 justify-center">
                    {slide.buttons.map((button, btnIndex) => (
                      button.link_type === 'registration' ? (
                        <button
                          key={btnIndex}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Multi-button clicked, event_id:', button.event_id);
                            if (onOpenRegistration) {
                              onOpenRegistration(button.event_id || undefined);
                            }
                          }}
                          className="relative z-10 px-6 py-2.5 font-semibold rounded-lg transition-colors cursor-pointer hover:opacity-90"
                          style={{
                            backgroundColor: button.bg_color || '#ffffff',
                            color: button.text_color || '#1f2937'
                          }}
                        >
                          {button.text}
                        </button>
                      ) : button.url ? (
                        <a
                          key={btnIndex}
                          href={button.url}
                          className="inline-block px-6 py-2.5 font-semibold rounded-lg transition-colors hover:opacity-90"
                          style={{
                            backgroundColor: button.bg_color || '#ffffff',
                            color: button.text_color || '#1f2937'
                          }}
                        >
                          {button.text}
                        </a>
                      ) : null
                    ))}
                  </div>
                ) : slide.button_text && (
                  slide.link_type === 'registration' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Registration button clicked, callback exists:', !!onOpenRegistration);
                        if (onOpenRegistration) {
                          onOpenRegistration();
                        } else {
                          console.error('onOpenRegistration callback not provided');
                        }
                      }}
                      className="relative z-10 px-6 py-2.5 font-semibold rounded-lg transition-colors cursor-pointer hover:opacity-90"
                      style={{
                        backgroundColor: slide.button_bg_color || '#ffffff',
                        color: slide.button_text_color || '#1f2937'
                      }}
                    >
                      {slide.button_text}
                    </button>
                  ) : slide.button_url ? (
                    <a
                      href={slide.button_url}
                      className="inline-block px-6 py-2.5 font-semibold rounded-lg transition-colors hover:opacity-90"
                      style={{
                        backgroundColor: slide.button_bg_color || '#ffffff',
                        color: slide.button_text_color || '#1f2937'
                      }}
                    >
                      {slide.button_text}
                    </a>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {slides.length > 1 && showNavigation && (
        <>
          <button
            onClick={prevSlide}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white bg-opacity-50 hover:bg-opacity-75 rounded-full transition-all z-10"
          >
            <ChevronLeft className="w-6 h-6 text-gray-900" />
          </button>
          <button
            onClick={nextSlide}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white bg-opacity-50 hover:bg-opacity-75 rounded-full transition-all z-10"
          >
            <ChevronRight className="w-6 h-6 text-gray-900" />
          </button>
        </>
      )}

      {slides.length > 1 && showIndicators && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentSlide
                  ? 'bg-white w-6'
                  : 'bg-white bg-opacity-50 hover:bg-opacity-75 w-2'
              }`}
            />
          ))}
        </div>
      )}

      {isEditing && onManageSlides && (
        <button
          onClick={onManageSlides}
          className="absolute top-4 right-4 p-2 bg-white bg-opacity-90 hover:bg-opacity-100 rounded-lg shadow-lg transition-all z-10"
          title="Manage Slides"
        >
          <SettingsIcon className="w-5 h-5 text-gray-700" />
        </button>
      )}
    </div>
  );
};
