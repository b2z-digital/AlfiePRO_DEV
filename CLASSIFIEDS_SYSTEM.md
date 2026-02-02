# Classifieds System Documentation

## Overview

The Classifieds system is a comprehensive marketplace feature that allows club members to buy, sell, and trade sailing-related items within their club community and optionally to the wider public.

## Features

### Core Functionality

1. **Listing Management**
   - Create, edit, and delete classified listings
   - Upload multiple images per listing
   - Rich categorization system (Yachts, Sails, Equipment, Parts, etc.)
   - Condition tracking (New, Like New, Good, Fair, Used)
   - Pricing and location information
   - Expiry date support for time-limited listings

2. **Visibility Control**
   - **Club-Only Listings**: Visible only to members of the specific club
   - **Public Listings**: Visible to all clubs and members
   - Featured listings option for highlighting special items
   - View count tracking for listing popularity

3. **Search and Discovery**
   - Real-time search across titles and descriptions
   - Category filtering with visual icons
   - Grid-based responsive layout
   - Three view modes:
     - All Listings: Browse all available listings
     - My Listings: Manage your own listings
     - Favorites: Quick access to saved items

4. **User Engagement**
   - Favorite/bookmark listings for later
   - Ask questions about listings
   - Make offers directly through the system
   - Express interest in items
   - Integrated notification system for inquiries

5. **Seller Tools**
   - View all inquiries and offers
   - Mark items as sold
   - Track listing views
   - Edit listing details anytime
   - Delete listings when no longer needed

## Database Schema

### Tables

#### `classifieds`
Main table storing all classified listings.

**Columns:**
- `id` (uuid): Unique identifier
- `title` (text): Listing title
- `description` (text): Detailed description
- `price` (numeric): Item price
- `location` (text): Geographic location
- `category` (text): Item category
- `condition` (text): Item condition
- `images` (jsonb): Array of image URLs
- `contact_email` (text): Seller's email
- `contact_phone` (text): Optional phone number
- `user_id` (uuid): Seller's user ID
- `club_id` (uuid): Associated club ID
- `status` (text): active | sold | expired | deleted
- `is_public` (boolean): Public visibility flag
- `views_count` (integer): Number of views
- `featured` (boolean): Featured listing flag
- `expires_at` (timestamptz): Optional expiry date
- `created_at` (timestamptz): Creation timestamp
- `updated_at` (timestamptz): Last update timestamp

#### `classified_favorites`
Tracks user favorites/bookmarks.

**Columns:**
- `id` (uuid): Unique identifier
- `classified_id` (uuid): Reference to classified
- `user_id` (uuid): Reference to user
- `created_at` (timestamptz): Creation timestamp

#### `classified_inquiries`
Manages inquiries, questions, and offers.

**Columns:**
- `id` (uuid): Unique identifier
- `classified_id` (uuid): Reference to classified
- `sender_id` (uuid): User sending inquiry
- `message` (text): Inquiry message
- `inquiry_type` (text): question | offer | interest
- `offer_amount` (numeric): Optional offer amount
- `status` (text): pending | accepted | rejected | responded
- `created_at` (timestamptz): Creation timestamp
- `updated_at` (timestamptz): Last update timestamp

### Row Level Security (RLS)

All tables have RLS enabled with the following policies:

**classifieds table:**
- Users can view active listings that are either public OR belong to their club
- Users can create listings for clubs they're members of
- Users can update/delete only their own listings

**classified_favorites table:**
- Users can only view, add, and remove their own favorites

**classified_inquiries table:**
- Users can view inquiries they sent or received for their listings
- Users can create new inquiries
- Listing owners can update inquiry status

## Categories

The system includes 10 predefined categories:

1. ⛵ Yachts & Boats
2. 🪂 Sails
3. ⚓ Equipment & Gear
4. 🔧 Parts & Accessories
5. 📡 Electronics
6. 🦺 Safety Equipment
7. 👕 Clothing & Apparel
8. 🚚 Trailers
9. ⚓ Moorings & Storage
10. 📦 Other

## User Interface Components

