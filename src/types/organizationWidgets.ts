export type DeviceType = 'desktop' | 'tablet' | 'mobile';
export type OrganizationType = 'club' | 'state_association' | 'national_association';

export type OrganizationWidgetType =
  | 'hero'
  | 'text-block'
  | 'image-block'
  | 'video-embed'
  | 'event-feed'
  | 'results-feed'
  | 'news-feed'
  | 'classifieds-feed'
  | 'calendar-widget'
  | 'weather-widget'
  | 'venue-map'
  | 'contact-form'
  | 'social-feed'
  | 'member-directory'
  | 'yacht-classes'
  | 'committee-list'
  | 'sponsor-grid'
  | 'gallery-grid'
  | 'cta-button'
  | 'spacer'
  | 'divider'
  | 'slider'
  | 'quick-links';

export interface OrganizationWidgetConfig {
  id: string;
  type: OrganizationWidgetType;
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

export interface OrganizationPageRow {
  id: string;
  order: number;
  columns: OrganizationPageColumn[];
  background?: {
    type: 'color' | 'gradient' | 'image';
    value: string;
    mediaType?: 'image' | 'video';
    videoUrl?: string;
    imagePosition?: string;
    overlayType?: 'none' | 'solid' | 'gradient';
    overlayColor?: string;
    overlayOpacity?: number;
  };
  padding?: { top: number; bottom: number; left: number; right: number };
  responsivePadding?: ResponsivePadding;
  margin?: { top: number; bottom: number; left: number; right: number };
  responsiveMargin?: ResponsiveMargin;
  fullWidth?: boolean;
  columnGap?: number;
  stackOnMobile?: boolean;
  stackOnTablet?: boolean;
  maxWidth?: string;
  minHeight?: string;
}

export interface OrganizationPageColumn {
  id: string;
  width: number;
  widgets: OrganizationWidgetConfig[];
  verticalAlign?: 'top' | 'center' | 'bottom';
  background?: { type: 'color' | 'gradient' | 'image'; value: string };
  padding?: { top: number; bottom: number; left: number; right: number };
  responsivePadding?: ResponsivePadding;
  responsiveWidth?: { desktop?: number; tablet?: number; mobile?: number };
}

export interface OrganizationPageLayout {
  id: string;
  club_id?: string;
  state_association_id?: string;
  national_association_id?: string;
  page_slug: string;
  page_title: string;
  page_icon?: string;
  rows: OrganizationPageRow[];
  is_published: boolean;
  show_in_navigation: boolean;
  navigation_order: number;
  is_homepage: boolean;
  meta_title?: string;
  meta_description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationGlobalSection {
  id: string;
  club_id?: string;
  state_association_id?: string;
  national_association_id?: string;
  section_type: 'header' | 'menu' | 'footer';
  enabled: boolean;
  config: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationHeaderConfig {
  logo_type: 'upload' | 'organization' | 'text';
  logo_url?: string;
  header_text?: string;
  logo_position: 'left' | 'center';
  show_organization_name: boolean;
  background_color: string;
  text_color: string;
  height: number;
  logo_size: number;
}

export interface OrganizationMenuConfig {
  items: OrganizationMenuItem[];
  cta_buttons: OrganizationCTAButton[];
  style: 'horizontal' | 'dropdown';
  background_color: string;
  text_color: string;
  hover_color: string;
}

export interface OrganizationMenuItem {
  id: string;
  label: string;
  url: string;
  type: 'page' | 'external' | 'section';
  order: number;
  children?: OrganizationMenuItem[];
}

export interface OrganizationCTAButton {
  id: string;
  label: string;
  url: string;
  type: 'page' | 'external' | 'section' | 'join_club';
  position: 'left' | 'right';
  background_color: string;
  text_color: string;
  button_style: 'solid' | 'outline';
  order: number;
}

export interface OrganizationFooterConfig {
  columns: OrganizationFooterColumn[];
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

export interface OrganizationFooterColumn {
  id: string;
  title: string;
  items: OrganizationFooterItem[];
  order: number;
}

export interface OrganizationFooterItem {
  id: string;
  label: string;
  url: string;
  type: 'link' | 'text';
}

export interface OrganizationWidgetDefinition {
  type: OrganizationWidgetType;
  name: string;
  description: string;
  icon: string;
  category: 'content' | 'organization' | 'media' | 'engagement' | 'layout';
  defaultSettings: Record<string, any>;
  settingsSchema: OrganizationWidgetSettingField[];
}

export interface OrganizationWidgetSettingField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'wysiwyg' | 'number' | 'color' | 'image' | 'select' | 'page-select' | 'toggle' | 'url';
  defaultValue?: any;
  options?: { label: string; value: string }[];
  required?: boolean;
  description?: string;
}
