import { Skipper } from '../types';
import { supabase } from './supabase';

interface AdjustmentRule {
  id: string;
  priority: number;
  name: string;
  condition_type: string;
  condition_value: any;
  action: string;
  action_value: number;
  applies_to: string;
  description?: string;
}

interface RulesetConfig {
  cap_limit: number;
  last_place_bonus_enabled: boolean;
  last_place_bonus_value: number;
  scratch_boat_win_bonus: number;
  scratch_streak_threshold: number;
  scratch_streak_bonus: number;
  skip_seeding_race: boolean;
}

interface SeedingRule {
  method: string;
  base_value: number;
  increment_per_position: number;
}

export interface LoadedRuleset {
  id: string;
  name: string;
  config: RulesetConfig;
  seedingRule: SeedingRule | null;
  adjustmentRules: AdjustmentRule[];
}

export async function loadRulesetForClub(clubId: string): Promise<LoadedRuleset | null> {
  const { data: club } = await supabase
    .from('clubs')
    .select('default_handicap_ruleset_id')
    .eq('id', clubId)
    .maybeSingle();

  if (!club?.default_handicap_ruleset_id) return null;
  return loadRulesetById(club.default_handicap_ruleset_id);
}

export async function loadRulesetById(rulesetId: string): Promise<LoadedRuleset | null> {
  const [rulesetRes, configRes, seedingRes, rulesRes] = await Promise.all([
    supabase.from('handicap_rulesets').select('id, name').eq('id', rulesetId).maybeSingle(),
    supabase.from('handicap_ruleset_config').select('*').eq('ruleset_id', rulesetId).maybeSingle(),
    supabase.from('handicap_seeding_rules').select('*').eq('ruleset_id', rulesetId).maybeSingle(),
    supabase.from('handicap_adjustment_rules').select('*').eq('ruleset_id', rulesetId).order('priority'),
  ]);

  if (!rulesetRes.data) return null;

  return {
    id: rulesetRes.data.id,
    name: rulesetRes.data.name,
    config: configRes.data || {
      cap_limit: 150,
      last_place_bonus_enabled: false,
      last_place_bonus_value: 30,
      scratch_boat_win_bonus: 30,
      scratch_streak_threshold: 3,
      scratch_streak_bonus: 30,
      skip_seeding_race: false,
    },
    seedingRule: seedingRes.data || null,
    adjustmentRules: rulesRes.data || [],
  };
}

