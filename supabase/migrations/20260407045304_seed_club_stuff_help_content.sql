/*
  # Seed Club Stuff Help and Support Content

  ## Summary
  Inserts comprehensive Club Stuff documentation into support_faqs
  for the existing "Club Stuff" FAQ category.

  ## Coverage
  - Club Membership overview and member management
  - Adding and editing members
  - Importing and exporting members
  - Member invitations and activation
  - Membership applications
  - Membership renewals
  - Member filtering and search
  - Committee management
  - Club remittances
  - Meetings overview
  - Creating and managing meetings
  - Meeting attendance
  - Meeting minutes
  - Meeting agenda and action items
  - Tasks overview
  - Creating and managing tasks
  - Task categories and filtering
  - Finances overview
  - Recording transactions
  - Creating and sending invoices
  - Budget management
  - Financial reports
  - Documents overview
  - Creating forms
  - Creating document templates

  ## Notes
  - All FAQs are published (is_published = true)
  - Uses plain language step-by-step instructions
  - Category ID references existing "Club Stuff" category
*/

-- ============================================================
-- CLUB MEMBERSHIP FAQs
-- ============================================================

-- FAQ 1: Club Membership Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Club Membership section?',
  'The Club Membership section is where you manage everything related to your club members. From here you can view all your members, add new ones, track their membership status, handle applications, manage renewals, and oversee your committee.

To access Club Membership:

1. Click on Club Stuff in the left menu
2. Click on Club Membership

You will see a dashboard with key membership statistics at the top, including total members, active members, pending renewals, and new members this month. Below the stats you will find tabs for Members, Applications, Renewals, Remittances, and Committee.',
  1,
  true,
  'membership',
  ARRAY['membership', 'overview', 'club stuff', 'members', 'getting started']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 2: Viewing and Searching Members
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000002',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I view and search for members?',
  'To view and search your club members:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab

You will see a list of all your club members. To find a specific member:

1. Use the search bar at the top of the members list
2. Type the member name, email address, or phone number
3. The list will filter automatically as you type

You can also filter members by their status using the status buttons at the top of the list. Choose from All, Active, Expired, or Cancelled to see only members with that status.

To filter by boat class, click the boat class filter dropdown and select the class you want to view.

For more advanced filtering, click the filter icon to open the Advanced Filter panel. Here you can combine multiple filters such as membership type, payment status, boat class, and more. You can also save your filter combinations for quick access later.',
  2,
  true,
  'membership',
  ARRAY['members', 'search', 'filter', 'view members', 'find member']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 3: Adding a New Member
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000003',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I add a new member to my club?',
  'To add a new member manually:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Click the Add Member button in the top right corner
5. Fill in the member details including:
   - First name and last name
   - Email address
   - Phone number (optional)
   - Membership type (for example Full, Associate, Junior)
   - Boat class (optional)
   - Sail number (optional)
6. Click Save to add the member

The new member will appear in your members list straight away. If you want to send them an invitation to create their own account, you can do that separately using the invitation feature.',
  3,
  true,
  'membership',
  ARRAY['add member', 'new member', 'create member', 'manual entry']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 4: Editing a Member
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000004',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I edit a member''s details?',
  'To edit an existing member:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Find the member you want to edit in the list
5. Click on the member row to open their details
6. Click the Edit button
7. Update any fields you need to change such as name, email, phone, membership type, boat class, or sail number
8. Click Save to apply your changes

You can also change a member''s membership status, payment status, and other details from this edit screen.',
  4,
  true,
  'membership',
  ARRAY['edit member', 'update member', 'change details', 'modify member']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 5: Importing Members
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000005',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I import members from a spreadsheet?',
  'You can bulk import members from a CSV file. This is useful when setting up your club for the first time or adding many members at once.

