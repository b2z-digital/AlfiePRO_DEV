/*
  # Replace SHRS Knowledge Chunks with Comprehensive 2026-1 Rules

  1. Changes
    - Deletes existing SHRS knowledge chunks and document
    - Creates a new comprehensive SHRS knowledge document (category: scoring-rules)
    - Seeds 22 detailed educational chunks covering every aspect of the
      Simple Heat Racing System (SHRS) 2026-1 rules
    - Chunks cover: overview, heat sizing, seeding, movement tables, scoring,
      discards, non-finisher penalties, fleet allocation, finals, tie-breaking,
      RDGave/RDGfix redress, fleet ranking, overall results, and worked examples

  2. Purpose
    - Provides Ask Alfie with deep, structured knowledge about SHRS so it can
      accurately answer Race Officer questions during SHRS-scored events
    - This is the primary scoring system for heat-based racing and must be
      thoroughly documented for AI retrieval

  3. Security
    - No RLS changes; uses existing alfie_knowledge_documents and
      alfie_knowledge_chunks tables
*/

-- Step 1: Delete existing SHRS chunks and document
DELETE FROM alfie_knowledge_chunks
WHERE document_id IN (
  SELECT id FROM alfie_knowledge_documents
  WHERE title ILIKE '%SHRS%' OR title ILIKE '%Simple Heat%'
);

DELETE FROM alfie_knowledge_documents
WHERE title ILIKE '%SHRS%' OR title ILIKE '%Simple Heat%';

-- Step 2: Create the new comprehensive SHRS document
INSERT INTO alfie_knowledge_documents (
  id, title, category, content_text, is_active, processing_status, chunk_count, processed_at, created_at, updated_at
) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'Simple Heat Racing System (SHRS) - 2026 Edition (Version 2026-1)',
  'scoring-rules',
  'Comprehensive rules document for the Simple Heat Racing System (SHRS) 2026-1. This is the primary scoring system used for heat-based radio yacht racing events. Covers qualifying rounds, fleet allocation, finals, scoring, discards, tie-breaking, and all special scoring codes.',
  true,
  'completed',
  22,
  now(),
  now(),
  now()
);

-- Step 3: Seed educational knowledge chunks

-- Chunk 0: SHRS Overview and Purpose
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SIMPLE HEAT RACING SYSTEM (SHRS) - OVERVIEW AND PURPOSE

The Simple Heat Racing System (SHRS) is a structured heat-based scoring system designed for radio-controlled yacht racing events, particularly when the number of competitors exceeds the practical limit for a single fleet on the water. SHRS Version 2026-1 is the current edition.

KEY CONCEPT: Instead of racing all boats together (which becomes impractical beyond roughly 20 boats), SHRS divides competitors into smaller groups called "heats." Boats race within their heat, and their finishing position WITHIN THAT HEAT determines their score for that round.

SHRS has two main phases:
1. QUALIFYING SERIES: Multiple rounds of heat racing where skippers move between heats according to predetermined movement tables. The purpose is to ensure all skippers race against a variety of opponents. Results from qualifying determine fleet allocation for finals.
2. FINALS SERIES: Skippers are allocated to fleets (Gold/A, Silver/B, Bronze/C, Copper/D) based on their qualifying performance. They then race within their allocated fleet for the remainder of the event. There is NO movement between fleets during finals.

The overall event result combines qualifying and finals scores with separate discard schedules applied to each phase.

SHRS is the primary scoring system for heat-based events in the AlfiePRO platform and is widely used in national and international radio yacht racing competitions.',
  0,
  'document'
);

-- Chunk 1: Number and Size of Heats
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 2: NUMBER AND SIZE OF HEATS

Rule 2.1: A SHRS event uses a maximum of 5 heats. The number of heats is determined by the total number of competitors and the practical limit of boats that can race safely together.

Rule 2.2: Heats shall be as equal in size as possible. When the total number of competitors cannot be divided equally, extra boats are assigned to the EARLIER heats first (Heat 1, then Heat 2, etc.).

Rule 2.3: The maximum number of boats per heat is 20. This is a hard limit to ensure safe and fair racing.

HEAT SIZE CALCULATION:
- Number of heats = ceiling(total_skippers / 20), maximum 5
- Base heat size = floor(total_skippers / number_of_heats)
- Remainder = total_skippers mod number_of_heats
- First "remainder" heats get (base_size + 1) boats, remaining heats get base_size boats

EXAMPLES:
- 30 skippers, 2 heats: Heat 1 = 15, Heat 2 = 15
- 50 skippers, 3 heats: Heat 1 = 17, Heat 2 = 17, Heat 3 = 16
- 45 skippers, 3 heats: Heat 1 = 15, Heat 2 = 15, Heat 3 = 15
- 80 skippers, 4 heats: Heat 1 = 20, Heat 2 = 20, Heat 3 = 20, Heat 4 = 20
- 100 skippers, 5 heats: Heat 1 = 20, Heat 2 = 20, Heat 3 = 20, Heat 4 = 20, Heat 5 = 20
- 37 skippers, 2 heats: Heat 1 = 19, Heat 2 = 18

