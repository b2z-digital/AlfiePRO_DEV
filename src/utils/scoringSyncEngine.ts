/**
 * Scoring Sync Engine
 *
 * Provides real-time collaborative scoring with offline-first architecture.
 * All scoring writes go to local state first, then sync to Supabase.
 * Supabase Realtime broadcasts changes to all connected devices.
 * Conflicts are resolved by timestamp (last-write-wins).
 */

import { supabase } from './supabase';
import { offlineStorage } from './offlineStorage';

export interface ScoringChange {
  id: string;
  eventId: string;
  race: number;
  skipperIndex: number;
  field: 'position' | 'letterScore' | 'customPoints' | 'handicap' | 'adjustedHcap';
  value: number | string | null;
  timestamp: number;
  userId: string;
  deviceId: string;
}

export interface ScoringConflict {
  id: string;
  change: ScoringChange;
  existingValue: number | string | null;
  resolvedValue: number | string | null;
  resolvedAt: number;
}

interface SyncState {
  status: 'synced' | 'syncing' | 'offline' | 'error';
  pendingChanges: number;
  lastSyncAt: number | null;
  conflicts: ScoringConflict[];
}

type SyncStatusListener = (state: SyncState) => void;
type ScoringChangeListener = (change: ScoringChange) => void;
type ConflictListener = (conflict: ScoringConflict) => void;

const SCORING_CHANGES_STORE = 'scoring_changes';
const DEVICE_ID_KEY = 'alfie_device_id';

function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

class ScoringSyncEngine {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private currentEventId: string | null = null;
  private pendingChanges: Map<string, ScoringChange> = new Map();
  private conflicts: ScoringConflict[] = [];
  private syncStatusListeners: Set<SyncStatusListener> = new Set();
  private changeListeners: Set<ScoringChangeListener> = new Set();
  private conflictListeners: Set<ConflictListener> = new Set();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private isOnline: boolean = navigator.onLine;
  private userId: string | null = null;
  private deviceId: string = getDeviceId();
  private lastKnownResults: Map<string, any> = new Map();
  private syncDebounceMs: number = 1000;

  constructor() {
    this.setupConnectionListeners();
  }

