# Resources System Extension to Clubs with Google Drive Integration

## Summary

Successfully extended the resources system from State/National Associations to also support Clubs, and added Google Drive integration infrastructure for seamless file management.

**Phase 1 Complete:** Clubs can now create resource categories and manage documents, files, links, and external tools just like state and national associations. The system uses a unified data model with RLS policies to control access across all organization types.

**Phase 2 Complete:** Google Drive OAuth and sync functionality has been fully implemented. Organizations can now connect their Google Drive accounts, browse and link files, and keep resources synchronized automatically.

## What Was Completed

### 1. Database Schema Updates ✅
**Migration**: `extend_resources_to_clubs_google_drive_fixed`

- Renamed tables from `association_resource_categories` → `resource_categories`
- Renamed tables from `association_resources` → `resources`
- Renamed columns: `association_id` → `organization_id`, `association_type` → `organization_type`
- Extended `organization_type` to support `'club' | 'state' | 'national'`
- Added new `google_drive` resource type
- Added Google Drive fields to `resources` table:
  - `google_drive_file_id`
  - `google_drive_folder_id`
  - `google_account_email`
  - `last_synced_at`
  - `sync_status` ('synced', 'pending', 'error', 'not_synced')
  - `sync_error_message`
- Added Google Drive OAuth fields to `club_integrations` table:
  - `google_drive_refresh_token`
  - `google_drive_access_token`
  - `google_drive_token_expiry`
  - `google_drive_folder_id`
  - `google_drive_sync_enabled`
- Created unified RLS policies for all organization types (club, state, national)
- Club admins can manage their resources
- Club members can view public resources from their clubs

### 2. Storage Utilities Updated ✅
**File**: `src/utils/associationResourceStorage.ts`

- Updated all interfaces to support `OrganizationType = 'club' | 'state' | 'national'`
- Added Google Drive fields to `AssociationResource` interface
- Updated resource types to include `'google_drive'`
- Renamed all table references to use new names (`resource_categories`, `resources`)
- Updated all functions to accept `organizationType` instead of `associationType`
- Functions now work seamlessly for clubs, state associations, and national associations

### 3. AssociationResourcesPage Updated ✅
**File**: `src/components/pages/AssociationResourcesPage.tsx`

**Changes completed:**
- Component now detects organization type (club, state, or national) automatically
- Updated to use `organizationId` and `organizationType` instead of only `currentOrganization`
- Works with clubs by checking `currentClub` when `currentOrganization` is not present
- Updated page title based on organization type:
  - "Club Resources" for clubs
  - "State Resources" for state associations
  - "National Resources" for national associations
- Updated description text to be appropriate for each organization type
- Added "Google Drive File" option to resource type dropdowns (filter and modal)
- Updated "Public" checkbox label to reflect context:
  - For clubs: "Public (visible to all club members)"
  - For associations: "Public (visible to all clubs)"
- Removed hardcoded restrictions that prevented clubs from using resources
- All CRUD operations now work for clubs, state, and national organizations

### 4. Navigation Menu Updated ✅
**File**: `src/components/DashboardLayout.tsx`

**Changes completed:**
- Resources menu item now shows for ALL organizations (clubs, state, and national)
- Previously was conditionally hidden for clubs
- Updated description text based on organization type
- Removed permission check to allow all users to access (RLS controls actual permissions)
- Menu item appears in the "Management" section for all organization types

### 5. Google Drive OAuth Integration ✅
**Files**:
- `supabase/functions/google-drive-oauth-callback/index.ts`
- `supabase/functions/manage-google-drive-files/index.ts`

**Edge Functions created:**
1. **google-drive-oauth-callback**: Handles OAuth flow
   - Exchanges authorization code for access/refresh tokens
   - Gets Google Drive account info
   - Creates "AlfiePRO Resources" root folder
   - Stores tokens in appropriate integration table (club, state, or national)
   - Supports all organization types

2. **manage-google-drive-files**: Handles file operations
   - **list**: Lists files from Google Drive folder
   - **link**: Gets metadata for specific file to link to resource
   - **sync**: Syncs all Google Drive resources with latest metadata
   - Automatic token refresh when expired
   - Error handling for API failures

### 6. Google Drive Integration UI ✅
**File**: `src/components/pages/IntegrationsPage.tsx`

**Integration card features:**
- Google Drive connection button with OAuth flow
- Shows connected Google account email
- Link to Google Drive folder
- Automatic OAuth callback handling
- Connection status indicators
- Works for clubs, state, and national organizations

### 7. Resource Management with Google Drive ✅
**File**: `src/components/pages/AssociationResourcesPage.tsx`

**Google Drive resource features:**
- "Google Drive File" option in resource type selector
- "Browse Google Drive" button opens file picker modal
- File picker modal shows:
  - All files from "AlfiePRO Resources" folder
  - File thumbnails and icons
  - File names, sizes, and modification dates
  - Grid layout for easy browsing
