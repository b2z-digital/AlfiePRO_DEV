import React, { useState, useEffect } from 'react';
import { supabase } from '../../../utils/supabase';

interface GroupedEvent {
  id: string;
  event_name: string;
  is_primary: boolean;
  display_order: number;
}

interface ButtonConfig {
  id: string;
  text: string;
  link_type: 'registration' | 'custom';
  url?: string;
  bg_color: string;
  text_color: string;
  event_id: string;
  style?: 'solid' | 'outline' | 'ghost';
  border_radius?: number;
  hover_bg_color?: string;
  hover_text_color?: string;
  width?: 'auto' | 'full' | 'fit';
  size?: 'sm' | 'md' | 'lg';
}

interface MultiButtonWidgetProps {
  settings: {
    buttons?: ButtonConfig[];
    alignment?: 'left' | 'center' | 'right';
    spacing?: 'tight' | 'normal' | 'relaxed';
    style?: 'solid' | 'outline' | 'ghost';
  };
  eventWebsiteId: string;
  onRegisterClick?: (eventId: string) => void;
}

export const MultiButtonWidget: React.FC<MultiButtonWidgetProps> = ({
  settings,
  eventWebsiteId,
  onRegisterClick
}) => {
  const [buttons, setButtons] = useState<ButtonConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadButtons();
  }, [eventWebsiteId, settings]);

  const loadButtons = async () => {
    try {
      setLoading(true);

      // If buttons are provided in settings, use those
      if (settings.buttons && settings.buttons.length > 0) {
        setButtons(settings.buttons);
        return;
      }

      // Otherwise, load from grouped events
      const { data, error } = await supabase
        .from('event_website_all_events')
        .select('*')
        .eq('event_website_id', eventWebsiteId)
        .single();

      if (error) throw error;

      if (data?.all_events && data.all_events.length > 0) {
        const defaultButtons: ButtonConfig[] = data.all_events.map((event: GroupedEvent) => ({
          id: event.id,
          text: `Register for ${event.event_name}`,
          link_type: 'registration' as const,
          url: '',
          bg_color: '#06b6d4',
          text_color: '#ffffff',
          event_id: event.id
        }));
        setButtons(defaultButtons);
      }
    } catch (error) {
      console.error('Error loading buttons:', error);
    } finally {
      setLoading(false);
    }
  };

  const getButtonUrl = (button: ButtonConfig) => {
    if (button.link_type === 'custom' && button.url) {
      return button.url;
    }
    // Registration link - will be implemented based on your registration system
    return `#register-${button.event_id}`;
  };

  const getAlignmentClass = () => {
    switch (settings.alignment) {
      case 'left': return 'justify-start';
      case 'right': return 'justify-end';
      case 'center':
      default: return 'justify-center';
    }
  };

  const getSpacingClass = () => {
    switch (settings.spacing) {
      case 'tight': return 'gap-2';
      case 'relaxed': return 'gap-6';
      case 'normal':
      default: return 'gap-4';
    }
  };

  const getButtonStyleClass = (button: ButtonConfig) => {
    const buttonStyle = button.style || settings.style || 'solid';
    const buttonSize = button.size || 'md';

    let sizeClasses = 'px-6 py-3';
    if (buttonSize === 'sm') sizeClasses = 'px-4 py-2 text-sm';
    if (buttonSize === 'lg') sizeClasses = 'px-8 py-4 text-lg';

    let widthClass = '';
    if (button.width === 'full') widthClass = 'w-full';
    if (button.width === 'fit') widthClass = 'w-fit';

    const baseClasses = `${sizeClasses} ${widthClass} font-semibold transition-all duration-200 hover:scale-105 hover:shadow-lg`;

    switch (buttonStyle) {
      case 'outline':
        return `${baseClasses} border-2 bg-transparent`;
      case 'ghost':
        return `${baseClasses} bg-transparent hover:bg-white/10`;
      case 'solid':
      default:
        return `${baseClasses} shadow-md`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (buttons.length === 0) {
    return null;
  }

  const handleButtonClick = (button: ButtonConfig) => {
    if (button.link_type === 'registration') {
      // Trigger registration modal
      if (onRegisterClick) {
        onRegisterClick(button.event_id);
      }
    } else if (button.link_type === 'custom' && button.url) {
      // Open custom URL
      window.open(button.url, '_blank');
    }
  };

  return (
    <div className={`flex flex-wrap ${getAlignmentClass()} ${getSpacingClass()} py-4`}>
      {buttons.map((button) => {
        const buttonStyle = button.style || settings.style || 'solid';
        const borderRadius = button.border_radius !== undefined ? `${button.border_radius}px` : '0.5rem';

        return (
          <button
            key={button.id}
            onClick={() => handleButtonClick(button)}
            className={getButtonStyleClass(button)}
            style={{
              backgroundColor: buttonStyle === 'solid' ? button.bg_color : 'transparent',
              color: button.text_color,
              borderColor: buttonStyle === 'outline' ? button.bg_color : 'transparent',
              borderRadius
            }}
            onMouseEnter={(e) => {
              if (button.hover_bg_color && buttonStyle === 'solid') {
                e.currentTarget.style.backgroundColor = button.hover_bg_color;
              }
              if (button.hover_text_color) {
                e.currentTarget.style.color = button.hover_text_color;
              }
            }}
            onMouseLeave={(e) => {
              if (buttonStyle === 'solid') {
                e.currentTarget.style.backgroundColor = button.bg_color;
              }
              e.currentTarget.style.color = button.text_color;
            }}
          >
            {button.text}
          </button>
        );
      })}
    </div>
  );
};

// Widget configuration for the event widget registry
export const multiButtonWidgetConfig = {
  id: 'multi-button',
  name: 'Multi-Event Buttons',
  icon: 'MousePointerClick',
  category: 'interactive',
  description: 'Display multiple registration or action buttons for grouped events',
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
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' }
      ]
    },
    {
      key: 'spacing',
      label: 'Button Spacing',
      type: 'select',
      options: [
        { value: 'tight', label: 'Tight' },
        { value: 'normal', label: 'Normal' },
        { value: 'relaxed', label: 'Relaxed' }
      ]
    },
    {
      key: 'style',
      label: 'Button Style (Default)',
      type: 'select',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'outline', label: 'Outline' },
        { value: 'ghost', label: 'Ghost' }
      ]
    }
  ]
};
