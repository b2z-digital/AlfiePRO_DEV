# Event Website Drag-and-Drop Page Builder Solution

## Overview

This document outlines the comprehensive drag-and-drop page builder system for Event Websites in alfiePRO. The solution replicates the successful dashboard customization approach, providing flexible layouts with simple drag-and-drop functionality to build event website pages.

## Architecture Components

### 1. Database Structure

**Tables Created:**

#### `event_page_layouts`
Stores the page layouts with rows, columns, and widgets:
- `id` - Unique layout identifier
- `event_website_id` - Links to event_websites table
- `page_slug` - Page identifier (home, schedule, results, etc.)
- `rows` - JSONB array containing row/column/widget structure
- `created_at`, `updated_at` - Timestamps

#### `event_global_sections`
Stores header, menu, and footer configurations:
- `id` - Unique section identifier
- `event_website_id` - Links to event_websites table
- `section_type` - 'header', 'menu', or 'footer'
- `enabled` - Toggle section on/off
- `config` - JSONB configuration object
- `created_at`, `updated_at` - Timestamps

**Security:**
- RLS policies enable access based on club membership and association admin roles
- Proper JOIN through event_websites → public_events → clubs/associations

### 2. Widget System

**Widget Registry** (`src/constants/eventWidgetRegistry.ts`)

20+ pre-built widgets organized into categories:

#### Event Widgets
- **Hero Banner** - Large hero with image and CTA
- **Event Countdown** - Countdown timer to event start
- **Event Information** - Display key event details
- **Schedule** - Event schedule and timeline
- **Results & Leaderboard** - Live results display
- **Live Tracking Map** - Real-time competitor tracking
- **Weather Forecast** - Event location weather
- **Venue Map** - Interactive location map

#### Content Widgets
- **Sponsor Grid** - Display sponsors in grid layout
- **Sponsor Carousel** - Rotating sponsor showcase
- **News Feed** - Latest news and updates
- **News Featured** - Featured news article

#### Media Widgets
- **Media Gallery** - Photo and video gallery with lightbox
- **Video Player** - YouTube/Vimeo embed

#### Engagement Widgets
- **Registration Form** - Event registration with payment
- **Competitor List** - Display registered competitors
- **Competitor Profiles** - Detailed competitor cards
- **Contact Form** - Contact/inquiry form
- **Social Feed** - Social media integration
- **Call-to-Action** - Prominent CTA button

#### Layout Widgets
- **Text Block** - Rich text content
- **Image Block** - Single image with caption
- **Spacer** - Vertical spacing
- **Divider** - Horizontal divider line

**Widget Definition Structure:**
```typescript
{
  type: 'hero',
  name: 'Hero Banner',
  description: 'Large hero section...',
  icon: 'Image',
  category: 'content',
  defaultSettings: { /* default config */ },
  settingsSchema: [ /* configurable fields */ ]
}
```

### 3. Global Sections

#### Header Configuration
- Logo upload and positioning
- Event name display toggle
- Background and text colors
- Height customization

#### Menu Configuration
- Dynamic menu items with hierarchy
- Horizontal or dropdown style
- Color customization (background, text, hover)
- Sticky or top positioning
- Links to pages, external URLs, or page sections

#### Footer Configuration
- Multi-column layout
- Social media links (Facebook, Instagram, Twitter, YouTube)
- Copyright text
- Custom footer items and links
- Background and text colors

### 4. Page Layout Structure

**Row-Based Layout:**
```typescript
{
  rows: [
    {
      id: 'row-1',
      order: 0,
      background: { type: 'color', value: '#ffffff' },
      padding: { top: 40, bottom: 40 },
      columns: [
        {
          id: 'col-1',
          width: 6, // 12-column grid system
          widgets: [
            {
              id: 'widget-1',
              type: 'hero',
              settings: { /* widget config */ },
              order: 0
            }
          ]
        }
      ]
    }
  ]
}
```

## Implementation Guide

### Phase 1: Global Sections Manager (NEXT STEP)

Create components to manage header, menu, and footer:

**Components to Build:**
1. `EventWebsiteGlobalSectionsManager.tsx` - Main manager component
2. `EventHeaderEditor.tsx` - Header configuration
3. `EventMenuEditor.tsx` - Menu builder with drag-drop
4. `EventFooterEditor.tsx` - Footer column builder