To import members:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Click the Import/Export button (or the three dot menu)
5. Select Import Members
6. Download the template CSV file if you need the correct format
7. Prepare your CSV file with columns for first name, last name, email, phone, membership type, boat class, and sail number
8. Click Choose File and select your CSV file
9. The system will show you a preview of the data to be imported
10. Check that the columns are mapped correctly
11. Click Import to add all the members

Any members with email addresses that already exist in your club will be skipped to avoid duplicates.',
  5,
  true,
  'membership',
  ARRAY['import', 'csv', 'bulk import', 'spreadsheet', 'upload members']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 6: Exporting Members
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000006',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I export my member list?',
  'To export your members to a spreadsheet:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Click the Import/Export button
5. Select Export Members
6. A CSV file will be downloaded to your computer containing all your member data

You can open this file in Excel, Google Sheets, or any spreadsheet application. The export includes all member details such as name, email, phone, membership type, status, boat class, and sail number.',
  6,
  true,
  'membership',
  ARRAY['export', 'csv', 'download', 'spreadsheet', 'member list']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 7: Sending Member Invitations
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000007',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I invite members to create their own account?',
  'You can send email invitations to members so they can create their own login and access the club platform.

To send an invitation:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Find the member you want to invite
5. Click on the member to open their details
6. Click Send Invitation
7. The system will send an email to the member with a link to set up their account

You can also send invitations in bulk by selecting multiple members and using the bulk actions menu.

Once a member accepts their invitation and creates an account, their profile will be automatically linked to their member record in your club.',
  7,
  true,
  'membership',
  ARRAY['invitation', 'invite', 'send invite', 'member account', 'activation']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 8: Activating Members
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000008',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I activate member accounts?',
  'Member activation sends an email to members allowing them to set up their password and log into the platform.

To activate members:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Select the members you want to activate by clicking the checkbox next to their name
5. Click the Activate button that appears in the bulk actions bar
6. Confirm the activation

Each selected member will receive an email with instructions to set up their account. You can also activate a single member from their member details screen.',
  8,
  true,
  'membership',
  ARRAY['activate', 'activation', 'member account', 'set password', 'bulk activate']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 9: Archiving Members
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000009',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I archive or remove a member?',
  'If a member has left your club or you need to remove them from your active list, you can archive them.

To archive a member:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Find the member you want to archive
5. Click on the member to open their details
6. Click the Archive button
7. Confirm that you want to archive this member

Archived members are removed from your active members list but their data is kept safely in case you need to restore them later. This is different from deleting, which permanently removes the member.',
  9,
  true,
  'membership',
  ARRAY['archive', 'remove member', 'delete member', 'deactivate']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 10: Membership Applications
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000010',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I manage membership applications?',
  'When someone applies to join your club through the online application form, their application will appear in the Applications tab.

To review and manage applications:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Applications tab
4. You will see a list of pending applications
5. Click on an application to view the full details including the applicant''s name, contact information, membership type requested, and any boats they have registered
6. To approve the application, click Approve. The applicant will be added as a member of your club
7. To reject the application, click Reject

When you approve an application, the applicant will receive an email notification letting them know they have been accepted into the club.',
  10,
  true,
  'membership',
  ARRAY['applications', 'approve', 'reject', 'new members', 'join club']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 11: Membership Renewals
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000011',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I track and manage membership renewals?',
  'The Renewals tab shows you which members have memberships that are expiring soon or have already expired.

To manage renewals:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Renewals tab
4. You will see a list of members whose memberships are due for renewal
5. The list shows each member''s name, membership type, expiry date, and current status
6. You can send renewal reminders to members by selecting them and clicking Send Reminder

Members can also renew their membership online through the platform if you have online payments set up. Their renewal status will update automatically when they complete the process.',
  11,
  true,
  'membership',
  ARRAY['renewals', 'expiring', 'renewal reminders', 'membership expiry']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 12: Club Remittances
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000012',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do remittances work?',
  'Remittances track the fees that your club owes to your state or national association for each member. When a member pays their club membership, a portion may need to be forwarded to the association.

