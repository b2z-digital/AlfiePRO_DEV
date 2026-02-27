import React, { useState, useEffect } from 'react';
import { Users, DollarSign } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { ThemedWidgetWrapper } from './ThemedWidgetWrapper';
import { formatCurrency } from '../../../utils/formatCurrency';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';

interface MembershipIncomeWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

export const MembershipIncomeWidget: React.FC<MembershipIncomeWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const { type, stateAssociationId, nationalAssociationId } = useOrganizationContext();
  const [loading, setLoading] = useState(true);
  const [membershipIncome, setMembershipIncome] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);

  useEffect(() => {
    loadMembershipIncome();
  }, [currentClub, type, stateAssociationId, nationalAssociationId]);

  const loadMembershipIncome = async () => {
    try {
      let totalIncome = 0;
      let totalPending = 0;

      if (type === 'state' && stateAssociationId) {
        const { data: incomeData } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .ilike('description', '%membership%');

        const { data: pendingData } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', stateAssociationId)
          .eq('association_type', 'state')
          .eq('type', 'income')
          .in('payment_status', ['pending', 'unpaid'])
          .ilike('description', '%membership%');

        totalIncome = incomeData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        totalPending = pendingData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      } else if (type === 'national' && nationalAssociationId) {
        const { data: incomeData } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'income')
          .eq('payment_status', 'completed')
          .ilike('description', '%membership%');

        const { data: pendingData } = await supabase
          .from('association_transactions')
          .select('amount')
          .eq('association_id', nationalAssociationId)
          .eq('association_type', 'national')
          .eq('type', 'income')
          .in('payment_status', ['pending', 'unpaid'])
          .ilike('description', '%membership%');

        totalIncome = incomeData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
        totalPending = pendingData?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      } else if (currentClub?.clubId) {
        const { data: paidMembers } = await supabase
          .from('members')
          .select('membership_fee')
          .eq('club_id', currentClub.clubId)
          .eq('payment_status', 'paid');

        const { data: unpaidMembers } = await supabase
          .from('members')
          .select('membership_fee')
          .eq('club_id', currentClub.clubId)
          .in('payment_status', ['unpaid', 'pending']);

        totalIncome = paidMembers?.reduce((sum, m) => sum + (m.membership_fee || 0), 0) || 0;
        totalPending = unpaidMembers?.reduce((sum, m) => sum + (m.membership_fee || 0), 0) || 0;
      }

      setMembershipIncome(totalIncome);
      setPendingPayments(totalPending);
    } catch (error) {
      console.error('Error loading membership income:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedWidgetWrapper
      title="Membership Income"
      icon={Users}
      isEditMode={isEditMode}
      onRemove={onRemove}
      loading={loading}
      colorTheme={colorTheme}
    >
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-xs text-slate-400 mb-1">Collected</div>
          <div className="text-2xl font-bold text-white">
            ${formatCurrency(membershipIncome)}
          </div>
        </div>
        {pendingPayments > 0 && (
          <div className="pt-2 border-t border-slate-700/50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Pending</span>
              <span className="text-yellow-400 font-semibold">
                ${formatCurrency(pendingPayments)}
              </span>
            </div>
          </div>
        )}
      </div>
    </ThemedWidgetWrapper>
  );
};
