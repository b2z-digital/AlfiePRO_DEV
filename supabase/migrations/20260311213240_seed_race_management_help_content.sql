/*
  # Seed Race Management Help & Support Content

  ## Summary
  Inserts comprehensive Race Management documentation into:
  1. support_faq_categories - Creates a "Race Management" category
  2. support_faqs - Creates detailed FAQ articles for all Race Management features
  3. alfie_knowledge_documents - Creates AI-friendly knowledge base content for AskAlfie

  ## Coverage
  - Race Management overview
  - Creating One-Off (Single) Events
  - Creating Race Series
  - Handicap vs Scratch racing
  - Multi-day events
  - Scoring and results
  - Race Calendar
  - Touch Mode scoring
  - Importing results
  - DNS/DNF/DSQ codes
  - Drop scores / best of results

  ## Notes
  - All FAQs are published (is_published = true)
  - platform_area set to 'race_management' for filtering
  - AskAlfie documents use category 'general-knowledge' for platform how-to content
*/

-- ============================================================
-- 1. CREATE FAQ CATEGORY
-- ============================================================

INSERT INTO public.support_faq_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Race Management',
  'race-management',
  'How to create and manage races, series, scoring, results and the race calendar in AlfiePRO.',
  'Trophy',
  10,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. CREATE FAQ ARTICLES
-- ============================================================

-- FAQ 1: Overview
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'What is Race Management in AlfiePRO?',
  'Race Management is the core racing hub of AlfiePRO. It allows your club to create, manage, score, and publish race results for both individual events and ongoing race series.

From the Race Management section you can:
- **Create One-Off Events** – Single-day or multi-day standalone races
- **Create Race Series** – Multi-round seasonal series with automatic standings
- **Score Races Live** – Enter finishing positions, times, and penalty codes in real-time
- **Manage Handicaps** – Track and update each skipper''s handicap throughout the season
- **Publish Results** – Share results publicly or with your club members
- **View the Race Calendar** – A unified calendar of all upcoming and past events

Access Race Management from the left navigation under the **Racing** section.',
  1,
  true,
  'race_management',
  ARRAY['overview', 'getting started', 'race management', 'intro']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 2: Creating a One-Off Event
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'How do I create a one-off (single) race event?',
  'A one-off event is a standalone race that is not part of a series — for example, a club championship day, a regatta, or a fun race.

**To create a one-off event:**

1. Navigate to **Race Management** in the left sidebar under Racing
2. Click the **+ New Event** button (or select the One-Off Race tab)
3. Fill in the event details:
   - **Event Name** – Give your event a descriptive name (e.g., "Summer Club Championship")
   - **Date** – Select the race date
   - **Venue** – Choose from your saved venues or type a location
   - **Boat Class** – Select the yacht class racing (e.g., Marblehead, 10 Rater, DF95)
   - **Race Format** – Choose Handicap or Scratch (see separate FAQ)
4. Optionally set:
   - **Multi-Day** – Toggle on if the event runs across multiple days
   - **Entry Fee** – Set a fee if applicable (requires Stripe integration)
   - **Inter-club** – Toggle if another club is participating
   - **Notice of Race** – Upload your NOR document
   - **Sailing Instructions** – Upload your SI document
5. Click **Save Event**

Once saved, the event appears in your Race Calendar and Race Management list where you can begin scoring.',
  2,
  true,
  'race_management',
  ARRAY['one-off race', 'create event', 'single race', 'new event', 'race setup']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 3: Creating a Race Series
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'How do I create a Race Series?',
  'A Race Series is a multi-round competition where results accumulate across rounds to produce a season standings/leaderboard. Perfect for weekly club racing or seasonal championships.

**To create a Race Series:**

1. Go to **Race Management** → click the **Race Series** tab
2. Click **+ New Series**
3. Enter the series details:
   - **Series Name** – e.g., "2025 Summer Series" or "Marblehead Season 1"
   - **Boat Class** – The yacht class competing
   - **Race Format** – Handicap or Scratch
   - **Drop Scores** – How many worst scores each skipper can drop (e.g., set 2 to drop worst 2 rounds)
4. Add rounds:
   - Click **+ Add Round**
   - For each round set the date, venue, and round name
   - You can add as many rounds as needed
5. Click **Save Series**

**Managing an active series:**
- Each round can be scored individually as the season progresses
- The series leaderboard updates automatically after each round is scored
- Rounds can be marked as cancelled (with a reason) without affecting the series structure
- You can edit the series at any time to add, remove, or update rounds

**Series Leaderboard:**
The leaderboard is automatically calculated from all scored rounds. If drop scores are configured, the system automatically excludes the worst-performing rounds for each skipper when calculating their total points.',
  3,
  true,
  'race_management',
  ARRAY['race series', 'series setup', 'multi-round', 'season', 'leaderboard', 'standings', 'drop scores']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 4: Handicap vs Scratch
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000001',
  'What is the difference between Handicap and Scratch racing?',
  'AlfiePRO supports two race formats: **Handicap** and **Scratch**. You choose the format when setting up an event or series.

---

**Handicap Racing**

In handicap racing, each skipper has a personal handicap number that adjusts their finishing position or time to level the playing field between boats of different speeds or skill levels.

