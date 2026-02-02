# Communications System - Usage Guide

This directory contains all the components and utilities for the enhanced communications system.

## 📁 File Structure

```
communications/
├── README.md                    # This file
├── types.ts                     # TypeScript type definitions
├── utils.ts                     # 40+ utility functions
├── RichTextEditor.tsx           # TipTap-based rich text editor
├── useRealtime.ts               # Real-time updates hook
└── useKeyboardShortcuts.tsx     # Keyboard shortcuts system
```

## 🚀 Quick Start

### 1. Basic Integration

```typescript
import { RichTextEditor } from './communications/RichTextEditor';
import { useRealtime } from './communications/useRealtime';
import { useKeyboardShortcuts } from './communications/useKeyboardShortcuts';
import * as commsUtils from './communications/utils';
```

### 2. Enable Real-time Updates

```typescript
useRealtime({
  userId: user.id,
  clubId: currentClub.clubId,
  onNewNotification: (notif) => setNotifications(prev => [notif, ...prev]),
  onNotificationUpdated: (notif) => updateNotification(notif),
  onNotificationDeleted: (id) => removeNotification(id),
  desktopNotifications: true,
  soundEnabled: true
});
```

### 3. Add Rich Text Editing

```typescript
<RichTextEditor
  content={body}
  onChange={setBody}
  placeholder="Write your message..."
  darkMode={darkMode}
/>
```

### 4. Add Keyboard Shortcuts

```typescript
useKeyboardShortcuts({
  onCompose: () => setActiveTab('compose'),
  onReply: () => handleReply(),
  onDelete: () => handleDelete(),
  onStar: () => handleStar(),
  onShowHelp: () => setShowHelp(true)
});
```

## 🔧 Utility Functions

### Draft Management

```typescript
// Auto-save draft
await commsUtils.saveDraft(draftData);

// Delete draft
await commsUtils.deleteDraft(draftId);
```

### Message Organization

```typescript
// Star/unstar
await commsUtils.toggleStar(notificationId, isStarred);

// Archive/unarchive
await commsUtils.toggleArchive(notificationId, isArchived);

// Add label
await commsUtils.addLabel(notificationId, 'Important');

// Remove label
await commsUtils.removeLabel(notificationId, 'Important');
```

### Reactions

```typescript
// Add reaction
await commsUtils.addReaction(notificationId, userId, '👍');

// Remove reaction
await commsUtils.removeReaction(reactionId);

// Get all reactions
const reactions = await commsUtils.getReactions(notificationId);
```

### Read Tracking

```typescript
// Mark as read with timestamp
await commsUtils.markAsRead(notificationId, userId);

// Mark as opened (for analytics)
await commsUtils.markAsOpened(notificationId);
```

### Bulk Actions

```typescript
// Mark multiple as read
await commsUtils.bulkMarkAsRead(notificationIds, userId);

// Delete multiple
await commsUtils.bulkDelete(notificationIds);

// Archive multiple
await commsUtils.bulkArchive(notificationIds);
```

### Search & Threading

```typescript
// Full-text search
const results = await commsUtils.searchNotifications(query, clubId, userId);

// Get thread messages
const thread = await commsUtils.getThreadMessages(threadId);
```

### Attachments

```typescript
// Upload file
const attachment = await commsUtils.uploadAttachment(file, notificationId, userId);

// Get public URL
const url = await commsUtils.getAttachmentUrl(attachment.file_path);
```

### Mentions

```typescript
// Extract @mentions from text
const mentionedUserIds = commsUtils.extractMentions(text);

// Render mentions with styling
const htmlWithMentions = commsUtils.renderMentions(text);
```

### Desktop Notifications

```typescript
// Request permission
const hasPermission = await commsUtils.requestNotificationPermission();

// Show notification
commsUtils.showDesktopNotification('New Message', {
  body: 'You have a new message from John',
  icon: '/avatar.jpg'
});
```

### Utilities

```typescript
// Format date for display
const formattedDate = commsUtils.formatMessageDate(notification.sent_at);
// Output: "Just now", "5m ago", "10:30 AM", "Mon, Dec 18", etc.

// Check if in quiet hours
const isQuiet = commsUtils.isInQuietHours(userPreferences);
```

## 🎹 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `C` | Compose new message |
| `R` | Reply to selected message |
| `S` | Star/unstar selected message |
| `E` | Archive selected message |
| `Delete` | Delete selected message |
| `↓` or `J` | Select next message |
| `↑` or `K` | Select previous message |
| `Enter` | Open selected message |
| `/` | Focus search bar |
| `Esc` | Close dialog |
| `?` | Show keyboard shortcuts help |

## 📝 Type Definitions

All types are available in `types.ts`:

- `Notification` - Enhanced notification object
- `NotificationAttachment` - File attachment
- `NotificationReaction` - Emoji reaction
- `NotificationDraft` - Message draft
- `NotificationTemplate` - Message template
- `RecipientGroup` - Member group
- `UserNotificationPreferences` - User settings
- `Member` - Club member with avatar

## 🔄 Real-time Events

The `useRealtime` hook provides three callbacks:

```typescript
onNewNotification: (notification: Notification) => void;
onNotificationUpdated: (notification: Notification) => void;
onNotificationDeleted: (id: string) => void;
```

These fire instantly when:
- A new message arrives
- A message is updated (read, starred, etc.)
- A message is deleted

## 🎨 Rich Text Editor Features

The editor supports:
- ✅ Bold and italic formatting
- ✅ Bullet and numbered lists
- ✅ Link insertion
- ✅ Emoji picker integration (optional)
- ✅ Placeholder text
- ✅ Dark mode styling
- ✅ Keyboard shortcuts (Ctrl+B, Ctrl+I)

## 🔒 Security Notes

- All database operations respect RLS policies
- Users can only access their own notifications
- File uploads are validated for size and type
- Desktop notifications require user permission
- XSS protection via content sanitization

## 📊 Performance Tips

1. **Pagination**: Load messages in batches
2. **Virtual scrolling**: Use for large message lists
3. **Debouncing**: Auto-save drafts after 2-3 seconds
4. **Lazy loading**: Load attachments on demand
5. **Caching**: Cache frequently accessed data

## 🧪 Example Integration

See `COMMUNICATIONS_IMPLEMENTATION_COMPLETE.md` for a complete integration guide with step-by-step instructions.

## 🆘 Support

For issues or questions:
1. Check the comprehensive documentation files
2. Review the type definitions in `types.ts`
3. Examine utility function implementations in `utils.ts`
4. Test with the provided examples

## 🎉 Features Available

- ✅ Real-time message delivery
- ✅ Rich text formatting
- ✅ File attachments
- ✅ Message threading
- ✅ Emoji reactions
- ✅ Draft auto-save
- ✅ Message templates
- ✅ Scheduled sending
- ✅ Full-text search
- ✅ Recipient groups
- ✅ Bulk actions
- ✅ Star/Archive/Labels
- ✅ Read receipts
- ✅ Desktop notifications
- ✅ Keyboard shortcuts
- ✅ @Mentions
- ✅ User preferences

All features are production-ready and fully functional!
