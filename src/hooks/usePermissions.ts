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
  | 'finance.view'
  | 'website.manage'
  | 'settings.club'
  | 'settings.team'
  | 'settings.subscriptions'
  | 'settings.integrations'
  | 'settings.finance'
  | 'settings.documents'
  | 'settings.import'
  | 'settings.membership'
  | 'settings.startbox'
  | 'dashboard.edit'
  | 'users.manage'
  | 'state.manage'
  | 'national.manage'
  | 'platform.manage';

export function usePermissions() {
  const { currentClub, currentOrganization, isSuperAdmin, isRaceOfficer } = useAuth();
  const userRole = currentOrganization?.role || currentClub?.role || 'member';
  const isAssociationContext = !!currentOrganization && (currentOrganization.type === 'state' || currentOrganization.type === 'national');
  const isStandaloneRaceOfficer = isRaceOfficer && !currentClub && !currentOrganization;

  const hasPermission = (permission: Permission): boolean => {
    if (isSuperAdmin) return true;

    if (isStandaloneRaceOfficer) {
      const raceOfficerPermissions: Permission[] = [
        'races.manage',
        'races.score',
        'races.view',
        'reports.create',
        'venues.create',
        'venues.view',
        'settings.documents',
        'settings.startbox',
        'settings.integrations',
        'dashboard.edit',
      ];
      return raceOfficerPermissions.includes(permission);
    }

    if (userRole === 'national_admin') {
      if (permission === 'settings.startbox') return false;
      return true;
    }

    if (userRole === 'state_admin') {
      if (permission === 'platform.manage') return false;
      if (permission === 'settings.startbox') return false;
      return true;
    }

    if (isAssociationContext && userRole === 'editor') {
      const assocEditorPermissions: Permission[] = [
        'races.manage',
        'races.score',
        'races.view',
        'reports.create',
        'venues.create',
        'venues.view',
        'articles.create',
        'articles.view',
        'membership.view',
        'meetings.create',
        'meetings.view',
        'minutes.create',
        'minutes.view',
        'tasks.create',
        'tasks.view',
        'finance.view',
        'dashboard.edit',
      ];
      return assocEditorPermissions.includes(permission);
    }

    if (isAssociationContext && userRole === 'member') {
      const assocViewerPermissions: Permission[] = [
        'races.view',
        'venues.view',
        'articles.view',
        'membership.view',
        'meetings.view',
        'minutes.view',
        'tasks.view',
        'finance.view',
      ];
      return assocViewerPermissions.includes(permission);
    }

    if (userRole === 'admin') {
      if (permission === 'state.manage') return false;
      if (permission === 'national.manage') return false;
      if (permission === 'platform.manage') return false;
      if (permission === 'settings.startbox') return false;
      return true;
    }

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
        'finance.view',
        'website.manage',
        'dashboard.edit',
        'settings.club',
        'settings.team',
        'settings.subscriptions',
        'settings.integrations',
        'settings.finance',
        'settings.documents',
        'settings.import',
        'settings.membership'
      ];
      return editorPermissions.includes(permission);
    }

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
        'tasks.view',
        'dashboard.edit',
      ];
      return proPermissions.includes(permission);
    }

    if (userRole === 'race_scorer') {
      const scorerPermissions: Permission[] = [
        'races.score',
        'races.view',
        'venues.view',
        'dashboard.edit',
      ];
      return scorerPermissions.includes(permission);
    }

    if (userRole === 'member') {
      const memberPermissions: Permission[] = [
        'races.view',
        'venues.view',
        'articles.view',
        'membership.view',
        'meetings.view',
        'minutes.view',
        'tasks.view',
        'finance.view',
        'dashboard.edit',
      ];
      return memberPermissions.includes(permission);
    }

    return false;
  };

  const can = hasPermission;
  const cannot = (permission: Permission) => !hasPermission(permission);

  const isMember = userRole === 'member';
  const isPRO = userRole === 'pro';
  const isScorer = userRole === 'race_scorer';
  const isEditor = userRole === 'editor' || userRole === 'pro';
  const isAdmin = userRole === 'admin' || isSuperAdmin;
  const isStateAdmin = userRole === 'state_admin' || userRole === 'national_admin' || isSuperAdmin;
  const isNationalAdmin = userRole === 'national_admin' || isSuperAdmin;
  const isAssociationEditor = isAssociationContext && userRole === 'editor';
  const isAssociationViewer = isAssociationContext && userRole === 'member';
  const canEditDashboard = can('dashboard.edit');

  return {
    can,
    cannot,
    hasPermission,
    isMember,
    isPRO,
    isScorer,
    isEditor,
    isAdmin,
    isStateAdmin,
    isNationalAdmin,
    isAssociationEditor,
    isAssociationViewer,
    isAssociationContext,
    canEditDashboard,
    userRole
  };
}