- Skippers are assigned an individual handicap value
- The handicap adjusts race scores to give all competitors a fair chance
- Handicaps are updated after each race based on performance (in RRS Appendix E or club-defined adjustment rules)
- The corrected score/position is what counts toward standings
- AlfiePRO automatically calculates corrected positions using the stored handicaps
- View and manage each skipper''s handicap history from their profile in the race scoring view

*Best for:* Mixed fleets, development fleets, or clubs wanting to encourage participation across all skill levels.

---

**Scratch Racing**

In scratch racing, all boats race on equal terms — the first boat to finish wins, with no time or position corrections applied.

- Finishing positions are taken as-is
- No handicap adjustments
- Pure fleet racing — fastest boat wins
- Results are entered as finish order (1st, 2nd, 3rd, etc.)

*Best for:* One-design racing where all boats are identical class, or when handicaps are not used.

---

**Which should I use?**

Most RC yacht clubs use Handicap racing due to the varied experience levels of skippers. If your club races a strict one-design fleet (all boats identical), Scratch may be more appropriate. You can set different formats for different series or events.',
  4,
  true,
  'race_management',
  ARRAY['handicap', 'scratch', 'race format', 'corrected time', 'one design', 'handicap adjustment']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 5: Scoring a Race
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000001',
  'How do I score a race and enter results?',
  'AlfiePRO offers two ways to score a race: the standard scoring view and Touch Mode (optimised for tablets/phones at the waterfront).

---

**Standard Scoring:**

1. Open the event from **Race Management** or the **Race Calendar**
2. Click **Start Scoring** or open the event and navigate to the scoring section
3. You will see a list of all registered skippers for the event
4. For each race within the event:
   - Enter each skipper''s finishing position (1, 2, 3...) or finishing time
   - Assign penalty codes where needed (DNS, DNF, DSQ, etc.)
   - Click **Save Race** to store the results
5. Repeat for each race run during the event
6. When scoring is complete, click **Publish Results** to make them visible

---

**Touch Mode (recommended for waterfront use):**

Touch Mode is optimised for scoring at the waterside on a tablet or mobile device. It provides large tap targets and a streamlined interface.

1. Open the event and click **Touch Mode** (or the finger/touch icon)
2. As boats finish, tap their name/number in order
3. The system records the finish order in real-time
4. Penalty codes can be applied by long-pressing or tapping the skipper name
5. Save each race as you complete it

---

**After scoring:**
- Results are saved automatically as you enter them
- The series leaderboard updates immediately for series events
- Use **Share Results** to post to social media or email to members
- Results can be printed or exported to PDF',
  5,
  true,
  'race_management',
  ARRAY['scoring', 'enter results', 'touch mode', 'finish order', 'race results', 'publish results']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 6: DNS/DNF/DSQ codes
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000001',
  'What do the scoring codes DNS, DNF, DSQ, RET, OCS mean?',
  'AlfiePRO uses standard Racing Rules of Sailing (RRS) scoring codes for non-finishers and penalty situations. These codes are available when scoring any race.

---

**Common Scoring Codes:**

| Code | Full Name | Meaning | Score |
|------|-----------|---------|-------|
| **DNS** | Did Not Start | Skipper did not start the race | Scored as DNF (N+1 where N = starters) |
| **DNF** | Did Not Finish | Skipper started but did not finish | N+1 points (number of starters + 1) |
| **DSQ** | Disqualified | Skipper was disqualified (protest) | N+1 points |
| **RET** | Retired | Skipper retired from the race | N+1 points |
| **OCS** | On Course Side | Skipper was over the start line early | N+1 points |
| **DNC** | Did Not Compete | Skipper did not compete in the series event | N+1 points |
| **BFD** | Black Flag Disqualified | Disqualified under rule 30.4 | N+1 points |

---

**How to apply a scoring code:**

1. In the scoring view, find the skipper in the results list
2. Instead of entering a finish position, select the appropriate code from the dropdown or tap the code button in Touch Mode
3. AlfiePRO automatically calculates the correct penalty score based on the number of starters

---

**Drop Scores:**
Penalty scores (DNS, DNF, DSQ etc.) are eligible to be dropped if your series has drop scores configured. The system automatically handles this in the leaderboard calculation.',
  6,
  true,
  'race_management',
  ARRAY['DNS', 'DNF', 'DSQ', 'OCS', 'RET', 'scoring codes', 'penalty', 'disqualified', 'did not start', 'did not finish']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 7: Multi-Day Events
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000007',
  'a1000000-0000-0000-0000-000000000001',
  'How do I set up a multi-day race event?',
  'Multi-day events are events that run across more than one day — for example, a 3-day regatta or a weekend championship.

**To create a multi-day event:**

1. Go to **Race Management** → **+ New Event**
2. Set the event name, start date, boat class and race format as normal
3. Toggle on **Multi-Day Event**
4. Set the **Number of Days** (e.g., 2 for a weekend event, 3 for a long weekend)
5. The end date is calculated automatically
6. Save the event

**Scoring multi-day events:**

When you open a multi-day event for scoring, you will see day tabs (Day 1, Day 2, etc.). Each day can have multiple races scored independently. The overall results combine all races from all days.

**Tips for multi-day events:**
- You can score Day 1 in the evening and continue with Day 2 the next morning
- Results from previous days are saved and cannot be accidentally overwritten
- The overall event leaderboard shows cumulative points across all days
- Import results for individual days if you are entering them after the event