To view and manage remittances:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Remittances tab
4. You will see a summary of what your club owes to your association
5. Each member''s remittance amount is shown along with their payment status
6. To record a payment to your association, click Record Payment
7. Enter the payment details including the amount and payment method
8. Click Save to record the payment

The remittance amounts are calculated automatically based on the fee structure set by your association.',
  12,
  true,
  'membership',
  ARRAY['remittances', 'association fees', 'state fees', 'payments', 'reconciliation']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 13: Committee Management
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000013',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I manage the club committee?',
  'The Committee tab lets you set up and manage your club''s committee positions and assign members to those roles.

To manage your committee:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Committee tab
4. You will see the current committee positions and who holds each role

To add a new committee position:
1. Click Add Position
2. Enter the position title (for example Commodore, Vice Commodore, Secretary, Treasurer)
3. Select a member to assign to that position
4. Set the access level for this role if needed
5. Click Save

To change who holds a position, click on the position and select a different member. You can also set whether each committee position should be displayed on your club''s public website.',
  13,
  true,
  'membership',
  ARRAY['committee', 'positions', 'roles', 'commodore', 'secretary', 'treasurer']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 14: Map View
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000014',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I view members on a map?',
  'You can see where your members are located geographically using the Map View.

To use the map view:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Click the Map View toggle button near the top of the page
5. The view will switch from a list to an interactive map showing member locations

You can zoom in and out of the map and click on individual markers to see member details. Click the List View toggle to switch back to the normal member list.',
  14,
  true,
  'membership',
  ARRAY['map', 'map view', 'locations', 'geographic', 'where members live']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MEETINGS FAQs
-- ============================================================

-- FAQ 15: Meetings Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000015',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Meetings section?',
  'The Meetings section lets you schedule, manage, and keep records of your club meetings. You can track attendance, record meeting minutes, manage agenda items, and create action items that flow into your tasks.

To access Meetings:

1. Click on Club Stuff in the left menu
2. Click on Meetings

You will see two views: Upcoming Meetings showing all future scheduled meetings, and Past Meetings showing meetings that have already taken place grouped by month.',
  15,
  true,
  'meetings',
  ARRAY['meetings', 'overview', 'club stuff', 'getting started']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 16: Creating a Meeting
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000016',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I create a new meeting?',
  'To schedule a new meeting:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Click the New Meeting button
4. Fill in the meeting details:
   - Meeting name (for example Monthly Committee Meeting)
   - Date and time
   - Location (where the meeting will be held)
   - Category (choose Committee or General)
   - Description (optional notes about the meeting)
   - Recurrence (if this meeting repeats regularly)
5. Click Save to create the meeting

The meeting will appear in your Upcoming Meetings list and will also show on the club calendar.',
  16,
  true,
  'meetings',
  ARRAY['create meeting', 'new meeting', 'schedule meeting', 'add meeting']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 17: Meeting Attendance
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000017',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I track meeting attendance?',
  'You can record who attended each meeting for your club records.

To manage attendance:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Click on the meeting you want to track attendance for
4. In the meeting details view, you will see an attendance section
5. Mark each member as Present, Absent, or Apology
6. The attendance is saved automatically

You can also send meeting invitations to members beforehand so they can RSVP. Their responses will show up in the attendance section.',
  17,
  true,
  'meetings',
  ARRAY['attendance', 'present', 'absent', 'apology', 'rsvp', 'who attended']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 18: Meeting Minutes
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000018',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I record and share meeting minutes?',
  'You can record minutes during or after a meeting and share them with your club members.

To record minutes:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Click on the meeting you want to add minutes to
4. Click the Take Minutes button
5. Use the text editor to type your meeting minutes. You can format the text with headings, bullet points, and bold text
6. Click Save when you are finished

To share minutes with members:

1. Open the meeting details
2. Click Share Minutes
3. Choose how you want to share them (for example by email or within the platform)
4. Click Send

Members who have access will be able to view the minutes from the meeting details page.',
  18,
  true,
  'meetings',
  ARRAY['minutes', 'meeting minutes', 'record minutes', 'share minutes', 'notes']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 19: Meeting Agenda and Action Items
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000019',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I manage meeting agendas and action items?',
  'Each meeting can have an agenda with items to discuss, and you can create action items that become tasks.

To add agenda items:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Click on the meeting you want to update
4. In the Agenda section, click Add Agenda Item
5. Enter the agenda item title and any details
6. Drag and drop items to reorder them if needed
7. Items are saved automatically

To create action items from your meeting:

1. During or after the meeting, click on an agenda item
2. Click Create Action Item
3. Assign the action to a member and set a due date
4. The action item will automatically appear in the Tasks section

This makes it easy to track follow-up actions from your meetings.',
  19,
  true,
  'meetings',
  ARRAY['agenda', 'action items', 'follow up', 'meeting tasks', 'discussion items']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 20: Meeting Status
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000020',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I mark a meeting as completed or cancelled?',
  'To update the status of a meeting:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Find the meeting you want to update
4. Click on the meeting to open its details
5. To mark it as completed, click the Mark as Completed button
6. To cancel the meeting, click the Mark as Cancelled button

Completed and cancelled meetings will move to the Past Meetings section. A status badge will show whether the meeting was Completed or Cancelled so you can easily tell them apart.',
  20,
  true,
  'meetings',
  ARRAY['meeting status', 'complete meeting', 'cancel meeting', 'mark completed']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 21: Meeting Invitations
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000021',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I send meeting invitations?',
  'You can invite members to a meeting so they receive a notification and can RSVP.

To send meeting invitations:

1. Click on Club Stuff in the left menu
2. Click on Meetings
3. Click on the meeting you want to send invitations for
4. Click the Invite Members button
5. Select the members you want to invite from the list
6. Click Send Invitations

Invited members will receive a notification and can respond with whether they plan to attend. Their responses will show up in the meeting''s attendance section.',
  21,
  true,
  'meetings',
  ARRAY['invite', 'meeting invitation', 'rsvp', 'notify members']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TASKS FAQs
-- ============================================================

-- FAQ 22: Tasks Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000022',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Tasks section?',
  'The Tasks section is where you manage all the to-do items and action items for your club. You can create tasks, assign them to members, set due dates and priorities, and track progress.

To access Tasks:

1. Click on Club Stuff in the left menu
2. Click on Tasks

On the left side you will see a category sidebar that lets you quickly filter tasks by status. On the right side you will see the list of tasks matching the selected category.',
  22,
  true,
  'tasks',
  ARRAY['tasks', 'overview', 'club stuff', 'to do', 'getting started']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 23: Creating a Task
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000023',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I create a new task?',
  'To create a new task:

1. Click on Club Stuff in the left menu
2. Click on Tasks
3. Click the New Task button
4. Fill in the task details:
   - Task title (a short description of what needs to be done)
   - Description (optional extra details about the task)
   - Assignee (which club member is responsible for this task)
   - Due date (when the task needs to be completed by)
   - Priority (Low, Medium, or High)
5. You can also attach files to the task if needed
6. Click Save to create the task

The task will appear in the task list and the assigned member will be able to see it in their My Tasks view.',
  23,
  true,
  'tasks',
  ARRAY['create task', 'new task', 'add task', 'assign task']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 24: Task Categories and Filtering
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000024',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I filter and organise my tasks?',
  'The Tasks page has a category sidebar on the left that lets you quickly filter tasks. The available categories are:

- Current: Shows all active tasks that are not yet completed
- Overdue: Shows tasks that are past their due date
- Due Today: Shows tasks due today
- Due This Week: Shows tasks due within the next 7 days
- Due This Month: Shows tasks due within the next 30 days
- Completed: Shows all finished tasks
- My Tasks: Shows only tasks assigned to you
- All: Shows every task regardless of status

