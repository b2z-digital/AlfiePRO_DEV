# AlfieTV Ad Placement Setup Guide

## Overview

The AlfieTV page now has integrated ad display functionality with multiple strategic placement points throughout the page. Ads will automatically appear when you create placements and campaigns that target them.

## How It Works

The advertising system works in three steps:

1. **Create Ad Placements** - Define where ads can appear
2. **Create Campaigns & Banners** - Design your ads and set targeting
3. **Associate Banners with Placements** - Tell the system which ads go where

When users view AlfieTV, the system automatically:
- Loads ads for each placement based on active campaigns
- Filters by geographic targeting (state/club)
- Respects priority and budget limits
- Tracks impressions (when ads are viewed)
- Tracks clicks (when ads are clicked)

## Required Placements for AlfieTV

To see ads on the AlfieTV page, you need to create these placements in the **Placements** tab:

### 1. Inline Placement 1 (After First 3 Rows)
- **Placement ID**: `alfietv-inline-1`
- **Name**: AlfieTV Inline Ad 1
- **Page Type**: alfie_tv
- **Position**: inline
- **Recommended Size**: 728x90 (leaderboard) or 970x90 (super leaderboard)
- **Description**: Appears after "Trending Now" row

### 2. Inline Placement 2 (After 6 Rows)
- **Placement ID**: `alfietv-inline-2`
- **Name**: AlfieTV Inline Ad 2
- **Page Type**: alfie_tv
- **Position**: inline
- **Recommended Size**: 728x90 (leaderboard) or 970x90 (super leaderboard)
- **Description**: Appears after "Featured" row

### 3. Playlist Inline Ads
- **Placement ID**: `alfietv-inline-playlist`
- **Name**: AlfieTV Playlist Inline Ads
- **Page Type**: alfie_tv
- **Position**: inline
- **Recommended Size**: 728x90 (leaderboard) or 970x90 (super leaderboard)
- **Description**: Appears every 4 playlists in the feed

### 4. Sidebar Placement
- **Placement ID**: `alfietv-sidebar`
- **Name**: AlfieTV Sidebar Ad
- **Page Type**: alfie_tv
- **Position**: sidebar
- **Recommended Size**: 300x600 (half-page) or 300x250 (medium rectangle)
- **Description**: Sticky sidebar ad on large screens (hidden on mobile/tablet)

## Creating Placements

1. Navigate to **Dashboard** > **Advertising** > **Placements** tab
2. Click **Create Placement**
3. Fill in the details for each placement above
4. Make sure to set `Is Active` to true
5. Save each placement

## Linking Campaigns to Placements

When creating a campaign using the Campaign Creation Wizard:

**Step 2 - Banners**:
- For each banner, you'll see a "Target Placements" section
- Check the placements where you want this banner to appear
- You can select multiple placements per banner

The wizard automatically handles the placement associations when you complete the campaign creation.

## Ad Display Behavior

### Visibility
- **Inline ads**: Show on all screen sizes, centered in the content flow
- **Sidebar ad**: Only visible on XL screens and above (1280px+), hidden on mobile/tablet
- All ads are sticky/persistent as users scroll

### When Ads Don't Appear
Ads will NOT display if:
- No placement with the specified ID exists
- No active campaigns are targeting that placement
- Campaign dates are outside the current date range
- Budget limits (impressions/clicks) have been reached
- Geographic targeting doesn't match the user's location
- The banner dimensions don't match the placement dimensions

### Impression Tracking
- Ads must be 50% visible in the viewport to count as an impression
- Only tracked once per ad per page view
- Automatic tracking using Intersection Observer API

### Click Tracking
- Automatically tracked when user clicks an ad
- Opens ad link in new tab
- Records click metadata (user, club, device type, etc.)

## Best Practices

### Banner Sizes
Use standard IAB ad sizes for best results:
- **Leaderboard**: 728x90 (great for inline ads)
- **Super Leaderboard**: 970x90 (premium inline)
- **Medium Rectangle**: 300x250 (versatile, works in sidebar)
- **Half-Page**: 300x600 (premium sidebar)
- **Large Rectangle**: 336x280 (alternative sidebar)

### Targeting
- Use geographic targeting to show different ads to different states/clubs
- Set appropriate priority levels (1-10) for campaign ordering
- Consider budget limits to control ad frequency

### Content Guidelines
- Keep inline ads non-intrusive (avoid animations in inline placements)
- Sidebar ads can be more dynamic since they're out of main content flow
- Test ad appearance in both light and dark mode

## Troubleshooting

### "I created a campaign but don't see ads"
1. Check that placements exist with the correct IDs (case-sensitive)
2. Verify the campaign is active and within date range
3. Confirm banners are associated with placements in Step 2 of campaign creation
4. Check banner dimensions match placement dimensions
5. Verify budget limits haven't been reached

### "Sidebar ad doesn't appear"
- Sidebar ads only show on XL screens (1280px+ width)
- Try maximizing your browser window or viewing on a larger monitor
- Check browser console for any errors

### "Ad appears briefly then disappears"
- This usually indicates a size mismatch between banner and placement
- Verify banner width/height matches placement size exactly
- Check browser console for specific error messages

## Testing Your Ads

1. Create test placements with the IDs listed above
2. Create a test campaign with at least one banner
3. Set the banner dimensions to match a placement
4. Associate the banner with placements in Step 2
5. Set campaign as active with current dates
6. Navigate to AlfieTV page
7. Ads should appear in designated locations

## Future Enhancements

Potential additions for the ad system:
- Frequency capping (limit how often same user sees an ad)
- A/B testing different creatives
- Performance analytics dashboard
- Auto-rotation of multiple ads in same placement
- Responsive ad sizes that adapt to screen size
- Video ad support