**Live Tracking:** Multi-day events can have Live Tracking enabled so spectators can follow racing in real-time from anywhere.',
  7,
  true,
  'race_management',
  ARRAY['multi-day', 'regatta', 'multi day event', 'weekend racing', 'multiple days']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 8: Drop Scores
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000008',
  'a1000000-0000-0000-0000-000000000001',
  'How do drop scores work in a race series?',
  'Drop scores allow skippers to exclude their worst-performing races from their series total, which helps account for days when a skipper couldn''t attend or had a particularly bad race.

**Setting up drop scores:**

When creating or editing a Race Series:
1. Find the **Drop Scores** field
2. Enter the number of races each skipper can drop (e.g., enter 2 to allow 2 drops)
3. Save the series

**How drop scores are calculated:**

- AlfiePRO automatically identifies each skipper''s worst-scoring races
- Those races are excluded from the series total
- The leaderboard always reflects the best-of-N calculation
- Dropped races are visually indicated in the results table (shown in grey or with a strikethrough)

**Important notes:**
- Drop scores apply equally to all skippers in the series
- Penalty scores (DNS, DNF, DSQ) can also be dropped if they are among the worst scores
- A minimum number of races must typically be sailed for drops to apply (this follows standard RRS practice)
- You can change the drop score setting mid-season and the leaderboard will recalculate immediately

**Example:**
A 10-round series with 2 drop scores means each skipper''s best 8 rounds count toward their final total.',
  8,
  true,
  'race_management',
  ARRAY['drop scores', 'discard', 'worst scores', 'series standings', 'best of', 'drops']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 9: Handicap Management
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000009',
  'a1000000-0000-0000-0000-000000000001',
  'How do I manage skipper handicaps?',
  'In handicap racing, each skipper has an individual handicap value. AlfiePRO tracks and manages these handicaps, updating them as races are sailed.

**Viewing handicaps:**

1. Open any handicap-format event or series
2. In the scoring view, each skipper''s current handicap is shown next to their name
3. Click on a skipper to view their full handicap history and performance graphs

**Updating handicaps:**

Handicaps can be updated in two ways:

**Automatic adjustment (post-race):**
- After scoring a race, AlfiePRO can automatically suggest handicap adjustments based on performance
- In Touch Mode, a handicap review screen appears after each race showing recommended changes
- Review and accept or modify the suggested changes

**Manual adjustment:**
1. Open the event scoring view
2. Click the skipper''s handicap value
3. Enter the new handicap value
4. Save the change

**HMS (Handicap Management System):**
AlfiePRO supports RRS Appendix E handicap adjustment rules. The system calculates whether a skipper should move up or down based on their finishing position relative to their handicap. This is often called the "HMS" system and is commonly used in RC yacht racing worldwide.

**Initial handicaps:**
When adding a new skipper to the system, set their initial handicap in their member profile. New skippers are typically started at a standard value (e.g., 1000 in some systems, or club-defined starting point).

**Handicap history:**
Every change to a skipper''s handicap is logged with the date and race, giving a complete audit trail of their development over time.',
  9,
  true,
  'race_management',
  ARRAY['handicap', 'handicap management', 'HMS', 'handicap adjustment', 'skipper handicap', 'corrected time', 'handicap history']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 10: Race Calendar
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000001',
  'How does the Race Calendar work?',
  'The Race Calendar gives you a unified view of all your club''s upcoming and past race events, including both one-off events and series rounds.

**Accessing the Race Calendar:**
- Click **Race Calendar** in the left sidebar under Racing
- Or access it from the Dashboard quick links

**Calendar Views:**

The Race Calendar offers multiple viewing modes:
- **List View** – A chronological list of all events (default)
- **Grid View** – A condensed card grid
- **Month View** – Traditional calendar grid by month
- **Year View** – Full-year overview

**Filtering the calendar:**
- Toggle between **Upcoming** and **Past** events
- Filter by race format (Handicap / Scratch)
- Filter by boat class
- Filter by event type (Club / Public events)
- Filter to show **Events**, **Meetings**, or **All** items

**Meeting integration:**
The Race Calendar also shows scheduled club meetings alongside race events, giving you a complete picture of your club''s schedule in one place.

**Public events:**
Events that have been published publicly appear in a different colour and can be seen by non-members on your club''s public website.

**Subscribing to the calendar:**
Members can subscribe to the race calendar via iCal/Google Calendar to get automatic updates in their personal calendar apps.

**Event actions from the calendar:**
- Click any event to view its details and results
- Jump straight into scoring from the calendar
- Share events to social media
- Export events to PDF or image',
  10,
  true,
  'race_management',
  ARRAY['race calendar', 'calendar view', 'upcoming events', 'schedule', 'ical', 'google calendar', 'month view']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 11: Importing Results
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000011',
  'a1000000-0000-0000-0000-000000000001',
  'Can I import race results from a CSV or spreadsheet?',
  'Yes. AlfiePRO supports importing race results from CSV files, which is useful when you have results from an external timing system, a spreadsheet, or a previous race management system.

**Importing results:**

