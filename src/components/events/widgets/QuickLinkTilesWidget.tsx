import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';

interface Tile {
  id: string;
  title: string;
  subtitle?: string;
  mode: 'icon' | 'image';
  icon?: string;
  icon_size?: number;
  icon_color?: string;
  layout?: 'top' | 'left' | 'right';
  image_url?: string;
  link_type: 'page' | 'external' | 'registration' | 'file';
  link_page?: string;
  link_url?: string;
  event_id?: string;
  file_url?: string;
  file_name?: string;
  bg_color: string;
  text_color: string;
  hover_bg_color?: string;
}

interface QuickLinkTilesWidgetProps {
  settings: {
    tiles?: Tile[];
    columns?: number;
    tile_height?: number;
    gap?: number;
    border_radius?: number;
    background_color?: string;
  };
  onOpenRegistrationModal?: (eventId: string) => void;
  websiteSlug?: string;
  eventId?: string;
  eventWebsiteId?: string;
}

export const QuickLinkTilesWidget: React.FC<QuickLinkTilesWidgetProps> = ({
  settings,
  onOpenRegistrationModal,
  websiteSlug,
  eventId,
  eventWebsiteId
}) => {
  const navigate = useNavigate();
  const tiles = settings.tiles || [];
  const columns = settings.columns || 4;
  const tileHeight = settings.tile_height || 200;
  const gap = settings.gap || 16;
  const borderRadius = settings.border_radius || 8;
  const backgroundColor = settings.background_color || 'transparent';

  const handleTileClick = (tile: Tile) => {
    if (tile.link_type === 'registration') {
      // Use tile's event_id if available, otherwise fall back to the widget's eventId prop
      const registrationEventId = tile.event_id || eventId;

      if (registrationEventId && onOpenRegistrationModal) {
        onOpenRegistrationModal(registrationEventId);
      } else {
        console.warn('Registration modal handler not provided or no event ID available');
      }
    } else if (tile.link_type === 'file' && tile.file_url) {
      // Open the file in a new tab (for PDFs and documents)
      window.open(tile.file_url, '_blank', 'noopener,noreferrer');
    } else if (tile.link_type === 'page' && tile.link_page) {
      // Handle anchor links (scroll to section on same page)
      if (tile.link_page.startsWith('#')) {
        const element = document.querySelector(tile.link_page);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        // For internal page links within the event website
        let targetUrl = tile.link_page;

        // Remove leading slash if present
        const pagePath = tile.link_page.startsWith('/') ? tile.link_page.substring(1) : tile.link_page;

        // If we have eventWebsiteId (custom domain/subdomain), use simple path
        if (eventWebsiteId) {
          targetUrl = `/${pagePath}`;
        }
        // Otherwise, if we have a websiteSlug (temp URL), use full path
        else if (websiteSlug && !tile.link_page.startsWith('/events/')) {
          targetUrl = `/events/${websiteSlug}/${pagePath}`;
        }

        // Use React Router navigate for SPA routing
        navigate(targetUrl);
      }
    } else if (tile.link_type === 'external' && tile.link_url) {
      window.open(tile.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getIconComponent = (iconName: string) => {
    const Icon = (Icons as any)[iconName];
    return Icon || Icons.Link;
  };

  if (tiles.length === 0) {
    return (
      <div
        className="py-12 text-center"
        style={{ backgroundColor }}
      >
        <p className="text-gray-400">No tiles configured. Add tiles in the widget settings.</p>
      </div>
    );
  }

  // Generate responsive grid classes based on column count
  const getGridClasses = () => {
    const baseClass = 'grid grid-cols-2'; // Always 2 columns on mobile

    // Map columns to Tailwind classes for larger screens
    const lgGridClasses: { [key: number]: string } = {
      1: 'lg:grid-cols-1',
      2: 'lg:grid-cols-2',
      3: 'lg:grid-cols-3',
      4: 'lg:grid-cols-4',
      5: 'lg:grid-cols-5',
      6: 'lg:grid-cols-6',
    };

    const lgClass = lgGridClasses[columns] || 'lg:grid-cols-4';
    return `${baseClass} ${lgClass} w-full`;
  };

  return (
    <div
      className="w-full py-8"
      style={{ backgroundColor }}
    >
      <div
        className={getGridClasses()}
        style={{
          gap: `${gap}px`
        }}
      >
        {tiles.map((tile) => {
          const IconComponent = tile.mode === 'icon' && tile.icon
            ? getIconComponent(tile.icon)
            : null;

          return (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile)}
              className="relative overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-lg group"
              style={{
                height: `${tileHeight}px`,
                backgroundColor: tile.bg_color,
                borderRadius: `${borderRadius}px`,
                color: tile.text_color
              }}
            >
              {tile.mode === 'image' && tile.image_url ? (
                <>
                  <img
                    src={tile.image_url}
                    alt={tile.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3
                      className="text-lg font-bold text-center"
                      style={{ color: tile.text_color }}
                    >
                      {tile.title}
                    </h3>
                  </div>
                </>
              ) : (
                <div className={`flex h-full p-4 ${
                  tile.layout === 'top'
                    ? 'flex-col items-center justify-center'
                    : tile.layout === 'left'
                    ? 'flex-row items-center justify-start gap-4'
                    : 'flex-row-reverse items-center justify-start gap-4'
                }`}>
                  {IconComponent && (
                    <IconComponent
                      size={tile.icon_size || 48}
                      className={tile.layout === 'top' ? 'mb-3' : ''}
                      style={{ color: tile.icon_color || tile.text_color }}
                    />
                  )}
                  <div className={`${tile.layout === 'top' ? 'text-center' : 'text-left'}`}>
                    <h3
                      className="text-lg font-bold"
                      style={{ color: tile.text_color }}
                    >
                      {tile.title}
                    </h3>
                    {tile.subtitle && (
                      <p
                        className="text-sm mt-1 opacity-90"
                        style={{ color: tile.text_color }}
                      >
                        {tile.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  backgroundColor: (tile.hover_bg_color && !tile.hover_bg_color.startsWith('#0891b2') && !tile.hover_bg_color.startsWith('#06b6d4'))
                    ? tile.hover_bg_color
                    : 'rgba(255, 255, 255, 0.15)'
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