Click on any category to filter the task list. The number next to each category shows how many tasks are in that group.

You can also use the search bar to find tasks by their title or description, and use the sort options to order tasks by due date, priority, or title.',
  24,
  true,
  'tasks',
  ARRAY['filter tasks', 'categories', 'overdue', 'sort', 'organise tasks']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 25: Completing Tasks
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000025',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I mark a task as complete?',
  'To mark a task as completed:

1. Click on Club Stuff in the left menu
2. Click on Tasks
3. Find the task you want to complete
4. Click the circle checkbox next to the task title

The task will be marked as done and will move to the Completed category. If you marked it as complete by mistake, you can click the checkbox again to mark it as not complete.

You can also complete a task from the task details view by clicking on the task and then clicking the Complete button.',
  25,
  true,
  'tasks',
  ARRAY['complete task', 'mark done', 'finish task', 'tick off']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 26: Task Details and Comments
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000026',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I view task details and add comments?',
  'To view the full details of a task and add comments:

1. Click on Club Stuff in the left menu
2. Click on Tasks
3. Click on any task in the list to open its details panel
4. You will see the full task information including title, description, assignee, due date, priority, and any attachments
5. Scroll down to the comments section
6. Type your comment in the text box
7. Click Send to add your comment

Comments are visible to everyone who can see the task. This is a great way to discuss progress, ask questions, or provide updates on a task.',
  26,
  true,
  'tasks',
  ARRAY['task details', 'comments', 'task comments', 'discussion', 'attachments']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- FINANCES FAQs
-- ============================================================

-- FAQ 27: Finances Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000027',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Finances section?',
  'The Finances section gives you a complete picture of your club''s financial position. You can record income and expenses, create and send invoices, plan budgets, and generate financial reports.

To access Finances:

1. Click on Club Stuff in the left menu
2. Click on Finances

You will see tabs across the top for the different finance areas:
- Overview: A dashboard showing your financial summary
- Transactions: All your income and expense records
- Invoices: Create and manage invoices
- Budget: Plan and track your budget
- Reports: Generate financial reports and analysis',
  27,
  true,
  'finances',
  ARRAY['finances', 'overview', 'club stuff', 'money', 'getting started']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 28: Financial Overview Dashboard
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000028',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I read the financial overview dashboard?',
  'The Overview tab gives you a snapshot of your club''s financial health.

To view the overview:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Overview tab (this is usually selected by default)

The overview shows:
- Total income and expenses for the current period
- Net position (income minus expenses)
- A chart showing income and expenses over time
- Recent transactions
- Outstanding invoices

You can change the time period displayed using the date range selector. Click on different periods to see monthly, quarterly, or yearly summaries.',
  28,
  true,
  'finances',
  ARRAY['overview', 'dashboard', 'financial summary', 'income', 'expenses']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 29: Recording Transactions
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000029',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I record a transaction?',
  'Transactions are the individual income and expense entries that make up your club''s financial records.

To record a new transaction:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Transactions tab
4. Click the New Transaction button
5. Fill in the details:
   - Type: Choose Income or Expense
   - Amount: Enter the dollar amount
   - Category: Select the appropriate category (for example Membership Fees, Equipment, Venue Hire)
   - Date: When the transaction occurred
   - Description: A brief note about what the transaction is for
   - Payment method: How it was paid (for example Cash, Bank Transfer, Card)
6. Click Save to record the transaction

The transaction will appear in your transactions list and be included in your financial reports.',
  29,
  true,
  'finances',
  ARRAY['transaction', 'income', 'expense', 'record payment', 'new transaction']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 30: Importing Transactions
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000030',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I import transactions from my bank?',
  'You can bulk import transactions from a CSV file, which is useful for importing bank statements.

