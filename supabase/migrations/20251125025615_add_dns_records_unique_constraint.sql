/*
  # Add unique constraint to dns_records table

  1. Changes
    - Add unique constraint on (entity_id, record_type) to dns_records table
    - This allows upsert operations to work correctly when publishing websites
  
  2. Notes
    - Ensures only one DNS record exists per entity and record type
    - Required for the Cloudflare DNS management Edge Function
*/

-- Add unique constraint to dns_records table
ALTER TABLE dns_records 
ADD CONSTRAINT dns_records_entity_record_unique 
UNIQUE (entity_id, record_type);
