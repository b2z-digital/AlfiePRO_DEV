import { useAuth } from '../contexts/AuthContext';

export type Permission =
  | 'races.manage'
  | 'races.score'
  | 'races.view'
  | 'reports.create'
  | 'venues.create'
  | 'venues.view'
  | 'articles.create'
  | 'articles.view'
  | 'membership.manage'
  | 'membership.view'
  | 'meetings.create'
  | 'meetings.view'
  | 'minutes.create'
  | 'minutes.view'
  | 'tasks.create'
  | 'tasks.view'
  | 'finance.manage'
  | 'website.manage'
  | 'settings.club'
  | 'settings.team'
  | 'settings.subscriptions'
  | 'settings.integrations'
  | 'settings.finance'
  | 'settings.documents'
  | 'settings.import'
  | 'state.manage'
  | 'national.manage'
  | 'platform.manage';

export function usePermissions() {
  const { currentClub, currentOrganization, isSuperAdmin } = useAuth();
  const userRole = currentOrganization?.role || currentClub?.role || 'member';

  const hasPermission = (permission: Permission): boolean => {
    // Super admins have all permissions
    if (isSuperAdmin) return true;

    // National admins have all permissions across all clubs
    if (userRole === 'national_admin') return true;

    // State admins have all permissions within their state
    if (userRole === 'state_admin') {
      // State admins can't manage platform-level settings
      if (permission === 'platform.manage') return false;
      return true;
    }

    // Club admins have all permissions within their club
    if (userRole === 'admin') {
      // Club admins can't manage state/national/platform level
      if (permission === 'state.manage') return false;
      if (permission === 'national.manage') return false;
      if (permission === 'platform.manage') return false;
      return true;
    }

    // Editor permissions
    if (userRole === 'editor') {
      const editorPermissions: Permission[] = [
        'races.manage',
        'races.score',
        'races.view',
        'reports.create',
        'venues.create',
        'venues.view',
        'articles.create',
        'articles.view',
        'membership.manage',
        'membership.view',
        'meetings.create',
        'meetings.view',
        'minutes.create',
        'minutes.view',
        'tasks.create',
        'tasks.view',
        'finance.manage',
        'website.manage',
        'settings.club',
        'settings.team',
        'settings.subscriptions',
        'settings.integrations',
        'settings.finance',
        'settings.documents',
        'settings.import'
      ];
      return editorPermissions.includes(permission);
    }

    // PRO (Principal Race Officer) permissions - Race management and reporting
    if (userRole === 'pro') {
      const proPermissions: Permission[] = [
        'races.manage',
        'races.score',
        'races.view',
        'reports.create',
        'venues.view',
        'articles.view',
        'membership.view',
        'meetings.view',
        'minutes.view',
        'tasks.view'
      ];
      return proPermissions.includes(permission);
    }

    // Member permissions (view-only for most features)
    if (userRole === 'member') {
      const memberPermissions: Permission[] = [
        'races.view',
        'venues.view',
        'articles.view',
        'membership.view',
        'meetings.view',
        'minutes.view',
        'tasks.view'
      ];
      return memberPermissions.includes(permission);
    }

    return false;
  };

  const can = hasPermission;
  const cannot = (permission: Permission) => !hasPermission(permission);

  const isMember = userRole === 'member';
  const isPRO = userRole === 'pro';
  const isEditor = userRole === 'editor' || userRole === 'pro';
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const isStateAdmin = userRole === 'state_admin' || userRole === 'national_admin' || isSuperAdmin;
  const isNationalAdmin = userRole === 'national_admin' || isSuperAdmin;

  return {
    can,
    cannot,
    hasPermission,
    isMember,
    isPRO,
    isEditor,
    isAdmin,
    isStateAdmin,
    isNationalAdmin,
    userRole
  };
}
