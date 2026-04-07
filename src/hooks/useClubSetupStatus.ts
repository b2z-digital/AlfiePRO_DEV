import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

export interface SetupTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  route: string;
  routeState?: Record<string, string | boolean>;
}

export interface SetupCategory {
  id: string;
  title: string;
  icon: string;
  tasks: SetupTask[];
  completedCount: number;
  totalCount: number;
}

export interface ClubSetupStatus {
  categories: SetupCategory[];
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
  isFullyComplete: boolean;
  isDismissed: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  dismiss: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  completeAll: () => Promise<void>;
}

const SETUP_TASKS: { categoryId: string; title: string; icon: string; tasks: Omit<SetupTask, 'completed'>[] }[] = [
  {
    categoryId: 'membership',
    title: 'Set Up Membership',
    icon: 'users',
    tasks: [
      {
        id: 'membership-types',
        label: 'Create Membership Types',
        description: 'Define your membership categories (e.g. Full, Associate, Junior)',
        route: '/settings',
        routeState: { activeTab: 'membership-types', fromSetupChecklist: true },
      },
      {
        id: 'renewal-settings',
        label: 'Set Membership Renewal Settings',
        description: 'Configure how and when memberships renew',
        route: '/settings',
        routeState: { activeTab: 'membership-renewals', fromSetupChecklist: true },
      },
      {
        id: 'code-of-conduct',
        label: 'Update Code of Conduct',
        description: 'Add your club\'s code of conduct for new members',
        route: '/settings',
        routeState: { activeTab: 'membership-conduct', fromSetupChecklist: true },
      },
    ],
  },
  {
    categoryId: 'finance',
    title: 'Set Up Club Finances',
    icon: 'dollar-sign',
    tasks: [
      {
        id: 'finance-categories',
        label: 'Set Up Finance Categories',
        description: 'Create income and expense categories for tracking',
        route: '/settings',
        routeState: { activeTab: 'finance-categories', fromSetupChecklist: true },
      },
      {
        id: 'bank-details',
        label: 'Add Bank Details',
        description: 'Add your bank account details for invoices and payments',
        route: '/settings',
        routeState: { activeTab: 'finance-payment', fromSetupChecklist: true },
      },
      {
        id: 'opening-balance',
        label: 'Add Club\'s Opening Balance',
        description: 'Set your starting bank balance for accurate reporting',
        route: '/settings',
        routeState: { activeTab: 'finance-opening-balance', fromSetupChecklist: true },
      },
    ],
  },
  {
    categoryId: 'members',
    title: 'Set Up Club Members',
    icon: 'user-plus',
    tasks: [
      {
        id: 'create-members',
        label: 'Create or Import Club Members',
        description: 'Add members manually or import from a CSV file',
        route: '/membership-dashboard',
        routeState: { activeTab: 'members' },
      },
      {
        id: 'committee-members',
        label: 'Add Committee Members',
        description: 'Assign committee roles to your club members',
        route: '/settings',
        routeState: { activeTab: 'team', fromSetupChecklist: true },
      },
    ],
  },
];

