
/*
  # Seed comprehensive FAQ content for remaining sections

  1. New Categories (top-level)
    - My Stuff (sort_order 20)
    - News & Media (sort_order 30)
    - Sailing (sort_order 40)
    - Communications (sort_order 50)
    - Settings (sort_order 60)

  2. Subcategories
    - My Stuff: Boat Shed, Performance & Stats, Maintenance, My Membership
    - News & Media: Articles & News, Media Centre, Alfie TV
    - Sailing: Getting Started, One-Off Races, Race Series, Scoring & Results, Live Tracking, Event Websites, Event Command Centre, Race Calendar, Venues, Start Box, Livestreaming
    - Communications: Conversations & Messaging, Notifications, Social & Community
    - Settings: Account & Profile, Club Profile, Membership Configuration, Finance & Payments, Integrations, Email Templates, Website Settings

  3. FAQs
    - Comprehensive FAQ articles for each subcategory covering all major user workflows

  4. Important Notes
    - All FAQs are published and active
    - Sort orders ensure logical reading flow within each section
    - Answers include step-by-step instructions where appropriate
*/

-- ============================================================
-- TOP-LEVEL CATEGORIES
-- ============================================================

INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'My Stuff', 'my-stuff', 'Your personal boats, performance stats, and membership details', 'User', 20, true, NULL),
  ('d0000000-0000-0000-0000-000000000002', 'News & Media', 'news-media', 'Articles, media uploads, and Alfie TV', 'Newspaper', 30, true, NULL),
  ('d0000000-0000-0000-0000-000000000003', 'Sailing', 'sailing', 'Race management, events, scoring, live tracking, and more', 'Sailboat', 40, true, NULL),
  ('d0000000-0000-0000-0000-000000000004', 'Communications', 'communications', 'Messaging, notifications, and social features', 'MessageSquare', 50, true, NULL),
  ('d0000000-0000-0000-0000-000000000005', 'Settings', 'settings', 'Account, club, membership, and integration configuration', 'Settings', 60, true, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SUBCATEGORIES
-- ============================================================

-- My Stuff subcategories
INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Boat Shed', 'boat-shed', 'Managing your personal fleet of boats', 'Ship', 1, true, 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'Performance & Stats', 'performance-stats', 'Tracking your racing performance', 'TrendingUp', 2, true, 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000003', 'Maintenance', 'maintenance', 'Boat maintenance reminders and tracking', 'Wrench', 3, true, 'd0000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000004', 'My Membership', 'my-membership', 'Viewing your membership details and status', 'CreditCard', 4, true, 'd0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- News & Media subcategories
INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d1000000-0000-0000-0000-000000000005', 'Articles & News', 'articles-news', 'Creating, editing, and publishing news articles', 'FileText', 1, true, 'd0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000006', 'Media Centre', 'media-centre', 'Uploading and managing photos and videos', 'Image', 2, true, 'd0000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000007', 'Alfie TV', 'alfie-tv', 'Video channels and YouTube integration', 'Tv', 3, true, 'd0000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Sailing subcategories
INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d1000000-0000-0000-0000-000000000010', 'Getting Started with Sailing', 'sailing-getting-started', 'Overview of sailing and race management features', 'Compass', 1, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000011', 'One-Off Races', 'one-off-races', 'Creating and managing single race events', 'Flag', 2, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000012', 'Race Series', 'race-series', 'Multi-round series setup and management', 'Repeat', 3, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000013', 'Scoring & Results', 'scoring-results', 'Entering results, scoring modes, and calculations', 'Award', 4, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000014', 'Handicaps', 'handicaps', 'Managing skipper and boat handicaps', 'Scale', 5, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000015', 'Live Tracking', 'live-tracking', 'Real-time race tracking and broadcasting', 'Radio', 6, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000016', 'Event Websites', 'event-websites', 'Building and publishing event websites', 'Globe', 7, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000017', 'Event Command Centre', 'event-command-centre', 'Task management and coordination for events', 'LayoutDashboard', 8, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000018', 'Race Calendar & Venues', 'race-calendar-venues', 'Calendar management and venue setup', 'Calendar', 9, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000019', 'Start Box', 'start-box', 'Digital start sequences and race timing', 'Timer', 10, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000020', 'Livestreaming', 'livestreaming', 'Broadcasting races live to spectators', 'Video', 11, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000021', 'Event Registration & Payments', 'event-registration-payments', 'Managing competitor registrations and entry fees', 'ClipboardList', 12, true, 'd0000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000022', 'Heat Racing (HMS/SHRS)', 'heat-racing', 'Heat-based racing systems and seeding', 'Layers', 13, true, 'd0000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Communications subcategories
INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d1000000-0000-0000-0000-000000000030', 'Conversations & Messaging', 'conversations-messaging', 'Direct and group messaging between members', 'Mail', 1, true, 'd0000000-0000-0000-0000-000000000004'),
  ('d1000000-0000-0000-0000-000000000031', 'Notifications', 'notifications', 'Managing your notification inbox', 'Bell', 2, true, 'd0000000-0000-0000-0000-000000000004'),
  ('d1000000-0000-0000-0000-000000000032', 'Social & Community', 'social-community', 'Social posts, groups, and connections', 'Users', 3, true, 'd0000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Settings subcategories
INSERT INTO support_faq_categories (id, name, slug, description, icon, sort_order, is_active, parent_id)
VALUES
  ('d1000000-0000-0000-0000-000000000040', 'Account & Profile', 'account-profile', 'Managing your personal account settings', 'UserCog', 1, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000041', 'Club Profile', 'club-profile', 'Configuring your club details and branding', 'Building', 2, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000042', 'Membership Configuration', 'membership-configuration', 'Setting up membership types, fees, and renewals', 'IdCard', 3, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000043', 'Finance & Payment Settings', 'finance-payment-settings', 'Tax rates, budgets, invoicing, and payment gateways', 'DollarSign', 4, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000044', 'Integrations', 'integrations', 'Connecting third-party services like Google, Stripe, and YouTube', 'Plug', 5, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000045', 'Email Templates', 'email-templates', 'Customising automated email communications', 'MailOpen', 6, true, 'd0000000-0000-0000-0000-000000000005'),
  ('d1000000-0000-0000-0000-000000000046', 'Website Settings', 'website-settings', 'Configuring your club public website', 'Layout', 7, true, 'd0000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- FAQs: MY STUFF - Boat Shed
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
'What is the Boat Shed?',
'The Boat Shed (also called My Garage) is your personal area for managing all your boats. It keeps a record of each boat you own or sail, including details like sail number, boat class, hull information, and photos. Think of it as a digital logbook for your fleet.',
1, true, 'general'),

('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
'How do I add a new boat to my Boat Shed?',
'To add a new boat:

1. Go to My Stuff in the left menu
2. Click on Boat Shed (or My Garage)
3. Click the Add Boat button
4. Fill in the boat details such as boat name, class, sail number, hull number, and designer
5. Optionally upload a photo of your boat
6. Set the handicap rating if applicable
7. Click Save

Your boat will now appear in your personal fleet. You can add as many boats as you like.',
2, true, 'general'),

('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001',
'How do I edit or update my boat details?',
'To edit a boat:

1. Go to My Stuff then Boat Shed
2. Click on the boat you want to update
3. Click the Edit button
4. Update any fields such as the sail number, boat name, class, or handicap rating
5. Click Save to apply your changes

You can also update the boat photo from this screen.',
3, true, 'general'),

('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001',
'How do I upload or change my boat photo?',
'To manage your boat photo:

1. Go to My Stuff then Boat Shed
2. Click on the boat you want to update
3. Click on the boat image area or the camera icon
4. Select a photo from your device
5. Adjust the crop and position as needed
6. Save the image

The photo will appear on your boat card and in race results where your boat is listed.',
4, true, 'general'),

('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001',
'How do I delete a boat from my Boat Shed?',
'To remove a boat:

1. Go to My Stuff then Boat Shed
2. Click on the boat you want to remove
3. Click the Delete button
4. Confirm the deletion when prompted

Note: Deleting a boat does not remove it from past race results. Historical records are preserved.',
5, true, 'general'),

('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001',
'Can I mark one boat as my primary/default boat?',
'Yes. When you have multiple boats in your Boat Shed, you can set one as your primary boat. This is the boat that will be pre-selected when entering races or events.

To set a primary boat:

1. Go to My Stuff then Boat Shed
2. Click on the boat you want as your default
3. Look for the Set as Primary or star icon option
4. Click it to mark that boat as your primary

Your primary boat will show a star indicator on its card.',
6, true, 'general'),

('e1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000001',
'Can I see my boats across multiple clubs?',
'Yes. If you are a member of more than one club, the Boat Shed shows all your boats across all clubs. Each boat card indicates which club it is registered with. You can manage boats for any club you belong to from a single view.',
7, true, 'general');


-- ============================================================
-- FAQs: MY STUFF - Performance & Stats
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e1000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000002',
'How do I view my racing performance?',
'Your performance statistics are available in the Boat Shed. Click on any boat to see its performance data, including:

- Total races sailed
- Best finishing position
- Average finishing position
- Performance trend (improving, stable, or declining)

These stats are calculated automatically from all race results where that boat has participated.',
1, true, 'general'),

('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000002',
'What does the performance trend indicator mean?',
'The performance trend shows how your results are tracking over recent races:

- **Improving** means your average finishing positions have been getting better
- **Stable** means your results are consistent
- **Declining** means your recent results are not as strong as earlier ones

This is a helpful guide to see if changes to your setup or technique are having a positive effect.',
2, true, 'general'),

('e1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000002',
'Can I view performance graphs and charts?',
'Yes. The Performance tab for each boat shows graphical charts of your race results over time. You can see trends across different series and events. The graphs help you visualise your progress and identify patterns in your racing performance.',
3, true, 'general');


-- ============================================================
-- FAQs: MY STUFF - Maintenance
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e1000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000003',
'How do I set up maintenance reminders for my boat?',
'To create a maintenance reminder:

1. Go to My Stuff then Boat Shed
2. Click on the boat you want to add a reminder for
3. Go to the Maintenance tab
4. Click Add Reminder
5. Enter details such as what needs to be done (e.g., "Check rigging", "Hull polish")
6. Set a due date
7. Save the reminder

You will see upcoming reminders highlighted when they are due within the next 7 days.',
1, true, 'general'),

('e1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000003',
'How do I mark a maintenance task as completed?',
'To complete a maintenance reminder:

1. Go to My Stuff then Boat Shed
2. Click on the boat
3. Go to the Maintenance tab
4. Find the reminder you have completed
5. Click the Complete or tick button

Completed items are moved to a history section so you have a record of all maintenance done on your boat.',
2, true, 'general'),

('e1000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000003',
'Can I track rig tuning settings?',
'Yes. The Boat Shed includes a Rig Tuning tab where you can record your current rig tuning setup, including shroud tension, mast rake, and other settings. This is useful for keeping a log of what works well in different conditions so you can replicate it.',
3, true, 'general');


-- ============================================================
-- FAQs: MY STUFF - My Membership
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e1000000-0000-0000-0000-000000000030', 'd1000000-0000-0000-0000-000000000004',
'How do I view my membership details?',
'To view your membership:

1. Go to My Stuff in the left menu
2. Click on My Membership

This shows your current membership status, membership type, renewal date, and how long you have been a member. If your club has set up payment tracking, you can also see your payment history here.',
1, true, 'general'),

