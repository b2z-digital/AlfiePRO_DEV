import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { getOrganizationPages } from '../../utils/organizationPageBuilderStorage';
import type { OrganizationPageLayout } from '../../types/organizationWidgets';

export interface HubClub {
  id: string;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  cover_image_url: string | null;
  subdomain_slug: string | null;
  custom_domain: string | null;
  domain_status: string | null;
  website_published: boolean | null;
  seo_title: string | null;
  seo_description: string | null;
  allow_indexing: boolean | null;
  google_analytics_id: string | null;
  default_share_image: string | null;
  default_share_description: string | null;
  facebook_pixel_id: string | null;
  twitter_handle: string | null;
  website_theme: any;
  website_menu: any;
  website_layout: any;
}

export interface HubAddress {
  host: string;
  kind: 'custom' | 'alfie';
  state: 'working' | 'pending' | 'problem';
  note?: string | null;
}

export interface HubActivity {
  id: string;
  action: string;
  entity_type: string | null;
  entity_name: string | null;
  created_at: string;
  user_id: string | null;
  who: string;
  avatar: string | null;
}

interface HubState {
  loading: boolean;
  club: HubClub | null;
  pages: OrganizationPageLayout[];
  addresses: HubAddress[];
  activity: HubActivity[];
  slideCount: number;
  userId: string | null;
}

interface HubApi extends HubState {
  /** Address people use (custom domain if it works, else the Alfie address), or null when neither works yet. */
  liveHost: string | null;
  /** In-app path of the public site, used for previews. */
  previewPath: string;
  /** Where "Preview" opens. */
  previewHref: string;
  status: 'live' | 'pending' | 'none';
  reload: (what?: ('club' | 'pages' | 'activity' | 'domains' | 'slides')[]) => Promise<void>;
  updateClub: (patch: Partial<HubClub>) => Promise<boolean>;
  log: (action: string, entityType: string, entityName: string, entityId?: string | null) => void;
}

const CLUB_COLUMNS = 'id, name, abbreviation, logo, cover_image_url, subdomain_slug, custom_domain, domain_status, website_published, seo_title, seo_description, allow_indexing, google_analytics_id, default_share_image, default_share_description, facebook_pixel_id, twitter_handle, website_theme, website_menu, website_layout';

const Ctx = createContext<HubApi | null>(null);

export const useHub = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHub outside WebsiteHubProvider');
  return v;
};

