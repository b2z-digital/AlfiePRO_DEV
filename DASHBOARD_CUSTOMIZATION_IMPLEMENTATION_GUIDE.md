# Dashboard Customization System - Implementation Guide

## Overview
This system transforms the static dashboard into a fully customizable, drag-and-drop widget-based interface similar to iOS homescreen customization.

## What Has Been Implemented

### 1. Database Schema ✅
- **Table**: `user_dashboard_layouts`
  - Stores user-specific widget configurations
  - Supports club-specific layouts
  - JSONB storage for flexible widget data
  - Full RLS policies for security

### 2. Type Definitions ✅
- `src/types/dashboard.ts`: Complete TypeScript types for widgets, layouts, and configurations

### 3. Widget System ✅
- **Widget Registry**: `src/components/dashboard/WidgetRegistry.tsx`
  - Centralized widget definitions
  - Category-based organization
  - Permission-based widget filtering

- **Widget Components**: `src/components/dashboard/widgets/`
  - ✅ FinancialHealthWidget - Full implementation
  - ✅ WeatherWidget - Full implementation
  - ✅ MembershipStatusWidget - Full implementation
  - ✅ QuickActionsWidget - Full implementation
  - ✅ ActivityFeedWidget - Placeholder
  - ✅ BoatClassDistributionWidget - Placeholder
  - ✅ MemberEngagementWidget - Placeholder
  - ✅ UpcomingEventsWidget - Placeholder
  - ✅ RecentResultsWidget - Placeholder

## Next Steps to Complete

### 1. Complete Remaining Widgets
Each placeholder widget needs to be filled with actual functionality similar to FinancialHealthWidget:
- Fetch data from Supabase
- Display loading states
- Handle edit mode
- Support remove functionality

### 2. Build Drag-and-Drop System
Use `@dnd-kit` (already in dependencies) to create:

```typescript
// src/components/dashboard/CustomizableDashboard.tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';

export const CustomizableDashboard: React.FC = () => {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event) => {
    // Reorder widgets
    // Save to database
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={widgets} strategy={rectSortingStrategy}>
        {widgets.map(widget => (
          <SortableWidget key={widget.id} widget={widget} />
        ))}
      </SortableContext>
    </DndContext>
  );
};
```

### 3. Create Edit Mode UI
```typescript
// src/components/dashboard/DashboardEditButton.tsx
export const DashboardEditButton: React.FC = () => {
  const { isEditMode, setIsEditMode } = useDashboardContext();

  return (
    <button
      onClick={() => setIsEditMode(!isEditMode)}
      className="fixed top-4 right-4 z-50 ..."
    >
      {isEditMode ? <Check /> : <Edit2 />}
    </button>
  );
};
```

### 4. Widget Library Modal
```typescript
// src/components/dashboard/WidgetLibraryModal.tsx
export const WidgetLibraryModal: React.FC = ({ isOpen, onClose, onAddWidget }) => {
  const categories = getAllCategories();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {categories.map(category => (
        <div key={category}>
          <h3>{category}</h3>
          {getWidgetsByCategory(category).map(widget => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              onAdd={() => onAddWidget(widget)}
            />
          ))}
        </div>
      ))}
    </Modal>
  );
};
```

### 5. Dashboard Storage Utilities
```typescript
// src/utils/dashboardStorage.ts
export async function saveDashboardLayout(userId: string, clubId: string, layout: DashboardLayout) {
  const { data, error } = await supabase
    .from('user_dashboard_layouts')
    .upsert({
      user_id: userId,
      club_id: clubId,
      layout_data: layout,
      is_default: true
    });
  return { data, error };
}

export async function loadDashboardLayout(userId: string, clubId: string) {
  const { data, error } = await supabase
    .from('user_dashboard_layouts')
    .select('*')
    .eq('user_id', userId)
    .eq('club_id', clubId)
    .eq('is_default', true)
    .maybeSingle();

  return data?.layout_data || getDefaultLayout();
}

function getDefaultLayout(): DashboardLayout {
  return {
    widgets: [
      { id: '1', type: 'financial-health', position: { x: 0, y: 0, w: 1, h: 1 } },
      { id: '2', type: 'weather', position: { x: 1, y: 0, w: 1, h: 1 } },
      { id: '3', type: 'membership-status', position: { x: 2, y: 0, w: 1, h: 1 } },
      { id: '4', type: 'activity-feed', position: { x: 0, y: 1, w: 2, h: 1 } },
      { id: '5', type: 'quick-actions', position: { x: 2, y: 1, w: 1, h: 1 } },
    ],
    version: 1
  };
}
```