IMPORTANT: The number of heats used in qualifying determines the number of fleets in the finals. For example, 3 qualifying heats means 3 finals fleets (Gold, Silver, Bronze).',
  1,
  'document'
);

-- Chunk 2: Initial Seeding
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 3.1(i): INITIAL SEEDING OF HEATS

The initial seeding determines which skippers start in which heat for Round 1 of qualifying.

SEEDING METHOD: Skippers are first sorted by sail number in alphanumeric order (national letter prefix first, then numeric portion). They are then distributed across heats using a SNAKE PATTERN.

SNAKE PATTERN EXPLANATION:
For 3 heats, the pattern is: 1→2→3→3→2→1→1→2→3→3→2→1...
- 1st skipper → Heat 1
- 2nd skipper → Heat 2
- 3rd skipper → Heat 3
- 4th skipper → Heat 3 (reverses)
- 5th skipper → Heat 2
- 6th skipper → Heat 1
- 7th skipper → Heat 1 (reverses again)
- ...and so on

For 2 heats: 1→2→2→1→1→2→2→1...

PURPOSE: The snake pattern ensures that if sail numbers roughly correlate with skipper ability (as they often do in ranking-based numbering), the heats will be balanced in terms of skill level.

ALTERNATIVE SEEDING MODES:
- Progressive: Racing results from each round determine heat movement for the next round
- Balanced/Preset: All heat assignments are pre-calculated before racing begins using movement tables, ensuring maximum opponent diversity across all qualifying rounds',
  2,
  'document'
);

-- Chunk 3: Heat Movement Tables
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 3.1(ii): HEAT MOVEMENT TABLES

After Round 1, skippers move between heats according to predetermined Movement Tables. The tables ensure that over multiple qualifying rounds, each skipper races against as many different opponents as possible.

TWO MOVEMENT TABLE FORMATS:
1. Numeric format: Heats labeled 1, 2, 3, 4, 5
2. Alphabetic format: Heats labeled A, B, C, D, E
Both produce identical movement patterns.

HOW MOVEMENT TABLES WORK:
- After each round, a skipper''s finishing position within their heat determines which heat they move to for the next round
- The table provides a mapping: "If you finished in position X in round N, you go to heat Y for round N+1"
- Positions beyond 20 use a modulo pattern to wrap around

MOVEMENT TABLE FOR 2 HEATS (positions 1-10):
Position: 1→Heat 1, 2→Heat 2, 3→Heat 1, 4→Heat 2, 5→Heat 1, 6→Heat 2, 7→Heat 1, 8→Heat 2, 9→Heat 1, 10→Heat 2
(Odd positions stay in Heat 1, even positions go to Heat 2, then swap next round)

MOVEMENT TABLE FOR 3 HEATS (positions 1-12):
The cyclic rotation pattern ensures positions cycle through: 1→2→3→1→2→3...
This means top finishers from each heat are distributed across different heats in the next round.

BALANCED MODE: Uses coprime cyclic shifts to maximize opponent variety. The system tracks how often pairs of skippers meet across rounds and performs greedy swaps to minimize repeated matchups, ensuring the fairest possible qualifying series.',
  3,
  'document'
);

-- Chunk 4: Non-Finisher Virtual Positions for Movement
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 3.1(iii): NON-FINISHER VIRTUAL POSITIONS FOR HEAT MOVEMENT

When a skipper does not finish a race (DNF, DNS, DSQ, etc.), they still need a "virtual position" to determine which heat they move to for the next round. Non-finishers are ordered AFTER all finishers in a strict priority order.

PRIORITY ORDER FOR NON-FINISHERS (highest to lowest priority - i.e., DNF ranks better than DSQ):
1. DNF - Did Not Finish (started but did not complete the course)
2. RET - Retired (voluntarily withdrew during racing)
3. NSC - No Scored Course (course not completed due to conditions)
4. OCS - On Course Side (over the start line early, failed to return)
5. DNS - Did Not Start (came to the starting area but did not start)
6. DNC - Did Not Come (did not arrive at the racing area)
7. WDN - Withdrawn (withdrawn from the race by choice or instruction)
8. UFD - Under Flag Disqualification (U flag rule violation)
9. BFD - Black Flag Disqualification (black flag rule violation)
10. DSQ - Disqualified (disqualified by protest committee)
11. ZFP - Z Flag Penalty
12. SCP - Scoring Penalty
13. DPI - Discretionary Penalty Imposed
14. DNE - Disqualification Not Excludable (cannot be discarded)

TIED VIRTUAL POSITIONS: When multiple skippers have the same non-finisher status (e.g., two DNFs), they are ordered by alphanumeric sail number to break the tie.

