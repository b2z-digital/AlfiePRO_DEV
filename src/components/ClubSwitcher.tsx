import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ChevronsUpDown, Building, Check, MapPin, Globe, Search, X, Shield, Star, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { supabase } from '../utils/supabase';
import type { Organization } from '../types/club';
import { Logo } from './Logo';
import { OrgSwitcherPalette, OrgLogo, formatOrgRole } from './OrgSwitcherPalette';

interface ClubSwitcherProps {
  currentClubId: string | null;
  onClubChange: (clubId: string) => void;
  className?: string;
  isCollapsed?: boolean;
  darkMode?: boolean;
  /** 'sidebar' = the main navigation switcher (Alfie palette design); default = plain dropdown picker */
  variant?: 'sidebar' | 'default';
}

const formatRoleDisplay = (role: string): string => {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'national_admin':
      return 'National Admin';
    case 'state_admin':
      return 'State Admin';
    case 'admin':
      return 'Admin';
    case 'editor':
      return 'Editor';
    case 'member':
      return 'Member';
    case 'viewer':
      return 'Viewer';
    default:
      return 'Member';
  }
};

const getOrgIcon = (type: string) => {
  switch (type) {
    case 'national':
      return Globe;
    case 'state':
      return MapPin;
    case 'club':
    default:
      return Building;
  }
};

