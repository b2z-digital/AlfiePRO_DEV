import type { EventWidgetDefinition } from '../types/eventWidgets';

export const EVENT_WIDGET_REGISTRY: EventWidgetDefinition[] = [
  {
    type: 'slider',
    name: 'Image Slider',
    description: 'Full-width carousel slider with multiple slides',
    icon: 'Image',
    category: 'content',
    defaultSettings: {
      height: 500,
      auto_rotate: true,
      rotation_speed: 5,
      show_navigation: true,
      show_indicators: true
    },
    settingsSchema: [
      { key: 'height', label: 'Slider Height (px)', type: 'number', defaultValue: 500 },
      { key: 'auto_rotate', label: 'Auto Rotate', type: 'toggle', defaultValue: true },
      { key: 'rotation_speed', label: 'Rotation Speed (seconds)', type: 'number', defaultValue: 5 },
      { key: 'show_navigation', label: 'Show Navigation Arrows', type: 'toggle', defaultValue: true },
      { key: 'show_indicators', label: 'Show Indicators', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'hero',
    name: 'Hero Banner',
    description: 'Large hero section with image and call-to-action',
    icon: 'Image',
    category: 'content',
    defaultSettings: {
      title: 'Welcome to Our Event',
      subtitle: '',
      background_image: '',
      overlay_opacity: 0.4,
      height: 500,
      text_color: '#ffffff',
      show_cta: true,
      cta_text: 'Register Now',
      cta_url: '/register'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea' },
      { key: 'background_image', label: 'Background Image', type: 'image' },
      { key: 'overlay_opacity', label: 'Overlay Opacity', type: 'number', defaultValue: 0.4 },
      { key: 'height', label: 'Height (px)', type: 'number', defaultValue: 500 },
      { key: 'text_color', label: 'Text Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'show_cta', label: 'Show CTA Button', type: 'toggle', defaultValue: true },
      { key: 'cta_text', label: 'CTA Text', type: 'text' },
      { key: 'cta_link_type', label: 'CTA Link Type', type: 'select', options: [
        { label: 'Event Registration', value: 'registration' },
        { label: 'Custom URL', value: 'custom' }
      ], defaultValue: 'registration' },
      { key: 'cta_url', label: 'Custom URL', type: 'url' }
    ]
  },
  {
    type: 'countdown',
    name: 'Event Countdown',
    description: 'Countdown timer to event start',
    icon: 'Clock',
    category: 'event',
    defaultSettings: {
      event_date: '',
      title: 'Event Starts In',
      show_icon: true,
      show_title: true,
      show_days: true,
      show_hours: true,
      show_minutes: true,
      show_seconds: true,
      background_color: 'transparent',
      text_color: '#ffffff',
      border_radius: 0,
      padding: 32
    },
    settingsSchema: [
      { key: 'event_date', label: 'Event Date', type: 'date', required: true },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'show_icon', label: 'Show Icon', type: 'toggle', defaultValue: true },
      { key: 'show_title', label: 'Show Title', type: 'toggle', defaultValue: true },
      { key: 'show_days', label: 'Show Days', type: 'toggle', defaultValue: true },
      { key: 'show_hours', label: 'Show Hours', type: 'toggle', defaultValue: true },
      { key: 'show_minutes', label: 'Show Minutes', type: 'toggle', defaultValue: true },
      { key: 'show_seconds', label: 'Show Seconds', type: 'toggle', defaultValue: true },
      { key: 'background_color', label: 'Background Color', type: 'color' },
      { key: 'text_color', label: 'Text Color', type: 'color' },
      { key: 'border_radius', label: 'Border Radius (px)', type: 'number', defaultValue: 0, helperText: 'Set border radius for rounded corners' },
      { key: 'padding', label: 'Content Padding (px)', type: 'number', defaultValue: 32, helperText: 'Padding around the countdown content' }
    ]
  },
  {
    type: 'event-info',
    name: 'Event Information',
    description: 'Display key event details',
    icon: 'Info',
    category: 'event',
    defaultSettings: {
      data_source: 'event',
      event_name: '',
      event_date: '',
      end_date: '',
      event_time: '',
      venue: '',
      description: '',
      show_date: true,
      show_location: true,
      show_time: false,
      show_description: true,
      show_cta: true,
      cta_text: 'Register Now',
      event_slug: '',
      background_color: 'transparent',
      text_color: '',
      heading_color: '',
      icon_color: '#06b6d4',
      border_color: '',
      cta_background_color: '#06b6d4',
      cta_text_color: '#ffffff'
    },
    settingsSchema: [
      {
        key: 'data_source',
        label: 'Data Source',
        type: 'select',
        defaultValue: 'event',
        options: [
          { label: 'Use Event Data (Automatic)', value: 'event' },
          { label: 'Custom Data', value: 'custom' }
        ],
        helperText: 'Choose whether to automatically load event details or enter custom information'
      },
      { key: 'event_name', label: 'Event Name', type: 'text', showIf: { data_source: 'custom' } },
      { key: 'event_date', label: 'Start Date', type: 'date', showIf: { data_source: 'custom' } },
      { key: 'end_date', label: 'End Date', type: 'date', showIf: { data_source: 'custom' } },
      { key: 'event_time', label: 'Event Time', type: 'text', showIf: { data_source: 'custom' } },
      { key: 'venue', label: 'Venue/Location', type: 'text', showIf: { data_source: 'custom' } },
      { key: 'description', label: 'Description', type: 'textarea', showIf: { data_source: 'custom' } },
      { key: 'event_slug', label: 'Event URL Slug', type: 'text', helperText: 'For registration link (e.g., "national-championships")', showIf: { data_source: 'custom' } },
      { key: 'show_date', label: 'Show Date', type: 'toggle', defaultValue: true },
      { key: 'show_location', label: 'Show Location', type: 'toggle', defaultValue: true },
      { key: 'show_time', label: 'Show Time', type: 'toggle', defaultValue: false },
      { key: 'show_description', label: 'Show Description', type: 'toggle', defaultValue: true },
      { key: 'show_cta', label: 'Show Registration Button', type: 'toggle', defaultValue: true },
      { key: 'cta_text', label: 'Button Text', type: 'text' },
      { key: 'background_color', label: 'Background Color', type: 'color' },
      { key: 'text_color', label: 'Text Color', type: 'color' },
      { key: 'heading_color', label: 'Heading Color', type: 'color' },
      { key: 'icon_color', label: 'Icon Color', type: 'color' },
      { key: 'border_color', label: 'Border Color', type: 'color' },
      { key: 'cta_background_color', label: 'Button Background', type: 'color' },
      { key: 'cta_text_color', label: 'Button Text Color', type: 'color' }
    ]
  },
  {
    type: 'registration-form',
    name: 'Registration Form',
    description: 'Event registration and payment form',
    icon: 'UserPlus',
    category: 'engagement',
    defaultSettings: {
      title: 'Register for Event',
      show_payment: true,
      button_text: 'Register Now',
      button_color: '#10b981'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'show_payment', label: 'Include Payment', type: 'toggle', defaultValue: true },
      { key: 'button_text', label: 'Button Text', type: 'text' },
      { key: 'button_color', label: 'Button Color', type: 'color' }
    ]
  },
  {
    type: 'schedule',
    name: 'Event Schedule',
    description: 'Display event schedule and timeline',
    icon: 'Calendar',
    category: 'event',
    defaultSettings: {
      title: 'Event Schedule',
      view: 'timeline',
      show_descriptions: true
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'view',
        label: 'View Type',
        type: 'select',
        options: [
          { label: 'Timeline', value: 'timeline' },
          { label: 'Grid', value: 'grid' },
          { label: 'List', value: 'list' }
        ]
      },
      { key: 'show_descriptions', label: 'Show Descriptions', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'results-leaderboard',
    name: 'Results & Leaderboard',
    description: 'Live results and competitor standings',
    icon: 'Trophy',
    category: 'event',
    defaultSettings: {
      title: 'Live Results',
      show_top_n: 10,
      auto_refresh: true,
      refresh_interval: 30
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'show_top_n', label: 'Show Top N Results', type: 'number', defaultValue: 10 },
      { key: 'auto_refresh', label: 'Auto Refresh', type: 'toggle', defaultValue: true },
      { key: 'refresh_interval', label: 'Refresh Interval (seconds)', type: 'number' }
    ]
  },
  {
    type: 'live-tracking',
    name: 'Live Tracking Map',
    description: 'Real-time competitor tracking',
    icon: 'MapPin',
    category: 'event',
    defaultSettings: {
      title: 'Live Tracking',
      map_height: 500,
      show_controls: true
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'map_height', label: 'Map Height (px)', type: 'number', defaultValue: 500 },
      { key: 'show_controls', label: 'Show Controls', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'sponsor-grid',
    name: 'Sponsor Grid',
    description: 'Display sponsors in a grid layout',
    icon: 'Award',
    category: 'content',
    defaultSettings: {
      title: 'Our Sponsors',
      show_title: true,
      columns: 4,
      logo_height: 96,
      show_names: true,
      grayscale: false,
      background_color: 'transparent',
      text_color: '#ffffff'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'show_title', label: 'Show Title', type: 'toggle', defaultValue: true },
      { key: 'columns', label: 'Columns', type: 'number', defaultValue: 4 },
      { key: 'logo_height', label: 'Logo Height (px)', type: 'number', defaultValue: 96, helperText: 'Maximum height for sponsor logos' },
      { key: 'show_names', label: 'Show Names', type: 'toggle', defaultValue: true },
      { key: 'grayscale', label: 'Grayscale Effect', type: 'toggle', defaultValue: false },
      { key: 'background_color', label: 'Background Color', type: 'color' },
      { key: 'text_color', label: 'Text Color', type: 'color' }
    ]
  },
  {
    type: 'sponsor-carousel',
    name: 'Sponsor Carousel',
    description: 'Rotating sponsor showcase',
    icon: 'Award',
    category: 'content',
    defaultSettings: {
      auto_rotate: false,
      rotation_speed: 5,
      show_navigation: true,
      background_color: 'transparent',
      show_border: false,
      greyscale: false,
      logos_per_view: 4,
      logo_height: 80
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Our Sponsors' },
      { key: 'show_title', label: 'Show Title', type: 'toggle', defaultValue: true },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: '#0f172a' },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' },
      { key: 'show_border', label: 'Show Border', type: 'toggle', defaultValue: false },
      { key: 'logos_per_view', label: 'Logos Per View', type: 'number', defaultValue: 4 },
      { key: 'logo_height', label: 'Logo Height (px)', type: 'number', defaultValue: 80 },
      { key: 'greyscale', label: 'Greyscale Logos', type: 'toggle', defaultValue: false },
      { key: 'auto_rotate', label: 'Auto Rotate', type: 'toggle', defaultValue: true },
      { key: 'rotation_speed', label: 'Rotation Speed (seconds)', type: 'number', defaultValue: 5 },
      { key: 'show_navigation', label: 'Show Navigation Dots', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'registration-button',
    name: 'Registration Button',
    description: 'Event registration call-to-action button',
    icon: 'ArrowRight',
    category: 'event',
    defaultSettings: {
      button_text: 'Register Now',
      button_size: 'large',
      button_style: 'solid',
      button_color: '#0ea5e9',
      text_color: '#ffffff',
      alignment: 'center',
      show_icon: true
    },
    settingsSchema: [
      { key: 'event_id', label: 'Event', type: 'event-select', helperText: 'Select which event this button should register for (only shown for multi-event sites)' },
      { key: 'button_text', label: 'Button Text', type: 'text', defaultValue: 'Register Now' },
      { key: 'button_size', label: 'Button Size', type: 'select', options: [
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' }
      ], defaultValue: 'large' },
      { key: 'button_style', label: 'Button Style', type: 'select', options: [
        { label: 'Solid', value: 'solid' },
        { label: 'Outline', value: 'outline' }
      ], defaultValue: 'solid' },
      { key: 'button_color', label: 'Button Color', type: 'color', defaultValue: '#0ea5e9' },
      { key: 'text_color', label: 'Text Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'alignment', label: 'Alignment', type: 'select', options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' }
      ], defaultValue: 'center' },
      { key: 'show_icon', label: 'Show Icon', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'multi-button',
    name: 'Multi-Event Buttons',
    description: 'Display multiple registration buttons for grouped events',
    icon: 'MousePointerClick',
    category: 'event',
    defaultSettings: {
      buttons: [],
      alignment: 'center',
      spacing: 'normal',
      style: 'solid'
    },
    settingsSchema: [
      {
        key: 'buttons',
        label: 'Buttons',
        type: 'button-list'
      },
      {
        key: 'alignment',
        label: 'Button Alignment',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' }
        ],
        defaultValue: 'center'
      },
      {
        key: 'spacing',
        label: 'Button Spacing',
        type: 'select',
        options: [
          { label: 'Tight', value: 'tight' },
          { label: 'Normal', value: 'normal' },
          { label: 'Relaxed', value: 'relaxed' }
        ],
        defaultValue: 'normal'
      },
      {
        key: 'style',
        label: 'Button Style (Default)',
        type: 'select',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Outline', value: 'outline' },
          { label: 'Ghost', value: 'ghost' }
        ],
        defaultValue: 'solid'
      }
    ]
  },
  {
    type: 'class-selector-buttons',
    name: 'Class Selector Buttons',
    description: 'NOR and Registration buttons with class selection for multi-class events',
    icon: 'Target',
    category: 'event',
    defaultSettings: {
      nor_button_text: 'Notice of Race',
      register_button_text: 'Register',
      nor_button_color: '#3b82f6',
      register_button_color: '#f97316',
      text_color: '#ffffff',
      alignment: 'center',
      button_style: 'solid',
      size: 'md'
    },
    settingsSchema: [
      {
        key: 'nor_button_text',
        label: 'NOR Button Text',
        type: 'text',
        defaultValue: 'Notice of Race'
      },
      {
        key: 'register_button_text',
        label: 'Register Button Text',
        type: 'text',
        defaultValue: 'Register'
      },
      {
        key: 'nor_button_color',
        label: 'NOR Button Color',
        type: 'color',
        defaultValue: '#3b82f6'
      },
      {
        key: 'register_button_color',
        label: 'Register Button Color',
        type: 'color',
        defaultValue: '#f97316'
      },
      {
        key: 'text_color',
        label: 'Text Color',
        type: 'color',
        defaultValue: '#ffffff'
      },
      {
        key: 'alignment',
        label: 'Button Alignment',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' }
        ],
        defaultValue: 'center'
      },
      {
        key: 'button_style',
        label: 'Button Style',
        type: 'select',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Outline', value: 'outline' }
        ],
        defaultValue: 'solid'
      },
      {
        key: 'size',
        label: 'Button Size',
        type: 'select',
        options: [
          { label: 'Small', value: 'sm' },
          { label: 'Medium', value: 'md' },
          { label: 'Large', value: 'lg' }
        ],
        defaultValue: 'md'
      }
    ]
  },
  {
    type: 'competitor-list',
    name: 'Competitor List',
    description: 'List of registered competitors',
    icon: 'Users',
    category: 'event',
    defaultSettings: {
      title: 'Registered Competitors',
      layout: 'table',
      show_photos: false,
      show_boat_class: true,
      event_ids: []
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Registered Competitors' },
      {
        key: 'event_ids',
        label: 'Events',
        type: 'event-multi-select',
        helperText: 'Select which event(s) to show competitors for. Leave empty to show all events from this website.'
      },
      {
        key: 'layout',
        label: 'Layout',
        type: 'select',
        options: [
          { label: 'Table', value: 'table' },
          { label: 'List', value: 'list' },
          { label: 'Grid', value: 'grid' }
        ],
        defaultValue: 'table'
      },
      { key: 'show_boat_class', label: 'Show Boat Class', type: 'toggle', defaultValue: true }
    ]
  },
  {
    type: 'media-gallery',
    name: 'Media Gallery',
    description: 'Photo and video gallery',
    icon: 'ImageIcon',
    category: 'media',
    defaultSettings: {
      title: 'Gallery',
      columns: 3,
      lightbox: true,
      show_captions: true,
      background_color: 'transparent',
      initial_images: 24,
      load_more_count: 6,
      title_color: '#ffffff',
      title_font_family: 'inherit',
      title_font_size: 24,
      title_font_weight: '700'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'title_font_family', label: 'Title Font', type: 'select', options: [
        { value: 'inherit', label: 'Inherit' },
        { value: 'Roboto', label: 'Roboto' },
        { value: 'Poppins', label: 'Poppins' },
        { value: 'Open Sans', label: 'Open Sans' },
        { value: 'Lato', label: 'Lato' },
        { value: 'Montserrat', label: 'Montserrat' },
        { value: 'Raleway', label: 'Raleway' },
        { value: 'Playfair Display', label: 'Playfair Display' },
        { value: 'Merriweather', label: 'Merriweather' },
        { value: 'PT Sans', label: 'PT Sans' },
        { value: 'Nunito', label: 'Nunito' },
        { value: 'system-ui, -apple-system, sans-serif', label: 'System Sans' },
        { value: 'Georgia, serif', label: 'System Serif' },
        { value: 'monospace', label: 'Monospace' }
      ], defaultValue: 'inherit' },
      { key: 'title_font_size', label: 'Title Font Size (px)', type: 'number', defaultValue: 24 },
      { key: 'title_font_weight', label: 'Title Font Weight', type: 'select', options: [
        { value: '300', label: 'Light' },
        { value: '400', label: 'Normal' },
        { value: '500', label: 'Medium' },
        { value: '600', label: 'Semi-Bold' },
        { value: '700', label: 'Bold' },
        { value: '800', label: 'Extra Bold' },
        { value: '900', label: 'Black' }
      ], defaultValue: '700' },
      { key: 'columns', label: 'Columns', type: 'number', defaultValue: 3 },
      { key: 'initial_images', label: 'Initial Images to Show', type: 'number', defaultValue: 24 },
      { key: 'load_more_count', label: 'Load More Count', type: 'number', defaultValue: 6 },
      { key: 'lightbox', label: 'Enable Lightbox', type: 'toggle', defaultValue: true },
      { key: 'show_captions', label: 'Show Captions', type: 'toggle', defaultValue: true },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' }
    ]
  },
  {
    type: 'gallery-feed',
    name: 'Gallery Feed',
    description: 'Horizontal image carousel feed',
    icon: 'Images',
    category: 'media',
    defaultSettings: {
      title: 'IMAGES',
      max_images: 6,
      show_link: true,
      link_text: 'more images »',
      link_type: 'page',
      link_page: '',
      link_url: '/gallery',
      background_color: 'transparent',
      enable_carousel: true,
      title_color: '#ffffff',
      title_font_family: 'inherit',
      title_font_size: 24,
      title_font_weight: '700'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'title_font_family', label: 'Title Font', type: 'select', options: [
        { value: 'inherit', label: 'Inherit' },
        { value: 'Roboto', label: 'Roboto' },
        { value: 'Poppins', label: 'Poppins' },
        { value: 'Open Sans', label: 'Open Sans' },
        { value: 'Lato', label: 'Lato' },
        { value: 'Montserrat', label: 'Montserrat' },
        { value: 'Raleway', label: 'Raleway' },
        { value: 'Playfair Display', label: 'Playfair Display' },
        { value: 'Merriweather', label: 'Merriweather' },
        { value: 'PT Sans', label: 'PT Sans' },
        { value: 'Nunito', label: 'Nunito' },
        { value: 'system-ui, -apple-system, sans-serif', label: 'System Sans' },
        { value: 'Georgia, serif', label: 'System Serif' },
        { value: 'monospace', label: 'Monospace' }
      ], defaultValue: 'inherit' },
      { key: 'title_font_size', label: 'Title Font Size (px)', type: 'number', defaultValue: 24 },
      { key: 'title_font_weight', label: 'Title Font Weight', type: 'select', options: [
        { value: '300', label: 'Light' },
        { value: '400', label: 'Normal' },
        { value: '500', label: 'Medium' },
        { value: '600', label: 'Semi-Bold' },
        { value: '700', label: 'Bold' },
        { value: '800', label: 'Extra Bold' },
        { value: '900', label: 'Black' }
      ], defaultValue: '700' },
      { key: 'max_images', label: 'Maximum Images to Display', type: 'number', defaultValue: 6 },
      { key: 'enable_carousel', label: 'Enable Carousel for More Images', type: 'toggle', defaultValue: true },
      { key: 'show_link', label: 'Show Gallery Link', type: 'toggle', defaultValue: true },
      { key: 'link_text', label: 'Link Text', type: 'text', defaultValue: 'more images »', showIf: { show_link: true } },
      { key: 'link_type', label: 'Link Type', type: 'select', options: [{ value: 'page', label: 'Page' }, { value: 'external', label: 'External URL' }], defaultValue: 'page', showIf: { show_link: true } },
      { key: 'link_page', label: 'Link to Page', type: 'page-select', defaultValue: '', showIf: { show_link: true, link_type: 'page' } },
      { key: 'link_url', label: 'External URL', type: 'text', defaultValue: '/gallery', showIf: { show_link: true, link_type: 'external' } },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' }
    ]
  },
  {
    type: 'video-embed',
    name: 'Video Player',
    description: 'Embed YouTube or Vimeo video',
    icon: 'Video',
    category: 'media',
    defaultSettings: {
      video_url: '',
      autoplay: false,
      controls: true,
      aspect_ratio: '16:9'
    },
    settingsSchema: [
      { key: 'video_url', label: 'Video URL', type: 'text', required: true },
      { key: 'autoplay', label: 'Autoplay', type: 'toggle', defaultValue: false },
      { key: 'controls', label: 'Show Controls', type: 'toggle', defaultValue: true },
      {
        key: 'aspect_ratio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { label: '16:9', value: '16:9' },
          { label: '4:3', value: '4:3' },
          { label: '1:1', value: '1:1' }
        ]
      }
    ]
  },
  {
    type: 'news-feed',
    name: 'News Feed',
    description: 'Horizontal news carousel feed showing 3 items',
    icon: 'Newspaper',
    category: 'content',
    defaultSettings: {
      title: 'LATEST NEWS',
      max_items: 3,
      show_images: true,
      show_excerpt: true,
      excerpt_length: 100,
      show_link: true,
      link_text: 'more news »',
      link_type: 'page',
      link_page: '',
      link_url: '/news',
      read_more_label: 'Read More',
      link_color: '#06b6d4',
      background_color: 'transparent',
      enable_carousel: true,
      card_style: 'elevated',
      card_bg_color: 'auto',
      card_title_color: 'auto',
      card_excerpt_color: 'auto',
      title_color: '#ffffff',
      title_font_family: 'inherit',
      title_font_size: 24,
      title_font_weight: '700'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'title_font_family', label: 'Title Font', type: 'select', options: [
        { value: 'inherit', label: 'Inherit' },
        { value: 'Roboto', label: 'Roboto' },
        { value: 'Poppins', label: 'Poppins' },
        { value: 'Open Sans', label: 'Open Sans' },
        { value: 'Lato', label: 'Lato' },
        { value: 'Montserrat', label: 'Montserrat' },
        { value: 'Raleway', label: 'Raleway' },
        { value: 'Playfair Display', label: 'Playfair Display' },
        { value: 'Merriweather', label: 'Merriweather' },
        { value: 'PT Sans', label: 'PT Sans' },
        { value: 'Nunito', label: 'Nunito' },
        { value: 'system-ui, -apple-system, sans-serif', label: 'System Sans' },
        { value: 'Georgia, serif', label: 'System Serif' },
        { value: 'monospace', label: 'Monospace' }
      ], defaultValue: 'inherit' },
      { key: 'title_font_size', label: 'Title Font Size (px)', type: 'number', defaultValue: 24 },
      { key: 'title_font_weight', label: 'Title Font Weight', type: 'select', options: [
        { value: '300', label: 'Light' },
        { value: '400', label: 'Normal' },
        { value: '500', label: 'Medium' },
        { value: '600', label: 'Semi-Bold' },
        { value: '700', label: 'Bold' },
        { value: '800', label: 'Extra Bold' },
        { value: '900', label: 'Black' }
      ], defaultValue: '700' },
      { key: 'max_items', label: 'Items Per View', type: 'number', defaultValue: 3 },
      { key: 'show_images', label: 'Show Cover Images', type: 'toggle', defaultValue: true },
      { key: 'show_excerpt', label: 'Show Excerpts', type: 'toggle', defaultValue: true },
      { key: 'excerpt_length', label: 'Excerpt Character Length', type: 'number', defaultValue: 100, showIf: { show_excerpt: true } },
      { key: 'enable_carousel', label: 'Enable Carousel for More Items', type: 'toggle', defaultValue: true },
      { key: 'card_style', label: 'Card Style', type: 'select', options: [{ value: 'elevated', label: 'Elevated (with shadow)' }, { value: 'flat', label: 'Flat (no shadow)' }, { value: 'bordered', label: 'Bordered' }], defaultValue: 'elevated' },
      { key: 'card_bg_color', label: 'Card Background Color', type: 'color', defaultValue: 'auto' },
      { key: 'card_title_color', label: 'Card Title Color', type: 'color', defaultValue: 'auto' },
      { key: 'card_excerpt_color', label: 'Card Excerpt Color', type: 'color', defaultValue: 'auto' },
      { key: 'show_link', label: 'Show News Page Link', type: 'toggle', defaultValue: true },
      { key: 'link_text', label: 'Link Text', type: 'text', defaultValue: 'more news »', showIf: { show_link: true } },
      { key: 'link_type', label: 'Link Type', type: 'select', options: [{ value: 'page', label: 'Page' }, { value: 'external', label: 'External URL' }], defaultValue: 'page', showIf: { show_link: true } },
      { key: 'link_page', label: 'Link to Page', type: 'page-select', defaultValue: '', showIf: { show_link: true, link_type: 'page' } },
      { key: 'link_url', label: 'External URL', type: 'text', defaultValue: '/news', showIf: { show_link: true, link_type: 'external' } },
      { key: 'read_more_label', label: 'Read More Label', type: 'text', defaultValue: 'Read More' },
      { key: 'link_color', label: 'Link Color', type: 'color', defaultValue: '#06b6d4' },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' }
    ]
  },
  {
    type: 'news-blog',
    name: 'News Blog',
    description: 'Full blog-style news display with load more',
    icon: 'FileText',
    category: 'content',
    defaultSettings: {
      title: 'News & Updates',
      columns: 3,
      show_images: true,
      show_excerpt: true,
      excerpt_length: 150,
      initial_items: 9,
      load_more_count: 6,
      read_more_label: 'Read More',
      link_color: '#06b6d4',
      background_color: 'transparent'
    },
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'columns', label: 'Columns', type: 'number', defaultValue: 3 },
      { key: 'initial_items', label: 'Initial Items to Show', type: 'number', defaultValue: 9 },
      { key: 'load_more_count', label: 'Load More Count', type: 'number', defaultValue: 6 },
      { key: 'show_images', label: 'Show Cover Images', type: 'toggle', defaultValue: true },
      { key: 'show_excerpt', label: 'Show Excerpts', type: 'toggle', defaultValue: true },
      { key: 'excerpt_length', label: 'Excerpt Character Length', type: 'number', defaultValue: 150, showIf: { show_excerpt: true } },
      { key: 'read_more_label', label: 'Read More Label', type: 'text', defaultValue: 'Read More' },
      { key: 'link_color', label: 'Link Color', type: 'color', defaultValue: '#06b6d4' },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' }
    ]
  },
  {
    type: 'weather-widget',
    name: 'Weather Forecast',
    description: 'Compact weather forecast widget with event venue location',
    icon: 'Cloud',
    category: 'event',
    defaultSettings: {
      height: 240
    },
    settingsSchema: [
      {
        key: 'height',
        label: 'Height (px)',
        type: 'number',
        defaultValue: 240
      }
    ]
  },
  {
    type: 'venue-map',
    name: 'Venue Map',
    description: 'Interactive venue location map',
    icon: 'Map',
    category: 'event',
    defaultSettings: {
      map_height: '400px',
      zoom_level: 14,
      grayscale: false,
      show_border: true,
      border_radius: 8
    },
    settingsSchema: [
      { key: 'map_height', label: 'Map Height', type: 'text', defaultValue: '400px', helperText: 'e.g., 400px, 100vh, 50%' },
      { key: 'zoom_level', label: 'Zoom Level (1-20)', type: 'number', defaultValue: 14 },
      { key: 'grayscale', label: 'Grayscale Style', type: 'toggle', defaultValue: false },
      { key: 'show_border', label: 'Show Border', type: 'toggle', defaultValue: true },
      { key: 'border_radius', label: 'Border Radius (px)', type: 'number', defaultValue: 8 }
    ]
  },
  {
    type: 'accommodation-map',
    name: 'Accommodation Map',
    description: 'Interactive map showing venue and nearby accommodations',
    icon: 'MapPin',
    category: 'event',
    defaultSettings: {
      map_height: '500px',
      zoom_level: 12,
      grayscale: false,
      show_border: true,
      border_radius: 8,
      venue_marker_color: '#0ea5e9',
      accommodation_marker_color: '#ef4444',
      show_info_windows: true
    },
    settingsSchema: [
      { key: 'map_height', label: 'Map Height', type: 'text', defaultValue: '500px', helperText: 'e.g., 500px, 100vh, 50%' },
      { key: 'zoom_level', label: 'Zoom Level (1-20)', type: 'number', defaultValue: 12 },
      { key: 'grayscale', label: 'Grayscale Style', type: 'toggle', defaultValue: false },
      { key: 'show_border', label: 'Show Border', type: 'toggle', defaultValue: true },
      { key: 'border_radius', label: 'Border Radius (px)', type: 'number', defaultValue: 8 },
      { key: 'venue_marker_color', label: 'Venue Marker Color', type: 'color', defaultValue: '#0ea5e9' },
      { key: 'accommodation_marker_color', label: 'Accommodation Marker Color', type: 'color', defaultValue: '#ef4444' }
    ]
  },
  {
    type: 'text-block',
    name: 'Text Block',
    description: 'Rich text content block',
    icon: 'Type',
    category: 'layout',
    defaultSettings: {
      content: '<p>Add your text here...</p>',
      text_color: '',
      font_family: 'Roboto',
      font_size: '14',
      line_height: '1.6',
      padding: '24',
      text_align: 'left'
    },
    settingsSchema: [
      { key: 'content', label: 'Content', type: 'wysiwyg', required: true },
      { key: 'text_color', label: 'Text Color', type: 'color' },
      {
        key: 'font_family',
        label: 'Font Family',
        type: 'select',
        options: [
          { label: 'Inherit', value: 'inherit' },
          { label: 'Roboto', value: 'Roboto' },
          { label: 'Poppins', value: 'Poppins' },
          { label: 'Open Sans', value: 'Open Sans' },
          { label: 'Lato', value: 'Lato' },
          { label: 'Montserrat', value: 'Montserrat' },
          { label: 'Raleway', value: 'Raleway' },
          { label: 'Playfair Display', value: 'Playfair Display' },
          { label: 'Merriweather', value: 'Merriweather' },
          { label: 'PT Sans', value: 'PT Sans' },
          { label: 'Nunito', value: 'Nunito' },
          { label: 'System Sans', value: 'system-ui, -apple-system, sans-serif' },
          { label: 'System Serif', value: 'Georgia, serif' },
          { label: 'Monospace', value: 'monospace' }
        ]
      },
      { key: 'font_size', label: 'Font Size (px)', type: 'number' },
      {
        key: 'line_height',
        label: 'Line Height',
        type: 'select',
        options: [
          { label: 'Tight (1.25)', value: '1.25' },
          { label: 'Normal (1.5)', value: '1.5' },
          { label: 'Relaxed (1.6)', value: '1.6' },
          { label: 'Loose (2)', value: '2' }
        ]
      },
      { key: 'padding', label: 'Padding (px)', type: 'number' },
      {
        key: 'text_align',
        label: 'Text Alignment',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
          { label: 'Justify', value: 'justify' }
        ]
      }
    ]
  },
  {
    type: 'image-block',
    name: 'Image Block',
    description: 'Single image with optional caption',
    icon: 'ImageIcon',
    category: 'layout',
    defaultSettings: {
      image_url: '',
      title: '',
      caption: '',
      alignment: 'center',
      max_width: 100,
      background_color: 'transparent',
      title_color: '#000000',
      title_font_size: '24',
      title_font_weight: '600',
      caption_color: '#666666',
      caption_font_size: '14',
      caption_font_weight: '400',
      show_button: false,
      button_text: 'Learn More',
      button_url: '',
      button_background_color: '#06b6d4',
      button_text_color: '#ffffff'
    },
    settingsSchema: [
      { key: 'image_url', label: 'Image URL', type: 'image', required: true },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' },
      {
        key: 'alignment',
        label: 'Alignment',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' }
        ]
      },
      { key: 'max_width', label: 'Max Width (%)', type: 'number', defaultValue: 100 },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: '#000000' },
      { key: 'title_font_size', label: 'Title Font Size (px)', type: 'number', defaultValue: 24 },
      {
        key: 'title_font_weight',
        label: 'Title Font Weight',
        type: 'select',
        options: [
          { label: 'Light (300)', value: '300' },
          { label: 'Normal (400)', value: '400' },
          { label: 'Medium (500)', value: '500' },
          { label: 'Semi-Bold (600)', value: '600' },
          { label: 'Bold (700)', value: '700' }
        ],
        defaultValue: '600'
      },
      { key: 'caption', label: 'Caption', type: 'text' },
      { key: 'caption_color', label: 'Caption Color', type: 'color', defaultValue: '#666666' },
      { key: 'caption_font_size', label: 'Caption Font Size (px)', type: 'number', defaultValue: 14 },
      {
        key: 'caption_font_weight',
        label: 'Caption Font Weight',
        type: 'select',
        options: [
          { label: 'Light (300)', value: '300' },
          { label: 'Normal (400)', value: '400' },
          { label: 'Medium (500)', value: '500' },
          { label: 'Semi-Bold (600)', value: '600' },
          { label: 'Bold (700)', value: '700' }
        ],
        defaultValue: '400'
      },
      { key: 'show_button', label: 'Show Button', type: 'toggle', defaultValue: false },
      { key: 'button_text', label: 'Button Text', type: 'text', defaultValue: 'Learn More', showIf: { show_button: true } },
      { key: 'button_url', label: 'Button URL', type: 'url', showIf: { show_button: true } },
      { key: 'button_background_color', label: 'Button Background', type: 'color', defaultValue: '#06b6d4', showIf: { show_button: true } },
      { key: 'button_text_color', label: 'Button Text Color', type: 'color', defaultValue: '#ffffff', showIf: { show_button: true } }
    ]
  },
  {
    type: 'cta-button',
    name: 'Call-to-Action',
    description: 'Prominent CTA button',
    icon: 'MousePointer',
    category: 'engagement',
    defaultSettings: {
      text: 'Click Here',
      url: '#',
      size: 'large',
      color: '#10b981',
      alignment: 'center'
    },
    settingsSchema: [
      { key: 'text', label: 'Button Text', type: 'text', required: true },
      { key: 'url', label: 'Button URL', type: 'text', required: true },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { label: 'Small', value: 'small' },
          { label: 'Medium', value: 'medium' },
          { label: 'Large', value: 'large' }
        ]
      },
      { key: 'color', label: 'Color', type: 'color' },
      {
        key: 'alignment',
        label: 'Alignment',
        type: 'select',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' }
        ]
      }
    ]
  },
  {
    type: 'spacer',
    name: 'Spacer',
    description: 'Add vertical spacing',
    icon: 'Space',
    category: 'layout',
    defaultSettings: {
      height: 50
    },
    settingsSchema: [
      { key: 'height', label: 'Height (px)', type: 'number', defaultValue: 50 }
    ]
  },
  {
    type: 'divider',
    name: 'Divider',
    description: 'Horizontal divider line',
    icon: 'Minus',
    category: 'layout',
    defaultSettings: {
      style: 'solid',
      color: '#e2e8f0',
      width: 100
    },
    settingsSchema: [
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' }
        ]
      },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'width', label: 'Width (%)', type: 'number', defaultValue: 100 }
    ]
  },
  {
    type: 'code-block',
    name: 'Code Block',
    description: 'Embed custom HTML, iframes, or code snippets',
    icon: 'Code',
    category: 'content',
    defaultSettings: {
      code: '',
      height: 400,
      enable_sandbox: true
    },
    settingsSchema: [
      {
        key: 'code',
        label: 'HTML/Embed Code',
        type: 'textarea',
        required: true,
        helperText: 'Paste your HTML code, iframe, or embed code here'
      },
      {
        key: 'height',
        label: 'Height (px)',
        type: 'number',
        defaultValue: 400,
        helperText: 'Set to 0 for auto height'
      },
      {
        key: 'enable_sandbox',
        label: 'Enable Sandbox (Security)',
        type: 'toggle',
        defaultValue: true,
        helperText: 'Recommended for untrusted code'
      }
    ]
  },
  {
    type: 'weather-full',
    name: 'Weather Map (Full)',
    description: 'Interactive weather map with event venue location',
    icon: 'Cloud',
    category: 'event',
    defaultSettings: {
      height: 600,
      show_marker: true,
      zoom_level: 11
    },
    settingsSchema: [
      {
        key: 'height',
        label: 'Height (px)',
        type: 'number',
        defaultValue: 600
      },
      {
        key: 'show_marker',
        label: 'Show Location Marker',
        type: 'toggle',
        defaultValue: true
      },
      {
        key: 'zoom_level',
        label: 'Zoom Level (1-15)',
        type: 'number',
        defaultValue: 11
      }
    ]
  },
  {
    type: 'contact-form',
    name: 'Contact Form',
    description: 'Customizable contact form with email notifications',
    icon: 'Mail',
    category: 'content',
    defaultSettings: {
      title: 'Get in Touch',
      description: 'Fill out the form below and we\'ll get back to you soon.',
      background_color: 'transparent',
      recipient_email: '',
      recipient_name: '',
      fields: [
        { id: 'name', label: 'Name', type: 'text', required: true, enabled: true },
        { id: 'email', label: 'Email', type: 'email', required: true, enabled: true },
        { id: 'phone', label: 'Phone', type: 'tel', required: false, enabled: true },
        { id: 'subject', label: 'Subject', type: 'text', required: true, enabled: true },
        { id: 'message', label: 'Message', type: 'textarea', required: true, enabled: true }
      ],
      title_color: 'auto',
      description_color: 'auto',
      label_color: 'auto',
      input_bg_color: 'auto',
      input_text_color: 'auto',
      input_border_color: 'auto',
      button_bg_color: '#06b6d4',
      button_text_color: '#ffffff',
      button_label: 'Send Message',
      success_message: 'Thank you for your message! We\'ll get back to you soon.',
      error_message: 'Sorry, there was an error sending your message. Please try again.'
    },
    settingsSchema: [
      { key: 'title', label: 'Form Title', type: 'text', defaultValue: 'Get in Touch' },
      { key: 'description', label: 'Form Description', type: 'textarea', defaultValue: 'Fill out the form below and we\'ll get back to you soon.' },
      { key: 'recipient_email', label: 'Recipient Email', type: 'text', defaultValue: '' },
      { key: 'recipient_name', label: 'Recipient Name', type: 'text', defaultValue: '' },
      { key: 'fields', label: 'Form Fields', type: 'fields-manager', defaultValue: [] },
      { key: 'background_color', label: 'Background Color', type: 'color', defaultValue: 'transparent' },
      { key: 'title_color', label: 'Title Color', type: 'color', defaultValue: 'auto' },
      { key: 'description_color', label: 'Description Color', type: 'color', defaultValue: 'auto' },
      { key: 'label_color', label: 'Label Color', type: 'color', defaultValue: 'auto' },
      { key: 'input_bg_color', label: 'Input Background Color', type: 'color', defaultValue: 'auto' },
      { key: 'input_text_color', label: 'Input Text Color', type: 'color', defaultValue: 'auto' },
      { key: 'input_border_color', label: 'Input Border Color', type: 'color', defaultValue: 'auto' },
      { key: 'button_bg_color', label: 'Button Background Color', type: 'color', defaultValue: '#06b6d4' },
      { key: 'button_text_color', label: 'Button Text Color', type: 'color', defaultValue: '#ffffff' },
      { key: 'button_label', label: 'Button Label', type: 'text', defaultValue: 'Send Message' },
      { key: 'success_message', label: 'Success Message', type: 'textarea', defaultValue: 'Thank you for your message! We\'ll get back to you soon.' },
      { key: 'error_message', label: 'Error Message', type: 'textarea', defaultValue: 'Sorry, there was an error sending your message. Please try again.' }
    ]
  },
  {
    type: 'quick-link-tiles',
    name: 'Quick Link Tiles',
    description: 'Grid of clickable tiles with icons or images',
    icon: 'Grid3x3',
    category: 'content',
    defaultSettings: {
      tiles: [],
      columns: 4,
      tile_height: 200,
      gap: 16,
      border_radius: 8,
      background_color: 'transparent'
    },
    settingsSchema: [
      {
        key: 'tiles',
        label: 'Tiles',
        type: 'tile-list',
        helperText: 'Add and configure tiles. Each tile can have an icon or image.'
      },
      {
        key: 'columns',
        label: 'Columns',
        type: 'number',
        defaultValue: 4,
        helperText: 'Number of tiles per row'
      },
      {
        key: 'tile_height',
        label: 'Tile Height (px)',
        type: 'number',
        defaultValue: 200
      },
      {
        key: 'gap',
        label: 'Gap Between Tiles (px)',
        type: 'number',
        defaultValue: 16
      },
      {
        key: 'border_radius',
        label: 'Border Radius (px)',
        type: 'number',
        defaultValue: 8
      },
      {
        key: 'background_color',
        label: 'Background Color',
        type: 'color',
        defaultValue: 'transparent'
      }
    ]
  },
  {
    type: 'skipper-live-tracking',
    name: 'Skipper Live Tracking',
    description: 'Interactive live tracking for skippers with real-time race updates',
    icon: 'Activity',
    category: 'engagement',
    defaultSettings: {
      title: 'Live Race Tracking',
      description: 'Track your performance in real-time during the event',
      showInstructions: true,
      backgroundColor: 'bg-gray-800',
      textColor: 'text-white',
      accentColor: 'cyan',
      event_id: ''
    },
    settingsSchema: [
      {
        key: 'event_id',
        label: 'Event',
        type: 'event-select',
        helperText: 'Select which event to track (only shown for multi-event sites)',
        defaultValue: ''
      },
      { key: 'title', label: 'Widget Title', type: 'text', defaultValue: 'Live Race Tracking' },
      { key: 'description', label: 'Description', type: 'textarea', defaultValue: 'Track your performance in real-time during the event' },
      { key: 'showInstructions', label: 'Show Instructions', type: 'toggle', defaultValue: true },
      {
        key: 'accentColor',
        label: 'Accent Color',
        type: 'select',
        options: [
          { label: 'Cyan', value: 'cyan' },
          { label: 'Blue', value: 'blue' },
          { label: 'Green', value: 'green' },
          { label: 'Purple', value: 'purple' },
          { label: 'Pink', value: 'pink' },
          { label: 'Orange', value: 'orange' },
          { label: 'Red', value: 'red' }
        ],
        defaultValue: 'cyan'
      },
      { key: 'backgroundColor', label: 'Background Class', type: 'text', defaultValue: 'bg-gray-800', helperText: 'Tailwind CSS class (e.g., bg-gray-800)' },
      { key: 'textColor', label: 'Text Color Class', type: 'text', defaultValue: 'text-white', helperText: 'Tailwind CSS class (e.g., text-white)' }
    ]
  }
];

export const getWidgetDefinition = (type: string): EventWidgetDefinition | undefined => {
  return EVENT_WIDGET_REGISTRY.find(w => w.type === type);
};

export const getWidgetsByCategory = (category: string): EventWidgetDefinition[] => {
  return EVENT_WIDGET_REGISTRY.filter(w => w.category === category);
};