EXAMPLE: In a heat of 12 boats where 10 finish, 1 gets DNF, and 1 gets DSQ:
- Positions 1-10: Finishers in order
- Position 11: The DNF skipper (ranks higher than DSQ)
- Position 12: The DSQ skipper
These virtual positions are then used with the movement table to determine next-round heat assignments.',
  4,
  'document'
);

-- Chunk 5: Scoring System - Position Within Heat
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.1: SCORING - POSITION WITHIN HEAT

This is one of the most important rules in SHRS and often causes confusion:

CRITICAL RULE: A skipper''s score for each round is their FINISHING POSITION WITHIN THEIR HEAT, not their position across all heats combined.

LOW POINT SCORING SYSTEM:
- 1st place in heat = 1 point
- 2nd place in heat = 2 points
- 3rd place in heat = 3 points
- ...and so on
- LOWEST total score wins

EXAMPLE WITH 3 HEATS OF 10 BOATS EACH (30 total skippers):
- Skipper A wins Heat 1 (10 boats): Score = 1 point
- Skipper B wins Heat 2 (10 boats): Score = 1 point
- Skipper C wins Heat 3 (10 boats): Score = 1 point
All three get 1 point even though only one of them might be the "fastest" overall.

WHY THIS MATTERS: Because all heat winners get 1 point regardless of their absolute speed, the system is fair even though heats may contain different ability levels. The movement tables ensure that over multiple rounds, skippers face a variety of opponents, and their cumulative scores reflect their consistency.

IMPORTANT DISTINCTION FROM OTHER SYSTEMS:
- In standard fleet racing: Position is among ALL competitors (1st out of 30 = 1 point)
- In SHRS: Position is within your heat only (1st out of 10 = 1 point)
- In HMS (Handicap Management System): Scoring may use handicap-adjusted times
- SHRS uses SCRATCH (actual finish) positions only - no handicap adjustments',
  5,
  'document'
);

-- Chunk 6: Non-Finisher Penalty Scoring
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.2: NON-FINISHER PENALTY SCORING

When a skipper does not finish a race (for any reason), they receive a penalty score instead of a position-based score.

THE PENALTY FORMULA:
Score = Largest heat size in that round + 1

IMPORTANT: The penalty is based on the LARGEST heat in the round, not the skipper''s own heat size. This ensures consistent penalties across all heats.

EXAMPLE:
- Round 3 has 3 heats: Heat A = 17 boats, Heat B = 17 boats, Heat C = 16 boats
- Largest heat size = 17
- Non-finisher penalty = 17 + 1 = 18 points
- ALL non-finishers in ALL heats for that round receive 18 points, regardless of which heat they were in

SCORING CODES THAT RECEIVE THIS PENALTY:
- DNF (Did Not Finish)
- DNS (Did Not Start)
- DNC (Did Not Come)
- DSQ (Disqualified)
- OCS (On Course Side)
- BFD (Black Flag Disqualification)
- UFD (U Flag Disqualification)
- RET (Retired)
- NSC (No Scored Course)
- WDN (Withdrawn)
- DNE (Disqualification Not Excludable)

NOTE: DNE scores CANNOT be discarded (see discard rules). All other penalty scores CAN be discarded if the skipper has earned enough races for discards to apply.

IMPORTANT: These penalty scores remain FIXED - they are not recalculated if heat sizes change in later rounds. Each round''s penalty is calculated independently based on that round''s largest heat size.',
  6,
  'document'
);

-- Chunk 7: Discard Schedule
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.3: DISCARD (DROP) SCHEDULE

Discards allow skippers to exclude their worst score(s) from their total. SHRS applies discards SEPARATELY to qualifying and finals phases.

DISCARD SCHEDULE:
- 1 to 3 races completed: 0 discards (all scores count)
- 4 to 7 races completed: 1 discard (drop worst score)
- 8 to 15 races completed: 2 discards (drop 2 worst scores)
- 16 or more races: 2 + floor((races - 8) / 8) additional discards

FORMULA: discards = races < 4 ? 0 : races < 8 ? 1 : 2 + floor((races - 8) / 8)

EXAMPLES:
- 3 qualifying rounds: 0 discards
- 5 qualifying rounds: 1 discard
- 7 qualifying rounds: 1 discard
- 8 qualifying rounds: 2 discards
- 10 qualifying rounds: 2 discards
- 16 qualifying rounds: 3 discards

CRITICAL: QUALIFYING AND FINALS HAVE SEPARATE DISCARD SCHEDULES
- If an event has 6 qualifying rounds and 4 finals rounds:
  - Qualifying discards: 1 (based on 6 races)
  - Finals discards: 1 (based on 4 races)
  - Total discards applied: 2 (1 from each phase)

DISCARD PRIORITY: When choosing which scores to discard:
1. First discard any DNE scores (they CANNOT be discarded, so they are never chosen)
2. Letter score results (penalty scores) are discarded before position scores when they are the worst
3. Among equal worst scores, the system discards the most recent one

NET SCORE = Gross Total - Sum of Discarded Scores
The NET score is what determines final standings.',
  7,
  'document'
);

