/**
 * useCollaborativeScoring Hook
 *
 * Integrates the scoring sync engine, member preloader, and skipper matcher
 * into the existing scoring workflow. This hook is additive - it wraps
 * existing functionality without replacing it.
 *
 * Usage: Call from YachtRaceManager to enable collaborative features.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { scoringSyncEngine, ScoringChange } from '../utils/scoringSyncEngine';
import { memberPreloader } from '../utils/memberPreloader';
import { reconcileSkippers, applyAutoMatches, applyManualMatch, ReconciliationReport } from '../utils/skipperMatcher';
import { Member } from '../types/member';
import { Skipper } from '../types';
import { supabase } from '../utils/supabase';

interface CollaborativeScoringOptions {
  eventId: string | null;
  clubId: string | null;
  skippers: Skipper[];
  raceResults: any[];
  onRemoteResultChange?: (race: number, skipperIndex: number, field: string, value: any) => void;
}

interface CollaborativeScoringReturn {
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  pendingChanges: number;
  memberCacheState: {
    memberCount: number;
    freshness: 'fresh' | 'recent' | 'stale' | 'none';
    syncAge: string;
    isLoading: boolean;
  };
  reconciliationReport: ReconciliationReport | null;
  showMatchReview: boolean;
  recordScoringChange: (race: number, skipperIndex: number, field: string, value: any) => void;
  triggerReconciliation: () => void;
  dismissMatchReview: () => void;
  applyMatch: (skipperId: string, member: Member) => Skipper[];
  rejectMatch: (skipperId: string) => Skipper[];
  applyAllSuggestedMatches: () => Skipper[];
  refreshMembers: () => Promise<void>;
}

export function useCollaborativeScoring(
  options: CollaborativeScoringOptions
): CollaborativeScoringReturn {
  const { eventId, clubId, skippers, raceResults, onRemoteResultChange } = options;

  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>('synced');
  const [pendingChanges, setPendingChanges] = useState(0);
  const [memberCacheState, setMemberCacheState] = useState(memberPreloader.getState());
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const skipperRef = useRef(skippers);
  skipperRef.current = skippers;

  // Initialize the sync engine with user ID
  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await scoringSyncEngine.initialize(user.id);
      }
    };
    initUser();
  }, []);

  // Join/leave event scoring session
  useEffect(() => {
    if (eventId) {
      scoringSyncEngine.joinEvent(eventId);
    }
    return () => {
      scoringSyncEngine.leaveEvent();
    };
  }, [eventId]);

  // Initialize member preloader
  useEffect(() => {
    if (clubId) {
      memberPreloader.initialize(clubId);
    }
    return () => {
      memberPreloader.stop();
    };
  }, [clubId]);

  // Subscribe to sync status
  useEffect(() => {
    return scoringSyncEngine.onSyncStatusChange((state) => {
      setSyncStatus(state.status);
      setPendingChanges(state.pendingChanges);
    });
  }, []);

  // Subscribe to member preloader state
  useEffect(() => {
    return memberPreloader.onStateChange(setMemberCacheState);
  }, []);

  // Handle remote scoring changes
  useEffect(() => {
    if (!onRemoteResultChange) return;

    return scoringSyncEngine.onRemoteChange((change: ScoringChange) => {
      onRemoteResultChange(change.race, change.skipperIndex, change.field, change.value);
    });
  }, [onRemoteResultChange]);

  // Keep sync engine informed of current results
  useEffect(() => {
    scoringSyncEngine.setResultsSnapshot(raceResults);
  }, [raceResults]);

  const recordScoringChange = useCallback((
    race: number,
    skipperIndex: number,
    field: string,
    value: any
  ) => {
    scoringSyncEngine.recordChange(
      race,
      skipperIndex,
      field as ScoringChange['field'],
      value
    );
  }, []);

  const triggerReconciliation = useCallback(async () => {
    if (!clubId) return;

    const members = await memberPreloader.getCachedMembers();
    if (members.length === 0) return;

    const report = reconcileSkippers(skipperRef.current, members);

    if (report.needsReview.length > 0) {
      setReconciliationReport(report);
      setShowMatchReview(true);
    } else if (report.autoMatched.length > 0) {
      setReconciliationReport(report);
    }
  }, [clubId]);

  const dismissMatchReview = useCallback(() => {
    setShowMatchReview(false);
  }, []);

  const applyMatch = useCallback((skipperId: string, member: Member): Skipper[] => {
    return applyManualMatch(skipperRef.current, skipperId, member);
  }, []);

  const rejectMatch = useCallback((skipperId: string): Skipper[] => {
    return applyManualMatch(skipperRef.current, skipperId, null);
  }, []);

  const applyAllSuggestedMatches = useCallback((): Skipper[] => {
    if (!reconciliationReport) return skipperRef.current;
    return applyAutoMatches(skipperRef.current, reconciliationReport);
  }, [reconciliationReport]);

  const refreshMembers = useCallback(async () => {
    await memberPreloader.forceRefresh();
  }, []);

  return {
    syncStatus,
    pendingChanges,
    memberCacheState,
    reconciliationReport,
    showMatchReview,
    recordScoringChange,
    triggerReconciliation,
    dismissMatchReview,
    applyMatch,
    rejectMatch,
    applyAllSuggestedMatches,
    refreshMembers,
  };
}
