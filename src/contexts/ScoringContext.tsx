import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Skipper, RaceType, LetterScore } from '../types/index';
import type { HeatManagement, HeatDesignation } from '../types/heat';
import type { RaceEvent } from '../types/race';

export interface ScoringContextData {
  isActive: boolean;
  raceType: RaceType | null;
  scoringSystem: 'standard' | 'hms' | 'shrs' | null;
  eventName: string | null;
  clubName: string | null;
  boatClass: string | null;
  currentDay: number;
  currentRace: number;
  totalRaces: number;
  lastCompletedRace: number;
  dropRules: number[] | string | null;
  skippers: ScoringSkipper[];
  raceResults: ScoringRaceResult[];
  heatInfo: ScoringHeatInfo | null;
  standings: ScoringStanding[];
}

export interface ScoringSkipper {
  index: number;
  name: string;
  sailNo: string;
  club: string;
  boatModel: string;
  startHcap: number;
  currentHcap?: number;
  withdrawn?: boolean;
}

export interface ScoringRaceResult {
  race: number;
  skipperIndex: number;
  skipperName: string;
  position: number | null;
  letterScore?: LetterScore;
  correctedTime?: number;
  points?: number;
  hcapBefore?: number;
  hcapAfter?: number;
  heatDesignation?: HeatDesignation;
}

export interface ScoringHeatInfo {
  scoringSystem: 'hms' | 'shrs';
  currentRound: number;
  totalRounds: number;
  currentHeat: HeatDesignation | null;
  numberOfHeats: number;
  promotionCount: number;
  heatAssignments: { heat: HeatDesignation; skipperNames: string[] }[];
  roundResults: { round: number; completed: boolean; heats: string[] }[];
  lastPromotion?: {
    promoted: string[];
    relegated: string[];
    fromHeat: string;
    toHeat: string;
  };
}

export interface ScoringStanding {
  rank: number;
  skipperName: string;
  sailNo: string;
  totalPoints: number;
  netPoints: number;
  racePoints: number[];
  droppedRaces: number[];
}

interface ScoringContextValue {
  scoringContext: ScoringContextData;
  updateScoringContext: (updates: Partial<ScoringContextData>) => void;
  setScoringActive: (active: boolean) => void;
  getScoringSnapshot: () => ScoringContextData;
}

const defaultContext: ScoringContextData = {
  isActive: false,
  raceType: null,
  scoringSystem: null,
  eventName: null,
  clubName: null,
  boatClass: null,
  currentDay: 1,
  currentRace: 1,
  totalRaces: 0,
  lastCompletedRace: 0,
  dropRules: null,
  skippers: [],
  raceResults: [],
  heatInfo: null,
  standings: [],
};

const ScoringContext = createContext<ScoringContextValue>({
  scoringContext: defaultContext,
  updateScoringContext: () => {},
  setScoringActive: () => {},
  getScoringSnapshot: () => defaultContext,
});

export const useScoringContext = () => useContext(ScoringContext);

export const ScoringContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scoringContext, setScoringContext] = useState<ScoringContextData>(defaultContext);
  const contextRef = useRef(scoringContext);
  contextRef.current = scoringContext;

  const updateScoringContext = useCallback((updates: Partial<ScoringContextData>) => {
    setScoringContext(prev => ({ ...prev, ...updates }));
  }, []);

  const setScoringActive = useCallback((active: boolean) => {
    if (!active) {
      setScoringContext(defaultContext);
    } else {
      setScoringContext(prev => ({ ...prev, isActive: true }));
    }
  }, []);

  const getScoringSnapshot = useCallback(() => contextRef.current, []);

  return (
    <ScoringContext.Provider value={{ scoringContext, updateScoringContext, setScoringActive, getScoringSnapshot }}>
      {children}
    </ScoringContext.Provider>
  );
};
