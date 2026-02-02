import type { OrganizationWidgetDefinition } from '../types/organizationWidgets';

export const organizationWidgetRegistry: OrganizationWidgetDefinition[] = [
  {
    type: 'hero',
    name: 'Hero Section',
    description: 'Full-width hero banner with text and image',
    icon: 'Image',
    category: 'content',
    defaultSettings: {
      title: 'Welcome',
      subtitle: '',
      background_image: '',
      background_color: '#1e293b',
      text_color: '#ffffff',
      height: 400,
      overlay_opacity: 0.5
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Welcome' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea', defaultValue: '' },
      { key: 'background_image', label: 'Background Image', type: 'image' },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: '#1e293b' },
      { key: 'text_color', label: 'Text Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'height', label: 'Height (px)', type: 'number', defaultValue: 400 },
      { key: 'overlay_opacity', label: 'Overlay Opacity', type: 'number', defaultValue: 0.5 }
    ]
  },
  {
    type: 'text-block',
    name: 'Text Block',
    description: 'Rich text content block',
    icon: 'Type',
    category: 'content',
    defaultSettings: {
      content: '<p>Enter your content here...</p>',
      text_align: 'left'
    },
    settingsSchema: [
      { key: 'content', label: 'Content', type: 'wysiwyg', defaultValue: '<p>Enter your content here...</p>' },
      { key: 'text_align', label: 'Text Align', type: 'select', options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' }
      ], defaultValue: 'left' }
    ]
  },
  {
    type: 'image-block',
    name: 'Image',
    description: 'Single image with optional caption',
    icon: 'Image',
    category: 'media',
    defaultSettings: {
      image_url: '',
      alt_text: '',
      caption: '',
      border_radius: 8
    },
    settingsSchema: [
      { key: 'image_url', label: 'Image', type: 'image' },
      { key: 'alt_text', label: 'Alt Text', type: 'text' },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'border_radius', label: 'Border Radius', type: 'number', defaultValue: 8 }
    ]
  },
  {
    type: 'event-feed',
    name: 'Event Feed',
    description: 'Display upcoming events',
    icon: 'Calendar',
    category: 'organization',
    defaultSettings: {
      title: 'Upcoming Events',
      limit: 6,
      show_past: false,
      layout: 'grid'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Upcoming Events' },
      { key: 'limit', label: 'Number of Events', type: 'number', defaultValue: 6 },
      { key: 'show_past', label: 'Show Past Events', type: 'toggle', defaultValue: false },
      { key: 'layout', label: 'Layout', type: 'select', options: [
        { label: 'Grid', value: 'grid' },
        { label: 'List', value: 'list' }
      ], defaultValue: 'grid' }
    ]
  },
  {
    type: 'results-feed',
    name: 'Results Feed',
    description: 'Display recent race results',
    icon: 'Trophy',
    category: 'organization',
    defaultSettings: {
      title: 'Recent Results',
      limit: 5
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Recent Results' },
      { key: 'limit', label: 'Number of Results', type: 'number', defaultValue: 5 }
    ]
  },
  {
    type: 'news-feed',
    name: 'News Feed',
    description: 'Display latest news articles',
    icon: 'Newspaper',
    category: 'organization',
    defaultSettings: {
      title: 'Latest News',
      limit: 4,
      layout: 'grid'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Latest News' },
      { key: 'limit', label: 'Number of Articles', type: 'number', defaultValue: 4 },
      { key: 'layout', label: 'Layout', type: 'select', options: [
        { label: 'Grid', value: 'grid' },
        { label: 'List', value: 'list' }
      ], defaultValue: 'grid' }
    ]
  },
  {
    type: 'classifieds-feed',
    name: 'Classifieds Feed',
    description: 'Display classified listings',
    icon: 'Tag',
    category: 'organization',
    defaultSettings: {
      title: 'For Sale',
      limit: 6
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'For Sale' },
      { key: 'limit', label: 'Number of Listings', type: 'number', defaultValue: 6 }
    ]
  },
  {
    type: 'weather-widget',
    name: 'Weather',
    description: 'Display weather conditions',
    icon: 'Cloud',
    category: 'engagement',
    defaultSettings: {
      show_forecast: true
    },
    settingsSchema: [
      { key: 'show_forecast', label: 'Show Forecast', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'contact-form',
    name: 'Contact Form',
    description: 'Contact form for visitors',
    icon: 'Mail',
    category: 'engagement',
    defaultSettings: {
      title: 'Contact Us',
      show_map: false
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Contact Us' },
      { key: 'show_map', label: 'Show Map', type: 'toggle', defaultValue: false }
    ]
  },
  {
    type: 'cta-button',
    name: 'Call to Action',
    description: 'Button with link',
    icon: 'MousePointer',
    category: 'engagement',
    defaultSettings: {
      text: 'Learn More',
      url: '#',
      style: 'solid',
      background_color: '#22c55e',
      text_color: '#ffffff'
    },
    settingsSchema: [
      { key: 'text', label: 'Button Text', type: 'text', defaultValue: 'Learn More' },
      { key: 'url', label: 'Link URL', type: 'url' },
      { key: 'style', label: 'Style', type: 'select', options: [
        { label: 'Solid', value: 'solid' },
        { label: 'Outline', value: 'outline' }
      ], defaultValue: 'solid' },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: '#22c55e' },
      { key: 'text_color', label: 'Text Color', type: 'color', defaultValue: '#ffffff' }
    ]
  },
  {
    type: 'spacer',
    name: 'Spacer',
    description: 'Add vertical space',
    icon: 'ArrowsUpDown',
    category: 'layout',
    defaultSettings: {
      height: 40
    },
    settingsSchema: [
      { key: 'height', label: 'Height (px)', type: 'number', defaultValue: 40 }
    ]
  },
  {
    type: 'divider',
    name: 'Divider',
    description: 'Horizontal line divider',
    icon: 'Minus',
    category: 'layout',
    defaultSettings: {
      color: '#e2e8f0',
      thickness: 1,
      width: 100
    },
    settingsSchema: [
      { key: 'color', label: 'Color', type: 'color', defaultValue: '#e2e8f0' },
      { key: 'thickness', label: 'Thickness (px)', type: 'number', defaultValue: 1 },
      { key: 'width', label: 'Width (%)', type: 'number', defaultValue: 100 }
    ]
  }
];

export function getWidgetDefinition(type: string): OrganizationWidgetDefinition | undefined {
  return organizationWidgetRegistry.find(w => w.type === type);
}