('e1000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000004',
'What do the membership status indicators mean?',
'Your membership can show several statuses:

- **Financial** means your membership is current and paid up
- **Expiring Soon** means your membership renewal date is approaching
- **Expired** means your membership has passed its renewal date
- **Pending** means your application is awaiting approval
- **Cancelled** means your membership has been cancelled

If your membership is expiring or expired, contact your club to arrange renewal.',
2, true, 'general'),

('e1000000-0000-0000-0000-000000000032', 'd1000000-0000-0000-0000-000000000004',
'How do I update my personal contact details?',
'To update your contact information:

1. Go to My Stuff then My Membership
2. Click on the Edit or pencil icon next to your details
3. Update your name, email, phone number, address, or emergency contact
4. Click Save

Your updated details will be reflected in the club member list and any communications.',
3, true, 'general'),

('e1000000-0000-0000-0000-000000000033', 'd1000000-0000-0000-0000-000000000004',
'How do I join another club?',
'If you want to join an additional club:

1. Go to My Stuff then My Membership
2. Look for the Join Another Club option
3. Browse or search for the club you want to join
4. Submit a membership application
5. Wait for the club administrator to approve your application

Once approved you will have access to both clubs and can switch between them using the club switcher at the top of the dashboard.',
4, true, 'general'),

('e1000000-0000-0000-0000-000000000034', 'd1000000-0000-0000-0000-000000000004',
'How do I view my payment history?',
'To view your payment history:

1. Go to My Stuff then My Membership
2. Scroll down to the Payment History section

This shows all recorded payments including membership fees, event entry fees, and any other transactions associated with your account. Each entry shows the amount, date, and payment method.',
5, true, 'general');


-- ============================================================
-- FAQs: NEWS & MEDIA - Articles & News
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000005',
'How do I create a news article?',
'To create a new article:

1. Go to News & Media in the left menu
2. Click on the News tab
3. Click the Create Article or New Article button
4. Enter a title for your article
5. Write the article content using the text editor
6. Add a cover image if desired
7. Optionally add tags to help with search and filtering
8. Choose whether to save as a Draft or Publish immediately
9. Click Save or Publish

Published articles will be visible to all club members and on your public website if enabled.',
1, true, 'general'),

('e2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005',
'What is the difference between Draft and Published articles?',
'Draft articles are only visible to you and other club administrators. They are useful for preparing content before it is ready to go live. Published articles are visible to all members and can appear on your public website.

You can switch an article between Draft and Published at any time by editing the article and changing its status.',
2, true, 'general'),

('e2000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000005',
'How do I add a cover image to an article?',
'When creating or editing an article:

1. Look for the Cover Image section at the top of the editor
2. Click to upload an image from your device
3. The image will be displayed as the article banner

Cover images make articles more visually appealing and are shown in article listings and on the public website.',
3, true, 'general'),

('e2000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000005',
'How do I use tags to organise articles?',
'Tags help categorise and filter articles. When creating or editing an article:

1. Look for the Tags field
2. Type a tag name and press Enter to add it
3. You can add multiple tags to each article

Readers can then filter the news feed by tag to find articles on specific topics. Common tags might include "race report", "social event", "announcement", or specific yacht class names.',
4, true, 'general'),

('e2000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005',
'How do I search and filter articles?',
'On the News page you can:

- Use the search bar to find articles by title, content, or excerpt
- Filter by tags to see articles on a particular topic
- Filter by yacht class to see class-specific articles
- Switch between grid and list view
- Sort by date (newest or oldest first) or by title

These filters help members quickly find the content they are looking for.',
5, true, 'general'),

('e2000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000005',
'Can I associate an article with a specific event?',
'Yes. When creating or editing an article, you can link it to a specific event. This is useful for race reports or event recaps. The article will then appear in the context of that event, making it easy for readers to find related content.',
6, true, 'general');


-- ============================================================
-- FAQs: NEWS & MEDIA - Media Centre
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e2000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000006',
'How do I upload photos to the Media Centre?',
'To upload photos:

1. Go to News & Media in the left menu
2. Click on the Media tab
3. Click Upload or the plus button
4. Select one or more images from your device
5. Add titles, descriptions, and optionally tag them with an event name
6. Click Upload

Images are automatically compressed for faster loading while maintaining quality.',
1, true, 'general'),

