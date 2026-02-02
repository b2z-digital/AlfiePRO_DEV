# Event Command Center - Implementation Guide

## Overview

The Event Command Center is a comprehensive event task management system that replaces WhatsApp/Slack juggling with an integrated, collaborative platform for organizing sailing events. This system combines Kanban boards, team chat, activity feeds, timeline views, and smart templates into a unified command center.

## What Was Built

### Phase 1: Database Schema ✅

Created a robust database foundation with:

- **`event_task_boards`** - Board configurations for each event
- **`event_task_lanes`** - Customizable Kanban columns (Planning, In Progress, Review, Done, etc.)
- **`event_task_dependencies`** - Task dependencies for critical path tracking
- **`event_team_channels`** - Team communication channels per event
- **`event_channel_messages`** - Real-time messaging with threads and reactions
- **`event_activity_feed`** - Comprehensive activity tracking
- **`event_task_templates`** - Pre-built task workflows
- **`event_automation_rules`** - Automation rules for task management
- **Enhanced `club_tasks`** - Added event-specific fields (board_id, lane_id, position, tags, etc.)

**Security:** All tables have RLS policies ensuring users only access their organization's data.

**Realtime:** Enabled realtime subscriptions for instant updates across all clients.

### Phase 2: Kanban Board UI ✅

Built a modern, drag-and-drop Kanban interface:

- **KanbanBoard** - Main board component with real-time sync
- **KanbanLane** - Customizable columns with WIP limits
- **KanbanTaskCard** - Rich task cards showing:
  - Priority indicators (Urgent, High, Medium, Low)
  - Due dates with overdue warnings
  - Assignee avatars
  - Tags and labels
  - Dependencies count
  - Comments count
  - Effort tracking (estimated/actual hours)
  - Milestone indicators
  - Blocked status

**Features:**
- Smooth drag-and-drop with @dnd-kit
- Real-time position updates
- WIP limit warnings
- Search and filtering
- Beautiful animations

### Phase 3: Team Chat & Activity Feed ✅

Integrated real-time collaboration:

#### Team Chat
- Multiple channels per event (General, Logistics, Marketing, Race Management)
- Real-time messaging with typing indicators
- @Mentions support
- Emoji reactions
- Message threading
- File attachments
- Read receipts
- Private/public channels

#### Activity Feed
- Real-time stream of all event activity
- Filterable by type (tasks, messages, registrations, etc.)
- User attribution with avatars
- Timeline view with timestamps
- Activity grouping

### Phase 4: Timeline/Gantt View ✅

Visual timeline with dependency tracking:

- **EventTimeline** - Gantt-style timeline view
- Task bars showing duration and priority
- Critical path highlighting
- Today marker
- Event date indicator
- Week/Month view modes
- Dependency arrows
- Milestone markers
- Overdue task highlighting

### Phase 5: Templates & Automation ✅

Smart templates for quick setup:

#### Templates
- Pre-built workflows for common events:
  - Championships (multi-day regattas)
  - Regattas (weekend events)
  - Social events
  - Training sessions
- One-click application with auto-dated tasks
- Task dependencies pre-configured
- Customizable lanes

#### Automation (Database ready, UI pending)
- Trigger types: task_overdue, task_due_soon, lane_changed, etc.
- Action types: send_notification, assign_user, move_lane, etc.
- Conditions and configurations stored in JSONB

### Main Component ✅

**EventCommandCenter** - The unified interface:

```tsx
<EventCommandCenter
  eventId={eventId}
  eventName="Australian Nationals 2026"
  eventDate={new Date('2026-03-15')}
  darkMode={darkMode}
/>
```

**Features:**
- Tab-based navigation (Board, Timeline, Activity, Chat)
- Template selection modal
- Task creation/editing
- Board settings
- Search and filters
- Responsive design

## How to Use

### 1. Setup an Event Board

When you first open an event in the Command Center:

```typescript
// Option A: Use a template
setShowTemplateModal(true);
// Browse templates, select one, apply it

// Option B: Create from scratch
handleCreateBoard();
// Creates a blank board with default lanes
```

### 2. Managing Tasks

#### Create Task
```typescript
// Click "Add Task" in any lane
onAddTask(laneId);
// Opens task form with lane pre-selected
```

#### Move Task
- Drag and drop between lanes
- Automatic position updates
- Real-time sync to database

#### View Task Details
```typescript
onTaskClick(task);
// Opens task details modal
// Shows full description, comments, attachments, dependencies
```

### 3. Team Collaboration

#### Create Channel
```typescript
const channel = await EventCommandCenterStorage.createChannel({
  event_id: eventId,
  name: 'Race Management',
  channel_type: 'race_management',
  is_private: false,
});
```

#### Send Message
```typescript
await EventCommandCenterStorage.sendMessage({
  channel_id: channelId,
  message: 'Meeting at 10am tomorrow!',
  mentions: [userId1, userId2],
});
```

### 4. Monitor Activity

The activity feed automatically tracks:
- Task creation/completion
- Message sends
- File uploads
- Registration receipts
- Website updates
- Milestone achievements

### 5. Timeline View

Switch to timeline to see:
- All tasks plotted on a calendar
- Dependencies between tasks
- Critical path
- Event date marker
- Today indicator

### 6. Apply Templates

```typescript
await EventCommandCenterStorage.applyTemplate(
  templateId,
  eventId,
  eventDate
);
// Creates:
// - Board with configured lanes
// - All template tasks
// - Auto-calculated due dates
// - Pre-configured dependencies
```

