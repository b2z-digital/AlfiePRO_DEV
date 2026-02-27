import React, { useState, useEffect } from 'react';
import { ArrowRight, ArrowDown, Building2, Landmark, Globe, CheckCircle, Clock, AlertTriangle, DollarSign } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';
import { supabase } from '../../../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatCurrency';

interface RemittancePaymentFlowWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface FlowStats {
  receivedFromClubs: number;
  receivedFromClubsCount: number;
  pendingFromClubs: number;
  pendingFromClubsCount: number;
  paidToNational: number;
  paidToNationalCount: number;
  owingToNational: number;
  owingToNationalCount: number;
  recentPayments: { clubName: string; amount: number; date: string; type: 'received' | 'paid_national' }[];
}

export const RemittancePaymentFlowWidget: React.FC<RemittancePaymentFlowWidgetProps> = ({
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
  const [stats, setStats] = useState<FlowStats>({
    receivedFromClubs: 0,
    receivedFromClubsCount: 0,
    pendingFromClubs: 0,
    pendingFromClubsCount: 0,
    paidToNational: 0,
    paidToNationalCount: 0,
    owingToNational: 0,
    owingToNationalCount: 0,
    recentPayments: []
  });

  useEffect(() => {
    loadFlowStats();
  }, [currentClub, currentOrganization]);

  const loadFlowStats = async () => {
    try {
      if (currentOrganization?.type !== 'state') {
        setLoading(false);
        return;
      }

      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name')
        .eq('state_association_id', currentOrganization.id);

      if (!clubs || clubs.length === 0) {
        setLoading(false);
        return;
      }

      const clubMap = new Map(clubs.map(c => [c.id, c.name]));
      const clubIds = clubs.map(c => c.id);

      const { data: remittances, error } = await supabase
        .from('membership_remittances')
        .select('id, club_id, state_contribution_amount, national_contribution_amount, club_to_state_status, state_to_national_status, created_at, updated_at')
        .in('club_id', clubIds);

      if (error) throw error;

      let receivedFromClubs = 0;
      let receivedFromClubsCount = 0;
      let pendingFromClubs = 0;
      let pendingFromClubsCount = 0;
      let paidToNational = 0;
      let paidToNationalCount = 0;
      let owingToNational = 0;
      let owingToNationalCount = 0;
      const recentPayments: FlowStats['recentPayments'] = [];

      (remittances || []).forEach((r: any) => {
        const stateAmount = Number(r.state_contribution_amount) || 0;
        const nationalAmount = Number(r.national_contribution_amount) || 0;

        if (r.club_to_state_status === 'paid') {
          receivedFromClubs += stateAmount;
          receivedFromClubsCount++;
        } else {
          pendingFromClubs += stateAmount;
          pendingFromClubsCount++;
        }

        if (r.state_to_national_status === 'paid') {
          paidToNational += nationalAmount;
          paidToNationalCount++;
        } else if (r.club_to_state_status === 'paid') {
          owingToNational += nationalAmount;
          owingToNationalCount++;
        }
      });

      const sortedByDate = [...(remittances || [])]
        .filter((r: any) => r.club_to_state_status === 'paid' || r.state_to_national_status === 'paid')
        .sort((a: any, b: any) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
        .slice(0, 5);

      sortedByDate.forEach((r: any) => {
        const clubName = clubMap.get(r.club_id) || 'Unknown Club';
        if (r.state_to_national_status === 'paid') {
          recentPayments.push({
            clubName,
            amount: Number(r.national_contribution_amount) || 0,
            date: r.updated_at || r.created_at,
            type: 'paid_national'
          });
        } else if (r.club_to_state_status === 'paid') {
          recentPayments.push({
            clubName,
            amount: Number(r.state_contribution_amount) || 0,
            date: r.updated_at || r.created_at,
            type: 'received'
          });
        }
      });

      setStats({
        receivedFromClubs,
        receivedFromClubsCount,
        pendingFromClubs,
        pendingFromClubsCount,
        paidToNational,
        paidToNationalCount,
        owingToNational,
        owingToNationalCount,
        recentPayments
      });
    } catch (error) {
      console.error('Error loading payment flow stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) {
      navigate('/association-remittances');
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="h-full min-h-[32rem] rounded-xl border backdrop-blur-sm p-5 bg-slate-800/30 border-slate-700/50 relative flex flex-col">
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

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-emerald-600/20">
          <DollarSign className="text-emerald-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Payment Flow</h3>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 items-center">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/15 mb-1">
                <Building2 size={18} className="text-blue-400" />
              </div>
              <p className="text-[11px] font-medium text-slate-400">Clubs</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15 mb-1">
                <Landmark size={18} className="text-emerald-400" />
              </div>
              <p className="text-[11px] font-medium text-slate-400">State</p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/15 mb-1">
                <Globe size={18} className="text-amber-400" />
              </div>
              <p className="text-[11px] font-medium text-slate-400">National</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle size={16} className="text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-emerald-300/80">Received from Clubs</p>
                <p className="text-lg font-bold text-emerald-300">${formatCurrency(stats.receivedFromClubs)}</p>
              </div>
              <span className="text-xs text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                {stats.receivedFromClubsCount}
              </span>
            </div>

            {stats.pendingFromClubs > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Clock size={16} className="text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-300/80">Pending from Clubs</p>
                  <p className="text-lg font-bold text-amber-300">${formatCurrency(stats.pendingFromClubs)}</p>
                </div>
                <span className="text-xs text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">
                  {stats.pendingFromClubsCount}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center py-1">
            <ArrowDown size={16} className="text-slate-500" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <CheckCircle size={16} className="text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-300/80">Paid to National</p>
                <p className="text-lg font-bold text-blue-300">${formatCurrency(stats.paidToNational)}</p>
              </div>
              <span className="text-xs text-blue-400/70 bg-blue-500/10 px-2 py-0.5 rounded-full shrink-0">
                {stats.paidToNationalCount}
              </span>
            </div>

            {stats.owingToNational > 0 && (
              <div
                onClick={handleNavigate}
                className={`flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 ${!isEditMode ? 'cursor-pointer hover:bg-red-500/15 transition-colors' : ''}`}
              >
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-300/80">Owing to National</p>
                  <p className="text-lg font-bold text-red-300">${formatCurrency(stats.owingToNational)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-red-400/70 bg-red-500/10 px-2 py-0.5 rounded-full">
                    {stats.owingToNationalCount}
                  </span>
                  {!isEditMode && <ArrowRight size={14} className="text-red-400/60" />}
                </div>
              </div>
            )}
          </div>

          {stats.recentPayments.length > 0 && (
            <div className="mt-1 pt-3 border-t border-slate-700/50">
              <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Recent Activity</p>
              <div className="space-y-1.5">
                {stats.recentPayments.slice(0, 4).map((payment, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        payment.type === 'received' ? 'bg-emerald-400' : 'bg-blue-400'
                      }`} />
                      <span className="text-slate-400 truncate">{payment.clubName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-medium ${
                        payment.type === 'received' ? 'text-emerald-400' : 'text-blue-400'
                      }`}>
                        ${formatCurrency(payment.amount)}
                      </span>
                      <span className="text-slate-500 text-[10px]">{formatDate(payment.date)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.receivedFromClubs === 0 && stats.pendingFromClubs === 0 && stats.paidToNational === 0 && (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
              No remittance data yet
            </div>
          )}
        </div>
      )}
    </div>
  );
};
