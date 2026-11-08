/**
 * Heat set-up shared by the desktop (HeatRacingSetupWizard, YachtRaceManager's seeding modals,
 * HMSSeedingModal) and the phone Race desk. The code is moved verbatim from those components so
 * both screens build exactly the same heat management for the same choices.
 */
import type { Skipper } from '../types';
import type { HeatAssignment, HeatConfiguration, HeatDesignation, HeatManagement, HeatResult, SeedingMethod } from '../types/heat';
import { seedInitialHeats, HMSConfig } from './hmsHeatSystem';
import { generatePreSetQualifyingAssignments, seedInitialHeatsForSHRS } from './shrsHeatSystem';
import type { SkipperWithRanking } from './hmsSeeding';
import { previewHMSSeeding, validateHMSSeeding } from './hmsSeeding';

export interface HeatSetupChoices {
  scoringSystem: 'hms' | 'shrs';
  shrsMode: 'progressive' | 'preset';
  numberOfHeats: number;
  promotionCount: number;
  seedingMethod: SeedingMethod;
  fleetManagementEnabled: boolean;
  heatLabelStyle: 'letters' | 'numbers';
  heatOrder: 'ascending' | 'descending';
  qualifyingRounds: number;
}

export interface HeatSetupResult {
  heatManagement: HeatManagement;
  /** Set when the seeding has to be finished by hand (manual) or from rankings (ranking). */
  pendingSeedingAction?: 'manual' | 'ranking';
}

/** The heat configuration the wizard saves for these choices. */
export function buildHeatConfiguration(c: HeatSetupChoices): HeatConfiguration {
  return {
    enabled: true,
    numberOfHeats: c.numberOfHeats,
    promotionCount: c.scoringSystem === 'hms' ? c.promotionCount : 0,
    seedingMethod: c.seedingMethod,
    autoAssign: false,
    scoringSystem: c.scoringSystem,
    fleetManagementEnabled: c.fleetManagementEnabled,
    heatLabelStyle: c.heatLabelStyle,
    heatOrder: c.heatOrder,
    ...(c.scoringSystem === 'shrs' ? {
      shrsAssignmentMode: c.shrsMode,
      shrsQualifyingRounds: c.qualifyingRounds,
    } : {}),
  };
}

/** HeatRacingSetupWizard "Activate": builds race 1 heats (or a placeholder awaiting manual / ranking seeding). */
export function buildHeatSetup(skippers: Skipper[], c: HeatSetupChoices): HeatSetupResult {
  const heatDesignations: HeatDesignation[] = ['A', 'B', 'C', 'D', 'E'];
  const { scoringSystem, shrsMode, seedingMethod, fleetManagementEnabled, qualifyingRounds, promotionCount } = c;
  const effectiveHeats = c.numberOfHeats;
  let rounds;

  // Determine if this seeding method should defer to a modal
  const needsManualModal = seedingMethod === 'manual' && (
    (scoringSystem === 'shrs' && shrsMode === 'progressive') ||
    (scoringSystem === 'hms' && fleetManagementEnabled)
  );
  const needsRankingModal = seedingMethod === 'ranking' && (
    (scoringSystem === 'shrs' && shrsMode === 'progressive') ||
    (scoringSystem === 'hms' && fleetManagementEnabled)
  );

  if (needsManualModal || needsRankingModal) {
    // Create configuration with empty placeholder round - the modal will provide real assignments
    const emptyAssignments = Array.from({ length: effectiveHeats }, (_, i) => ({
      heatDesignation: heatDesignations[i] as HeatDesignation,
      skipperIndices: [] as number[]
    }));

    rounds = [{
      round: 1,
      heatAssignments: emptyAssignments,
      results: [],
      completed: false
    }];

    return {
      heatManagement: {
        configuration: buildHeatConfiguration(c),
        rounds,
        currentRound: 1,
        currentHeat: heatDesignations[effectiveHeats - 1],
      },
      pendingSeedingAction: needsManualModal ? 'manual' : 'ranking',
    };
  }

  // Build ranking data from skippers' national_ranking field
  const rankingData = skippers
    .map((s, idx) => ({ skipperIndex: idx, ranking: s.national_ranking || 0 }))
    .filter(r => r.ranking > 0);

  // Build seeding list ordered by national ranking (sail numbers sorted by rank)
  const seedingList = seedingMethod === 'ranking' && rankingData.length > 0
    ? [...rankingData]
        .sort((a, b) => a.ranking - b.ranking)
        .map(r => skippers[r.skipperIndex].sailNo || (skippers[r.skipperIndex] as any).sailNumber || '')
        .filter(Boolean)
    : undefined;

  if (scoringSystem === 'shrs') {
    const heatsMap = seedInitialHeatsForSHRS(skippers, effectiveHeats, seedingList);
    const initialAssignments = Array.from({ length: effectiveHeats }, (_, i) => {
      const heatSkippers = heatsMap.get(i + 1) || [];
      return {
        heatDesignation: heatDesignations[i] as string,
        skipperIndices: heatSkippers.map(s => skippers.findIndex(sk => (sk.sailNo || (sk as any).sailNumber) === (s.sailNo || (s as any).sailNumber)))
      };
    });

    if (shrsMode === 'preset' && qualifyingRounds > 1) {
      const allQR = generatePreSetQualifyingAssignments(initialAssignments, effectiveHeats, qualifyingRounds);
      rounds = allQR.map((ra, idx) => ({
        round: idx + 1,
        heatAssignments: ra.map(a => ({
          heatDesignation: a.heatDesignation as HeatDesignation,
          skipperIndices: a.skipperIndices
        })),
        results: [],
        completed: false
      }));
    } else {
      rounds = [{
        round: 1,
        heatAssignments: initialAssignments.map(a => ({
          heatDesignation: a.heatDesignation as HeatDesignation,
          skipperIndices: a.skipperIndices
        })),
        results: [],
        completed: false
      }];
    }
  } else {
    const hmsConfig: HMSConfig = {
      numberOfHeats: effectiveHeats,
      promotionCount,
      seedingMethod: fleetManagementEnabled ? seedingMethod : 'manual',
    };
    const initialAssignments = seedInitialHeats(
      skippers,
      hmsConfig,
      seedingMethod === 'ranking' ? rankingData : undefined
    );

    rounds = [{
      round: 1,
      heatAssignments: initialAssignments,
      results: [],
      completed: false
    }];
  }

  return {
    heatManagement: {
      configuration: buildHeatConfiguration(c),
      rounds,
      currentRound: 1,
      currentHeat: rounds[0].heatAssignments[rounds[0].heatAssignments.length - 1].heatDesignation,
    },
  };
}