-- Chunk 8: Redress Scoring - RDGave
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.6: REDRESS BY AVERAGE (RDGave)

When a protest committee grants redress using an average score (as opposed to a fixed score), the RDGave calculation is used.

RDGave FORMULA:
Score = (Sum of all scored rounds in the same phase, EXCLUDING other RDGave rounds) / (Count of those rounds)

CRITICAL RULES:
1. RDGave is calculated within the SAME PHASE (qualifying or finals) only
2. Other RDGave rounds are EXCLUDED from the average calculation
3. The result is rounded to 1 decimal place

WORKED EXAMPLE:
A skipper has 6 qualifying rounds with these scores:
- Round 1: 3 points
- Round 2: 5 points
- Round 3: RDGave (needs to be calculated)
- Round 4: 2 points
- Round 5: 7 points
- Round 6: 4 points

Calculation:
- Exclude Round 3 (it is the RDGave round)
- Sum of remaining: 3 + 5 + 2 + 7 + 4 = 21
- Count of remaining: 5 rounds
- RDGave = 21 / 5 = 4.2 points

So Round 3 is scored as 4.2 points.

MULTIPLE RDGave ROUNDS:
If a skipper has two RDGave rounds (e.g., Rounds 3 and 5):
- Both are excluded from the average calculation
- Both receive the same average based on the remaining rounds
- Rounds 1, 2, 4, 6 scores are used: (3 + 5 + 2 + 4) / 4 = 3.5
- Both Round 3 and Round 5 are scored as 3.5 points',
  8,
  'document'
);

-- Chunk 9: Redress Scoring - RDGfix
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.5: REDRESS BY FIXED POINTS (RDGfix)

When a protest committee grants redress with a specific fixed point value, the RDGfix code is used.

HOW IT WORKS:
- The protest committee decides the exact number of points the skipper should receive for that round
- This fixed value is entered directly as the score
- It is NOT recalculated and does NOT change based on other results

EXAMPLE:
If the protest committee determines a skipper should receive 2.0 points for Round 4, the Race Officer enters:
- Scoring code: RDG (redress)
- Fixed points: 2.0

The skipper''s Round 4 score becomes exactly 2.0 points.

DIFFERENCE BETWEEN RDGave AND RDGfix:
- RDGave: Automatically calculated as the average of other round scores
- RDGfix: Manually set by the protest committee to a specific value
- Both appear as "RDG" in results but are calculated differently

IN THE SCORING SOFTWARE:
- RDGfix is identified when a result has a letterScore of "RDG" AND a customPoints value greater than 0
- RDGave is identified when a result has a letterScore of "RDG" WITHOUT a specific customPoints value
- The software automatically determines which calculation to use based on these fields',
  9,
  'document'
);

-- Chunk 10: Fleet Allocation for Finals
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 4: FLEET ALLOCATION FOR FINALS

After the qualifying series is complete, skippers are allocated to fleets for the finals based on their qualifying performance.

Rule 4.1: NUMBER OF FLEETS
The number of finals fleets equals the number of qualifying heats:
- 2 qualifying heats → 2 fleets (Gold, Silver)
- 3 qualifying heats → 3 fleets (Gold, Silver, Bronze)
- 4 qualifying heats → 4 fleets (Gold, Silver, Bronze, Copper)
- 5 qualifying heats → 5 fleets (Gold, Silver, Bronze, Copper, Fleet E)

FLEET DESIGNATIONS AND COLORS:
- Fleet A = Gold Fleet (yellow)
- Fleet B = Silver Fleet (silver/grey)
- Fleet C = Bronze Fleet (amber/brown)
- Fleet D = Copper Fleet (orange)
- Fleet E = Fleet E (teal)
- Fleet F = Fleet F (green) - rare, only with 6+ heats

Rule 4.1: FLEET SIZES
Fleet sizes should be as equal as possible. When unequal, extra boats are allocated to UPPER fleets first:
- Gold Fleet gets extras first
- Silver Fleet gets extras second
- Bronze Fleet gets extras third
- And so on

EXAMPLE: 50 skippers, 3 fleets:
- Gold Fleet: 17 skippers (gets 1 extra)
- Silver Fleet: 17 skippers (gets 1 extra)
- Bronze Fleet: 16 skippers

FLEET RANKING: Skippers are ranked by their qualifying NET total (with standard discards applied per Rule 5.3). The top-ranked skippers go to Gold Fleet, next group to Silver, and so on.

Rule 4.2: WITHDRAWN SKIPPERS
Any skippers who withdraw before finals are assigned to the lowest fleet.',
  10,
  'document'
);

-- Chunk 11: Fleet Ranking Temporary Exclusion
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULES 4.2-4.3: FLEET RANKING WITH TEMPORARY EXCLUSION

When allocating skippers to fleets, a special temporary exclusion rule may apply to make fleet allocation fairer.

