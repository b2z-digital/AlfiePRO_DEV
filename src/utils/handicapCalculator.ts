import { Skipper, LetterScore } from '../types';

export const calculateHandicaps = (
  skippers: Skipper[],
  raceResults: any[],
  numRaces: number,
  capLimit: number,
  lastPlaceBonus: boolean,
  isManualHandicaps: boolean
) => {
  // Create deep copies to avoid mutating original data
  const updatedSkippers = JSON.parse(JSON.stringify(skippers));
  const updatedResults = [...raceResults];
  const lastPlaceStreaks = new Array(skippers.length).fill(0);

  // Process each race sequentially
  for (let race = 1; race <= numRaces; race++) {
    const raceData = updatedResults.filter(r => r.race === race);
    if (raceData.length === 0) continue;

    // Get current handicaps for this race
    const currentHcaps = skippers.map((_, idx) => {
      if (race === 1) {
        return skippers[idx].startHcap;
      }
      
      // For subsequent races, use the adjusted handicap from previous race results
      const prevRaceResults = updatedResults.filter(r => r.race === race - 1);
      const prevResult = prevRaceResults.find(r => r.skipperIndex === idx);
      return prevResult?.adjustedHcap ?? skippers[idx].startHcap;
    });

    // Filter out letter scores except RDGfix when determining positions
    const positions = raceData
      .filter(r => r.position !== null || r.letterScore === 'RDGfix')
      .map(r => ({
        position: r.letterScore === 'RDGfix' ? r.position : r.position,
        skipperIndex: r.skipperIndex,
        isOnScratch: currentHcaps[r.skipperIndex] <= 10 // Treat handicaps ≤10s as scratch boats
      }))
      .sort((a, b) => a.position - b.position);

    // Find the best-performing scratch boat in top 3 (if any)
    const bestScratchInTop3 = positions
      .filter(p => p.isOnScratch && p.position >= 1 && p.position <= 3)
      .sort((a, b) => a.position - b.position)[0];

    // Calculate the scratch boat bonus that applies to all non-scratch boats
    let scratchBoatBonus = 0;
    if (bestScratchInTop3) {
      const scratchBoatHandicap = currentHcaps[bestScratchInTop3.skipperIndex];
      // Bonus is calculated as: (30s - scratch boat's handicap) for their position
      const baseBonus = 30 - scratchBoatHandicap;

      if (bestScratchInTop3.position === 1) scratchBoatBonus = baseBonus;
      else if (bestScratchInTop3.position === 2) scratchBoatBonus = Math.max(0, baseBonus - 10);
      else if (bestScratchInTop3.position === 3) scratchBoatBonus = Math.max(0, baseBonus - 20);
    }

    const maxPlace = Math.max(...positions.map(p => p.position));

    // Update results for each skipper in this race
    raceData.forEach(result => {
      const idx = result.skipperIndex;
      const pos = result.position;
      
      // Set initial handicap for the race
      result.handicap = currentHcaps[idx];
      
      // Skip letter scores except RDGfix
      if (result.letterScore && result.letterScore !== 'RDGfix') {
        result.adjustedHcap = currentHcaps[idx];
        return;
      }

      if (pos === null) return;

      const isOnScratch = currentHcaps[idx] <= 10; // Treat handicaps ≤10s as scratch boats
      let adj = 0;

      // Calculate position-based adjustment
      if (pos === 1) adj = -30;
      else if (pos === 2) adj = -20;
      else if (pos === 3) adj = -10;

      // Add scratch boat bonus to non-scratch boats
      if (!isOnScratch && scratchBoatBonus > 0) {
        adj += scratchBoatBonus;
      }

      // For scratch boats in top 3, add bonus to offset the negative adjustment
      if (isOnScratch && pos >= 1 && pos <= 3) {
        adj += scratchBoatBonus; // Double the bonus for the scratch boat itself
      }

      // Handle last place streak for scratch boats
      if (isOnScratch && pos === maxPlace) {
        lastPlaceStreaks[idx]++;
        if (lastPlaceStreaks[idx] >= 3) {
          adj = 30;
          lastPlaceStreaks[idx] = 0;
        }
      } else {
        lastPlaceStreaks[idx] = 0;
      }

      // Apply last place bonus for non-scratch boats
      if (pos === maxPlace && lastPlaceBonus && !isOnScratch) {
        adj += 30;
      }

      const currentHcap = currentHcaps[idx];
      const adjusted = Math.max(0, Math.min(capLimit, currentHcap + adj));

      // Update the result in the main results array
      const resultIndex = updatedResults.findIndex(
        r => r.race === race && r.skipperIndex === idx
      );
      if (resultIndex !== -1) {
        updatedResults[resultIndex] = {
          ...result,
          adjustedHcap: adjusted
        };
      }
    });
  }

  return { 
    updatedSkippers,
    updatedResults
  };
};