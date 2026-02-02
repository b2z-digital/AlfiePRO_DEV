import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Calendar, MapPin, Users, Trophy, Loader2, AlertCircle, ExternalLink, ArrowLeft, Menu as MenuIcon, X, Home } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { eventWebsiteStorage } from '../../utils/eventWebsiteStorage';
import { EventWidgetRenderer } from '../events/EventWidgetRenderer';
import { EventRegistrationModal } from '../events/EventRegistrationModal';
import { ClassSelectorModal } from '../events/ClassSelectorModal';
import InviteMateModal from '../events/InviteMateModal';
import { useEventClassSelector } from '../../hooks/useEventClassSelector';
import { eventInvitationStorage } from '../../utils/eventInvitationStorage';
import type { EventWebsite, EventPageRow, EventGlobalSection } from '../../types/eventWebsite';
import { GoogleAnalytics } from '../GoogleAnalytics';

interface PublicEventWebsitePageProps {
  eventWebsiteId?: string;
}

export const PublicEventWebsitePage: React.FC<PublicEventWebsitePageProps> = ({ eventWebsiteId }) => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [website, setWebsite] = useState<EventWebsite | null>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [pageContent, setPageContent] = useState<{ rows: EventPageRow[]; title: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigationPages, setNavigationPages] = useState<any[]>([]);
  const [globalSections, setGlobalSections] = useState<{
    header: EventGlobalSection | null;
    menu: EventGlobalSection | null;
    footer: EventGlobalSection | null;
  }>({ header: null, menu: null, footer: null });
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedEventForRegistration, setSelectedEventForRegistration] = useState<any>(null);
  const [showInviteMateModal, setShowInviteMateModal] = useState(false);
  const [registeredEventForInvite, setRegisteredEventForInvite] = useState<any>(null);
  const [currentViewport, setCurrentViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Class selector for smart NOR and registration buttons
  const { classes, showModal, setShowModal, modalType, handleAction, handleClassSelect } = useEventClassSelector(website?.id);

  // Detect viewport size for responsive settings
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 1024) {
        setCurrentViewport('desktop');
      } else if (width >= 768) {
        setCurrentViewport('tablet');
      } else {
        setCurrentViewport('mobile');
      }
    };

    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (slug || eventWebsiteId) {
      loadEventWebsite();
    }
  }, [slug, eventWebsiteId, location.pathname]);

  // Debug logging for CTA buttons
  useEffect(() => {
    if (globalSections.menu?.config?.cta_buttons) {
      console.log('[PublicEventWebsite] CTA Buttons:', JSON.stringify(globalSections.menu.config.cta_buttons, null, 2));
      console.log('[PublicEventWebsite] Menu enabled:', globalSections.menu?.enabled);
      console.log('[PublicEventWebsite] Menu style:', globalSections.menu.config.style);
      console.log('[PublicEventWebsite] Menu position:', globalSections.menu.config.menu_position);
      console.log('[PublicEventWebsite] Left buttons:', globalSections.menu.config.cta_buttons.filter((b: any) => (b.position === 'left' || !b.position)));
      console.log('[PublicEventWebsite] Right buttons:', globalSections.menu.config.cta_buttons.filter((b: any) => b.position === 'right'));
    }
  }, [globalSections.menu]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const invitationToken = searchParams.get('token');

    if (invitationToken) {
      handleInvitationToken(invitationToken);
    }
  }, [location.search]);

  const handleInvitationToken = async (token: string) => {
    try {
      const invitationDetails = await eventInvitationStorage.getInvitationByToken(token);

      if (!invitationDetails) {
        console.error('Invitation not found or expired');
        return;
      }

      if (invitationDetails.status !== 'pending') {
        console.log('Invitation already used or expired');
        return;
      }

      const { data: event } = await supabase
        .from('quick_races')
        .select('*')
        .eq('id', invitationDetails.event_id)
        .single();

      if (event) {
        setSelectedEventForRegistration(event);
        setShowRegistrationModal(true);
      }
    } catch (error) {
      console.error('Error handling invitation token:', error);
    }
  };

  const loadEventWebsite = async () => {
    if (!slug && !eventWebsiteId) {
      console.log('[PublicEventWebsite] No slug or eventWebsiteId provided');
      return;
    }

    try {
      setLoading(true);

      console.log('[PublicEventWebsite] Loading with:', { slug, eventWebsiteId });

      const { supabase } = await import('../../utils/supabase');

      // Load event website data by ID or slug
      let query = supabase
        .from('event_websites')
        .select('*')
        .eq('enabled', true);

      if (eventWebsiteId) {
        query = query.eq('id', eventWebsiteId);
      } else if (slug) {
        query = query.eq('slug', slug);
      }

      const { data: websiteData, error } = await query.single();

      console.log('[PublicEventWebsite] Website query result:', { websiteData, error });

      if (error) throw error;

      setWebsite(websiteData);

      // Manually fetch the event data since the foreign key was removed
      if (websiteData.event_id) {
        console.log('[PublicEventWebsite] Fetching event data for:', websiteData.event_id);
        const { data: publicEvent, error: eventError } = await supabase
          .from('public_events')
          .select(`
            id,
            event_name,
            date,
            event_level,
            venue,
            venue_id,
            club_id,
            entry_fee,
            venues (
              id,
              name,
              address,
              latitude,
              longitude
            )
          `)
          .eq('id', websiteData.event_id)
          .maybeSingle();

        console.log('[PublicEventWebsite] Event query result:', { publicEvent, eventError });

        setEventData(publicEvent || null);
      } else {
        console.log('[PublicEventWebsite] No event_id on website');
      }

      // Increment view count
      if (websiteData?.id) {
        try {
          await supabase.rpc('increment_event_website_views', {
            website_id: websiteData.id
          });
        } catch (err) {
          // Ignore view count errors
        }
      }

      // Load global sections (header, menu, footer)
      const { data: sections } = await supabase
        .from('event_global_sections')
        .select('*')
        .eq('event_website_id', websiteData.id);

      console.log('[PublicEventWebsite] Global sections loaded:', sections);

      if (sections) {
        const sectionsMap = {
          header: sections.find(s => s.section_type === 'header') || null,
          menu: sections.find(s => s.section_type === 'menu') || null,
          footer: sections.find(s => s.section_type === 'footer') || null
        };
        console.log('[PublicEventWebsite] Global sections map:', sectionsMap);
        console.log('[PublicEventWebsite] Header config:', sectionsMap.header?.config);
        console.log('[PublicEventWebsite] Menu config:', sectionsMap.menu?.config);
        console.log('[PublicEventWebsite] Footer config:', sectionsMap.footer?.config);
        setGlobalSections(sectionsMap);
      }

      // Load navigation pages from event_page_layouts
      const { data: navPages } = await supabase
        .from('event_page_layouts')
        .select('id, title, page_slug, page_type, navigation_order')
        .eq('event_website_id', websiteData.id)
        .eq('show_in_navigation', true)
        .eq('is_published', true)
        .order('navigation_order', { ascending: true });

      if (navPages) {
        // Map page_slug to slug for compatibility with navigation links
        const mappedPages = navPages.map(page => ({
          ...page,
          slug: page.page_slug
        }));
        console.log('[PublicEventWebsite] Navigation pages loaded:', mappedPages);
        setNavigationPages(mappedPages);
      }

      // Determine which page to load
      // When loaded via subdomain, path is just "/" or "/page-slug"
      // When loaded via /events/{slug}, path is "/events/{slug}" or "/events/{slug}/page-slug"
      let pathAfterSlug = '';

      if (eventWebsiteId) {
        // Subdomain mode: use full path (except the leading slash)
        pathAfterSlug = location.pathname === '/' ? '' : location.pathname.substring(1);
      } else if (slug) {
        // Normal route mode: extract path after /events/{slug}
        pathAfterSlug = location.pathname.split(`/events/${slug}`)[1] || '';
      }

      console.log('[PublicEventWebsite] Path after slug:', pathAfterSlug);
      console.log('[PublicEventWebsite] Website ID:', websiteData.id);

      let pageData = null;

      if (pathAfterSlug) {
        // Try to load specific page by slug
        console.log('[PublicEventWebsite] Looking for page with slug:', pathAfterSlug);

        // Remove leading slash if present
        const cleanSlug = pathAfterSlug.startsWith('/') ? pathAfterSlug.substring(1) : pathAfterSlug;

        const { data, error: pageError } = await supabase
          .from('event_page_layouts')
          .select('*')
          .eq('event_website_id', websiteData.id)
          .eq('page_slug', cleanSlug)
          .eq('is_published', true)
          .maybeSingle();

        if (pageError) {
          console.error('[PublicEventWebsite] Error loading specific page:', pageError);
        } else {
          console.log('[PublicEventWebsite] Specific page result:', data);
        }

        pageData = data;
      }

      // If no specific page or no path, load homepage
      if (!pageData) {
        console.log('[PublicEventWebsite] Loading homepage...');
        const { data: homepageData, error: homepageError } = await supabase
          .from('event_page_layouts')
          .select('*')
          .eq('event_website_id', websiteData.id)
          .eq('is_homepage', true)
          .eq('is_published', true)
          .maybeSingle();

        if (homepageError) {
          console.error('[PublicEventWebsite] Error loading homepage:', homepageError);
        } else {
          console.log('[PublicEventWebsite] Homepage result:', homepageData);
        }

        pageData = homepageData;
      }

      // Set page content if found
      console.log('[PublicEventWebsite] Final pageData:', pageData);
      if (pageData) {
        console.log('[PublicEventWebsite] Setting page content with', pageData.rows?.length || 0, 'rows');
        if (pageData.rows && pageData.rows.length > 0) {
          console.log('[PublicEventWebsite] First row padding:', JSON.stringify(pageData.rows[0]?.padding));
          console.log('[PublicEventWebsite] First row margin:', JSON.stringify(pageData.rows[0]?.margin));
          console.log('[PublicEventWebsite] First row fullWidth:', pageData.rows[0]?.fullWidth);
        }
        setPageContent({
          rows: pageData.rows || [],
          title: pageData.title || 'Page'
        });
      } else {
        console.log('[PublicEventWebsite] No page found, showing under construction');
        // No pages found, show default under construction
        setPageContent(null);
      }
    } catch (error) {
      console.error('Error loading event website:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading event website...</p>
        </div>
      </div>
    );
  }

  if (!website || !eventData) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Event Website Not Found</h1>
          <p className="text-slate-400 mb-6">
            The event website you're looking for doesn't exist or has been disabled.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Render page layout with global sections (header/menu/footer)
  const headerConfig = globalSections.header?.config || {};
  const menuConfig = globalSections.menu?.config || {};
  const footerConfig = globalSections.footer?.config || {};

  // Helper functions for navigation
  const getHomeUrl = () => {
    return eventWebsiteId ? '/' : `/events/${slug}`;
  };

  const getPageUrl = (pageSlug: string) => {
    return eventWebsiteId ? `/${pageSlug}` : `/events/${slug}/${pageSlug}`;
  };

  const handleCTAClick = async (button: any) => {
    console.log('[PublicEventWebsite] CTA button clicked:', button);

    // Handle smart NOR button
    if (button.link_type === 'smart_nor' || button.type === 'smart_nor') {
      handleAction('nor', async (yachtClass) => {
        try {
          console.log('[CTA NOR] Looking for NOR document:', {
            eventWebsiteId: website?.id,
            className: yachtClass.class_name,
            eventId: yachtClass.event_id
          });

          // Step 1: Query the event_website_documents table for NOR documents
          const { data: norDocuments, error: dbError } = await supabase
            .from('event_website_documents')
            .select('*')
            .eq('event_website_id', website?.id || '')
            .eq('document_type', 'nor')
            .eq('is_published', true)
            .order('created_at', { ascending: false });

          console.log('[CTA NOR] Documents from database:', norDocuments, 'Error:', dbError);

          if (!dbError && norDocuments && norDocuments.length > 0) {
            // First try: Find document with class name in title or filename
            let norDoc = norDocuments.find(doc => {
              const titleLower = (doc.title || '').toLowerCase();
              const urlLower = (doc.file_url || '').toLowerCase();
              const classLower = yachtClass.class_name.toLowerCase();

              return titleLower.includes(classLower) || urlLower.includes(classLower);
            });

            // If no class-specific document, use the most recent NOR
            if (!norDoc && norDocuments.length > 0) {
              norDoc = norDocuments[0];
              console.log('[CTA NOR] No class-specific NOR found, using general NOR:', norDoc.title);
            }

            if (norDoc) {
              console.log('[CTA NOR] Found NOR document:', norDoc.title, norDoc.file_url);
              window.open(norDoc.file_url, '_blank');
              return;
            }
          }

          // Step 2: Check the event's direct notice_of_race_url field
          console.log('[CTA NOR] No documents in database, checking event record...');
          const { data: eventData, error: eventError } = await supabase
            .from('public_events')
            .select('notice_of_race_url')
            .eq('id', yachtClass.event_id)
            .maybeSingle();

          if (!eventError && eventData?.notice_of_race_url) {
            console.log('[CTA NOR] Found NOR on event record:', eventData.notice_of_race_url);
            window.open(eventData.notice_of_race_url, '_blank');
            return;
          }

          // Step 3: Try checking storage directly for uploaded files
          console.log('[CTA NOR] Checking storage...');
          const { data: files, error: storageError } = await supabase.storage
            .from('event-documents')
            .list(website?.id || '');

          console.log('[CTA NOR] Files in storage:', files?.map(f => f.name));

          if (!storageError && files && files.length > 0) {
            // Look for NOR document in filenames
            const norFile = files.find(file => {
              const nameLower = file.name.toLowerCase();
              const hasNor = nameLower.includes('nor') || nameLower.includes('notice');
              const isPdf = nameLower.endsWith('.pdf');
              // Exclude non-race documents
              const isExcluded = nameLower.includes('membership') || nameLower.includes('application');

              return hasNor && isPdf && !isExcluded;
            });

            if (norFile) {
              const { data: urlData } = supabase.storage
                .from('event-documents')
                .getPublicUrl(`${website?.id}/${norFile.name}`);

              if (urlData?.publicUrl) {
                console.log('[CTA NOR] Found NOR in storage:', norFile.name);
                window.open(urlData.publicUrl, '_blank');
                return;
              }
            }
          }

          // If no document found, fallback to NOR generator
          console.warn('[CTA NOR] No NOR document found, using generator');
          window.open(`/nor-generator?event=${yachtClass.event_id}&class=${yachtClass.class_name}`, '_blank');
        } catch (err) {
          console.error('[CTA NOR] Error fetching NOR document:', err);
          // Fallback to generator on error
          window.open(`/nor-generator?event=${yachtClass.event_id}&class=${yachtClass.class_name}`, '_blank');
        }
      });
      return;
    }

    // Handle smart registration button
    if (button.link_type === 'smart_registration' || button.type === 'smart_registration') {
      handleAction('register', async (yachtClass) => {
        try {
          const { data: event, error } = await supabase
            .from('public_events')
            .select('*')
            .eq('id', yachtClass.event_id)
            .maybeSingle();

          if (error) throw error;

          if (event) {
            setSelectedEventForRegistration(event);
            setShowRegistrationModal(true);
          }
        } catch (error) {
          console.error('Error loading event for registration:', error);
        }
      });
      return;
    }

    // Handle regular registration button
    if (button.link_type === 'registration' || button.type === 'event_registration') {
      // Extract event_id from button.event_id or from the URL
      let eventId = button.event_id;
      if (!eventId && button.url) {
        // Try to extract event ID from URL like /register/{event_id}
        const match = button.url.match(/\/register\/([a-f0-9-]+)/);
        if (match) {
          eventId = match[1];
        }
      }

      console.log('[PublicEventWebsite] Opening registration modal for event:', eventId);

      if (eventId) {
        try {
          // Load the selected event data from public_events
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
      }
    }
  };

  const getButtonStyles = (button: any) => {
    const buttonStyle = button.button_style || 'solid';
    const backgroundColor = button.background_color || '#10b981';
    const textColor = button.text_color || '#ffffff';

    if (buttonStyle === 'outline') {
      return {
        backgroundColor: 'transparent',
        color: backgroundColor,
        borderColor: backgroundColor,
        borderWidth: '2px',
        borderStyle: 'solid'
      };
    }

    return {
      backgroundColor,
      color: textColor
    };
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
        <GoogleAnalytics measurementId={website?.google_analytics_id} />
        {/* Render Header with integrated menu */}
        {globalSections.header?.enabled && (
          <header
            style={{
              backgroundColor: headerConfig.background_color || '#ffffff',
              color: headerConfig.text_color || '#000000',
              height: `${headerConfig.height || 80}px`,
              borderColor: headerConfig.background_color === '#ffffff' ? '#e2e8f0' : 'rgba(255,255,255,0.1)'
            }}
            className={`border-b relative ${menuConfig.position === 'sticky' ? 'sticky top-0 z-50' : ''}`}
          >
            <div
              className="px-4 h-full relative flex items-center"
              style={{
                justifyContent: headerConfig.logo_position || 'center',
                maxWidth: menuConfig.width_type === 'fixed' ? `${menuConfig.fixed_width || 1200}px` : '100%',
                width: menuConfig.width_type === 'responsive' ? '100%' : 'auto',
                margin: '0 auto'
              }}
            >
              {/* Left hamburger menu - Always visible in mobile/tablet for dropdown style */}
              {globalSections.menu?.enabled && menuConfig.style === 'dropdown' && menuConfig.menu_position === 'left' && (
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute left-4 lg:left-4"
                  style={{ color: menuConfig.hamburger_color || headerConfig.text_color }}
                >
                  <MenuIcon size={menuConfig.hamburger_size || 20} />
                  <span className="text-[9px] font-semibold tracking-wider">MENU</span>
                </button>
              )}

              {/* Left CTA Buttons - Desktop Only */}
              {globalSections.menu?.enabled && menuConfig.cta_buttons && menuConfig.cta_buttons.filter((b: any) => (b.position === 'left' || !b.position)).length > 0 && (
                <div className="flex items-center gap-2 absolute left-6 z-20 max-lg:hidden">
                  {menuConfig.cta_buttons.filter((b: any) => (b.position === 'left' || !b.position)).map((button: any) => (
                    (button.link_type === 'registration' || button.type === 'event_registration' ||
                     button.link_type === 'smart_registration' || button.type === 'smart_registration' ||
                     button.link_type === 'smart_nor' || button.type === 'smart_nor') ? (
                      <button
                        key={button.id}
                        type="button"
                        onClick={() => handleCTAClick(button)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 cursor-pointer"
                        style={getButtonStyles(button)}
                      >
                        {button.label}
                      </button>
                    ) : (
                      <a
                        key={button.id}
                        href={button.url}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                        style={getButtonStyles(button)}
                      >
                        {button.label}
                      </a>
                    )
                  ))}
                </div>
              )}

              {/* Logo/Text */}
              <Link to={getHomeUrl()} className="flex items-center cursor-pointer hover:opacity-80 transition-opacity">
                {(headerConfig.logo_type === 'upload' || headerConfig.logo_type === 'club' || headerConfig.logo_type === 'image') && headerConfig.logo_url && (
                  <img
                    src={headerConfig.logo_url}
                    alt="Event Logo"
                    style={{ height: `${headerConfig.logo_size || 60}px` }}
                    className="object-contain"
                  />
                )}
                {headerConfig.logo_type === 'text' && headerConfig.header_text && (
                  <span style={{ fontSize: `${headerConfig.text_size || 24}px` }} className="font-bold">
                    {headerConfig.header_text}
                  </span>
                )}
              </Link>

              {/* Horizontal menu items (if style is horizontal) */}
              {globalSections.menu?.enabled && menuConfig.style === 'horizontal' && navigationPages.length > 0 && (
                <div className={`flex items-center gap-4 absolute ${
                  menuConfig.menu_position === 'left' ? 'left-20' : 'right-6'
                }`}>
                  {navigationPages.map((page: any) => (
                    <Link
                      key={page.id}
                      to={getPageUrl(page.slug)}
                      className="text-sm font-medium hover:opacity-75 transition-opacity flex items-center gap-1"
                      style={{ color: menuConfig.text_color }}
                    >
                      {page.title}
                    </Link>
                  ))}
                </div>
              )}

              {/* Right CTA Buttons - Desktop Only */}
              {globalSections.menu?.enabled && menuConfig.cta_buttons && menuConfig.cta_buttons.filter((b: any) => b.position === 'right').length > 0 && (
                <div
                  className={`flex items-center gap-2 absolute z-20 max-lg:hidden ${
                    menuConfig.style === 'dropdown' && menuConfig.menu_position === 'right' ? 'right-20' : 'right-6'
                  }`}
                >
                  {menuConfig.cta_buttons.filter((b: any) => b.position === 'right').map((button: any) => (
                    (button.link_type === 'registration' || button.type === 'event_registration' ||
                     button.link_type === 'smart_registration' || button.type === 'smart_registration' ||
                     button.link_type === 'smart_nor' || button.type === 'smart_nor') ? (
                      <button
                        key={button.id}
                        type="button"
                        onClick={() => handleCTAClick(button)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 cursor-pointer"
                        style={getButtonStyles(button)}
                      >
                        {button.label}
                      </button>
                    ) : (
                      <a
                        key={button.id}
                        href={button.url}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                        style={getButtonStyles(button)}
                      >
                        {button.label}
                      </a>
                    )
                  ))}
                </div>
              )}

              {/* Right hamburger menu - Always visible in mobile/tablet for dropdown style */}
              {globalSections.menu?.enabled && menuConfig.style === 'dropdown' && menuConfig.menu_position === 'right' && (
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute right-4 lg:right-4"
                  style={{ color: menuConfig.hamburger_color || headerConfig.text_color }}
                >
                  <MenuIcon size={menuConfig.hamburger_size || 20} />
                  <span className="text-[9px] font-semibold tracking-wider">MENU</span>
                </button>
              )}
            </div>
          </header>
        )}

        {/* Dropdown Menu Sidebar */}
        {globalSections.menu?.enabled && menuConfig.style === 'dropdown' && menuOpen && (
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setMenuOpen(false)}>
            <div
              className={`absolute top-0 ${menuConfig.menu_position === 'left' ? 'left-0' : 'right-0'} w-64 h-full bg-white shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-slate-100 px-4 py-5">
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full text-center text-slate-900 font-semibold text-xs tracking-[0.2em] hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={14} />
                  CLOSE MENU
                </button>
              </div>

              <nav className="space-y-0">
                <Link
                  to={getHomeUrl()}
                  className="flex items-center justify-center gap-2 py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] hover:text-slate-600 transition-colors border-b border-slate-200"
                  onClick={() => setMenuOpen(false)}
                >
                  <Home className="w-4 h-4" />
                  HOME
                </Link>
                {navigationPages.map((page: any) => (
                  <Link
                    key={page.id}
                    to={getPageUrl(page.slug)}
                    className="block py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] hover:text-slate-600 transition-colors border-b border-slate-200"
                    onClick={() => setMenuOpen(false)}
                  >
                    {page.title.toUpperCase()}
                  </Link>
                ))}

                {/* CTA Buttons - Only visible on mobile/tablet, hidden on desktop */}
                {menuConfig.cta_buttons && menuConfig.cta_buttons.length > 0 && (
                  <div className="lg:hidden p-4 bg-slate-50 border-t border-slate-200 space-y-2">
                    {menuConfig.cta_buttons.map((button: any) => (
                      (button.link_type === 'registration' || button.type === 'event_registration' ||
                       button.link_type === 'smart_registration' || button.type === 'smart_registration' ||
                       button.link_type === 'smart_nor' || button.type === 'smart_nor') ? (
                        <button
                          key={button.id}
                          type="button"
                          onClick={() => {
                            handleCTAClick(button);
                            setMenuOpen(false);
                          }}
                          className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90 cursor-pointer"
                          style={getButtonStyles(button)}
                        >
                          {button.label}
                        </button>
                      ) : (
                        <a
                          key={button.id}
                          href={button.url}
                          className="block w-full text-center px-4 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                          style={getButtonStyles(button)}
                          onClick={() => setMenuOpen(false)}
                        >
                          {button.label}
                        </a>
                      )
                    ))}
                  </div>
                )}
              </nav>
            </div>
          </div>
        )}

        {/* Render Page Content - rows */}
        <div className="w-full">
          {pageContent ? pageContent.rows.map((row, index) => {
            // Use responsive padding based on current viewport
            const padding = row.responsivePadding?.[currentViewport] || row.padding || {};
            const margin = row.responsiveMargin?.[currentViewport] || row.margin || {};

            console.log(`[PublicEventWebsite] Rendering row ${index}:`, {
              'raw padding': JSON.stringify(row.padding),
              'responsivePadding.desktop': JSON.stringify(row.responsivePadding?.desktop),
              'padding object': padding,
              'padding.top': padding.top,
              'padding.bottom': padding.bottom,
              'padding.left': padding.left,
              'padding.right': padding.right,
              'padding.top !== undefined': padding.top !== undefined,
              'fullWidth': row.fullWidth
            });

            // Helper function to get overlay styles
            const getOverlayStyle = () => {
              if (!row.background?.overlayType || row.background.overlayType === 'none') {
                return {};
              }

              const opacity = (row.background.overlayOpacity ?? 30) / 100;

              if (row.background.overlayType === 'solid') {
                const color = row.background.overlayColor ?? '#000000';
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                return { backgroundColor: `rgba(${r}, ${g}, ${b}, ${opacity})` };
              }

              if (row.background.overlayType === 'gradient') {
                const start = row.background.overlayGradientStart ?? '#000000';
                const end = row.background.overlayGradientEnd ?? '#ffffff';
                const direction = row.background.overlayGradientDirection ?? 'to-bottom';

                const startR = parseInt(start.slice(1, 3), 16);
                const startG = parseInt(start.slice(3, 5), 16);
                const startB = parseInt(start.slice(5, 7), 16);
                const endR = parseInt(end.slice(1, 3), 16);
                const endG = parseInt(end.slice(3, 5), 16);
                const endB = parseInt(end.slice(5, 7), 16);

                return {
                  backgroundImage: `linear-gradient(${direction}, rgba(${startR}, ${startG}, ${startB}, ${opacity}), rgba(${endR}, ${endG}, ${endB}, ${opacity}))`
                };
              }

              return {};
            };

            const extractYouTubeId = (url: string): string => {
              if (!url) return '';
              const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
              const match = url.match(regExp);
              return (match && match[7].length === 11) ? match[7] : '';
            };

            const maxWidth = row.responsiveMaxWidth?.[currentViewport] || row.maxWidth || undefined;
            const minHeight = row.responsiveMinHeight?.[currentViewport] || row.minHeight || undefined;
            const maxHeight = row.responsiveMaxHeight?.[currentViewport] || row.maxHeight || undefined;

            return (
              <div
                key={row.id}
                className="w-full relative overflow-hidden"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: row.background?.mediaType ? 'transparent' : (row.background?.type === 'color' ? row.background.value : undefined),
                  marginTop: margin.top !== undefined ? `${margin.top}px` : undefined,
                  marginBottom: margin.bottom !== undefined ? `${margin.bottom}px` : undefined,
                  marginLeft: margin.left !== undefined ? `${margin.left}px` : undefined,
                  marginRight: margin.right !== undefined ? `${margin.right}px` : undefined,
                  maxWidth: maxWidth || undefined,
                  minHeight: minHeight || undefined,
                  maxHeight: maxHeight || undefined
                }}
              >
                {/* Video Background */}
                {row.background?.mediaType === 'video' && row.background.videoUrl && (
                  <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYouTubeId(row.background.videoUrl)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${extractYouTubeId(row.background.videoUrl)}&playsinline=1`}
                      className="absolute top-1/2 left-1/2 w-[300%] h-[300%]"
                      style={{
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                      }}
                      frameBorder="0"
                      allow="autoplay; encrypted-media"
                      title="Background video"
                    />
                  </div>
                )}

                {/* Image Background */}
                {row.background?.mediaType === 'image' && row.background.value && (
                  <div
                    className={`absolute inset-0 w-full h-full bg-cover ${row.background.kenBurnsEffect ? 'ken-burns-effect' : ''}`}
                    style={{
                      backgroundImage: `url(${row.background.value})`,
                      backgroundPosition: row.background.imagePosition ?? 'center center',
                      backgroundSize: 'cover'
                    }}
                  />
                )}

                {/* Overlay */}
                {(row.background?.mediaType === 'image' || row.background?.mediaType === 'video') && (
                  <div
                    className="absolute inset-0 w-full h-full"
                    style={getOverlayStyle()}
                  />
                )}

                {/* Content */}
                <div
                  className={`relative z-10 ${row.fullWidth ? 'w-full' : 'w-full max-w-7xl mx-auto'} grid grid-cols-1 ${
                    row.stackOnMobile && row.stackOnTablet ? 'lg:grid-cols-12' :
                    row.stackOnMobile ? 'md:grid-cols-12' :
                    row.stackOnTablet ? 'md:grid-cols-1 lg:grid-cols-12' :
                    'grid-cols-12'
                  }`}
                  style={{
                    flex: 1,
                    paddingTop: padding.top !== undefined ? `${padding.top}px` : undefined,
                    paddingBottom: padding.bottom !== undefined ? `${padding.bottom}px` : undefined,
                    paddingLeft: padding.left !== undefined ? `${padding.left}px` : undefined,
                    paddingRight: padding.right !== undefined ? `${padding.right}px` : undefined,
                    gap: row.columnGap !== undefined ? `${row.columnGap}px` : '16px'
                  }}
                >
                {row.columns.map((column) => {
                  // Use responsive padding for desktop, fallback to base padding
                  const columnPadding = column.responsivePadding?.desktop || column.padding || {};

                  return (
                  <div
                    key={column.id}
                    className="flex flex-col"
                    style={{
                      gridColumn: `span ${column.width}`,
                      justifyContent: column.verticalAlign === 'center' ? 'center' : column.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
                      height: '100%',
                      paddingTop: columnPadding.top ? `${columnPadding.top}px` : undefined,
                      paddingBottom: columnPadding.bottom ? `${columnPadding.bottom}px` : undefined,
                      paddingLeft: columnPadding.left ? `${columnPadding.left}px` : undefined,
                      paddingRight: columnPadding.right ? `${columnPadding.right}px` : undefined
                    }}
                  >
                    {column.widgets.map((widget) => (
                      <div key={widget.id}>
                        <EventWidgetRenderer widget={widget} websiteId={website?.id} darkMode={true} />
                      </div>
                    ))}
                  </div>
                  );
                })}
                </div>
              </div>
            );
          }) : (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
              <div className="bg-slate-800/50 rounded-lg p-12 border border-slate-700">
                <h2 className="text-2xl font-bold text-white mb-2">Page Under Construction</h2>
                <p className="text-slate-400">
                  This page hasn't been configured yet. Check back soon!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Render Footer */}
        {globalSections.footer?.enabled && (
          <footer
            style={{
              backgroundColor: footerConfig.background_color || '#1e293b',
              color: footerConfig.text_color || '#94a3b8'
            }}
            className="border-t border-slate-700 mt-auto"
          >
            <div className="max-w-7xl mx-auto px-4 py-12">
              {(footerConfig.footer_columns || footerConfig.columns) && (
                <div className={`grid gap-8 mb-8`} style={{ gridTemplateColumns: `repeat(${Math.min((footerConfig.footer_columns || footerConfig.columns)?.length || 1, 4)}, 1fr)` }}>
                  {(footerConfig.footer_columns || footerConfig.columns).map((column: any) => (
                    <div key={column.id}>
                      <h3 className="font-bold mb-4 text-white">{column.title}</h3>
                      <ul className="space-y-2">
                        {(column.links || column.items) && Array.isArray(column.links || column.items) && (column.links || column.items).map((item: any) => (
                          <li key={item.id || item.label}>
                            <a
                              href={item.url}
                              className="hover:text-white transition-colors"
                              style={{ color: footerConfig.text_color || '#94a3b8' }}
                            >
                              {item.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {footerConfig.show_social_links && footerConfig.social_links && (
                <div className="flex justify-center space-x-4 mb-6">
                  {footerConfig.social_links.facebook && (
                    <a href={footerConfig.social_links.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    </a>
                  )}
                  {footerConfig.social_links.instagram && (
                    <a href={footerConfig.social_links.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                    </a>
                  )}
                  {footerConfig.social_links.twitter && (
                    <a href={footerConfig.social_links.twitter} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                    </a>
                  )}
                  {footerConfig.social_links.youtube && (
                    <a href={footerConfig.social_links.youtube} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                    </a>
                  )}
                </div>
              )}

              {footerConfig.copyright_text && (
                <div className="pt-6 border-t border-slate-700 text-center" style={{ color: footerConfig.text_color || '#94a3b8' }}>
                  {footerConfig.copyright_text}
                </div>
              )}
            </div>
          </footer>
        )}

        {/* Event Registration Modal */}
        {showRegistrationModal && selectedEventForRegistration && (
          <EventRegistrationModal
            darkMode={false}
            eventId={selectedEventForRegistration.id}
            clubId={selectedEventForRegistration.club_id}
            eventName={selectedEventForRegistration.event_name || 'Event'}
            entryFee={selectedEventForRegistration.entry_fee || 0}
            currency={selectedEventForRegistration.currency || 'AUD'}
            onClose={() => {
              setShowRegistrationModal(false);
              setSelectedEventForRegistration(null);
            }}
            onSuccess={() => {
              setShowRegistrationModal(false);
              setRegisteredEventForInvite(selectedEventForRegistration);
              setSelectedEventForRegistration(null);
              setShowInviteMateModal(true);
            }}
          />
        )}

        {/* Class Selector Modal for smart buttons */}
        <ClassSelectorModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          classes={classes}
          onSelect={handleClassSelect}
          type={modalType}
        />

        {/* Invite a Mate Modal */}
        {showInviteMateModal && registeredEventForInvite && (
          <InviteMateModal
            isOpen={showInviteMateModal}
            onClose={() => {
              setShowInviteMateModal(false);
              setRegisteredEventForInvite(null);
            }}
            eventId={registeredEventForInvite.id}
            eventName={registeredEventForInvite.event_name || 'Event'}
            eventDate={new Date(registeredEventForInvite.race_date)}
          />
        )}
      </div>
    );
};