To import transactions:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Transactions tab
4. Click the Import button
5. Select your CSV file from your computer
6. The system will show a preview of the transactions
7. Map the columns from your file to the correct fields (date, amount, description)
8. Review the transactions to make sure they look correct
9. Click Import to add them all

This saves you from having to enter each transaction manually.',
  30,
  true,
  'finances',
  ARRAY['import transactions', 'bank statement', 'csv import', 'bulk transactions']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 31: Creating Invoices
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000031',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I create and send an invoice?',
  'You can create professional invoices and send them directly from the platform.

To create a new invoice:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Invoices tab
4. Click the New Invoice button
5. Fill in the invoice details:
   - Recipient: Who the invoice is for (select a member or enter details)
   - Invoice date and due date
   - Line items: Add each item with a description, quantity, and price
   - Tax: Select the applicable tax rate if required
   - Notes: Add any additional notes or payment instructions
6. Click Save to create the invoice

To send the invoice by email:

1. Open the invoice you want to send
2. Click the Send button
3. Review the email preview
4. Click Send to email the invoice to the recipient

You can also download the invoice as a PDF to send manually.',
  31,
  true,
  'finances',
  ARRAY['invoice', 'create invoice', 'send invoice', 'billing', 'email invoice']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 32: Budget Management
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000032',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I set up and track a budget?',
  'The Budget tab lets you plan your club''s spending and track actual expenses against your budget.

To set up a budget:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Budget tab
4. You will see your expense categories listed with budget columns
5. Enter the budgeted amount for each category
6. The system will automatically track actual spending against your budget as you record transactions

The budget view shows:
- The budgeted amount for each category
- The actual amount spent so far
- The remaining balance
- A visual indicator showing how close you are to your budget limit

This helps your club stay on track with spending and plan ahead for the year.',
  32,
  true,
  'finances',
  ARRAY['budget', 'planning', 'spending', 'budget tracking', 'forecast']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 33: Financial Reports
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000033',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I generate financial reports?',
  'The Reports tab lets you generate detailed financial reports for your club.

To view financial reports:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. Click on the Reports tab
4. Select the type of report you want to view
5. Choose the date range for the report
6. The report will be generated and displayed on screen

Available reports include income and expense summaries, category breakdowns, and trend analysis over time. You can use these reports for your annual general meeting, committee reviews, or general financial oversight.

You can also download reports for sharing with your committee or for your club records.',
  33,
  true,
  'finances',
  ARRAY['reports', 'financial reports', 'income report', 'expense report', 'analysis']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 34: Transaction Categories
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000034',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I manage transaction categories?',
  'Transaction categories help you organise your income and expenses into meaningful groups like Membership Fees, Equipment, Venue Hire, and so on.

To manage categories:

1. Click on Club Stuff in the left menu
2. Click on Finances
3. You can access categories from the Finances section or from Club Settings under the Finance Settings area

From here you can:
- View all existing categories
- Add a new category by clicking Add Category and entering a name
- Edit an existing category by clicking on it
- Set budget amounts for each category

The system comes with some default categories to get you started. You can add more or modify them to suit your club''s needs.',
  34,
  true,
  'finances',
  ARRAY['categories', 'transaction categories', 'expense categories', 'organise finances']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- DOCUMENTS FAQs
-- ============================================================

-- FAQ 35: Documents Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000035',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Documents section?',
  'The Documents section lets you create custom forms and document templates for your club. You can build entry forms for events, create official documents like Notice of Race, and set up a public document generator.

To access Documents:

1. Click on Club Stuff in the left menu
2. Click on Documents

You will see sections for Forms and Document Templates. Forms are used to collect information from members or competitors. Document Templates are used to generate official club documents.',
  35,
  true,
  'general',
  ARRAY['documents', 'overview', 'club stuff', 'forms', 'templates', 'getting started']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 36: Creating Forms
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000036',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I create a custom form?',
  'You can create custom forms to collect information from members or event participants.

