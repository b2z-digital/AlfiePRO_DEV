/*
  # Link Minute Callout Sounds to BOTW Sequence Timelines

  1. Changes
    - Updates existing T-120 "2 Minute Warning" sound events across all BOTW sequences
      to use the "2 Minutes to Start" callout audio instead of the generic Warning Horn
    - Adds new sound events for each minute mark in every BOTW sequence using the
      appropriate minute callout audio (e.g., "3 Minutes to Start" at T-3:00)
    - Keeps the opening "Start Countdown" Warning Horn at T-max (opening signal)
    - Keeps the "1 Minute Warning" as Warning Horn (no 1-minute callout audio exists yet)
    - Drops the unused minute_callout_sound_id column from start_sequences

  2. BOTW Sequences Updated
    - BOTW 3 Minutes (180s): adds 3-min callout at T-180, updates 2-min callout at T-120
    - BOTW 4 Minutes (240s): adds 4-min at T-240, 3-min at T-180, updates 2-min at T-120
    - BOTW 5 Minutes (300s): adds 5-min at T-300, 4-min at T-240, 3-min at T-180, updates 2-min at T-120
    - BOTW 8 Minutes (480s): adds 8-min through 3-min callouts, updates 2-min at T-120
    - BOTW 10 Minutes (600s): adds 10-min through 3-min callouts, updates 2-min at T-120

  3. Sound ID Mapping
    - "2 Minutes to Start"    -> trigger at T-120 (2 min)
    - "3 Minutes to Start"    -> trigger at T-180 (3 min)
    - "4 Minutes to Start"    -> trigger at T-240 (4 min)
    - "5 Minutes to the Start" -> trigger at T-300 (5 min)
    - "6 Minutes to Start"    -> trigger at T-360 (6 min)
    - "7 Minutes to Start"    -> trigger at T-420 (7 min)
    - "8 Minutes to Start"    -> trigger at T-480 (8 min)
    - "9 Minutes to Start"    -> trigger at T-540 (9 min)
    - "10 Minutes to Start"   -> trigger at T-600 (10 min)
*/

-- Step 1: Update existing T-120 "2 Minute Warning" events to use "2 Minutes to Start" callout
UPDATE start_sequence_sounds
SET sound_id = '9560962b-c148-40e7-a6df-3bad16918093',
    label = '2 Minutes to Start'
WHERE id IN (
  '135dd85d-7ed2-4149-84c2-df652a06c42a',
  '0c89e641-5657-4019-8582-8cd6cd3ea732',
  'baa9d4d7-bdc1-440e-abe8-eb0edae0e232',
  'befee9de-b47c-4e45-a73d-2dd5109fb251',
  'e93ef7c2-4e0c-45a7-8516-91cba7c2b14e'
);

-- Step 2: Add minute callout sound events for each BOTW sequence
-- Using gen_random_uuid() for new IDs

-- BOTW 3 Minutes (180s) - add 3-min callout at T-180
INSERT INTO start_sequence_sounds (id, sequence_id, sound_id, trigger_time_seconds, label, repeat_count, sort_order)
VALUES
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000004', 'cff9ed89-73c9-4179-85f0-5f7d4577fc73', 180, '3 Minutes to Start', 1, 0)
ON CONFLICT DO NOTHING;

-- BOTW 4 Minutes (240s) - add 4-min at T-240, 3-min at T-180
INSERT INTO start_sequence_sounds (id, sequence_id, sound_id, trigger_time_seconds, label, repeat_count, sort_order)
VALUES
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000005', '195f5e01-26e7-430d-b1c9-42a195436959', 240, '4 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000005', 'cff9ed89-73c9-4179-85f0-5f7d4577fc73', 180, '3 Minutes to Start', 1, 0)
ON CONFLICT DO NOTHING;

-- BOTW 5 Minutes (300s) - add 5-min at T-300, 4-min at T-240, 3-min at T-180
INSERT INTO start_sequence_sounds (id, sequence_id, sound_id, trigger_time_seconds, label, repeat_count, sort_order)
VALUES
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'a5f21bbd-3b02-4e6a-b21c-81a7ed75e9ac', 300, '5 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', '195f5e01-26e7-430d-b1c9-42a195436959', 240, '4 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000006', 'cff9ed89-73c9-4179-85f0-5f7d4577fc73', 180, '3 Minutes to Start', 1, 0)
ON CONFLICT DO NOTHING;

-- BOTW 8 Minutes (480s) - add 8-min through 3-min callouts
INSERT INTO start_sequence_sounds (id, sequence_id, sound_id, trigger_time_seconds, label, repeat_count, sort_order)
VALUES
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'e151d194-a122-4b36-b720-4832cd81a0e8', 480, '8 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', '77f052b5-a5a0-46ef-88f5-bca89459f2eb', 420, '7 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', '81f1fe68-28d1-4296-b6eb-5dd3f064e943', 360, '6 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'a5f21bbd-3b02-4e6a-b21c-81a7ed75e9ac', 300, '5 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', '195f5e01-26e7-430d-b1c9-42a195436959', 240, '4 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000007', 'cff9ed89-73c9-4179-85f0-5f7d4577fc73', 180, '3 Minutes to Start', 1, 0)
ON CONFLICT DO NOTHING;

-- BOTW 10 Minutes (600s) - add 10-min through 3-min callouts
INSERT INTO start_sequence_sounds (id, sequence_id, sound_id, trigger_time_seconds, label, repeat_count, sort_order)
VALUES
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'df5a09bd-e09a-4ba2-95ca-b76ec30788c5', 600, '10 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', '7251fca2-26e4-4e66-8144-62b609915e0d', 540, '9 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'e151d194-a122-4b36-b720-4832cd81a0e8', 480, '8 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', '77f052b5-a5a0-46ef-88f5-bca89459f2eb', 420, '7 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', '81f1fe68-28d1-4296-b6eb-5dd3f064e943', 360, '6 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'a5f21bbd-3b02-4e6a-b21c-81a7ed75e9ac', 300, '5 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', '195f5e01-26e7-430d-b1c9-42a195436959', 240, '4 Minutes to Start', 1, 0),
  (gen_random_uuid(), 'b0000001-0000-0000-0000-000000000008', 'cff9ed89-73c9-4179-85f0-5f7d4577fc73', 180, '3 Minutes to Start', 1, 0)
ON CONFLICT DO NOTHING;

-- Step 3: Drop the unused minute_callout_sound_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'start_sequences' AND column_name = 'minute_callout_sound_id'
  ) THEN
    ALTER TABLE start_sequences DROP COLUMN minute_callout_sound_id;
  END IF;
END $$;
