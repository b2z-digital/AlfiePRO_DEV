# Advertising Share of Voice (SOV) System

## Overview
The advertising system now implements intelligent ad rotation with Share of Voice (SOV) based on campaign priority. This ensures fair ad distribution while preventing repetitive ad display.

## How It Works

### 1. Priority-Based Weighting
- **Priority 1 (Highest)**: 5x weight
- **Priority 2**: 4x weight
- **Priority 3**: 3x weight
- **Priority 4**: 2x weight
- **Priority 5 (Lowest)**: 1x weight

Higher priority campaigns get proportionally more impressions based on their weight.

### 2. Single Banner Protection
When only **one banner** is configured for a placement:
- The banner is shown **once** per page session
- After being displayed, it will **not repeat** as the user scrolls
- This prevents the annoying experience of seeing the same ad over and over

### 3. Multiple Banner Rotation
When **multiple banners** are configured:
- Ads rotate using weighted random selection based on priority
- Recently shown ads are tracked (last 5 ads per placement)
- System tries to show different ads when possible
- If all ads have been shown recently, rotation resets

### 4. AdSense Integration
- AdSense banners compete equally with other banner types
- They receive SOV based on their campaign priority
- Can be mixed with image, text, or HTML5 banners
- All placement positions support AdSense

## Example Scenarios

### Scenario 1: Single Banner
- You have 1 banner for AlfieTV Hero position
- First ad slot: Shows the banner
- Second ad slot: Empty (no ad shown)
- Third ad slot: Empty (no ad shown)
- **Result**: Banner appears once without repetition

### Scenario 2: Multiple Banners with Priority
- Banner A: Priority 1 (5x weight)
- Banner B: Priority 3 (3x weight)
- Banner C: Priority 5 (1x weight)

Total weight = 5 + 3 + 1 = 9

**Distribution**:
- Banner A: ~55.5% of impressions
- Banner B: ~33.3% of impressions
- Banner C: ~11.1% of impressions

### Scenario 3: AdSense + Regular Banners
- AdSense Banner: Priority 2 (4x weight)
- Image Banner: Priority 2 (4x weight)
- Text Banner: Priority 4 (2x weight)

Total weight = 4 + 4 + 2 = 10

**Distribution**:
- AdSense: ~40% of impressions
- Image Banner: ~40% of impressions
- Text Banner: ~20% of impressions

## Technical Implementation

### Tracking Keys
Each ad placement gets a unique tracking key:
```
alfie-tv-2, alfie-tv-6, alfie-tv-10, etc.
```

This allows independent ad rotation for each position on the page.

### Recent Ad Memory
- Tracks last 5 shown ads per placement
- Prevents immediate repetition of the same ad
- Automatically resets when all ads have been shown

### Campaign Priority
Set in the Campaigns tab (1-5 scale):
- 1 = Highest priority (premium advertisers)
- 5 = Lowest priority (filler content)

## Best Practices

1. **Diverse Banner Pool**: Upload at least 3-5 different banners for better rotation
2. **Priority Strategy**:
   - Priority 1-2: Premium/paid advertisers
   - Priority 3: Standard advertisers
   - Priority 4-5: House ads/promotional content
3. **AdSense Mix**: Set AdSense campaigns to Priority 2-3 for balanced revenue
4. **Monitor Analytics**: Track impression distribution in the Analytics tab
