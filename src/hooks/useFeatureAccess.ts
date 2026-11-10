import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

interface FeatureFlag {
  feature_key: string;
  feature_label: string;
  feature_group: string;
  is_enabled: boolean;
  has_override: boolean;
}

interface FeatureAccessResult {
  isFeatureEnabled: (featureKey: string) => boolean;
  features: FeatureFlag[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const featureCache = new Map<string, { flags: FeatureFlag[]; timestamp: number }>();
const CACHE_TTL = 30 * 1000;

// Features switched on for this person themselves: Feature Access can turn a feature on for a single
// user, wherever they are in the app, as well as for a whole club or association.
let grantsCache: { userId: string; keys: Set<string>; timestamp: number } | null = null;
async function personalGrants(userId: string, force: boolean): Promise<Set<string>> {
  if (!force && grantsCache && grantsCache.userId === userId && Date.now() - grantsCache.timestamp < CACHE_TTL) return grantsCache.keys;
  try {
    const { data, error } = await supabase.rpc('get_my_feature_grants');
    const keys = new Set<string>(error ? [] : ((data || []) as { feature_key: string }[]).map(r => r.feature_key));
    grantsCache = { userId, keys, timestamp: Date.now() };
    return keys;
  } catch {
    return new Set();
  }
}

function getOrgTypeForDb(type: string): string {
  if (type === 'state') return 'state_association';
  if (type === 'national') return 'national_association';
  return 'club';
}

export function useFeatureAccess(): FeatureAccessResult {
  const { currentClub, currentOrganization, user } = useAuth();
  const userId = user?.id ?? '';
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const orgId = currentOrganization?.type === 'club' || !currentOrganization
    ? currentClub?.clubId
    : currentOrganization.id;
  const orgType = currentOrganization?.type || 'club';
  const dbOrgType = getOrgTypeForDb(orgType);

  const loadFeatures = useCallback(async (force = false) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!orgId || !uuidRegex.test(orgId)) {
      setFeatures([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${orgId}-${dbOrgType}-${userId}`;
    if (!force) {
      const cached = featureCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setFeatures(cached.flags);
        setLoading(false);
        return;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_org_feature_flags', {
        p_org_id: orgId,
        p_org_type: dbOrgType,
      });

      if (!mountedRef.current) return;

      if (error) {
        setFeatures([]);
      } else {
        const grants = userId ? await personalGrants(userId, force) : new Set<string>();
        if (!mountedRef.current) return;
        const flags = ((data || []) as FeatureFlag[]).map(f => (grants.has(f.feature_key) && !f.is_enabled ? { ...f, is_enabled: true } : f));
        setFeatures(flags);
        featureCache.set(cacheKey, { flags, timestamp: Date.now() });
      }
    } catch {
      if (mountedRef.current) setFeatures([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, dbOrgType, userId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    loadFeatures();
    return () => { mountedRef.current = false; };
  }, [loadFeatures]);

  useEffect(() => {
    if (!orgId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cacheKey = `${orgId}-${dbOrgType}-${userId}`;
        featureCache.delete(cacheKey);
        loadFeatures(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [orgId, dbOrgType, userId, loadFeatures]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel('feature-flag-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_feature_controls' }, () => {
        featureCache.clear();
        loadFeatures(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_feature_overrides' }, () => {
        featureCache.clear();
        loadFeatures(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadFeatures]);

  const isFeatureEnabled = useCallback((featureKey: string): boolean => {
    const flag = features.find(f => f.feature_key === featureKey);
    if (!flag) return true;
    return flag.is_enabled;
  }, [features]);

  const refresh = useCallback(async () => {
    await loadFeatures(true);
  }, [loadFeatures]);

  return { isFeatureEnabled, features, loading, refresh };
}