export const ClubSwitcher: React.FC<ClubSwitcherProps> = ({
  currentClubId,
  onClubChange,
  className = '',
  isCollapsed = false,
  darkMode = true,
  variant = 'default'
}) => {
  const [parentOf, setParentOf] = useState<Record<string, string>>({});
  const { userClubs, currentClub, isSuperAdmin } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const [isOpen, setIsOpen] = useState(false);
  const [showSlideout, setShowSlideout] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['national', 'state', 'clubs']));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const slideoutRef = useRef<HTMLDivElement>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const fetchOrganizations = async () => {
      const allOrgs: Organization[] = [];
      const parents: Record<string, string> = {};

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
                role: sa.role
              });
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
                parents[club.id] = sa.state_association_id;
                if (!existingClubIds.has(club.id)) {
                  allOrgs.push({
                    id: club.id,
                    name: club.abbreviation || club.name,
                    type: 'club',
                    logo: club.logo || null,
                    role: 'state_admin'
                  });
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
                parents[sa.id] = na.national_association_id;
                if (!existingStateIds.has(sa.id)) {
                  allOrgs.push({
                    id: sa.id,
                    name: sa.short_name || sa.name,
                    type: 'state',
                    logo: sa.logo_url,
                    role: 'national_admin'
                  });
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
                    parents[club.id] = sa.id;
                    if (!existingClubIds.has(club.id)) {
                      allOrgs.push({
                        id: club.id,
                        name: club.abbreviation || club.name,
                        type: 'club',
                        logo: club.logo || null,
                        role: 'national_admin'
                      });
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (slideoutRef.current && !slideoutRef.current.contains(event.target as Node)) {
        setShowSlideout(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const isSlideoutHost = variant === 'sidebar' || isCollapsed || className.includes('w-10 h-10');
  useEffect(() => {
    if (!isSlideoutHost) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'o') return;
      if (organizations.length < 2) return;
      e.preventDefault();
      if (e.shiftKey) {
        const previous = recentIds.find((id) => id !== currentClubId && organizations.some((o) => o.id === id));
        if (previous) onClubChange(previous);
        return;
      }
      openPalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSlideoutHost, organizations, recentIds, currentClubId, onClubChange]);

  // Return null if no organizations are available
  if (!organizations || organizations.length === 0) {
    return null;
  }

  // Filter organizations by search query
  const filteredOrgs = searchQuery
    ? organizations.filter(o =>
        o.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : organizations;

  // Group organizations by type and sort alphabetically
  const clubs = filteredOrgs.filter(o => o.type === 'club').sort((a, b) => a.name.localeCompare(b.name));
  const stateAssocs = filteredOrgs.filter(o => o.type === 'state').sort((a, b) => a.name.localeCompare(b.name));
  const nationalAssocs = filteredOrgs.filter(o => o.type === 'national').sort((a, b) => a.name.localeCompare(b.name));

  // For collapsed mode, show the logo or initial with click handler if multiple orgs
  if (isCollapsed || className.includes("w-10 h-10")) {
    // Always use the organization matching currentClubId
    const org = organizations.find(o => o.id === currentClubId) || currentOrg || organizations[0];
    const hasMultipleOrgs = organizations.length > 1;

    if (!org) {
      return (
        <div className={`${className} rounded-lg overflow-hidden flex items-center justify-center bg-white ${hasMultipleOrgs ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all' : ''}`}
          onClick={() => hasMultipleOrgs && openPalette()}
        >
          <div className="w-full h-full bg-white flex items-center justify-center">
            <Logo size="small" />
          </div>
        </div>
      );
    }

    const pinStar = (id: string) => (
      <span
        role="button"
        tabIndex={0}
        aria-label={pinnedIds.includes(id) ? 'Unpin' : 'Pin to top'}
        title={pinnedIds.includes(id) ? 'Unpin' : 'Pin to top'}
        onClick={(e) => { e.stopPropagation(); togglePinned(id); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); togglePinned(id); } }}
        className={`alfie-pin p-1 rounded-md flex-shrink-0 transition-opacity ${pinnedIds.includes(id) ? 'text-amber-400 opacity-100' : 'text-slate-500 hover:text-amber-300'}`}
      >
        <Star size={14} fill={pinnedIds.includes(id) ? 'currentColor' : 'none'} />
      </span>
    );
    const orgById = (id: string) => organizations.find((o) => o.id === id);
    const pinnedOrgs = pinnedIds.map(orgById).filter(Boolean) as Organization[];
    const recentOrgs = recentIds
      .filter((id) => id !== currentClubId && !pinnedIds.includes(id))
      .map(orgById)
      .filter(Boolean)
      .slice(0, 4) as Organization[];
    const selectOrg = (id: string) => {
      onClubChange(id);
      setShowSlideout(false);
      setSearchQuery('');
    };
    const quickRow = (o: Organization) => (
      <button
        key={`quick-${o.id}`}
        onClick={() => selectOrg(o.id)}
        className={`alfie-switch-row w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-700 transition-colors ${o.id === currentClubId ? 'bg-slate-700' : ''}`}
      >
        {o.logo ? (
          <img src={o.logo} alt={o.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-white" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 p-1.5"><Logo size="small" /></div>
        )}
        <div className="flex-1 text-left min-w-0">
          <div className="text-white font-medium text-sm truncate">{o.name}</div>
          <div className="text-slate-400 text-xs">{formatRoleDisplay(o.role || 'member')}</div>
        </div>
        {pinStar(o.id)}
      </button>
    );
    const firstMatch = () =>
      [...nationalAssocs, ...stateAssocs, ...clubs].find((o) => o.id !== currentClubId) ||
      [...nationalAssocs, ...stateAssocs, ...clubs][0];

    return (
      <>
        <div className={`alfie-switch ${hasMultipleOrgs ? 'alfie-switch-multi' : ''}`}>
        <div
          className={`${className} alfie-switch-tile rounded-lg overflow-hidden flex items-center justify-center bg-slate-700 ${hasMultipleOrgs ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all' : ''}`}
          onClick={() => hasMultipleOrgs && openPalette()}
          title={hasMultipleOrgs ? "Switch club or association (⌘O)" : undefined}
        >
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-white flex items-center justify-center p-1.5">
              <Logo size="small" />
            </div>
          )}
        </div>
        {hasMultipleOrgs && (
          <span className="alfie-switch-badge" aria-hidden="true"><ChevronsUpDown size={11} strokeWidth={2.4} /></span>
        )}
        </div>

        {/* Alfie switcher palette */}
        {showSlideout && hasMultipleOrgs && (
          <OrgSwitcherPalette
            organizations={organizations as any}
            parentOf={parentOf}
            currentId={currentClubId}
            isSuperAdmin={!!isSuperAdmin}
            pinnedIds={pinnedIds}
            onPinnedChange={savePinned}
            recentIds={recentIds}
            onSelect={(id) => { onClubChange(id); setSearchQuery(''); }}
            onClose={() => setShowSlideout(false)}
            left={paletteLeft}
            panelRef={slideoutRef}
          />
        )}
      </>
    );
  }

  if (organizations.length === 1) {
    const org = organizations[0];
    const Icon = getOrgIcon(org.type);

    if (!org) {
      return (
        <div className={`flex items-center gap-3 ${className}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Building size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-medium">Unknown Organization</div>
            <div className="text-slate-400 text-xs">Member</div>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {org.logo ? (
          <img
            src={org.logo}
            alt={org.name}
            className="w-8 h-8 rounded-lg object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center p-1">
            <Logo size="small" />
          </div>
        )}
        <div>
          <div className="text-white font-medium">{org.name}</div>
          <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
        </div>
      </div>
    );
  }

  if (variant === 'sidebar') {
    const platformOrg = { id: 'super-admin-dashboard', name: 'AlfiePRO Management', type: 'platform', role: 'super_admin', logo: null } as any;
    const cur: any = organizations.find((o) => o.id === currentClubId) || (currentClubId === 'super-admin-dashboard' ? platformOrg : currentOrg);
    const crumbs: Organization[] = [];
    let up = currentClubId ? parentOf[currentClubId] : undefined;
    let guard = 0;
    while (up && guard++ < 4) {
      const o = organizations.find((x) => x.id === up);
      if (o) crumbs.unshift(o);
      up = parentOf[up];
    }
    return (
      <div className={`osw-host ${className}`}>
        {crumbs.length > 0 && cur && (
          <div className="osw-crumbs" aria-label="Where you are">
            {crumbs.map((c) => (
              <React.Fragment key={c.id}>
                <button type="button" onClick={() => onClubChange(c.id)} title={`Go to ${c.name}`}>{c.name}</button>
                <span aria-hidden="true">›</span>
              </React.Fragment>
            ))}
            <span className="osw-crumb-cur">{cur.name}</span>
          </div>
        )}
        <button
          type="button"
          className="osw-trigger"
          aria-haspopup="dialog"
          aria-expanded={showSlideout}
          onClick={() => (showSlideout ? setShowSlideout(false) : openPalette())}
          title="Switch club or association (⌘O)"
        >
          {cur ? (
            <OrgLogo org={cur} size={40} radius={11} />
          ) : (
            <span className="osw-logo" style={{ width: 40, height: 40, borderRadius: 11, background: '#fff' }}><Logo size="small" /></span>
          )}
          <span className="flex-1 min-w-0 text-left">
            <span className="osw-trigger-name">{cur?.name || 'Select organisation'}</span>
            <span className="osw-trigger-sub">{formatOrgRole(cur?.role)}</span>
          </span>
          <ChevronsUpDown size={16} />
        </button>
        {showSlideout && (
          <OrgSwitcherPalette
            organizations={organizations as any}
            parentOf={parentOf}
            currentId={currentClubId}
            isSuperAdmin={!!isSuperAdmin}
            pinnedIds={pinnedIds}
            onPinnedChange={savePinned}
            recentIds={recentIds}
            onSelect={(id) => onClubChange(id)}
            onClose={() => setShowSlideout(false)}
            left={paletteLeft}
            panelRef={slideoutRef}
          />
        )}
      </div>
    );
  }

  const calculateDropdownPosition = () => {
    if (!buttonRef.current) return {};

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    // If there's more space above than below, or if space below is less than 200px
    if (spaceAbove > spaceBelow || spaceBelow < 200) {
      return {
        bottom: '100%',
        top: 'auto',
        marginBottom: '8px',
        maxHeight: `${Math.min(spaceAbove - 20, 400)}px`
      };
    }

    return {
      top: '100%',
      bottom: 'auto',
      marginTop: '8px',
      maxHeight: `${Math.min(spaceBelow - 20, 400)}px`
    };
  };

  const Icon = currentOrg ? getOrgIcon(currentOrg.type) : Building;

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 shadow-lg ${
          darkMode
            ? 'bg-gradient-to-r from-slate-800/80 to-slate-800/50 hover:from-slate-700/80 hover:to-slate-700/50 border border-slate-700/50 hover:border-blue-500/30 hover:shadow-blue-500/10'
            : 'bg-white hover:bg-gray-50 border border-gray-200 hover:border-blue-400/50 hover:shadow-blue-200/30'
        }`}
      >
        {currentOrg?.logo ? (
          <div className="relative">
            <img
              src={currentOrg.logo}
              alt={currentOrg.name}
              className="w-10 h-10 rounded-lg object-cover ring-2 ring-slate-600 group-hover:ring-blue-500/50 transition-all"
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center p-0.5">
              <Logo size="small" className="!w-3 !h-3" />
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center ring-2 ring-slate-600 group-hover:ring-blue-500/50 transition-all shadow-lg p-1.5">
              <Logo size="small" />
            </div>
          </div>
        )}
        <div className="flex-1 text-left">
          <div className={`font-semibold text-sm transition-colors ${
            darkMode
              ? 'text-white group-hover:text-blue-300'
              : 'text-gray-900 group-hover:text-blue-600'
          }`}>
            {currentOrg?.name || 'Switch View...'}
          </div>
          <div className={`text-xs font-medium ${
            darkMode ? 'text-slate-400' : 'text-gray-500'
          }`}>
            {formatRoleDisplay(currentOrg?.role || 'member')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-px h-6 ${
            darkMode ? 'bg-slate-700/50' : 'bg-gray-200'
          }`}></div>
          <ChevronDown
            size={18}
            className={`transition-all ${isOpen ? 'rotate-180' : ''} ${
              darkMode
                ? 'text-slate-400 group-hover:text-blue-400'
                : 'text-gray-500 group-hover:text-blue-600'
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 right-0 rounded-lg shadow-xl z-50 overflow-hidden overflow-y-auto ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white border border-gray-200'
          }`}
          style={calculateDropdownPosition()}
        >
          {/* AlfiePRO Management - Super Admin Only (Dropdown) */}
          {isSuperAdmin && (
            <>
              <div className="px-4 py-2 bg-slate-900/50 sticky top-0">
                <h4 className="text-sky-400 text-xs font-semibold uppercase tracking-wider">Platform</h4>
              </div>
              <button
                onClick={() => {
                  onClubChange('super-admin-dashboard');
                  setIsOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors
                  ${currentClubId === 'super-admin-dashboard' ? 'bg-slate-700' : ''}
                `}
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center">
                  <Shield size={16} className="text-white" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-white font-medium">AlfiePRO Management</div>
                  <div className="text-sky-400 text-xs">Platform Administration</div>
                </div>
                {currentClubId === 'super-admin-dashboard' && (
                  <Check size={16} className="text-sky-400" />
                )}
              </button>
            </>
          )}

          {/* National Associations */}
          {nationalAssocs.length > 0 && (
            <>
              <div className="px-4 py-2 bg-slate-900/50 sticky top-0">
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">National</h4>
              </div>
              {nationalAssocs.map((org) => {
                const OrgIcon = getOrgIcon(org.type);
                return (
                  <button
                    key={org.id}
                    onClick={() => {
                      onClubChange(org.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors
                      ${org.id === currentClubId ? 'bg-slate-700' : ''}
                    `}
                  >
                    {org.logo ? (
                      <img
                        src={org.logo}
                        alt={org.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                        <OrgIcon size={16} className="text-white" />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <div className="text-white font-medium">{org.name}</div>
                      <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                    </div>
                    {org.id === currentClubId && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* State Associations */}
          {stateAssocs.length > 0 && (
            <>
              <div className="px-4 py-2 bg-slate-900/50 sticky top-0">
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">State</h4>
              </div>
              {stateAssocs.map((org) => {
                const OrgIcon = getOrgIcon(org.type);
                return (
                  <button
                    key={org.id}
                    onClick={() => {
                      onClubChange(org.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors
                      ${org.id === currentClubId ? 'bg-slate-700' : ''}
                    `}
                  >
                    {org.logo ? (
                      <img
                        src={org.logo}
                        alt={org.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                        <OrgIcon size={16} className="text-white" />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <div className="text-white font-medium">{org.name}</div>
                      <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                    </div>
                    {org.id === currentClubId && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Clubs */}
          {clubs.length > 0 && (
            <>
              <div className="px-4 py-2 bg-slate-900/50 sticky top-0">
                <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Clubs</h4>
              </div>
              {clubs.map((org) => {
                const OrgIcon = getOrgIcon(org.type);
                return (
                  <button
                    key={org.id}
                    onClick={() => {
                      onClubChange(org.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors
                      ${org.id === currentClubId ? 'bg-slate-700' : ''}
                    `}
                  >
                    {org.logo ? (
                      <img
                        src={org.logo}
                        alt={org.name}
                        className="w-8 h-8 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center p-1">
                        <Logo size="small" />
                      </div>
                    )}
                    <div className="flex-1 text-left">
                      <div className="text-white font-medium">{org.name}</div>
                      <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                    </div>
                    {org.id === currentClubId && (
                      <Check size={16} className="text-blue-400" />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};
