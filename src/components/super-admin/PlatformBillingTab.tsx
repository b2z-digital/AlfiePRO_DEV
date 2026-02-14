import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Plus, Edit2, Check,
  X, Clock, AlertCircle, CheckCircle, Receipt, Coins,
  Calendar, RefreshCw, ChevronDown, ChevronUp, Users, Building2, Globe2, Target
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

interface PlatformBillingTabProps {
  darkMode: boolean;
}

interface BillingRate {
  id: string;
  name: string;
  rate_per_member: number;
  annual_rate: number | null;
  billing_target: string;
  billing_frequency: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  target_entity_id: string | null;
  target_entity_name: string | null;
}

interface BillingRecord {
  id: string;
  billing_rate_id: string;
  billing_period_id: string | null;
  target_type: string;
  target_id: string;
  target_name: string;
  billing_period_start: string;
  billing_period_end: string;
  member_count: number;
  rate_per_member: number;
  annual_rate: number | null;
  total_amount: number;
  payment_status: string;
  payment_date: string | null;
  payment_reference: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

interface BillingPeriod {
  id: string;
  period_start: string;
  period_end: string;
  billing_frequency: string;
  status: string;
  generated_at: string | null;
  finalized_at: string | null;
  total_records: number;
  total_amount: number;
  notes: string | null;
}

interface EntityOption {
  id: string;
  name: string;
}

export function PlatformBillingTab({ darkMode }: PlatformBillingTabProps) {
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [periods, setPeriods] = useState<BillingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRateForm, setShowRateForm] = useState(false);
  const [editingRate, setEditingRate] = useState<BillingRate | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'rates' | 'records' | 'periods'>('overview');
  const [generating, setGenerating] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [periodRecords, setPeriodRecords] = useState<Record<string, BillingRecord[]>>({});
  const [targetMode, setTargetMode] = useState<'all' | 'specific'>('all');
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);

  const defaultRateForm = {
    name: '',
    rate_per_member: 0,
    annual_rate: 0,
    billing_target: 'state_association',
    billing_frequency: 'monthly',
    effective_from: new Date().toISOString().split('T')[0],
    notes: '',
    target_entity_id: null as string | null,
    target_entity_name: null as string | null,
  };

  const [rateForm, setRateForm] = useState(defaultRateForm);

  const loadBillingData = useCallback(async () => {
    try {
      const [ratesRes, recordsRes, periodsRes] = await Promise.all([
        supabase.from('platform_billing_rates').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_billing_records').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_billing_periods').select('*').order('period_start', { ascending: false }),
      ]);

      setRates(ratesRes.data || []);
      setRecords(recordsRes.data || []);
      setPeriods(periodsRes.data || []);
    } catch (err) {
      console.error('Error loading billing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBillingData();
  }, [loadBillingData]);

  const loadEntityOptions = useCallback(async (target: string) => {
    const table = target === 'club' ? 'clubs'
      : target === 'state_association' ? 'state_associations'
      : 'national_associations';
    const { data } = await supabase.from(table).select('id, name').order('name');
    setEntityOptions(data || []);
  }, []);

  useEffect(() => {
    if (targetMode === 'specific' && showRateForm) {
      loadEntityOptions(rateForm.billing_target);
    }
  }, [rateForm.billing_target, targetMode, showRateForm, loadEntityOptions]);

  const saveRate = async () => {
    try {
      const annualRate = rateForm.annual_rate > 0
        ? rateForm.annual_rate
        : rateForm.billing_frequency === 'monthly' ? rateForm.rate_per_member * 12
        : rateForm.billing_frequency === 'quarterly' ? rateForm.rate_per_member * 4
        : rateForm.rate_per_member;

      const payload = {
        name: rateForm.name,
        rate_per_member: rateForm.rate_per_member,
        annual_rate: annualRate,
        billing_target: rateForm.billing_target,
        billing_frequency: rateForm.billing_frequency,
        effective_from: rateForm.effective_from,
        notes: rateForm.notes || null,
        target_entity_id: targetMode === 'specific' ? rateForm.target_entity_id : null,
        target_entity_name: targetMode === 'specific' ? rateForm.target_entity_name : null,
        updated_at: new Date().toISOString(),
      };

      if (editingRate) {
        await supabase
          .from('platform_billing_rates')
          .update(payload)
          .eq('id', editingRate.id);
      } else {
        await supabase.from('platform_billing_rates').insert(payload);
      }
      resetRateForm();
      loadBillingData();
    } catch (err) {
      console.error('Error saving rate:', err);
    }
  };

  const resetRateForm = () => {
    setShowRateForm(false);
    setEditingRate(null);
    setTargetMode('all');
    setRateForm(defaultRateForm);
  };

  const generateBillingRecords = async () => {
    try {
      setGenerating(true);
      const { data: session } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-platform-billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({ month: generateMonth }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      loadBillingData();
    } catch (err) {
      console.error('Error generating billing:', err);
    } finally {
      setGenerating(false);
    }
  };

  const loadPeriodRecords = async (periodId: string) => {
    if (periodRecords[periodId]) {
      setExpandedPeriod(expandedPeriod === periodId ? null : periodId);
      return;
    }
    const { data } = await supabase
      .from('platform_billing_records')
      .select('*')
      .eq('billing_period_id', periodId)
      .order('target_name');
    setPeriodRecords(prev => ({ ...prev, [periodId]: data || [] }));
    setExpandedPeriod(periodId);
  };

  const finalizePeriod = async (periodId: string) => {
    await supabase
      .from('platform_billing_periods')
      .update({ status: 'finalized', finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', periodId);
    loadBillingData();
  };

  const updateRecordStatus = async (recordId: string, status: string) => {
    await supabase
      .from('platform_billing_records')
      .update({
        payment_status: status,
        payment_date: status === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId);
    loadBillingData();
  };

  const totalBilled = records.reduce((sum, r) => sum + r.total_amount, 0);
  const totalPaid = records.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + r.total_amount, 0);
  const totalPending = records.filter(r => r.payment_status === 'pending').reduce((sum, r) => sum + r.total_amount, 0);
  const totalOverdue = records.filter(r => r.payment_status === 'overdue').reduce((sum, r) => sum + r.total_amount, 0);

  const chartColors = {
    text: darkMode ? '#94a3b8' : '#64748b',
    tooltipBg: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: darkMode ? '#e2e8f0' : '#334155',
    tooltipBorder: darkMode ? 'rgba(51, 65, 85, 0.5)' : 'rgba(203, 213, 225, 0.5)',
  };

  const paymentStatusData = {
    labels: ['Paid', 'Pending', 'Overdue', 'Invoiced', 'Waived'],
    datasets: [{
      data: [
        records.filter(r => r.payment_status === 'paid').length,
        records.filter(r => r.payment_status === 'pending').length,
        records.filter(r => r.payment_status === 'overdue').length,
        records.filter(r => r.payment_status === 'invoiced').length,
        records.filter(r => r.payment_status === 'waived').length,
      ],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#94a3b8'],
      borderWidth: 0,
    }],
  };

  const monthlyTrendData = {
    labels: periods.slice(0, 6).reverse().map(p =>
      new Date(p.period_start).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
    ),
    datasets: [{
      label: 'Billed Amount',
      data: periods.slice(0, 6).reverse().map(p => p.total_amount),
      backgroundColor: darkMode ? 'rgba(14, 165, 233, 0.6)' : 'rgba(14, 165, 233, 0.8)',
      borderRadius: 6,
    }],
  };

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
    paid: { icon: CheckCircle, color: 'text-emerald-500', bg: darkMode ? 'bg-emerald-500/15' : 'bg-emerald-50' },
    pending: { icon: Clock, color: 'text-amber-500', bg: darkMode ? 'bg-amber-500/15' : 'bg-amber-50' },
    overdue: { icon: AlertCircle, color: 'text-red-500', bg: darkMode ? 'bg-red-500/15' : 'bg-red-50' },
    invoiced: { icon: Receipt, color: 'text-sky-500', bg: darkMode ? 'bg-sky-500/15' : 'bg-sky-50' },
    waived: { icon: X, color: 'text-slate-400', bg: darkMode ? 'bg-slate-700/50' : 'bg-slate-100' },
  };

  const periodStatusConfig: Record<string, { color: string; bg: string }> = {
    draft: { color: 'text-slate-400', bg: 'bg-slate-500/15' },
    generating: { color: 'text-amber-400', bg: 'bg-amber-500/15' },
    generated: { color: 'text-sky-400', bg: 'bg-sky-500/15' },
    finalized: { color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    cancelled: { color: 'text-red-400', bg: 'bg-red-500/15' },
  };

  const targetLabel = (target: string) => {
    if (target === 'club') return 'Clubs';
    if (target === 'state_association') return 'State Associations';
    return 'National Associations';
  };

  const targetIcon = (target: string) => {
    if (target === 'club') return Building2;
    if (target === 'state_association') return Globe2;
    return Globe2;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <DollarSign className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Platform Billing</h1>
            <p className="text-sm text-slate-400">Fee management and billing records</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Billed', value: formatCurrency(totalBilled), icon: Coins, color: 'sky', sub: `${records.length} records` },
          { label: 'Collected', value: formatCurrency(totalPaid), icon: CheckCircle, color: 'emerald', sub: `${records.filter(r => r.payment_status === 'paid').length} paid` },
          { label: 'Outstanding', value: formatCurrency(totalPending), icon: Clock, color: 'amber', sub: `${records.filter(r => r.payment_status === 'pending').length} pending` },
          { label: 'Overdue', value: formatCurrency(totalOverdue), icon: AlertCircle, color: 'rose', sub: `${records.filter(r => r.payment_status === 'overdue').length} overdue` },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border p-5 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {card.label}
              </span>
              <div className={`p-2 rounded-lg ${darkMode ? `bg-${card.color}-500/20` : `bg-${card.color}-50`}`}>
                <card.icon size={16} className={`text-${card.color}-500`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{card.value}</p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'overview' as const, label: 'Revenue Overview' },
          { key: 'rates' as const, label: 'Fee Rates' },
          { key: 'periods' as const, label: 'Billing Periods' },
          { key: 'records' as const, label: 'All Records' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === tab.key
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {viewMode === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Payment Status</h3>
            <div className="h-[250px]">
              <Doughnut
                data={paymentStatusData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: {
                    legend: { display: true, position: 'bottom', labels: { color: chartColors.text, padding: 12, usePointStyle: true, font: { size: 11 } } },
                    tooltip: { backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8 },
                  },
                }}
              />
            </div>
          </div>

          <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Monthly Trend</h3>
            <div className="h-[250px]">
              {periods.length > 0 ? (
                <Bar
                  data={monthlyTrendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { backgroundColor: chartColors.tooltipBg, titleColor: chartColors.tooltipText, bodyColor: chartColors.tooltipText, borderColor: chartColors.tooltipBorder, borderWidth: 1, padding: 12, cornerRadius: 8,
                        callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) }
                      },
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: chartColors.text, font: { size: 11 } } },
                      y: { grid: { color: darkMode ? 'rgba(51,65,85,0.3)' : 'rgba(203,213,225,0.5)' }, ticks: { color: chartColors.text, font: { size: 11 }, callback: (v) => `$${v}` } },
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-500">
                  <p className="text-sm">No billing periods yet</p>
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Active Rates</h3>
            <div className="space-y-3">
              {rates.filter(r => r.is_active).length === 0 && (
                <div className={`text-center py-8 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Coins size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No active rates</p>
                  <button
                    onClick={() => { setShowRateForm(true); setViewMode('rates'); }}
                    className="mt-3 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
                  >
                    Create First Rate
                  </button>
                </div>
              )}
              {rates.filter(r => r.is_active).map(rate => {
                const Icon = targetIcon(rate.billing_target);
                return (
                  <div
                    key={rate.id}
                    className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${darkMode ? 'bg-sky-500/20' : 'bg-sky-100'}`}>
                        <Icon size={16} className="text-sky-500" />
                      </div>
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{rate.name}</p>
                        <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {rate.target_entity_name || targetLabel(rate.billing_target)}
                        </p>
                      </div>
                    </div>
                    <p className={`text-sm font-bold flex-shrink-0 ml-2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      {formatCurrency(rate.annual_rate || rate.rate_per_member)}/yr
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Fee Rates */}
      {viewMode === 'rates' && (
        <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Fee Rate Configuration</h3>
            <button
              onClick={() => {
                setShowRateForm(true);
                setEditingRate(null);
                setTargetMode('all');
                setRateForm(defaultRateForm);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
            >
              <Plus size={16} />
              New Rate
            </button>
          </div>

          {showRateForm && (
            <div className={`mb-6 p-5 rounded-2xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Rate Name</label>
                  <input
                    type="text"
                    value={rateForm.name}
                    onChange={e => setRateForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. NSW Association Fees | Monthly"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Annual Rate Per Member (AUD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateForm.annual_rate || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setRateForm(p => ({ ...p, annual_rate: val, rate_per_member: val }));
                    }}
                    placeholder="e.g. 5.00"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                  {rateForm.annual_rate > 0 && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      Monthly charge per member: {formatCurrency(rateForm.annual_rate / 12)}
                    </p>
                  )}
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Billing Target Type</label>
                  <select
                    value={rateForm.billing_target}
                    onChange={e => setRateForm(p => ({ ...p, billing_target: e.target.value, target_entity_id: null, target_entity_name: null }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="club">Clubs</option>
                    <option value="state_association">State Associations</option>
                    <option value="national_association">National Associations</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Target Scope</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setTargetMode('all'); setRateForm(p => ({ ...p, target_entity_id: null, target_entity_name: null })); }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        targetMode === 'all'
                          ? 'bg-sky-500 text-white'
                          : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      All {targetLabel(rateForm.billing_target)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode('specific')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                        targetMode === 'specific'
                          ? 'bg-sky-500 text-white'
                          : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      <Target size={14} />
                      Specific
                    </button>
                  </div>
                </div>

                {targetMode === 'specific' && (
                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Select {rateForm.billing_target === 'club' ? 'Club' : rateForm.billing_target === 'state_association' ? 'State Association' : 'National Association'}
                    </label>
                    <select
                      value={rateForm.target_entity_id || ''}
                      onChange={e => {
                        const selected = entityOptions.find(o => o.id === e.target.value);
                        setRateForm(p => ({
                          ...p,
                          target_entity_id: e.target.value || null,
                          target_entity_name: selected?.name || null,
                        }));
                      }}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      <option value="">-- Select --</option>
                      {entityOptions.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Billing Frequency</label>
                  <select
                    value={rateForm.billing_frequency}
                    onChange={e => setRateForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Effective From</label>
                  <input
                    type="date"
                    value={rateForm.effective_from}
                    onChange={e => setRateForm(p => ({ ...p, effective_from: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Notes</label>
                  <input
                    type="text"
                    value={rateForm.notes}
                    onChange={e => setRateForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
              </div>

              {rateForm.annual_rate > 0 && (
                <div className={`mb-4 p-3 rounded-xl ${darkMode ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-sky-50 border border-sky-200'}`}>
                  <p className={`text-sm ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>
                    Billing calculation: <span className="font-semibold">{formatCurrency(rateForm.annual_rate)}</span> per member/year
                    = <span className="font-semibold">{formatCurrency(rateForm.annual_rate / 12)}</span> per member/month
                  </p>
                  <p className={`text-xs mt-1 ${darkMode ? 'text-sky-400/70' : 'text-sky-600'}`}>
                    Each month: total active members x {formatCurrency(rateForm.annual_rate / 12)}
                  </p>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetRateForm}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={saveRate}
                  disabled={!rateForm.name || (rateForm.annual_rate <= 0 && rateForm.rate_per_member <= 0) || (targetMode === 'specific' && !rateForm.target_entity_id)}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                >
                  {editingRate ? 'Update Rate' : 'Create Rate'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rates.map(rate => {
              const Icon = targetIcon(rate.billing_target);
              return (
                <div
                  key={rate.id}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    rate.is_active
                      ? darkMode ? 'bg-slate-700/20 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
                      : darkMode ? 'bg-slate-800/30 border-slate-700/30 opacity-60' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${rate.is_active ? 'bg-emerald-500/20' : 'bg-slate-500/20'}`}>
                      <Icon size={18} className={rate.is_active ? 'text-emerald-500' : 'text-slate-400'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{rate.name}</p>
                        {rate.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-500">Active</span>
                        )}
                        {rate.target_entity_id && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${darkMode ? 'bg-sky-500/15 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>
                            <Target size={10} className="inline mr-1" />
                            Specific
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {rate.target_entity_name
                          ? `${rate.target_entity_name} (${rate.billing_target.replace(/_/g, ' ')})`
                          : `All ${targetLabel(rate.billing_target).toLowerCase()}`
                        }
                        {' '}- {rate.billing_frequency} - From {new Date(rate.effective_from).toLocaleDateString('en-AU')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-lg font-bold ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                        {formatCurrency(rate.annual_rate || rate.rate_per_member)}
                      </p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        per member/year ({formatCurrency((rate.annual_rate || rate.rate_per_member) / 12)}/mo)
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingRate(rate);
                        setTargetMode(rate.target_entity_id ? 'specific' : 'all');
                        setRateForm({
                          name: rate.name,
                          rate_per_member: rate.rate_per_member,
                          annual_rate: rate.annual_rate || rate.rate_per_member,
                          billing_target: rate.billing_target,
                          billing_frequency: rate.billing_frequency,
                          effective_from: rate.effective_from,
                          notes: rate.notes || '',
                          target_entity_id: rate.target_entity_id,
                          target_entity_name: rate.target_entity_name,
                        });
                        setShowRateForm(true);
                      }}
                      className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-600' : 'hover:bg-slate-200'}`}
                    >
                      <Edit2 size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    </button>
                  </div>
                </div>
              );
            })}
            {rates.length === 0 && !loading && (
              <div className={`text-center py-12 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                <Coins size={40} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">No fee rates configured</p>
                <p className="text-sm mt-1">Create your first platform fee rate to start billing.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Billing Periods */}
      {viewMode === 'periods' && (
        <div className="space-y-6">
          <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Generate Monthly Billing</h3>
            </div>
            <div className="flex items-end gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Billing Month</label>
                <input
                  type="month"
                  value={generateMonth}
                  onChange={e => setGenerateMonth(e.target.value)}
                  className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                />
              </div>
              <button
                onClick={generateBillingRecords}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Calendar size={16} />
                )}
                {generating ? 'Generating...' : 'Generate Billing'}
              </button>
            </div>
            <p className={`text-xs mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              This will count all active members per entity and create billing records based on configured rates.
              Formula: active members x (annual rate / 12) = monthly charge.
            </p>
          </div>

          <div className={`rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <div className="p-6 pb-0">
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Billing Periods</h3>
            </div>
            <div className="divide-y divide-slate-700/30">
              {periods.map(period => {
                const pConfig = periodStatusConfig[period.status] || periodStatusConfig.draft;
                const isExpanded = expandedPeriod === period.id;
                const pRecords = periodRecords[period.id] || [];

                return (
                  <div key={period.id}>
                    <div
                      className={`flex items-center justify-between p-5 cursor-pointer transition-colors ${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'}`}
                      onClick={() => loadPeriodRecords(period.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                          <Calendar size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                        </div>
                        <div>
                          <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {new Date(period.period_start).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                          </p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {period.total_records} records
                            {period.generated_at && ` - Generated ${new Date(period.generated_at).toLocaleDateString('en-AU')}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {formatCurrency(period.total_amount)}
                        </p>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${pConfig.bg} ${pConfig.color}`}>
                          {period.status}
                        </span>
                        {period.status === 'generated' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); finalizePeriod(period.id); }}
                            className="px-3 py-1 bg-emerald-500/15 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-500/25 transition-colors"
                          >
                            <Check size={12} className="inline mr-1" />
                            Finalize
                          </button>
                        )}
                        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={`px-5 pb-5 ${darkMode ? 'bg-slate-900/20' : 'bg-slate-50'}`}>
                        <table className="w-full">
                          <thead>
                            <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              <th className="p-3">Organization</th>
                              <th className="p-3 text-right">Members</th>
                              <th className="p-3 text-right">Rate/mo</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 text-center">Status</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-200'}`}>
                            {pRecords.map(record => {
                              const config = statusConfig[record.payment_status] || statusConfig.pending;
                              const StatusIcon = config.icon;
                              return (
                                <tr key={record.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-white'} transition-colors`}>
                                  <td className={`p-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                    <p className="font-medium text-sm">{record.target_name}</p>
                                    <p className={`text-xs capitalize ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{record.target_type.replace(/_/g, ' ')}</p>
                                  </td>
                                  <td className={`p-3 text-right text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                                    <div className="flex items-center justify-end gap-1">
                                      <Users size={12} className="text-slate-400" />
                                      {record.member_count}
                                    </div>
                                  </td>
                                  <td className={`p-3 text-right text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formatCurrency(record.rate_per_member)}</td>
                                  <td className={`p-3 text-right font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(record.total_amount)}</td>
                                  <td className="p-3 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                                      <StatusIcon size={10} />
                                      {record.payment_status}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <select
                                      value={record.payment_status}
                                      onChange={e => updateRecordStatus(record.id, e.target.value)}
                                      className={`text-xs rounded-lg px-2 py-1 border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="invoiced">Invoiced</option>
                                      <option value="paid">Paid</option>
                                      <option value="overdue">Overdue</option>
                                      <option value="waived">Waived</option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                            {pRecords.length === 0 && (
                              <tr>
                                <td colSpan={6} className={`p-6 text-center text-sm ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Loading records...
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              {periods.length === 0 && (
                <div className={`p-12 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Calendar size={40} className="mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">No billing periods yet</p>
                  <p className="text-sm mt-1">Generate your first billing period above.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All Records */}
      {viewMode === 'records' && (
        <div className={`rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-b border-slate-700/50' : 'text-slate-500 border-b border-slate-200'}`}>
                  <th className="p-4">Organization</th>
                  <th className="p-4">Period</th>
                  <th className="p-4 text-right">Members</th>
                  <th className="p-4 text-right">Rate/mo</th>
                  <th className="p-4 text-right">Annual Rate</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4">Due Date</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-slate-700/30' : 'divide-slate-100'}`}>
                {records.map(record => {
                  const config = statusConfig[record.payment_status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <tr key={record.id} className={`${darkMode ? 'hover:bg-slate-700/20' : 'hover:bg-slate-50'} transition-colors`}>
                      <td className={`p-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        <p className="font-medium">{record.target_name}</p>
                        <p className={`text-xs capitalize ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{record.target_type.replace(/_/g, ' ')}</p>
                      </td>
                      <td className={`p-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {new Date(record.billing_period_start).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{record.member_count}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formatCurrency(record.rate_per_member)}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{record.annual_rate ? formatCurrency(record.annual_rate) : '-'}</td>
                      <td className={`p-4 text-right font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(record.total_amount)}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          <StatusIcon size={12} />
                          {record.payment_status}
                        </span>
                      </td>
                      <td className={`p-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {record.due_date ? new Date(record.due_date).toLocaleDateString('en-AU') : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <select
                          value={record.payment_status}
                          onChange={e => updateRecordStatus(record.id, e.target.value)}
                          className={`text-xs rounded-lg px-2 py-1 border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                        >
                          <option value="pending">Pending</option>
                          <option value="invoiced">Invoiced</option>
                          <option value="paid">Paid</option>
                          <option value="overdue">Overdue</option>
                          <option value="waived">Waived</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={9} className={`p-12 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Receipt size={40} className="mx-auto mb-3 opacity-50" />
                      <p className="text-lg font-medium">No billing records yet</p>
                      <p className="text-sm mt-1">Generate billing from the Billing Periods tab.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
