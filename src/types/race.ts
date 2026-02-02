import { RaceType, BoatType } from './index';
import { Skipper } from './index';
import { HeatManagement } from './heat';

export interface MediaItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  createdAt: string;
  createdBy: string;
}

export interface RaceResult {
  id: string;
  eventId: string;
  date: string;
  format: 'jpg' | 'pdf';
  url: string;
  type: 'summary' | 'detailed';
}

export interface RoundResult {
  race?: number;
  skipperIndex: number;
  position: number | null;
  letterScore?: string;
  finishTime?: string;
  elapsedTime?: number;
  correctedTime?: number;
  handicap?: number;
  adjustedHcap?: number;
}

export interface SeriesRound {
  name: string;
  date: string;
  venue: string;
  results: RoundResult[];
  completed: boolean;
  lastCompletedRace: number;
  hasDeterminedInitialHcaps: boolean;
  isManualHandicaps: boolean;
  cancelled?: boolean;
  cancellationReason?: string;
  heatManagement?: HeatManagement;
  numRaces?: number;
  dropRules?: number[];
  scoringSystem?: 'low-point' | 'hms' | 'shrs'; // Scoring system type
  skippers?: Skipper[]; // Each round can have its own set of skippers
  raceResults?: RoundResult[][]; // Stores results for each race in the round
  averagePointsApplied?: Record<number, number>; // Skipper index -> average points
  manualScoreOverrides?: Record<number, number>; // Skipper index -> manual score
  enableLiveStream?: boolean; // Enable YouTube livestreaming for this round
}

export interface RaceSeries {
  id: string;
  clubName: string;
  seriesName: string;
  raceClass: BoatType;
  raceFormat: RaceType;
  rounds: SeriesRound[];
  skippers: Skipper[];
  completed: boolean;
  media?: MediaItem[];
  livestreamUrl?: string;
  lastCompletedRace?: number;
  hasDeterminedInitialHcaps?: boolean;
  isManualHandicaps?: boolean;
  results?: any[];
  // Race settings
  numRaces?: number;
  dropRules?: number[];
  scoringSystem?: 'low-point' | 'hms' | 'shrs'; // Scoring system type
  // New fields for documents and payment
  noticeOfRaceUrl?: string;
  sailingInstructionsUrl?: string;
  isPaid?: boolean;
  entryFee?: number;
  // Club ID for filtering
  clubId?: string;
  // Live features
  enableLiveTracking?: boolean; // Enable fleet board & skipper tracking
  enableLiveStream?: boolean; // Enable YouTube livestreaming (applies to all rounds)
}

export interface DayResults {
  raceResults: any[];
  lastCompletedRace: number;
  hasDeterminedInitialHcaps: boolean;
  isManualHandicaps: boolean;
  heatManagement?: HeatManagement;
  dayCompleted?: boolean; // Flag to indicate if scoring for this day is complete
}

export interface RaceEvent {
  id: string;
  eventName?: string;
  clubName: string;
  date: string;
  endDate?: string; // For multi-day events
  venue: string;
  venueImage?: string | null; // Venue image URL for display
  raceClass: BoatType;
  raceFormat: RaceType;
  isSeriesEvent?: boolean;
  seriesId?: string;
  roundName?: string;
  skippers?: Skipper[];
  attendees?: Skipper[]; // Registered attendees before scoring starts
  raceResults?: any[];
  lastCompletedRace?: number;
  hasDeterminedInitialHcaps?: boolean;
  isManualHandicaps?: boolean;
  results?: RaceResult[];
  completed?: boolean;
  cancelled?: boolean;
  cancellationReason?: string;
  media?: MediaItem[];
  livestreamUrl?: string;
  multiDay?: boolean; // Flag for multi-day events
  numberOfDays?: number; // Number of days for multi-day events
  currentDay?: number; // Current day being scored
  dayResults?: Record<number, DayResults>; // Results for each day
  // New fields for documents and payment
  noticeOfRaceUrl?: string;
  sailingInstructionsUrl?: string;
  isPaid?: boolean;
  entryFee?: number;
  // Heat management
  heatManagement?: HeatManagement;
  // Race settings
  numRaces?: number;
  dropRules?: number[];
  scoringSystem?: 'low-point' | 'hms' | 'shrs'; // Scoring system type
  // Interclub event fields
  isInterclub?: boolean;
  otherClubId?: string;
  otherClubName?: string;
  // Club ID for filtering
  clubId?: string;
  // Flag for public events
  isPublicEvent?: boolean;
  publicEventId?: string; // Reference to public_events table ID (camelCase for new code)
  public_event_id?: string; // Reference to public_events table ID (snake_case for backwards compatibility)
  // Event level (club/state/national)
  eventLevel?: 'club' | 'state' | 'national';
  // Live features
  enableLiveTracking?: boolean; // Enable fleet board & skipper tracking
  enableLiveStream?: boolean; // Enable YouTube livestreaming
  // Observer settings for heat racing
  enable_observers?: boolean; // Enable observer assignments for heats
  observers_per_heat?: number; // Number of observers per heat (default 2)
  // Display settings for results table
  show_flag?: boolean;
  show_country?: boolean;
  show_club_state?: boolean;
  show_category?: boolean;
}

export interface PublicEvent {
  id: string;
  event_name: string;
  date: string;
  end_date?: string;
  venue: string;
  race_class: string;
  race_format: string;
  notice_of_race_url?: string;
  sailing_instructions_url?: string;
  is_paid: boolean;
  entry_fee?: number;
  media?: MediaItem[];
  livestream_url?: string;
  is_interclub: boolean;
  other_club_name?: string;
  multi_day: boolean;
  number_of_days: number;
  completed?: boolean;
  cancelled?: boolean;
  cancellation_reason?: string;
  approval_status?: string;
  created_at: string;
  updated_at: string;
}