Rule 4.3: TEMPORARY ADDITIONAL EXCLUSION FOR FLEET RANKING
If the qualifying series has between 5 and 7 completed races, ONE ADDITIONAL score is temporarily excluded when calculating fleet ranking positions.

HOW IT WORKS:
- Standard discards for 5-7 races = 1 discard (per Rule 5.3)
- For fleet ranking purposes ONLY: Use 2 discards instead of 1
- This means the 2nd-worst score is ALSO excluded when determining fleet allocation
- IMPORTANT: This extra exclusion is ONLY used for fleet allocation. Once fleets are assigned, standard discards (1 for 5-7 races) apply for actual scoring.

EXAMPLE WITH 6 QUALIFYING ROUNDS:
A skipper''s qualifying scores: 3, 5, 12, 2, 4, 8
- Standard discards (1): Drop 12 → Net = 3+5+2+4+8 = 22
- Fleet ranking discards (2): Drop 12 and 8 → Fleet ranking score = 3+5+2+4 = 14

The fleet ranking score of 14 is used ONLY to determine which fleet the skipper is placed in. Their actual qualifying total for event results uses the standard 1-discard net of 22.

WHY THIS EXISTS: With 5-7 qualifying rounds and only 1 standard discard, a single bad round can disproportionately affect fleet allocation. The temporary extra exclusion reduces the impact of one anomalous result on fleet placement, making the allocation fairer.

WHEN IT DOES NOT APPLY:
- 1-4 qualifying rounds: No extra exclusion (standard 0 discards, fleet ranking also 0)
- 8+ qualifying rounds: No extra exclusion (standard 2+ discards is sufficient)',
  11,
  'document'
);

-- Chunk 12: Finals Racing
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS FINALS SERIES RACING

Once fleets are allocated, the finals series begins. Finals operate differently from qualifying.

KEY DIFFERENCES FROM QUALIFYING:
1. NO MOVEMENT BETWEEN FLEETS: Skippers stay in their allocated fleet for ALL finals races. There is no promotion or relegation during finals.
2. SEPARATE DISCARD SCHEDULE: Finals have their own discard schedule independent of qualifying (per Rule 5.3).
3. POSITION SCORING: Same as qualifying - score = position within fleet (not overall position).

FINALS SCORING:
- 1st in Gold Fleet = 1 point (for that finals round)
- 1st in Silver Fleet = 1 point (for that finals round)
- Both get 1 point because scoring is within-fleet

NON-FINISHER PENALTIES IN FINALS:
Same formula as qualifying: Largest fleet size in that round + 1
(Fleet sizes replace heat sizes in the penalty calculation)

FINALS DISCARD SCHEDULE (same formula as qualifying):
- 1-3 finals races: 0 discards
- 4-7 finals races: 1 discard
- 8-15 finals races: 2 discards

OVERALL EVENT RESULT:
The overall position is determined by:
1. Qualifying Net Total + Finals Net Total = Overall Net Score
2. Qualifying discards applied to qualifying scores ONLY
3. Finals discards applied to finals scores ONLY
4. Lowest overall net score wins

FLEET POSITIONS IN FINALS:
Within each fleet, skippers are ranked by their finals net score. Gold Fleet positions are: 1st overall, 2nd overall, etc. Silver Fleet positions start after all Gold Fleet positions. So if Gold Fleet has 17 boats, the Silver Fleet winner is 18th overall.',
  12,
  'document'
);

-- Chunk 13: Tie-Breaking Rules
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS RULE 5.6: TIE-BREAKING PROCEDURES

When two or more skippers have the same net score, ties are broken using a specific priority system.

TIE-BREAK PRIORITY ORDER:

STEP 1: SAME-HEAT COUNTBACK (Rule 5.6(a))
If the tied skippers sailed in the SAME heat in any qualifying or finals round:
- Consider ONLY the rounds where both skippers were in the same heat
- Apply RRS (Racing Rules of Sailing) Appendix A8.1/A8.2 countback method using ONLY those shared-heat scores
- NO discards are applied in this comparison (all shared scores count)
- The skipper with the better countback in their head-to-head rounds wins the tie

HOW COUNTBACK WORKS (RRS A8.1/A8.2):
Compare each skipper''s best individual race score. If equal, compare their next-best scores. Continue until the tie is broken.
Example: Skipper A shared heats in rounds 2, 4, 6 with scores [2, 5, 3], Skipper B had [3, 4, 4]
- Best scores: A=2, B=3 → Skipper A wins the tie

STEP 2: UNMODIFIED RRS A8.1/A8.2 COUNTBACK (Rule 5.6(b))
If the tied skippers NEVER sailed in the same heat:
- Use ALL race scores with standard discards already applied
- Apply the standard RRS A8.1/A8.2 countback method across all rounds

STEP 3: ALPHABETICAL FALLBACK
If still tied after both countback methods:
- Compare by surname (case-insensitive, alphabetical)
- If surnames match: compare by first name
- If names match: compare by sail number (numeric-aware comparison)

