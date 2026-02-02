import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Calendar, Trophy, Users, Image as ImageIcon, Video, Newspaper, Cloud, Mail, UserPlus, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EventWidgetConfig } from '../../types/eventWidgets';
import { SliderWidget } from './widgets/SliderWidget';
import { MultiButtonWidget } from './widgets/MultiButtonWidget';
import { ClassSelectorButtonsWidget } from './widgets/ClassSelectorButtonsWidget';
import { AccommodationMapWidget } from './widgets/AccommodationMapWidget';
import { CompetitorListWidget } from './widgets/CompetitorListWidget';
import { QuickLinkTilesWidget } from './widgets/QuickLinkTilesWidget';
import LiveTrackingWidget from './widgets/LiveTrackingWidget';
import { EventRegistrationModal } from './EventRegistrationModal';
import { ArticleDetailModal } from './ArticleDetailModal';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface Props {
  widget: EventWidgetConfig;
  websiteId?: string;
  darkMode?: boolean;
  isEditing?: boolean;
  onManageSlides?: (widgetId: string) => void;
}

export const EventWidgetRenderer: React.FC<Props> = ({ widget, websiteId, darkMode = false, isEditing = false, onManageSlides }) => {
  // Determine if we're in subdomain/custom domain context vs temporary URL context
  const isSubdomainOrCustomDomain = !window.location.pathname.startsWith('/events/');

  // Determine current viewport
  const [currentViewport, setCurrentViewport] = React.useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setCurrentViewport('mobile');
      } else if (width < 1024) {
        setCurrentViewport('tablet');
      } else {
        setCurrentViewport('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Merge base settings with responsive overrides
  const settings = {
    ...(widget.settings || {}),
    ...(currentViewport !== 'desktop' && widget.responsiveSettings?.[currentViewport] ? widget.responsiveSettings[currentViewport] : {})
  };

  const [countdown, setCountdown] = React.useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [sponsors, setSponsors] = React.useState<any[]>([]);
  const [currentSponsorIndex, setCurrentSponsorIndex] = React.useState(0);
  const [eventData, setEventData] = React.useState<any>(null);
  const [showRegistrationModal, setShowRegistrationModal] = React.useState(false);
  const [selectedEventForRegistration, setSelectedEventForRegistration] = React.useState<any>(null);
  const [galleryMedia, setGalleryMedia] = React.useState<any[]>([]);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [lightboxIndex, setLightboxIndex] = React.useState(0);
  const [visibleImageCount, setVisibleImageCount] = React.useState(0);
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const [websiteSlug, setWebsiteSlug] = React.useState<string>('');
  const [newsArticles, setNewsArticles] = React.useState<any[]>([]);
  const [visibleNewsCount, setVisibleNewsCount] = React.useState(0);
  const [newsCarouselIndex, setNewsCarouselIndex] = React.useState(0);
  const [selectedArticle, setSelectedArticle] = React.useState<any>(null);
  const [articleModalOpen, setArticleModalOpen] = React.useState(false);

  // Load event data for event-info, registration-button, hero, slider, weather, accommodation-map, and quick-link-tiles widgets
  React.useEffect(() => {
    if ((widget.type === 'event-info' || widget.type === 'registration-button' || widget.type === 'slider' || widget.type === 'weather-widget' || widget.type === 'weather-full' || widget.type === 'venue-map' || widget.type === 'accommodation-map' || widget.type === 'quick-link-tiles' || (widget.type === 'hero' && settings.cta_link_type === 'registration')) && websiteId) {
      // Always load for slider, weather, venue-map, accommodation-map, and quick-link-tiles widgets, check data_source for others
      const shouldLoad = widget.type === 'slider' || widget.type === 'weather-widget' || widget.type === 'weather-full' || widget.type === 'venue-map' || widget.type === 'accommodation-map' || widget.type === 'quick-link-tiles' || settings.data_source !== 'custom';

      if (shouldLoad) {
        const loadEventData = async () => {
          try {
            const { supabase } = await import('../../utils/supabase');

            console.log('Loading event data for widget, websiteId:', websiteId);

            // Get the event website to find the linked event
            const { data: website, error: websiteError } = await supabase
              .from('event_websites')
              .select('event_id, slug')
              .eq('id', websiteId)
              .maybeSingle();

            console.log('Event website data:', website, 'Error:', websiteError);

            if (websiteError || !website?.event_id) {
              console.error('Error loading event website or no event_id:', websiteError);
              return;
            }

            // For registration button, check if a specific event is selected in settings
            let eventIdToLoad = website.event_id;
            if (widget.type === 'registration-button' && settings.event_id) {
              eventIdToLoad = settings.event_id;
              console.log('Using specific event_id from settings:', eventIdToLoad);
            }

            // Load the linked event details with venue coordinates
            const { data: event, error: eventError } = await supabase
              .from('public_events')
              .select('*, venues(latitude, longitude)')
              .eq('id', eventIdToLoad)
              .maybeSingle();

            console.log('Public event data:', event, 'Error:', eventError);

            if (eventError) {
              console.error('Error loading event:', eventError);
              return;
            }

            if (event) {
              const loadedData = {
                ...event,
                event_slug: website.slug,
                start_date: event.date,
                description: event.race_format ? `Format: ${event.race_format}` : '',
                venue_latitude: event.venues?.latitude,
                venue_longitude: event.venues?.longitude
              };
              console.log('Setting event data:', loadedData);
              setEventData(loadedData);

              // Also set websiteSlug for widgets that need it directly
              if (website.slug) {
                setWebsiteSlug(website.slug);
              }
            }
          } catch (err) {
            console.error('Error loading event data:', err);
          }
        };
        loadEventData();
      }
    }
  }, [widget.type, websiteId, settings.data_source]);

  // Load sponsors
  React.useEffect(() => {
    if ((widget.type === 'sponsor-grid' || widget.type === 'sponsor-carousel') && websiteId) {
      const loadSponsors = async () => {
        try {
          const { supabase } = await import('../../utils/supabase');
          const { data, error } = await supabase
            .from('event_sponsors')
            .select('*')
            .eq('event_website_id', websiteId)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

          if (error) {
            console.error('Error loading sponsors:', error);
          } else if (data) {
            console.log('Sponsors loaded:', data);
            setSponsors(data);
          }
        } catch (err) {
          console.error('Error loading sponsors:', err);
        }
      };
      loadSponsors();
    }
  }, [widget.type, websiteId]);

  // Sponsor carousel auto-rotation (disabled - manual navigation only)
  React.useEffect(() => {
    if (widget.type === 'sponsor-carousel' && sponsors.length > 0 && settings.auto_rotate === true) {
      const interval = setInterval(() => {
        setCurrentSponsorIndex((prev) => (prev + 1) % sponsors.length);
      }, settings.rotation_speed || 5000);
      return () => clearInterval(interval);
    }
  }, [widget.type, sponsors.length, settings.rotation_speed, settings.auto_rotate]);

  // Countdown timer effect
  React.useEffect(() => {
    if (widget.type === 'countdown') {
      const updateCountdown = () => {
        const targetDate = settings.event_date || settings.target_date || settings.eventDate;
        if (!targetDate) {
          setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
          return;
        }

        const now = new Date().getTime();
        const target = new Date(targetDate).getTime();
        const distance = target - now;

        if (distance > 0) {
          setCountdown({
            days: Math.floor(distance / (1000 * 60 * 60 * 24)),
            hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((distance % (1000 * 60)) / 1000)
          });
        } else {
          setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }
  }, [widget.type, settings.event_date, settings.target_date, settings.eventDate]);

  // Load gallery media for media-gallery and gallery-feed widgets
  React.useEffect(() => {
    if ((widget.type === 'media-gallery' || widget.type === 'gallery-feed') && websiteId) {
      const loadGalleryMedia = async () => {
        try {
          const { supabase } = await import('../../utils/supabase');

          // First get the event_id and slug from the event_website
          const { data: website, error: websiteError } = await supabase
            .from('event_websites')
            .select('event_id, slug')
            .eq('id', websiteId)
            .maybeSingle();

          if (websiteError || !website?.event_id) {
            console.error('Error loading event website:', websiteError);
            return;
          }

          // Store the website slug for building links
          if (website.slug) {
            setWebsiteSlug(website.slug);
          }

          // Now load media from event_media table using event_ref_id
          const { data: media, error } = await supabase
            .from('event_media')
            .select('*')
            .eq('event_ref_id', website.event_id)
            .eq('media_type', 'image')
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error loading gallery media:', error);
            return;
          }

          if (media) {
            // Transform the data to match the expected format
            const transformedMedia = media.map(item => ({
              id: item.id,
              media_url: item.url,
              thumbnail_url: item.thumbnail_url,
              title: item.title,
              description: item.description
            }));
            setGalleryMedia(transformedMedia);

            // Initialize visible image count for media-gallery
            if (widget.type === 'media-gallery') {
              const initialImages = settings.initial_images || 24;
              setVisibleImageCount(Math.min(initialImages, transformedMedia.length));
            }
          }
        } catch (err) {
          console.error('Error loading gallery media:', err);
        }
      };

      loadGalleryMedia();
    }
  }, [widget.type, websiteId, settings.initial_images]);

  // Load news articles for news-feed and news-blog widgets
  React.useEffect(() => {
    if ((widget.type === 'news-feed' || widget.type === 'news-blog') && websiteId) {
      const loadNewsArticles = async () => {
        try {
          const { supabase } = await import('../../utils/supabase');

          // First get the website slug
          const { data: website, error: websiteError } = await supabase
            .from('event_websites')
            .select('slug')
            .eq('id', websiteId)
            .maybeSingle();

          if (websiteError) {
            console.error('Error loading event website:', websiteError);
            return;
          }

          // Store the website slug for building links
          if (website?.slug) {
            setWebsiteSlug(website.slug);
          }

          // Now load articles from articles table using event_website_id
          const { data: articles, error } = await supabase
            .from('articles')
            .select('*')
            .eq('event_website_id', websiteId)
            .eq('status', 'published')
            .order('published_at', { ascending: false });

          if (error) {
            console.error('Error loading news articles:', error);
            return;
          }

          if (articles) {
            setNewsArticles(articles);

            // Initialize visible news count for news-blog
            if (widget.type === 'news-blog') {
              const initialItems = settings.initial_items || 9;
              setVisibleNewsCount(Math.min(initialItems, articles.length));
            }
          }
        } catch (err) {
          console.error('Error loading news articles:', err);
        }
      };

      loadNewsArticles();
    }
  }, [widget.type, websiteId, settings.initial_items]);

  // Registration handler - used by slider, multi-button, and quick-link-tiles widgets
  const handleOpenRegistration = React.useCallback(async (eventId?: string) => {
    console.log('handleOpenRegistration called, eventId:', eventId, 'eventData:', eventData);

    // If a specific event ID is provided, load that event
    if (eventId) {
      try {
        const { supabase } = await import('../../utils/supabase');
        const { data: specificEvent, error } = await supabase
          .from('public_events')
          .select('*, venues(latitude, longitude)')
          .eq('id', eventId)
          .maybeSingle();

        if (error || !specificEvent) {
          console.error('Error loading specific event:', error);
          return;
        }

        setSelectedEventForRegistration({
          id: specificEvent.id,
          club_id: specificEvent.club_id,
          event_name: specificEvent.event_name,
          entry_fee: specificEvent.entry_fee || 0,
          currency: specificEvent.currency || 'AUD'
        });
        setShowRegistrationModal(true);
      } catch (error) {
        console.error('Error loading event for registration:', error);
      }
    } else {
      // Use default event data
      if (!eventData) {
        console.error('Event data not loaded yet for registration');
        return;
      }
      setSelectedEventForRegistration(eventData);
      setShowRegistrationModal(true);
    }
  }, [eventData]);

  switch (widget.type) {
    case 'slider':
      if (!websiteId) {
        return <div className="p-4 text-red-500">Website ID required for slider</div>;
      }

      return (
        <SliderWidget
          widget={widget}
          websiteId={websiteId}
          darkMode={darkMode}
          isEditing={isEditing}
          onManageSlides={onManageSlides ? () => onManageSlides(widget.id) : undefined}
          onOpenRegistration={handleOpenRegistration}
        />
      );

    case 'hero':
      return (
        <div
          className="relative rounded-lg overflow-hidden"
          style={{
            height: settings.height || 300,
            backgroundColor: settings.background_color || '#1e293b'
          }}
        >
          {settings.background_image && (
            <img
              src={settings.background_image}
              alt="Hero background"
              className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: `rgba(0, 0, 0, ${settings.overlay_opacity || 0.4})`
            }}
          />
          <div className="relative h-full flex flex-col items-center justify-center text-center p-8">
            <h1
              className="text-4xl font-bold mb-4"
              style={{ color: settings.text_color || '#ffffff' }}
            >
              {settings.title || 'Welcome to Our Event'}
            </h1>
            {settings.subtitle && (
              <p
                className="text-xl mb-6"
                style={{ color: settings.text_color || '#ffffff' }}
              >
                {settings.subtitle}
              </p>
            )}
            {settings.show_cta && (
              settings.cta_link_type === 'registration' ? (
                <button
                  onClick={() => setShowRegistrationModal(true)}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors"
                >
                  {settings.cta_text || 'Register Now'}
                </button>
              ) : (
                <a
                  href={settings.cta_url || '/register'}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors inline-block"
                >
                  {settings.cta_text || 'Register Now'}
                </a>
              )
            )}
          </div>
          {showRegistrationModal && eventData && settings.cta_link_type === 'registration' && (
            <EventRegistrationModal
              eventId={eventData.id}
              clubId={eventData.club_id}
              eventName={eventData.event_name}
              entryFee={eventData.entry_fee || 0}
              currency={eventData.currency || 'AUD'}
              onClose={() => setShowRegistrationModal(false)}
              onSuccess={() => {
                setShowRegistrationModal(false);
              }}
            />
          )}
        </div>
      );

    case 'countdown':
      return (
        <div
          className="text-center h-full flex flex-col items-center justify-center"
          style={{
            backgroundColor: settings.background_color || 'transparent',
            color: settings.text_color || '#ffffff',
            borderRadius: `${settings.border_radius || 0}px`,
            padding: `${settings.padding || 32}px`
          }}
        >
          {settings.show_icon !== false && (
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" style={{ color: settings.text_color || '#ffffff' }} />
          )}
          {settings.show_title !== false && (
            <h3 className="text-2xl font-bold mb-6">{settings.title || 'Event Starts In'}</h3>
          )}
          <div className="flex justify-center gap-4">
            {settings.show_days !== false && (
              <div className="text-center">
                <div className="text-4xl font-bold">{String(countdown.days).padStart(2, '0')}</div>
                <div className="text-sm opacity-70">Days</div>
              </div>
            )}
            {settings.show_hours !== false && (
              <div className="text-center">
                <div className="text-4xl font-bold">{String(countdown.hours).padStart(2, '0')}</div>
                <div className="text-sm opacity-70">Hours</div>
              </div>
            )}
            {settings.show_minutes !== false && (
              <div className="text-center">
                <div className="text-4xl font-bold">{String(countdown.minutes).padStart(2, '0')}</div>
                <div className="text-sm opacity-70">Minutes</div>
              </div>
            )}
            {settings.show_seconds && (
              <div className="text-center">
                <div className="text-4xl font-bold">{String(countdown.seconds).padStart(2, '0')}</div>
                <div className="text-sm opacity-70">Seconds</div>
              </div>
            )}
          </div>
        </div>
      );

    case 'event-info':
      const formatEventDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const day = date.getDate();
        const month = date.toLocaleString('en-US', { month: 'long' });
        const year = date.getFullYear();
        return `${day} ${month} ${year}`;
      };

      // Use event data if available and not in custom mode, otherwise use settings
      const useEventData = settings.data_source !== 'custom' && eventData;
      const eventDate = useEventData ? eventData.start_date : (settings.event_date || settings.start_date);
      const endDate = useEventData ? eventData.end_date : settings.end_date;
      const venue = useEventData ? eventData.venue : (settings.venue || settings.location);
      const description = useEventData ? eventData.description : settings.description;
      const eventName = useEventData ? eventData.event_name : (settings.event_name || settings.title);
      const eventTime = useEventData ? eventData.start_time : settings.event_time;
      const showCTA = settings.show_cta !== false;
      const ctaText = settings.cta_text || 'Register Now';
      const eventSlug = useEventData ? eventData.event_slug : settings.event_slug;

      // Show loading or no data message
      const hasAnyData = eventDate || venue || description;

      return (
        <div
          className="p-6 rounded-lg"
          style={{
            backgroundColor: settings.background_color || 'transparent',
            color: settings.text_color || (darkMode ? '#ffffff' : '#1e293b')
          }}
        >
          <h3 className="text-2xl font-bold mb-6" style={{ color: settings.heading_color || settings.text_color || (darkMode ? '#ffffff' : '#1e293b') }}>
            {eventName || 'Event Information'}
          </h3>

          {!hasAnyData && isEditing && (
            <div className="text-center py-8 opacity-70">
              <p className="mb-2">No event data available</p>
              <p className="text-sm">
                {settings.data_source === 'custom'
                  ? 'Click the settings icon to add event details'
                  : 'Make sure this event website is linked to an event'}
              </p>
            </div>
          )}

          {hasAnyData && (
            <div className="space-y-4">
              {settings.show_date !== false && eventDate && (
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 mt-0.5" style={{ color: settings.icon_color || '#06b6d4' }} />
                <div>
                  <div className="font-medium">
                    {endDate && eventDate !== endDate
                      ? `${formatEventDate(eventDate)} - ${formatEventDate(endDate)}`
                      : formatEventDate(eventDate)}
                  </div>
                </div>
              </div>
            )}
            {settings.show_location !== false && venue && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 mt-0.5" style={{ color: settings.icon_color || '#06b6d4' }} />
                <div className="font-medium">
                  {venue}
                </div>
              </div>
            )}
            {settings.show_time && settings.event_time && (
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 mt-0.5" style={{ color: settings.icon_color || '#06b6d4' }} />
                <div className="font-medium">
                  {settings.event_time}
                </div>
              </div>
            )}
            {settings.show_description !== false && description && (
              <p className="mt-4 leading-relaxed opacity-90">
                {description}
              </p>
            )}
            {showCTA && !isEditing && eventData?.entry_fee && eventData.entry_fee > 0 && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: settings.border_color || (darkMode ? '#475569' : '#e2e8f0') }}>
                <button
                  onClick={() => setShowRegistrationModal(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: settings.cta_background_color || '#ef4444',
                    color: settings.cta_text_color || '#ffffff'
                  }}
                >
                  <UserPlus size={18} />
                  <span>{ctaText}</span>
                  {eventData.entry_fee && (
                    <span className="ml-1 text-sm font-normal opacity-90">
                      {eventData.currency || 'AUD'} ${eventData.entry_fee}
                    </span>
                  )}
                </button>
              </div>
            )}
            </div>
          )}

          {showRegistrationModal && eventData && (
            <EventRegistrationModal
              eventId={eventData.id}
              clubId={eventData.club_id}
              eventName={eventData.event_name}
              entryFee={eventData.entry_fee || 0}
              currency={eventData.currency || 'AUD'}
              onClose={() => setShowRegistrationModal(false)}
              onSuccess={() => {
                setShowRegistrationModal(false);
              }}
            />
          )}
        </div>
      );

    case 'registration-form':
      return (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Event Registration
          </h3>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Your Name"
              className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              disabled
            />
            <input
              type="email"
              placeholder="Email Address"
              className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              disabled
            />
            <button className="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg font-semibold">
              Register Now
            </button>
          </div>
        </div>
      );

    case 'results':
      return (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-6 h-6 text-cyan-500" />
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Results & Leaderboard
            </h3>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((pos) => (
              <div key={pos} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-cyan-500">#{pos}</span>
                  <span className={darkMode ? 'text-white' : 'text-slate-900'}>Competitor {pos}</span>
                </div>
                <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  {100 - pos * 5} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'competitor-list':
      return (
        <CompetitorListWidget
          websiteId={websiteId}
          darkMode={darkMode}
          settings={settings}
        />
      );

    case 'media-gallery':
      const galleryColumns = settings.columns || 3;
      const enableLightbox = settings.lightbox !== false;
      const showCaptions = settings.show_captions !== false;
      const galleryTitle = settings.title || 'Photo Gallery';
      const galleryBgColor = settings.background_color || 'transparent';
      const loadMoreCount = settings.load_more_count || 6;
      const galleryTitleColor = settings.title_color || (galleryBgColor === 'transparent' ? '#ffffff' : '#000000');
      const galleryTitleFontFamily = settings.title_font_family || 'inherit';
      const galleryTitleFontSize = settings.title_font_size || 24;
      const galleryTitleFontWeight = settings.title_font_weight || '700';

      const lightboxSlides = galleryMedia.map(media => ({
        src: media.media_url,
        title: media.title,
        description: media.description
      }));

      const galleryBgStyle = galleryBgColor === 'transparent'
        ? {}
        : { backgroundColor: galleryBgColor };

      const galleryTitleStyle = {
        color: galleryTitleColor,
        fontFamily: galleryTitleFontFamily,
        fontSize: `${galleryTitleFontSize}px`,
        fontWeight: galleryTitleFontWeight
      };

      const visibleMedia = galleryMedia.slice(0, visibleImageCount);
      const hasMore = visibleImageCount < galleryMedia.length;

      const handleLoadMore = () => {
        setVisibleImageCount(prev => Math.min(prev + loadMoreCount, galleryMedia.length));
      };

      return (
        <>
          <div
            className="p-6 rounded-lg"
            style={galleryBgStyle}
          >
            {galleryTitle && (
              <div className="flex items-center gap-3 mb-6">
                <ImageIcon className="w-6 h-6 text-cyan-500" />
                <h3 style={galleryTitleStyle}>
                  {galleryTitle}
                </h3>
              </div>
            )}

            {galleryMedia.length === 0 ? (
              <div className={`text-center py-12 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
                <ImageIcon className={`w-12 h-12 ${darkMode ? 'text-slate-600' : 'text-slate-300'} mx-auto mb-3`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  No photos in gallery yet
                </p>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'} mt-1`}>
                  Upload photos in the Media section
                </p>
              </div>
            ) : (
              <>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: `repeat(${galleryColumns}, minmax(0, 1fr))`
                  }}
                >
                  {visibleMedia.map((media, index) => (
                  <div
                    key={media.id}
                    className={`group relative aspect-square rounded-lg overflow-hidden ${
                      enableLightbox ? 'cursor-pointer' : ''
                    } ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}
                    onClick={() => {
                      if (enableLightbox) {
                        setLightboxIndex(index);
                        setLightboxOpen(true);
                      }
                    }}
                  >
                    <img
                      src={media.thumbnail_url || media.media_url}
                      alt={media.title || 'Gallery image'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                    {enableLightbox && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                    )}
                    {showCaptions && media.title && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <p className="text-white text-sm font-medium truncate">
                          {media.title}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={handleLoadMore}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                    }`}
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
            )}
          </div>

          {enableLightbox && galleryMedia.length > 0 && (
            <Lightbox
              open={lightboxOpen}
              close={() => setLightboxOpen(false)}
              index={lightboxIndex}
              slides={lightboxSlides}
              on={{
                view: ({ index }) => setLightboxIndex(index)
              }}
              styles={{
                container: { backgroundColor: 'rgba(0, 0, 0, 0.95)' }
              }}
            />
          )}
        </>
      );

    case 'gallery-feed':
      const feedTitle = settings.title || 'IMAGES';
      const maxImages = settings.max_images || 6;
      const enableCarousel = settings.enable_carousel !== false;
      const showLink = settings.show_link !== false;
      const linkText = settings.link_text || 'more images »';
      const linkType = settings.link_type || 'page';
      const linkPage = settings.link_page || '';
      const linkUrl = linkType === 'page'
        ? (websiteSlug && linkPage ? `/events/${websiteSlug}/${linkPage.toLowerCase()}` : `/events/${websiteSlug}/media`)
        : (settings.link_url || '/gallery');
      const feedBgColor = settings.background_color || 'transparent';
      const feedTitleColor = settings.title_color || (feedBgColor === 'transparent' ? '#ffffff' : '#000000');
      const feedTitleFontFamily = settings.title_font_family || 'inherit';
      const feedTitleFontSize = settings.title_font_size || 24;
      const feedTitleFontWeight = settings.title_font_weight || '700';

      const feedBgStyle = feedBgColor === 'transparent'
        ? {}
        : { backgroundColor: feedBgColor };

      const feedTitleStyle = {
        color: feedTitleColor,
        fontFamily: feedTitleFontFamily,
        fontSize: `${feedTitleFontSize}px`,
        fontWeight: feedTitleFontWeight
      };

      const feedLightboxSlides = galleryMedia.map(media => ({
        src: media.media_url,
        title: media.title,
        description: media.description
      }));

      const displayedImages = galleryMedia.slice(0, maxImages);
      const needsCarousel = galleryMedia.length > maxImages && enableCarousel;
      const imagesPerView = maxImages;
      const maxCarouselIndex = Math.max(0, galleryMedia.length - imagesPerView);

      const handlePrevImage = () => {
        setCarouselIndex(prev => Math.max(0, prev - 1));
      };

      const handleNextImage = () => {
        setCarouselIndex(prev => Math.min(maxCarouselIndex, prev + 1));
      };

      const carouselImages = needsCarousel
        ? galleryMedia.slice(carouselIndex, carouselIndex + imagesPerView)
        : displayedImages;

      return (
        <div
          className="p-6 rounded-lg"
          style={feedBgStyle}
        >
          {feedTitle && (
            <div className="mb-4">
              <h3 className="tracking-wide" style={feedTitleStyle}>
                {feedTitle}
              </h3>
            </div>
          )}

          {galleryMedia.length === 0 ? (
            <div className={`text-center py-8 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
              <ImageIcon className={`w-10 h-10 ${darkMode ? 'text-slate-600' : 'text-slate-300'} mx-auto mb-2`} />
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No images available
              </p>
            </div>
          ) : (
            <div className="relative">
              {needsCarousel && carouselIndex > 0 && (
                <button
                  onClick={handlePrevImage}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {carouselImages.map((media, index) => (
                  <div
                    key={media.id}
                    className={`overflow-hidden cursor-pointer group ${
                      darkMode ? 'bg-slate-700' : 'bg-slate-100'
                    }`}
                    style={{
                      aspectRatio: '4/3'
                    }}
                    onClick={() => {
                      const actualIndex = needsCarousel ? carouselIndex + index : index;
                      setLightboxIndex(actualIndex);
                      setLightboxOpen(true);
                    }}
                  >
                    <img
                      src={media.thumbnail_url || media.media_url}
                      alt={media.title || 'Gallery image'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              {needsCarousel && carouselIndex < maxCarouselIndex && (
                <button
                  onClick={handleNextImage}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(50%, -50%)' }}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {showLink && galleryMedia.length > 0 && (
            <div className="flex justify-end mt-3">
              <Link
                to={linkUrl}
                className={`text-sm hover:underline transition-colors ${
                  darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
                }`}
              >
                {linkText}
              </Link>
            </div>
          )}

          {galleryMedia.length > 0 && (
            <Lightbox
              open={lightboxOpen}
              close={() => setLightboxOpen(false)}
              index={lightboxIndex}
              slides={feedLightboxSlides}
              on={{
                view: ({ index }) => setLightboxIndex(index)
              }}
              styles={{
                container: { backgroundColor: 'rgba(0, 0, 0, 0.95)' }
              }}
            />
          )}
        </div>
      );

    case 'video-player':
      return (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className={`aspect-video rounded-lg ${darkMode ? 'bg-slate-700' : 'bg-slate-100'} flex items-center justify-center`}>
            <Video className={`w-16 h-16 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
          </div>
        </div>
      );

    case 'weather':
      return (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Cloud className="w-6 h-6 text-cyan-500" />
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Weather Forecast
            </h3>
          </div>
          <div className="text-center">
            <div className={`text-5xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>22°C</div>
            <p className={`mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Partly Cloudy</p>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Wind: 12 km/h NE</p>
          </div>
        </div>
      );

    case 'text-block':
      const getFontFamily = (family: string) =>
        family && family !== 'inherit' ? `'${family}', sans-serif` : 'inherit';

      const h1Font = getFontFamily(settings.h1_font_family || 'Roboto');
      const h2Font = getFontFamily(settings.h2_font_family || 'Roboto');
      const h3Font = getFontFamily(settings.h3_font_family || 'Roboto');
      const normalFont = getFontFamily(settings.normal_font_family || 'Roboto');

      return (
        <>
          <style>{`
            .event-widget-text-block-${widget.id} h1 {
              font-family: ${h1Font};
              font-size: ${settings.h1_font_size || '32'}px;
              line-height: ${settings.h1_line_height || '1.2'};
              font-weight: 700;
              margin-top: 0;
              margin-bottom: 0.5em;
            }
            .event-widget-text-block-${widget.id} h2 {
              font-family: ${h2Font};
              font-size: ${settings.h2_font_size || '24'}px;
              line-height: ${settings.h2_line_height || '1.3'};
              font-weight: 600;
              margin-top: 0;
              margin-bottom: 0.5em;
            }
            .event-widget-text-block-${widget.id} h3 {
              font-family: ${h3Font};
              font-size: ${settings.h3_font_size || '18'}px;
              line-height: ${settings.h3_line_height || '1.4'};
              font-weight: 600;
              margin-top: 0;
              margin-bottom: 0.5em;
            }
            .event-widget-text-block-${widget.id} p,
            .event-widget-text-block-${widget.id} ul,
            .event-widget-text-block-${widget.id} ol,
            .event-widget-text-block-${widget.id} li {
              font-family: ${normalFont};
              font-size: ${settings.normal_font_size || '14'}px;
              line-height: ${settings.normal_line_height || '1.6'};
            }
          `}</style>
          <div
            className={`h-full overflow-auto event-widget-text-block event-widget-text-block-${widget.id}`}
            style={{
              color: settings.text_color || (darkMode ? '#e2e8f0' : '#334155'),
              padding: settings.padding ? `${settings.padding}px` : '24px',
              textAlign: settings.text_align || 'left'
            }}
            dangerouslySetInnerHTML={{
              __html: settings.content || '<p>Add your custom text content here. This is a flexible text block that can contain any information you want to display.</p>'
            }}
          />
        </>
      );

    case 'image-block':
      const imageBgColor = settings.background_color === 'transparent' ? '' : settings.background_color;
      const imageAlignment = settings.alignment || 'center';
      const imageAlignmentClass = imageAlignment === 'left' ? 'items-start' : imageAlignment === 'right' ? 'items-end' : 'items-center';
      const imageTextAlignClass = imageAlignment === 'left' ? 'text-left' : imageAlignment === 'right' ? 'text-right' : 'text-center';

      return (
        <div
          className={`rounded-lg overflow-hidden flex flex-col ${imageAlignmentClass}`}
          style={{
            backgroundColor: imageBgColor || 'transparent',
            padding: imageBgColor && imageBgColor !== 'transparent' ? '1.5rem' : '0'
          }}
        >
          <div
            className="overflow-hidden rounded-lg"
            style={{ maxWidth: `${settings.max_width || 100}%` }}
          >
            {settings.image_url ? (
              <img
                src={settings.image_url}
                alt={settings.title || settings.caption || 'Image'}
                className="w-full h-auto select-none pointer-events-none"
                draggable="false"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <div className="aspect-video flex items-center justify-center bg-slate-100">
                <ImageIcon className="w-16 h-16 text-slate-300" />
              </div>
            )}

            {(settings.title || settings.caption || settings.show_button) && (
              <div className={`p-4 ${imageTextAlignClass}`}>
                {settings.title && (
                  <h3
                    style={{
                      color: settings.title_color || '#000000',
                      fontSize: `${settings.title_font_size || 24}px`,
                      fontWeight: settings.title_font_weight || '600',
                      marginBottom: settings.caption ? '0.5rem' : '0'
                    }}
                  >
                    {settings.title}
                  </h3>
                )}

                {settings.caption && (
                  <p
                    style={{
                      color: settings.caption_color || '#666666',
                      fontSize: `${settings.caption_font_size || 14}px`,
                      fontWeight: settings.caption_font_weight || '400',
                      marginBottom: settings.show_button ? '1rem' : '0'
                    }}
                  >
                    {settings.caption}
                  </p>
                )}

                {settings.show_button && settings.button_text && (
                  <a
                    href={settings.button_url || '#'}
                    target={settings.button_url_target || '_self'}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all hover:shadow-lg hover:scale-105"
                    style={{
                      backgroundColor: settings.button_background_color || '#06b6d4',
                      color: settings.button_text_color || '#ffffff'
                    }}
                  >
                    {settings.button_text}
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      );

    case 'cta':
      return (
        <div className={`p-8 rounded-lg text-center ${darkMode ? 'bg-gradient-to-r from-cyan-900 to-blue-900' : 'bg-gradient-to-r from-cyan-50 to-blue-50'}`}>
          <h3 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {settings.title || 'Ready to Join?'}
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            {settings.description || 'Sign up now and be part of this amazing event!'}
          </p>
          <button className="px-8 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-semibold transition-colors">
            {settings.button_text || 'Get Started'}
          </button>
        </div>
      );

    case 'contact':
      return (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-6 h-6 text-cyan-500" />
            <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Contact Us
            </h3>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              disabled
            />
            <input
              type="email"
              placeholder="Email"
              className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              disabled
            />
            <textarea
              placeholder="Message"
              rows={3}
              className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
              disabled
            />
            <button className="w-full px-6 py-3 bg-cyan-600 text-white rounded-lg font-semibold">
              Send Message
            </button>
          </div>
        </div>
      );

    case 'spacer':
      return (
        <div style={{ height: settings.height || 40 }} />
      );

    case 'divider':
      return (
        <hr className={`my-4 ${darkMode ? 'border-slate-700' : 'border-slate-300'}`} />
      );

    case 'sponsor-grid':
      const gridColumns = settings.columns || 3;
      return (
        <div
          className="p-6 h-full flex flex-col"
          style={{
            backgroundColor: settings.background_color || 'transparent',
            color: settings.text_color || (darkMode ? '#ffffff' : '#1e293b')
          }}
        >
          {settings.show_title !== false && (
            <h3 className="text-xl font-bold mb-6 text-center">
              {settings.title || 'Our Sponsors'}
            </h3>
          )}
          {sponsors.length > 0 ? (
            <div
              className={`grid gap-6 flex-1 ${
                gridColumns >= 3 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' :
                gridColumns === 2 ? 'grid-cols-1 md:grid-cols-2' :
                'grid-cols-1'
              }`}
            >
              {sponsors.map((sponsor) => (
                <div
                  key={sponsor.id}
                  className="flex items-center justify-center p-4"
                  style={{
                    backgroundColor: settings.item_background_color || 'transparent'
                  }}
                >
                  {sponsor.logo_url ? (
                    <img
                      src={sponsor.logo_url}
                      alt={sponsor.name}
                      className="max-w-full object-contain select-none pointer-events-none"
                      style={{ maxHeight: `${settings.logo_height || 96}px` }}
                      draggable="false"
                      onContextMenu={(e) => e.preventDefault()}
                    />
                  ) : (
                    <span className="text-lg font-semibold">
                      {sponsor.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 opacity-70">
              No sponsors yet
            </p>
          )}
        </div>
      );

    case 'sponsor-carousel':
      const carouselBgColor = settings.background_color || 'transparent';
      const showCarouselBorder = settings.show_border !== false && carouselBgColor !== 'transparent';
      const applyGreyscale = settings.greyscale === true;
      const baseLogosPerView = settings.logos_per_view || 4;
      const logoHeight = settings.logo_height || 80;

      // Make responsive: 1 on mobile, 2 on tablet, full amount on desktop
      const logosPerView = currentViewport === 'mobile' ? 1 : currentViewport === 'tablet' ? 2 : baseLogosPerView;

      const getVisibleSponsors = () => {
        if (sponsors.length === 0) return [];
        if (sponsors.length <= logosPerView) return sponsors;

        const visible = [];
        for (let i = 0; i < logosPerView; i++) {
          const index = (currentSponsorIndex + i) % sponsors.length;
          visible.push(sponsors[index]);
        }
        return visible;
      };

      const visibleSponsors = getVisibleSponsors();

      const handlePrevSponsor = () => {
        setCurrentSponsorIndex(prev => prev === 0 ? sponsors.length - 1 : prev - 1);
      };

      const handleNextSponsor = () => {
        setCurrentSponsorIndex(prev => (prev + 1) % sponsors.length);
      };

      return (
        <div
          className={`p-6 rounded-lg ${showCarouselBorder ? (darkMode ? 'border border-slate-700' : 'border border-slate-200') : ''}`}
          style={{ backgroundColor: carouselBgColor }}
        >
          {settings.show_title !== false && (
            <h3
              className="text-xl font-bold mb-6 text-center"
              style={{ color: settings.title_color || (darkMode ? '#ffffff' : '#0f172a') }}
            >
              {settings.title || 'Our Sponsors'}
            </h3>
          )}
          {sponsors.length > 0 ? (
            <div className="relative">
              {/* Left Arrow - Only show if more sponsors than can fit */}
              {sponsors.length > logosPerView && settings.show_navigation !== false && (
                <button
                  onClick={handlePrevSponsor}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <div className="overflow-hidden px-8">
                <div
                  className="flex items-center justify-center transition-all duration-700 ease-in-out"
                  style={{
                    minHeight: `${logoHeight + 40}px`,
                    gap: currentViewport === 'mobile' ? '20px' : '50px'
                  }}
                >
                  {visibleSponsors.map((sponsor, index) => (
                    <div
                      key={`${sponsor.id}-${currentSponsorIndex}-${index}`}
                      className="flex items-center justify-center transition-all duration-700 ease-in-out"
                      style={{
                        width: currentViewport === 'mobile' ? '100%' : 'auto',
                        maxWidth: currentViewport === 'mobile' ? '240px' : '200px'
                      }}
                    >
                      {sponsor.logo_url ? (
                        <img
                          src={sponsor.logo_url}
                          alt={sponsor.name}
                          className="object-contain transition-all duration-700 select-none pointer-events-none"
                          draggable="false"
                          onContextMenu={(e) => e.preventDefault()}
                          style={{
                            filter: applyGreyscale ? 'grayscale(100%)' : 'none',
                            maxHeight: `${logoHeight}px`,
                            maxWidth: '100%'
                          }}
                        />
                      ) : (
                        <span
                          className="text-lg font-semibold text-center"
                          style={{ color: settings.text_color || (darkMode ? '#cbd5e1' : '#334155') }}
                        >
                          {sponsor.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Arrow - Only show if more sponsors than can fit */}
              {sponsors.length > logosPerView && settings.show_navigation !== false && (
                <button
                  onClick={handleNextSponsor}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(50%, -50%)' }}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {/* Dot Navigation */}
              {sponsors.length > logosPerView && settings.show_navigation !== false && (
                <div className="flex justify-center gap-2 mt-4">
                  {sponsors.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSponsorIndex(index)}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        index === currentSponsorIndex
                          ? 'bg-cyan-500'
                          : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              No sponsors yet
            </p>
          )}
        </div>
      );

    case 'registration-button':
      const buttonSize = settings.button_size || 'large';
      const buttonStyle = settings.button_style || 'solid';
      const buttonColor = settings.button_color || '#0ea5e9';
      const textColor = settings.text_color || '#ffffff';
      const alignment = settings.alignment || 'center';
      const showIcon = settings.show_icon !== false;
      const buttonText = settings.button_text || 'Register Now';

      const sizeClasses = {
        small: 'px-4 py-2 text-sm',
        medium: 'px-6 py-2.5 text-base',
        large: 'px-8 py-3 text-lg'
      };

      const alignmentClasses = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end'
      };

      const buttonClasses = `
        inline-flex items-center gap-2 font-semibold rounded-lg transition-all
        ${sizeClasses[buttonSize as keyof typeof sizeClasses]}
        ${buttonStyle === 'outline' ? 'border-2 hover:bg-opacity-10' : 'hover:opacity-90'}
      `;

      return (
        <>
          <div className={`p-6 flex ${alignmentClasses[alignment as keyof typeof alignmentClasses]}`}>
            <button
              onClick={() => setShowRegistrationModal(true)}
              className={buttonClasses}
              style={{
                backgroundColor: buttonStyle === 'solid' ? buttonColor : 'transparent',
                color: buttonStyle === 'solid' ? textColor : buttonColor,
                borderColor: buttonStyle === 'outline' ? buttonColor : 'transparent'
              }}
            >
              {buttonText}
              {showIcon && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
          {showRegistrationModal && eventData && (
            <EventRegistrationModal
              eventId={eventData.id}
              clubId={eventData.club_id}
              eventName={eventData.event_name}
              entryFee={eventData.entry_fee || 0}
              currency={eventData.currency || 'AUD'}
              onClose={() => setShowRegistrationModal(false)}
              onSuccess={() => {
                setShowRegistrationModal(false);
              }}
            />
          )}
        </>
      );

    case 'multi-button':
      const handleMultiButtonRegister = async (eventId: string) => {
        try {
          const { supabase } = await import('../../utils/supabase');

          // Load the selected event data
          const { data: event, error } = await supabase
            .from('public_events')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

          if (error) throw error;

          if (event) {
            setSelectedEventForRegistration(event);
            setShowRegistrationModal(true);
          }
        } catch (error) {
          console.error('Error loading event for registration:', error);
        }
      };

      return (
        <>
          <MultiButtonWidget
            settings={settings}
            eventWebsiteId={websiteId}
            onRegisterClick={handleMultiButtonRegister}
          />
          {showRegistrationModal && selectedEventForRegistration && (
            <EventRegistrationModal
              eventId={selectedEventForRegistration.id}
              clubId={selectedEventForRegistration.club_id}
              eventName={selectedEventForRegistration.event_name}
              entryFee={selectedEventForRegistration.entry_fee || 0}
              currency={selectedEventForRegistration.currency || 'AUD'}
              onClose={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
              onSuccess={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
            />
          )}
        </>
      );

    case 'class-selector-buttons':
      const handleClassSelectorRegister = async (eventId: string, className: string) => {
        try {
          const { supabase } = await import('../../utils/supabase');

          // Load the selected event data
          const { data: event, error } = await supabase
            .from('public_events')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

          if (error) throw error;

          if (event) {
            setSelectedEventForRegistration(event);
            setShowRegistrationModal(true);
          }
        } catch (error) {
          console.error('Error loading event for registration:', error);
        }
      };

      return (
        <>
          <ClassSelectorButtonsWidget
            settings={settings}
            eventWebsiteId={websiteId}
            onRegisterClick={handleClassSelectorRegister}
          />
          {showRegistrationModal && selectedEventForRegistration && (
            <EventRegistrationModal
              eventId={selectedEventForRegistration.id}
              clubId={selectedEventForRegistration.club_id}
              eventName={selectedEventForRegistration.event_name}
              entryFee={selectedEventForRegistration.entry_fee || 0}
              currency={selectedEventForRegistration.currency || 'AUD'}
              onClose={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
              onSuccess={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
            />
          )}
        </>
      );

    case 'code-block':
      const codeHeight = settings.height || 400;
      const enableSandbox = settings.enable_sandbox !== false;

      return (
        <div className="w-full" style={{ height: codeHeight === 0 ? 'auto' : `${codeHeight}px` }}>
          {settings.code ? (
            <div
              className="w-full h-full"
              dangerouslySetInnerHTML={{ __html: settings.code }}
              {...(enableSandbox && { 'data-sandbox': 'allow-scripts allow-same-origin' })}
            />
          ) : (
            <div className={`flex items-center justify-center h-full rounded-lg border-2 border-dashed ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-50'}`}>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Add HTML or embed code in widget settings
              </p>
            </div>
          )}
        </div>
      );

    case 'weather-widget':
      const weatherHeight = settings.height || 240;

      if (!eventData?.venue_latitude || !eventData?.venue_longitude) {
        return (
          <div className={`rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'} p-6`}>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} text-center`}>
              Weather widget requires venue coordinates
            </p>
          </div>
        );
      }

      return (
        <div className="w-full rounded-lg overflow-hidden pointer-events-none" style={{ height: `${weatherHeight}px` }}>
          <iframe
            width="100%"
            height="100%"
            src={`https://embed.windy.com/embed.html?type=forecast&location=coordinates&detail=true&detailLat=${eventData.venue_latitude}&detailLon=${eventData.venue_longitude}&metricTemp=°C&metricRain=mm&metricWind=kt`}
            frameBorder="0"
            className="w-full h-full"
          />
        </div>
      );

    case 'weather-full':
      const fullWeatherHeight = settings.height || 600;
      const showMarker = settings.show_marker !== false;
      const zoomLevel = settings.zoom_level || 11;

      if (!eventData?.venue_latitude || !eventData?.venue_longitude) {
        return (
          <div className={`rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'} p-6`}>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} text-center`}>
              Weather map requires venue coordinates
            </p>
          </div>
        );
      }

      const fullWeatherUrl = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt&zoom=${zoomLevel}&overlay=wind&product=ecmwf&level=surface&lat=${eventData.venue_latitude}&lon=${eventData.venue_longitude}&detailLat=${eventData.venue_latitude}&detailLon=${eventData.venue_longitude}&marker=${showMarker}&pressure=true&message=true`;

      return (
        <div className="w-full rounded-lg overflow-hidden relative" style={{ height: `${fullWeatherHeight}px` }}>
          <iframe
            width="100%"
            height="100%"
            src={fullWeatherUrl}
            frameBorder="0"
            className="w-full h-full"
            sandbox="allow-scripts allow-same-origin"
          />
          {/* Overlay to block clicks on Windy logo (bottom-left corner) */}
          <div
            className="absolute bottom-0 left-0 w-32 h-12 pointer-events-auto cursor-default"
            onClick={(e) => e.preventDefault()}
          />
        </div>
      );

    case 'venue-map':
      // Handle both old format (number + unit) and new format (string like "100vh")
      let mapHeight = settings.map_height || '400px';
      if (typeof mapHeight === 'number') {
        const unit = settings.map_height_unit || 'px';
        mapHeight = `${mapHeight}${unit}`;
      }
      const zoomLevelMap = settings.zoom_level || 14;
      const grayscale = settings.grayscale !== false;
      const showBorder = settings.show_border !== false;
      const borderRadius = settings.border_radius || 8;

      console.log('Venue Map - eventData:', eventData);

      // Try to get coordinates from various sources (prioritize joined venue data)
      let latitude = null;
      let longitude = null;
      let venueAddress = null;

      // Check for joined venue data (from public_events -> venues)
      if (eventData?.venues?.latitude && eventData?.venues?.longitude) {
        latitude = eventData.venues.latitude;
        longitude = eventData.venues.longitude;
        venueAddress = eventData.venues.address || eventData.venues.name;
      }
      // Check for direct venue coordinates on event
      else if (eventData?.venue_latitude && eventData?.venue_longitude) {
        latitude = eventData.venue_latitude;
        longitude = eventData.venue_longitude;
      }
      // Fallback to venue text field
      else {
        venueAddress = eventData?.venue;
      }

      // If we have coordinates, use them
      if (latitude && longitude) {
        const coordMapUrl = `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${latitude},${longitude}&zoom=${zoomLevelMap}`;

        return (
          <div
            className={`overflow-hidden ${showBorder ? `border ${darkMode ? 'border-slate-700' : 'border-slate-200'}` : ''}`}
            style={{
              height: mapHeight,
              borderRadius: showBorder ? `${borderRadius}px` : '0'
            }}
          >
            <iframe
              width="100%"
              height="100%"
              frameBorder="0"
              style={{
                border: 0,
                filter: grayscale ? 'grayscale(100%) contrast(1.2) brightness(0.95)' : 'none'
              }}
              src={coordMapUrl}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        );
      }

      // If we have a venue address, search for it
      if (venueAddress) {
        const addressMapUrl = `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(venueAddress)}&zoom=${zoomLevelMap}`;

        return (
          <div
            className={`overflow-hidden ${showBorder ? `border ${darkMode ? 'border-slate-700' : 'border-slate-200'}` : ''}`}
            style={{
              height: mapHeight,
              borderRadius: showBorder ? `${borderRadius}px` : '0'
            }}
          >
            <iframe
              width="100%"
              height="100%"
              frameBorder="0"
              style={{
                border: 0,
                filter: grayscale ? 'grayscale(100%) contrast(1.2) brightness(0.95)' : 'none'
              }}
              src={addressMapUrl}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        );
      }

      // No venue information available
      return (
        <div
          className={`rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'} p-6 flex items-center justify-center`}
          style={{
            height: mapHeight,
            borderRadius: showBorder ? `${borderRadius}px` : '0'
          }}
        >
          <div className="text-center">
            <MapPin className={`w-12 h-12 ${darkMode ? 'text-slate-600' : 'text-slate-400'} mx-auto mb-2`} />
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Venue location not configured
            </p>
            <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'} mt-1`}>
              Please add venue coordinates to the event
            </p>
          </div>
        </div>
      );

    case 'accommodation-map':
      return <AccommodationMapWidget settings={settings} eventData={eventData} eventWebsiteId={websiteId || ''} darkMode={darkMode} />;

    case 'contact-form':
      const formTitle = settings.title || 'Get in Touch';
      const formDescription = settings.description || '';
      const formBgColor = settings.background_color || 'transparent';
      const recipientEmail = settings.recipient_email || '';
      const recipientName = settings.recipient_name || '';
      const formFields = (settings.fields && settings.fields.length > 0) ? settings.fields : [
        { id: 'name', label: 'Name', type: 'text', required: true, enabled: true },
        { id: 'email', label: 'Email', type: 'email', required: true, enabled: true },
        { id: 'phone', label: 'Phone', type: 'tel', required: false, enabled: true },
        { id: 'subject', label: 'Subject', type: 'text', required: true, enabled: true },
        { id: 'message', label: 'Message', type: 'textarea', required: true, enabled: true }
      ];
      const titleColor = settings.title_color || 'auto';
      const descriptionColor = settings.description_color || 'auto';
      const labelColor = settings.label_color || 'auto';
      const inputBgColor = settings.input_bg_color || 'auto';
      const inputTextColor = settings.input_text_color || 'auto';
      const inputBorderColor = settings.input_border_color || 'auto';
      const buttonBgColor = settings.button_bg_color || '#06b6d4';
      const buttonTextColor = settings.button_text_color || '#ffffff';
      const buttonLabel = settings.button_label || 'Send Message';
      const successMessage = settings.success_message || 'Thank you for your message! We\'ll get back to you soon.';
      const errorMessage = settings.error_message || 'Sorry, there was an error sending your message. Please try again.';

      const formBgStyle = formBgColor === 'transparent' ? {} : { backgroundColor: formBgColor };

      const [formData, setFormData] = React.useState<Record<string, string>>({});
      const [isSubmitting, setIsSubmitting] = React.useState(false);
      const [submitStatus, setSubmitStatus] = React.useState<'idle' | 'success' | 'error'>('idle');

      const handleInputChange = (fieldId: string, value: string) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
      };

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitStatus('idle');

        try {
          // Validate required fields
          if (!recipientEmail) {
            console.error('Recipient email not configured');
            setSubmitStatus('error');
            setIsSubmitting(false);
            return;
          }

          if (!formData.name || !formData.email || !formData.subject || !formData.message) {
            console.error('Required fields missing');
            setSubmitStatus('error');
            setIsSubmitting(false);
            return;
          }

          // Build the full message including any additional fields
          const additionalFields = Object.entries(formData)
            .filter(([key]) => key !== 'name' && key !== 'email' && key !== 'subject' && key !== 'phone' && key !== 'message')
            .map(([key, value]) => {
              const field = formFields.find(f => f.id === key);
              return `${field?.label || key}: ${value}`;
            });

          const fullMessage = formData.message + (additionalFields.length > 0 ? '\n\n' + additionalFields.join('\n\n') : '');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-form`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              recipient_email: recipientEmail,
              recipient_name: recipientName || undefined,
              sender_name: formData.name,
              sender_email: formData.email,
              subject: formData.subject,
              message: fullMessage,
              phone: formData.phone || undefined,
              event_name: eventData?.title || undefined,
              club_name: eventData?.club_name || undefined
            })
          });

          if (response.ok) {
            setSubmitStatus('success');
            setFormData({});
          } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Error submitting contact form:', response.status, errorData);
            console.error('Full error details:', JSON.stringify(errorData, null, 2));
            setSubmitStatus('error');
          }
        } catch (error) {
          console.error('Error submitting form:', error);
          setSubmitStatus('error');
        } finally {
          setIsSubmitting(false);
        }
      };

      return (
        <div className="p-6 rounded-lg" style={formBgStyle}>
          {formTitle && (
            <h2
              className={`text-2xl font-bold mb-3 ${titleColor === 'auto' ? (darkMode ? 'text-white' : 'text-slate-900') : ''}`}
              style={titleColor !== 'auto' ? { color: titleColor } : {}}
            >
              {formTitle}
            </h2>
          )}
          {formDescription && (
            <p
              className={`mb-6 ${descriptionColor === 'auto' ? (darkMode ? 'text-slate-400' : 'text-slate-600') : ''}`}
              style={descriptionColor !== 'auto' ? { color: descriptionColor } : {}}
            >
              {formDescription}
            </p>
          )}

          {submitStatus === 'success' ? (
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'} border`}>
              <p className={`${darkMode ? 'text-green-400' : 'text-green-800'}`}>
                {successMessage}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formFields.filter(field => field.enabled).map(field => (
                <div key={field.id}>
                  <label
                    className={`block text-sm font-medium mb-2 ${labelColor === 'auto' ? (darkMode ? 'text-slate-300' : 'text-slate-700') : ''}`}
                    style={labelColor !== 'auto' ? { color: labelColor } : {}}
                  >
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      required={field.required}
                      value={formData[field.id] || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      rows={4}
                      className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                        inputBgColor === 'auto' ? (darkMode ? 'bg-slate-800' : 'bg-white') : ''
                      } ${
                        inputTextColor === 'auto' ? (darkMode ? 'text-white' : 'text-slate-900') : ''
                      } ${
                        inputBorderColor === 'auto' ? (darkMode ? 'border-slate-700' : 'border-slate-300') : ''
                      }`}
                      style={{
                        ...(inputBgColor !== 'auto' ? { backgroundColor: inputBgColor } : {}),
                        ...(inputTextColor !== 'auto' ? { color: inputTextColor } : {}),
                        ...(inputBorderColor !== 'auto' ? { borderColor: inputBorderColor } : {})
                      }}
                    />
                  ) : (
                    <input
                      type={field.type}
                      required={field.required}
                      value={formData[field.id] || ''}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className={`w-full px-4 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                        inputBgColor === 'auto' ? (darkMode ? 'bg-slate-800' : 'bg-white') : ''
                      } ${
                        inputTextColor === 'auto' ? (darkMode ? 'text-white' : 'text-slate-900') : ''
                      } ${
                        inputBorderColor === 'auto' ? (darkMode ? 'border-slate-700' : 'border-slate-300') : ''
                      }`}
                      style={{
                        ...(inputBgColor !== 'auto' ? { backgroundColor: inputBgColor } : {}),
                        ...(inputTextColor !== 'auto' ? { color: inputTextColor } : {}),
                        ...(inputBorderColor !== 'auto' ? { borderColor: inputBorderColor } : {})
                      }}
                    />
                  )}
                </div>
              ))}

              {submitStatus === 'error' && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-red-900/30 border-red-800' : 'bg-red-50 border-red-200'} border`}>
                  <p className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-800'}`}>
                    {errorMessage}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 rounded-lg font-medium transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: buttonBgColor,
                  color: buttonTextColor
                }}
              >
                {isSubmitting ? 'Sending...' : buttonLabel}
              </button>
            </form>
          )}
        </div>
      );

    case 'news-feed':
      const newsFeedTitle = settings.title || 'LATEST NEWS';
      const maxNewsItems = settings.max_items || 3;
      const showFeedImages = settings.show_images !== false;
      const showFeedExcerpt = settings.show_excerpt !== false;
      const feedExcerptLength = settings.excerpt_length || 100;
      const enableNewsCarousel = settings.enable_carousel !== false;
      const cardStyle = settings.card_style || 'elevated';
      const cardBgColor = settings.card_bg_color || 'auto';
      const cardTitleColor = settings.card_title_color || 'auto';
      const cardExcerptColor = settings.card_excerpt_color || 'auto';
      const showNewsLink = settings.show_link !== false;
      const newsLinkText = settings.link_text || 'more news »';
      const newsLinkType = settings.link_type || 'page';
      const newsLinkPage = settings.link_page || '';
      const newsLinkUrl = newsLinkType === 'page'
        ? (websiteSlug && newsLinkPage ? `/events/${websiteSlug}/${newsLinkPage}` : newsLinkPage)
        : (settings.link_url || '/news');
      const newsReadMoreLabel = settings.read_more_label || 'Read More';
      const newsLinkColor = settings.link_color || '#06b6d4';
      const newsFeedBgColor = settings.background_color || 'transparent';
      const newsFeedTitleColor = settings.title_color || (newsFeedBgColor === 'transparent' ? '#ffffff' : '#000000');
      const newsFeedTitleFontFamily = settings.title_font_family || 'inherit';
      const newsFeedTitleFontSize = settings.title_font_size || 24;
      const newsFeedTitleFontWeight = settings.title_font_weight || '700';

      const newsFeedBgStyle = newsFeedBgColor === 'transparent'
        ? {}
        : { backgroundColor: newsFeedBgColor };

      const newsFeedTitleStyle = {
        color: newsFeedTitleColor,
        fontFamily: newsFeedTitleFontFamily,
        fontSize: `${newsFeedTitleFontSize}px`,
        fontWeight: newsFeedTitleFontWeight
      };

      const displayedNews = newsArticles.slice(0, maxNewsItems);
      const needsNewsCarousel = newsArticles.length > maxNewsItems && enableNewsCarousel;
      const newsItemsPerView = maxNewsItems;
      const maxNewsCarouselIndex = Math.max(0, newsArticles.length - newsItemsPerView);

      const handlePrevNews = () => {
        setNewsCarouselIndex(prev => Math.max(0, prev - 1));
      };

      const handleNextNews = () => {
        setNewsCarouselIndex(prev => Math.min(maxNewsCarouselIndex, prev + 1));
      };

      const carouselNews = needsNewsCarousel
        ? newsArticles.slice(newsCarouselIndex, newsCarouselIndex + newsItemsPerView)
        : displayedNews;

      return (
        <>
        <div
          className="p-6 rounded-lg"
          style={newsFeedBgStyle}
        >
          {newsFeedTitle && (
            <div className="mb-4">
              <h3 className="tracking-wide" style={newsFeedTitleStyle}>
                {newsFeedTitle}
              </h3>
            </div>
          )}

          {newsArticles.length === 0 ? (
            <div className={`text-center py-8 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
              <Newspaper className={`w-10 h-10 ${darkMode ? 'text-slate-600' : 'text-slate-300'} mx-auto mb-2`} />
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No news articles available
              </p>
            </div>
          ) : (
            <div className="relative">
              {needsNewsCarousel && newsCarouselIndex > 0 && (
                <button
                  onClick={handlePrevNews}
                  className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(-50%, -50%)' }}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {carouselNews.map((article, index) => {
                  const cardClasses = [
                    'overflow-hidden rounded-lg transition-all duration-300'
                  ];

                  if (cardBgColor === 'auto') {
                    cardClasses.push(darkMode ? 'bg-slate-800' : 'bg-white');
                  }

                  if (cardStyle === 'elevated') {
                    cardClasses.push('shadow-md hover:shadow-xl');
                  } else if (cardStyle === 'bordered') {
                    cardClasses.push(darkMode ? 'border border-slate-700' : 'border border-slate-200');
                  }

                  const truncatedExcerpt = article.excerpt && article.excerpt.length > feedExcerptLength
                    ? `${article.excerpt.substring(0, feedExcerptLength)}...`
                    : article.excerpt;

                  const cardBgStyle = cardBgColor !== 'auto' ? { backgroundColor: cardBgColor } : {};
                  const titleColorStyle = cardTitleColor !== 'auto' ? { color: cardTitleColor } : {};
                  const excerptColorStyle = cardExcerptColor !== 'auto' ? { color: cardExcerptColor } : {};

                  return (
                    <div
                      key={article.id}
                      className={cardClasses.join(' ')}
                      style={cardBgStyle}
                    >
                      {showFeedImages && article.cover_image && (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={article.cover_image}
                            alt={article.title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <h4
                          className={`font-semibold text-base mb-2 line-clamp-2 ${cardTitleColor === 'auto' ? (darkMode ? 'text-white' : 'text-slate-900') : ''}`}
                          style={titleColorStyle}
                        >
                          {article.title}
                        </h4>
                        {showFeedExcerpt && truncatedExcerpt && (
                          <p
                            className={`text-sm mb-3 line-clamp-2 ${cardExcerptColor === 'auto' ? (darkMode ? 'text-slate-400' : 'text-slate-600') : ''}`}
                            style={excerptColorStyle}
                          >
                            {truncatedExcerpt}
                          </p>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedArticle(article);
                            setArticleModalOpen(true);
                          }}
                          className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                          style={{ color: newsLinkColor }}
                        >
                          {newsReadMoreLabel}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {needsNewsCarousel && newsCarouselIndex < maxNewsCarouselIndex && (
                <button
                  onClick={handleNextNews}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-colors ${
                    darkMode
                      ? 'bg-slate-800/90 hover:bg-slate-700 text-white'
                      : 'bg-white/90 hover:bg-white text-slate-900 shadow-lg'
                  }`}
                  style={{ transform: 'translate(50%, -50%)' }}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {showNewsLink && newsArticles.length > 0 && (
            <div className="flex justify-end mt-3">
              <a
                href={newsLinkUrl}
                className={`text-sm hover:underline transition-colors ${
                  darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
                }`}
              >
                {newsLinkText}
              </a>
            </div>
          )}
        </div>
        {selectedArticle && (
          <ArticleDetailModal
            article={selectedArticle}
            isOpen={articleModalOpen}
            onClose={() => {
              setArticleModalOpen(false);
              setSelectedArticle(null);
            }}
            darkMode={darkMode}
          />
        )}
      </>
    );

    case 'news-blog':
      const newsBlogTitle = settings.title || 'News & Updates';
      const newsBlogColumns = settings.columns || 3;
      const showNewsImages = settings.show_images !== false;
      const showNewsExcerpt = settings.show_excerpt !== false;
      const excerptLength = settings.excerpt_length || 150;
      const blogReadMoreLabel = settings.read_more_label || 'Read More';
      const blogLinkColor = settings.link_color || '#06b6d4';
      const newsBlogBgColor = settings.background_color || 'transparent';
      const loadMoreNewsCount = settings.load_more_count || 6;

      const newsBlogBgStyle = newsBlogBgColor === 'transparent'
        ? {}
        : { backgroundColor: newsBlogBgColor };

      const visibleNews = newsArticles.slice(0, visibleNewsCount);
      const hasMoreNews = visibleNewsCount < newsArticles.length;

      const handleLoadMoreNews = () => {
        const newCount = Math.min(
          visibleNewsCount + loadMoreNewsCount,
          newsArticles.length
        );
        setVisibleNewsCount(newCount);
      };

      return (
        <>
          <div
            className="p-6 rounded-lg"
            style={newsBlogBgStyle}
          >
            {newsBlogTitle && (
              <div className="mb-6">
                <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {newsBlogTitle}
                </h2>
              </div>
            )}

            {newsArticles.length === 0 ? (
            <div className={`text-center py-12 rounded-lg ${darkMode ? 'bg-slate-700/30' : 'bg-slate-50'}`}>
              <Newspaper className={`w-12 h-12 ${darkMode ? 'text-slate-600' : 'text-slate-300'} mx-auto mb-3`} />
              <p className={`${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No news articles available
              </p>
            </div>
            ) : (
            <>
              <div
                className="grid gap-6 mb-6"
                style={{
                  gridTemplateColumns: `repeat(${newsBlogColumns}, minmax(0, 1fr))`
                }}
              >
                {visibleNews.map((article) => {
                  const articleUrl = `/events/${websiteSlug}/news/${article.id}`;
                  const publishedDate = article.published_at
                    ? new Date(article.published_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : '';

                  return (
                    <div
                      key={article.id}
                      className={`overflow-hidden rounded-lg ${
                        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                      } border hover:shadow-lg transition-shadow duration-300`}
                    >
                      {showNewsImages && article.cover_image && (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={article.cover_image}
                            alt={article.title}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="p-5">
                        {publishedDate && (
                          <p className={`text-xs mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                            {publishedDate}
                          </p>
                        )}
                        <h3 className={`font-bold text-lg mb-3 line-clamp-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {article.title}
                        </h3>
                        {showNewsExcerpt && article.excerpt && (
                          <p className={`text-sm mb-4 line-clamp-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {article.excerpt.length > excerptLength
                              ? `${article.excerpt.substring(0, excerptLength)}...`
                              : article.excerpt}
                          </p>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedArticle(article);
                            setArticleModalOpen(true);
                          }}
                          className="text-sm font-medium inline-flex items-center gap-1 hover:underline"
                          style={{ color: blogLinkColor }}
                        >
                          {blogReadMoreLabel}
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasMoreNews && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={handleLoadMoreNews}
                    className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                        : 'bg-cyan-500 hover:bg-cyan-600 text-white'
                    }`}
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
            )}
          </div>
          {selectedArticle && (
            <ArticleDetailModal
              article={selectedArticle}
              isOpen={articleModalOpen}
              onClose={() => {
                setArticleModalOpen(false);
                setSelectedArticle(null);
              }}
              darkMode={darkMode}
            />
          )}
        </>
      );

    case 'quick-link-tiles':
      return (
        <>
          <QuickLinkTilesWidget
            settings={settings}
            onOpenRegistrationModal={(eventId) => {
              if (eventId) {
                handleOpenRegistration(eventId);
              }
            }}
            websiteSlug={websiteSlug || eventData?.event_slug}
            eventId={eventData?.id}
            eventWebsiteId={isSubdomainOrCustomDomain ? websiteId : undefined}
          />
          {showRegistrationModal && selectedEventForRegistration && (
            <EventRegistrationModal
              eventId={selectedEventForRegistration.id}
              clubId={selectedEventForRegistration.club_id}
              eventName={selectedEventForRegistration.event_name}
              entryFee={selectedEventForRegistration.entry_fee || 0}
              currency={selectedEventForRegistration.currency || 'AUD'}
              onClose={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
              onSuccess={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
            />
          )}
        </>
      );

    case 'skipper-live-tracking':
      // Use event_id from settings if provided, otherwise fall back to eventData.id
      const trackingEventId = settings.event_id || eventData?.id || '';
      return (
        <LiveTrackingWidget
          settings={settings}
          eventId={trackingEventId}
        />
      );

    default:
      const defaultWidget = (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800' : 'bg-white'} border ${darkMode ? 'border-slate-700' : 'border-slate-200'} text-center`}>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Widget: {widget.type}
          </p>
        </div>
      );

      return (
        <>
          {defaultWidget}
          {showRegistrationModal && selectedEventForRegistration && (
            <EventRegistrationModal
              eventId={selectedEventForRegistration.id}
              clubId={selectedEventForRegistration.club_id}
              eventName={selectedEventForRegistration.event_name}
              entryFee={selectedEventForRegistration.entry_fee || 0}
              currency={selectedEventForRegistration.currency || 'AUD'}
              onClose={() => {
                setShowRegistrationModal(false);
                setSelectedEventForRegistration(null);
              }}
              onSuccess={() => {
                setShowRegistrationModal(false);
              }}
            />
          )}
          {showRegistrationModal && eventData && widget.type === 'event-info' && !selectedEventForRegistration && (
            <EventRegistrationModal
              eventId={eventData.id}
              clubId={eventData.club_id}
              eventName={eventData.event_name}
              entryFee={eventData.entry_fee || 0}
              currency={eventData.currency || 'AUD'}
              onClose={() => setShowRegistrationModal(false)}
              onSuccess={() => {
                setShowRegistrationModal(false);
              }}
            />
          )}
          {selectedArticle && (
            <ArticleDetailModal
              article={selectedArticle}
              isOpen={articleModalOpen}
              onClose={() => {
                setArticleModalOpen(false);
                setSelectedArticle(null);
              }}
              darkMode={darkMode}
            />
          )}
        </>
      );
  }
};