/**
 * YachtRaceManager's manual / ranking seeding confirm: race 1 heats from finished assignments.
 * SHRS pre-assigned events get all their qualifying rounds generated from them.
 */
export function heatManagementFromAssignments(
  config: HeatConfiguration,
  assignments: HeatAssignment[],
  rankedSkipperIndices?: number[]
): HeatManagement {
  let allRounds;
  if (config.scoringSystem === 'shrs' && config.shrsAssignmentMode === 'preset' && (config.shrsQualifyingRounds || 1) > 1) {
    const allQR = generatePreSetQualifyingAssignments(
      assignments,
      config.numberOfHeats,
      config.shrsQualifyingRounds || 1
    );
    allRounds = allQR.map((ra: any, idx: number) => ({
      round: idx + 1,
      heatAssignments: ra.map((a: any) => ({ heatDesignation: a.heatDesignation as HeatDesignation, skipperIndices: a.skipperIndices })),
      results: [] as HeatResult[],
      completed: false
    }));
  } else {
    allRounds = [{
      round: 1,
      heatAssignments: assignments,
      results: [] as HeatResult[],
      completed: false
    }];
  }

  return {
    configuration: {
      ...config,
      seedingMethod: 'manual',
      ...(rankedSkipperIndices && rankedSkipperIndices.length > 0 ? { rankedSkipperIndices } : {}),
    } as HeatConfiguration,
    currentRound: 1,
    currentHeat: assignments[assignments.length - 1].heatDesignation,
    rounds: allRounds
  };
}

/** HMSSeedingModal: converts a seeding preview into heat assignments and the ranked skippers. */
export function seedingPreviewToAssignments(
  preview: ReturnType<typeof previewHMSSeeding>,
  skippers: Skipper[]
): { assignments: HeatAssignment[]; rankedIndices: number[] } {
  const assignments: HeatAssignment[] = preview.heats.map((heat, heatIndex) => {
    const heatDesignation = String.fromCharCode(65 + heatIndex) as HeatDesignation; // A, B, C, etc.
    const skipperIndices = heat.skippers.map(heatSkipper => {
      // Use originalIndex if available, otherwise fall back to ID matching
      if (heatSkipper.originalIndex !== undefined) {
        return heatSkipper.originalIndex;
      }
      return skippers.findIndex(s => (s as any).id === (heatSkipper as any).id);
    }).filter(index => index !== -1 && index !== undefined);
    return { heatDesignation, skipperIndices };
  });

  const rankedIndices = preview.heats.flatMap(heat =>
    heat.skippers
      .filter(s => s.rank)
      .map(s => s.originalIndex !== undefined ? s.originalIndex : skippers.findIndex(sk => (sk as any).id === (s as any).id))
      .filter(i => i !== -1)
  );

  return { assignments, rankedIndices };
}

/**
 * Ranking seeding as the scoring screen runs it: HMSSeedingModal with imported national
 * rankings (the scoring screen doesn't pass a national association, so rankings come from
 * each skipper's national_ranking; unranked skippers are spread evenly).
 */
export function seedFromImportedRankings(
  skippers: Skipper[],
  numberOfHeats: number
): { assignments: HeatAssignment[]; rankedIndices: number[]; rankedCount: number } | { error: string } {
  const skippersData: SkipperWithRanking[] = skippers.map((s, index) => ({
    ...(s as any),
    rank: s.national_ranking && s.national_ranking > 0 ? s.national_ranking : undefined,
    ranking: undefined,
    originalIndex: index
  }));
  const validation = validateHMSSeeding(skippersData, numberOfHeats);
  if (!validation.valid) return { error: validation.errors.join(', ') };
  const preview = previewHMSSeeding(skippersData, numberOfHeats);
  return { ...seedingPreviewToAssignments(preview, skippers), rankedCount: preview.summary.rankedSkippers };
}
