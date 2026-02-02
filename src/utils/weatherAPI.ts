// Weather API Integration with Supabase Caching
// Uses OpenWeatherMap API (same as mobile app)

import { supabase } from './supabase';

const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || '';
const WEATHER_API_BASE = 'https://api.openweathermap.org/data/2.5';
const MARINE_API_BASE = 'https://api.stormglass.io/v2';
const MARINE_API_KEY = import.meta.env.VITE_STORMGLASS_API_KEY || '';

// Cache durations in milliseconds
const CACHE_DURATION = {
  CURRENT: 60 * 60 * 1000, // 1 hour
  HOURLY: 60 * 60 * 1000,  // 1 hour
  DAILY: 6 * 60 * 60 * 1000, // 6 hours
  MARINE: 2 * 60 * 60 * 1000 // 2 hours
};

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  description: string;
  icon: string;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
  precipitation: number;
  cloudCover: number;
  uvIndex: number;
  visibility: number;
  updatedAt: string;
}

export interface WindForecast {
  time: string;
  windSpeed: number;
  windDirection: number;
  windGust?: number;
}

export interface DailyForecast {
  date: string;
  tempMin: number;
  tempMax: number;
  windSpeedMin: number;
  windSpeedMax: number;
  windDirection: number;
  description: string;
  icon: string;
  precipitation: number;
}

export interface TideData {
  time: string;
  height: number;
  type: 'high' | 'low';
}

export interface MarineData {
  waterTemp: number;
  waveHeight: number;
  waveDirection: number;
  wavePeriod: number;
  tides: TideData[];
  currentSpeed?: number;
  currentDirection?: number;
}

// Convert wind speed from m/s to knots
const msToKnots = (ms: number): number => Math.round(ms * 1.94384);

// Convert wind direction to compass bearing
export const getWindBearing = (degrees: number): string => {
  const bearings = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return bearings[index];
};

// Get wind condition description
export const getWindCondition = (knots: number): { label: string; color: string } => {
  if (knots < 1) return { label: 'Calm', color: 'bg-gray-500' };
  if (knots < 4) return { label: 'Light Air', color: 'bg-blue-400' };
  if (knots < 7) return { label: 'Light Breeze', color: 'bg-blue-500' };
  if (knots < 11) return { label: 'Gentle Breeze', color: 'bg-green-500' };
  if (knots < 17) return { label: 'Moderate Breeze', color: 'bg-green-600' };
  if (knots < 22) return { label: 'Fresh Breeze', color: 'bg-yellow-500' };
  if (knots < 28) return { label: 'Strong Breeze', color: 'bg-orange-500' };
  if (knots < 34) return { label: 'Near Gale', color: 'bg-orange-600' };
  if (knots < 41) return { label: 'Gale', color: 'bg-red-500' };
  if (knots < 48) return { label: 'Strong Gale', color: 'bg-red-600' };
  if (knots < 56) return { label: 'Storm', color: 'bg-purple-600' };
  if (knots < 64) return { label: 'Violent Storm', color: 'bg-purple-700' };
  return { label: 'Hurricane', color: 'bg-red-900' };
};

// Helper: Create location key for caching
const createLocationKey = (lat: number, lon: number): string => {
  return `${Math.round(lat * 100) / 100}_${Math.round(lon * 100) / 100}`;
};

// Helper: Check if cache is stale
const isCacheStale = (lastUpdated: string, duration: number): boolean => {
  const cacheAge = Date.now() - new Date(lastUpdated).getTime();
  return cacheAge > duration;
};

