/*
  # Seed Handicap Scoring Knowledge for Ask Alfie

  1. New Knowledge Content
    - Comprehensive handicap calculation rules for the Alfie AI knowledge base
    - Covers seeding, adjustments, scratch boat bonus, cap limits, letter scores, worked examples

  2. Data Changes
    - 1 new row in alfie_knowledge_documents
    - 1 new row in alfie_tuning_guides
    - 9 new rows in alfie_knowledge_chunks

  3. Important Notes
    - Enables Ask Alfie to explain handicap calculations with precise rules
    - Chunks linked to both document and tuning guide for search_knowledge_text RPC
*/

DO $$
DECLARE
  doc_id uuid := 'a1b2c3d4-2222-4aaa-bbbb-000000000001'::uuid;
  guide_id uuid := 'a1b2c3d4-1111-4aaa-bbbb-000000000001'::uuid;
  system_user uuid;
BEGIN

SELECT uploaded_by INTO system_user FROM alfie_tuning_guides WHERE uploaded_by IS NOT NULL LIMIT 1;

-- Create the knowledge document
INSERT INTO alfie_knowledge_documents (id, title, category, is_active, chunk_count, processing_status, created_at, updated_at)
VALUES (doc_id, 'AlfiePRO Handicap Scoring Rules', 'scoring', true, 9, 'completed', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Create the tuning guide
INSERT INTO alfie_tuning_guides (id, name, boat_type, description, status, is_active, content_text, input_type, uploaded_by, created_at, updated_at)
VALUES (guide_id, 'AlfiePRO Handicap Scoring System - Complete Rules', 'all',
  'Complete rules and calculation logic for the AlfiePRO handicap scoring system.',
  'active', true,
  'AlfiePRO Handicap Scoring System complete rules.',
  'text', system_user, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Chunk 0: Overview
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 0,
  'AlfiePRO Handicap Scoring System Overview: AlfiePRO uses a progressive handicap system for radio-controlled yacht racing. Each skipper has a handicap value in seconds representing their time advantage. The scratch boat (handicap 0) is the benchmark and receives no time advantage. All other skippers receive their handicap in seconds as a head start. Handicaps are adjusted after each race based on finishing position. The system is designed to bring all skippers closer together in performance over time. Key concepts: Handicap value is measured in seconds (0, 10, 20, 30 etc), higher means more time advantage. Scratch boat has handicap 0 and is the fastest or benchmark boat. Cap limit is the maximum handicap value allowed. Adjusted handicap is the handicap value after race adjustments are applied.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring calculation rules"}'::jsonb, now());

-- Chunk 1: Seeding Race
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 1,
  'Handicap Seeding Race (Race 1 All on Scratch): When ALL boats start with handicap 0 and handicaps are NOT manually set, Race 1 is treated as a seeding race. No position-based adjustments are applied. Instead handicaps are assigned based on finishing position: 1st place gets 0 seconds (stays on scratch), 2nd place gets 10 seconds, 3rd place gets 20 seconds, 4th place gets 30 seconds, 5th place gets 40 seconds. The formula is (position minus 1) multiplied by 10 seconds. Letter scores such as DNS or DNF receive 0 handicap. This seeding establishes the initial handicap spread for subsequent races. If initial handicaps are already pre-set from a previous series or manual entry, Race 1 simply uses those pre-set values as the adjusted handicap with no further adjustments, and normal adjustments begin from Race 2 onwards.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring seeding race"}'::jsonb, now());

-- Chunk 2: Standard Adjustments
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 2,
  'Standard Handicap Adjustments from Race 2 onwards: After each race, handicaps are adjusted based on finishing position. 1st place adjustment: minus 30 seconds (handicap reduced by 30). 2nd place adjustment: minus 20 seconds (handicap reduced by 20). 3rd place adjustment: minus 10 seconds (handicap reduced by 10). 4th place and below: no position-based adjustment, 0 seconds change. These adjustments reward better performance by reducing the handicap, making the skipper faster on paper. The minimum handicap is always 0 and can never go below zero. The maximum is the configurable cap limit. The formula is: newHandicap equals max(0, min(capLimit, currentHandicap plus adjustment)).',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring position adjustments"}'::jsonb, now());