1. Open the event or series round you want to import results for
2. Click the **Import Results** button (upload/import icon)
3. Select or drag-and-drop your CSV file
4. The import wizard will display a preview of the data
5. Map the columns in your file to AlfiePRO fields (skipper name, position, time, etc.)
6. Review any errors or unmatched skippers
7. Confirm and import

**CSV Format requirements:**
The import accepts flexible column formats, but your file should generally include:
- Skipper name or sail number
- Finishing position or finishing time
- Any penalty codes (DNS, DNF, etc.)

**Name matching:**
AlfiePRO will try to match imported names to existing skippers in your member database. Where names don''t match exactly, you can manually map them using the **Name Mapping** tool (found under Racing → Name Mapping in super admin tools).

**After importing:**
- Verify the imported results look correct in the preview
- Results can be edited manually after import if adjustments are needed
- The series leaderboard updates immediately after import

**Supported formats:**
- CSV (comma-separated values)
- Some timing systems export directly compatible files — contact support if you need help with your specific format.',
  11,
  true,
  'race_management',
  ARRAY['import results', 'CSV', 'spreadsheet', 'import', 'name mapping', 'timing system']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 12: Sharing and Publishing Results
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000012',
  'a1000000-0000-0000-0000-000000000001',
  'How do I share or publish race results?',
  'AlfiePRO makes it easy to share race results with your members, the public, and on social media.

**Publishing results:**

1. Once you have finished scoring a race or event, click **Publish Results**
2. Choose the visibility:
   - **Club Members Only** – Only logged-in club members can view
   - **Public** – Results appear on your club''s public website and are accessible to anyone

**Sharing options after publishing:**

**Share as Image/PDF:**
- Click the **Share** or **Export** button on the results page
- Choose to generate a results image (great for posting to social media)
- Or export as a formatted PDF for email or printing

**Share to Social Media:**
- If you have connected Facebook or Instagram in Integrations, you can post directly from the results screen
- Generate a results image and post with a single click
- Customise the caption before posting

**Share via Link:**
- Copy the direct link to the results page
- Share in your club''s WhatsApp group, email newsletter, or website

**Email to Members:**
- Use the **Communications** section to email race results to all club members
- Attach the results PDF or include a link

**Race Report:**
- AlfiePRO can generate an AI-powered race report/summary
- Click **Generate Report** on any completed event
- Edit and customise the report before publishing it as a club news article',
  12,
  true,
  'race_management',
  ARRAY['share results', 'publish results', 'social media', 'export results', 'PDF', 'race report', 'public results']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 13: Live Tracking
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000013',
  'a1000000-0000-0000-0000-000000000001',
  'What is Live Tracking and how do I enable it for a race?',
  'Live Tracking allows spectators, club members, and remote followers to watch race results update in real-time during an event — without needing to be at the venue.

**What Live Tracking shows:**
- Current race standings as results are entered
- Skipper positions updating live as each race progresses
- Heat assignments and race status
- Handicap information (if enabled)

**Enabling Live Tracking for an event:**

1. When creating or editing a race event, toggle **Enable Live Tracking** to ON
2. A unique QR code and shareable link are generated for the event
3. Share the link or QR code with spectators and online followers
4. As you score the race using the standard or Touch Mode scoring, the live tracking page updates automatically

**The Live Dashboard:**
The public Live Dashboard shows:
- Current race in progress
- Real-time leaderboard
- Skipper names and handicaps
- Race-by-race results as they are saved

**Sharing the live link:**
- Post the QR code on social media before the event
- Include the link in your event announcement
- Display the QR code on a screen at your club for on-site spectators

**No login required:**
Spectators can view the live tracking page without needing an AlfiePRO account — it is publicly accessible via the unique event link.

**Live Tracking is available on:** Standard events, series rounds, and multi-day events.',
  13,
  true,
  'race_management',
  ARRAY['live tracking', 'real-time results', 'spectators', 'QR code', 'live dashboard', 'remote viewing']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 14: Touch Mode
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000014',
  'a1000000-0000-0000-0000-000000000001',
  'What is Touch Mode scoring and when should I use it?',
  'Touch Mode is AlfiePRO''s waterfront-optimised scoring interface, designed for use on a tablet or smartphone while standing at the water''s edge during racing.

**When to use Touch Mode:**
- Scoring races in real-time at the venue
- When you need large, easy-to-tap buttons (especially with gloves or in the wind)
- When you want to record finish order as boats cross the line
- When you want immediate handicap review after each race

**How Touch Mode works:**

1. Open your race event and tap **Touch Mode** (finger/touch icon in the top right)
2. You will see all skippers displayed as large tappable cards
3. As each boat finishes, tap their card in finishing order
4. The system records the order automatically
5. Apply penalty codes by tapping and holding (long press) a skipper card
6. When all boats have finished (or the race is called), tap **End Race**

**Post-race handicap review:**
After each race in handicap format, Touch Mode shows a handicap review screen:
- Displays each skipper''s suggested new handicap based on their performance
- You can accept all changes or modify individual adjustments
- Confirm to save and move to the next race

**Touch Mode features:**
- Large tap targets optimised for mobile/tablet
- Auto-scroll so recently tapped skippers move to the bottom
- Visual countdown timer support
- Heat assignment display (for HMS/heat-based racing)
- Works offline if internet connection is interrupted at the venue