### 6. CSS Animations
Add to `src/index.css`:
```css
@keyframes wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-1deg); }
  75% { transform: rotate(1deg); }
}

.animate-wiggle {
  animation: wiggle 0.3s ease-in-out infinite;
}
```

### 7. Integration with DashboardHome
Replace the static card rendering in `DashboardHome.tsx` with:
```typescript
import { CustomizableDashboard } from './dashboard/CustomizableDashboard';

// In the component
return (
  <div className="...">
    {/* Keep hero section and top 3 cards */}

    {/* Keep upcoming events and recent results */}

    {/* Replace static widgets with customizable dashboard */}
    <CustomizableDashboard />
  </div>
);
```

## Features to Implement

### Core Features
- [x] Database schema
- [x] Widget type definitions
- [x] Widget registry
- [x] Basic widget components
- [ ] Drag-and-drop grid system
- [ ] Edit mode toggle
- [ ] Widget library modal
- [ ] Save/load functionality
- [ ] Widget remove functionality

### Advanced Features
- [ ] Widget resize (change size: 1x1, 2x1, etc.)
- [ ] Widget configuration panel
- [ ] Multiple layouts per user
- [ ] Layout templates
- [ ] Import/export layouts
- [ ] Widget search in library
- [ ] Widget preview before adding
- [ ] Undo/redo layout changes
- [ ] Mobile-responsive grid

## User Experience Flow

1. **View Mode** (Default)
   - Widgets display normally
   - Clickable to navigate
   - No wiggle animation

2. **Edit Mode** (Click edit icon)
   - All widgets start wiggling
   - X button appears on each widget
   - Drag handles visible
   - Add widget button appears
   - Save/Cancel buttons show

3. **Adding Widgets**
   - Click "+" button
   - Widget library modal opens
   - Browse by category
   - Click widget to add
   - Widget appears in grid

4. **Removing Widgets**
   - Enter edit mode
   - Click X on widget
   - Widget fades out and removes

5. **Reordering Widgets**
   - Enter edit mode
   - Drag widget to new position
   - Other widgets adjust automatically
   - Drop to finalize position

## Database Schema Details

```sql
-- Layout data structure
{
  "widgets": [
    {
      "id": "uuid",
      "type": "financial-health",
      "position": {
        "x": 0,
        "y": 0,
        "w": 1,
        "h": 1
      },
      "settings": {
        // Widget-specific settings
      }
    }
  ],
  "version": 1
}
```

## Testing Checklist

- [ ] Create new user - gets default layout
- [ ] Add widget - persists on refresh
- [ ] Remove widget - persists on refresh
- [ ] Drag widget - position persists
- [ ] Switch clubs - different layouts
- [ ] Offline mode - layout cached
- [ ] Multiple users - independent layouts
- [ ] Reset to default - restores original

## Performance Considerations

1. **Lazy Loading**: Only render visible widgets
2. **Memoization**: Use React.memo for widget components
3. **Debouncing**: Save layout changes with 500ms debounce
4. **Caching**: Cache widget data with appropriate TTLs
5. **Optimistic Updates**: Update UI immediately, sync to DB in background

## Accessibility

- Keyboard navigation for drag-and-drop
- Screen reader announcements for widget changes
- Focus management in edit mode
- ARIA labels for all interactive elements

## Future Enhancements

1. **Widget Marketplace**
   - Community-created widgets
   - Widget ratings and reviews
   - One-click install

2. **Smart Layouts**
   - AI-suggested layouts based on role
   - Popular layouts from similar clubs
   - Seasonal layout templates

3. **Widget Interactions**
   - Cross-widget communication
   - Linked widget actions
   - Widget-to-widget data flow

4. **Advanced Customization**
   - Custom widget colors/themes
   - Widget data refresh intervals
   - Conditional widget visibility

## Estimated Completion Time

- Complete remaining widgets: 4-6 hours
- Drag-and-drop system: 3-4 hours
- Edit mode UI: 2-3 hours
- Widget library modal: 2-3 hours
- Storage utilities: 1-2 hours
- Testing and polish: 2-3 hours

**Total: 14-21 hours**

## Priority Order

1. ✅ Database and types (Complete)
2. ✅ Widget components (4/9 complete)
3. 🔄 Complete remaining widgets (Next)
4. 🔄 Drag-and-drop system (High priority)
5. 🔄 Edit mode toggle (High priority)
6. Widget library modal
7. Save/load functionality
8. Polish and testing