IMPORTANT: This three-step tie-breaking ensures the fairest possible resolution, prioritizing direct competition results over statistical methods.',
  13,
  'document'
);

-- Chunk 14: Overall Results Calculation
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS OVERALL RESULTS CALCULATION - STEP BY STEP

Here is the complete process for calculating overall SHRS results:

STEP 1: CALCULATE QUALIFYING SCORES
For each skipper, for each qualifying round:
- Score = finishing position within their heat
- Non-finishers: Score = largest heat size in that round + 1
- RDGave: Score = average of all other qualifying scores (excl. other RDGave)
- RDGfix: Score = fixed points assigned by protest committee

STEP 2: APPLY QUALIFYING DISCARDS
- Count total qualifying rounds completed
- Determine discards: 0 (1-3 races), 1 (4-7), 2 (8-15), etc.
- Remove the worst score(s) (DNE scores cannot be discarded)
- Qualifying Net = Qualifying Gross - Discarded Scores

STEP 3: ALLOCATE FLEETS (if finals phase exists)
- Rank all skippers by qualifying net score
- Apply temporary extra exclusion if 5-7 qualifying rounds
- Divide into fleets: top group → Gold, next → Silver, etc.
- Fleet sizes as equal as possible, extras to upper fleets

STEP 4: CALCULATE FINALS SCORES
Same scoring rules as qualifying but within fleet groups

STEP 5: APPLY FINALS DISCARDS
Separate discard schedule based on number of finals rounds only

STEP 6: CALCULATE OVERALL NET SCORE
Overall Net = Qualifying Net + Finals Net

STEP 7: DETERMINE POSITIONS
- Sort by overall net score (lowest wins)
- Within each fleet, rank separately
- Gold Fleet positions: 1st through Gold Fleet size
- Silver Fleet positions: (Gold Fleet size + 1) through (Gold + Silver size)
- Apply tie-breaking if needed (see Rule 5.6)

STEP 8: VERIFY
Check all calculations against SHRS rules for compliance.',
  14,
  'document'
);

-- Chunk 15: Worked Example - Small Event
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS WORKED EXAMPLE: 24-SKIPPER EVENT WITH 2 HEATS

SETUP:
- 24 skippers, 2 heats of 12
- 5 qualifying rounds, 3 finals rounds
- Qualifying discards: 1 (5 races = 1 discard per Rule 5.3)
- Finals discards: 0 (3 races = 0 discards per Rule 5.3)

QUALIFYING (Example for Skipper "John Smith"):
Round 1: Heat 1, finished 3rd of 12 → Score = 3
Round 2: Heat 2, finished 1st of 12 → Score = 1
Round 3: Heat 1, finished 5th of 12 → Score = 5
Round 4: Heat 2, finished 2nd of 12 → Score = 2
Round 5: Heat 1, finished DNF → Score = 12+1 = 13 (largest heat = 12)

Qualifying Gross = 3 + 1 + 5 + 2 + 13 = 24
Qualifying Discards = 1 (drop worst: 13)
Qualifying Net = 24 - 13 = 11

FLEET ALLOCATION:
- Fleet ranking uses 2 discards (5-7 races = extra exclusion)
- John''s fleet ranking score: drop 13 AND 5 → 3+1+2 = 6
- Based on all skippers'' fleet ranking scores, John is placed in Gold Fleet (top 12)

FINALS (John is in Gold Fleet of 12):
Final 1: Finished 4th of 12 → Score = 4
Final 2: Finished 2nd of 12 → Score = 2
Final 3: Finished 1st of 12 → Score = 1

Finals Gross = 4 + 2 + 1 = 7
Finals Discards = 0
Finals Net = 7

OVERALL:
Overall Net = Qualifying Net (11) + Finals Net (7) = 18
John''s overall position depends on how this compares to other Gold Fleet skippers.',
  15,
  'document'
);

-- Chunk 16: Worked Example - Large Event
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS WORKED EXAMPLE: 50-SKIPPER EVENT WITH 3 HEATS

SETUP:
- 50 skippers, 3 heats: Heat A = 17, Heat B = 17, Heat C = 16
- 8 qualifying rounds, 4 finals rounds
- Qualifying discards: 2 (8 races per Rule 5.3)
- Finals discards: 1 (4 races per Rule 5.3)

NON-FINISHER PENALTY for this event:
- Largest heat = 17 boats
- Penalty score = 17 + 1 = 18 points (applied to ALL non-finishers in ALL heats)

FLEET ALLOCATION after 8 qualifying rounds:
- 3 qualifying heats → 3 finals fleets
- Gold Fleet: 17 skippers (top qualifying positions)
- Silver Fleet: 17 skippers (middle qualifying positions)
- Bronze Fleet: 16 skippers (lower qualifying positions)
- No extra exclusion for fleet ranking (8 races, rule only applies for 5-7)