**Switching between modes:**
You can switch between Standard and Touch Mode at any time without losing data.',
  14,
  true,
  'race_management',
  ARRAY['touch mode', 'waterfront scoring', 'tablet scoring', 'mobile scoring', 'finish order', 'real-time scoring']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 15: HMS and Heat Racing
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000015',
  'a1000000-0000-0000-0000-000000000001',
  'What is HMS heat racing and how does it work?',
  'HMS (Handicap Management System) is a structured heat-based racing format used widely in RC yacht racing, particularly in Australia. It divides skippers into heats based on their handicap, so each heat contains boats of similar ability.

**How HMS works:**

1. Skippers are grouped into heats based on their current handicap (A heat = top skippers, B heat = next group, etc.)
2. Each heat races separately (e.g., Heat A races first, then Heat B)
3. Within each heat, boats race scratch (no handicap adjustments mid-heat)
4. Points are awarded within each heat (1st place in a heat gets different points than 1st place overall)
5. At the end of the event, overall standings are calculated from all heat results
6. Handicaps are adjusted after each race to promote or relegate skippers between heats over time

**Setting up HMS in AlfiePRO:**

1. Create a handicap-format event or series
2. Use the **Heat Assignment** tool to allocate skippers to heats
3. AlfiePRO can auto-seed heats based on current handicaps (use the **Auto-Seed** button)
4. Manually adjust heat assignments if needed
5. Score each heat separately using Touch Mode or standard scoring
6. After all heats are scored, view the overall results

**Promotion and relegation:**
After each event, HMS allows you to promote and relegate skippers between heats based on performance, keeping heats competitive and balanced throughout the season.

**HMS Validator:**
Super admin users have access to the **HMS Validator** tool which checks for compliance with HMS rules and scoring validity.',
  15,
  true,
  'race_management',
  ARRAY['HMS', 'heat racing', 'heats', 'heat assignment', 'promotion', 'relegation', 'seeding', 'heat based racing']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 16: Venues
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000016',
  'a1000000-0000-0000-0000-000000000001',
  'How do I add and manage venues for race events?',
  'Venues in AlfiePRO represent the physical locations where races are held — a lake, reservoir, park pond, or any other sailing venue. Once saved, venues can be quickly selected when creating events.

**Adding a new venue:**

1. Navigate to **Racing → Venues** in the left sidebar
2. Click **+ Add Venue**
3. Fill in the venue details:
   - **Venue Name** – e.g., "Centennial Park Pond" or "Lake Burley Griffin"
   - **Address / Location** – Full address or description
   - **GPS Coordinates** – Optional, enables map display for members
   - **Description** – Notes about the venue (parking, facilities, access)
   - **Cover Image** – Upload a photo of the venue
4. Save the venue

**Using a venue in a race:**
- When creating any event, the Venue field shows a dropdown of all saved venues
- Select from the list or type to search
- The venue''s details (including location map if GPS is set) will appear on the event page

**Venue details page:**
Each venue has its own public details page showing:
- Location map
- Upcoming events at the venue
- Past results from events held there
- Photos and description

**Club venues vs. global venues:**
Your club-specific venues are only visible to your club. Publicly listed venues may also appear if your club has been linked to a state or national association.',
  16,
  true,
  'race_management',
  ARRAY['venues', 'add venue', 'venue management', 'race location', 'GPS', 'venue details']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 17: Inter-Club Racing
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000017',
  'a1000000-0000-0000-0000-000000000001',
  'How do I set up an inter-club race with another club?',
  'Inter-club races involve skippers from two or more clubs competing together. AlfiePRO supports this with the inter-club toggle on any event.

**Setting up an inter-club event:**

1. Create a new event (One-Off or Series round)
2. Toggle **Inter-Club Race** to ON
3. Select the other club from the dropdown (clubs must be in the AlfiePRO platform)
4. Save the event

**What this enables:**
- Skippers from the other club can be added to the event
- Results show club affiliation for each skipper
- Both clubs can view the shared event and results
- Combined results display all skippers regardless of club

**Inviting the other club:**
Once the inter-club event is set up, the other club''s admin will see it listed as an inter-club event. You can also use the **Event Invitations** feature to formally invite clubs and their members to register for the event.

**Results and reporting:**
Inter-club results can be filtered by club in the results view, allowing you to see your club''s performance relative to the other club''s skippers.',
  17,
  true,
  'race_management',
  ARRAY['inter-club', 'interclub', 'multiple clubs', 'combined fleet', 'visiting club', 'inter club racing']
)
ON CONFLICT (id) DO NOTHING;

