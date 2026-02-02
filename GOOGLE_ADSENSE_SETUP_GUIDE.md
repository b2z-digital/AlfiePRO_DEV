# Google AdSense Integration Guide

This guide explains how to integrate Google AdSense ads into your Alfie advertising system using manual placements.

## Prerequisites

- Google AdSense account approved and active
- AdSense verification code already added to website header (✓ Done)

## Complete Setup Workflow

### Step 1: Create Ad Units in Google AdSense

1. Log into your **Google AdSense Dashboard**
2. Navigate to **Ads → By ad unit → Display ads**
3. Click **"Create new ad unit"**
4. Configure your ad unit:
   - **Ad unit name**: Give it a descriptive name (e.g., "Homepage Sidebar 300x250")
   - **Ad size**: Choose from standard sizes:
     - **300x250** - Medium Rectangle (most popular)
     - **728x90** - Leaderboard (desktop header/footer)
     - **336x280** - Large Rectangle
     - **320x100** - Large Mobile Banner
     - **160x600** - Wide Skyscraper (sidebar)
     - **Responsive** - Adapts to container size
   - **Ad type**: Display ads

5. Click **"Create"** and Google will generate ad code like:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX"
     crossorigin="anonymous"></script>
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-XXXXXXXXXX"
     data-ad-slot="YYYYYYYYYY"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```

6. **Copy this entire code snippet** - you'll need it in Step 2

### Step 2: Create AdSense Banner in Alfie

1. Go to **Advertising → Banners Tab**
2. Click **"Create Banner"**
3. Fill in the form:
   - **Campaign**: Select an existing campaign or create new one
   - **Banner Name**: Descriptive name (e.g., "AdSense - Homepage Sidebar")
   - **Ad Type**: Select **"Google AdSense"**
   - **AdSense Code**: Paste the entire ad unit code from Step 1
   - **Active**: Check this box
4. Click **"Create"**

**Note**: When you select "Google AdSense", the form automatically hides Click URL and dimension fields since AdSense handles these automatically.

### Step 3: Assign to Campaign

If you created a new banner without a campaign:

1. Go to **Advertising → Campaigns Tab**
2. Create or edit a campaign
3. Set the **Priority** (1-5, where 1 is highest)
   - Priority 1: Shown 5x more often than Priority 5
   - Priority 3: Medium rotation
   - Priority 5: Shown least often
4. Your AdSense banner will now compete with other banners based on this priority

### Step 4: Create or Use Existing Placements

Placements define WHERE ads appear on your site.

**Option A: Use Existing Placements**
Your site already has these placements configured:
- `homepage-hero` - Top of homepage
- `homepage-sidebar` - Right sidebar on homepage
- `article-top` - Above article content
- `article-bottom` - Below article content
- `results-top` - Above race results
- `results-sidebar` - Next to race results

**Option B: Create New Placement**
1. Go to **Advertising → Placements Tab**
2. Click **"Create Placement"**
3. Configure:
   - **Name**: Descriptive name (e.g., "Homepage Top Banner")
   - **Placement Key**: Unique identifier (e.g., "homepage-top")
   - **Page Type**: Where it appears (Homepage, Article, Results, etc.)
   - **Position**: Specific position on page
   - **Device Types**: Desktop, Tablet, Mobile (select all that apply)
   - **Active**: Check this box
4. Click **"Create"**

### Step 5: Assign Banners to Placements

There are two ways to do this:

**Method 1: Through Campaign**
1. Go to **Campaigns → Edit Campaign**
2. In the **Placements** section, check the placements where you want this campaign's ads to appear
3. All banners in this campaign (including AdSense) will rotate in these placements

**Method 2: Through Placement**
1. Go to **Placements → Edit Placement**
2. Assign specific campaigns to this placement
3. Set rotation priorities

### Step 6: Test Your Ads

1. Navigate to pages where you've added placements
2. Refresh the page multiple times - you should see:
   - AdSense ads rotating with your regular banner ads
   - Different ads based on the Share of Voice (SOV) priority system
   - Ads respect frequency capping (won't repeat immediately)

**Important Testing Notes:**
- AdSense ads may show as blank initially until Google approves them
- Use AdSense's ad preview tool to test without affecting metrics
- Check browser console for any AdSense errors

## Understanding Share of Voice (SOV)

Your system uses **weighted rotation** based on campaign priority:

- **Priority 1** (Highest): Gets shown **5x more** than Priority 5
- **Priority 2**: Gets shown **4x more** than Priority 5
- **Priority 3**: Gets shown **3x more** than Priority 5
- **Priority 4**: Gets shown **2x more** than Priority 5
- **Priority 5** (Lowest): Gets shown least frequently

### Example Scenario:
You have 3 banners in a placement:
- **AdSense Banner** (Priority 1) - 5 weight points
- **Sponsor Banner** (Priority 2) - 4 weight points
- **House Ad** (Priority 5) - 1 weight point

**Total weight**: 10 points

**Rotation breakdown**:
- AdSense shows **50%** of the time (5/10)
- Sponsor shows **40%** of the time (4/10)
- House Ad shows **10%** of the time (1/10)

## Advanced Features

### Frequency Capping
- System prevents the same ad from showing repeatedly
- Tracks last 5 shown ads per placement
- Rotates to different ads when available
- Single ads won't repeat until other content has been shown

### Smart Targeting
Ads can be targeted based on:
- **Device Type**: Desktop, tablet, mobile
- **Page Type**: Homepage, articles, results, etc.
- **Geographic**: State-level targeting
- **Club/Organization**: Show different ads per club

### Analytics Tracking
Every ad automatically tracks:
- **Impressions**: When ad becomes 50% visible
- **Clicks**: When user clicks the ad
- **CTR**: Click-through rate
- **By device, location, page type**

View analytics at: **Advertising → Analytics Tab**

## Best Practices

### 1. Strategic Placement Mixing
- Use **Priority 1** for AdSense on high-traffic pages
- Use **Priority 2-3** for paid sponsors
- Use **Priority 4-5** for house ads and fillers

### 2. Ad Unit Sizing
Common effective combinations:
- **Desktop**: 728x90 (leaderboard) or 300x250 (sidebar)
- **Mobile**: 320x100 or responsive units
- **Article content**: 336x280 inline ads

### 3. Placement Strategy
High-performing positions:
- Above the fold (visible without scrolling)
- Within content (after 1-2 paragraphs)
- End of content (after race results, articles)
- Sidebar (for desktop users)

### 4. Balance User Experience
- Don't show too many ads per page (2-3 max recommended)
- Ensure ads don't interrupt critical functionality
- Keep ads out of forms, payment flows, dashboards

### 5. Monitor Performance
- Check **Analytics Tab** weekly
- Compare AdSense vs regular banner CTR
- Adjust priorities based on performance
- Test different ad sizes and positions

## Troubleshooting

### AdSense Ads Not Showing
1. **Account Status**: Verify your AdSense account is approved
2. **Payment Setup**: Ensure payment info is complete in AdSense
3. **Site Policy**: Check that your site complies with AdSense policies
4. **Ad Balance**: In AdSense settings, ensure ad balance is set to show ads

### Ads Not Rotating
1. Check that multiple banners are assigned to the placement
2. Verify campaigns are active
3. Check campaign date ranges (start/end dates)
4. Clear browser cache and test

### AdSense Code Errors
1. Verify you copied the complete code snippet (all 3 parts)
2. Check browser console for JavaScript errors
3. Ensure AdSense client ID matches your account

### Tracking Not Working
1. Check browser ad blockers (disable for testing)
2. Verify placement IDs are correct
3. Check Analytics tab for data (may take a few minutes to appear)

## Adding Ads to Custom Pages

To add ad placements to your own custom pages, use the `<AdDisplay>` component:

```tsx
import { AdDisplay } from '../components/advertising/AdDisplay';

// In your component:
<AdDisplay
  placementId="your-placement-id" // Or use position prop
  pageType="homepage" // homepage, article, results, etc.
  state="NSW" // Optional: for geographic targeting
  clubId={clubId} // Optional: for club-specific ads
  className="my-4" // Optional: custom styling
/>
```

Example placements already configured in key locations:
- **Homepage**: Main content area
- **Articles**: Top and bottom of content
- **Race Results**: Above results table
- **News Pages**: Sidebar and inline

## Revenue Optimization Tips

1. **Test Different Positions**: Use Analytics to see which placements perform best
2. **Mix Ad Types**: Combine AdSense with direct-sold banners for maximum revenue
3. **Seasonal Adjustments**: Increase AdSense priority during off-season when direct sales are low
4. **Mobile Optimization**: Use responsive ad units for better mobile monetization
5. **Content Integration**: Place ads near engaging content (race results, popular articles)

## Support

For AdSense-specific issues:
- Google AdSense Help Center: https://support.google.com/adsense
- AdSense Community Forums: https://support.google.com/adsense/community

For Alfie advertising system issues:
- Check the Analytics tab for error messages
- Review browser console for JavaScript errors
- Verify database records in Supabase dashboard