## Database Queries

### Get Board with Tasks
```typescript
const board = await EventCommandCenterStorage.getBoard(boardId);
const lanes = await EventCommandCenterStorage.getLanesByBoard(boardId);
const tasks = await EventCommandCenterStorage.getTasksByBoard(boardId);
```

### Move Task
```typescript
await EventCommandCenterStorage.moveTask({
  taskId: task.id,
  sourceLaneId: oldLaneId,
  targetLaneId: newLaneId,
  sourcePosition: 0,
  targetPosition: 3,
});
```

### Subscribe to Real-time Updates
```typescript
const unsubscribe = EventCommandCenterStorage.subscribeToBoard(boardId, {
  onTaskCreated: (task) => setTasks(prev => [...prev, task]),
  onTaskUpdated: (task) => updateTask(task),
  onTaskDeleted: (taskId) => removeTask(taskId),
});
```

## Integration Points

### With Existing Systems

1. **Communications System**
   - Uses existing notification infrastructure
   - @Mentions integrate with user profiles
   - Real-time features use Supabase realtime

2. **Events System**
   - Links to `public_events` table
   - Event websites can show task status
   - Registration triggers activity feed entries

3. **Tasks System**
   - Enhances existing `club_tasks` table
   - Backward compatible with old tasks
   - New fields are optional

4. **Members System**
   - Task assignment uses member records
   - Avatars from member profiles
   - Permissions respect club roles

## Key Features

### What Makes This Special

1. **Context-Aware**
   - Knows if you're organizing a local race vs. national championship
   - Adapts interface and features accordingly

2. **Zero-Config Start**
   - Click "Use Template" and get a pre-populated board
   - All tasks auto-dated based on event date
   - Dependencies pre-configured

3. **Replaces Multiple Tools**
   - No more WhatsApp groups
   - No more Slack channels
   - No more Trello boards
   - Everything in one place

4. **Data Persistence**
   - Everything linked to the event
   - Historical reference
   - Learning from past events

5. **Real-Time Collaboration**
   - See changes instantly
   - Live presence indicators
   - Concurrent editing supported

6. **Mobile-First**
   - Responsive design
   - Touch-friendly interactions
   - Works offline (with service worker)

## Performance Considerations

### Indexes Created
- All foreign keys indexed
- Board and lane positions indexed
- Timeline queries optimized
- Activity feed sorted by date

### Realtime Subscriptions
- Scoped to specific boards/channels
- Automatic cleanup on unmount
- Efficient payload sizes

### Query Protection
- All queries use `.maybeSingle()` where appropriate
- Proper error handling
- Loading states

## Future Enhancements

### Ready to Implement

1. **Automation UI**
   - Visual rule builder
   - Trigger/action configuration
   - Active rules dashboard

2. **Advanced Dependencies**
   - Visual dependency graph
   - Drag-to-create dependencies
   - Auto-adjustment on date changes

3. **Progress Dashboard**
   - Event readiness score
   - Completion percentage per workstream
   - Risk indicators

4. **Resource Planning**
   - Team capacity tracking
   - Workload balancing
   - Conflict detection

5. **Post-Event Analysis**
   - Completion metrics
   - Timeline accuracy
   - Team performance
   - Learning capture

## Usage Example

```typescript
import { EventCommandCenter } from '@/components/event-command-center';

function EventManagementPage() {
  const { currentEvent } = useEvent();
  const { darkMode } = useTheme();

  return (
    <EventCommandCenter
      eventId={currentEvent.id}
      eventName={currentEvent.name}
      eventDate={new Date(currentEvent.start_date)}
      darkMode={darkMode}
    />
  );
}
```

## File Structure

```
src/
├── components/
│   └── event-command-center/
│       ├── EventCommandCenter.tsx       # Main wrapper
│       ├── KanbanBoard.tsx             # Board view
│       ├── KanbanLane.tsx              # Lane component
│       ├── KanbanTaskCard.tsx          # Task card
│       ├── EventTimeline.tsx           # Timeline view
│       ├── EventTeamChat.tsx           # Team chat
│       ├── EventActivityFeed.tsx       # Activity feed
│       ├── EventTemplateModal.tsx      # Template selector
│       └── index.ts                    # Exports
├── types/
│   └── eventCommandCenter.ts           # TypeScript types
├── utils/
│   └── eventCommandCenterStorage.ts    # Database operations
└── supabase/
    └── migrations/
        └── create_event_command_center_system.sql
```

## Technical Stack

- **Frontend:** React, TypeScript, TailwindCSS
- **Drag-and-Drop:** @dnd-kit
- **Database:** Supabase PostgreSQL
- **Real-time:** Supabase Realtime
- **Authentication:** Supabase Auth
- **Date Handling:** date-fns

## Migration Notes

The migration is **non-destructive**:
- Adds new tables (doesn't modify existing ones)
- Enhances `club_tasks` with optional new columns
- Backward compatible with existing tasks
- Can be rolled back if needed

## Support

For issues or questions:
1. Check the type definitions in `eventCommandCenter.ts`
2. Review storage utilities in `eventCommandCenterStorage.ts`
3. Examine component implementations
4. Check database migration for schema details

## Conclusion

The Event Command Center transforms event organization from scattered tools into a unified, collaborative platform. It's designed to scale from small club events to national championships, with the flexibility to adapt to any workflow.

**Start using it today by:**
1. Navigate to an event
2. Click "Event Command Center"
3. Choose a template or create from scratch
4. Start organizing!
