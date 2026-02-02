# Document Form Field Mapping System

## Overview

The Document Form Field Mapping system provides a **stable, maintainable way** to connect event data to document generation forms. This prevents mapping breakage when field names are changed by users.

## The Problem It Solves

Previously, field mapping used `field_name` directly:
- ❌ If a user renamed "regatta_name" to "event_title", the mapping would break
- ❌ Hard-coded field name checks throughout the codebase
- ❌ Difficult to maintain and extend

## The Solution: Mapping Keys

Each form field can now have an optional `mapping_key` that serves as a **stable identifier** for mapping purposes.

### Standard Mapping Keys

| Mapping Key | Purpose | Event Data Source |
|------------|---------|-------------------|
| `event_name` | Event/Regatta name | `eventName` or `event_name` |
| `event_start_date` | Event start date | `raceDate` or `race_date` |
| `event_end_date` | Event end date | `endDate` or `end_date` |
| `event_day_2_date` | Day 2 date (multi-day events) | Auto-calculated from start date |
| `event_day_3_date` | Day 3 date (multi-day events) | Auto-calculated from start date |
| `event_day_4_date` | Day 4 date (multi-day events) | Auto-calculated from start date |
| `venue_id` | Venue selection (dropdown) | `venueId` or `venue_id` |
| `venue_name` | Venue name (text) | `raceVenue`, `venueName`, or `venues.name` |
| `state_association_id` | State association selection | `stateAssociationId` or `state_association_id` |
| `club_id` | Club selection | `clubId` or `club_id` |
| `boat_class_name` | Boat/Yacht class name | `raceClass`, `boatClassName`, or `race_class` |
| `number_of_days` | Number of racing days | `numberOfDays` or `number_of_days` |

## How It Works

### 1. Database Schema

```sql
ALTER TABLE form_fields
ADD COLUMN mapping_key text;
```

The `mapping_key` is:
- **Optional** (nullable) - only needed for fields that map to event data
- **Independent** of `field_name` - users can rename fields without breaking mapping
- **Indexed** for performance

### 2. Form Builder

When creating/editing fields in the Form Builder:
```typescript
{
  field_name: 'regatta_name',  // Can be changed by user
  field_label: 'Regatta Name',  // Display label
  mapping_key: 'event_name'     // Stable mapping identifier
}
```

### 3. Document Generation

When generating documents, the system:
1. Checks if field has a `mapping_key`
2. Uses mapping key to fetch correct event data
3. Falls back to field_name for legacy compatibility

```typescript
if (field.mapping_key === 'event_name') {
  formData[field.field_name] = eventData.eventName || eventData.event_name;
}
```

## Benefits

✅ **User-Friendly**: Users can rename fields without breaking functionality
✅ **Maintainable**: Central mapping logic, easy to extend
✅ **Backwards Compatible**: Legacy forms without mapping_key still work
✅ **Type-Safe**: Clear mapping contract between event data and form fields
✅ **Flexible**: Support multiple event data sources (old and new schemas)

## Adding New Mapping Keys

To add support for a new mapping key:

1. **Update Migration** - Add mapping key to standard list in migration comments

2. **Update Type Definition** - Document in this guide's table

3. **Update Document Wizard** - Add case to switch statement:
```typescript
case 'new_mapping_key':
  prePopulatedData[field.field_name] = eventData.sourceField || '';
  break;
```

4. **Update Form Builder** - Add to mapping key dropdown/selector

## Example: Renaming Fields

### Before (Breaks Mapping)
```typescript
// User renames field
field_name: 'regatta_name' → 'event_title'

// Mapping breaks!
if (field.field_name === 'regatta_name') { // No longer matches!
  // Never executes
}
```

### After (Stable Mapping)
```typescript
// User renames field
field_name: 'regatta_name' → 'event_title'
mapping_key: 'event_name' // Unchanged!

// Mapping still works!
if (field.mapping_key === 'event_name') { // Still matches!
  formData[field.field_name] = eventData.eventName; // Uses new name
}
```

## Conditional Field Rendering

### Multi-Day Event Support

The system includes intelligent conditional rendering for multi-day events:

**Features:**
1. **Auto-detect number of days** from event data
2. **Hide "How many racing days?" question** if already known from event setup
3. **Dynamically show/hide Day 2, 3, 4+ fields** based on actual number of days
4. **Auto-calculate dates** for each subsequent day

**How It Works:**

```typescript
// System checks for Day 2+ fields
const dayMatch = field.field_name.match(/day[_\s]?(\d+)/i);
if (dayMatch && parseInt(dayMatch[1]) > 1) {
  const dayNumber = parseInt(dayMatch[1]);
  const actualDays = parseInt(numberOfDays || '1');

  // Only show field if event has enough days
  if (dayNumber > actualDays) {
    return; // Skip this field
  }
}
```

**Example:**
- **1-day event**: Shows only Day 1 fields
- **2-day event**: Shows Day 1 and Day 2 fields automatically
- **3-day event**: Shows Day 1, Day 2, and Day 3 fields automatically

**Date Auto-population:**
- Day 2 Date = Start Date + 1 day
- Day 3 Date = Start Date + 2 days
- Day 4 Date = Start Date + 3 days

## Migration Script

The migration automatically updates existing form fields with appropriate mapping keys based on field name patterns. This ensures existing forms work immediately with the new system.

## Future Enhancements

- UI in Form Builder to set/change mapping keys
- Validation to prevent duplicate mapping keys in same form
- Visual indicators showing which fields are mapped
- Mapping key suggestions based on field name
- Support for 5+ day events (currently supports up to 4 days)