// Get cached weather data from Supabase
const getWeatherCache = async (lat: number, lon: number, locationName: string) => {
  try {
    const locationKey = createLocationKey(lat, lon);

    const { data, error } = await supabase
      .from('weather_cache')
      .select('*')
      .eq('location_key', locationKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching weather cache:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error in getWeatherCache:', err);
    return null;
  }
};

// Update weather cache in Supabase
const updateWeatherCache = async (
  lat: number,
  lon: number,
  locationName: string,
  updates: {
    current_weather?: any;
    hourly_forecast?: any;
    daily_forecast?: any;
    marine_data?: any;
  }
) => {
  try {
    const locationKey = createLocationKey(lat, lon);

    const { data: existing } = await supabase
      .from('weather_cache')
      .select('id')
      .eq('location_key', locationKey)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('weather_cache')
        .update({
          ...updates,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('location_key', locationKey);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('weather_cache')
        .insert({
          location_key: locationKey,
          latitude: lat,
          longitude: lon,
          location_name: locationName,
          ...updates,
          last_updated: new Date().toISOString()
        });

      if (error) throw error;
    }
  } catch (err) {
    console.error('Error updating weather cache:', err);
  }
};

// Fetch current weather data (with caching)
export const getCurrentWeather = async (lat: number, lon: number, locationName: string = 'Unknown'): Promise<WeatherData | null> => {
  if (!WEATHER_API_KEY) {
    console.error('Weather API key not configured');
    return null;
  }

  try {
    // Check cache first
    const cache = await getWeatherCache(lat, lon, locationName);

    if (cache?.current_weather && !isCacheStale(cache.last_updated, CACHE_DURATION.CURRENT)) {
      console.log('Using cached weather data');
      return cache.current_weather as WeatherData;
    }

    // Fetch fresh data
    console.log('Fetching fresh weather data from API');
    const response = await fetch(
      `${WEATHER_API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch weather data');
    }

    const data = await response.json();

    const weatherData: WeatherData = {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: msToKnots(data.wind.speed),
      windDirection: data.wind.deg,
      windGust: data.wind.gust ? msToKnots(data.wind.gust) : undefined,
      precipitation: data.rain?.['1h'] || 0,
      cloudCover: data.clouds.all,
      uvIndex: 0,
      visibility: data.visibility / 1000,
      updatedAt: new Date().toISOString()
    };

    // Update cache
    await updateWeatherCache(lat, lon, locationName, { current_weather: weatherData });

    return weatherData;
  } catch (error) {
    console.error('Error fetching weather:', error);

    // Return cached data if available, even if stale
    const cache = await getWeatherCache(lat, lon, locationName);
    if (cache?.current_weather) {
      console.log('API failed, returning stale cache');
      return cache.current_weather as WeatherData;
    }

    return null;
  }
};

// Unified function to get all weather data with caching
export const getAllWeatherData = async (lat: number, lon: number, locationName: string = 'Unknown') => {
  try {
    // Check cache first
    const cache = await getWeatherCache(lat, lon, locationName);

    const currentStale = !cache?.current_weather || isCacheStale(cache.last_updated, CACHE_DURATION.CURRENT);
    const hourlyStale = !cache?.hourly_forecast || isCacheStale(cache.last_updated, CACHE_DURATION.HOURLY);
    const dailyStale = !cache?.daily_forecast || isCacheStale(cache.last_updated, CACHE_DURATION.DAILY);
    const marineStale = !cache?.marine_data || isCacheStale(cache.last_updated, CACHE_DURATION.MARINE);

    // Return cached data if fresh
    if (!currentStale && !hourlyStale && !dailyStale) {
      console.log('Using fully cached weather data');
      return {
        current: cache.current_weather,
        hourly: cache.hourly_forecast,
        daily: cache.daily_forecast,
        marine: cache.marine_data
      };
    }

    // Fetch only stale data
    const updates: any = {};

    if (currentStale || hourlyStale) {
      // Fetch both current and hourly from same API call
      const [currentData, hourlyData] = await Promise.all([
        fetchCurrentWeatherFromAPI(lat, lon),
        fetchHourlyForecastFromAPI(lat, lon)
      ]);

      if (currentData) updates.current_weather = currentData;
      if (hourlyData) updates.hourly_forecast = hourlyData;
    }

    if (dailyStale) {
      const dailyData = await fetchDailyForecastFromAPI(lat, lon);
      if (dailyData) updates.daily_forecast = dailyData;
    }

    if (marineStale && MARINE_API_KEY) {
      const marineData = await fetchMarineDataFromAPI(lat, lon);
      if (marineData) updates.marine_data = marineData;
    }

    // Update cache with new data
    if (Object.keys(updates).length > 0) {
      await updateWeatherCache(lat, lon, locationName, updates);
    }

    return {
      current: updates.current_weather || cache?.current_weather,
      hourly: updates.hourly_forecast || cache?.hourly_forecast,
      daily: updates.daily_forecast || cache?.daily_forecast,
      marine: updates.marine_data || cache?.marine_data
    };
  } catch (error) {
    console.error('Error in getAllWeatherData:', error);

    // Return whatever cache we have
    const cache = await getWeatherCache(lat, lon, locationName);
    return {
      current: cache?.current_weather,
      hourly: cache?.hourly_forecast,
      daily: cache?.daily_forecast,
      marine: cache?.marine_data
    };
  }
};

// Internal API fetch functions (not exported)
const fetchCurrentWeatherFromAPI = async (lat: number, lon: number): Promise<WeatherData | null> => {
  if (!WEATHER_API_KEY) return null;

  try {
    const response = await fetch(
      `${WEATHER_API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) throw new Error('Failed to fetch weather data');

    const data = await response.json();

    return {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      description: data.weather[0].description,
      icon: data.weather[0].icon,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: msToKnots(data.wind.speed),
      windDirection: data.wind.deg,
      windGust: data.wind.gust ? msToKnots(data.wind.gust) : undefined,
      precipitation: data.rain?.['1h'] || 0,
      cloudCover: data.clouds.all,
      uvIndex: 0,
      visibility: data.visibility / 1000,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching current weather:', error);
    return null;
  }
};

const fetchHourlyForecastFromAPI = async (lat: number, lon: number): Promise<WindForecast[] | null> => {
  if (!WEATHER_API_KEY) return null;

  try {
    const response = await fetch(
      `${WEATHER_API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );

    if (!response.ok) throw new Error('Failed to fetch forecast data');

    const data = await response.json();

    return data.list.slice(0, 8).map((item: any) => ({
      time: item.dt_txt,
      windSpeed: msToKnots(item.wind.speed),
      windDirection: item.wind.deg,
      windGust: item.wind.gust ? msToKnots(item.wind.gust) : undefined
    }));
  } catch (error) {
    console.error('Error fetching hourly forecast:', error);
    return null;
  }
};

const fetchDailyForecastFromAPI = async (lat: number, lon: number): Promise<DailyForecast[] | null> => {
  if (!WEATHER_API_KEY) return null;

  try {
    const forecastResponse = await fetch(
      `${WEATHER_API_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`
    );

    if (!forecastResponse.ok) throw new Error('Failed to fetch daily forecast');

    const forecastData = await forecastResponse.json();

    const dailyData: { [key: string]: any[] } = {};
    forecastData.list.forEach((item: any) => {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyData[date]) dailyData[date] = [];
      dailyData[date].push(item);
    });

    return Object.entries(dailyData).slice(0, 7).map(([date, items]) => {
      const temps = items.map((i: any) => i.main.temp);
      const winds = items.map((i: any) => msToKnots(i.wind.speed));
      const midday = items[Math.floor(items.length / 2)];

      return {
        date,
        tempMin: Math.round(Math.min(...temps)),
        tempMax: Math.round(Math.max(...temps)),
        windSpeedMin: Math.min(...winds),
        windSpeedMax: Math.max(...winds),
        windDirection: midday.wind.deg,
        description: midday.weather[0].description,
        icon: midday.weather[0].icon,
        precipitation: items.reduce((sum: number, i: any) => sum + (i.rain?.['3h'] || 0), 0)
      };
    });
  } catch (error) {
    console.error('Error fetching daily forecast:', error);
    return null;
  }
};

const fetchMarineDataFromAPI = async (lat: number, lon: number): Promise<MarineData | null> => {
  if (!MARINE_API_KEY) return null;

  try {
    const end = Math.floor(Date.now() / 1000) + 86400;
    const start = Math.floor(Date.now() / 1000);

    const response = await fetch(
      `${MARINE_API_BASE}/weather/point?lat=${lat}&lng=${lon}&params=waterTemperature,waveHeight,waveDirection,wavePeriod&start=${start}&end=${end}`,
      { headers: { 'Authorization': MARINE_API_KEY } }
    );

    if (!response.ok) throw new Error('Failed to fetch marine data');

    const data = await response.json();
    const current = data.hours[0];

    const tideResponse = await fetch(
      `${MARINE_API_BASE}/tide/extremes/point?lat=${lat}&lng=${lon}`,
      { headers: { 'Authorization': MARINE_API_KEY } }
    );

    const tideData = await tideResponse.json();
    const tides: TideData[] = tideData.data.slice(0, 4).map((tide: any) => ({
      time: tide.time,
      height: tide.height,
      type: tide.type
    }));

    return {
      waterTemp: Math.round(current.waterTemperature?.noaa || 0),
      waveHeight: current.waveHeight?.noaa || 0,
      waveDirection: current.waveDirection?.noaa || 0,
      wavePeriod: current.wavePeriod?.noaa || 0,
      tides,
      currentSpeed: current.currentSpeed?.noaa,
      currentDirection: current.currentDirection?.noaa
    };
  } catch (error) {
    console.error('Error fetching marine data:', error);
    return null;
  }
};

// Legacy functions for backwards compatibility
export const getHourlyWindForecast = async (lat: number, lon: number, locationName: string = 'Unknown'): Promise<WindForecast[]> => {
  const data = await getAllWeatherData(lat, lon, locationName);
  return (data.hourly as WindForecast[]) || [];
};

export const getDailyForecast = async (lat: number, lon: number, locationName: string = 'Unknown'): Promise<DailyForecast[]> => {
  const data = await getAllWeatherData(lat, lon, locationName);
  return (data.daily as DailyForecast[]) || [];
};

export const getMarineData = async (lat: number, lon: number, locationName: string = 'Unknown'): Promise<MarineData | null> => {
  const data = await getAllWeatherData(lat, lon, locationName);
  return (data.marine as MarineData) || null;
};


// Get weather icon component name
export const getWeatherIconName = (iconCode: string): string => {
  const iconMap: { [key: string]: string } = {
    '01d': 'sun',
    '01n': 'moon',
    '02d': 'cloud-sun',
    '02n': 'cloud-moon',
    '03d': 'cloud',
    '03n': 'cloud',
    '04d': 'cloudy',
    '04n': 'cloudy',
    '09d': 'cloud-drizzle',
    '09n': 'cloud-drizzle',
    '10d': 'cloud-rain',
    '10n': 'cloud-rain',
    '11d': 'cloud-lightning',
    '11n': 'cloud-lightning',
    '13d': 'cloud-snow',
    '13n': 'cloud-snow',
    '50d': 'cloud-fog',
    '50n': 'cloud-fog'
  };

  return iconMap[iconCode] || 'cloud';
};
