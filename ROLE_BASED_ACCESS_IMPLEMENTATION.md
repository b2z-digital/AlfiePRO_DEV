# Role-Based Access Control Implementation

## Summary

I've implemented a comprehensive role-based access control system for Alfie PRO. This system distinguishes between three roles:
- **Admin**: Full access to all features
- **Editor**: Can manage most features but may have some restrictions
- **Member**: View-only access with limited management capabilities

## What Was Completed

### 1. Profile Name Fix ✅
- Created migration to populate profile from member data on signup
- File: `supabase/migrations/20251014020000_populate_profile_from_member_data.sql`
- When Hope Walsh (or any member) signs up, their profile will now show their actual name instead of "John Doe"

### 2. Permissions Hook ✅
- Created `src/hooks/usePermissions.ts`
- Provides `can()`, `cannot()`, `isMember`, `isEditor`, `isAdmin` helpers
- Defines 25 granular permissions for different features

### 3. Navigation Filtering ✅
- Updated `src/components/DashboardLayout.tsx` to filter menu items by role
- Members will NOT see:
  - Race Management (hidden)
  - Finances (hidden)
  - Website (hidden)
- Members WILL see "My Membership" instead of "Club Membership"

## What Needs To Be Done Next

### Apply the Database Migration

**Run this SQL in your Supabase SQL Editor:**

```sql
/*
  # Populate Profile from Member Data on Signup

  When a member accepts an invitation and signs up, their profile should be
  populated with their name from the members table, not default to "John Doe".

  ## Changes
  1. Update the auth trigger to check for linked member data
  2. If member exists with matching email/user_id, use their first_name and last_name
  3. Otherwise fall back to user_metadata or defaults
*/

-- Drop existing trigger and function to recreate
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user_profile();

-- Create improved function that pulls name from member data
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_member record;
BEGIN
  RAISE LOG 'handle_new_user_profile: Creating profile for user %', NEW.id;

  -- Try to find a member record linked to this user (by user_id or email)
  SELECT first_name, last_name INTO v_member
  FROM members
  WHERE user_id = NEW.id OR LOWER(email) = LOWER(NEW.email)
  LIMIT 1;

  -- Insert profile with member data if found, otherwise use metadata or defaults
  BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, created_at, updated_at)
    VALUES (
      NEW.id,
      COALESCE(
        v_member.first_name,
        NEW.raw_user_meta_data->>'first_name',
        'John'
      ),
      COALESCE(
        v_member.last_name,
        NEW.raw_user_meta_data->>'last_name',
        'Doe'
      ),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      first_name = COALESCE(
        v_member.first_name,
        EXCLUDED.first_name,
        profiles.first_name
      ),
      last_name = COALESCE(
        v_member.last_name,
        EXCLUDED.last_name,
        profiles.last_name
      ),
      updated_at = now();

    IF v_member.first_name IS NOT NULL THEN
      RAISE LOG 'handle_new_user_profile: Profile created with member data: % %',
        v_member.first_name, v_member.last_name;
    ELSE
      RAISE LOG 'handle_new_user_profile: Profile created with metadata/defaults';
    END IF;

  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_user_profile: Error creating profile: % (SQLSTATE %)',
        SQLERRM, SQLSTATE;
      RAISE;
  END;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_profile();

COMMENT ON FUNCTION handle_new_user_profile IS
'Creates a profile for new users, pulling name from linked member record if available';
```

###  Add Permission Checks to Individual Pages

The following files need to be updated to hide/disable features for members:

#### 1. RaceCalendar.tsx
- Import `usePermissions` hook
- Hide "Start Scoring" button if `cannot('races.score')`

#### 2. ResultsPage.tsx
- Hide "Create Race Report" button if `cannot('reports.create')`

#### 3. VenuesPage.tsx
- Hide "+ Add Venue" button if `cannot('venues.create')`

#### 4. NewsPage.tsx
- Hide "+ New Article" button if `cannot('articles.create')`

#### 5. MembershipDashboard.tsx
- Create two different views:
  - **For members**: Show only their own membership details, boats, payment history
  - **For admins/editors**: Show full membership management

#### 6. MeetingsPage.tsx
- Hide "Create a New Meeting" button if `cannot('meetings.create')`
- Disable editing features for members

#### 7. TasksPage.tsx
- Hide "+ New Task" button if `cannot('tasks.create')`
- Filter tasks to show only assigned tasks for members

#### 8. SettingsPage.tsx
- Hide tabs based on permissions:
  - Team Management: `cannot('settings.team')`
  - Subscriptions: `cannot('settings.subscriptions')`
  - Integrations: `cannot('settings.integrations')`
  - Finance: `cannot('settings.finance')`
  - Race Documents: `cannot('settings.documents')`
  - Import/Export: `cannot('settings.import')`

### Example Implementation Pattern

```typescript
import { usePermissions } from '../hooks/usePermissions';

export const SomePage = () => {
  const { can, isMember } = usePermissions();

  return (
    <div>
      {/* Conditional rendering */}
      {can('venues.create') && (
        <button>+ Add Venue</button>
      )}

      {/* Different views for members vs admins */}
      {isMember ? (
        <MemberView />
      ) : (
        <AdminView />
      )}
    </div>
  );
};
```

## Testing Instructions

1. **Test with Hope Walsh's account** (member role):
   - Log in with the account created through invitation
   - Verify navigation menu hides Race Management, Finances, Website
   - Verify "My Membership" appears instead of "Club Membership"
   - Try to access restricted pages directly via URL - should redirect or show limited view

2. **Test with an admin account**:
   - Verify all features are still accessible
   - No changes to admin experience

3. **Test permission boundaries**:
   - Members should be able to VIEW but not CREATE/EDIT
   - Members should only see their own data in membership section
   - Members should only see tasks assigned to them

## Database Role Field

The `user_clubs` table already has a `role` field with these possible values:
- `'admin'` - Full club access
- `'editor'` - Most features, some restrictions possible
- `'member'` - Limited, view-only access
- `'super_admin'` - System-wide access

The `accept_invitation` function automatically assigns the `'member'` role when someone accepts an invitation.

## Next Steps

1. Apply the SQL migration above
2. Update the 8 pages listed above with permission checks
3. Test thoroughly with a member account
4. Adjust permissions as needed based on feedback

Let me know which pages you'd like me to update first!