-- FAQ 18: Race Reports
INSERT INTO public.support_faqs (id, category_id, question, answer, sort_order, is_published, platform_area, tags)
VALUES (
  'b1000000-0000-0000-0000-000000000018',
  'a1000000-0000-0000-0000-000000000001',
  'How do I generate and publish a race report?',
  'AlfiePRO can automatically generate a race report/write-up for any completed event using AI. This report can then be published as a club news article.

**Generating a race report:**

1. Open a completed event from Race Management or the Race Calendar
2. Click the **Generate Report** or **Create Report** button (document icon)
3. AlfiePRO''s AI generates a narrative summary of the event including:
   - Winner and top finishers
   - Race conditions (if entered)
   - Notable performances
   - Handicap movements
4. Review and edit the generated text as needed
5. Add photos from your media library
6. Click **Publish** to post it as a club news article

**Report options:**
- Choose to publish immediately or save as a draft
- Add custom notes or quotes from skippers
- Include the results table automatically
- Select which photos to feature

**Sharing the report:**
Once published, the race report appears on your club''s public news feed (if set to public) and in the member news section. You can share the report link directly or post it to social media.

**Manual race reports:**
If you prefer to write your own report, navigate to **Content → News** and create a new article. You can manually link it to an event and include results.',
  18,
  true,
  'race_management',
  ARRAY['race report', 'event report', 'AI report', 'write up', 'news article', 'publish report']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CREATE ALFIE KNOWLEDGE DOCUMENT FOR RACE MANAGEMENT
-- ============================================================

INSERT INTO public.alfie_knowledge_documents (id, title, category, content_text, is_active, processing_status)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'AlfiePRO Race Management – Complete Guide',
  'general-knowledge',
  'AlfiePRO Race Management System – Complete Guide

OVERVIEW
--------
Race Management is the core racing hub of AlfiePRO. It allows clubs to create, manage, score, and publish race results for both individual events and ongoing race series. Access it from the left navigation under "Racing > Race Management".

Key features:
- Create One-Off Events (single-day or multi-day standalone races)
- Create Race Series (multi-round seasonal series with automatic standings)
- Score races live in real-time using standard or Touch Mode
- Manage individual skipper handicaps with full history
- Publish and share results publicly or to club members only
- View a unified Race Calendar combining all events, series rounds, and meetings
- Live Tracking for remote spectators
- AI-generated race reports


CREATING A ONE-OFF RACE EVENT
-------------------------------
A one-off event is a standalone race not part of a series (e.g., club championship, regatta, fun race).

Steps:
1. Navigate to Race Management in the left sidebar under Racing
2. Click "+ New Event" or the One-Off Race tab
3. Fill in: Event Name, Date, Venue (select from saved venues or type a location), Boat Class (e.g., Marblehead, 10 Rater, DF95), Race Format (Handicap or Scratch)
4. Optional: Multi-Day toggle, Entry Fee, Inter-Club toggle, Notice of Race upload, Sailing Instructions upload
5. Click Save Event

The event then appears in the Race Calendar and Race Management list for scoring.


CREATING A RACE SERIES
------------------------
A Race Series is a multi-round competition with accumulating standings across rounds. Used for weekly club racing or seasonal championships.

Steps:
1. Go to Race Management > Race Series tab
2. Click "+ New Series"
3. Enter: Series Name, Boat Class, Race Format (Handicap/Scratch), Drop Scores (number of worst races to exclude)
4. Add rounds: Click "+ Add Round" for each round, set date, venue, round name
5. Save Series

The series leaderboard updates automatically after each round is scored. Drop scores are applied automatically — the system excludes the worst-performing races for each skipper when calculating totals.

Example: A 10-round series with 2 drops means each skipper''s best 8 rounds count.


HANDICAP VS SCRATCH RACING
----------------------------
Handicap Racing: Each skipper has a personal handicap value that adjusts their score to level the playing field. AlfiePRO calculates corrected positions automatically. Handicaps update after each race based on performance. Best for mixed fleets or development racing.

Scratch Racing: All boats race on equal terms — no adjustments. Finishing position is the final position. Best for strict one-design fleets where all boats are identical.

Most RC yacht clubs use Handicap racing due to varied skipper experience levels.


SCORING A RACE
---------------
Two methods available:

Standard Scoring:
1. Open the event from Race Management or Race Calendar
2. Click "Start Scoring"
3. For each skipper: enter finishing position or time, apply penalty codes as needed
4. Click "Save Race" to store results
5. Repeat for each race in the event
6. Click "Publish Results" when complete

Touch Mode (recommended for waterfront use on tablet/phone):
1. Open event and click "Touch Mode" (touch/finger icon)
2. As boats finish, tap their name in order — finish order is recorded in real-time
3. Apply penalties by long-pressing a skipper name
4. Save each race as completed
5. After each race in handicap format: review and confirm handicap adjustments in the post-race screen


SCORING CODES (DNS, DNF, DSQ etc.)
-------------------------------------
Standard Racing Rules of Sailing (RRS) penalty codes:

DNS (Did Not Start) – Skipper did not start. Scored as N+1 (starters + 1 points).
DNF (Did Not Finish) – Started but did not finish. Scored as N+1 points.
DSQ (Disqualified) – Disqualified following protest. Scored as N+1 points.
RET (Retired) – Retired from the race. Scored as N+1 points.
OCS (On Course Side) – Over the start line early. Scored as N+1 points.
DNC (Did Not Compete) – Did not compete in series event. Scored as N+1 points.
BFD (Black Flag Disqualified) – Disqualified under RRS rule 30.4. Scored as N+1 points.

In scoring view: find the skipper, select the code from the dropdown instead of entering a position. AlfiePRO calculates the penalty score automatically.

Penalty scores are eligible to be dropped if the series has drop scores configured.


DROP SCORES
-----------
Drop scores let skippers exclude their worst races from their series total.

Setup: In series creation/editing, set the "Drop Scores" field to the number of races to drop.

How it works: AlfiePRO automatically identifies each skipper''s worst-scoring races and excludes them from totals. Leaderboard always reflects best-of-N. Dropped races appear visually in the results table (greyed out or strikethrough). Applies equally to all skippers. Recalculates immediately if the setting is changed.


HANDICAP MANAGEMENT (HMS)
--------------------------
Viewing handicaps: Open any handicap-format event. Each skipper''s current handicap is shown in the scoring view. Click a skipper to view their full handicap history and performance graphs.

Updating handicaps:
- Automatic: After scoring, AlfiePRO suggests adjustments based on performance. Touch Mode shows a handicap review screen after each race.
- Manual: In the scoring view, click the skipper''s handicap value to edit it.

AlfiePRO supports RRS Appendix E handicap adjustment rules (commonly called the HMS system in RC yacht racing). Every change is logged with date and race for a complete audit trail.


HMS HEAT RACING
---------------
HMS is a heat-based racing format used widely in RC yacht racing, especially in Australia. Skippers are divided into heats by handicap (A heat = top skippers, B heat = next group, etc.).

How it works:
1. Skippers grouped into heats by current handicap
2. Each heat races separately (Heat A first, then Heat B, etc.)
3. Boats race scratch within their heat
4. Points awarded per heat and overall
5. Handicaps adjusted after each race for promotion/relegation between heats

Setting up in AlfiePRO:
1. Create a handicap event/series
2. Use Heat Assignment tool to allocate skippers to heats
3. Click "Auto-Seed" to automatically assign heats by handicap
4. Adjust manually if needed
5. Score each heat separately using Touch Mode or standard scoring

After events: Use promotion/relegation to move skippers between heats, keeping racing competitive.


MULTI-DAY EVENTS
-----------------
Create events spanning multiple days (e.g., 2-day regatta, 3-day championship).

Setup: When creating an event, toggle "Multi-Day Event" on, set number of days. End date is calculated automatically.

Scoring: Each day has its own tab (Day 1, Day 2, etc.). Each day can have multiple races. Overall results combine all races across all days. Days can be scored independently — return the next morning to continue.


LIVE TRACKING
-------------
Live Tracking lets spectators and remote followers see results update in real-time during racing. No AlfiePRO account required to view.

Enable: Toggle "Enable Live Tracking" when creating/editing an event. A unique QR code and shareable link are generated.

Share: Post QR code on social media, include the link in event announcements, or display it on-screen at the venue.

What it shows: Current race standings, skipper positions updating live, heat assignments, race status, handicap information.

Works with: Standard events, series rounds, multi-day events.


RACE CALENDAR
--------------
Access from: Racing > Race Calendar in the left sidebar.

Views available: List (chronological), Grid (card layout), Month (traditional calendar), Year (full-year overview).

Features:
- Toggle between Upcoming and Past events
- Filter by race format, boat class, event type
- Filter to show Events, Meetings, or All items
- Click any event to view details and access scoring
- Subscribe via iCal/Google Calendar for automatic updates in personal calendar apps
- Share events to social media or export as PDF/image

Meetings also appear in the Race Calendar alongside race events.


IMPORTING RESULTS
------------------
Import race results from CSV files (useful for external timing systems or spreadsheets).

Steps:
1. Open the event or series round
2. Click "Import Results" (upload icon)
3. Select or drag-and-drop CSV file
4. Map columns to AlfiePRO fields (skipper name, position, time, penalty codes)
5. Review errors or unmatched skippers
6. Confirm and import

CSV should include: skipper name or sail number, finishing position or time, penalty codes.

Name Mapping: AlfiePRO matches imported names to existing members. Unmatched names can be manually mapped using the Name Mapping tool (Racing > Name Mapping in super admin tools).


SHARING AND PUBLISHING RESULTS
--------------------------------
After scoring, click "Publish Results" and choose visibility: Club Members Only or Public (appears on club website).

Sharing options:
- Share as Image or PDF (click Share/Export button)
- Post directly to Facebook or Instagram (requires integration setup in Settings > Integrations)
- Copy and share direct link
- Email to members via Communications section
- Generate AI race report to publish as club news article

Race Reports: Click "Generate Report" on any completed event. AI generates a narrative summary (winner, top finishers, notable performances, handicap movements). Edit as needed and publish as a club news article.


VENUES
-------
Access from: Racing > Venues in the left sidebar.

Adding a venue:
1. Click "+ Add Venue"
2. Enter: Venue Name, Address/Location, GPS Coordinates (optional, enables map display), Description, Cover Image
3. Save

Venues are then available in the Venue dropdown when creating any race event. Each venue has its own details page with location map, upcoming events, past results, and photos.


INTER-CLUB RACING
------------------
Set up races involving skippers from multiple clubs.

Steps:
1. Create a new event
2. Toggle "Inter-Club Race" to ON
3. Select the other club from the dropdown
4. Save

This enables skippers from both clubs to be added, results show club affiliation, and both clubs can view the shared event. Results can be filtered by club in the results view.


NOTICE OF RACE AND SAILING INSTRUCTIONS
-----------------------------------------
When creating an event, you can upload two key race documents:

Notice of Race (NOR): The official notice announcing the race, its conditions, and entry requirements. Upload as PDF when creating the event.

Sailing Instructions (SI): The detailed instructions that govern how the race will be conducted. Upload as PDF when creating the event.

Both documents are accessible to all registered competitors from the event details page and are displayed on the event website if a public event website has been set up.


RACE DOCUMENTS (NOR GENERATOR)
--------------------------------
AlfiePRO includes a Notice of Race Generator that creates professional NOR documents using your club and event information.

Access: From a race event, click "Generate NOR" or go to Resources > Race Documents.

The generator uses customisable templates and auto-fills your club name, event details, dates, and venue. Export as PDF for distribution.


RESULTS PAGE
-------------
Access from: Racing > Results in the left sidebar.

The Results page shows all completed race events. For each event:
- Click to view full results table
- See individual race breakdowns
- View series standings (for series events)
- Access skipper performance graphs
- Download/export results
- Share results

Results are visible to: club members (always), and public (if published publicly).


GETTING STARTED CHECKLIST FOR RACE MANAGEMENT
-----------------------------------------------
1. Add your racing venue(s) under Racing > Venues
2. Ensure your skippers are added as club members with boat class and starting handicap set
3. Create your first event: one-off race or series
4. Test scoring with a practice event before your first real race day
5. Enable Live Tracking on your event so spectators can follow along
6. After racing, publish results and share with your community
7. Use Touch Mode at the waterfront for the smoothest scoring experience',
  true,
  'completed'
)
ON CONFLICT (id) DO NOTHING;

