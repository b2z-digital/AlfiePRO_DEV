/**
 * Offline Storage System using IndexedDB
 *
 * This provides a comprehensive offline-first data layer for race management.
 * All operations work offline and sync automatically when connection is restored.
 */

import { RaceEvent, RaceSeries } from '../types/race';
import { Skipper } from '../types';
import { Member } from '../types/member';

const DB_NAME = 'alfie_pro_offline';
const DB_VERSION = 2;

interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

interface OfflineCache {
  events: RaceEvent[];
  series: RaceSeries[];
  members: Member[];
  skippers: Skipper[];
  lastSync: number;
}

class OfflineStorageManager {
  private db: IDBDatabase | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<(online: boolean) => void> = new Set();

  constructor() {
    this.initializeDB().catch(err => {
      console.error('IndexedDB initialization failed:', err);
    });
    this.setupConnectionListeners();
  }

  /**
   * Initialize IndexedDB with proper schema
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('IndexedDB upgrade blocked - closing stale connections');
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores for different data types
        if (!db.objectStoreNames.contains('events')) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('clubId', 'clubId', { unique: false });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('series')) {
          const seriesStore = db.createObjectStore('series', { keyPath: 'id' });
          seriesStore.createIndex('clubId', 'clubId', { unique: false });
        }

        if (!db.objectStoreNames.contains('members')) {
          const memberStore = db.createObjectStore('members', { keyPath: 'id' });
          memberStore.createIndex('clubId', 'clubId', { unique: false });
          memberStore.createIndex('name', ['first_name', 'last_name'], { unique: false });
        }

        if (!db.objectStoreNames.contains('skippers')) {
          const skipperStore = db.createObjectStore('skippers', { keyPath: 'id' });
          skipperStore.createIndex('eventId', 'eventId', { unique: false });
        }

        if (!db.objectStoreNames.contains('sync_queue')) {
          const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          syncStore.createIndex('status', 'status', { unique: false });
          syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('articles')) {
          const articleStore = db.createObjectStore('articles', { keyPath: 'id' });
          articleStore.createIndex('clubId', 'club_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('clubId', 'club_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('meetings')) {
          const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
          meetingStore.createIndex('clubId', 'club_id', { unique: false });
        }
      };
    });
  }

  /**
   * Setup online/offline connection listeners
   */
  private setupConnectionListeners(): void {
    window.addEventListener('online', () => {
      console.log('🌐 Connection restored');
      this.isOnline = true;
      this.notifyListeners(true);
      this.processSyncQueue();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Connection lost - switching to offline mode');
      this.isOnline = false;
      this.notifyListeners(false);
    });
  }

