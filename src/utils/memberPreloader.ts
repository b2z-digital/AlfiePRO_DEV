/**
 * Member Preloader System
 *
 * Aggressively caches club members for offline scoring access.
 * Uses delta sync to minimize bandwidth - only fetches members
 * updated since the last sync.
 *
 * Provides freshness indicators so Race Officers know how
 * current their member list is.
 */

import { supabase } from './supabase';
import { offlineStorage } from './offlineStorage';
import { Member } from '../types/member';

interface PreloadState {
  isLoading: boolean;
  memberCount: number;
  lastSyncAt: number | null;
  syncAge: string;
  freshness: 'fresh' | 'recent' | 'stale' | 'none';
}

type PreloadStateListener = (state: PreloadState) => void;

const PRELOAD_META_KEY = 'member_preload_meta';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface PreloadMetadata {
  clubId: string;
  lastSyncAt: number;
  memberCount: number;
  lastUpdatedAt: string | null;
}

class MemberPreloader {
  private listeners: Set<PreloadStateListener> = new Set();
  private currentClubId: string | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private isLoading: boolean = false;
  private metadata: PreloadMetadata | null = null;

  constructor() {
    this.loadMetadata();
  }

  /**
   * Initialize the preloader for a specific club.
   * Starts background sync automatically.
   */
  async initialize(clubId: string): Promise<void> {
    if (this.currentClubId === clubId && this.syncInterval) return;

    this.currentClubId = clubId;
    this.loadMetadata();

    // Do an immediate sync if online
    if (navigator.onLine) {
      await this.syncMembers();
    }

    // Start periodic background sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(() => {
      if (navigator.onLine && this.currentClubId) {
        this.syncMembers();
      }
    }, SYNC_INTERVAL_MS);

    // Sync when coming back online
    offlineStorage.onConnectionChange((online) => {
      if (online && this.currentClubId) {
        this.syncMembers();
      }
    });
  }

  /**
   * Stop background syncing.
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Force a full refresh of the member cache.
   */
  async forceRefresh(): Promise<void> {
    if (!this.currentClubId) return;

    // Reset the last sync time to force a full fetch
    this.metadata = {
      clubId: this.currentClubId,
      lastSyncAt: 0,
      memberCount: 0,
      lastUpdatedAt: null,
    };
    this.saveMetadata();
    await this.syncMembers();
  }

  /**
   * Get cached members for the current club.
   * Returns immediately from IndexedDB - no network required.
   */
  async getCachedMembers(): Promise<Member[]> {
    if (!this.currentClubId) return [];
    return offlineStorage.getCachedMembers(this.currentClubId);
  }

  /**
   * Search cached members by name or sail number.
   */
  async searchMembers(query: string): Promise<Member[]> {
    if (!this.currentClubId) return [];

    const members = await offlineStorage.getCachedMembers(this.currentClubId);
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) return members;

    return members.filter(m => {
      const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      const sailNum = ((m as any).sail_number || '').toString().toLowerCase();
      const boats = (m as any).boats || [];
      const boatSails = boats.map((b: any) => (b.sail_number || '').toString().toLowerCase());

      return (
        fullName.includes(lowerQuery) ||
        sailNum.includes(lowerQuery) ||
        boatSails.some((s: string) => s.includes(lowerQuery))
      );
    });
  }

  /**
   * Get the current preload state (for UI indicators).
   */
  getState(): PreloadState {
    const lastSyncAt = this.metadata?.lastSyncAt || null;
    const memberCount = this.metadata?.memberCount || 0;

    return {
      isLoading: this.isLoading,
      memberCount,
      lastSyncAt,
      syncAge: this.formatSyncAge(lastSyncAt),
      freshness: this.calculateFreshness(lastSyncAt),
    };
  }

  /**
   * Subscribe to preload state changes.
   */
  onStateChange(listener: PreloadStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Perform a delta sync - only fetch members updated since last sync.
   */
  private async syncMembers(): Promise<void> {
    if (!this.currentClubId || this.isLoading) return;

    this.isLoading = true;
    this.notifyListeners();

    try {
      const lastUpdatedAt = this.metadata?.lastUpdatedAt;

      let query = supabase
        .from('members')
        .select('*, member_boats(*)')
        .eq('club_id', this.currentClubId)
        .neq('membership_status', 'archived')
        .order('updated_at', { ascending: false });

      // Delta sync: only fetch members updated since our last sync
      if (lastUpdatedAt) {
        query = query.gt('updated_at', lastUpdatedAt);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[MemberPreloader] Sync error:', error);
        return;
      }

      if (data && data.length > 0) {
        // Merge new/updated members into cache
        const existingMembers = await offlineStorage.getCachedMembers(this.currentClubId!);
        const memberMap = new Map(existingMembers.map(m => [m.id, m]));

        for (const member of data) {
          memberMap.set(member.id, member as unknown as Member);
        }

        // Remove archived members from cache
        const activeMembers = Array.from(memberMap.values()).filter(
          m => (m as any).membership_status !== 'archived'
        );

        await offlineStorage.cacheMembers(activeMembers);

        // Update metadata
        const newestUpdate = data[0]?.updated_at || null;
        this.metadata = {
          clubId: this.currentClubId!,
          lastSyncAt: Date.now(),
          memberCount: activeMembers.length,
          lastUpdatedAt: newestUpdate,
        };
      } else if (!lastUpdatedAt) {
        // First sync returned no data - club has no members
        this.metadata = {
          clubId: this.currentClubId!,
          lastSyncAt: Date.now(),
          memberCount: 0,
          lastUpdatedAt: null,
        };
      } else {
        // Delta sync returned no new members - just update sync time
        this.metadata = {
          ...this.metadata!,
          lastSyncAt: Date.now(),
        };
      }

      this.saveMetadata();
    } catch (err) {
      console.error('[MemberPreloader] Sync failed:', err);
    } finally {
      this.isLoading = false;
      this.notifyListeners();
    }
  }

  private loadMetadata(): void {
    try {
      const stored = localStorage.getItem(PRELOAD_META_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.clubId === this.currentClubId) {
          this.metadata = parsed;
        }
      }
    } catch {
      this.metadata = null;
    }
  }

  private saveMetadata(): void {
    if (this.metadata) {
      localStorage.setItem(PRELOAD_META_KEY, JSON.stringify(this.metadata));
    }
  }

  private calculateFreshness(lastSyncAt: number | null): PreloadState['freshness'] {
    if (!lastSyncAt) return 'none';

    const ageMs = Date.now() - lastSyncAt;
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    if (ageMs < oneHour) return 'fresh';
    if (ageMs < oneDay) return 'recent';
    return 'stale';
  }

  private formatSyncAge(lastSyncAt: number | null): string {
    if (!lastSyncAt) return 'Never synced';

    const ageMs = Date.now() - lastSyncAt;
    const minutes = Math.floor(ageMs / 60000);
    const hours = Math.floor(ageMs / 3600000);
    const days = Math.floor(ageMs / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}

export const memberPreloader = new MemberPreloader();