FINALS with 4 rounds, 1 discard:
- Gold Fleet: 17 boats racing together in each finals round
- Silver Fleet: 17 boats racing together
- Bronze Fleet: 16 boats racing together
- Non-finisher penalty in finals: largest fleet = 17, penalty = 18

OVERALL POSITIONS:
- Gold Fleet 1st = Overall 1st
- Gold Fleet 2nd = Overall 2nd
- ...
- Gold Fleet 17th = Overall 17th
- Silver Fleet 1st = Overall 18th
- Silver Fleet 2nd = Overall 19th
- ...
- Silver Fleet 17th = Overall 34th
- Bronze Fleet 1st = Overall 35th
- ...
- Bronze Fleet 16th = Overall 50th

TOTAL DISCARDS: 2 (qualifying) + 1 (finals) = 3 worst scores dropped across the event.',
  16,
  'document'
);

-- Chunk 17: Qualifying Series Opponent Diversity
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS QUALIFYING SERIES: ENSURING OPPONENT DIVERSITY

A key goal of the SHRS qualifying series is to ensure each skipper races against as many different opponents as possible. This is achieved through the heat movement system.

PROGRESSIVE MODE:
In progressive mode, skippers move between heats based on their actual race results. Better finishers tend to group together over time, which creates a natural ranking effect but may reduce opponent diversity.

BALANCED/PRESET MODE (RECOMMENDED):
In balanced mode, all heat assignments for all qualifying rounds are pre-calculated before racing begins. The system uses sophisticated algorithms to maximize opponent diversity:

1. COPRIME CYCLIC SHIFTS: For each round after the first, heat assignments are shifted using coprime numbers relative to the number of heats. This mathematical property ensures positions cycle through all heats before repeating.

2. PAIR OVERLAP TRACKING: The system builds a matrix tracking how many times each pair of skippers has been in the same heat across all rounds.

3. GREEDY SWAPS: After initial assignment, the system performs targeted swaps to reduce instances where the same pair of skippers meet too frequently. It iteratively finds the pair with the most overlaps and swaps one of them with another skipper in a different heat.

4. MINIMUM OVERLAP TARGET: The algorithm aims for each pair to meet approximately (rounds / heats) times, evenly distributed.

EXAMPLE: 50 skippers, 3 heats, 8 qualifying rounds
- Each skipper races ~8 rounds of 16-17 opponents
- In 3 heats, each skipper sees approximately 33 of 49 opponents over 8 rounds
- Balanced mode ensures the distribution is as even as possible

Race Officers can verify opponent diversity by examining the heat assignment preview before racing begins.',
  17,
  'document'
);

-- Chunk 18: Common Race Officer Questions
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS: COMMON RACE OFFICER QUESTIONS AND ANSWERS

Q: How many qualifying rounds should I run?
A: The recommended minimum is 4 qualifying rounds (to allow 1 discard). Ideally run 5-8 rounds for fair fleet allocation. More rounds = better opponent diversity and fairer results. Consider time constraints - typically 3-4 races per session, 2 sessions per day.

Q: When should I move from qualifying to finals?
A: After completing the planned number of qualifying rounds. Common patterns: Day 1 = qualifying, Day 2 = finals. Or if weather limits racing, ensure at least 4 qualifying rounds before moving to finals.

Q: A skipper joined late and missed Round 1. What happens?
A: They receive DNC (Did Not Come) for missed rounds. Score = largest heat size + 1 for each missed round. They are seeded into their heat for the first round they attend.

Q: A skipper has to leave early before finals. What do I do?
A: Per Rule 4.2, withdrawn skippers are assigned to the lowest fleet. They receive DNC for any finals rounds they miss.

Q: Two heats have different numbers of boats. Is the scoring still fair?
A: Yes! Because scoring is position-within-heat, the system is inherently fair. A 1st place in a heat of 12 scores the same (1 point) as 1st in a heat of 15. The only impact is on non-finisher penalties, which use the LARGEST heat size + 1 for consistency.

Q: Can I change the number of heats mid-event?
A: This is strongly discouraged as it disrupts the movement tables. If absolutely necessary (e.g., many withdrawals), you would need to re-seed the remaining skippers.

Q: What if a round cannot be completed (e.g., wind dies)?
A: If ALL heats in a round are abandoned, that round is discarded entirely. If only SOME heats complete, the incomplete heats'' skippers receive NSC (No Scored Course) = largest heat size + 1.',
  18,
  'document'
);

-- Chunk 19: SHRS vs HMS Comparison
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS vs HMS: KEY DIFFERENCES BETWEEN SCORING SYSTEMS

SHRS (Simple Heat Racing System) and HMS (Handicap Management System) are the two primary heat-based scoring systems in the AlfiePRO platform. Understanding the differences is important for Race Officers.

SCORING BASIS:
- SHRS: Scratch (actual finish) positions only. No handicap adjustments.
- HMS: Handicap-corrected positions. Finish times are adjusted by handicap to determine positions.