export const calculateHandicapsWithRuleset = (
  skippers: Skipper[],
  raceResults: any[],
  numRaces: number,
  ruleset: LoadedRuleset,
  isManualHandicaps: boolean
) => {
  const { config, adjustmentRules } = ruleset;
  const capLimit = config.cap_limit;

  const updatedSkippers = JSON.parse(JSON.stringify(skippers));
  const updatedResults = [...raceResults];
  const lastPlaceStreaks = new Array(skippers.length).fill(0);

  const isInitialRaceFromScratch = !isManualHandicaps && (() => {
    const race1Data = updatedResults.filter(r => r.race === 1);
    if (race1Data.length === 0) return false;
    const finishers = race1Data
      .filter(r => r.position !== null && !r.letterScore)
      .sort((a, b) => a.position - b.position);
    if (finishers.length < 2) return false;
    const firstHcap = skippers[finishers[0]?.skipperIndex]?.startHcap ?? 0;
    if (firstHcap !== 0) return false;
    const secondHcap = skippers[finishers[1]?.skipperIndex]?.startHcap ?? 0;
    return secondHcap > 0;
  })();

  for (let race = 1; race <= numRaces; race++) {
    const raceData = updatedResults.filter(r => r.race === race);
    if (raceData.length === 0) continue;

    if (race === 1 && isInitialRaceFromScratch && !config.skip_seeding_race) {
      raceData.forEach(result => {
        if (result.handicapOverride) return;
        const idx = result.skipperIndex;
        const hcap = skippers[idx]?.startHcap ?? 0;
        result.handicap = 0;
        const resultIndex = updatedResults.findIndex(r => r.race === 1 && r.skipperIndex === idx);
        if (resultIndex !== -1) {
          updatedResults[resultIndex] = { ...result, handicap: 0, adjustedHcap: hcap };
        }
      });
      continue;
    }

    const currentHcaps = skippers.map((_, idx) => {
      if (race === 1) return skippers[idx].startHcap;
      const prevRaceResults = updatedResults.filter(r => r.race === race - 1);
      const prevResult = prevRaceResults.find(r => r.skipperIndex === idx);
      return prevResult?.adjustedHcap ?? skippers[idx].startHcap;
    });

    const positions = raceData
      .filter(r => r.position !== null || r.letterScore === 'RDGfix')
      .map(r => ({
        position: r.position,
        skipperIndex: r.skipperIndex,
        isOnScratch: currentHcaps[r.skipperIndex] === 0,
      }))
      .sort((a, b) => a.position - b.position);

    const allOnScratch = positions.every(p => p.isOnScratch);

    if (race === 1 && allOnScratch && !isManualHandicaps && !config.skip_seeding_race) {
      const seedIncrement = ruleset.seedingRule?.increment_per_position || 10;
      raceData.forEach(result => {
        if (result.handicapOverride) return;
        const idx = result.skipperIndex;
        const pos = result.position;
        result.handicap = 0;
        const seedHcap = pos !== null && !result.letterScore ? (pos - 1) * seedIncrement : 0;
        const resultIndex = updatedResults.findIndex(r => r.race === 1 && r.skipperIndex === idx);
        if (resultIndex !== -1) {
          updatedResults[resultIndex] = { ...result, handicap: 0, adjustedHcap: seedHcap };
        }
      });
      continue;
    }

    const maxPosition = Math.max(...positions.map(p => p.position));
    const scratchBoatWinner = !allOnScratch ? positions.find(p => p.isOnScratch && p.position === 1) : undefined;
    const scratchBoatBonus = scratchBoatWinner ? config.scratch_boat_win_bonus : 0;

    raceData.forEach(result => {
      const idx = result.skipperIndex;
      const pos = result.position;
      result.handicap = currentHcaps[idx];

      if (result.handicapOverride) {
        const resultIndex = updatedResults.findIndex(r => r.race === race && r.skipperIndex === idx);
        if (resultIndex !== -1) {
          updatedResults[resultIndex] = { ...result, handicap: currentHcaps[idx] };
        }
        return;
      }

      if (result.letterScore && result.letterScore !== 'RDGfix') {
        const didNotRaceCodes = ['WDN', 'DNS', 'DNC'];
        const didNotRace = didNotRaceCodes.includes(result.letterScore);
        const letterAdj = !didNotRace && scratchBoatBonus > 0 ? scratchBoatBonus : 0;
        result.adjustedHcap = Math.max(0, Math.min(capLimit, currentHcaps[idx] + letterAdj));
        const resultIndex = updatedResults.findIndex(r => r.race === race && r.skipperIndex === idx);
        if (resultIndex !== -1) {
          updatedResults[resultIndex] = { ...result, adjustedHcap: result.adjustedHcap };
        }
        return;
      }

      if (pos === null) return;

      const isOnScratch = currentHcaps[idx] === 0;
      let adj = 0;

      const boat = { position: pos, isOnScratch, skipperIndex: idx };

      for (const rule of adjustmentRules) {
        let applies = false;

        switch (rule.condition_type) {
          case 'position':
            applies = boat.position === rule.condition_value.position;
            break;
          case 'position_range':
            applies = boat.position >= rule.condition_value.from && boat.position <= rule.condition_value.to;
            break;
          case 'last_place':
            applies = boat.position === maxPosition;
            break;
          case 'scratch_boat':
            applies = boat.isOnScratch;
            break;
          case 'scratch_boat_wins':
            applies = boat.isOnScratch && boat.position === 1;
            break;
          case 'non_scratch_boat':
            applies = !boat.isOnScratch;
            break;
          case 'top_3':
            applies = boat.position >= 1 && boat.position <= 3;
            break;
          case 'mid_fleet':
            applies = boat.position > 3 && boat.position < maxPosition;
            break;
          case 'fleet_fraction': {
            const fraction = rule.condition_value.fraction || 3;
            const segment = rule.condition_value.segment || 'top';
            const cutoff = Math.ceil(maxPosition / fraction);
            if (segment === 'top') applies = boat.position <= cutoff;
            else if (segment === 'bottom') applies = boat.position > maxPosition - cutoff;
            else if (segment === 'middle') applies = boat.position > cutoff && boat.position <= maxPosition - cutoff;
            break;
          }
          case 'all':
            applies = true;
            break;
        }

        if (applies) {
          switch (rule.action) {
            case 'add':
              adj += rule.action_value;
              break;
            case 'subtract':
              adj -= rule.action_value;
              break;
            case 'set':
              adj = rule.action_value - currentHcaps[idx];
              break;
            case 'multiply':
              adj = Math.round(currentHcaps[idx] * rule.action_value) - currentHcaps[idx];
              break;
          }
        }
      }

      if (!isOnScratch && scratchBoatBonus > 0) {
        adj += scratchBoatBonus;
      }
      if (isOnScratch && pos >= 1 && pos <= 3 && scratchBoatBonus > 0) {
        adj += scratchBoatBonus;
      }

      if (isOnScratch && pos === maxPosition) {
        lastPlaceStreaks[idx]++;
        if (lastPlaceStreaks[idx] >= config.scratch_streak_threshold) {
          adj = config.scratch_streak_bonus;
          lastPlaceStreaks[idx] = 0;
        }
      } else {
        lastPlaceStreaks[idx] = 0;
      }

      if (pos === maxPosition && config.last_place_bonus_enabled && !isOnScratch) {
        adj += config.last_place_bonus_value;
      }

      const adjusted = Math.max(0, Math.min(capLimit, currentHcaps[idx] + adj));
      const resultIndex = updatedResults.findIndex(r => r.race === race && r.skipperIndex === idx);
      if (resultIndex !== -1) {
        updatedResults[resultIndex] = { ...result, adjustedHcap: adjusted };
      }
    });
  }

  return { updatedSkippers, updatedResults };
};