('e2000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000006',
'How do I upload or add videos?',
'You can add videos in two ways:

**Upload via YouTube:**
1. Click the Upload Video button
2. The video will be uploaded to your connected YouTube channel

**Add a YouTube URL:**
1. Click the Add YouTube URL button
2. Paste the URL of an existing YouTube video
3. The video will be linked in your Media Centre

Videos appear alongside photos in your media library.',
2, true, 'general'),

('e2000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000006',
'How do I search and filter media?',
'The Media Centre provides several ways to find content:

- Search by title, event name, or description
- Filter by media type (images only or videos only)
- Filter by specific event
- Filter by race class
- Switch between grid and list views
- Sort by date or name

These filters help you quickly locate specific photos or videos from your library.',
3, true, 'general'),

('e2000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000006',
'How do I download multiple photos at once?',
'To bulk download:

1. Go to the Media Centre
2. Select the photos you want to download (or use Select All)
3. Click the Download button
4. A zip file will be created containing all selected images

This is useful for sharing race day photos with participants or for archiving.',
4, true, 'general'),

('e2000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000006',
'How do I share media with other clubs?',
'If your club has inter-club relationships set up:

1. Select the media you want to share
2. Click the Share with Clubs button
3. Choose the clubs you want to share with
4. Confirm the share

The receiving clubs will see the shared media in their own Media Centre with attribution to your club. This is great for sharing photos from inter-club events.',
5, true, 'general'),

('e2000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000006',
'How do I publish media to Facebook or Instagram?',
'To share media on social platforms:

1. Select the image or video in the Media Centre
2. Click the Share button
3. Choose Facebook or Instagram
4. Add a caption or description
5. Click Publish

Note: Your club must have Facebook and/or Instagram integrations set up in Settings for this feature to work.',
6, true, 'general');


-- ============================================================
-- FAQs: NEWS & MEDIA - Alfie TV
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e2000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000007',
'What is Alfie TV?',
'Alfie TV is a built-in video hub that aggregates sailing content from YouTube channels. It provides a curated library of sailing videos organised by channels and categories. Members can browse videos, watch them directly in the app, and discover new sailing content relevant to their boat class or interests.',
1, true, 'general'),

('e2000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000007',
'How do I browse and watch videos on Alfie TV?',
'To use Alfie TV:

1. Go to News & Media in the left menu
2. Click on the Alfie TV tab
3. Browse videos by category or channel
4. Use the search bar to find specific content
5. Click on any video to watch it

You can filter by boat class, category, or channel to find content most relevant to you.',
2, true, 'general'),

('e2000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000007',
'How do I suggest a new channel for Alfie TV?',
'If you know of a great sailing YouTube channel that should be included:

1. Go to Alfie TV
2. Click the Suggest a Channel button
3. Provide the YouTube channel name and URL
4. Add a brief description of why it should be included
5. Submit the suggestion

An administrator will review your suggestion and add it if appropriate.',
3, true, 'general'),

('e2000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000007',
'How do administrators manage Alfie TV channels?',
'Administrators can manage Alfie TV from the admin panel:

1. Go to Alfie TV
2. Click the Admin or Manage button
3. From here you can:
   - Add new YouTube channels by URL
   - Set channel categories (e.g., Tutorials, Race Coverage, Boat Reviews)
   - Filter by yacht type or boat class
   - Feature specific videos
   - Sync channels to pull in new videos automatically
   - Remove channels that are no longer relevant

Channels auto-sync periodically to import new videos from YouTube.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Getting Started
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000010',
'What is the Sailing section?',
'The Sailing section is the core of AlfiePRO for managing all racing activities. It covers:

- **One-Off Races** for single race days
- **Race Series** for multi-round competitions
- **Race Calendar** for viewing the full schedule
- **Event Websites** for public-facing event pages
- **Live Tracking** for real-time race updates
- **Event Command Centre** for event coordination
- **Livestreaming** for broadcasting races
- **Start Box** for digital start sequences

Everything from creating an event to publishing final results is managed here.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000010',
'What types of racing does AlfiePRO support?',
'AlfiePRO supports several racing formats:

- **Handicap Racing** where boats of different classes race together and results are adjusted based on handicap ratings
- **Scratch Racing** where boats of the same class race without handicap adjustments, and the first boat across the line wins
- **Pursuit Racing** where boats start at staggered times based on handicap, and the first to finish wins
- **Heat Racing (HMS/SHRS)** where fleets are split into heats with promotion and relegation between rounds

You choose the format when creating a race or series.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000010',
'What is the difference between a One-Off Race and a Race Series?',
'A **One-Off Race** (or Quick Race) is a single standalone race event, such as a club championship day or a casual race afternoon. It has one set of results.

A **Race Series** is a competition spanning multiple rounds (race days) over a period of time. Results accumulate across rounds, with options for drop scores, to determine an overall series winner.

Use a One-Off Race for single events and a Race Series for ongoing competitions like a Winter Series or Championship.',
3, true, 'general');


-- ============================================================
-- FAQs: SAILING - One-Off Races
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000011',
'How do I create a one-off race?',
'To create a single race event:

1. Go to Sailing in the left menu
2. Click on Race Management
3. Click the Create Race or New Race button
4. Select One-Off Race as the type
5. Enter the event name and date
6. Select the venue
7. Choose the boat class(es) that will race
8. Select the race format (Handicap, Scratch, or Pursuit)
9. Configure scoring settings
10. Click Create

The race will appear in your race management list and on the Race Calendar.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000011',
'How do I add participants to a one-off race?',
'Participants can be added in several ways:

1. Open the race from Race Management
2. In the race view, you can:
   - Click Add Skipper and select from your club members
   - Type a name directly if the person is not a club member
   - Import participants from a CSV file

Each participant needs at minimum a name. You can also assign their boat class, sail number, and handicap rating.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000011',
'How do I enter results for a one-off race?',
'To enter race results:

1. Open the race from Race Management
2. For each participant, enter their finishing position or time
3. For handicap races, the system will automatically calculate corrected times based on handicap ratings
4. Mark any participants who did not finish with the appropriate code (DNS, DNF, DSQ, RET, OCS)
5. Results are saved automatically as you enter them

You can switch between Pro Mode (detailed time entry) and Touch Mode (quick position tapping) depending on your preference.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000011',
'How do I manage multiple races on the same day?',
'If you are running more than one race in a session:

1. Open your event from Race Management
2. You will see tabs or a selector for each race (Race 1, Race 2, etc.)
3. Add additional races using the Add Race button
4. Enter results for each race separately
5. The overall results will combine all races from that day

This is common for club days where you might run 2 or 3 races back to back.',
4, true, 'general'),

('e3000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000011',
'How do I configure race settings?',
'To adjust race settings:

1. Open the race from Race Management
2. Click the Settings or gear icon
3. You can configure:
   - Race format (Handicap/Scratch/Pursuit)
   - Scoring system
   - Number of races per day
   - Drop score rules
   - Start time
   - Course details
   - Wind conditions
4. Click Save

These settings affect how results are calculated and displayed.',
5, true, 'general');


-- ============================================================
-- FAQs: SAILING - Race Series
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000012',
'How do I create a Race Series?',
'To create a race series:

1. Go to Sailing then Race Management
2. Click Create Race and select Race Series
3. Enter the series name (e.g., "2026 Winter Series")
4. Set the start and end dates for the series
5. Choose the boat class(es)
6. Select the race format
7. Configure the number of rounds
8. Set drop score rules (how many worst results can be discarded)
9. Click Create

The series will be created with individual rounds that you can manage separately.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000012',
'How do I manage individual rounds in a series?',
'Each round in a series works like its own race day:

1. Open the series from Race Management
2. Click on the specific round you want to manage
3. Set the date for that round
4. Add or confirm participants
5. Enter results after racing is complete

