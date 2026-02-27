import React, { useState, useEffect } from 'react';
import { CreditCard, X, Clock, CheckCircle, AlertCircle, Receipt, ChevronDown, ChevronUp, Users, Calendar, ExternalLink } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';
import { supabase } from '../../../utils/supabase';
import { useWidgetTheme } from './ThemedWidgetWrapper';
import { useNavigate } from 'react-router-dom';

interface PlatformBillingWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface BillingRecord {
  id: string;
  billing_period_start: string;
  billing_period_end: string;
  member_count: number;
  rate_per_member: number;
  annual_rate: number | null;
  total_amount: number;
  payment_status: string;
  due_date: string | null;
  created_at: string;
}

interface BillingRate {
  id: string;
  name: string;
  annual_rate: number | null;
  rate_per_member: number;
}

export const PlatformBillingWidget: React.FC<PlatformBillingWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentOrganization } = useAuth();
  const { type, stateAssociationId, nationalAssociationId } = useOrganizationContext();
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [currentRate, setCurrentRate] = useState<BillingRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const themeColors = useWidgetTheme(colorTheme);
  const navigate = useNavigate();

  const associationId = type === 'state' ? stateAssociationId : nationalAssociationId;
  const targetType = type === 'state' ? 'state_association' : 'national_association';

  useEffect(() => {
    if (!associationId) return;
    loadBillingData();
  }, [associationId, targetType]);

  const loadBillingData = async () => {
    try {
      const [recordsRes, ratesRes] = await Promise.all([
        supabase
          .from('platform_billing_records')
          .select('*')
          .eq('target_type', targetType)
          .eq('target_id', associationId)
          .order('billing_period_start', { ascending: false })
          .limit(12),
        supabase
          .from('platform_billing_rates')
          .select('*')
          .eq('billing_target', targetType)
          .eq('is_active', true)
          .or(`target_entity_id.is.null,target_entity_id.eq.${associationId}`)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      setRecords(recordsRes.data || []);
      setCurrentRate(ratesRes.data?.[0] || null);
    } catch (err) {
      console.error('Error loading billing:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = records
    .filter(r => ['pending', 'invoiced', 'overdue'].includes(r.payment_status))
    .reduce((sum, r) => sum + r.total_amount, 0);

  const totalPaid = records
    .filter(r => r.payment_status === 'paid')
    .reduce((sum, r) => sum + r.total_amount, 0);

  const overdueCount = records.filter(r => r.payment_status === 'overdue').length;

  const fmt = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusConfig: Record<string, { icon: typeof Clock; color: string; bg: string; label: string }> = {
    pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Pending' },
    invoiced: { icon: Receipt, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Invoiced' },
    paid: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Paid' },
    overdue: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Overdue' },
    waived: { icon: Receipt, color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'Waived' },
  };

  if (!associationId || (type !== 'state' && type !== 'national')) {
    return null;
  }

  return (
    <div className="relative w-full h-full">
      {isEditMode && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
          className="absolute -top-2 -right-2 z-[60] bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg transition-colors pointer-events-auto"
        >
          <X size={16} />
        </button>
      )}
      <div className={`relative rounded-2xl p-5 w-full h-full border backdrop-blur-sm ${themeColors.background} overflow-hidden`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/20">
              <CreditCard className="text-sky-400" size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Platform Fees</h3>
              <p className="text-xs text-slate-500">AlfiePRO subscription billing</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/finances/subscription')}
            className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors"
            title="View full billing details"
          >
            <ExternalLink size={14} className="text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-6">
            <Receipt size={28} className="mx-auto mb-2 text-slate-600" />
            <p className="text-sm text-slate-500">No billing records yet</p>
            <p className="text-xs text-slate-600 mt-1">Records appear once platform billing is generated</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-700/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Outstanding</p>
                <p className={`text-lg font-bold ${overdueCount > 0 ? 'text-red-400' : totalOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {fmt(totalOutstanding)}
                </p>
                {overdueCount > 0 && (
                  <p className="text-[10px] text-red-400 mt-0.5">{overdueCount} overdue</p>
                )}
              </div>
              <div className="rounded-xl bg-slate-700/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Paid</p>
                <p className="text-lg font-bold text-emerald-400">{fmt(totalPaid)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{records.filter(r => r.payment_status === 'paid').length} periods</p>
              </div>
              <div className="rounded-xl bg-slate-700/30 p-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Rate</p>
                <p className="text-lg font-bold text-sky-400">
                  {currentRate ? fmt(currentRate.annual_rate || currentRate.rate_per_member) : 'N/A'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">per member/year</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Recent Billing</p>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {records.slice(0, 6).map(record => {
                  const config = statusConfig[record.payment_status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  const isExpanded = expandedRecord === record.id;

                  return (
                    <div key={record.id}>
                      <div
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-700/20 hover:bg-slate-700/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg ${config.bg}`}>
                            <StatusIcon size={12} className={config.color} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white">
                              {new Date(record.billing_period_start).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span className="flex items-center gap-0.5">
                                <Users size={9} />
                                {record.member_count}
                              </span>
                              <span>x {fmt(record.rate_per_member)}/mo</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-white">{fmt(record.total_amount)}</p>
                            <span className={`text-[10px] ${config.color}`}>{config.label}</span>
                          </div>
                          {isExpanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ml-9 mt-1 mb-1 p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-slate-500 block">Period</span>
                              <span className="text-slate-300">
                                {new Date(record.billing_period_start).toLocaleDateString('en-AU')} - {new Date(record.billing_period_end).toLocaleDateString('en-AU')}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Calculation</span>
                              <span className="text-slate-300">
                                {record.member_count} members x {fmt(record.rate_per_member)}/mo
                              </span>
                            </div>
                            {record.annual_rate && (
                              <div>
                                <span className="text-slate-500 block">Annual Rate</span>
                                <span className="text-slate-300">{fmt(record.annual_rate)}/member/year</span>
                              </div>
                            )}
                            {record.due_date && (
                              <div>
                                <span className="text-slate-500 block">Due Date</span>
                                <span className={`${new Date(record.due_date) < new Date() && record.payment_status !== 'paid' ? 'text-red-400' : 'text-slate-300'}`}>
                                  {new Date(record.due_date).toLocaleDateString('en-AU')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {records.length > 6 && (
              <button
                onClick={() => navigate('/finances/subscription')}
                className="w-full text-center text-xs text-sky-400 hover:text-sky-300 transition-colors py-1"
              >
                View all {records.length} billing records
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
