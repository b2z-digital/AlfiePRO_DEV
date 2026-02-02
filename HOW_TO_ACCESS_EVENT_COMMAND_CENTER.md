# How to Access the Event Command Center

## Quick Access

The Event Command Center is now fully integrated into your application! Here's how to access it:

### **Option 1: From Event Website Dashboard (Easiest)**

1. Navigate to **Website > Event Websites** in your dashboard
2. Click on any event website from the list
3. Look for the purple **"Command Center"** button in the top-right corner
4. Click it to open the Event Command Center for that event

### **Option 2: Direct URL**

You can also access it directly by navigating to:
```
/event-command-center/{eventId}
```

Replace `{eventId}` with your actual event ID from the `public_events` table.

## What You'll See

Once you access the Event Command Center, you'll be greeted with either:

### First Time (No Board Setup)
- A welcome screen with two options:
  - **"Browse Templates"** - Choose from pre-built templates (Championship, Regatta, Social, Training)
  - **"Create From Scratch"** - Start with a blank board and default lanes

### After Setup
- **Tab Navigation** at the top:
  - **Board** - Kanban-style task management with drag-and-drop
  - **Timeline** - Gantt chart view showing task dependencies
  - **Activity** - Real-time feed of all event activity
  - **Team Chat** - Communication channels for your team

## Features Available

### Board View
- Drag tasks between lanes (Planning → In Progress → Review → Done)
- Add new tasks with the "Add Task" button in each lane
- Click any task card to see full details
- Search and filter tasks
- View WIP limits and lane settings

### Timeline View
- See all tasks on a visual timeline
- Dependencies shown with arrows
- Critical path highlighting
- Today marker and event date indicator
- Week/Month view toggle

### Activity Feed
- Real-time updates of:
  - Task creations/completions
  - Team messages
  - File uploads
  - Registrations
  - Website updates
  - Milestones reached
- Filter by activity type

### Team Chat
- Multiple channels per event
- Real-time messaging
- @Mentions
- Emoji reactions
- Message threading
- File attachments (coming soon)

## Quick Start with Templates

**Recommended for first-time users:**

1. Click "Browse Templates" when you first open the Command Center
2. Select a template that matches your event type:
   - **Championship** - For multi-day major events
   - **Regatta** - For weekend racing events
   - **Social** - For social sailing events
   - **Training** - For training sessions
3. Click "Apply Template"
4. The system will automatically:
   - Create a task board with appropriate lanes
   - Add all template tasks
   - Calculate due dates based on your event date
   - Set up task dependencies

## Creating Your First Task

1. Navigate to the Board view
2. Choose a lane (e.g., "Planning")
3. Click "Add Task" at the bottom of the lane
4. Fill in:
   - Title
   - Description (optional)
   - Due date
   - Priority (Low, Medium, High, Urgent)
   - Assignee
   - Estimated hours (optional)
   - Tags (optional)
5. Click "Create Task"

## Tips for Success

### Organization
- Use **lanes** to represent workflow stages
- Use **tags** to categorize tasks (Marketing, Logistics, Safety, etc.)
- Set **WIP limits** on lanes to prevent overload
- Mark **milestones** for critical deadlines

### Collaboration
- Create **channels** for different teams (Marketing, Race Management, etc.)
- Use **@mentions** to get someone's attention
- Check the **Activity Feed** to stay updated
- Assign tasks to specific team members

### Planning
- Use the **Timeline view** to see the big picture
- Set task **dependencies** to ensure proper ordering
- Monitor the **critical path** for at-risk tasks
- Adjust due dates as needed

## Troubleshooting

### "Command Center button not showing"
- Make sure you're viewing an Event Website dashboard
- Ensure the event has an `event_id` associated with it

### "Board is empty"
- Click "Use Template" to quickly populate with tasks
- Or click "Create Board" to start with default lanes

### "Can't move tasks"
- Check that you have permission to edit tasks
- Ensure you're not exceeding the lane's WIP limit

## Next Steps

Once you're comfortable with the basics:

1. **Customize lanes** - Add/remove lanes to match your workflow
2. **Set up automation** (coming soon) - Auto-assign tasks, send notifications
3. **Create dependencies** - Link related tasks together
4. **Export reports** (coming soon) - Generate progress reports
5. **Save as template** (coming soon) - Save your board for future events

## Need Help?

- Check the full guide: `EVENT_COMMAND_CENTER_GUIDE.md`
- Review the database schema in the migration file
- Examine component code in `src/components/event-command-center/`

## Summary

The Event Command Center replaces the need for:
- ❌ WhatsApp groups for team coordination
- ❌ Trello boards for task tracking
- ❌ Slack channels for team chat
- ❌ Spreadsheets for progress tracking

✅ Everything is now in one integrated platform, linked directly to your event!