  private setupConnectionListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushPendingChanges();
      this.notifySyncStatus();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifySyncStatus();
    });

    offlineStorage.onConnectionChange((online) => {
      this.isOnline = online;
      if (online) {
        this.flushPendingChanges();
      }
      this.notifySyncStatus();
    });
  }

  async initialize(userId: string): Promise<void> {
    this.userId = userId;
  }

  /**
   * Join a scoring session for a specific event.
   * Subscribes to Realtime broadcast for that event.
   */
  async joinEvent(eventId: string): Promise<void> {
    if (this.currentEventId === eventId) return;

    await this.leaveEvent();
    this.currentEventId = eventId;
    this.pendingChanges.clear();
    this.conflicts = [];
    this.lastKnownResults.clear();

    if (this.isOnline) {
      this.subscribeToRealtime(eventId);
    }

    this.notifySyncStatus();
  }

  /**
   * Leave the current scoring session and clean up.
   */
  async leaveEvent(): Promise<void> {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    await this.flushPendingChanges();
    this.currentEventId = null;
    this.pendingChanges.clear();
    this.lastKnownResults.clear();
  }

  /**
   * Record a scoring change (offline-first).
   * Immediately stores locally, debounces sync to server.
   */
  recordChange(
    race: number,
    skipperIndex: number,
    field: ScoringChange['field'],
    value: number | string | null
  ): void {
    if (!this.currentEventId) return;

    const changeKey = `${this.currentEventId}_r${race}_s${skipperIndex}_${field}`;
    const change: ScoringChange = {
      id: changeKey,
      eventId: this.currentEventId,
      race,
      skipperIndex,
      field,
      value,
      timestamp: Date.now(),
      userId: this.userId || 'unknown',
      deviceId: this.deviceId,
    };

    this.pendingChanges.set(changeKey, change);
    this.lastKnownResults.set(changeKey, value);
    this.scheduleSyncFlush();
    this.notifySyncStatus();
  }

  /**
   * Set the full results snapshot for conflict detection.
   */
  setResultsSnapshot(raceResults: any[]): void {
    if (!this.currentEventId) return;

    for (const result of raceResults) {
      if (result.position != null) {
        const key = `${this.currentEventId}_r${result.race}_s${result.skipperIndex}_position`;
        this.lastKnownResults.set(key, result.position);
      }
      if (result.letterScore) {
        const key = `${this.currentEventId}_r${result.race}_s${result.skipperIndex}_letterScore`;
        this.lastKnownResults.set(key, result.letterScore);
      }
    }
  }

  /**
   * Subscribe to sync status changes.
   */
  onSyncStatusChange(listener: SyncStatusListener): () => void {
    this.syncStatusListeners.add(listener);
    listener(this.getSyncState());
    return () => { this.syncStatusListeners.delete(listener); };
  }

  /**
   * Subscribe to incoming scoring changes from other devices.
   */
  onRemoteChange(listener: ScoringChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  /**
   * Subscribe to conflict notifications.
   */
  onConflict(listener: ConflictListener): () => void {
    this.conflictListeners.add(listener);
    return () => { this.conflictListeners.delete(listener); };
  }

  getSyncState(): SyncState {
    let status: SyncState['status'];
    if (!this.isOnline) {
      status = 'offline';
    } else if (this.pendingChanges.size > 0) {
      status = 'syncing';
    } else {
      status = 'synced';
    }

    return {
      status,
      pendingChanges: this.pendingChanges.size,
      lastSyncAt: this.getLastSyncTime(),
      conflicts: [...this.conflicts],
    };
  }

  getConflicts(): ScoringConflict[] {
    return [...this.conflicts];
  }

  clearConflicts(): void {
    this.conflicts = [];
    this.notifySyncStatus();
  }

  private subscribeToRealtime(eventId: string): void {
    this.channel = supabase.channel(`scoring:${eventId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'scoring_change' }, (payload) => {
        this.handleRemoteChange(payload.payload as ScoringChange);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[ScoringSync] Subscribed to event: ${eventId}`);
        }
      });
  }

  private handleRemoteChange(change: ScoringChange): void {
    if (change.deviceId === this.deviceId) return;

    const changeKey = change.id;
    const localValue = this.lastKnownResults.get(changeKey);
    const localPending = this.pendingChanges.get(changeKey);

    if (localPending && localPending.timestamp > change.timestamp) {
      // Our change is newer - keep ours, log conflict
      const conflict: ScoringConflict = {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        change,
        existingValue: localPending.value,
        resolvedValue: localPending.value,
        resolvedAt: Date.now(),
      };
      this.conflicts.push(conflict);
      this.conflictListeners.forEach(l => l(conflict));
    } else if (localValue !== undefined && localValue !== change.value && !localPending) {
      // Remote change differs from our view but we have no pending change - accept it
      const conflict: ScoringConflict = {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        change,
        existingValue: localValue,
        resolvedValue: change.value,
        resolvedAt: Date.now(),
      };
      this.conflicts.push(conflict);
      this.conflictListeners.forEach(l => l(conflict));
      this.lastKnownResults.set(changeKey, change.value);
      this.changeListeners.forEach(l => l(change));
    } else {
      // No conflict - accept the remote change
      this.lastKnownResults.set(changeKey, change.value);
      this.changeListeners.forEach(l => l(change));
    }

    this.notifySyncStatus();
  }

  private scheduleSyncFlush(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.flushPendingChanges();
    }, this.syncDebounceMs);
  }

  private async flushPendingChanges(): Promise<void> {
    if (!this.isOnline || this.pendingChanges.size === 0) return;

    const changes = Array.from(this.pendingChanges.values());
    const flushing = new Map(this.pendingChanges);
    this.pendingChanges.clear();

    try {
      // Broadcast all changes to other connected devices
      if (this.channel) {
        for (const change of changes) {
          await this.channel.send({
            type: 'broadcast',
            event: 'scoring_change',
            payload: change,
          });
        }
      }

      this.setLastSyncTime(Date.now());
      this.notifySyncStatus();
    } catch (error) {
      console.error('[ScoringSync] Failed to flush changes:', error);
      // Put changes back into pending
      for (const [key, change] of flushing) {
        if (!this.pendingChanges.has(key)) {
          this.pendingChanges.set(key, change);
        }
      }
      this.notifySyncStatus();
    }
  }

  private notifySyncStatus(): void {
    const state = this.getSyncState();
    this.syncStatusListeners.forEach(l => l(state));
  }

  private getLastSyncTime(): number | null {
    const stored = localStorage.getItem(`scoring_last_sync_${this.currentEventId}`);
    return stored ? parseInt(stored, 10) : null;
  }

  private setLastSyncTime(time: number): void {
    if (this.currentEventId) {
      localStorage.setItem(`scoring_last_sync_${this.currentEventId}`, time.toString());
    }
  }
}

export const scoringSyncEngine = new ScoringSyncEngine();