To create a new form:

1. Click on Club Stuff in the left menu
2. Click on Documents
3. In the Forms section, click New Form
4. Enter a name and description for your form
5. Add form fields by clicking Add Field and choosing the field type:
   - Text field for short answers
   - Text area for longer responses
   - Select dropdown for choosing from a list of options
   - Radio buttons for selecting one option from a group
   - Checkbox for yes/no or multiple selections
   - Clubs dropdown to select a club
   - Venues dropdown to select a venue
6. For each field you can set whether it is required and add placeholder text
7. Use page breaks to split the form across multiple pages
8. Click Save when your form is ready

You can preview your form at any time to see how it will look to the person filling it in. You can also duplicate an existing form to use as a starting point for a new one.',
  36,
  true,
  'general',
  ARRAY['forms', 'create form', 'custom form', 'form builder', 'entry form']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 37: Creating Document Templates
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000037',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I create a document template?',
  'Document templates let you create reusable documents like Notice of Race, Sailing Instructions, or other official club documents.

To create a new document template:

1. Click on Club Stuff in the left menu
2. Click on Documents
3. In the Document Templates section, click New Document
4. Choose the template type:
   - HTML template: A free-form document using the visual editor
   - Structured template: A section-based document with predefined layout
5. Enter a name for your template
6. Use the editor to write your document content. You can:
   - Format text with headings, bold, italic, and lists
   - Upload a club logo to appear on the document
   - Add footer text
   - Insert form fields that will be filled in when generating the document
7. Click Save when your template is ready

You can preview the template to see how the final document will look. Templates can be duplicated if you want to create a similar document with slight changes.',
  37,
  true,
  'general',
  ARRAY['document template', 'create template', 'notice of race', 'sailing instructions', 'NOR']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 38: Public NOR Generator
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000038',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'What is the Public NOR Generator?',
  'The Public NOR (Notice of Race) Generator allows you to create a public page where people can generate official race documents by filling in a form.

To set up the Public NOR Generator:

1. Click on Club Stuff in the left menu
2. Click on Documents
3. Find the Public NOR Generator section
4. Click Configure to set up the generator settings
5. Link a document template and a form to the generator
6. Once configured, you will get a public URL that you can share

When someone visits the public URL, they can fill in the form and the system will automatically generate a completed document based on your template. This is useful for allowing clubs to generate their own Notice of Race documents using your approved template.',
  38,
  true,
  'general',
  ARRAY['NOR generator', 'public documents', 'notice of race', 'document generation', 'public URL']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 39: Advanced Member Filtering
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'c1000000-0000-0000-0000-000000000039',
  '832bb051-0349-4a1d-a168-86ebd45c9aaf',
  'How do I use advanced member filtering and save filter presets?',
  'Advanced filtering lets you create complex member searches using multiple criteria at once.

To use advanced filtering:

1. Click on Club Stuff in the left menu
2. Click on Club Membership
3. Click on the Members tab
4. Click the filter icon to open the Advanced Filter panel
5. Add filter criteria such as:
   - Membership type (for example Full, Associate, Junior)
   - Payment status (Paid, Unpaid, Overdue)
   - Boat class
   - Membership status (Active, Expired, Cancelled)
   - Country or region
6. The member list will update automatically as you add filters

To save a filter for later use:

1. Set up your filters the way you want them
2. Click Save Filter
3. Give your filter a name (for example Active Full Members or Unpaid Renewals)
4. Click Save

To load a saved filter:

1. Click the Manage Filters button
2. Select the filter you want to apply
3. The member list will update to show only matching members

You can create as many saved filters as you need.',
  39,
  true,
  'membership',
  ARRAY['advanced filter', 'filter presets', 'saved filters', 'member search', 'complex filter']
)
ON CONFLICT (id) DO NOTHING;