const normHost = (h?: string | null) => (h || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim().toLowerCase();

export const WebsiteHubProvider: React.FC<{ clubId: string; children: React.ReactNode }> = ({ clubId, children }) => {
  const [st, setSt] = useState<HubState>({ loading: true, club: null, pages: [], addresses: [], activity: [], slideCount: 0, userId: null });

  const loadClub = useCallback(async () => {
    const { data } = await supabase.from('clubs').select(CLUB_COLUMNS).eq('id', clubId).maybeSingle();
    return (data as HubClub) || null;
  }, [clubId]);

  const loadDomains = useCallback(async (club: HubClub | null): Promise<HubAddress[]> => {
    const [{ data: dns }, { data: amp }] = await Promise.all([
      supabase.from('dns_records').select('full_domain, status, ssl_status, error_message').eq('entity_id', clubId).eq('record_type', 'club_website').limit(1).maybeSingle(),
      supabase.from('amplify_custom_domains').select('domain_name, domain_status, status_reason').eq('entity_id', clubId).eq('record_type', 'club_website').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const out: HubAddress[] = [];
    if (amp?.domain_name) {
      out.push({
        host: normHost(amp.domain_name), kind: 'custom',
        state: amp.domain_status === 'AVAILABLE' ? 'working' : amp.domain_status === 'failed' ? 'problem' : 'pending',
        note: amp.status_reason || null,
      });
    } else if (club?.custom_domain && club.domain_status === 'custom') {
      out.push({ host: normHost(club.custom_domain), kind: 'custom', state: 'pending' });
    }
    if (dns?.full_domain) {
      out.push({
        host: normHost(dns.full_domain), kind: 'alfie',
        state: dns.status === 'active' && (dns.ssl_status === 'active' || !dns.ssl_status) ? 'working' : dns.status === 'failed' ? 'problem' : 'pending',
        note: dns.error_message || null,
      });
    }
    return out;
  }, [clubId]);

  const loadActivity = useCallback(async (): Promise<HubActivity[]> => {
    const { data } = await supabase.from('website_activity_log')
      .select('id, action, entity_type, entity_name, created_at, user_id')
      .eq('club_id', clubId).order('created_at', { ascending: false }).limit(8);
    const rows = data || [];
    const ids = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean))) as string[];
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id, first_name, last_name, avatar_url').in('id', ids)
      : { data: [] as any[] };
    const map = new Map((profs || []).map((p: any) => [p.id, p]));
    return rows.map(r => {
      const p: any = r.user_id ? map.get(r.user_id) : null;
      return { ...r, who: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Someone' : 'AlfiePRO', avatar: p?.avatar_url || null };
    });
  }, [clubId]);

  const loadSlides = useCallback(async () => {
    const { count } = await supabase.from('homepage_slides').select('id', { count: 'exact', head: true }).eq('club_id', clubId).eq('is_active', true);
    return count || 0;
  }, [clubId]);

  const reload = useCallback(async (what?: ('club' | 'pages' | 'activity' | 'domains' | 'slides')[]) => {
    const all = !what;
    const want = (k: string) => all || what!.includes(k as any);
    const club = want('club') || want('domains') ? await loadClub() : null;
    const [pages, activity, addresses, slideCount] = await Promise.all([
      want('pages') ? getOrganizationPages('club', clubId) : Promise.resolve(null),
      want('activity') ? loadActivity() : Promise.resolve(null),
      want('domains') ? loadDomains(club) : Promise.resolve(null),
      want('slides') ? loadSlides() : Promise.resolve(null),
    ]);
    setSt(prev => ({
      ...prev,
      loading: false,
      club: club ?? prev.club,
      pages: pages ?? prev.pages,
      activity: activity ?? prev.activity,
      addresses: addresses ?? prev.addresses,
      slideCount: slideCount ?? prev.slideCount,
    }));
  }, [clubId, loadClub, loadActivity, loadDomains, loadSlides]);

  useEffect(() => {
    setSt(s => ({ ...s, loading: true }));
    supabase.auth.getUser().then(({ data }) => setSt(s => ({ ...s, userId: data.user?.id || null })));
    reload();
  }, [reload]);

  const updateClub = useCallback(async (patch: Partial<HubClub>) => {
    const { error } = await supabase.from('clubs').update(patch).eq('id', clubId);
    if (error) {
      console.error('Website hub: saving club failed', error);
      return false;
    }
    setSt(prev => (prev.club ? { ...prev, club: { ...prev.club, ...patch } } : prev));
    return true;
  }, [clubId]);

  const log = useCallback((action: string, entityType: string, entityName: string, entityId?: string | null) => {
    (async () => {
      const uid = st.userId || (await supabase.auth.getUser()).data.user?.id || null;
      await supabase.from('website_activity_log').insert({
        club_id: clubId, user_id: uid, action, entity_type: entityType, entity_name: entityName, entity_id: entityId || null,
      });
      const activity = await loadActivity();
      setSt(prev => ({ ...prev, activity }));
    })().catch(() => {});
  }, [clubId, st.userId, loadActivity]);

  const api = useMemo<HubApi>(() => {
    const working = st.addresses.filter(a => a.state === 'working');
    const liveHost = (working.find(a => a.kind === 'custom') || working[0])?.host || null;
    const previewPath = `/club/${clubId}/public`;
    const status: HubApi['status'] = liveHost ? 'live' : st.addresses.some(a => a.state === 'pending') ? 'pending' : 'none';
    return { ...st, liveHost, previewPath, previewHref: liveHost ? `https://${liveHost}` : previewPath, status, reload, updateClub, log };
  }, [st, clubId, reload, updateClub, log]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

export const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  const w = Math.floor(d / 7); if (d < 31) return `${w} week${w === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`;
  const y = Math.floor(d / 365); return `${y} year${y === 1 ? '' : 's'} ago`;
};
