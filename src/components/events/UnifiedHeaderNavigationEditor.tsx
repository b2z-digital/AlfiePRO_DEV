import React, { useState, useEffect } from 'react';
import { Upload, Plus, Trash2, Eye, Palette, Layout, Type, Menu as MenuIcon } from 'lucide-react';
import type { EventHeaderConfig, EventMenuConfig, EventCTAButton } from '../../types/eventWidgets';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  websiteId: string;
  headerConfig: Record<string, any>;
  menuConfig: Record<string, any>;
  onHeaderChange: (config: EventHeaderConfig) => void;
  onMenuChange: (config: EventMenuConfig) => void;
  darkMode?: boolean;
}

interface PageItem {
  id: string;
  title: string;
  slug: string;
  show_in_navigation?: boolean;
}

interface EventItem {
  id: string;
  title: string;
  event_name: string;
}

export const UnifiedHeaderNavigationEditor: React.FC<Props> = ({
  websiteId,
  headerConfig,
  menuConfig,
  onHeaderChange,
  onMenuChange,
  darkMode = true
}) => {
  const [header, setHeader] = useState<EventHeaderConfig>({
    logo_type: headerConfig.logo_type || 'text',
    logo_url: headerConfig.logo_url || '',
    header_text: headerConfig.header_text || '',
    logo_position: headerConfig.logo_position || 'center',
    show_event_name: headerConfig.show_event_name !== false,
    background_color: headerConfig.background_color || '#ffffff',
    text_color: headerConfig.text_color || '#000000',
    height: headerConfig.height || 80,
    content_max_width: headerConfig.content_max_width || 0,
    logo_size: headerConfig.logo_size || 48,
    text_size: headerConfig.text_size || 32
  });

  const [menu, setMenu] = useState<EventMenuConfig>({
    menu_style: menuConfig.menu_style || menuConfig.style || 'hamburger',
    position: menuConfig.menu_position || menuConfig.position || 'left',
    scroll_behavior: menuConfig.scroll_behavior || menuConfig.position || 'sticky',
    background_color: menuConfig.background_color || '#ffffff',
    text_color: menuConfig.text_color || '#080808',
    hover_color: menuConfig.hover_color || '#8891b2',
    hamburger_color: menuConfig.hamburger_color || '#404040',
    hamburger_size: menuConfig.hamburger_size || 20,
    width_type: menuConfig.width_type || 'responsive',
    fixed_width: menuConfig.fixed_width || 1200,
    menu_items: menuConfig.menu_items || [],
    cta_buttons: menuConfig.cta_buttons || []
  });

  const [clubLogo, setClubLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeSection, setActiveSection] = useState<'appearance' | 'navigation' | 'cta'>('appearance');
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadData();
  }, [websiteId]);

  useEffect(() => {
    if (pages.length > 0) {
      console.log('Pages loaded successfully:', pages);
    }
  }, [pages]);

  useEffect(() => {
    if (events.length > 0) {
      console.log('Events loaded successfully:', events);
    }
  }, [events]);

  useEffect(() => {
    onHeaderChange(header);
  }, [header]);

  useEffect(() => {
    // Map internal field names to what the public page expects
    const transformedMenu = {
      ...menu,
      style: menu.menu_style === 'hamburger' ? 'dropdown' : menu.menu_style, // Map 'hamburger' to 'dropdown'
      menu_position: menu.position, // Menu left/right position
      position: menu.scroll_behavior, // Scroll behavior (sticky/static)
      scroll_behavior: menu.scroll_behavior, // Keep scroll_behavior for database storage
    };
    onMenuChange(transformedMenu);
  }, [menu]);

  const loadData = async () => {
    await Promise.all([loadClubLogo(), loadPages(), loadEvents()]);
  };

  const loadClubLogo = async () => {
    try {
      const { data: website } = await supabase
        .from('event_websites')
        .select('event_id')
        .eq('id', websiteId)
        .single();

      if (website?.event_id) {
        const { data: event } = await supabase
          .from('public_events')
          .select('club_id')
          .eq('id', website.event_id)
          .single();

        if (event?.club_id) {
          const { data: club } = await supabase
            .from('clubs')
            .select('logo_url')
            .eq('id', event.club_id)
            .single();

          if (club?.logo_url) {
            setClubLogo(club.logo_url);
          }
        }
      }
    } catch (error) {
      console.error('Error loading club logo:', error);
    }
  };

  const loadPages = async () => {
    try {
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('id, title, slug, show_in_navigation, navigation_order')
        .eq('event_website_id', websiteId)
        .order('navigation_order');

      if (error) {
        console.error('Error loading pages:', error);
        return;
      }

      console.log('Loaded pages:', data);
      if (data) {
        setPages(data);
      }
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  };

  const loadEvents = async () => {
    try {
      console.log('[UnifiedHeaderNav] Loading events for website ID:', websiteId);

      // Use the same view as the Registration Button widget
      const { data, error } = await supabase
        .from('event_website_all_events')
        .select('*')
        .eq('event_website_id', websiteId)
        .single();

      console.log('[UnifiedHeaderNav] Event website all events data:', data);

      if (error) {
        console.error('[UnifiedHeaderNav] Error loading events from view:', error);
        return;
      }

      if (!data?.all_events || data.all_events.length === 0) {
        console.log('[UnifiedHeaderNav] No events found in event_website_all_events view');
        return;
      }

      console.log('[UnifiedHeaderNav] All events from view:', data.all_events);

      // Transform the data to match the expected format
      const eventsData = data.all_events.map((event: any) => ({
        id: event.id,
        title: event.event_name,
        event_name: event.event_name
      }));

      console.log('[UnifiedHeaderNav] Transformed events data:', eventsData);

      setEvents(eventsData);
    } catch (error) {
      console.error('[UnifiedHeaderNav] Error loading events:', error);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;

    setUploading(true);
    try {
      const { compressImage } = await import('../../utils/imageCompression');
      const compressed = await compressImage(file, 'logo');

      const fileExt = compressed.name.split('.').pop();
      const fileName = `${websiteId}-${Date.now()}.${fileExt}`;
      const filePath = `event-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressed, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setHeader(prev => ({ ...prev, logo_url: publicUrl, logo_type: 'image' }));
      addNotification('Logo uploaded successfully', 'success');
    } catch (error) {
      console.error('Error uploading logo:', error);
      addNotification('Failed to upload logo', 'error');
    } finally {
      setUploading(false);
    }
  };

  const addCTAButton = () => {
    const newButton: EventCTAButton = {
      id: uuidv4(),
      label: 'Register Now',
      url: '',
      type: 'page',
      position: 'right',
      background_color: '#10b981',
      text_color: '#ffffff',
      button_style: 'solid',
      order: menu.cta_buttons.length
    };
    setMenu(prev => ({ ...prev, cta_buttons: [...prev.cta_buttons, newButton] }));
  };

  const updateCTAButton = (id: string, updates: Partial<EventCTAButton>) => {
    setMenu(prev => ({
      ...prev,
      cta_buttons: prev.cta_buttons.map(btn =>
        btn.id === id ? { ...btn, ...updates } : btn
      )
    }));
  };

  const deleteCTAButton = (id: string) => {
    setMenu(prev => ({
      ...prev,
      cta_buttons: prev.cta_buttons.filter(btn => btn.id !== id)
    }));
  };

  const handleTogglePageNav = async (pageId: string, include: boolean) => {
    try {
      await supabase
        .from('event_page_layouts')
        .update({ show_in_navigation: include })
        .eq('id', pageId);

      setPages(prev => prev.map(p => p.id === pageId ? { ...p, show_in_navigation: include } : p));
    } catch (error) {
      console.error('Error updating page navigation:', error);
      addNotification('Failed to update page', 'error');
    }
  };

  const getDisplayLogo = () => {
    if (header.logo_type === 'image' && header.logo_url) {
      return <img src={header.logo_url} alt="Logo" className="h-12 object-contain" />;
    }
    if (header.logo_type === 'club_logo' && clubLogo) {
      return <img src={clubLogo} alt="Logo" className="h-12 object-contain" />;
    }
    return (
      <span style={{ color: header.text_color, fontSize: `${header.text_size}px` }} className="font-bold">
        {header.header_text || 'Event Name'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Live Preview */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Eye size={16} className="text-blue-400" />
            Live Preview
          </h3>
        </div>

        {/* Preview Container */}
        <div className="relative">
          <div
            className="w-full rounded-lg overflow-visible shadow-lg relative"
            style={{
              backgroundColor: header.background_color,
              height: `${header.height}px`
            }}
          >
            <div
              className="h-full flex items-center px-6 relative"
              style={{
                maxWidth: menu.width_type === 'fixed' ? `${menu.fixed_width}px` : (header.content_max_width > 0 ? `${header.content_max_width}px` : '100%'),
                margin: '0 auto',
                width: menu.width_type === 'responsive' ? '100%' : 'auto'
              }}
            >
              {/* Left Hamburger Menu */}
              {menu.menu_style === 'hamburger' && menu.position === 'left' && (
                <button
                  onClick={() => setHamburgerOpen(!hamburgerOpen)}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute left-4"
                  style={{ color: menu.hamburger_color }}
                >
                  <MenuIcon size={menu.hamburger_size} />
                  <span className="text-[9px] font-semibold tracking-wider">MENU</span>
                </button>
              )}

              {/* Logo/Branding */}
              <div className={`flex items-center ${header.logo_position === 'center' ? 'flex-1 justify-center' : ''}`}>
                {getDisplayLogo()}
              </div>

              {/* Navigation & CTA - Horizontal */}
              {menu.menu_style === 'horizontal' && (
                <nav className="flex items-center gap-4 ml-auto">
                  {pages.filter(p => p.show_in_navigation).slice(0, 5).map((page) => (
                    <a
                      key={page.id}
                      href={`/${page.slug}`}
                      style={{ color: menu.text_color }}
                      className="text-sm font-medium hover:opacity-70 transition-opacity"
                    >
                      {page.title}
                    </a>
                  ))}
                  {menu.cta_buttons.map((btn) => (
                    <button
                      key={btn.id}
                      style={{
                        backgroundColor: (btn.button_style || 'solid') === 'solid' ? (btn.background_color || '#10b981') : 'transparent',
                        color: (btn.button_style || 'solid') === 'solid' ? (btn.text_color || '#ffffff') : (btn.background_color || '#10b981'),
                        borderColor: (btn.button_style || 'solid') === 'outline' ? (btn.background_color || '#10b981') : 'transparent',
                        borderWidth: (btn.button_style || 'solid') === 'outline' ? '2px' : '0'
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                    >
                      {btn.label}
                    </button>
                  ))}
                </nav>
              )}

              {/* Right CTA Buttons (for hamburger menu) */}
              {menu.menu_style === 'hamburger' && menu.cta_buttons.filter(b => b.position === 'right').length > 0 && (
                <div className={`flex items-center gap-2 absolute ${
                  menu.position === 'right' ? 'right-20' : 'right-6'
                }`}>
                  {menu.cta_buttons.filter(b => b.position === 'right').map((btn) => (
                    <button
                      key={btn.id}
                      style={{
                        backgroundColor: (btn.button_style || 'solid') === 'solid' ? (btn.background_color || '#10b981') : 'transparent',
                        color: (btn.button_style || 'solid') === 'solid' ? (btn.text_color || '#ffffff') : (btn.background_color || '#10b981'),
                        borderColor: (btn.button_style || 'solid') === 'outline' ? (btn.background_color || '#10b981') : 'transparent',
                        borderWidth: (btn.button_style || 'solid') === 'outline' ? '2px' : '0'
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Right Hamburger Menu */}
              {menu.menu_style === 'hamburger' && menu.position === 'right' && (
                <button
                  onClick={() => setHamburgerOpen(!hamburgerOpen)}
                  className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute right-4"
                  style={{ color: menu.hamburger_color }}
                >
                  <MenuIcon size={menu.hamburger_size} />
                  <span className="text-[9px] font-semibold tracking-wider">MENU</span>
                </button>
              )}
            </div>
          </div>

          {/* Dropdown Menu Sidebar Preview */}
          {menu.menu_style === 'hamburger' && hamburgerOpen && (
            <div className="absolute inset-0 z-50 bg-black/50 rounded-lg" onClick={() => setHamburgerOpen(false)}>
              <div
                className={`absolute top-0 ${menu.position === 'left' ? 'left-0' : 'right-0'} w-64 h-full bg-white shadow-2xl rounded-lg overflow-hidden`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-slate-100 px-4 py-5">
                  <button
                    onClick={() => setHamburgerOpen(false)}
                    className="w-full text-center text-slate-900 font-semibold text-xs tracking-[0.2em] hover:text-slate-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={14} className="rotate-45" />
                    CLOSE MENU
                  </button>
                </div>

                <nav className="space-y-0">
                  {pages.filter(p => p.show_in_navigation).map((page) => (
                    <a
                      key={page.id}
                      href={`/${page.slug}`}
                      className="block py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] hover:text-slate-600 transition-colors border-b border-slate-200"
                    >
                      {page.title.toUpperCase()}
                    </a>
                  ))}
                </nav>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('appearance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeSection === 'appearance'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Palette size={16} />
          Appearance
        </button>
        <button
          onClick={() => setActiveSection('navigation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeSection === 'navigation'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <MenuIcon size={16} />
          Navigation
        </button>
        <button
          onClick={() => setActiveSection('cta')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
            activeSection === 'cta'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Plus size={16} />
          CTA Buttons
        </button>
      </div>

      {/* Settings Content */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
        {activeSection === 'appearance' && (
          <div className="space-y-6">
            {/* Logo Section */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Logo & Branding</label>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  onClick={() => setHeader(prev => ({ ...prev, logo_type: 'text' }))}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    header.logo_type === 'text'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <Type size={20} className="mx-auto mb-1 text-slate-300" />
                  <span className="text-xs text-slate-400">Text</span>
                </button>
                <button
                  onClick={() => setHeader(prev => ({ ...prev, logo_type: 'image' }))}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    header.logo_type === 'image'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <Upload size={20} className="mx-auto mb-1 text-slate-300" />
                  <span className="text-xs text-slate-400">Upload</span>
                </button>
                {clubLogo && (
                  <button
                    onClick={() => setHeader(prev => ({ ...prev, logo_type: 'club_logo' }))}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      header.logo_type === 'club_logo'
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <img src={clubLogo} alt="Club" className="h-8 mx-auto mb-1 object-contain" />
                    <span className="text-xs text-slate-400">Club Logo</span>
                  </button>
                )}
              </div>

              {header.logo_type === 'text' && (
                <input
                  type="text"
                  value={header.header_text}
                  onChange={(e) => setHeader(prev => ({ ...prev, header_text: e.target.value }))}
                  placeholder="Enter text"
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                />
              )}

              {header.logo_type === 'image' && (
                <div className="relative">
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                    className="hidden"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <Upload size={18} />
                    <span>{uploading ? 'Uploading...' : header.logo_url ? 'Change Logo' : 'Upload Logo'}</span>
                  </label>
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Background Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={header.background_color}
                    onChange={(e) => setHeader(prev => ({ ...prev, background_color: e.target.value }))}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={header.background_color}
                    onChange={(e) => setHeader(prev => ({ ...prev, background_color: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={header.text_color}
                    onChange={(e) => setHeader(prev => ({ ...prev, text_color: e.target.value }))}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={header.text_color}
                    onChange={(e) => setHeader(prev => ({ ...prev, text_color: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Layout */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Header Height: {header.height}px
                </label>
                <input
                  type="range"
                  min="60"
                  max="150"
                  value={header.height}
                  onChange={(e) => setHeader(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Logo Position</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHeader(prev => ({ ...prev, logo_position: 'left' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      header.logo_position === 'left'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Left
                  </button>
                  <button
                    onClick={() => setHeader(prev => ({ ...prev, logo_position: 'center' }))}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                      header.logo_position === 'center'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Center
                  </button>
                </div>
              </div>
            </div>

            {/* Menu Style */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Menu Style</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMenu(prev => ({ ...prev, menu_style: 'horizontal' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    menu.menu_style === 'horizontal'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <Layout size={20} className="mx-auto mb-2 text-slate-300" />
                  <span className="text-sm text-slate-400">Horizontal</span>
                </button>
                <button
                  onClick={() => setMenu(prev => ({ ...prev, menu_style: 'hamburger' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    menu.menu_style === 'hamburger'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <MenuIcon size={20} className="mx-auto mb-2 text-slate-300" />
                  <span className="text-sm text-slate-400">Hamburger</span>
                </button>
              </div>
            </div>

            {/* Scroll Behavior */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Scroll Behavior</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMenu(prev => ({ ...prev, scroll_behavior: 'static' }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                    menu.scroll_behavior === 'static'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Static
                </button>
                <button
                  onClick={() => setMenu(prev => ({ ...prev, scroll_behavior: 'sticky' }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                    menu.scroll_behavior === 'sticky'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Sticky
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'navigation' && (
          <div className="space-y-6">
            {/* Menu Style */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Menu Style</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMenu(prev => ({ ...prev, menu_style: 'horizontal' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    menu.menu_style === 'horizontal'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="w-full h-8 mb-2 bg-slate-700 rounded flex items-center justify-center gap-1">
                    <div className="w-12 h-1 bg-slate-400"></div>
                    <div className="w-12 h-1 bg-slate-400"></div>
                    <div className="w-12 h-1 bg-slate-400"></div>
                  </div>
                  <span className="text-sm text-slate-300">Horizontal</span>
                </button>
                <button
                  onClick={() => setMenu(prev => ({ ...prev, menu_style: 'hamburger' }))}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    menu.menu_style === 'hamburger'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <div className="w-full h-8 mb-2 bg-slate-700 rounded flex items-center justify-center">
                    <MenuIcon size={20} className="text-slate-400" />
                  </div>
                  <span className="text-sm text-slate-300">Hamburger</span>
                </button>
              </div>
            </div>

            {/* Scroll Behavior */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Scroll Behavior</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMenu(prev => ({ ...prev, scroll_behavior: 'static' }))}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    menu.scroll_behavior === 'static'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Static
                </button>
                <button
                  onClick={() => setMenu(prev => ({ ...prev, scroll_behavior: 'sticky' }))}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    menu.scroll_behavior === 'sticky'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Sticky
                </button>
              </div>
            </div>

            {/* Menu Position (for hamburger) */}
            {menu.menu_style === 'hamburger' && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Menu Position</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMenu(prev => ({ ...prev, position: 'left' }))}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      menu.position === 'left'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Left
                  </button>
                  <button
                    onClick={() => setMenu(prev => ({ ...prev, position: 'right' }))}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      menu.position === 'right'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    Right
                  </button>
                </div>
              </div>
            )}

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={menu.text_color}
                    onChange={(e) => setMenu(prev => ({ ...prev, text_color: e.target.value }))}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={menu.text_color}
                    onChange={(e) => setMenu(prev => ({ ...prev, text_color: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Hover Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={menu.hover_color}
                    onChange={(e) => setMenu(prev => ({ ...prev, hover_color: e.target.value }))}
                    className="w-12 h-10 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={menu.hover_color}
                    onChange={(e) => setMenu(prev => ({ ...prev, hover_color: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
            </div>

            {menu.menu_style === 'hamburger' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Hamburger Icon Color</label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={menu.hamburger_color}
                      onChange={(e) => setMenu(prev => ({ ...prev, hamburger_color: e.target.value }))}
                      className="w-12 h-10 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={menu.hamburger_color}
                      onChange={(e) => setMenu(prev => ({ ...prev, hamburger_color: e.target.value }))}
                      className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Hamburger Icon Size: {menu.hamburger_size}px
                  </label>
                  <input
                    type="range"
                    min="16"
                    max="32"
                    value={menu.hamburger_size}
                    onChange={(e) => setMenu(prev => ({ ...prev, hamburger_size: parseInt(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Navigation Width */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">Navigation Width</label>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  onClick={() => setMenu(prev => ({ ...prev, width_type: 'responsive' }))}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    menu.width_type === 'responsive'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Full Responsive
                </button>
                <button
                  onClick={() => setMenu(prev => ({ ...prev, width_type: 'fixed' }))}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    menu.width_type === 'fixed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Fixed Width
                </button>
              </div>

              {menu.width_type === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2 text-xs">
                    Fixed Width: {menu.fixed_width}px
                  </label>
                  <input
                    type="number"
                    min="800"
                    max="2000"
                    step="50"
                    value={menu.fixed_width}
                    onChange={(e) => setMenu(prev => ({ ...prev, fixed_width: parseInt(e.target.value) || 1200 }))}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'cta' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Call-to-Action Buttons</label>
              <button
                onClick={addCTAButton}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
              >
                <Plus size={14} />
                Add Button
              </button>
            </div>

            {menu.cta_buttons.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No CTA buttons yet. Add a prominent call-to-action!
              </div>
            ) : (
              <div className="space-y-4">
                {menu.cta_buttons.map((btn) => (
                  <div key={btn.id} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={btn.label}
                          onChange={(e) => updateCTAButton(btn.id, { label: e.target.value })}
                          placeholder="Button text"
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        />
                        <button
                          onClick={() => deleteCTAButton(btn.id)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={btn.type}
                          onChange={(e) => updateCTAButton(btn.id, {
                            type: e.target.value as any,
                            url: '',
                            event_id: undefined,
                            link_type: e.target.value === 'event_registration' ? 'registration' :
                                       e.target.value === 'smart_nor' ? 'smart_nor' :
                                       e.target.value === 'smart_registration' ? 'smart_registration' : undefined
                          })}
                          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                        >
                          <option value="page">Page</option>
                          <option value="event_registration">Event Registration</option>
                          <option value="smart_nor">Smart NOR (Auto-select class)</option>
                          <option value="smart_registration">Smart Registration (Auto-select class)</option>
                          <option value="external">External Link</option>
                        </select>

                        {btn.type === 'page' ? (
                          <select
                            value={btn.url?.replace('/', '') || ''}
                            onChange={(e) => updateCTAButton(btn.id, { url: `/${e.target.value}` })}
                            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                          >
                            <option value="">Select Page</option>
                            {pages.map((page) => (
                              <option key={page.id} value={page.slug}>
                                {page.title}
                              </option>
                            ))}
                          </select>
                        ) : btn.type === 'event_registration' ? (
                          <select
                            value={btn.event_id || ''}
                            onChange={(e) => updateCTAButton(btn.id, {
                              event_id: e.target.value,
                              link_type: 'registration',
                              url: `/register/${e.target.value}`
                            })}
                            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                          >
                            <option value="">Select Event</option>
                            {events.map((event) => (
                              <option key={event.id} value={event.id}>
                                {event.event_name || event.title}
                              </option>
                            ))}
                          </select>
                        ) : btn.type === 'smart_nor' || btn.type === 'smart_registration' ? (
                          <div className="px-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-slate-400 text-xs italic">
                            Auto-detects classes from events
                          </div>
                        ) : (
                          <input
                            type="url"
                            value={btn.url}
                            onChange={(e) => updateCTAButton(btn.id, { url: e.target.value })}
                            placeholder="https://example.com"
                            className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-2">Button Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={btn.background_color || '#10b981'}
                              onChange={(e) => updateCTAButton(btn.id, { background_color: e.target.value })}
                              className="w-10 h-9 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={btn.background_color || '#10b981'}
                              onChange={(e) => updateCTAButton(btn.id, { background_color: e.target.value })}
                              className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-2">Text Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={btn.text_color || '#ffffff'}
                              onChange={(e) => updateCTAButton(btn.id, { text_color: e.target.value })}
                              className="w-10 h-9 rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={btn.text_color || '#ffffff'}
                              onChange={(e) => updateCTAButton(btn.id, { text_color: e.target.value })}
                              className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-2">Position</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateCTAButton(btn.id, { position: 'left' })}
                              className={`flex-1 px-3 py-1.5 rounded text-xs transition-all ${
                                (btn.position || 'right') === 'left'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              Left
                            </button>
                            <button
                              onClick={() => updateCTAButton(btn.id, { position: 'right' })}
                              className={`flex-1 px-3 py-1.5 rounded text-xs transition-all ${
                                (btn.position || 'right') === 'right'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              Right
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-2">Button Style</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateCTAButton(btn.id, { button_style: 'solid' })}
                              className={`flex-1 px-3 py-1.5 rounded text-xs transition-all ${
                                (btn.button_style || 'solid') === 'solid'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              Solid
                            </button>
                            <button
                              onClick={() => updateCTAButton(btn.id, { button_style: 'outline' })}
                              className={`flex-1 px-3 py-1.5 rounded text-xs transition-all ${
                                (btn.button_style || 'solid') === 'outline'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              Outline
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