-- Chunk 3: Scratch Boat Bonus
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 3,
  'Scratch Boat Bonus - Critical Handicap Rule: When a scratch boat (handicap 0) wins the race by finishing 1st, a plus 30 second bonus is added to ALL other boats handicaps. This is ON TOP OF any position-based adjustment. The scratch boat winner also receives the bonus to offset their minus 30 position adjustment, keeping them at 0. Why does this exist? If the fastest boat (scratch) wins, it means the handicaps are not generous enough for the other boats. The plus 30 bonus increases everyone else time advantage. Example when scratch boat wins: 1st place scratch hcap 0: minus 30 plus 30 equals 0, stays at 0. 2nd place hcap 20: minus 20 plus 30 equals plus 10, new hcap 30. 3rd place hcap 40: minus 10 plus 30 equals plus 20, new hcap 60. 4th place hcap 60: 0 plus 30 equals plus 30, new hcap 90. The scratch boat bonus does NOT apply when the scratch boat does NOT win (finishes 2nd or worse) or when ALL boats are on scratch (that is a seeding race instead).',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring scratch boat bonus"}'::jsonb, now());

-- Chunk 4: Non-scratch winner
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 4,
  'Handicap Calculation When a Non-Scratch Boat Wins: When a non-scratch boat wins the race, there is NO scratch boat bonus applied. Only the standard position-based adjustments apply. Example: 1st place hcap 30: minus 30, new hcap 0 and this boat becomes a scratch boat. 2nd place hcap 20: minus 20, new hcap 0 and also becomes scratch. 3rd place scratch hcap 0: minus 10, capped at 0 because handicaps cannot go below zero. 4th place hcap 50: no adjustment, stays at 50. 5th place hcap 40: no adjustment, stays at 40. Important: multiple boats can be on scratch handicap 0 at the same time.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring non-scratch winner"}'::jsonb, now());

-- Chunk 5: Letter Scores
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 5,
  'Letter Score Handling in Handicap Races: When a skipper gets a letter score instead of a finishing position, special handicap rules apply. DNF, DNS, DNC, DSQ, BFD, OCS, RET, DNE, NSC, RDG, and DPI all receive the scratch boat bonus of plus 30 if a scratch boat won, but they get NO position-based adjustment. WDN (Withdrawn) gets NO adjustment at all and the handicap stays completely unchanged. RDGfix (Redress with Fixed Position) is treated as a normal finishing position and gets both position-based adjustment and scratch boat bonus as applicable. For points: DNF and RET get finishers plus 1. DNS, DNC, WDN, NSC, OCS, BFD get competitors plus 1. DSQ and DNE get competitors plus 2.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring letter scores"}'::jsonb, now());

-- Chunk 6: Last Place Rules
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 6,
  'Last Place Handling in Handicap Races: Last Place Bonus for non-scratch boats: When enabled, the last-place finisher among positioned boats receives an additional plus 30 seconds added to their handicap. This only applies to non-scratch boats. It prevents lower-performing boats from having their handicaps eroded too quickly. Last Place Streak for scratch boats: If a scratch boat finishes last for 3 consecutive races in a row, they receive plus 30 seconds. This is a safety valve because if the fastest boat keeps losing, their handicap needs adjusting up. The streak counter resets after the bonus is applied or when the scratch boat does not finish last.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring last place rules"}'::jsonb, now());

-- Chunk 7: Points and Standings
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 7,
  'Points and Standings in Handicap Races: Points are assigned based on corrected finishing position. 1st place gets 1 point, 2nd gets 2 points, 3rd gets 3 points, nth gets n points. Low-point scoring: lowest total wins. Gross total is sum of all race points. Net total is sum minus dropped races. Drop rules: e.g. drop 1 after 4 races, drop 2 after 8. Standings ranked by net total, lowest is best. Ties broken by countback of best individual race results.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring points standings"}'::jsonb, now());

-- Chunk 8: Worked Example
INSERT INTO alfie_knowledge_chunks (id, document_id, tuning_guide_id, chunk_index, content, metadata, created_at)
VALUES (gen_random_uuid(), doc_id, guide_id, 8,
  'Handicap Calculation Worked Example: Starting handicaps after seeding: Keith Albury AUS 46 = 0 (scratch), Colin Andrews AUS 20 = 10, Thomas Collinge AUS 186 = 20, Ian Craig AUS 86 = 30, Phillip Eyles AUS 68 = 30. Race 2: Keith 1st, Colin 2nd, Thomas 3rd, Ian 4th, Phillip 5th. Keith is scratch and won so +30 bonus applies. Keith: 0+(-30+30)=0. Colin: 10+(-20+30)=20. Thomas: 20+(-10+30)=40. Ian: 30+(0+30)=60. Phillip: 30+(0+30)=60. Race 3: Colin 1st, Keith 2nd, Ian 3rd, Thomas 4th, Phillip 5th. Colin NOT on scratch (hcap 20) so NO bonus. Colin: 20-30=0 becomes scratch. Keith: 0-20=0 stays 0. Ian: 60-10=50. Thomas: 40+0=40. Phillip: 60+0=60.',
  '{"document_title": "AlfiePRO Handicap Scoring Rules", "category": "handicap scoring worked example calculation"}'::jsonb, now());

END $$;