  public async getDB(): Promise<IDBDatabase> {
    if (!this.db) await this.initializeDB();
    return this.db!;
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to connection status changes
   */
  public onConnectionChange(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    // Immediately notify with current status
    callback(this.isOnline);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(online: boolean): void {
    this.listeners.forEach(callback => callback(online));
  }

  /**
   * Generic method to get data from IndexedDB
   */
  private async getFromStore<T>(storeName: string, key?: string): Promise<T[]> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);

      if (key) {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? [request.result] : []);
        request.onerror = () => reject(request.error);
      } else {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      }
    });
  }

  /**
   * Generic method to save data to IndexedDB
   */
  private async saveToStore(storeName: string, data: any): Promise<void> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic method to delete data from IndexedDB
   */
  private async deleteFromStore(storeName: string, key: string): Promise<void> {
    if (!this.db) await this.initializeDB();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Add operation to sync queue
   */
  private async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount' | 'status'>): Promise<void> {
    const queueItem: SyncQueueItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    await this.saveToStore('sync_queue', queueItem);
    console.log('📥 Added to sync queue:', queueItem.operation, queueItem.table);

    // Try to sync immediately if online
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  /**
   * Get all pending items from sync queue
   */
  private async getSyncQueue(): Promise<SyncQueueItem[]> {
    const allItems = await this.getFromStore<SyncQueueItem>('sync_queue');
    return allItems
      .filter(item => item.status === 'pending' || item.status === 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Sanitize quick_races data before sync to ensure required fields are present
   */
  private sanitizeQuickRacesData(data: any): any {
    if (!data) return data;

    return {
      ...data,
      race_class: data.race_class || 'Unknown',
      race_date: data.race_date || new Date().toISOString().split('T')[0],
      event_name: data.event_name || 'Untitled Event',
      skippers: data.skippers || [],
      race_results: data.race_results || [],
      last_completed_race: data.last_completed_race ?? 0,
      has_determined_initial_hcaps: data.has_determined_initial_hcaps ?? false,
      is_manual_handicaps: data.is_manual_handicaps ?? false
    };
  }

  /**
   * Process sync queue - upload all pending changes to Supabase
   */
  public async processSyncQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) {
      console.log('⏸️ Sync already in progress or offline');
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Starting sync queue processing...');

    try {
      const queue = await this.getSyncQueue();
      console.log(`📤 Processing ${queue.length} queued operations`);

      for (const item of queue) {
        try {
          // Update status to syncing
          await this.saveToStore('sync_queue', { ...item, status: 'syncing' });

          // Import supabase dynamically to avoid circular dependencies
          const { supabase } = await import('./supabase');

          // Sanitize data for quick_races table to ensure required fields are present
          let syncData = item.data;
          if (item.table === 'quick_races' && item.operation !== 'delete') {
            syncData = this.sanitizeQuickRacesData(item.data);
            console.log('🔧 Sanitized quick_races data:', {
              race_class: syncData.race_class,
              race_date: syncData.race_date,
              event_name: syncData.event_name
            });
          }

          // Execute the operation
          switch (item.operation) {
            case 'create':
              const { error: createError } = await supabase
                .from(item.table)
                .insert(syncData);
              if (createError) throw createError;
              break;

            case 'update':
              const { error: updateError } = await supabase
                .from(item.table)
                .upsert(syncData);
              if (updateError) throw updateError;
              break;

            case 'delete':
              const { error: deleteError } = await supabase
                .from(item.table)
                .delete()
                .eq('id', item.data.id);
              if (deleteError) throw deleteError;
              break;
          }

          // Remove from queue on success
          await this.deleteFromStore('sync_queue', item.id);
          console.log('✅ Synced:', item.operation, item.table, syncData.id);

        } catch (error) {
          console.error('❌ Sync failed for item:', item, error);

          // Update retry count and status
          const updatedItem = {
            ...item,
            retryCount: item.retryCount + 1,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'Unknown error'
          };

          // If retries exceeded, remove from queue
          if (updatedItem.retryCount >= 3) {
            console.error('⚠️ Max retries exceeded for item:', item.id, '- removing from queue');
            await this.deleteFromStore('sync_queue', item.id);
          } else {
            await this.saveToStore('sync_queue', updatedItem);
          }
        }
      }

      console.log('✅ Sync queue processing complete');
    } catch (error) {
      console.error('❌ Sync queue processing error:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get pending sync count (for UI indicators)
   */
  public async getPendingSyncCount(): Promise<number> {
    const queue = await this.getSyncQueue();
    return queue.length;
  }

  /**
   * Clear all failed sync items from the queue
   */
  public async clearFailedSyncItems(): Promise<void> {
    try {
      const allItems = await this.getFromStore<SyncQueueItem>('sync_queue');
      const failedItems = allItems.filter(item => item.status === 'failed' || item.retryCount >= 3);

      console.log(`🧹 Clearing ${failedItems.length} failed sync items`);

      for (const item of failedItems) {
        await this.deleteFromStore('sync_queue', item.id);
      }

      console.log('✅ Failed sync items cleared');
    } catch (error) {
      console.error('❌ Error clearing failed sync items:', error);
    }
  }

  /**
   * Clear all sync queue items for a specific table (useful for fixing corrupted data)
   */
  public async clearSyncQueueForTable(tableName: string): Promise<void> {
    try {
      const allItems = await this.getFromStore<SyncQueueItem>('sync_queue');
      const tableItems = allItems.filter(item => item.table === tableName);

      console.log(`🧹 Clearing ${tableItems.length} sync items for table: ${tableName}`);

      for (const item of tableItems) {
        await this.deleteFromStore('sync_queue', item.id);
      }

      console.log(`✅ Cleared all sync items for table: ${tableName}`);
    } catch (error) {
      console.error(`❌ Error clearing sync items for table ${tableName}:`, error);
    }
  }

  /**
   * Clear entire sync queue (nuclear option)
   */
  public async clearAllSyncQueue(): Promise<void> {
    try {
      const allItems = await this.getFromStore<SyncQueueItem>('sync_queue');
      console.log(`🧹 Clearing entire sync queue (${allItems.length} items)`);

      for (const item of allItems) {
        await this.deleteFromStore('sync_queue', item.id);
      }

      console.log('✅ Entire sync queue cleared');
    } catch (error) {
      console.error('❌ Error clearing sync queue:', error);
    }
  }

  // ==================== EVENT OPERATIONS ====================

  /**
   * Save event (works offline)
   */
  public async saveEvent(event: RaceEvent, skipSync: boolean = false): Promise<void> {
    console.log('💾 Saving event offline:', event.id);

    // Save to IndexedDB immediately
    await this.saveToStore('events', {
      ...event,
      timestamp: Date.now()
    });

    // Queue for sync only if not skipping (used when caching from Supabase)
    if (!skipSync) {
      await this.addToSyncQueue({
        operation: event.id ? 'update' : 'create',
        table: 'quick_races',
        data: this.transformEventForDatabase(event)
      });
    }
  }

  /**
   * Get all events (from IndexedDB)
   */
  public async getEvents(clubId?: string): Promise<RaceEvent[]> {
    const events = await this.getFromStore<RaceEvent>('events');

    if (clubId) {
      return events.filter(e => e.clubId === clubId);
    }

    return events;
  }

  /**
   * Get single event
   */
  public async getEvent(id: string): Promise<RaceEvent | null> {
    const events = await this.getFromStore<RaceEvent>('events', id);
    return events[0] || null;
  }

  /**
   * Delete event
   */
  public async deleteEvent(id: string, skipSync: boolean = false): Promise<void> {
    await this.deleteFromStore('events', id);

    if (!skipSync) {
      await this.addToSyncQueue({
        operation: 'delete',
        table: 'quick_races',
        data: { id }
      });
    }
  }

  // ==================== MEMBER OPERATIONS ====================

  /**
   * Cache members for offline use
   */
  public async cacheMembers(members: Member[]): Promise<void> {
    console.log(`📥 Caching ${members.length} members for offline use`);

    for (const member of members) {
      await this.saveToStore('members', member);
    }

    // Update metadata
    await this.saveToStore('metadata', {
      key: 'members_last_sync',
      value: Date.now()
    });
  }

  /**
   * Get cached members
   */
  public async getCachedMembers(clubId: string): Promise<Member[]> {
    const members = await this.getFromStore<Member>('members');
    return members.filter(m => (m as any).club_id === clubId || m.club === clubId);
  }

  /**
   * Search members by name (works offline)
   */
  public async searchMembers(query: string, clubId: string): Promise<Member[]> {
    const members = await this.getCachedMembers(clubId);
    const lowerQuery = query.toLowerCase();

    return members.filter(m => {
      const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
      return fullName.includes(lowerQuery);
    });
  }

  // ==================== SERIES OPERATIONS ====================

  /**
   * Save race series (works offline)
   */
  public async saveSeries(series: RaceSeries): Promise<void> {
    await this.saveToStore('series', {
      ...series,
      timestamp: Date.now()
    });

    await this.addToSyncQueue({
      operation: series.id ? 'update' : 'create',
      table: 'race_series',
      data: this.transformSeriesForDatabase(series)
    });
  }

  /**
   * Get all series
   */
  public async getSeries(clubId?: string): Promise<RaceSeries[]> {
    const series = await this.getFromStore<RaceSeries>('series');

    if (clubId) {
      return series.filter(s => s.clubId === clubId);
    }

    return series;
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Transform event for database storage
   */
  private transformEventForDatabase(event: RaceEvent): any {
    // Only include columns that actually exist in quick_races table
    return {
      id: event.id,
      club_id: event.clubId,
      club_name: event.clubName,
      event_name: event.eventName,
      race_date: event.date || new Date().toISOString().split('T')[0], // Ensure date is never null
      race_class: event.raceClass || 'Unknown', // Ensure race_class is never null
      race_format: event.raceFormat,
      race_venue: event.venue || null,
      skippers: event.skippers || [],
      race_results: event.raceResults || [],
      last_completed_race: event.lastCompletedRace || 0,
      has_determined_initial_hcaps: event.hasDeterminedInitialHcaps || false,
      is_manual_handicaps: event.isManualHandicaps || false,
      heat_management: event.heatManagement || null
    };
  }

  /**
   * Transform series for database storage
   */
  private transformSeriesForDatabase(series: RaceSeries): any {
    return {
      id: series.id,
      club_name: series.clubName,
      series_name: series.seriesName,
      race_class: series.raceClass,
      race_format: series.raceFormat,
      rounds: series.rounds || [],
      skippers: series.skippers || [],
      results: series.results || [],
      completed: series.completed || false,
      last_completed_race: series.lastCompletedRace || 0,
      has_determined_initial_hcaps: series.hasDeterminedInitialHcaps || false,
      is_manual_handicaps: series.isManualHandicaps || false,
      media: series.media || [],
      livestream_url: series.livestreamUrl,
      notice_of_race_url: series.noticeOfRaceUrl,
      sailing_instructions_url: series.sailingInstructionsUrl,
      is_paid: series.isPaid || false,
      entry_fee: series.entryFee,
      club_id: series.clubId
    };
  }

  /**
   * Clear all offline data (use with caution)
   */
  public async clearAllData(): Promise<void> {
    if (!this.db) return;

    const stores = ['events', 'series', 'members', 'skippers', 'sync_queue', 'metadata'];

    for (const storeName of stores) {
      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
      });
    }

    console.log('🗑️ All offline data cleared');
  }

  /**
   * Get storage statistics
   */
  public async getStorageStats(): Promise<{
    events: number;
    series: number;
    members: number;
    pendingSync: number;
    lastSync: number | null;
  }> {
    const events = await this.getFromStore<RaceEvent>('events');
    const series = await this.getFromStore<RaceSeries>('series');
    const members = await this.getFromStore<Member>('members');
    const syncQueue = await this.getSyncQueue();

    const metadata = await this.getFromStore<any>('metadata', 'members_last_sync');
    const lastSync = metadata[0]?.value || null;

    return {
      events: events.length,
      series: series.length,
      members: members.length,
      pendingSync: syncQueue.length,
      lastSync
    };
  }
}

// Create singleton instance
export const offlineStorage = new OfflineStorageManager();

// Clear failed sync items on app initialization
offlineStorage.clearFailedSyncItems().catch(err =>
  console.error('Failed to clear failed sync items on init:', err)
);
