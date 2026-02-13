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
const CACHE_TTL = 5 * 60 * 1000;

function getOrgTypeForDb(type: string): string {
  if (type === 'state') return 'state_association';
  if (type === 'national') return 'national_association';
  return 'club';
}

export function useFeatureAccess(): FeatureAccessResult {
  const { currentClub, currentOrganization } = useAuth();
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const orgId = currentOrganization?.type === 'club' || !currentOrganization
    ? currentClub?.clubId
    : currentOrganization.id;
  const orgType = currentOrganization?.type || 'club';
  const dbOrgType = getOrgTypeForDb(orgType);

  const loadFeatures = useCallback(async (force = false) => {
    if (!orgId) {
      setFeatures([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${orgId}-${dbOrgType}`;
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

      if (error) {
        console.error('Error loading feature flags:', error);
        setFeatures([]);
      } else {
        const flags = (data || []) as FeatureFlag[];
        setFeatures(flags);
        featureCache.set(cacheKey, { flags, timestamp: Date.now() });
      }
    } catch (err) {
      console.error('Error loading feature flags:', err);
      setFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, dbOrgType]);

  useEffect(() => {
    loadedRef.current = false;
    setLoading(true);
    loadFeatures();
    loadedRef.current = true;
  }, [loadFeatures]);

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