-- Create a chunk for the knowledge document
INSERT INTO public.alfie_knowledge_chunks (id, document_id, content, chunk_index, source_type)
VALUES (
  'd1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'AlfiePRO Race Management Overview: Race Management is the core racing hub allowing clubs to create, manage, score, and publish race results. Features include: One-Off Events (standalone races), Race Series (multi-round with automatic standings), live scoring via standard or Touch Mode, handicap management, results publishing, Race Calendar, Live Tracking for spectators, and AI race reports. Access from left navigation under Racing > Race Management.',
  0,
  'document'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alfie_knowledge_chunks (id, document_id, content, chunk_index, source_type)
VALUES (
  'd1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000001',
  'Creating events in AlfiePRO: One-Off Event = standalone race not part of series. Steps: Race Management > +New Event > fill in Event Name, Date, Venue, Boat Class, Race Format (Handicap or Scratch) > Save. Optional fields: Multi-Day toggle, Entry Fee, Inter-Club toggle, NOR upload, SI upload. Race Series = multi-round competition. Steps: Race Management > Race Series tab > +New Series > enter Series Name, Boat Class, Race Format, Drop Scores > Add Rounds with dates/venues > Save. Leaderboard updates automatically after each scored round.',
  1,
  'document'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alfie_knowledge_chunks (id, document_id, content, chunk_index, source_type)
VALUES (
  'd1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000001',
  'Handicap vs Scratch racing in AlfiePRO: Handicap Racing = each skipper has a personal handicap value, scores are adjusted to level the playing field, AlfiePRO auto-calculates corrected positions, handicaps update after each race. Best for mixed fleets. Scratch Racing = no adjustments, first to finish wins, pure fleet racing. Best for strict one-design fleets. Most RC yacht clubs use Handicap due to varied skill levels. Scoring codes: DNS (Did Not Start) = N+1 points, DNF (Did Not Finish) = N+1, DSQ (Disqualified) = N+1, RET (Retired) = N+1, OCS (On Course Side) = N+1, DNC (Did Not Compete) = N+1, BFD (Black Flag) = N+1. Penalty scores can be dropped if drop scores are configured.',
  2,
  'document'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alfie_knowledge_chunks (id, document_id, content, chunk_index, source_type)
VALUES (
  'd1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000001',
  'Touch Mode scoring in AlfiePRO: Waterfront-optimised interface for tablet/phone. Activate by opening event and tapping Touch Mode icon. Large tappable skipper cards shown. Tap cards in finishing order as boats cross line. Long-press to apply penalty codes. Tap End Race when done. After each race in handicap format, a handicap review screen appears showing suggested adjustments - accept all or modify individually. Touch Mode works offline if internet is interrupted. Can switch between Standard and Touch Mode at any time without losing data. HMS Heat Racing: Skippers divided into heats by handicap (A=top, B=next, etc). Each heat races separately in scratch format. Use Auto-Seed to assign heats automatically by handicap. Score each heat separately. After events, promote/relegate skippers between heats.',
  3,
  'document'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.alfie_knowledge_chunks (id, document_id, content, chunk_index, source_type)
VALUES (
  'd1000000-0000-0000-0000-000000000005',
  'c1000000-0000-0000-0000-000000000001',
  'Drop scores in AlfiePRO race series: Allow skippers to exclude worst races from series total. Setup: In series creation, set Drop Scores field to number of races to drop (e.g., 2 = drop 2 worst). System automatically identifies and excludes worst scores. Leaderboard reflects best-of-N calculation. Dropped races shown greyed out in results table. Applies equally to all skippers. Recalculates immediately if setting is changed. Example: 10-round series with 2 drops = best 8 rounds count. Live Tracking: Enable on any event for real-time spectator viewing. Toggle Enable Live Tracking when creating/editing event. Generates unique QR code and shareable link. No AlfiePRO account required to view. Shows current standings, skipper positions, heat assignments, race status. Share link on social media or display QR code at venue.',
  4,
  'document'
)
ON CONFLICT (id) DO NOTHING;
