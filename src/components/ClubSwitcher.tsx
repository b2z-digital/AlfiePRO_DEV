import React, { useState, useEffect, useRef } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { supabase } from '../utils/supabase';
import type { Organization } from '../types/club';
import { OrgSwitcherPalette, OrgLogo, Kbd, formatRole, PLATFORM_ID, type SwitcherOrg } from './OrgSwitcherPalette';

interface ClubSwitcherProps {
  currentClubId: string | null;
  onClubChange: (clubId: string) => void;
  className?: string;
  isCollapsed?: boolean;
  darkMode?: boolean;
  /** 'sidebar' = the main navigation switcher (Alfie palette design); default = plain dropdown picker */
  variant?: 'sidebar' | 'default';
}

export const ClubSwitcher: React.FC<ClubSwitcherProps> = ({
  currentClubId,
  onClubChange,
  className = '',
  isCollapsed = false,
}) => {
  const { userClubs, isSuperAdmin } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const [isOpen, setIsOpen] = useState(false);
  const [organizations, setOrganizations] = useState<SwitcherOrg[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const fetchOrganizations = async () => {
      const allOrgs: SwitcherOrg[] = [];

      if (userClubs && userClubs.length > 0) {
        userClubs.forEach(uc => {
          if (uc.club) {
            if (!isSuperAdmin && (uc.club as any).is_test) return;
            if ((uc.club as any).state_association_id) parents[uc.clubId] = (uc.club as any).state_association_id;
            allOrgs.push({
              id: uc.clubId,
              name: uc.club.abbreviation || uc.club.name,
              type: 'club',
              logo: uc.club.logo || null,
              role: uc.role
            });
          }
        });
      }

      let userId: string | undefined;
      if (isImpersonating) {
        userId = impersonationSession?.targetUserId ?? undefined;
      } else {
        userId = (await supabase.auth.getUser()).data.user?.id;
      }

      if (userId) {
        const { data: stateAssocs } = await supabase
          .from('user_state_associations')
          .select('state_association_id, role, state_associations(id, name, short_name, logo_url, national_association_id)')
          .eq('user_id', userId);

        if (stateAssocs) {
          stateAssocs.forEach((sa: any) => {
            if (sa.state_associations) {
              if (sa.state_associations.national_association_id) parents[sa.state_associations.id] = sa.state_associations.national_association_id;
              allOrgs.push({
                id: sa.state_associations.id,
                name: sa.state_associations.short_name || sa.state_associations.name,
                type: 'state',
                logo: sa.state_associations.logo_url,
                role: sa.role,
                parentId: sa.state_associations.national_association_id ?? null
              } as SwitcherOrg);
            }
          });

          const stateAdminAssocs = stateAssocs.filter((sa: any) => sa.role === 'state_admin');
          for (const sa of stateAdminAssocs) {
            let clubsQuery = supabase
              .from('clubs')
              .select('id, name, abbreviation, logo')
              .eq('state_association_id', sa.state_association_id);
            if (!isSuperAdmin) clubsQuery = clubsQuery.neq('is_test', true);
            const { data: assocClubs } = await clubsQuery;

            if (assocClubs) {
              const existingClubIds = new Set(allOrgs.filter(o => o.type === 'club').map(o => o.id));

              assocClubs.forEach((club: any) => {
                const known = allOrgs.find(o => o.id === club.id) as SwitcherOrg | undefined;
                if (known) known.parentId = sa.state_association_id;
                if (!existingClubIds.has(club.id)) {
                  allOrgs.push({
                    id: club.id,
                    name: club.abbreviation || club.name,
                    type: 'club',
                    logo: club.logo || null,
                    role: 'state_admin',
                    parentId: sa.state_association_id
                  } as SwitcherOrg);
                }
              });
            }
          }
        }

        const { data: nationalAssocs } = await supabase
          .from('user_national_associations')
          .select('national_association_id, role, national_associations(id, name, short_name, logo_url)')
          .eq('user_id', userId);

        if (nationalAssocs) {
          nationalAssocs.forEach((na: any) => {
            if (na.national_associations) {
              allOrgs.push({
                id: na.national_associations.id,
                name: na.national_associations.short_name || na.national_associations.name,
                type: 'national',
                logo: na.national_associations.logo_url,
                role: na.role
              });
            }
          });

          const nationalAdminAssocs = nationalAssocs.filter((na: any) => na.role === 'national_admin');
          for (const na of nationalAdminAssocs) {
            const { data: allStateAssocs } = await supabase
              .from('state_associations')
              .select('id, name, short_name, logo_url')
              .eq('national_association_id', na.national_association_id);

            if (allStateAssocs) {
              const existingStateIds = new Set(allOrgs.filter(o => o.type === 'state').map(o => o.id));

              allStateAssocs.forEach((sa: any) => {
                const known = allOrgs.find(o => o.id === sa.id) as SwitcherOrg | undefined;
                if (known) known.parentId = na.national_association_id;
                if (!existingStateIds.has(sa.id)) {
                  allOrgs.push({
                    id: sa.id,
                    name: sa.short_name || sa.name,
                    type: 'state',
                    logo: sa.logo_url,
                    role: 'national_admin',
                    parentId: na.national_association_id
                  } as SwitcherOrg);
                }
              });

              for (const sa of allStateAssocs) {
                let natClubsQuery = supabase
                  .from('clubs')
                  .select('id, name, abbreviation, logo')
                  .eq('state_association_id', sa.id);
                if (!isSuperAdmin) natClubsQuery = natClubsQuery.neq('is_test', true);
                const { data: stateClubs } = await natClubsQuery;

                if (stateClubs) {
                  const existingClubIds = new Set(allOrgs.filter(o => o.type === 'club').map(o => o.id));

                  stateClubs.forEach((club: any) => {
                    const known = allOrgs.find(o => o.id === club.id) as SwitcherOrg | undefined;
                    if (known) known.parentId = sa.id;
                    if (!existingClubIds.has(club.id)) {
                      allOrgs.push({
                        id: club.id,
                        name: club.abbreviation || club.name,
                        type: 'club',
                        logo: club.logo || null,
                        role: 'national_admin',
                        parentId: sa.id
                      } as SwitcherOrg);
                    }
                  });
                }
              }
            }
          }
        }
      }

      setOrganizations(allOrgs);
      setParentOf(parents);

      const current = allOrgs.find(o => o.id === currentClubId);
      setCurrentOrg(current || null);
    };

    fetchOrganizations();
  }, [userClubs, currentClubId, isImpersonating]);

  // ── Quick switching: pinned + recent places, ⌘O to open, ⌘⇧O to jump back ──
  const readIds = (key: string): string[] => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => readIds('alfie.switcher.pinned'));
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds('alfie.switcher.recent'));

  useEffect(() => {
    if (!currentClubId) return;
    setRecentIds((prev) => {
      if (prev[0] === currentClubId) return prev;
      const next = [currentClubId, ...prev.filter((id) => id !== currentClubId)].slice(0, 6);
      try { localStorage.setItem('alfie.switcher.recent', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [currentClubId]);

  const [paletteLeft, setPaletteLeft] = useState(76);
  const openPalette = () => {
    if (typeof window !== 'undefined') {
      const rail = document.querySelector('.alfie-chrome.fixed') as HTMLElement | null;
      const right = rail ? rail.getBoundingClientRect().right : 70;
      setPaletteLeft(window.innerWidth < 640 ? 12 : Math.round(right + 6));
    }
    setShowSlideout(true);
  };

  const savePinned = (ids: string[]) => {
    setPinnedIds(ids);
    try { localStorage.setItem('alfie.switcher.pinned', JSON.stringify(ids)); } catch { /* ignore */ }
  };

  const togglePinned = (id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-6);
      try { localStorage.setItem('alfie.switcher.pinned', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const reorderPinned = (ids: string[]) => {
    setPinnedIds(ids);
    try { localStorage.setItem('alfie.switcher.pinned', JSON.stringify(ids)); } catch { /* ignore */ }
  };

  const canSwitch = organizations.length > 1 || isSuperAdmin;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'o') return;
      if (!canSwitch) return;
      e.preventDefault();
      if (e.shiftKey) {
        const previous = recentIds.find((id) => id !== currentClubId && (organizations.some((o) => o.id === id) || (isSuperAdmin && id === PLATFORM_ID)));
        if (previous) onClubChange(previous);
        return;
      }
      setIsOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSwitch, organizations, recentIds, currentClubId, onClubChange, isSuperAdmin]);

  if (!organizations || organizations.length === 0) {
    return null;
  }

  const collapsedMode = isCollapsed || className.includes('w-10 h-10');
  const platformOrg: SwitcherOrg = { id: PLATFORM_ID, name: 'AlfiePRO Management', type: 'club' as any, role: 'super_admin' };
  const findOrg = (id: string | null | undefined) =>
    id === PLATFORM_ID ? platformOrg : organizations.find((o) => o.id === id);
  const org = findOrg(currentClubId) || (currentOrg as SwitcherOrg | null) || organizations[0];

  // Breadcrumb: the parents we know about, top level first.
  const trail: SwitcherOrg[] = [];
  for (let p = findOrg(org?.parentId); p && trail.length < 3; p = findOrg(p.parentId)) trail.unshift(p);

  const select = (id: string) => {
    setIsOpen(false);
    if (id !== currentClubId) onClubChange(id);
  };

  const palette = (
    <OrgSwitcherPalette
      open={isOpen}
      anchorRef={triggerRef}
      layoutKey={collapsedMode ? 'c' : 'e'}
      orgs={organizations}
      currentId={currentClubId}
      pinnedIds={pinnedIds}
      recentIds={recentIds}
      isSuperAdmin={isSuperAdmin}
      onSelect={select}
      onClose={() => setIsOpen(false)}
      onTogglePin={togglePinned}
      onReorderPins={reorderPinned}
    />
  );

  if (collapsedMode) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          className={`osw-rail ${canSwitch ? 'osw-rail-multi' : ''}`}
          onClick={() => canSwitch && setIsOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={`Switch club or association — current: ${org?.name ?? ''}, ${formatRole(org?.role)}`}
          title={canSwitch ? 'Switch club or association (⌘O)' : org?.name}
          disabled={!canSwitch}
        >
          <OrgLogo org={org} size={42} radius={13} />
          {canSwitch && <span className="osw-rail-badge" aria-hidden="true"><ChevronsUpDown size={12} strokeWidth={2.2} /></span>}
        </button>
        {palette}
      </>
    );
  }

  return (
    <div className={`osw-host ${className}`}>
      {trail.length > 0 && (
        <nav className="osw-crumbs" aria-label="Organisation level">
          {trail.map((p) => (
            <React.Fragment key={p.id}>
              <button type="button" onClick={() => select(p.id)}>{p.name}</button>
              <span aria-hidden="true">›</span>
            </React.Fragment>
          ))}
          <span className="osw-crumb-here">{org?.name}</span>
        </nav>
      )}
      <button
        ref={triggerRef}
        type="button"
        className={`osw-trigger ${canSwitch ? '' : 'osw-trigger-single'}`}
        onClick={() => canSwitch && setIsOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={!canSwitch}
        title={canSwitch ? 'Switch club or association (⌘O)' : undefined}
      >
        <OrgLogo org={org} size={40} radius={11} />
        <span className="osw-trigger-txt">
          <span className="osw-trigger-name">{org?.name || 'Switch view'}</span>
          <span className="osw-trigger-role">{formatRole(org?.role)}</span>
        </span>
        {canSwitch && <Kbd>⌘O</Kbd>}
      </button>
      {palette}
    </div>
  );
};
