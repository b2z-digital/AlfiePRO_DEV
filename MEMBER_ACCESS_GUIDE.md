# Member Access & User Management Guide

## Overview

Alfie PRO now supports a dual-flow system for member onboarding:

1. **Admin-Initiated Invitations**: Admins invite existing members to join the platform
2. **Self-Registration**: Users can register and apply for membership

## System Architecture

### Database Tables

#### `members`
- Club membership records (name, email, boats, membership status)
- Optional `user_id` field links to authenticated users
- Not all members need platform access

#### `member_invitations`
- Tracks invitation tokens sent to members
- 7-day expiry
- Statuses: pending, accepted, expired, cancelled

#### `membership_applications`
- Self-registration applications from users
- Requires admin approval/rejection
- Automatically links to existing member records by email

### Key Functions

- `link_user_to_member()` - Links auth users to existing member records
- `accept_invitation()` - Processes invitation acceptance
- `approve_membership_application()` - Creates/links member on approval
- `reject_membership_application()` - Rejects application with optional reason

## Flow 1: Admin Invites Member

### Process
1. Admin adds member to club (Members page)
2. Admin clicks "Invite to Platform" button next to member
3. System:
   - Creates invitation record with secure token
   - Sends email with invitation link: `/invite/{token}`
   - Invitation expires in 7 days
4. Member clicks link → Taken to signup page
5. Member creates account with pre-filled email
6. On signup:
   - Creates auth.users account
   - Links `members.user_id` to auth user
   - Creates `user_clubs` entry
   - Marks invitation as accepted

### Implementation

```typescript
// Send invitation (in Members page component)
import { sendMemberInvitation } from '../utils/memberInvitations';

const handleInviteMember = async (memberId: string) => {
  const result = await sendMemberInvitation(memberId, clubId);
  if (result.success) {
    alert('Invitation sent!');
  } else {
    alert(result.error);
  }
};
```

## Flow 2: Self-Registration

### Process
1. User goes to `/register` and creates account
2. System recognizes they don't belong to any club
3. User fills out membership application form:
   - Selects club to join
   - Provides contact info
   - Optional message to admins
4. Application created with status: "pending"
5. Admin reviews in Members section → "Pending Applications" panel
6. Admin can:
   - **Approve**: Creates member record (or links existing) + grants access
   - **Reject**: Declines with optional reason
7. On approval:
   - If member with same email exists → link to that record
   - Otherwise → create new member record
   - Link user to member
   - Create `user_clubs` entry

### Implementation

```typescript
// Show pending applications (add to Members page)
import { MembershipApplicationsPanel } from '../components/MembershipApplicationsPanel';

<MembershipApplicationsPanel
  clubId={currentClub.clubId}
  darkMode={darkMode}
  onApplicationProcessed={() => {
    // Refresh member list
    fetchMembers();
  }}
/>
```

## Email Matching & Auto-Linking

The system intelligently matches users to existing member records:

### When Invitation is Accepted
- Pre-filled with member's email from the invitation
- Automatically links to the specific member record

### When Self-Registration is Approved
1. System searches for existing member with same email in the club
2. **If found**: Links the auth user to existing member record
3. **If not found**: Creates new member record with application data

This prevents duplicate member records and maintains data integrity.

## User Interface Components

### For Admins

#### Members Page Additions
1. **Invite Button**: Next to each member without `user_id`
   - Shows "Invite to Platform" button
   - Disabled if member already has platform access
   - Displays invitation status (pending, accepted, expired)

2. **Pending Applications Panel**:
   - Shows at top of Members page when applications exist
   - Badge count of pending applications
   - Quick approve/reject actions
   - View applicant details and message

#### Application Review Card
```
┌─────────────────────────────────────────┐
│ John Smith                    [Pending] │
│ ✉ john@example.com                      │
│ 📱 +1234567890                          │
│ 📅 Applied 2 days ago                   │
│                                         │
│ Message: "Been sailing 5 years..."     │
│                                         │
│ [✓ Approve]  [✗ Reject]                │
└─────────────────────────────────────────┘
```

### For Members

#### Invitation Signup Page (`/invite/{token}`)
- Logo and club branding
- Pre-filled email (readonly)
- Welcome message with member name
- Password creation (6+ characters)
- Password confirmation
- Auto-validates token and expiry
- Shows error for invalid/expired invitations

#### Registration Flow
1. Standard `/register` page
2. After signup → Shows "Apply for Membership" option
3. Application form:
   - Select club from list
   - Contact details
   - Optional message to admins
4. Confirmation: "Your application has been submitted"
5. Email notification when reviewed

## Integration with Existing Code

### Members Page
Add these imports and components to your Members page:

```typescript
import { sendMemberInvitation } from '../utils/memberInvitations';
import { MembershipApplicationsPanel } from '../components/MembershipApplicationsPanel';

// Add this panel above or below the members list
<MembershipApplicationsPanel
  clubId={currentClub.clubId}
  darkMode={darkMode}
  onApplicationProcessed={fetchMembers}
/>

// For each member in your list, add invite button
{!member.user_id && (
  <button
    onClick={() => handleInviteMember(member.id)}
    className="btn-primary"
  >
    Invite to Platform
  </button>
)}
```

### Register Page
After successful registration, check if user belongs to any club:

```typescript
const { data: userClubs } = await supabase
  .from('user_clubs')
  .select('*')
  .eq('user_id', user.id);

if (!userClubs || userClubs.length === 0) {
  // Redirect to club selection/application
  navigate('/apply-membership');
}
```

## Security Considerations

✅ **Invitation tokens**:
- Secure random 32-byte tokens
- One-time use only
- 7-day expiration
- Cannot be reused after acceptance

✅ **Row Level Security**:
- Members can only view their own data
- Admins can manage their club's invitations
- Public can validate invitation tokens (read-only)

✅ **Email verification**:
- Invitations use verified member emails from club records
- Self-registrations require email confirmation via Supabase Auth

✅ **Authorization**:
- Only club admins can approve/reject applications
- Only club admins can send invitations
- Proper role-based access via `user_clubs` table

## Benefits

### For Clubs
- ✅ Control who has platform access
- ✅ Maintain accurate membership records
- ✅ No duplicate member accounts
- ✅ Clear audit trail of invitations/applications
- ✅ Optional platform access (not all members need it)

### For Members
- ✅ Easy invitation-based signup
- ✅ Can self-register and apply
- ✅ Single account across multiple clubs
- ✅ Secure password-based access
- ✅ Linked to existing membership records

## Future Enhancements

Potential additions:
- Bulk invitation sending
- Invitation reminders
- Custom invitation email templates
- Application approval workflows
- Member role assignments during approval
- Integration with membership payment systems
