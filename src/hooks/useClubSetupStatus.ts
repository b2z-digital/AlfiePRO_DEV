import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

export interface SetupTask {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  route: string;
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
}

export function useClubSetupStatus(): ClubSetupStatus {
  const { currentClub, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [categories, setCategories] = useState<SetupCategory[]>([]);

  const checkSetupStatus = useCallback(async () => {
    if (!currentClub?.clubId || !navigator.onLine) {
      setLoading(false);
      return;
    }

    try {
      const clubId = currentClub.clubId;

      const [
        checklistResult,
        membershipTypesResult,
        clubResult,
        financeSettingsResult,
        budgetCategoriesResult,
        membersResult,
        committeeResult,
      ] = await Promise.all([
        supabase
          .from('club_setup_checklists')
          .select('dismissed_at')
          .eq('club_id', clubId)
          .maybeSingle(),
        supabase
          .from('membership_types')
          .select('id, name, requires_association_fees')
          .eq('club_id', clubId)
          .eq('is_active', true),
        supabase
          .from('clubs')
          .select('renewal_mode, code_of_conduct')
          .eq('id', clubId)
          .maybeSingle(),
        supabase
          .from('club_finance_settings')
          .select('payment_information, opening_balance, opening_balance_date')
          .eq('club_id', clubId)
          .maybeSingle(),
        supabase
          .from('budget_categories')
          .select('id, type, is_system')
          .eq('club_id', clubId)
          .eq('is_active', true),
        supabase
          .from('members')
          .select('id')
          .eq('club_id', clubId)
          .limit(1),
        supabase
          .from('committee_positions')
          .select('id')
          .eq('club_id', clubId)
          .limit(1),
      ]);

      if (checklistResult.data?.dismissed_at) {
        setIsDismissed(true);
        setLoading(false);
        return;
      }

      const membershipTypes = membershipTypesResult.data || [];
      const club = clubResult.data;
      const financeSettings = financeSettingsResult.data;
      const budgetCategories = budgetCategoriesResult.data || [];
      const members = membersResult.data || [];
      const committee = committeeResult.data || [];

      const hasMembershipTypes = membershipTypes.length > 0;
      const hasRenewalSettings = !!club?.renewal_mode;
      const hasCodeOfConduct = !!club?.code_of_conduct && club.code_of_conduct.trim().length > 20;

      const customCategories = budgetCategories.filter(c => !c.is_system);
      const hasFinanceCategories = customCategories.length >= 1;
      const hasBankDetails = !!financeSettings?.payment_information && financeSettings.payment_information.trim().length > 0;
      const hasOpeningBalance = financeSettings?.opening_balance !== null && financeSettings?.opening_balance !== undefined;

      const hasMembers = members.length > 0;
      const hasCommittee = committee.length > 0;

      const membershipCategory: SetupCategory = {
        id: 'membership',
        title: 'Set Up Membership',
        icon: 'users',
        tasks: [
          {
            id: 'membership-types',
            label: 'Create Membership Types',
            description: 'Define your membership categories (e.g. Full, Associate, Junior)',
            completed: hasMembershipTypes,
            route: '/settings/membership',
          },
          {
            id: 'renewal-settings',
            label: 'Set Membership Renewal Settings',
            description: 'Configure how and when memberships renew',
            completed: hasRenewalSettings,
            route: '/settings/membership',
          },
          {
            id: 'code-of-conduct',
            label: 'Update Code of Conduct',
            description: 'Add your club\'s code of conduct for new members',
            completed: hasCodeOfConduct,
            route: '/settings/membership',
          },
        ],
        completedCount: 0,
        totalCount: 3,
      };
      membershipCategory.completedCount = membershipCategory.tasks.filter(t => t.completed).length;

      const financeCategory: SetupCategory = {
        id: 'finance',
        title: 'Set Up Club Finances',
        icon: 'dollar-sign',
        tasks: [
          {
            id: 'finance-categories',
            label: 'Set Up Finance Categories',
            description: 'Create income and expense categories for tracking',
            completed: hasFinanceCategories,
            route: '/settings/finance',
          },
          {
            id: 'bank-details',
            label: 'Add Bank Details',
            description: 'Add your bank account details for invoices and payments',
            completed: hasBankDetails,
            route: '/settings/finance',
          },
          {
            id: 'opening-balance',
            label: 'Add Club\'s Opening Balance',
            description: 'Set your starting bank balance for accurate reporting',
            completed: hasOpeningBalance,
            route: '/settings/finance',
          },
        ],
        completedCount: 0,
        totalCount: 3,
      };
      financeCategory.completedCount = financeCategory.tasks.filter(t => t.completed).length;

      const membersCategory: SetupCategory = {
        id: 'members',
        title: 'Set Up Club Members',
        icon: 'user-plus',
        tasks: [
          {
            id: 'create-members',
            label: 'Create or Import Club Members',
            description: 'Add members manually or import from a CSV file',
            completed: hasMembers,
            route: '/members',
          },
          {
            id: 'committee-members',
            label: 'Add Committee Members',
            description: 'Assign committee roles to your club members',
            completed: hasCommittee,
            route: '/settings/committee',
          },
        ],
        completedCount: 0,
        totalCount: 2,
      };
      membersCategory.completedCount = membersCategory.tasks.filter(t => t.completed).length;

      const allCategories = [membershipCategory, financeCategory, membersCategory];
      setCategories(allCategories);
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

  const totalTasks = categories.reduce((sum, cat) => sum + cat.totalCount, 0);
  const completedTasks = categories.reduce((sum, cat) => sum + cat.completedCount, 0);
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const isFullyComplete = totalTasks > 0 && completedTasks === totalTasks;

  return {
    categories,
    totalTasks,
    completedTasks,
    progressPercent,
    isFullyComplete,
    isDismissed,
    loading,
    refresh: checkSetupStatus,
    dismiss,
  };
}
