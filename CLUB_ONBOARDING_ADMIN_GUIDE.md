# Club Onboarding & Admin Management System

## Overview

This system enables State Associations to onboard new clubs and assign administrators, with graduated access control through committee positions.

## Access Control Hierarchy

### 1. Superadmin (stephen@b2z.com.au)
- Full access to everything across all organizations
- Can manage all clubs regardless of admin status

### 2. State Association Admins
- **Full Access**: Can view all clubs in their state
- **Write Access**: Can only edit clubs WITHOUT assigned admins
- **Read-Only**: Once a club has an admin, state association has oversight/read-only access
- Can create new clubs and assign admins

### 3. Club Admins
- Full control over their specific club
- Can assign committee positions and manage members
- Can configure club settings and permissions

### 4. Committee Members
- Access based on their position permissions:
  - **Admin**: Full club access
  - **Editor**: Content management (news, media, articles)
  - **Race Officer**: Race and event management
  - **Treasurer**: Full finance management
  - **Finance Viewer**: Read-only finance access
  - **Standard Member**: Basic viewing access

## Key Features

### 1. Multi-Step Club Creation Wizard

State associations can create clubs through a 3-step wizard:

**Step 1: Basic Information**
- Club name (required)
- Abbreviation
- Location

**Step 2: Contact Details**
- Email
- Phone
- Website

**Step 3: Admin Assignment (Optional)**
- Assign an admin to manage the club
- First name, last name, email
- Option to send invitation email
- Can be skipped and done later

### 2. Admin Assignment Tracking

The system tracks:
- Who created each club (`assigned_by_user_id`)
- Who assigned each admin (`club_admin_assignments` table)
- Whether a club has an admin (`has_admin` boolean)
- Onboarding completion status

### 3. Committee Permissions System

Club admins can create committee positions with customizable permissions:

**Available Permissions:**
- **Admin** - Full access to all features
- **Editor** - Manage content (news, media, articles)
- **Race Officer** - Manage races, results, events
- **Treasurer** - Full finance management
- **Finance Viewer** - View-only finance access

**Features:**
- Multiple members can hold the same position
- Multiple permissions can be assigned to one position
- Drag-and-drop reordering of positions
- Visual toggles for easy permission management

## Database Changes

### New Tables

#### `club_admin_assignments`
Tracks admin assignments with audit trail:
```sql
- id (uuid)
- club_id (uuid)
- user_id (uuid)
- assigned_by_user_id (uuid)
- assigned_at (timestamptz)
```

### Modified Tables

#### `clubs`
Added columns:
- `has_admin` (boolean) - Auto-maintained by triggers
- `assigned_by_user_id` (uuid) - Who created the club
- `onboarding_completed` (boolean) - Setup completion status

#### `committee_position_definitions`
Added column:
- `permissions` (jsonb) - Stores permission flags

## Access Control Implementation

### RLS Policies

**State Association - Read Access (Always)**
```sql
-- State associations can view ALL clubs in their state
EXISTS (
  SELECT 1 FROM user_state_associations
  WHERE state_association_id = clubs.state_association_id
  AND user_id = auth.uid()
)
```

**State Association - Write Access (Only clubs without admins)**
```sql
-- Can only edit clubs that don't have admins yet
has_admin = false
AND EXISTS (
  SELECT 1 FROM user_state_associations
  WHERE state_association_id = clubs.state_association_id
  AND user_id = auth.uid()
)
```

**Superadmin - Full Access**
```sql
-- stephen@b2z.com.au has unrestricted access
EXISTS (
  SELECT 1 FROM auth.users
  WHERE id = auth.uid()
  AND email = 'stephen@b2z.com.au'
)
```

### Automatic Admin Tracking

Triggers automatically maintain the `has_admin` flag:

1. **When admin assigned** - Sets `has_admin = true`
2. **When last admin removed** - Sets `has_admin = false`
3. **Records tracking** - Logs in `club_admin_assignments`

## User Flow

### State Association Creating a Club

1. Navigate to Clubs Management page
2. Click "Add Club" button
3. Complete 3-step wizard:
   - Enter basic information
   - Add contact details (optional)
   - Optionally assign an admin with invitation
4. Club appears in clubs list
5. State association maintains full access until admin assigned

### Assigning Club Admin Later

1. State association views club in clubs list
2. Clicks "Manage Admins" (future feature)
3. Selects existing member or invites new user
4. Sends invitation email
5. Once accepted, club admin takes control
6. State association access changes to read-only

### Club Admin Managing Committee

1. Navigate to Settings > Committee Management
2. Go to "Manage Positions" tab
3. Create new position with name and description
4. Toggle permission switches:
   - Enable admin for full access
   - Enable specific permissions as needed
5. Save position
6. Go to "Assign Members" tab
7. Assign members to positions
8. Members automatically receive position permissions

## Component Files

### New Components

- `/src/components/pages/ClubOnboardingWizard.tsx` - Multi-step club creation
- `/src/components/CommitteePositionForm.tsx` - Permission configuration UI

### Modified Components

- `/src/components/pages/ClubsManagementPage.tsx` - Updated to use new wizard
- `/src/components/pages/CommitteeManagement.tsx` - Can be enhanced with new form

## Usage Examples

### Creating a Club with Admin

```typescript
// Step 3 of wizard
{
  assignAdmin: true,
  adminEmail: 'john@club.com',
  adminFirstName: 'John',
  adminLastName: 'Smith',
  sendInvitation: true  // Sends email invitation
}
```

### Defining Committee Position with Permissions

```typescript
{
  position_name: 'Treasurer',
  description: 'Manages club finances and membership fees',
  permissions: {
    admin: false,
    editor: false,
    race_officer: false,
    treasurer: true,        // Full finance access
    finance_viewer: false
  }
}
```

## Security Considerations

1. **Data Integrity**: State associations cannot accidentally modify clubs after admins assigned
2. **Audit Trail**: All admin assignments are logged with who assigned them
3. **Graduated Access**: Permissions cascade from admin → committee → members
4. **Automatic Cleanup**: Triggers ensure data consistency when admins removed

## Future Enhancements

Potential additions:
1. Admin management interface in clubs list (assign/remove admins)
2. Permission inheritance hierarchies
3. Time-limited committee positions
4. Position approval workflows
5. Committee member notifications
6. Role templates (e.g., "Standard Secretary Role")

## Testing the System

1. **As State Association Admin:**
   - Create a new club without admin
   - Verify you can edit it
   - Assign an admin
   - Verify you can no longer edit (read-only)

2. **As Superadmin:**
   - Verify full access to all clubs
   - Can edit clubs with or without admins

3. **As Club Admin:**
   - Create committee positions
   - Toggle permissions
   - Assign members
   - Verify members receive correct access

## Troubleshooting

**Issue**: State association can't create clubs
- Check `user_state_associations` table for correct linking
- Verify state association ID in context

**Issue**: Admin assignment not working
- Check triggers are enabled
- Verify user exists in auth.users
- Check `user_clubs` entry was created

**Issue**: Permissions not applying
- Verify `committee_positions` links to `committee_position_definitions`
- Check permissions JSONB structure
- Ensure member is assigned to position

## Support

For questions or issues with the club onboarding system, refer to:
- Database schema: `supabase/migrations/create_club_onboarding_and_permissions_system.sql`
- UI Components: See file list above
- RLS Policies: Check migration file for policy definitions
