/*
  # Add Entry Fee and Results Display Settings

  1. New Columns for quick_races and race_series
    - Payment settings: accept_online_entry, payment_by_card, late_entry_fee, entries_open, entries_close, late_entry_until
    - Results display: show_club_state, show_design, show_category, show_country, show_flag

  2. New Columns for public_events
    - Same payment and results display settings

  3. Notes
    - Uses safe migration with existence checks
    - All new columns are nullable for backward compatibility
*/

-- Add payment settings columns to quick_races
DO $$
BEGIN
  -- Accept online entry toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'accept_online_entry'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN accept_online_entry BOOLEAN DEFAULT false;
  END IF;

  -- Payment by card toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'payment_by_card'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN payment_by_card BOOLEAN DEFAULT false;
  END IF;

  -- Late entry fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'late_entry_fee'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN late_entry_fee NUMERIC;
  END IF;

  -- Entries open date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'entries_open'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN entries_open TIMESTAMPTZ;
  END IF;

  -- Entries close date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'entries_close'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN entries_close TIMESTAMPTZ;
  END IF;

  -- Late entry until date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'late_entry_until'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN late_entry_until TIMESTAMPTZ;
  END IF;

  -- Results display: show club/state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_club_state'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_club_state BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show design
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_design'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_design BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_category'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_category BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show country
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_country'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_country BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quick_races' AND column_name = 'show_flag'
  ) THEN
    ALTER TABLE quick_races ADD COLUMN show_flag BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add payment settings columns to race_series
DO $$
BEGIN
  -- Accept online entry toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'accept_online_entry'
  ) THEN
    ALTER TABLE race_series ADD COLUMN accept_online_entry BOOLEAN DEFAULT false;
  END IF;

  -- Payment by card toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'payment_by_card'
  ) THEN
    ALTER TABLE race_series ADD COLUMN payment_by_card BOOLEAN DEFAULT false;
  END IF;

  -- Late entry fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'late_entry_fee'
  ) THEN
    ALTER TABLE race_series ADD COLUMN late_entry_fee NUMERIC;
  END IF;

  -- Entries open date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'entries_open'
  ) THEN
    ALTER TABLE race_series ADD COLUMN entries_open TIMESTAMPTZ;
  END IF;

  -- Entries close date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'entries_close'
  ) THEN
    ALTER TABLE race_series ADD COLUMN entries_close TIMESTAMPTZ;
  END IF;

  -- Late entry until date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'late_entry_until'
  ) THEN
    ALTER TABLE race_series ADD COLUMN late_entry_until TIMESTAMPTZ;
  END IF;

  -- Results display: show club/state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_club_state'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_club_state BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show design
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_design'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_design BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_category'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_category BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show country
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_country'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_country BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'race_series' AND column_name = 'show_flag'
  ) THEN
    ALTER TABLE race_series ADD COLUMN show_flag BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Add payment settings columns to public_events
DO $$
BEGIN
  -- Accept online entry toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'accept_online_entry'
  ) THEN
    ALTER TABLE public_events ADD COLUMN accept_online_entry BOOLEAN DEFAULT false;
  END IF;

  -- Payment by card toggle
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'payment_by_card'
  ) THEN
    ALTER TABLE public_events ADD COLUMN payment_by_card BOOLEAN DEFAULT false;
  END IF;

  -- Late entry fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'late_entry_fee'
  ) THEN
    ALTER TABLE public_events ADD COLUMN late_entry_fee NUMERIC;
  END IF;

  -- Entries open date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'entries_open'
  ) THEN
    ALTER TABLE public_events ADD COLUMN entries_open TIMESTAMPTZ;
  END IF;

  -- Entries close date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'entries_close'
  ) THEN
    ALTER TABLE public_events ADD COLUMN entries_close TIMESTAMPTZ;
  END IF;

  -- Late entry until date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'late_entry_until'
  ) THEN
    ALTER TABLE public_events ADD COLUMN late_entry_until TIMESTAMPTZ;
  END IF;

  -- Results display: show club/state
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_club_state'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_club_state BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show design
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_design'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_design BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_category'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_category BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show country
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_country'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_country BOOLEAN DEFAULT false;
  END IF;

  -- Results display: show flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_events' AND column_name = 'show_flag'
  ) THEN
    ALTER TABLE public_events ADD COLUMN show_flag BOOLEAN DEFAULT false;
  END IF;
END $$;