Participants can differ between rounds as not everyone may sail every week. The series standings update automatically after each round.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000012',
'How do drop scores work in a series?',
'Drop scores allow competitors to discard their worst result(s) from the overall series calculation. For example, in a 10-round series with 1 drop, each competitor''s worst result is excluded from their total.

To configure drops:

1. Open the series settings
2. Find the Drop Scores setting
3. Enter the number of drops allowed (e.g., 1 or 2)
4. Save

The series leaderboard will show both the total points and the points after drops are applied. Dropped scores are usually shown with strikethrough formatting.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000012',
'How do I view the series leaderboard and standings?',
'To view overall series standings:

1. Open the series from Race Management
2. Click on the Leaderboard or Standings tab
3. The table shows each competitor''s results across all rounds
4. Points are totalled with drop scores applied
5. Competitors are ranked by their total points (lowest is best in most scoring systems)

You can also view individual round results by clicking on specific rounds.',
4, true, 'general'),

('e3000000-0000-0000-0000-000000000024', 'd1000000-0000-0000-0000-000000000012',
'Can I edit or adjust series results after the fact?',
'Yes. You can edit results at any time:

1. Open the series and navigate to the specific round
2. Click on the result you want to change
3. Make your adjustment (change position, add a scoring code, etc.)
4. Save the change

The series standings will automatically recalculate to reflect the updated results. This is useful for processing protests or correcting data entry errors.',
5, true, 'general'),

('e3000000-0000-0000-0000-000000000025', 'd1000000-0000-0000-0000-000000000012',
'How do I add a new round to an existing series?',
'To add additional rounds:

1. Open the series from Race Management
2. Click the Add Round button
3. Set the date for the new round
4. The round will be added to the series

You can add rounds at any time during the series, which is useful if the schedule changes or additional race days are added.',
6, true, 'general');


-- ============================================================
-- FAQs: SAILING - Scoring & Results
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000030', 'd1000000-0000-0000-0000-000000000013',
'What scoring codes are available and what do they mean?',
'AlfiePRO supports standard racing scoring codes:

- **DNS** (Did Not Start) - The competitor was registered but did not start the race
- **DNF** (Did Not Finish) - The competitor started but did not complete the course
- **DSQ** (Disqualified) - The competitor was disqualified for a rule infringement
- **RET** (Retired) - The competitor retired from the race voluntarily
- **OCS** (On Course Side) - The competitor was over the start line at the start signal
- **DNC** (Did Not Compete) - The competitor did not take part at all
- **RDG** (Redress Given) - A corrected score awarded after a protest

These codes automatically assign the appropriate penalty points based on your scoring rules.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000013',
'What is the difference between Pro Mode and Touch Mode scoring?',
'AlfiePRO offers two scoring interfaces:

**Pro Mode** is the full-featured scoring interface where you enter detailed finish times, positions, and scoring codes. It shows a comprehensive table with all race data and is ideal for use at a desk or computer.

**Touch Mode** is a simplified interface designed for use on tablets and phones at the water''s edge. You tap boats as they finish and the system records their order. It is faster for recording finishes in real time during racing.

You can switch between modes at any time without losing data.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000032', 'd1000000-0000-0000-0000-000000000013',
'How does handicap scoring work?',
'In handicap racing, boats of different types race together and results are adjusted to account for speed differences:

1. Each skipper/boat has a handicap rating
2. Actual finish times are recorded
3. The system applies the handicap formula to calculate a corrected time
4. Final positions are based on corrected times, not actual finish order

This allows boats of different speeds to compete fairly against each other. Handicap values can be updated after each race based on performance.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000033', 'd1000000-0000-0000-0000-000000000013',
'How do I share or publish race results?',
'To share results:

1. Open the race with completed results
2. Click the Share Results button
3. Choose how to share:
   - **Generate a results image** for posting on social media
   - **Publish to your club website** to make results publicly visible
   - **Share via the Social feed** for members to see
   - **Export as PDF** for printing or emailing
   - **Publish to Facebook** if your social integration is set up

Results images are automatically formatted with your club branding.',
4, true, 'general'),

('e3000000-0000-0000-0000-000000000034', 'd1000000-0000-0000-0000-000000000013',
'Can I import results from a CSV file?',
'Yes. To import results:

1. Open the race you want to add results to
2. Click the Import Results button
3. Select your CSV file
4. Map the columns from your file to the required fields (name, position, time, etc.)
5. Review the imported data
6. Confirm the import

This is useful if results have been recorded in a separate system or spreadsheet and need to be brought into AlfiePRO.',
5, true, 'general'),

('e3000000-0000-0000-0000-000000000035', 'd1000000-0000-0000-0000-000000000013',
'How do I generate a race report?',
'To create a race report:

1. Open the race with completed results
2. Click the Create Report button
3. Choose the report type (standard race report or custom)
4. The system generates a formatted report including results, conditions, and race details
5. You can edit the report content before publishing
6. Publish the report to make it available on your website or share it directly

Race reports can include a results image, race narrative, and conditions data.',
6, true, 'general');


-- ============================================================
-- FAQs: SAILING - Handicaps
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000040', 'd1000000-0000-0000-0000-000000000014',
'How do I manage skipper handicaps?',
'Handicaps can be managed in several places:

1. **From Race Management:** Open a race, click on a skipper, and edit their handicap value
2. **From Club Membership:** Go to the members list, click on a member, and update their current handicap
3. **Automatic updates:** After each race, the system can suggest updated handicaps based on performance

Handicap values are used to calculate corrected times in handicap racing, ensuring fair competition between different boat types.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000041', 'd1000000-0000-0000-0000-000000000014',
'How do I view handicap history and progression?',
'To see how a skipper''s handicap has changed over time:

1. Open a race with the skipper''s results
2. Look for the Handicap Viewer or progression indicator
3. This shows the handicap changes after each race

The handicap progression modal shows a chart of changes over time, helping you track whether a skipper is improving and their handicap is decreasing.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000042', 'd1000000-0000-0000-0000-000000000014',
'What happens to handicaps after a race?',
'After race results are entered, the system can show suggested handicap adjustments. The race officer or administrator can:

1. Review the suggested changes
2. Accept all suggestions
3. Manually override specific values
4. Apply the changes

Handicap changes take effect for the next race. The system keeps a history of all changes so you can track progression over time.',
3, true, 'general');


-- ============================================================
-- FAQs: SAILING - Live Tracking
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000050', 'd1000000-0000-0000-0000-000000000015',
'What is Live Tracking?',
'Live Tracking allows spectators, friends, and family to follow races in real time from anywhere. It provides a live view of the current race status, positions, and updates as they happen. Anyone with the tracking link can see live results without needing an account.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000051', 'd1000000-0000-0000-0000-000000000015',
'How do I enable Live Tracking for a race?',
'To set up Live Tracking:

1. Open the race from Race Management
2. Look for the Live Tracking toggle or tab
3. Enable Live Tracking for this event
4. A unique tracking link and QR code will be generated
5. Share the link or QR code with spectators

Anyone who opens the link will see real-time updates as results are entered during the race.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000015',
'How do I share the Live Tracking link?',
'Once Live Tracking is enabled:

1. Copy the tracking URL to share via email, messaging apps, or social media
2. Display the QR code on a notice board at the club for people to scan with their phone
3. Embed the link on your club or event website

The link works on any device with a web browser. No login or app is required for spectators to view.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000053', 'd1000000-0000-0000-0000-000000000015',
'How does the Pro Broadcast view work?',
'The Pro Broadcast view is an enhanced Live Tracking display designed for large screens or projectors at the venue. It shows:

- Current race status
- Live leaderboard with positions
- Boat class information
- Real-time updates as finishers come in

To use it, open the Live Tracking link and switch to the Broadcast view. It is optimised for readability from a distance.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Event Websites
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000060', 'd1000000-0000-0000-0000-000000000016',
'What are Event Websites?',
'Event Websites are dedicated public-facing web pages for your racing events. They can include event information, schedules, competitor lists, accommodation details, sponsors, documents, and results. Each event can have its own custom website that you build using a drag-and-drop page builder.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000061', 'd1000000-0000-0000-0000-000000000016',
'How do I create an Event Website?',
'To create an event website:

