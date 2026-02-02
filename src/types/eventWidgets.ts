export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export type EventWidgetType =
  | 'hero'
  | 'countdown'
  | 'event-info'
  | 'registration-form'
  | 'schedule'
  | 'results-leaderboard'
  | 'live-tracking'
  | 'sponsor-grid'
  | 'sponsor-carousel'
  | 'competitor-list'
  | 'competitor-profiles'
  | 'media-gallery'
  | 'gallery-feed'
  | 'video-embed'
  | 'video-player'
  | 'news-feed'
  | 'news-featured'
  | 'weather-widget'
  | 'weather-full'
  | 'venue-map'
  | 'contact-form'
  | 'social-feed'
  | 'text-block'
  | 'image-block'
  | 'cta-button'
  | 'code-block'
  | 'spacer'
  | 'divider'
  | 'slider';

export interface EventWidgetConfig {
  id: string;
  type: EventWidgetType;
  title?: string;
  settings: Record<string, any>;
  responsiveSettings?: ResponsiveSettings;
  order: number;
  responsiveMargin?: ResponsiveMargin;
  responsivePadding?: ResponsivePadding;
}

export interface ResponsiveSettings {
  desktop?: Record<string, any>;
  tablet?: Record<string, any>;
  mobile?: Record<string, any>;
}

export interface ResponsivePadding {
  desktop?: { top: number; bottom: number; left: number; right: number };
  tablet?: { top: number; bottom: number; left: number; right: number };
  mobile?: { top: number; bottom: number; left: number; right: number };
}

export interface ResponsiveMargin {
  desktop?: { top: number; bottom: number; left: number; right: number };
  tablet?: { top: number; bottom: number; left: number; right: number };
  mobile?: { top: number; bottom: number; left: number; right: number };
}

export interface EventPageRow {
  id: string;
  order: number;
  columns: EventPageColumn[];
  background?: {
    type: 'color' | 'gradient' | 'image';
    value: string;
    mediaType?: 'image' | 'video';
    videoUrl?: string;
    imagePosition?: string;
    kenBurnsEffect?: boolean;
    overlayType?: 'none' | 'solid' | 'gradient';
    overlayColor?: string;
    overlayGradientStart?: string;
    overlayGradientEnd?: string;
    overlayGradientDirection?: string;
    overlayOpacity?: number;
  };
  padding?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  responsivePadding?: ResponsivePadding;
  margin?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  responsiveMargin?: ResponsiveMargin;
  fullWidth?: boolean;
  columnGap?: number;
  responsiveColumnGap?: {
    desktop?: number;
    tablet?: number;
    mobile?: number;
  };
  stackOnMobile?: boolean;
  stackOnTablet?: boolean;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  responsiveMaxWidth?: {
    desktop?: string;
    tablet?: string;
    mobile?: string;
  };
  responsiveMinHeight?: {
    desktop?: string;
    tablet?: string;
    mobile?: string;
  };
  responsiveMaxHeight?: {
    desktop?: string;
    tablet?: string;
    mobile?: string;
  };
}

export interface EventPageColumn {
  id: string;
  width: number;
  widgets: EventWidgetConfig[];
  verticalAlign?: 'top' | 'center' | 'bottom';
  background?: {
    type: 'color' | 'gradient' | 'image';
    value: string;
  };
  padding?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  responsivePadding?: ResponsivePadding;
  margin?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  responsiveMargin?: ResponsiveMargin;
  responsiveWidth?: {
    desktop?: number;
    tablet?: number;
    mobile?: number;
  };
}

export interface EventPageLayout {
  id: string;
  event_website_id: string;
  page_slug: string;
  rows: EventPageRow[];
  created_at?: string;
  updated_at?: string;
}

export interface EventGlobalSection {
  id: string;
  event_website_id: string;
  section_type: 'header' | 'menu' | 'footer';
  enabled: boolean;
  config: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface EventHeaderConfig {
  logo_type: 'upload' | 'club' | 'text';
  logo_url?: string;
  header_text?: string;
  logo_position: 'left' | 'center';
  show_event_name: boolean;
  background_color: string;
  text_color: string;
  height: number;
  logo_size: number;
  text_size: number;
  max_width?: number;
}

export interface EventMenuConfig {
  items: EventMenuItem[];
  cta_buttons: EventCTAButton[];
  style: 'horizontal' | 'dropdown';
  menu_position: 'left' | 'right';
  background_color: string;
  text_color: string;
  hover_color: string;
  hamburger_color: string;
  hamburger_size: number;
  width_type: 'responsive' | 'fixed';
  fixed_width: number;
  position: 'top' | 'sticky';
}

export interface EventCTAButton {
  id: string;
  label: string;
  url: string;
  type: 'page' | 'external' | 'section' | 'event_registration' | 'smart_nor' | 'smart_registration';
  position: 'left' | 'right';
  background_color: string;
  text_color: string;
  button_style: 'solid' | 'outline';
  order: number;
  link_type?: 'registration' | 'custom' | 'page' | 'smart_nor' | 'smart_registration';
  event_id?: string;
}

export interface EventMenuItem {
  id: string;
  label: string;
  url: string;
  type: 'page' | 'external' | 'section';
  order: number;
  children?: EventMenuItem[];
}

export interface EventFooterConfig {
  columns: EventFooterColumn[];
  background_color: string;
  text_color: string;
  show_social_links: boolean;
  social_links?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
  };
  copyright_text?: string;
}

export interface EventFooterColumn {
  id: string;
  title: string;
  items: EventFooterItem[];
  order: number;
}

export interface EventFooterItem {
  id: string;
  label: string;
  url: string;
  type: 'link' | 'text';
}

export interface EventWidgetDefinition {
  type: EventWidgetType;
  name: string;
  description: string;
  icon: string;
  category: 'content' | 'event' | 'media' | 'engagement' | 'layout';
  defaultSettings: Record<string, any>;
  settingsSchema: EventWidgetSettingField[];
}

export interface EventWidgetSettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'wysiwyg' | 'number' | 'color' | 'image' | 'select' | 'page-select' | 'toggle' | 'date' | 'url';
  defaultValue?: any;
  options?: { label: string; value: string }[];
  required?: boolean;
  description?: string;
  helperText?: string;
  showIf?: Record<string, any>;
}
