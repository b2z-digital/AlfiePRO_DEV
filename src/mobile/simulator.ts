/**
 * Who sees the Race Simulator in the app. The same people as on the website: super admins, anyone
 * whose club or association has it switched on in Feature Access, and anyone it's been switched on
 * for themselves. A one-off check each time (the website's useFeatureAccess also listens for live
 * changes, which the app doesn't need).
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

const KEY = 'race_simulator';

async function simulatorOn(orgId: string | null, orgType: string): Promise<boolean> {
  // Switched on for this person themselves (whatever club they're in).
  const { data: mine } = await supabase.rpc('get_my_feature_grants');
  if (((mine || []) as { feature_key: string }[]).some(g => g.feature_key === KEY)) return true;
  // Switched on for their club or association.
  if (!orgId) return false;
  const { data: flags, error } = await supabase.rpc('get_org_feature_flags', { p_org_id: orgId, p_org_type: orgType });
  if (error) return false;
  return !!((flags || []) as { feature_key: string; is_enabled: boolean }[]).find(f => f.feature_key === KEY)?.is_enabled;
}

export function useSimulatorAccess(): { allowed: boolean; loading: boolean } {
  const { user, isSuperAdmin, currentClub, currentOrganization } = useAuth();
  const club = !currentOrganization || currentOrganization.type === 'club';
  const orgId = (club ? currentClub?.clubId : currentOrganization?.id) ?? null;
  const orgType = club ? 'club' : currentOrganization?.type === 'state' ? 'state_association' : 'national_association';
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    if (isSuperAdmin || !user) return;
    let live = true;
    setOn(null);
    simulatorOn(orgId, orgType).then(v => { if (live) setOn(v); }).catch(() => { if (live) setOn(false); });
    return () => { live = false; };
  }, [isSuperAdmin, user, orgId, orgType]);
  if (isSuperAdmin) return { allowed: true, loading: false };
  if (!user) return { allowed: false, loading: false };
  return { allowed: on === true, loading: on === null };
}
