import { useState, useEffect } from 'react';
import {
  DollarSign, Users, Building, MapPin, Globe, Plus, Edit2, Check,
  X, ChevronDown, ChevronRight, TrendingUp, Receipt, Clock,
  AlertCircle, CheckCircle, CreditCard, Coins, ArrowUpRight, Filter
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
  billing_target: string;
  billing_frequency: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
}

interface BillingRecord {
  id: string;
  billing_rate_id: string;
  target_type: string;
  target_id: string;
  target_name: string;
  billing_period_start: string;
  billing_period_end: string;
  member_count: number;
  rate_per_member: number;
  total_amount: number;
  payment_status: string;
  payment_date: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
}

export function PlatformBillingTab({ darkMode }: PlatformBillingTabProps) {
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRateForm, setShowRateForm] = useState(false);
  const [editingRate, setEditingRate] = useState<BillingRate | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'rates' | 'records'>('overview');
  const [rateForm, setRateForm] = useState({
    name: '',
    rate_per_member: 0,
    billing_target: 'club',
    billing_frequency: 'annually',
    effective_from: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      const [ratesRes, recordsRes] = await Promise.all([
        supabase.from('platform_billing_rates').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_billing_records').select('*').order('created_at', { ascending: false }),
      ]);

      setRates(ratesRes.data || []);
      setRecords(recordsRes.data || []);
    } catch (err) {
      console.error('Error loading billing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveRate = async () => {
    try {
      if (editingRate) {
        await supabase
          .from('platform_billing_rates')
          .update({
            name: rateForm.name,
            rate_per_member: rateForm.rate_per_member,
            billing_target: rateForm.billing_target,
            billing_frequency: rateForm.billing_frequency,
            effective_from: rateForm.effective_from,
            notes: rateForm.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRate.id);
      } else {
        await supabase.from('platform_billing_rates').insert({
          name: rateForm.name,
          rate_per_member: rateForm.rate_per_member,
          billing_target: rateForm.billing_target,
          billing_frequency: rateForm.billing_frequency,
          effective_from: rateForm.effective_from,
          notes: rateForm.notes || null,
        });
      }
      setShowRateForm(false);
      setEditingRate(null);
      setRateForm({ name: '', rate_per_member: 0, billing_target: 'club', billing_frequency: 'annually', effective_from: new Date().toISOString().split('T')[0], notes: '' });
      loadBillingData();
    } catch (err) {
      console.error('Error saving rate:', err);
    }
  };

  const generateBillingRecords = async (rateId: string) => {
    const rate = rates.find(r => r.id === rateId);
    if (!rate) return;

    try {
      let targets: { id: string; name: string; memberCount: number }[] = [];

      if (rate.billing_target === 'club') {
        const { data: clubs } = await supabase.from('clubs').select('id, name');
        const { data: members } = await supabase.from('members').select('id, club_id');

        const membersByClub: Record<string, number> = {};
        (members || []).forEach(m => {
          membersByClub[m.club_id] = (membersByClub[m.club_id] || 0) + 1;
        });

        targets = (clubs || []).map(c => ({
          id: c.id,
          name: c.name,
          memberCount: membersByClub[c.id] || 0,
        }));
      } else if (rate.billing_target === 'state_association') {
        const { data: assocs } = await supabase.from('state_associations').select('id, name');
        targets = (assocs || []).map(a => ({ id: a.id, name: a.name, memberCount: 0 }));
      } else {
        const { data: assocs } = await supabase.from('national_associations').select('id, name');
        targets = (assocs || []).map(a => ({ id: a.id, name: a.name, memberCount: 0 }));
      }

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const newRecords = targets
        .filter(t => t.memberCount > 0)
        .map(t => ({
          billing_rate_id: rate.id,
          target_type: rate.billing_target,
          target_id: t.id,
          target_name: t.name,
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          member_count: t.memberCount,
          rate_per_member: rate.rate_per_member,
          total_amount: t.memberCount * rate.rate_per_member,
          payment_status: 'pending',
        }));

      if (newRecords.length > 0) {
        await supabase.from('platform_billing_records').insert(newRecords);
        loadBillingData();
      }
    } catch (err) {
      console.error('Error generating billing records:', err);
    }
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

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
    paid: { icon: CheckCircle, color: 'text-emerald-500', bg: darkMode ? 'bg-emerald-500/15' : 'bg-emerald-50' },
    pending: { icon: Clock, color: 'text-amber-500', bg: darkMode ? 'bg-amber-500/15' : 'bg-amber-50' },
    overdue: { icon: AlertCircle, color: 'text-red-500', bg: darkMode ? 'bg-red-500/15' : 'bg-red-50' },
    invoiced: { icon: Receipt, color: 'text-sky-500', bg: darkMode ? 'bg-sky-500/15' : 'bg-sky-50' },
    waived: { icon: X, color: 'text-slate-400', bg: darkMode ? 'bg-slate-700/50' : 'bg-slate-100' },
  };

  return (
    <div className="space-y-6">
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

      <div className="flex items-center gap-2">
        {(['overview', 'rates', 'records'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              viewMode === mode
                ? darkMode ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-sky-50 text-sky-700 border border-sky-200'
                : darkMode ? 'text-slate-400 hover:bg-slate-800/50' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {mode === 'overview' ? 'Revenue Overview' : mode === 'rates' ? 'Fee Rates' : 'Billing Records'}
          </button>
        ))}
      </div>

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

          <div className={`lg:col-span-2 rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Active Fee Rates</h3>
            <div className="space-y-3">
              {rates.filter(r => r.is_active).length === 0 && (
                <div className={`text-center py-8 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                  <Coins size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No active fee rates configured.</p>
                  <button
                    onClick={() => { setShowRateForm(true); setViewMode('rates'); }}
                    className="mt-3 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
                  >
                    Create First Rate
                  </button>
                </div>
              )}
              {rates.filter(r => r.is_active).map(rate => (
                <div
                  key={rate.id}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    darkMode ? 'bg-slate-700/20 border-slate-600/30 hover:border-sky-500/30' : 'bg-slate-50 border-slate-200 hover:border-sky-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-sky-500/20' : 'bg-sky-100'}`}>
                      <DollarSign size={20} className="text-sky-500" />
                    </div>
                    <div>
                      <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{rate.name}</p>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {rate.billing_target === 'club' ? 'Per Club' : rate.billing_target === 'state_association' ? 'Per State' : 'Per National'} - {rate.billing_frequency}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      {formatCurrency(rate.rate_per_member)}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>per member</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'rates' && (
        <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Fee Rate Configuration</h3>
            <button
              onClick={() => {
                setShowRateForm(true);
                setEditingRate(null);
                setRateForm({ name: '', rate_per_member: 0, billing_target: 'club', billing_frequency: 'annually', effective_from: new Date().toISOString().split('T')[0], notes: '' });
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
                    placeholder="e.g. Club Annual Fee 2026"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Rate Per Member (AUD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={rateForm.rate_per_member}
                    onChange={e => setRateForm(p => ({ ...p, rate_per_member: parseFloat(e.target.value) || 0 }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Billing Target</label>
                  <select
                    value={rateForm.billing_target}
                    onChange={e => setRateForm(p => ({ ...p, billing_target: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    <option value="club">Clubs</option>
                    <option value="state_association">State Associations</option>
                    <option value="national_association">National Associations</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Frequency</label>
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
                <div>
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
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowRateForm(false); setEditingRate(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={saveRate}
                  disabled={!rateForm.name || rateForm.rate_per_member <= 0}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                >
                  {editingRate ? 'Update Rate' : 'Create Rate'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rates.map(rate => (
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
                    <DollarSign size={18} className={rate.is_active ? 'text-emerald-500' : 'text-slate-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{rate.name}</p>
                      {rate.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-500">Active</span>
                      )}
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {rate.billing_target.replace('_', ' ')} - {rate.billing_frequency} - From {new Date(rate.effective_from).toLocaleDateString('en-AU')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-lg font-bold ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                      {formatCurrency(rate.rate_per_member)}
                    </p>
                    <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>per member</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingRate(rate);
                        setRateForm({
                          name: rate.name,
                          rate_per_member: rate.rate_per_member,
                          billing_target: rate.billing_target,
                          billing_frequency: rate.billing_frequency,
                          effective_from: rate.effective_from,
                          notes: rate.notes || '',
                        });
                        setShowRateForm(true);
                      }}
                      className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-600' : 'hover:bg-slate-200'}`}
                    >
                      <Edit2 size={14} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                    </button>
                    {rate.is_active && (
                      <button
                        onClick={() => generateBillingRecords(rate.id)}
                        className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-sky-500/20' : 'hover:bg-sky-50'}`}
                        title="Generate billing records"
                      >
                        <Receipt size={14} className="text-sky-500" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
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

      {viewMode === 'records' && (
        <div className={`rounded-2xl border ${darkMode ? 'bg-slate-800/30 border-slate-700/50' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-slate-400 border-b border-slate-700/50' : 'text-slate-500 border-b border-slate-200'}`}>
                  <th className="p-4">Organization</th>
                  <th className="p-4">Period</th>
                  <th className="p-4 text-right">Members</th>
                  <th className="p-4 text-right">Rate</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4 text-center">Status</th>
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
                        <p className={`text-xs capitalize ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{record.target_type.replace('_', ' ')}</p>
                      </td>
                      <td className={`p-4 text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {new Date(record.billing_period_start).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
                      </td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{record.member_count}</td>
                      <td className={`p-4 text-right ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formatCurrency(record.rate_per_member)}</td>
                      <td className={`p-4 text-right font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatCurrency(record.total_amount)}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
                          <StatusIcon size={12} />
                          {record.payment_status}
                        </span>
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
                    <td colSpan={7} className={`p-12 text-center ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      <Receipt size={40} className="mx-auto mb-3 opacity-50" />
                      <p className="text-lg font-medium">No billing records yet</p>
                      <p className="text-sm mt-1">Generate billing records from an active fee rate.</p>
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
