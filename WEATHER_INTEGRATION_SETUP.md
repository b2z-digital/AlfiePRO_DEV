# Weather Integration Setup Guide

The AlfiePRO platform now includes comprehensive weather forecasting for venues and events, using the same weather APIs as the Alfie Mobile app.

## Features Implemented

### 1. **Weather Widget Component** (`WeatherWidget.tsx`)
A reusable weather component that displays:
- Current weather conditions (temperature, feels like, description)
- Wind conditions with direction and speed (in knots)
- Wind condition labels (Calm, Light Breeze, Fresh Breeze, Gale, etc.)
- Hourly wind forecast (next 8 hours)
- 7-day weather forecast
- Marine conditions (water temperature, wave height, tides) - optional
- Additional metrics: humidity, pressure, precipitation, cloud cover, visibility

### 2. **Integration Points**

#### Dashboard Home
- Compact weather widget showing current conditions for the club's default venue
- Displays temperature, wind speed/direction, and key metrics
- Located below the stats cards on the main dashboard

#### Venue Details Modal
- Full weather widget with all tabs (Current, Hourly, 7-Day, Marine)
- Shows comprehensive weather data for the selected venue
- Accessible when viewing any venue details

#### Event Details (Future Enhancement)
- Can be easily added to show weather for the event venue on the event date

## API Configuration

### Required API Keys

Add these to your `.env` file:

```env
# OpenWeatherMap API (for weather data)
VITE_WEATHER_API_KEY=your_openweathermap_api_key_here

# StormGlass API (for marine/tide data - optional)
VITE_STORMGLASS_API_KEY=your_stormglass_api_key_here
```

### Getting API Keys

1. **OpenWeatherMap** (Required)
   - Sign up at: https://openweathermap.org/api
   - Free tier includes:
     - Current weather
     - 5-day forecast
     - Hourly forecast
   - Cost: Free for up to 1,000 calls/day

2. **StormGlass.io** (Optional - for marine data)
   - Sign up at: https://stormglass.io
   - Provides:
     - Tide data
     - Wave height/direction
     - Water temperature
     - Marine currents
   - Cost: Free tier includes 50 requests/day

## Usage Examples

### Compact Widget (Dashboard)
```tsx
<WeatherWidget
  latitude={venue.latitude}
  longitude={venue.longitude}
  locationName={venue.name}
  compact={true}
  showMarine={false}
  darkMode={darkMode}
/>
```

### Full Widget (Venue Details)
```tsx
<WeatherWidget
  latitude={venue.latitude}
  longitude={venue.longitude}
  locationName={venue.name}
  compact={false}
  showMarine={true}
  darkMode={darkMode}
/>
```

## Smart Caching System ⚡

**IMPORTANT**: To minimize API costs with multiple skippers accessing the site, weather data is intelligently cached in Supabase.

### Cache Strategy
- **Current Weather & Hourly Forecast**: Cached for 1 hour
- **7-Day Forecast**: Cached for 6 hours
- **Marine/Tide Data**: Cached for 2 hours

### How It Works
1. When a user requests weather data, the system first checks the Supabase cache
2. If cached data exists and isn't stale, it's returned immediately (no API call)
3. Only when cache is stale or missing does the system fetch fresh data from APIs
4. Fresh data is immediately stored in cache for other users to use
5. Location data is cached by coordinates (rounded to 2 decimal places)

### Benefits
- **Drastically reduced API calls**: If 100 skippers view the same venue within an hour, only 1 API call is made
- **Faster load times**: Cached data loads instantly
- **Cost savings**: Free tier limits easily accommodate hundreds of clubs
- **Fallback**: If API fails, stale cache data is returned as backup
- **Automatic cleanup**: Cache entries older than 7 days are automatically removed

### Database Table
A new `weather_cache` table stores all weather data with:
- Location key (lat/lon rounded to 2 decimals)
- Current weather, hourly forecast, daily forecast, marine data (as JSON)
- Last updated timestamp for cache invalidation
- Automatic RLS policies for secure access

### API Call Estimates
With caching enabled:
- **Single venue, 100 members viewing within 1 hour**: ~3 API calls (current, hourly, daily)
- **10 venues, 100 members**: ~30 API calls per hour
- **Daily usage** for typical club: 50-100 API calls
- **Well within free tier**: 1,000 calls/day limit

## Features

### Wind Conditions
The system uses the Beaufort scale to categorize wind conditions:
- Calm: < 1 knot
- Light Air: 1-3 knots
- Light Breeze: 4-6 knots
- Gentle Breeze: 7-10 knots
- Moderate Breeze: 11-16 knots
- Fresh Breeze: 17-21 knots
- Strong Breeze: 22-27 knots
- Near Gale: 28-33 knots
- Gale: 34-40 knots
- Strong Gale: 41-47 knots
- Storm: 48-55 knots
- Violent Storm: 56-63 knots
- Hurricane: 64+ knots

### Auto-Refresh with Smart Caching
The widget checks for fresh data every 10 minutes, but:
- If cache is still fresh (< 1 hour old), no API call is made
- Only stale cache triggers new API calls
- This means most "refreshes" are instant and free

### Responsive Design
- Compact mode for dashboard widgets
- Full mode with tabs for detailed views
- Mobile-responsive layout
- Matches the AlfiePRO design system with glassmorphism and smooth animations

## Future Enhancements

1. **Event Weather Integration**
   - Add weather forecast to event creation/editing
   - Show predicted conditions for scheduled race dates
   - Weather alerts for dangerous conditions

2. **Race Day Weather**
   - Display current conditions during race management
   - Wind history charts for post-race analysis
   - Export weather data with race results

3. **Weather Alerts**
   - Push notifications for severe weather warnings
   - Automatic event status updates based on conditions
   - Email alerts for dangerous wind/storm conditions

4. **Historical Weather**
   - Store weather conditions for each race
   - Analyze performance in different conditions
   - Weather-based skipper statistics

## Technical Details

### API Functions (`weatherAPI.ts`)

- `getCurrentWeather()` - Fetches current conditions
- `getHourlyWindForecast()` - Gets next 8 hours of wind data
- `getDailyForecast()` - Returns 7-day forecast
- `getMarineData()` - Retrieves tide and marine conditions
- `getWindBearing()` - Converts degrees to compass direction
- `getWindCondition()` - Returns Beaufort scale classification

### Data Caching
Weather data is fetched on-demand and cached in component state with a 10-minute refresh interval to minimize API calls.

### Error Handling
- Graceful degradation if API keys are not configured
- User-friendly error messages
- Offline mode support (shows cached data if available)

## Mobile App Compatibility

This implementation uses the same APIs and data structure as the Alfie Mobile app, ensuring consistency across platforms. Weather data can be easily shared between mobile and web if needed in the future.
