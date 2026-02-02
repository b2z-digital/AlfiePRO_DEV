import React, { useState, useEffect } from 'react';
import { GripVertical, Plus, Trash2, Save, Loader2, ExternalLink, Menu as MenuIcon, ChevronDown, ChevronRight, X } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EventMenuConfig, EventMenuItem, EventCTAButton, EventHeaderConfig } from '../../types/eventWidgets';
import { supabase } from '../../utils/supabase';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  websiteId: string;
  headerConfig: EventHeaderConfig;
  config: Record<string, any>;
  onSave: (config: EventMenuConfig) => void;
  saving: boolean;
  darkMode?: boolean;
}

interface SortableMenuItemProps {
  item: EventMenuItem;
  onUpdate: (item: EventMenuItem) => void;
  onDelete: () => void;
  darkMode?: boolean;
  pages: Array<{ id: string; title: string; slug: string }>;
}

interface SortableCTAButtonProps {
  button: EventCTAButton;
  onUpdate: (button: EventCTAButton) => void;
  onDelete: () => void;
  darkMode?: boolean;
  pages: Array<{ id: string; title: string; slug: string }>;
}

const SortableMenuItem: React.FC<SortableMenuItemProps> = ({ item, onUpdate, onDelete, darkMode, pages }) => {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleTypeChange = (newType: EventMenuItem['type']) => {
    onUpdate({ ...item, type: newType, url: '' });
  };

  const handlePageSelect = (pageSlug: string) => {
    onUpdate({ ...item, url: `/${pageSlug}` });
  };

  const getTypeColor = () => {
    switch (item.type) {
      case 'page': return 'text-blue-500';
      case 'external': return 'text-green-500';
      case 'section': return 'text-purple-500';
      default: return 'text-slate-500';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border transition-all ${
        darkMode ? 'bg-slate-800/30 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
      } ${isDragging ? 'shadow-lg ring-2 ring-cyan-500/50' : ''}`}
    >
      <div className="flex items-center gap-2 p-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical size={18} className={`transition-colors ${darkMode ? 'text-slate-600 group-hover:text-slate-400' : 'text-slate-300 group-hover:text-slate-500'}`} />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <input
          type="text"
          value={item.label}
          onChange={(e) => onUpdate({ ...item, label: e.target.value })}
          placeholder="Menu label"
          className={`flex-1 px-3 py-2 rounded-lg border font-medium ${
            darkMode
              ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
              : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
          } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
        />

        <span className={`text-xs font-semibold px-2 py-1 rounded ${getTypeColor()}`}>
          {item.type.toUpperCase()}
        </span>

        {item.type === 'external' && item.url && <ExternalLink size={14} className="text-slate-400" />}

        <button
          onClick={onDelete}
          className={`p-2 rounded-lg transition-all ${
            darkMode
              ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
          }`}
          title="Delete menu item"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className={`p-4 pt-0 space-y-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div>
            <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Link Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['page', 'external', 'section'].map((type) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type as EventMenuItem['type'])}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    item.type === type
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : darkMode
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {item.type === 'page' ? 'Select Page' : item.type === 'external' ? 'External URL' : 'Section ID'}
            </label>
            {item.type === 'page' ? (
              <select
                value={item.url}
                onChange={(e) => handlePageSelect(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              >
                <option value="">Select a page...</option>
                {pages.map((page) => (
                  <option key={page.id} value={page.slug}>
                    {page.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={item.url}
                onChange={(e) => onUpdate({ ...item, url: e.target.value })}
                placeholder={item.type === 'external' ? 'https://example.com' : '#section-id'}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SortableCTAButton: React.FC<SortableCTAButtonProps> = ({ button, onUpdate, onDelete, darkMode, pages }) => {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: button.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const handleTypeChange = (newType: EventCTAButton['type']) => {
    onUpdate({ ...button, type: newType, url: '' });
  };

  const handlePageSelect = (pageSlug: string) => {
    onUpdate({ ...button, url: `/${pageSlug}` });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group rounded-lg border transition-all ${
        darkMode ? 'bg-slate-800/30 border-slate-700 hover:border-slate-600' : 'bg-white border-slate-200 hover:border-slate-300'
      } ${isDragging ? 'shadow-lg ring-2 ring-green-500/50' : ''}`}
    >
      <div className="flex items-center gap-2 p-3">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical size={18} className={`transition-colors ${darkMode ? 'text-slate-600 group-hover:text-slate-400' : 'text-slate-300 group-hover:text-slate-500'}`} />
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <input
          type="text"
          value={button.label}
          onChange={(e) => onUpdate({ ...button, label: e.target.value })}
          placeholder="Button label"
          className={`flex-1 px-3 py-2 rounded-lg border font-medium ${
            darkMode
              ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
              : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
          } focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
        />

        <div
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{
            backgroundColor: button.background_color,
            color: button.text_color
          }}
        >
          {button.label || 'CTA'}
        </div>

        <button
          onClick={onDelete}
          className={`p-2 rounded-lg transition-all ${
            darkMode
              ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
          }`}
          title="Delete CTA button"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {expanded && (
        <div className={`p-4 pt-0 space-y-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Position
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['left', 'right'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => onUpdate({ ...button, position: pos as 'left' | 'right' })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      button.position === pos
                        ? 'bg-green-600 text-white shadow-sm'
                        : darkMode
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Link Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['page', 'external', 'section'].map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTypeChange(type as EventCTAButton['type'])}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      button.type === type
                        ? 'bg-green-600 text-white shadow-sm'
                        : darkMode
                        ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {button.type === 'page' ? 'Select Page' : button.type === 'external' ? 'External URL' : 'Section ID'}
            </label>
            {button.type === 'page' ? (
              <select
                value={button.url}
                onChange={(e) => handlePageSelect(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white'
                    : 'bg-white border-slate-200 text-slate-900'
                } focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              >
                <option value="">Select a page...</option>
                {pages.map((page) => (
                  <option key={page.id} value={page.slug}>
                    {page.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={button.url}
                onChange={(e) => onUpdate({ ...button, url: e.target.value })}
                placeholder={button.type === 'external' ? 'https://example.com' : '#section-id'}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Background Color
              </label>
              <div className="flex gap-3 items-center">
                <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
                  <input
                    type="color"
                    value={button.background_color}
                    onChange={(e) => onUpdate({ ...button, background_color: e.target.value })}
                    className="w-full h-full cursor-pointer border-0"
                    style={{ padding: 0, margin: 0 }}
                  />
                </div>
                <input
                  type="text"
                  value={button.background_color}
                  onChange={(e) => onUpdate({ ...button, background_color: e.target.value })}
                  className={`flex-1 px-2 py-1 rounded border text-xs font-mono ${
                    darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Text Color
              </label>
              <div className="flex gap-3 items-center">
                <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
                  <input
                    type="color"
                    value={button.text_color}
                    onChange={(e) => onUpdate({ ...button, text_color: e.target.value })}
                    className="w-full h-full cursor-pointer border-0"
                    style={{ padding: 0, margin: 0 }}
                  />
                </div>
                <input
                  type="text"
                  value={button.text_color}
                  onChange={(e) => onUpdate({ ...button, text_color: e.target.value })}
                  className={`flex-1 px-2 py-1 rounded border text-xs font-mono ${
                    darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export const EventMenuEditor: React.FC<Props> = ({ websiteId, headerConfig, config, onSave, saving, darkMode = false }) => {
  const [menuConfig, setMenuConfig] = useState<EventMenuConfig>({
    items: config.items || [],
    cta_buttons: config.cta_buttons || [],
    style: config.style || 'horizontal',
    menu_position: config.menu_position || 'right',
    background_color: config.background_color || '#ffffff',
    text_color: config.text_color || '#000000',
    hover_color: config.hover_color || '#0891b2',
    hamburger_color: config.hamburger_color || '#000000',
    position: config.position || 'sticky'
  });
  const [pages, setPages] = useState<Array<{ id: string; title: string; slug: string }>>([]);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    loadPages();
  }, [websiteId]);

  useEffect(() => {
    if (pages.length > 0 && menuConfig.items.length === 0) {
      autoPopulateMenuFromPages();
    }
  }, [pages]);

  const loadPages = async () => {
    try {
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('id, title, slug, show_in_navigation, navigation_order, is_homepage')
        .eq('event_website_id', websiteId)
        .eq('show_in_navigation', true)
        .eq('is_homepage', false)
        .order('navigation_order', { ascending: true });

      if (error) throw error;
      setPages(data || []);
      console.log('Loaded pages for menu:', data);
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  };

  const autoPopulateMenuFromPages = () => {
    const menuItems: EventMenuItem[] = pages.map((page, index) => ({
      id: uuidv4(),
      label: page.title,
      url: `/${page.slug}`,
      type: 'page',
      order: index
    }));

    setMenuConfig(prev => ({
      ...prev,
      items: menuItems
    }));
  };

  const handleAddItem = () => {
    const newItem: EventMenuItem = {
      id: uuidv4(),
      label: 'New Item',
      url: '',
      type: 'page',
      order: menuConfig.items.length
    };

    setMenuConfig(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const handleUpdateItem = (index: number, updatedItem: EventMenuItem) => {
    setMenuConfig(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? updatedItem : item)
    }));
  };

  const handleDeleteItem = (index: number) => {
    setMenuConfig(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setMenuConfig(prev => {
        const oldIndex = prev.items.findIndex(item => item.id === active.id);
        const newIndex = prev.items.findIndex(item => item.id === over.id);

        const newItems = arrayMove(prev.items, oldIndex, newIndex);
        return {
          ...prev,
          items: newItems.map((item, index) => ({ ...item, order: index }))
        };
      });
    }
  };

  const handleAddCTAButton = () => {
    const newButton: EventCTAButton = {
      id: uuidv4(),
      label: 'Register Now',
      url: '',
      type: 'page',
      position: 'right',
      background_color: '#16a34a',
      text_color: '#ffffff',
      order: menuConfig.cta_buttons.length
    };

    setMenuConfig(prev => ({
      ...prev,
      cta_buttons: [...prev.cta_buttons, newButton]
    }));
  };

  const handleUpdateCTAButton = (index: number, updatedButton: EventCTAButton) => {
    setMenuConfig(prev => ({
      ...prev,
      cta_buttons: prev.cta_buttons.map((button, i) => i === index ? updatedButton : button)
    }));
  };

  const handleDeleteCTAButton = (index: number) => {
    setMenuConfig(prev => ({
      ...prev,
      cta_buttons: prev.cta_buttons.filter((_, i) => i !== index)
    }));
  };

  const handleDragEndCTA = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setMenuConfig(prev => {
        const oldIndex = prev.cta_buttons.findIndex(button => button.id === active.id);
        const newIndex = prev.cta_buttons.findIndex(button => button.id === over.id);

        const newButtons = arrayMove(prev.cta_buttons, oldIndex, newIndex);
        return {
          ...prev,
          cta_buttons: newButtons.map((button, index) => ({ ...button, order: index }))
        };
      });
    }
  };

  const handleChange = (field: keyof EventMenuConfig, value: any) => {
    setMenuConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onSave(menuConfig);
  };

  const renderHeaderPreview = () => {
    if (headerConfig.logo_type === 'upload' && headerConfig.logo_url) {
      return (
        <img
          src={headerConfig.logo_url}
          alt="Event Logo"
          style={{ height: `${headerConfig.logo_size}px` }}
          className="object-contain"
        />
      );
    } else if (headerConfig.logo_type === 'club' && headerConfig.logo_url) {
      return (
        <img
          src={headerConfig.logo_url}
          alt="Club Logo"
          style={{ height: `${headerConfig.logo_size}px` }}
          className="object-contain"
        />
      );
    } else if (headerConfig.logo_type === 'text' && headerConfig.header_text) {
      return (
        <span
          className="font-bold"
          style={{ fontSize: `${headerConfig.text_size}px` }}
        >
          {headerConfig.header_text}
        </span>
      );
    }
    return <span className="text-xl font-bold">Logo</span>;
  };

  return (
    <div className="space-y-4">
      {/* Navigation Style & Position - Compact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Menu Style
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('style', 'horizontal')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                menuConfig.style === 'horizontal'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                  : darkMode
                  ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Horizontal
            </button>
            <button
              onClick={() => handleChange('style', 'dropdown')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                menuConfig.style === 'dropdown'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                  : darkMode
                  ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Hamburger
            </button>
          </div>
        </div>

        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Position
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('menu_position', 'left')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                menuConfig.menu_position === 'left'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                  : darkMode
                  ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Left
            </button>
            <button
              onClick={() => handleChange('menu_position', 'right')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                menuConfig.menu_position === 'right'
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                  : darkMode
                  ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Right
            </button>
          </div>
        </div>
      </div>

      {/* Scroll Behavior - Compact */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Scroll Behavior
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => handleChange('position', 'top')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
              menuConfig.position === 'top'
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                : darkMode
                ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            Static
          </button>
          <button
            onClick={() => handleChange('position', 'sticky')}
            className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
              menuConfig.position === 'sticky'
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600'
                : darkMode
                ? 'border-slate-600 bg-slate-700/50 text-slate-300 hover:border-slate-500'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            Sticky
          </button>
        </div>
      </div>

      {/* Colors - Compact Grid */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Colors
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={menuConfig.background_color}
                onChange={(e) => handleChange('background_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
                title="Background"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Background</label>
              <input
                type="text"
                value={menuConfig.background_color}
                onChange={(e) => handleChange('background_color', e.target.value)}
                className={`w-full px-2 py-1 rounded border text-xs font-mono ${
                  darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={menuConfig.text_color}
                onChange={(e) => handleChange('text_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
                title="Text"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Text</label>
              <input
                type="text"
                value={menuConfig.text_color}
                onChange={(e) => handleChange('text_color', e.target.value)}
                className={`w-full px-2 py-1 rounded border text-xs font-mono ${
                  darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
              <input
                type="color"
                value={menuConfig.hover_color}
                onChange={(e) => handleChange('hover_color', e.target.value)}
                className="w-full h-full cursor-pointer border-0"
                style={{ padding: 0, margin: 0 }}
                title="Hover"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Hover</label>
              <input
                type="text"
                value={menuConfig.hover_color}
                onChange={(e) => handleChange('hover_color', e.target.value)}
                className={`w-full px-2 py-1 rounded border text-xs font-mono ${
                  darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>

          {menuConfig.style === 'dropdown' && (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full border-2 border-slate-600 overflow-hidden flex-shrink-0">
                <input
                  type="color"
                  value={menuConfig.hamburger_color}
                  onChange={(e) => handleChange('hamburger_color', e.target.value)}
                  className="w-full h-full cursor-pointer border-0"
                  style={{ padding: 0, margin: 0 }}
                  title="Hamburger Icon"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500">Hamburger</label>
                <input
                  type="text"
                  value={menuConfig.hamburger_color}
                  onChange={(e) => handleChange('hamburger_color', e.target.value)}
                  className={`w-full px-2 py-1 rounded border text-xs font-mono ${
                    darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA Buttons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            CTA Buttons ({menuConfig.cta_buttons.length})
          </label>
          <button
            onClick={handleAddCTAButton}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Add CTA Button
          </button>
        </div>

        {menuConfig.cta_buttons.length === 0 ? (
          <div className={`text-center py-6 rounded-lg border-2 border-dashed ${
            darkMode ? 'border-slate-700 bg-slate-800/20' : 'border-slate-200 bg-slate-50'
          }`}>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No CTA buttons. Add call-to-action buttons to your navigation.
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCTA}>
            <SortableContext items={menuConfig.cta_buttons.map(button => button.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {menuConfig.cta_buttons.map((button, index) => (
                  <SortableCTAButton
                    key={button.id}
                    button={button}
                    onUpdate={(updatedButton) => handleUpdateCTAButton(index, updatedButton)}
                    onDelete={() => handleDeleteCTAButton(index)}
                    darkMode={darkMode}
                    pages={pages}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Menu Items Info - Navigation comes from Pages tab */}
      <div className={`p-4 rounded-lg border ${
        darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-start gap-3">
          <MenuIcon size={20} className={darkMode ? 'text-blue-400 mt-0.5' : 'text-blue-600 mt-0.5'} />
          <div>
            <h4 className={`font-medium mb-1 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
              Navigation Menu Items
            </h4>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Menu items are now automatically pulled from pages marked "Show in navigation" in the Pages tab.
              Go to the Pages tab to create and manage your navigation pages.
            </p>
          </div>
        </div>
      </div>

      {/* Compact Preview with Header */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Preview
        </label>

        <div className="rounded-lg overflow-hidden border-2 border-slate-300 shadow-lg">
          {/* Header Preview */}
          <div
            style={{
              backgroundColor: headerConfig.background_color,
              color: headerConfig.text_color,
              height: `${headerConfig.height}px`
            }}
            className="flex items-center px-6 relative"
          >
            {/* Left side hamburger */}
            {menuConfig.style === 'dropdown' && menuConfig.menu_position === 'left' && (
              <button
                onClick={() => setPreviewMenuOpen(!previewMenuOpen)}
                className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute left-4"
                style={{ color: menuConfig.hamburger_color }}
              >
                <MenuIcon size={20} />
                <span className="text-[9px] font-semibold tracking-wider">MENU</span>
              </button>
            )}

            {/* CTA Buttons - Left side (inside hamburger if dropdown) */}
            {menuConfig.cta_buttons.filter(b => b.position === 'left').length > 0 && (
              <div className={`flex items-center gap-2 absolute ${
                menuConfig.style === 'dropdown' && menuConfig.menu_position === 'left' ? 'left-20' : 'left-6'
              }`}>
                {menuConfig.cta_buttons.filter(b => b.position === 'left').map((button) => (
                  <button
                    key={button.id}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                    style={{
                      backgroundColor: button.background_color,
                      color: button.text_color
                    }}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            )}

            {/* Center logo - always centered */}
            <div className={`flex items-center w-full ${
              headerConfig.logo_position === 'center' ? 'justify-center' : 'justify-start pl-16'
            }`}>
              {renderHeaderPreview()}
            </div>

            {/* Horizontal menu */}
            {menuConfig.style === 'horizontal' && (
              <div className={`flex items-center gap-4 absolute ${
                menuConfig.menu_position === 'left' ? 'left-20' : 'right-6'
              }`}>
                {pages.filter(p => p.show_in_navigation && p.is_published).slice(0, 4).map((page) => (
                  <div
                    key={page.id}
                    className="text-sm font-medium cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ color: menuConfig.text_color }}
                  >
                    {page.title}
                  </div>
                ))}
                {pages.filter(p => p.show_in_navigation && p.is_published).length > 4 && (
                  <span className="text-xs opacity-50" style={{ color: menuConfig.text_color }}>
                    +{pages.filter(p => p.show_in_navigation && p.is_published).length - 4}
                  </span>
                )}
              </div>
            )}

            {/* CTA Buttons - Right side (inside hamburger if dropdown) */}
            {menuConfig.cta_buttons.filter(b => b.position === 'right').length > 0 && (
              <div className={`flex items-center gap-2 absolute ${
                menuConfig.style === 'dropdown' && menuConfig.menu_position === 'right' ? 'right-20' : 'right-6'
              }`}>
                {menuConfig.cta_buttons.filter(b => b.position === 'right').map((button) => (
                  <button
                    key={button.id}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                    style={{
                      backgroundColor: button.background_color,
                      color: button.text_color
                    }}
                  >
                    {button.label}
                  </button>
                ))}
              </div>
            )}

            {/* Right side hamburger */}
            {menuConfig.style === 'dropdown' && menuConfig.menu_position === 'right' && (
              <button
                onClick={() => setPreviewMenuOpen(!previewMenuOpen)}
                className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-black/5 transition-colors absolute right-4"
                style={{ color: menuConfig.hamburger_color }}
              >
                <MenuIcon size={20} />
                <span className="text-[9px] font-semibold tracking-wider">MENU</span>
              </button>
            )}
          </div>

          {/* Dropdown Menu Sidebar */}
          {menuConfig.style === 'dropdown' && previewMenuOpen && (
            <div className="relative h-48 bg-slate-100">
              <div
                className={`absolute top-0 ${menuConfig.menu_position === 'left' ? 'left-0' : 'right-0'} w-64 h-full bg-white shadow-2xl`}
              >
                <div className="bg-slate-100 px-4 py-5">
                  <button
                    onClick={() => setPreviewMenuOpen(false)}
                    className="w-full text-center text-slate-900 font-semibold text-xs tracking-[0.2em] hover:text-slate-600 transition-colors"
                  >
                    CLOSE MENU
                  </button>
                </div>

                <nav className="space-y-0">
                  <div className="py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] border-b border-slate-200">
                    HOME
                  </div>
                  {pages.filter(p => p.show_in_navigation && p.is_published).map((page) => (
                    <div
                      key={page.id}
                      className="py-3 text-center text-slate-900 font-medium text-xs tracking-[0.15em] hover:text-slate-600 transition-colors border-b border-slate-200"
                    >
                      {page.title.toUpperCase()}
                    </div>
                  ))}
                </nav>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save size={18} />
              <span>Save Navigation</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