1. Go to Sailing then Event Websites
2. Click Create Event Website
3. Enter the website name and select the event(s) it covers
4. Choose a template or start from scratch
5. Use the page builder to add content sections
6. Configure the header, navigation, and footer
7. Preview the website
8. Publish when ready

The website is immediately accessible via a unique URL that you can share.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000062', 'd1000000-0000-0000-0000-000000000016',
'How do I use the Event Website page builder?',
'The page builder uses a drag-and-drop interface:

1. Open your event website and click Edit
2. Add pages using the Page Manager
3. For each page, add rows and columns to create layouts
4. Drop widgets into columns, such as:
   - Text blocks for content
   - Image sliders for photos
   - Competitor list widgets
   - Live tracking widgets
   - Registration buttons
   - Sponsor logos
   - Accommodation maps
   - Quick link tiles
5. Configure each widget''s settings by clicking on it
6. Rearrange by dragging elements
7. Save and preview your changes',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000063', 'd1000000-0000-0000-0000-000000000016',
'How do I manage sponsors on the Event Website?',
'To add sponsors:

1. Open your event website dashboard
2. Go to the Sponsors section
3. Click Add Sponsor
4. Enter the sponsor name, logo, website URL, and sponsorship tier
5. Save

Sponsors can be displayed on the event website using the Sponsor widget. They appear with their logos and links, and can be arranged by tier (e.g., Gold, Silver, Bronze).',
4, true, 'general'),

('e3000000-0000-0000-0000-000000000064', 'd1000000-0000-0000-0000-000000000016',
'How do I manage event website navigation and header?',
'To customise the header and navigation:

1. Open your event website and click Edit
2. Click on the Header Editor
3. Set the website title, logo, and background
4. Manage the navigation menu by adding or reordering page links
5. Configure the colour scheme and transparency settings
6. Save your changes

The navigation automatically includes links to all published pages. You can also add external links.',
5, true, 'general'),

('e3000000-0000-0000-0000-000000000065', 'd1000000-0000-0000-0000-000000000016',
'Can I save an event website as a template?',
'Yes. To save a website design as a template for future events:

1. Open the event website
2. Click Save as Template
3. Give the template a name and description
4. Save

When creating a new event website in the future, you can select this template to start with the same layout and design, then just update the content for the new event.',
6, true, 'general'),

('e3000000-0000-0000-0000-000000000066', 'd1000000-0000-0000-0000-000000000016',
'How do I add accommodation information to my event website?',
'To manage accommodation:

1. Open your event website dashboard
2. Go to the Accommodation section
3. Click Add Accommodation
4. Enter details like name, address, phone, website, price range, and description
5. Mark whether it is nearby, walking distance, etc.
6. Save

Use the Accommodation Map widget on your event pages to display all accommodation options on an interactive map.',
7, true, 'general');


-- ============================================================
-- FAQs: SAILING - Event Command Centre
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000070', 'd1000000-0000-0000-0000-000000000017',
'What is the Event Command Centre?',
'The Event Command Centre is a project management tool specifically designed for organising sailing events. It provides:

- **Task boards** (Kanban and table views) for tracking event preparation tasks
- **Team chat** for communicating with your event team
- **Activity feed** showing what has been done
- **Timeline view** for scheduling
- **Checklists** for pre-race and post-race tasks

It helps ensure nothing falls through the cracks when organising a race day or regatta.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000071', 'd1000000-0000-0000-0000-000000000017',
'How do I create and manage tasks in the Event Command Centre?',
'To manage event tasks:

1. Go to Sailing then Event Command Centre
2. Select or create your event
3. Click Add Task
4. Enter the task name, description, and due date
5. Assign it to a team member
6. Set the priority and category
7. Save

Tasks can be viewed in a Kanban board (drag between columns like To Do, In Progress, Done) or in a table view. You can also add custom columns to track additional information.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000072', 'd1000000-0000-0000-0000-000000000017',
'How does the team chat work in the Event Command Centre?',
'The team chat allows real-time communication with everyone involved in running the event:

1. Open the Event Command Centre
2. Click on the Chat tab
3. Create channels for different topics (e.g., "Logistics", "Race Committee", "Volunteers")
4. Send messages and share updates
5. Tag team members to get their attention

Messages are specific to each event, keeping event communications organised and separate from general club messaging.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000073', 'd1000000-0000-0000-0000-000000000017',
'Can I use templates for event setup?',
'Yes. You can create reusable templates for common event types:

1. Open the Event Command Centre
2. Click Templates
3. Create a new template with standard tasks, assignments, and checklists
4. Save the template

When setting up a new event, apply a template to pre-populate all the tasks and checklists. This saves significant time for recurring events like your weekly club racing.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Race Calendar & Venues
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000080', 'd1000000-0000-0000-0000-000000000018',
'How does the Race Calendar work?',
'The Race Calendar shows all upcoming and past racing events in a calendar view:

1. Go to Sailing then Race Calendar
2. Browse by month to see scheduled events
3. Click on any event to see its details
4. Events are colour-coded by type (one-off, series round, etc.)

The calendar also appears on your public club website so members and visitors can see the upcoming schedule. You can export calendar events to Google Calendar or other calendar apps.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000081', 'd1000000-0000-0000-0000-000000000018',
'How do I add and manage venues?',
'To manage racing venues:

1. Go to Sailing then Venues (or Club Stuff then Venues)
2. Click Add Venue
3. Enter the venue name, address, and location on the map
4. Add details like facilities, parking information, and contact details
5. Upload photos of the venue
6. Save

Venues can be assigned to races and events. They also appear on your public website and event pages.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000082', 'd1000000-0000-0000-0000-000000000018',
'Can I use venues from other clubs?',
'Yes. If your club hosts events at shared venues or visits other club locations:

1. Go to Venues
2. Click Add Existing Venue
3. Browse or search for venues already in the system
4. Add them to your club''s venue list

This avoids duplicate entries and ensures consistent venue information across clubs.',
3, true, 'general');


-- ============================================================
-- FAQs: SAILING - Start Box
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000090', 'd1000000-0000-0000-0000-000000000019',
'What is the Digital Start Box?',
'The Digital Start Box is a tool for managing race start sequences. It plays audio signals and visual countdowns for race starts, replacing traditional horns and flags. You can run it from a tablet, phone, or laptop at the start line.

It supports standard start sequences and custom sequences, with configurable sounds and timing.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000091', 'd1000000-0000-0000-0000-000000000019',
'How do I set up a start sequence?',
'To configure a start sequence:

1. Go to Sailing then Start Box
2. Choose an existing start sequence or create a new one
3. Configure the timing intervals (e.g., 5-4-1-0 minute sequence)
4. Select the audio sounds for each signal (horn, beep, countdown)
5. Set whether to include visual countdowns
6. Save the sequence

You can create different sequences for different event types and save them for reuse.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000092', 'd1000000-0000-0000-0000-000000000019',
'How do I run a start sequence during a race?',
'To run a start:

1. Open the Start Box
2. Select your saved start sequence
3. When ready, click Start
4. The countdown will begin with visual and audio signals
5. The sequence runs automatically through each interval
6. A race timer starts after the final start signal

Make sure your device volume is turned up and connected to speakers if you need the sound to carry across the water.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000093', 'd1000000-0000-0000-0000-000000000019',
'Can I use audio-only mode for the Start Box?',
'Yes. Audio-only mode runs the start sequence sounds without requiring you to watch the screen. This is useful when:

- You are the race officer and need to focus on the water
- You want to connect to speakers and walk away from the device
- You are using it as a backup to physical signals

Enable audio-only mode in the Start Box settings before starting the sequence.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Livestreaming
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000100', 'd1000000-0000-0000-0000-000000000020',
'What livestreaming options are available?',
'AlfiePRO supports several livestreaming approaches:

