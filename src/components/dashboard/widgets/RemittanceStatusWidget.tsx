import React, { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';
import { supabase } from '../../../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatCurrency';

interface RemittanceStatusWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface RemittanceStats {
  totalOwing: number;
  overdue: number;
  dueThisMonth: number;
  pending: number;
}

export const RemittanceStatusWidget: React.FC<RemittanceStatusWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RemittanceStats>({
    totalOwing: 0,
    overdue: 0,
    dueThisMonth: 0,
    pending: 0
  });

  useEffect(() => {
    loadRemittanceStats();
  }, [currentClub, currentOrganization]);

  const loadRemittanceStats = async () => {
    try {
      console.log('📊 Loading remittance stats', {
        currentOrg: currentOrganization,
        currentClub: currentClub?.clubId
      });

      let remittances;

      // Check if viewing as State Association
      if (currentOrganization?.type === 'state') {
        console.log('📍 Loading remittances for State Association:', currentOrganization.id);

        // Get all clubs under this state association
        const { data: clubs, error: clubsError } = await supabase
          .from('clubs')
          .select('id')
          .eq('state_association_id', currentOrganization.id);

        if (clubsError) {
          console.error('Error fetching clubs:', clubsError);
          throw clubsError;
        }

        console.log(`🏢 Found ${clubs?.length || 0} clubs in state association`);

        if (!clubs || clubs.length === 0) {
          // No clubs under this state association
          setStats({
            totalOwing: 0,
            overdue: 0,
            dueThisMonth: 0,
            pending: 0
          });
          return;
        }

        const clubIds = clubs.map(c => c.id);

        // Get remittances from ALL clubs in the state association
        const { data, error } = await supabase
          .from('membership_remittances')
          .select('state_contribution_amount, membership_end_date, club_to_state_status, club_id')
          .in('club_id', clubIds)
          .neq('club_to_state_status', 'paid');

        if (error) throw error;
        remittances = data;

        console.log(`💰 Found ${remittances?.length || 0} unpaid remittances across all clubs`);

      } else if (currentOrganization?.type === 'national') {
        console.log('📍 Loading remittances for National Association:', currentOrganization.id);

        // Get ALL remittances from ALL clubs in the nation
        const { data, error } = await supabase
          .from('membership_remittances')
          .select('national_contribution_amount, membership_end_date, state_to_national_status, club_id')
          .neq('state_to_national_status', 'paid');

        if (error) throw error;
        remittances = data;

        console.log(`💰 Found ${remittances?.length || 0} unpaid remittances nationally`);

      } else if (currentClub?.clubId) {
        console.log('📍 Loading remittances for single club:', currentClub.clubId);

        // Get remittances for this specific club only
        const { data, error } = await supabase
          .from('membership_remittances')
          .select('state_contribution_amount, membership_end_date, club_to_state_status')
          .eq('club_id', currentClub.clubId)
          .neq('club_to_state_status', 'paid');

        if (error) throw error;
        remittances = data;

        console.log(`💰 Found ${remittances?.length || 0} unpaid remittances for club`);

      } else {
        console.log('⚠️ No organization or club context available');
        setStats({
          totalOwing: 0,
          overdue: 0,
          dueThisMonth: 0,
          pending: 0
        });
        return;
      }

      // Calculate statistics
      if (remittances) {
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        let totalOwing = 0;
        let overdue = 0;
        let dueThisMonth = 0;
        let pending = 0;

        remittances.forEach((r: any) => {
          // Use the appropriate amount field based on organization type
          const amount = currentOrganization?.type === 'national'
            ? Number(r.national_contribution_amount) || 0
            : Number(r.state_contribution_amount) || 0;
          totalOwing += amount;

          // Check payment status based on organization type
          const paymentStatus = currentOrganization?.type === 'national'
            ? r.state_to_national_status
            : r.club_to_state_status;

          if (paymentStatus === 'pending') {
            pending += amount;
          }

          // Use membership_end_date as the "due date"
          if (r.membership_end_date) {
            const dueDate = new Date(r.membership_end_date);
            if (dueDate < now) {
              overdue += amount;
            } else if (dueDate <= endOfMonth) {
              dueThisMonth += amount;
            }
          }
        });

        console.log('📈 Calculated stats:', {
          totalOwing,
          overdue,
          dueThisMonth,
          pending
        });

        setStats({
          totalOwing,
          overdue,
          dueThisMonth,
          pending
        });
      }
    } catch (error) {
      console.error('❌ Error loading remittance stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) {
      // Route to association remittances for state/national orgs, otherwise membership
      if (currentOrganization?.type === 'state' || currentOrganization?.type === 'national') {
        navigate('/association-remittances');
      } else {
        navigate('/membership?tab=remittances');
      }
    }
  };

  const hasIssues = stats.overdue > 0 || stats.dueThisMonth > 0;

  return (
    <div className="h-full rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative">
      {isEditMode && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors z-10"
          title="Remove widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-emerald-600/20">
          <DollarSign className="text-emerald-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Association Remittances</h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Total Owing */}
          <div
            onClick={handleNavigate}
            className={`p-4 rounded-lg bg-slate-800/50 border border-slate-700/30 ${
              !isEditMode && stats.totalOwing > 0 ? 'hover:bg-slate-700/30 cursor-pointer' : ''
            } ${isEditMode ? 'cursor-default' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Total Owing</span>
              <DollarSign className="text-emerald-400" size={16} />
            </div>
            <div className="text-2xl font-bold text-white">
              ${formatCurrency(stats.totalOwing)}
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            {/* Overdue */}
            <div className={`p-3 rounded-lg border ${
              stats.overdue > 0
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-slate-800/50 border-slate-700/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={stats.overdue > 0 ? 'text-red-400' : 'text-slate-500'} size={16} />
                <span className="text-xs text-slate-400">Overdue</span>
              </div>
              <div className={`text-lg font-bold ${
                stats.overdue > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                ${formatCurrency(stats.overdue)}
              </div>
            </div>

            {/* Due This Month */}
            <div className={`p-3 rounded-lg border ${
              stats.dueThisMonth > 0
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-slate-800/50 border-slate-700/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className={stats.dueThisMonth > 0 ? 'text-yellow-400' : 'text-slate-500'} size={16} />
                <span className="text-xs text-slate-400">Due Soon</span>
              </div>
              <div className={`text-lg font-bold ${
                stats.dueThisMonth > 0 ? 'text-yellow-400' : 'text-slate-400'
              }`}>
                ${formatCurrency(stats.dueThisMonth)}
              </div>
            </div>

            {/* Pending */}
            <div className="p-3 rounded-lg border bg-slate-800/50 border-slate-700/30 col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-blue-400" size={16} />
                  <span className="text-xs text-slate-400">Pending Reconciliation</span>
                </div>
                <div className="text-lg font-bold text-blue-400">
                  ${formatCurrency(stats.pending)}
                </div>
              </div>
            </div>
          </div>

          {!hasIssues && stats.totalOwing === 0 && (
            <div className="text-center py-2 text-sm text-green-400 flex items-center justify-center gap-2">
              <CheckCircle size={16} />
              All remittances paid
            </div>
          )}
        </div>
      )}
    </div>
  );
};
