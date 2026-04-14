import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

interface FeatureCapability {
  feature_key: string;
  capability: 'none' | 'view' | 'edit' | 'full';
}

interface CapabilitiesResult {
  capabilities: FeatureCapability[];
  loading: boolean;
  canView: (featureKey: string) => boolean;
  canEdit: (featureKey: string) => boolean;
  canFull: (featureKey: string) => boolean;
  getCapability: (featureKey: string) => 'none' | 'view' | 'edit' | 'full';
  refresh: () => Promise<void>;
}

const capabilityCache = new Map<string, { caps: FeatureCapability[]; timestamp: number }>();
const CACHE_TTL = 30 * 1000;

const CAPABILITY_ORDER: Record<string, number> = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

function getOrgTypeForDb(type: string): string {
  if (type === 'state') return 'state_association';
  if (type === 'national') return 'national_association';
  return 'club';
}

export function useCapabilities(): CapabilitiesResult {
  const { user, currentClub, currentOrganization } = useAuth();
  const [capabilities, setCapabilities] = useState<FeatureCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const orgId = currentOrganization?.type === 'club' || !currentOrganization
    ? currentClub?.clubId
    : currentOrganization.id;
  const orgType = currentOrganization?.type || 'club';
  const dbOrgType = getOrgTypeForDb(orgType);
  const userId = user?.id;

  const loadCapabilities = useCallback(async (force = false) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!orgId || !uuidRegex.test(orgId) || !userId) {
      setCapabilities([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${userId}-${orgId}-${dbOrgType}`;
    if (!force) {
      const cached = capabilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setCapabilities(cached.caps);
        setLoading(false);
        return;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_user_feature_capabilities', {
        p_user_id: userId,
        p_scope_type: dbOrgType,
        p_scope_id: orgId,
      });

      if (!mountedRef.current) return;

      if (error) {
        setCapabilities([]);
      } else {
        const caps = (data || []) as FeatureCapability[];
        setCapabilities(caps);
        capabilityCache.set(cacheKey, { caps, timestamp: Date.now() });
      }
    } catch {
      if (mountedRef.current) setCapabilities([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [orgId, dbOrgType, userId]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    loadCapabilities();
    return () => { mountedRef.current = false; };
  }, [loadCapabilities]);

  useEffect(() => {
    if (!orgId || !userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cacheKey = `${userId}-${orgId}-${dbOrgType}`;
        capabilityCache.delete(cacheKey);
        loadCapabilities(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [orgId, dbOrgType, userId, loadCapabilities]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel('capability-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_level_permissions' }, () => {
        capabilityCache.clear();
        loadCapabilities(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_level_permission_templates' }, () => {
        capabilityCache.clear();
        loadCapabilities(true);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId, loadCapabilities]);

  const getCapability = useCallback((featureKey: string): 'none' | 'view' | 'edit' | 'full' => {
    const cap = capabilities.find(c => c.feature_key === featureKey);
    if (!cap) return 'full';
    return cap.capability;
  }, [capabilities]);

  const canView = useCallback((featureKey: string): boolean => {
    return CAPABILITY_ORDER[getCapability(featureKey)] >= CAPABILITY_ORDER.view;
  }, [getCapability]);

  const canEdit = useCallback((featureKey: string): boolean => {
    return CAPABILITY_ORDER[getCapability(featureKey)] >= CAPABILITY_ORDER.edit;
  }, [getCapability]);

  const canFull = useCallback((featureKey: string): boolean => {
    return CAPABILITY_ORDER[getCapability(featureKey)] >= CAPABILITY_ORDER.full;
  }, [getCapability]);

  const refresh = useCallback(async () => {
    await loadCapabilities(true);
  }, [loadCapabilities]);

  return { capabilities, loading, canView, canEdit, canFull, getCapability, refresh };
}