HEAT MOVEMENT:
- SHRS: Uses predetermined movement tables or progressive mode. Skippers move based on their position in the heat.
- HMS: Uses promotion/relegation between rounds. Top finishers in lower heats promote up, bottom finishers in upper heats relegate down.

FINALS:
- SHRS: Distinct finals phase with allocated fleets (Gold, Silver, Bronze, etc.). No movement between fleets.
- HMS: No distinct finals phase. Continuous promotion/relegation throughout the event.

DISCARDS:
- SHRS: Separate discard schedules for qualifying and finals (Rule 5.3).
- HMS: Single discard schedule across all rounds.

WHEN TO USE SHRS:
- National/international championship events
- Events where scratch (non-handicap) racing is preferred
- Events with large fleets (20+ boats) requiring heat-based racing
- Events where fleet allocation for finals is desired

WHEN TO USE HMS:
- Club-level events with mixed ability levels
- Events where handicap racing provides fairer competition
- Events where continuous promotion/relegation adds excitement
- Smaller events where distinct qualifying/finals phases are unnecessary',
  19,
  'document'
);

-- Chunk 20: SHRS Setup in AlfiePRO
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SETTING UP SHRS IN THE ALFIE PLATFORM

To set up a SHRS event in AlfiePRO:

1. CREATE THE EVENT: Create a new race event and select "Heat Management" as the scoring mode.

2. CONFIGURE SHRS: In the heat management settings, select "SHRS" as the scoring system (not HMS).

3. SET QUALIFYING ROUNDS: Enter the number of qualifying rounds planned. This determines when the system transitions from qualifying to finals.

4. ADD SKIPPERS: Enter all competitors with their sail numbers. Sail numbers are important as they determine initial seeding order.

5. INITIAL SEEDING: The platform automatically seeds skippers into heats using the snake pattern based on sail number order. You can choose between progressive and balanced seeding modes.

6. RUN QUALIFYING: Score each round using the scoring interface. The system automatically:
   - Calculates position-within-heat scores
   - Applies non-finisher penalties
   - Tracks heat movement for the next round
   - Calculates running standings

7. FLEET ALLOCATION: After all qualifying rounds are complete, the platform automatically allocates skippers to fleets based on qualifying performance. You can review and confirm before proceeding.

8. RUN FINALS: Score finals rounds within fleet groups. The system handles separate discard schedules automatically.

9. RESULTS: The platform displays overall results with qualifying net, finals net, and combined overall net scores, along with fleet positions and any tie-breaks applied.

TIPS FOR RACE OFFICERS:
- Use the Rankings tab (right-side panel) during scoring to see live standings
- The system validates all scores against SHRS rules
- Export results at any point for backup or review
- The Ask Alfie assistant can answer SHRS scoring questions during the event',
  20,
  'document'
);

-- Chunk 21: Letter Score Reference for SHRS
INSERT INTO alfie_knowledge_chunks (document_id, content, chunk_index, source_type) VALUES (
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  'SHRS LETTER SCORE QUICK REFERENCE

All letter scores in SHRS receive a penalty of: LARGEST HEAT SIZE IN THE ROUND + 1

LETTER SCORES AND THEIR MEANINGS:

DNF (Did Not Finish): Started but did not cross the finish line. Common when a boat has equipment failure during the race. Score = heat size + 1. CAN be discarded.

DNS (Did Not Start): Was in the starting area but did not start the race. Score = heat size + 1. CAN be discarded.

DNC (Did Not Come): Did not appear at the starting area at all. Score = heat size + 1. CAN be discarded.

DSQ (Disqualified): Found to have broken a rule by the protest committee. Score = heat size + 1. CAN be discarded.

OCS (On Course Side): Was over the start line when the starting signal was made and failed to return. Score = heat size + 1. CAN be discarded.

BFD (Black Flag Disqualification): Disqualified under the black flag rule for being in the triangle formed by the starting marks and the first mark during the minute before the start. Score = heat size + 1. CAN be discarded.

UFD (U Flag Disqualification): Disqualified under the U flag rule. Score = heat size + 1. CAN be discarded.

RET (Retired): Voluntarily withdrew during the race. Score = heat size + 1. CAN be discarded.

NSC (No Scored Course): Race not completed due to conditions. Score = heat size + 1. CAN be discarded.

WDN (Withdrawn): Withdrawn from the race. Score = heat size + 1. CAN be discarded.

DNE (Disqualification Not Excludable): A serious rule violation. Score = heat size + 1. CANNOT be discarded - this score always counts.

RDG (Redress): See Rules 5.5 (RDGfix) and 5.6 (RDGave) for calculation methods. CAN be discarded.

ZFP (Z Flag Penalty): 20% penalty added to score. Score = heat size + 1. CAN be discarded.

SCP (Scoring Penalty): Voluntary penalty taken. Score = heat size + 1. CAN be discarded.

DPI (Discretionary Penalty Imposed): Penalty imposed by protest committee. Score = heat size + 1. CAN be discarded.',
  21,
  'document'
);