### ClassifiedsPage
Main page displaying all listings with:
- View mode tabs (All Listings, My Listings, Favorites)
- Search bar with real-time filtering
- Category filter panel
- Grid layout of listing cards
- Create listing button

### ClassifiedDetailModal
Full listing details with:
- Image carousel with thumbnails
- Complete listing information
- Seller contact details
- Action buttons (Ask Question, Make Offer, Add to Favorites)
- Inquiry management for sellers
- Edit/Delete options for listing owners

### ClassifiedFormModal
Listing creation/editing form with:
- Multi-image upload with preview
- All listing fields
- Visibility controls (public/club-only)
- Featured listing option
- Optional expiry date
- Form validation

## Navigation

The Classifieds feature is accessible from:
- Main Dashboard Navigation → Club Management → Classifieds
- Direct path: `/classifieds`

## Integration with Notifications

When users interact with listings:
- **Questions/Offers**: Sellers receive notifications about new inquiries
- **Notification Types**:
  - `classified_inquiry`: General questions
  - `classified_offer`: Purchase offers with amounts
- Notifications link directly to the inquiry details

## API Functions

### Storage Functions (`classifiedStorage.ts`)

- `getClassifieds(clubId?, includePublic)`: Fetch listings with filters
- `getClassifiedById(id)`: Get single listing and increment views
- `getUserClassifieds(userId)`: Get user's listings
- `createClassified(data, userId)`: Create new listing
- `updateClassified(id, updates)`: Update existing listing
- `deleteClassified(id)`: Soft delete listing
- `markClassifiedAsSold(id)`: Mark as sold
- `toggleClassifiedFavorite(classifiedId, userId)`: Add/remove favorite
- `getUserFavorites(userId)`: Get user's favorited listings
- `isClassifiedFavorited(classifiedId, userId)`: Check favorite status
- `createClassifiedInquiry(...)`: Send inquiry/offer
- `getClassifiedInquiries(classifiedId)`: Get listing inquiries
- `updateInquiryStatus(inquiryId, status)`: Update inquiry status
- `searchClassifieds(...)`: Advanced search with filters

## Usage Examples

### Creating a Listing

1. Navigate to Classifieds page
2. Click "Create Listing" button
3. Upload images (at least one required)
4. Fill in all required fields:
   - Title
   - Category
   - Condition
   - Price
   - Location
   - Description
   - Contact information
5. Set visibility options:
   - Toggle "Make listing public" for wider visibility
   - Toggle "Feature this listing" to highlight it
6. Optionally set expiry date
7. Click "Create Listing"

### Making an Offer

1. Browse or search for listings
2. Click on a listing to view details
3. Click "Make an Offer" button
4. Enter offer amount and message
5. Click "Send"
6. Seller receives notification

### Managing Inquiries (Sellers)

1. View your listing details
2. Scroll to "Inquiries" section
3. See all questions and offers
4. Contact interested buyers directly via email/phone
5. Mark listing as sold when complete

## Best Practices

### For Sellers
- Use high-quality, well-lit images
- Write detailed, honest descriptions
- Respond promptly to inquiries
- Update or delete listings when sold
- Use appropriate categories and conditions

### For Buyers
- Save favorites for easy access later
- Ask specific questions about items
- Make reasonable offers
- Respect seller's contact preferences

## Future Enhancements

Potential features for future development:
- Direct messaging within the platform
- Price negotiation workflows
- Shipping calculator integration
- Payment processing integration
- Rating/review system for sellers
- Want-to-buy listings
- Automated expiry notifications
- Related listings recommendations
- Export listing data
- Social media sharing
- Advanced analytics dashboard

## Technical Notes

- Images are stored in Supabase Storage under the `media` bucket
- All timestamps use timezone-aware format (timestamptz)
- Soft delete is used for listings (status = 'deleted')
- View counts increment on each detail view
- Foreign key constraints ensure data integrity
- Indexes optimize search and filter performance

## Support

For issues or questions about the Classifieds system:
1. Check this documentation
2. Review the source code comments
3. Contact the development team