- **YouTube Live** integration for streaming to your YouTube channel
- **Cloudflare Stream** for direct in-app streaming
- **Mobile camera sources** where multiple phones can feed into the stream
- **Overlay support** for adding race information, sponsor logos, and results on top of the video feed

You can stream races live so spectators anywhere in the world can watch.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000101', 'd1000000-0000-0000-0000-000000000020',
'How do I set up a livestream for a race?',
'To set up livestreaming:

1. Go to Sailing and open the event you want to stream
2. Click on the Livestream tab
3. Click Set Up Livestream or use the Setup Wizard
4. Choose your streaming platform (YouTube, Cloudflare)
5. Configure the stream title and description
6. Add any camera sources
7. Set up overlays if desired
8. Test the stream
9. Go live when ready

The setup wizard walks you through each step.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000102', 'd1000000-0000-0000-0000-000000000020',
'How do I use mobile phones as camera sources?',
'You can use multiple mobile phones as wireless cameras:

1. Set up the livestream from the control panel
2. Click Add Camera Source
3. A QR code will be displayed
4. Open the QR code on each mobile phone you want to use as a camera
5. The phone''s camera feed will appear in your camera grid
6. Position phones around the venue for different angles

This allows you to get multiple viewing angles without expensive camera equipment.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000103', 'd1000000-0000-0000-0000-000000000020',
'How do I add overlays to the livestream?',
'Overlays add information on top of the video feed:

1. Open the Livestream Control Panel
2. Go to Overlays
3. Add overlay elements such as:
   - Race results and standings
   - Sponsor logos that rotate
   - Event name and class information
   - Race timer
4. Position and size each overlay
5. Toggle overlays on and off during the stream

Overlays update in real time as race results are entered.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Event Registration & Payments
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000110', 'd1000000-0000-0000-0000-000000000021',
'How do I set up event registration?',
'To enable online registration for an event:

1. Open the event from Race Management or Event Websites
2. Go to the Registration tab
3. Enable registration
4. Set up entry fee categories (e.g., Senior, Junior, Early Bird)
5. Configure fee amounts
6. Set registration open and close dates
7. Add any custom form fields for additional information
8. Save

Competitors can then register through your event website.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000111', 'd1000000-0000-0000-0000-000000000021',
'How do I manage entry fees and payments?',
'Entry fee management:

1. Open the event registration settings
2. Create fee categories with different prices (e.g., different rates for members vs non-members)
3. If Stripe is connected, online payments are processed automatically
4. For manual payments, you can record them in the system
5. Track payment status for each competitor (Paid, Pending, Unpaid)

All entry fee income is automatically recorded in your club finances if the finance integration is enabled.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000112', 'd1000000-0000-0000-0000-000000000021',
'How do I view and manage the competitor list?',
'To manage competitors:

1. Open the event and go to the Competitors tab
2. View all registered competitors with their details
3. Filter by payment status, boat class, or registration date
4. Click on a competitor to view or edit their registration details
5. Import additional competitors from a CSV file if needed
6. Export the competitor list for printing or sharing

The competitor list can also be displayed on your event website using the Competitor List widget.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000113', 'd1000000-0000-0000-0000-000000000021',
'How do I handle international competitors?',
'For events with international participants:

1. Open the event registration settings
2. Enable international competitor fields
3. Competitors can provide their country, national sailing number, and club affiliation
4. Country flags are displayed alongside competitor names in results

This is particularly useful for regattas and championship events that attract competitors from multiple countries.',
4, true, 'general');


-- ============================================================
-- FAQs: SAILING - Heat Racing
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e3000000-0000-0000-0000-000000000120', 'd1000000-0000-0000-0000-000000000022',
'What is HMS heat racing?',
'HMS (Heat Management System) is a racing format where the fleet is divided into smaller groups (heats) rather than racing everyone together. After each round of heats, competitors are promoted or relegated between groups based on their results. This ensures competitive racing in each heat and works well for large fleets.

The system handles seeding, heat assignments, promotion/relegation, and overall scoring automatically.',
1, true, 'general'),

('e3000000-0000-0000-0000-000000000121', 'd1000000-0000-0000-0000-000000000022',
'How do I set up heat racing for an event?',
'To configure heat racing:

1. Create a new race or series and select the Heat Racing format
2. Set the number of heats (groups)
3. Configure the number of competitors per heat
4. Set promotion/relegation rules (how many move up or down after each round)
5. Choose the seeding method (random, by handicap, or manual)
6. Save the configuration

The system will automatically assign competitors to heats based on your seeding settings.',
2, true, 'general'),

('e3000000-0000-0000-0000-000000000122', 'd1000000-0000-0000-0000-000000000022',
'How does seeding work for heats?',
'Seeding determines how competitors are initially placed into heats:

- **Random seeding** distributes competitors randomly across heats
- **Handicap seeding** groups competitors by similar handicap ratings
- **Manual seeding** lets you place competitors into specific heats yourself

After the initial seeding, the promotion/relegation system automatically reseeds competitors between rounds based on their race results.',
3, true, 'general'),

('e3000000-0000-0000-0000-000000000123', 'd1000000-0000-0000-0000-000000000022',
'How does promotion and relegation work between heats?',
'After each round of heat racing:

1. The top finishers in each heat are promoted to a higher heat
2. The bottom finishers are relegated to a lower heat
3. The number of promotions/relegations is set in your configuration

For example, with 3 heats and 2 promotions/relegations: the top 2 from Heat B move up to Heat A, while the bottom 2 from Heat A move down to Heat B. The same applies between Heat B and Heat C.

The system handles all the reshuffling automatically between rounds.',
4, true, 'general'),

('e3000000-0000-0000-0000-000000000124', 'd1000000-0000-0000-0000-000000000022',
'How do I view overall results across all heats?',
'To see the combined results:

1. Open the heat racing event
2. Click on the Overall Results tab
3. The system calculates points across all heats and rounds
4. Competitors are ranked by their cumulative performance

You can also view results for individual heats and rounds to see the detail behind the overall standings.',
5, true, 'general');


-- ============================================================
-- FAQs: COMMUNICATIONS - Conversations & Messaging
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000030',
'How do I send a message to another member?',
'To start a conversation:

1. Go to Communications in the left menu
2. Click the New Message or Compose button
3. Search for and select the member you want to message
4. Type your message
5. Click Send

The conversation will appear in your message list. The recipient will receive a notification that they have a new message.',
1, true, 'general'),

('e4000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000030',
'How do I create a group chat?',
'To start a group conversation:

1. Go to Communications
2. Click New Message or Compose
3. Select multiple recipients
4. Give the group chat a name if desired
5. Type your message and send

All members in the group will see all messages. Group chats are useful for committee discussions, race day coordination, or social planning.',
2, true, 'general'),

('e4000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000030',
'How do I search my conversations?',
'To find a specific conversation or message:

1. Go to Communications
2. Use the search bar at the top
3. Type a keyword, member name, or topic
4. Results will show matching conversations

You can also scroll through your conversation list which shows the most recent messages first.',
3, true, 'general'),

('e4000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000030',
'How do I send a notification or announcement to all members?',
'To send a club-wide notification:

1. Go to Communications
2. Click Compose or New Notification
3. Select the audience (all members, specific membership types, or individual members)
4. Enter your subject and message
5. Optionally attach files
6. Choose delivery method (in-app notification, email, or both)
7. Send

Members will receive the notification according to your delivery selection.',
4, true, 'general');


-- ============================================================
-- FAQs: COMMUNICATIONS - Notifications
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e4000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000031',
'How do I view my notifications?',
'To check your notifications:

1. Click the bell icon in the top navigation bar
2. A dropdown shows your recent notifications
3. Click on any notification to view its full content
4. Unread notifications are highlighted

