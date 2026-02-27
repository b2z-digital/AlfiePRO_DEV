import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Building, Check, MapPin, Globe, Search, X, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import type { Organization } from '../types/club';
import { Logo } from './Logo';

interface ClubSwitcherProps {
  currentClubId: string | null;
  onClubChange: (clubId: string) => void;
  className?: string;
  isCollapsed?: boolean;
  darkMode?: boolean;
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
  darkMode = true
}) => {
  const { userClubs, currentClub, isSuperAdmin } = useAuth();
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

  // Fetch all organizations (clubs, state, national)
  useEffect(() => {
    const fetchOrganizations = async () => {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) return;

      const allOrgs: Organization[] = [];

      // Fetch clubs
      if (userClubs && userClubs.length > 0) {
        userClubs.forEach(uc => {
          if (uc.club) {
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

      // Fetch state associations
      const { data: stateAssocs } = await supabase
        .from('user_state_associations')
        .select('state_association_id, role, state_associations(id, name, short_name, logo_url)')
        .eq('user_id', userId);

      if (stateAssocs) {
        stateAssocs.forEach((sa: any) => {
          if (sa.state_associations) {
            allOrgs.push({
              id: sa.state_associations.id,
              name: sa.state_associations.short_name || sa.state_associations.name,
              type: 'state',
              logo: sa.state_associations.logo_url,
              role: sa.role
            });
          }
        });
      }

      // Fetch national associations
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

        // If user is a national admin, fetch ALL state associations under their national association
        const nationalAdminAssocs = nationalAssocs.filter((na: any) => na.role === 'national_admin');
        for (const na of nationalAdminAssocs) {
          const { data: allStateAssocs } = await supabase
            .from('state_associations')
            .select('id, name, short_name, logo_url')
            .eq('national_association_id', na.national_association_id);

          if (allStateAssocs) {
            // Only add state associations that aren't already in the list
            const existingStateIds = new Set(allOrgs.filter(o => o.type === 'state').map(o => o.id));

            allStateAssocs.forEach((sa: any) => {
              if (!existingStateIds.has(sa.id)) {
                allOrgs.push({
                  id: sa.id,
                  name: sa.short_name || sa.name,
                  type: 'state',
                  logo: sa.logo_url,
                  role: 'national_admin' // Inherited from national admin role
                });
              }
            });
          }
        }
      }

      setOrganizations(allOrgs);

      // Set current org
      const current = allOrgs.find(o => o.id === currentClubId);
      setCurrentOrg(current || null);
    };

    fetchOrganizations();
  }, [userClubs, currentClubId]);

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
          onClick={() => hasMultipleOrgs && setShowSlideout(true)}
        >
          <div className="w-full h-full bg-white flex items-center justify-center">
            <Logo size="small" />
          </div>
        </div>
      );
    }

    return (
      <>
        <div
          className={`${className} rounded-lg overflow-hidden flex items-center justify-center bg-slate-700 ${hasMultipleOrgs ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all' : ''}`}
          onClick={() => hasMultipleOrgs && setShowSlideout(true)}
          title={hasMultipleOrgs ? "Switch organization" : undefined}
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

        {/* Slide-out panel for multiple organizations */}
        {hasMultipleOrgs && showSlideout && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
              onClick={() => setShowSlideout(false)}
            />

            {/* Slide-out panel */}
            <div
              ref={slideoutRef}
              className="fixed left-[70px] top-0 bottom-0 w-80 bg-slate-800 border-r border-slate-700 shadow-2xl z-[70] animate-slide-in-left"
            >
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-white font-semibold text-sm">Switch View</h3>
                <p className="text-slate-400 text-xs mt-1">Select an organization to manage</p>

                {/* Search Box */}
                {organizations.length > 5 && (
                  <div className="mt-3 relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search organizations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-y-auto max-h-[calc(100vh-140px)]">
                {/* AlfiePRO Management - Super Admin Only */}
                {isSuperAdmin && (
                  <>
                    <button
                      onClick={() => toggleSection('platform')}
                      className="w-full px-4 py-2 bg-slate-900/50 flex items-center justify-between hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('platform') ? (
                          <ChevronDown size={14} className="text-sky-400" />
                        ) : (
                          <ChevronRight size={14} className="text-sky-400" />
                        )}
                        <h4 className="text-sky-400 text-xs font-semibold uppercase tracking-wider">Platform</h4>
                      </div>
                    </button>
                    {expandedSections.has('platform') && (
                      <button
                        onClick={() => {
                          onClubChange('super-admin-dashboard');
                          setShowSlideout(false);
                        }}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50
                          ${currentClubId === 'super-admin-dashboard' ? 'bg-slate-700' : ''}
                        `}
                      >
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
                          <Shield size={20} className="text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-white font-medium text-sm">AlfiePRO Management</div>
                          <div className="text-sky-400 text-xs">Platform Administration</div>
                        </div>
                        {currentClubId === 'super-admin-dashboard' && (
                          <Check size={16} className="text-sky-400 flex-shrink-0" />
                        )}
                      </button>
                    )}
                  </>
                )}

                {/* National Associations */}
                {nationalAssocs.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleSection('national')}
                      className="w-full px-4 py-2 bg-slate-900/50 flex items-center justify-between hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('national') ? (
                          <ChevronDown size={14} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={14} className="text-slate-400" />
                        )}
                        <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">National</h4>
                      </div>
                      <span className="text-slate-500 text-xs">{nationalAssocs.length}</span>
                    </button>
                    {expandedSections.has('national') && nationalAssocs.map((org) => {
                      const Icon = getOrgIcon(org.type);
                      return (
                        <button
                          key={org.id}
                          onClick={() => {
                            onClubChange(org.id);
                            setShowSlideout(false);
                          }}
                          className={`
                            w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50
                            ${org.id === currentClubId ? 'bg-slate-700' : ''}
                          `}
                        >
                          {org.logo ? (
                            <img
                              src={org.logo}
                              alt={org.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center flex-shrink-0">
                              <Icon size={20} className="text-white" />
                            </div>
                          )}
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium text-sm">{org.name}</div>
                            <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                          </div>
                          {org.id === currentClubId && (
                            <Check size={16} className="text-blue-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </>
                )}

                {/* State Associations */}
                {stateAssocs.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleSection('state')}
                      className="w-full px-4 py-2 bg-slate-900/50 flex items-center justify-between hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('state') ? (
                          <ChevronDown size={14} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={14} className="text-slate-400" />
                        )}
                        <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">State</h4>
                      </div>
                      <span className="text-slate-500 text-xs">{stateAssocs.length}</span>
                    </button>
                    {expandedSections.has('state') && stateAssocs.map((org) => {
                      const Icon = getOrgIcon(org.type);
                      return (
                        <button
                          key={org.id}
                          onClick={() => {
                            onClubChange(org.id);
                            setShowSlideout(false);
                          }}
                          className={`
                            w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50
                            ${org.id === currentClubId ? 'bg-slate-700' : ''}
                          `}
                        >
                          {org.logo ? (
                            <img
                              src={org.logo}
                              alt={org.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center flex-shrink-0">
                              <Icon size={20} className="text-white" />
                            </div>
                          )}
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium text-sm">{org.name}</div>
                            <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                          </div>
                          {org.id === currentClubId && (
                            <Check size={16} className="text-blue-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </>
                )}

                {/* Clubs */}
                {clubs.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleSection('clubs')}
                      className="w-full px-4 py-2 bg-slate-900/50 flex items-center justify-between hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has('clubs') ? (
                          <ChevronDown size={14} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={14} className="text-slate-400" />
                        )}
                        <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Clubs</h4>
                      </div>
                      <span className="text-slate-500 text-xs">{clubs.length}</span>
                    </button>
                    {expandedSections.has('clubs') && clubs.map((org) => {
                      const Icon = getOrgIcon(org.type);
                      return (
                        <button
                          key={org.id}
                          onClick={() => {
                            onClubChange(org.id);
                            setShowSlideout(false);
                          }}
                          className={`
                            w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50
                            ${org.id === currentClubId ? 'bg-slate-700' : ''}
                          `}
                        >
                          {org.logo ? (
                            <img
                              src={org.logo}
                              alt={org.name}
                              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 p-1.5">
                              <Logo size="small" />
                            </div>
                          )}
                          <div className="flex-1 text-left">
                            <div className="text-white font-medium text-sm">{org.name}</div>
                            <div className="text-slate-400 text-xs">{formatRoleDisplay(org.role || 'member')}</div>
                          </div>
                          {org.id === currentClubId && (
                            <Check size={16} className="text-blue-400 flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </>
                )}

                {/* No Results Message */}
                {searchQuery && filteredOrgs.length === 0 && (
                  <div className="p-8 text-center">
                    <Search size={48} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-slate-400 text-sm">No organizations found</p>
                    <p className="text-slate-500 text-xs mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            </div>
          </>
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
                      <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
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
