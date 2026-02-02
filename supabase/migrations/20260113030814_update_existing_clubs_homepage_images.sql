/*
  # Update Existing Clubs' Homepage Images to LMRYC Images
  
  Updates homepage tiles and slides for existing clubs (except LMRYC itself)
  to use the professional sailing-related images from LMRYC.
  
  1. Changes
    - Updates all existing homepage tiles with Unsplash URLs to use LMRYC images
    - Updates all existing homepage slides with Unsplash URLs to use LMRYC images
    - Preserves LMRYC's custom images
*/

-- Update existing homepage tiles to use LMRYC images (except LMRYC's own tiles)
UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png'
WHERE title = 'Membership' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png'
WHERE title = 'Race Program' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png'
WHERE title = 'Classes' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714334371_dgngg6.jpg'
WHERE title = 'Venue' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761799093766_43j26l.jpg'
WHERE title = 'News' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

UPDATE homepage_tiles SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714523155_j2g5fj.jpg'
WHERE title = 'Classifieds' 
  AND club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND image_url LIKE '%unsplash%';

-- Update existing homepage slides to use LMRYC images (except LMRYC's own slides)
UPDATE homepage_slides SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png'
WHERE club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND display_order = 0
  AND image_url LIKE '%unsplash%';

UPDATE homepage_slides SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png'
WHERE club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND display_order = 1
  AND image_url LIKE '%unsplash%';

UPDATE homepage_slides SET image_url = 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png'
WHERE club_id != 'bafdff76-ebe7-4890-b7fa-20aa9bb37491'
  AND display_order = 2
  AND image_url LIKE '%unsplash%';