You can also go to Communications and look at the Notifications tab for a complete list of all notifications you have received.',
1, true, 'general'),

('e4000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000031',
'What types of notifications will I receive?',
'You may receive notifications for:

- New messages from other members
- Meeting invitations and reminders
- Task assignments and updates
- Membership renewal reminders
- Event announcements
- Race result publications
- Membership application updates
- Club announcements from administrators
- System notifications (maintenance, updates)

Notifications appear in the app and can also be sent to your email depending on settings.',
2, true, 'general'),

('e4000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000031',
'How do I mark notifications as read?',
'Notifications are automatically marked as read when you open them. You can also:

1. Click on a notification to mark it as read
2. Use the Mark All as Read option to clear all unread notifications at once

The unread count on the bell icon updates in real time.',
3, true, 'general');


-- ============================================================
-- FAQs: COMMUNICATIONS - Social & Community
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e4000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000032',
'What is the Social & Community feature?',
'The Social & Community section is like a social network for your sailing club. Members can:

- Post updates, photos, and achievements
- Comment on and like other members'' posts
- Join interest groups (e.g., "Laser Sailors", "Social Committee")
- Connect with other members
- Share race day highlights

It helps build a sense of community within your club beyond just racing.',
1, true, 'general'),

('e4000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000032',
'How do I create a social post?',
'To share a post:

1. Go to the Community page from the left menu
2. Click the Create Post button
3. Write your post content
4. Optionally add an image
5. Choose whether to post to the general feed or a specific group
6. Click Post

Your post will appear in the activity feed for other members to see, like, and comment on.',
2, true, 'general'),

('e4000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000032',
'How do I join or create a group?',
'To work with groups:

**Joining a group:**
1. Go to the Community page
2. Browse the available groups
3. Click Join on any group you are interested in

**Creating a group:**
1. Go to the Community page
2. Click Create Group
3. Enter a group name and description
4. Set whether it is public (anyone can join) or private (invitation only)
5. Save

Groups are great for organising members by interest, boat class, or committee.',
3, true, 'general'),

('e4000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000032',
'How do I connect with other members?',
'To build your network:

1. Go to the Community page
2. Click on Connections
3. Browse the member directory
4. Click Connect next to members you want to connect with
5. They will receive a connection request

Once connected, you can see each other''s posts and activities more prominently in your feed.',
4, true, 'general'),

('e4000000-0000-0000-0000-000000000024', 'd1000000-0000-0000-0000-000000000032',
'How do I report an inappropriate post?',
'If you see content that is inappropriate:

1. Click the three-dot menu on the post
2. Select Report Post
3. Choose the reason for the report
4. Submit

The report will be sent to club administrators for review. Administrators can remove posts and take appropriate action.',
5, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Account & Profile
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000040',
'How do I update my profile information?',
'To update your profile:

1. Click on your avatar or name in the top navigation
2. Select Settings or Profile
3. Update your first name, last name, or email address
4. Click Save

Your profile information is shared across all clubs you belong to.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000040',
'How do I change my profile photo?',
'To update your avatar:

1. Go to Settings
2. Click on the Account & Profile section
3. Click on your current avatar image
4. Upload a new photo from your device
5. Crop and adjust as needed
6. Save

Your photo appears throughout the app next to your name in messages, race results, and the member directory.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000040',
'How do I change my password?',
'To change your password:

1. Go to Settings
2. Look for the Password or Security section
3. If you are logged in via email/password, use the Change Password option
4. Enter your current password and your new password
5. Confirm the new password
6. Save

If you have forgotten your password, use the Forgot Password link on the login screen to receive a reset email.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000040',
'How do I switch between clubs?',
'If you belong to multiple clubs:

1. Look for the Club Switcher at the top of the dashboard
2. Click on it to see all your clubs
3. Select the club you want to view

You can also set a default club in your profile settings so the app opens to your preferred club each time.',
4, true, 'general'),

('e5000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000040',
'How do I install the app on my device?',
'AlfiePRO can be installed as a progressive web app (PWA) on your phone, tablet, or computer:

1. Go to Settings
2. Look for the Install App option
3. Click Install
4. Follow the prompts on your device

On mobile, you can also use your browser''s Add to Home Screen option. The installed app works offline for certain features and provides a native app-like experience.',
5, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Club Profile
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000041',
'How do I update my club profile?',
'To edit your club details (administrator access required):

1. Go to Settings
2. Click on Club Profile
3. Update the club name, abbreviation, description, and contact details
4. Upload or change the club logo
5. Add or update the club cover image
6. Set the club introduction text
7. Save your changes

These details appear on your public website and in member communications.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000041',
'How do I manage the club committee?',
'To manage committee positions:

1. Go to Settings then Committee Management
2. View existing committee positions
3. Click Add Position to create new roles
4. Assign members to each position
5. Set access levels for each position (what they can see and do in the app)
6. Choose whether each position appears on the public website

Committee members can be given admin access, editor access, or view-only access depending on their role.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000041',
'How do I manage which yacht classes my club races?',
'To configure your club''s yacht classes:

1. Go to Settings then Club Profile or Yacht Classes
2. Browse the available yacht classes
3. Select the classes your club races
4. Save

Selected yacht classes will appear as options when creating races, filtering members, and on your public website. If a class is not in the system, contact your association administrator to have it added.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000041',
'How do I set up sailing days for my club?',
'To configure your regular sailing schedule:

1. Go to Settings then Club Profile
2. Find the Sailing Days section
3. Add your regular sailing days (e.g., Saturday Afternoon, Wednesday Evening)
4. Set the frequency (weekly, fortnightly, monthly)
5. Save

Sailing days appear on your public website and help new members understand when racing happens at your club.',
4, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Membership Configuration
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000042',
'How do I set up membership types?',
'To configure membership types:

1. Go to Settings then Membership Settings
2. Click Add Membership Type
3. Enter the type name (e.g., "Senior", "Junior", "Family", "Social")
4. Set the annual fee
5. Choose the currency
6. Configure the renewal period (annual, monthly, quarterly, or lifetime)
7. Save

You can create as many membership types as your club needs. Each type can have a different fee structure.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000042',
'How do I configure membership renewal settings?',
'To set up renewals:

1. Go to Settings then Membership Settings
2. Find the Renewal Settings section
3. Choose the renewal mode:
   - **Anniversary Date** means each member renews on the date they joined
   - **Fixed Date** means all memberships renew on the same date (e.g., 1 July)
4. Set the renewal notification timing (e.g., 30 days before expiry)
5. Configure the grace period (how long after expiry before status changes)
6. Save

The system will automatically send renewal reminders to members based on these settings.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000042',
'How do I manage the code of conduct?',
'To set up your club''s code of conduct:

1. Go to Settings then Membership Settings
2. Find the Code of Conduct section
3. Enter or paste your club''s code of conduct text
4. Enable the requirement for members to accept it during onboarding
5. Save

New members will need to read and accept the code of conduct when they join. You can update the text at any time.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000042',
'How do I deprecate an old membership type?',
'If you need to phase out a membership type:

1. Go to Settings then Membership Settings
2. Click on the membership type you want to deprecate
3. Look for the Replace With or Deprecate option
4. Select a replacement membership type for existing members
5. Save

Existing members on the old type will be prompted to switch to the new type at their next renewal. The old type will no longer be available for new members.',
4, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Finance & Payment Settings
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000030', 'd1000000-0000-0000-0000-000000000043',
'How do I set up finance settings?',
'To configure your club finances:

1. Go to Settings then Finance Settings
2. Set your opening balance
3. Configure tax rates (if applicable)
4. Set up bank account details for invoicing
5. Configure invoice numbering format and prefixes
6. Add your organisation number or ABN
7. Save

These settings are used throughout the finance module for transactions, invoices, and reports.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000031', 'd1000000-0000-0000-0000-000000000043',
'How do I set up budget categories?',
'To manage budget categories:

1. Go to Settings then Finance Settings
2. Find the Budget Categories section
3. Add income categories (e.g., "Membership Fees", "Event Entry Fees", "Sponsorship")
4. Add expense categories (e.g., "Equipment", "Insurance", "Venue Hire")
5. Set budget amounts for each category if desired
6. Save

Categories are used when recording transactions to keep your finances organised and for generating reports.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000032', 'd1000000-0000-0000-0000-000000000043',
'How do I connect Stripe for online payments?',
'To enable online payment processing:

1. Go to Settings then Finance Settings or Integrations
2. Look for the Stripe section
3. Click Connect Stripe
4. You will be redirected to Stripe to authorise the connection
5. Once connected, your club can accept online payments for memberships, event entries, and invoices

Stripe handles all payment processing securely. Funds are deposited directly to your club''s bank account.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000033', 'd1000000-0000-0000-0000-000000000043',
'How do I configure tax rates?',
'To set up tax rates:

1. Go to Settings then Finance Settings
2. Find the Tax Rates section
3. Add your applicable tax rates (e.g., GST at 10%)
4. Set a default tax rate for transactions
5. Save

Tax rates are applied to invoices and can be overridden on individual transactions. Tax amounts are tracked separately for reporting purposes.',
4, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Integrations
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000040', 'd1000000-0000-0000-0000-000000000044',
'What integrations are available?',
'AlfiePRO integrates with several third-party services:

- **Google Suite** (Calendar, Drive, YouTube, Analytics)
- **Stripe** for payment processing
- **Facebook** for publishing posts and events
- **Instagram** for sharing photos
- **YouTube** for video management and livestreaming
- **Cloudflare** for livestreaming and DNS management
- **Dropbox** for file storage

Each integration is set up separately from the Integrations page in Settings.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000041', 'd1000000-0000-0000-0000-000000000044',
'How do I connect YouTube to my club?',
'To connect YouTube:

1. Go to Settings then Integrations
2. Find the YouTube section
3. Click Connect YouTube
4. Sign in to the Google account that owns your club''s YouTube channel
5. Authorise AlfiePRO to access your channel
6. Once connected, you can upload videos, manage playlists, and set up livestreaming

The YouTube connection is used for the Media Centre, Alfie TV, and Livestreaming features.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000042', 'd1000000-0000-0000-0000-000000000044',
'How do I connect Facebook and Instagram?',
'To set up social media integration:

1. Go to Settings then Integrations
2. Find the Facebook/Instagram section
3. Click Connect
4. Log in to the Facebook account that manages your club''s page
5. Authorise AlfiePRO and select the page you want to connect
6. For Instagram, ensure your Instagram business account is linked to your Facebook page

Once connected, you can publish posts, share race results, and share media directly to your social channels.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000043', 'd1000000-0000-0000-0000-000000000044',
'How do I connect Google Drive for file storage?',
'To link Google Drive:

1. Go to Settings then Integrations
2. Find the Google Drive section
3. Click Connect Google Drive
4. Sign in to your Google account
5. Authorise access
6. Select the folder to use for club files

Once connected, club documents and resources can be synced with Google Drive, giving you cloud backup and easy sharing.',
4, true, 'general'),