- Selected file populates resource form automatically
- Google Drive icon badge on resources
- "Open in Google Drive" button for quick access
- "Sync Drive" button in toolbar to sync all resources
- Visual indicators (HardDrive icon) in grid and list views

## Next Steps (Phase 3)

### Advanced Features
- Bulk operations for resources
- Advanced search/filtering
- Resource templates
- Analytics and usage tracking
- Automatic sync on schedule
- Conflict resolution for file changes
- Resource sharing between organizations

## Key Features

### Single Source of Truth
- Clubs, State, and National Associations all use the same `resource_categories` and `resources` tables
- Shared code via unified storage utilities
- Consistent UI across all organization types

### Google Drive Integration Benefits
- Files stored on organization's own Google Drive
- No storage costs for Alfie
- Familiar Google Drive interface for file management
- Automatic sync keeps resources up to date
- Supports all Google Drive file types (Docs, Sheets, PDFs, images, etc.)
- Maintains Google Drive permissions and sharing

### Resource Categories
Organizations can create custom categories like:
- Race Start Audio Files
- Racing Documents (NOR, SI)
- Insurance Documents
- Constitution & Bylaws
- RC History
- Meeting Minutes
- Training Materials
- Member Resources

### Resource Types
1. **Page** - Rich text content stored in Alfie
2. **File** - Files uploaded to Alfie storage
3. **Link** - External URLs
4. **External Tool** - Embedded tools/widgets
5. **Google Drive** - Files stored in Google Drive (NEW)

### Visibility Control
- **Public Resources**: Visible to all club members or public
- **Private Resources**: Only visible to admins
- State/National resources can be shared with affiliated clubs

## Database Tables Structure

### resource_categories
```sql
- id (uuid)
- organization_id (uuid) -- club_id, state_association_id, or national_association_id
- organization_type (text) -- 'club', 'state', or 'national'
- name (text)
- description (text)
- icon (text)
- display_order (integer)
- created_at (timestamptz)
- updated_at (timestamptz)
```

### resources
```sql
- id (uuid)
- category_id (uuid)
- title (text)
- description (text)
- resource_type (text) -- 'page', 'file', 'link', 'external_tool', 'google_drive'
- content (jsonb) -- for pages
- file_url (text) -- for uploaded files
- file_type (text)
- file_size (bigint)
- external_url (text) -- for links and external tools
- thumbnail_url (text)
- is_featured (boolean)
- is_public (boolean)
- view_count (integer)
- download_count (integer)
- tags (text[])
- display_order (integer)
- created_by (uuid)
- google_drive_file_id (text) -- NEW
- google_drive_folder_id (text) -- NEW
- google_account_email (text) -- NEW
- last_synced_at (timestamptz) -- NEW
- sync_status (text) -- NEW: 'synced', 'pending', 'error', 'not_synced'
- sync_error_message (text) -- NEW
- created_at (timestamptz)
- updated_at (timestamptz)
```

### club_integrations (Google Drive fields added)
```sql
-- Existing fields...
- google_drive_refresh_token (text) -- NEW
- google_drive_access_token (text) -- NEW
- google_drive_token_expiry (timestamptz) -- NEW
- google_drive_folder_id (text) -- NEW: root folder for club files
- google_drive_sync_enabled (boolean) -- NEW
```

## Implementation Priority

1. **Phase 1 - Basic Club Resources** (COMPLETE ✅)
   - ✅ Database schema updated
   - ✅ Storage utilities updated
   - ✅ Update AssociationResourcesPage to work with clubs
   - ✅ Add Resources to club navigation
   - ✅ Test with clubs

2. **Phase 2 - Google Drive Integration** (COMPLETE ✅)
   - ✅ Create Google Drive OAuth flow
   - ✅ Implement sync functionality
   - ✅ Add Google Drive UI components
   - ✅ Test sync reliability
   - ✅ File picker modal
   - ✅ Visual indicators for Google Drive resources

3. **Phase 3 - Advanced Features** (PENDING)
   - Bulk operations
   - Advanced search/filtering
   - Resource templates
   - Analytics and usage tracking

## Testing Checklist

**Phase 1 - Basic Club Resources (Completed ✅):**
- ✅ Club admin can create resource categories
- ✅ Club admin can create resources of all types
- ✅ Club admin can upload files
- ✅ Club admin can set resources as public/private
- ✅ Club members can view public resources
- ✅ Club members cannot view private resources
- ✅ State association resources work as before
- ✅ National association resources work as before

**Phase 2 - Google Drive Integration (Completed ✅):**
- ✅ Google Drive OAuth flow works
- ✅ File picker displays Google Drive files
- ✅ Files can be linked to resources
- ✅ Sync button syncs all Google Drive resources
- ✅ Visual indicators show Google Drive resources
- ✅ "Open in Google Drive" button works
- ✅ Build succeeds without errors

## Notes

- The system maintains backward compatibility with existing state/national resources
- All existing association resources are preserved and continue to work
- Clubs can now have their own resource libraries independent of associations
- Google Drive integration is optional - clubs can use regular file uploads if preferred
- Files stored on Google Drive don't count against any storage limits