**Features:**
- Visual editor for each section
- Live preview
- Toggle sections on/off
- Color pickers for branding
- Logo/image upload
- Menu item management with drag-drop reordering

### Phase 2: Page Editor with Drag-and-Drop

Create the main page builder interface:

**Components to Build:**
1. `EventPageBuilderEditor.tsx` - Main editor interface
2. `EventWidgetLibrary.tsx` - Widget picker sidebar
3. `EventRowEditor.tsx` - Row container with drag-drop
4. `EventColumnEditor.tsx` - Column container
5. `EventWidgetRenderer.tsx` - Render widget based on type
6. `EventWidgetSettingsModal.tsx` - Configure widget settings

**Features:**
- Add/remove/reorder rows
- Split rows into columns (1, 2, 3, or 4 columns)
- Drag widgets from library into columns
- Drag to reorder widgets within columns
- Click widget to open settings modal
- Row background (color, gradient, image)
- Row padding controls
- Undo/redo support
- Mobile preview toggle

**Integration with @dnd-kit:**
```typescript
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
```

### Phase 3: Widget Implementations

Create renderer components for each widget type:

**Widget Components:**
- `widgets/HeroWidget.tsx`
- `widgets/CountdownWidget.tsx`
- `widgets/EventInfoWidget.tsx`
- `widgets/ScheduleWidget.tsx`
- `widgets/ResultsWidget.tsx`
- `widgets/LiveTrackingWidget.tsx`
- `widgets/SponsorGridWidget.tsx`
- `widgets/MediaGalleryWidget.tsx`
- etc.

Each widget receives its settings and renders accordingly.

### Phase 4: Public-Facing Renderer

Create public page renderer that:
1. Fetches page layout from database
2. Renders global sections (header, menu, footer)
3. Renders rows, columns, and widgets in order
4. Applies theme and styling
5. Handles responsive layout

**Component:**
`PublicEventWebsitePage.tsx` - Already exists, needs enhancement

## Data Flow

1. **Edit Mode:**
   - User drags widgets from library
   - Layout state updates in React
   - On save, entire layout JSON sent to database
   - Stored in `event_page_layouts.rows` JSONB column

2. **View Mode:**
   - Fetch layout from `event_page_layouts` by page_slug
   - Fetch global sections from `event_global_sections`
   - Render header → menu → page content → footer
   - Each widget renders using its type and settings

## Benefits

1. **Flexibility** - Any layout combination possible
2. **Reusability** - Widgets can be reused across pages
3. **Consistency** - Global sections ensure branding
4. **User-Friendly** - Visual drag-and-drop interface
5. **Extensible** - Easy to add new widget types
6. **Responsive** - Grid system ensures mobile compatibility
7. **Performance** - JSONB storage is fast and queryable

## Next Steps

1. ✅ Database tables created
2. ✅ Widget registry defined
3. ✅ Type definitions completed
4. 🔄 Build Global Sections Manager UI
5. 🔄 Build Page Editor UI
6. 🔄 Implement widget renderers
7. 🔄 Integrate with Pages tab in Event Website Dashboard
8. 🔄 Add page templates for quick start
9. 🔄 Add import/export functionality
10. 🔄 Add revision history

## Similar Patterns in alfiePRO

This solution follows the same successful pattern as:
- Dashboard customization with widget library
- Club website page builder
- Form builder with field library

The familiar interface ensures users can quickly adopt the event website builder.

## Technical Notes

- Uses @dnd-kit for drag-and-drop (already in project)
- JSONB storage allows flexible schema
- RLS policies ensure proper access control
- Widgets are React components with props interface
- Settings schemas enable automatic form generation
- Preview mode uses same renderer as public view

## Widget Settings Auto-Generation

Each widget's settings schema automatically generates a form:

```typescript
settingsSchema: [
  { key: 'title', label: 'Title', type: 'text', required: true },
  { key: 'background_color', label: 'Background', type: 'color' },
  { key: 'show_cta', label: 'Show CTA', type: 'toggle' }
]
```

This generates form fields with proper validation and controls.