('e5000000-0000-0000-0000-000000000044', 'd1000000-0000-0000-0000-000000000044',
'How do I set up Google Analytics for my club website?',
'To track website visitors:

1. Go to Settings then Integrations or Website Settings
2. Find the Google Analytics section
3. Enter your Google Analytics tracking ID (format: G-XXXXXXXXXX)
4. Save

Analytics will start tracking visitors to your public club website and event websites. You can view visitor data in your Google Analytics dashboard.',
5, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Email Templates
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000050', 'd1000000-0000-0000-0000-000000000045',
'How do I customise email templates?',
'To edit email templates:

1. Go to Settings then Email Templates
2. Browse the available templates (Welcome Email, Renewal Reminder, Event Announcement, etc.)
3. Click on the template you want to customise
4. Edit the subject line and body content
5. Use template variables like {{member_name}}, {{club_name}}, {{renewal_date}} to personalise emails
6. Preview the template to see how it will look
7. Save

Customised templates are used automatically when the system sends those types of emails.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000051', 'd1000000-0000-0000-0000-000000000045',
'What template variables are available?',
'Common template variables include:

- **{{member_name}}** - The recipient''s full name
- **{{first_name}}** - The recipient''s first name
- **{{club_name}}** - Your club name
- **{{renewal_date}}** - The membership renewal date
- **{{membership_type}}** - The member''s membership category
- **{{event_name}}** - The name of the event
- **{{event_date}}** - The date of the event

Variables are replaced with actual data when the email is sent. They are shown in the template editor for easy reference.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000052', 'd1000000-0000-0000-0000-000000000045',
'What types of automated emails does the system send?',
'AlfiePRO can automatically send:

- **Welcome emails** when a new member joins
- **Renewal reminders** before membership expiry
- **Event announcements** for upcoming races
- **Meeting invitations** with RSVP links
- **Race result notifications** when results are published
- **Task assignments** when you are given a task
- **Membership application updates** when an application is approved or rejected

Each type has its own template that you can customise in Settings.',
3, true, 'general');


-- ============================================================
-- FAQs: SETTINGS - Website Settings
-- ============================================================

INSERT INTO support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area)
VALUES
('e5000000-0000-0000-0000-000000000060', 'd1000000-0000-0000-0000-000000000046',
'How do I set up my club public website?',
'Your club comes with a built-in public website. To configure it:

1. Go to Settings then Website Settings
2. Enable the public website
3. Configure the homepage with slides and content tiles
4. Set up navigation pages
5. Choose your colour theme
6. Add your club logo and cover images
7. Save and publish

Your website is accessible via a unique URL. You can also connect a custom domain name.',
1, true, 'general'),

('e5000000-0000-0000-0000-000000000061', 'd1000000-0000-0000-0000-000000000046',
'How do I manage the homepage sliders and tiles?',
'To customise your homepage:

1. Go to Settings then Website Settings then Homepage
2. **For sliders:** Add images with optional titles, descriptions, and call-to-action buttons
3. **For content tiles:** Add tiles linking to different sections (Results, Calendar, News, etc.)
4. Arrange the order by dragging elements
5. Set background images and text for each tile
6. Save

The homepage is the first thing visitors see, so make it visually appealing with strong images and clear navigation.',
2, true, 'general'),

('e5000000-0000-0000-0000-000000000062', 'd1000000-0000-0000-0000-000000000046',
'How do I connect a custom domain to my website?',
'To use your own domain name (e.g., www.myyachtclub.com):

1. Go to Settings then Website Settings then Domain Management
2. Enter your custom domain name
3. Follow the DNS configuration instructions provided
4. The system will set up SSL certificates automatically
5. Once DNS propagates (usually within minutes to a few hours), your site will be accessible on your custom domain

You will need access to your domain''s DNS settings at your domain registrar to complete the setup.',
3, true, 'general'),

('e5000000-0000-0000-0000-000000000063', 'd1000000-0000-0000-0000-000000000046',
'How do I manage website pages and navigation?',
'To manage your website pages:

1. Go to Settings then Website Settings then Pages
2. View all existing pages
3. Click Add Page to create a new page
4. Use the page editor to add content using the drag-and-drop builder
5. Set the page title and URL slug
6. Choose whether the page appears in the main navigation menu
7. Reorder navigation items by dragging
8. Save and publish

You can create pages for About Us, Membership, Contact, Sailing Program, or any other content your club needs.',
4, true, 'general'),

('e5000000-0000-0000-0000-000000000064', 'd1000000-0000-0000-0000-000000000046',
'How do I choose which committee members appear on the website?',
'To control committee visibility:

1. Go to Settings then Committee Management
2. Click on each committee position
3. Toggle the Show on Website option
4. Save

Only positions with this option enabled will appear on your public website''s committee page. This is useful for showing key roles while keeping internal positions private.',
5, true, 'general');