export function useClubSetupStatus(): ClubSetupStatus {
  const { currentClub, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [categories, setCategories] = useState<SetupCategory[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);

  const checkSetupStatus = useCallback(async () => {
    if (!currentClub?.clubId || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const clubId = currentClub.clubId;

      const { data: checklistRow } = await supabase
        .from('club_setup_checklists')
        .select('dismissed_at, completed_tasks')
        .eq('club_id', clubId)
        .maybeSingle();

      if (checklistRow?.dismissed_at) {
        setIsDismissed(true);
        setLoading(false);
        return;
      }

      const savedTasks: string[] = Array.isArray(checklistRow?.completed_tasks)
        ? checklistRow.completed_tasks
        : [];
      setCompletedTaskIds(savedTasks);

      const builtCategories: SetupCategory[] = SETUP_TASKS.map(catDef => {
        const tasks: SetupTask[] = catDef.tasks.map(t => ({
          ...t,
          completed: savedTasks.includes(t.id),
        }));
        return {
          id: catDef.categoryId,
          title: catDef.title,
          icon: catDef.icon,
          tasks,
          completedCount: tasks.filter(t => t.completed).length,
          totalCount: tasks.length,
        };
      });

      setCategories(builtCategories);
    } catch (error) {
      console.error('Error checking club setup status:', error);
    } finally {
      setLoading(false);
    }
  }, [currentClub?.clubId]);

  useEffect(() => {
    setLoading(true);
    setIsDismissed(false);
    checkSetupStatus();
  }, [checkSetupStatus]);

  const toggleTask = useCallback(async (taskId: string) => {
    if (!currentClub?.clubId || !user?.id) return;

    const clubId = currentClub.clubId;
    const isCurrentlyComplete = completedTaskIds.includes(taskId);
    const newCompletedTasks = isCurrentlyComplete
      ? completedTaskIds.filter(id => id !== taskId)
      : [...completedTaskIds, taskId];

    setCompletedTaskIds(newCompletedTasks);
    setCategories(prev =>
      prev.map(cat => {
        const tasks = cat.tasks.map(t =>
          t.id === taskId ? { ...t, completed: !isCurrentlyComplete } : t
        );
        return {
          ...cat,
          tasks,
          completedCount: tasks.filter(t => t.completed).length,
        };
      })
    );

    try {
      await supabase
        .from('club_setup_checklists')
        .upsert({
          club_id: clubId,
          completed_tasks: newCompletedTasks,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_id' });
    } catch (error) {
      console.error('Error toggling task:', error);
      setCompletedTaskIds(completedTaskIds);
      checkSetupStatus();
    }
  }, [currentClub?.clubId, user?.id, completedTaskIds, checkSetupStatus]);

  const dismiss = useCallback(async () => {
    if (!currentClub?.clubId || !user?.id) return;

    try {
      await supabase
        .from('club_setup_checklists')
        .upsert({
          club_id: currentClub.clubId,
          dismissed_at: new Date().toISOString(),
          dismissed_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_id' });

      setIsDismissed(true);
    } catch (error) {
      console.error('Error dismissing setup checklist:', error);
    }
  }, [currentClub?.clubId, user?.id]);

  const completeAll = useCallback(async () => {
    if (!currentClub?.clubId || !user?.id) return;

    const allTaskIds = SETUP_TASKS.flatMap(cat => cat.tasks.map(t => t.id));

    setCompletedTaskIds(allTaskIds);
    setCategories(prev =>
      prev.map(cat => ({
        ...cat,
        tasks: cat.tasks.map(t => ({ ...t, completed: true })),
        completedCount: cat.totalCount,
      }))
    );

    try {
      await supabase
        .from('club_setup_checklists')
        .upsert({
          club_id: currentClub.clubId,
          completed_tasks: allTaskIds,
          dismissed_at: new Date().toISOString(),
          dismissed_by: user.id,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'club_id' });

      setIsDismissed(true);
    } catch (error) {
      console.error('Error completing all tasks:', error);
      checkSetupStatus();
    }
  }, [currentClub?.clubId, user?.id, checkSetupStatus]);

  const totalTasks = categories.reduce((sum, cat) => sum + cat.totalCount, 0);
  const completedTaskCount = categories.reduce((sum, cat) => sum + cat.completedCount, 0);
  const progressPercent = totalTasks > 0 ? Math.round((completedTaskCount / totalTasks) * 100) : 0;
  const isFullyComplete = totalTasks > 0 && completedTaskCount === totalTasks;

  return {
    categories,
    totalTasks,
    completedTasks: completedTaskCount,
    progressPercent,
    isFullyComplete,
    isDismissed,
    loading,
    refresh: checkSetupStatus,
    dismiss,
    toggleTask,
    completeAll,
  };
}
