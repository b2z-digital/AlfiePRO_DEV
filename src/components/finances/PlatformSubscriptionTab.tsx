import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Users, Calendar, CheckCircle, Clock,
  AlertCircle, TrendingUp, ChevronDown, ChevronUp,
  Receipt, CreditCard, FileText, Mail, Send, Loader2, X
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { supabase } from '../../utils/supabase';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface PlatformSubscriptionTabProps {
  darkMode: boolean;
  associationId: string;
  associationType: 'state' | 'national';
  associationName: string;
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

interface MemberSnapshot {
  id: string;
  billing_period_id: string;
  billing_record_id: string | null;
  target_type: string;
  target_id: string;
  target_name: string;
  total_active_members: number;
  new_members_this_period: number;
  snapshot_date: string;
}

interface BillingRate {
  id: string;
  name: string;
  rate_per_member: number;
  annual_rate: number | null;
  billing_frequency: string;
  is_active: boolean;
}

export function PlatformSubscriptionTab({
  darkMode,
  associationId,
  associationType,
  associationName
}: PlatformSubscriptionTabProps) {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [snapshots, setSnapshots] = useState<MemberSnapshot[]>([]);
  const [currentRate, setCurrentRate] = useState<BillingRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{ record: BillingRecord } | null>(null);
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [invoiceName, setInvoiceName] = useState('');
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState<string | null>(null);

  const targetType = associationType === 'state' ? 'state_association' : 'national_association';

  const loadData = useCallback(async () => {
    try {
      const [recordsRes, snapshotsRes, ratesRes] = await Promise.all([
        supabase
          .from('platform_billing_records')
          .select('*')
          .eq('target_type', targetType)
          .eq('target_id', associationId)
          .order('billing_period_start', { ascending: false }),
        supabase
          .from('platform_billing_member_snapshots')
          .select('*')
          .eq('target_type', targetType)
          .eq('target_id', associationId)
          .order('snapshot_date', { ascending: false }),
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
      setSnapshots(snapshotsRes.data || []);
      setCurrentRate(ratesRes.data?.[0] || null);
    } catch (err) {
      console.error('Error loading subscription data:', err);
    } finally {
      setLoading(false);
    }
  }, [associationId, targetType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openInvoiceModal = (record: BillingRecord) => {
    setInvoiceModal({ record });
    setInvoiceEmail('');
    setInvoiceName(associationName);
    setInvoiceMessage('');
    setInvoiceSent(null);
  };

  const sendInvoiceEmail = async () => {
    if (!invoiceModal || !invoiceEmail) return;
    setSendingInvoice(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-platform-billing-invoice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            record_id: invoiceModal.record.id,
            recipient_email: invoiceEmail,
            recipient_name: invoiceName,
            message: invoiceMessage,
          }),
        }
      );
      if (res.ok) {
        setInvoiceSent(invoiceEmail);
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send invoice');
      }
    } catch (err) {
      console.error('Error sending invoice:', err);
      alert('Failed to send invoice email');
    } finally {
      setSendingInvoice(false);
    }
  };

  const totalOwed = records
    .filter(r => r.payment_status === 'pending' || r.payment_status === 'invoiced' || r.payment_status === 'overdue')
    .reduce((sum, r) => sum + r.total_amount, 0);

  const totalPaid = records
    .filter(r => r.payment_status === 'paid')
    .reduce((sum, r) => sum + r.total_amount, 0);

  const latestSnapshot = snapshots[0];
  const overdueCount = records.filter(r => r.payment_status === 'overdue').length;

  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400 bg-yellow-400/10',
    invoiced: 'text-blue-400 bg-blue-400/10',
    paid: 'text-emerald-400 bg-emerald-400/10',
    overdue: 'text-red-400 bg-red-400/10',
    waived: 'text-slate-400 bg-slate-400/10',
  };

  const statusIcons: Record<string, typeof Clock> = {
    pending: Clock,
    invoiced: Receipt,
    paid: CheckCircle,
    overdue: AlertCircle,
    waived: FileText,
  };

  const chartRecords = [...records].reverse().slice(-12);
  const memberChartData = {
    labels: chartRecords.map(r => {
      const d = new Date(r.billing_period_start);
      return d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    }),
    datasets: [
      {
        label: 'Monthly Charge ($)',
        data: chartRecords.map(r => r.total_amount),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Active Members',
        data: chartRecords.map(r => r.member_count),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: 'y1',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8' },
      },
    },
    scales: {
      x: {
        ticks: { color: '#64748b' },
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
      },
      y: {
        position: 'left' as const,
        ticks: {
          color: '#64748b',
          callback: (v: number | string) => `$${v}`,
        },
        grid: { color: 'rgba(148, 163, 184, 0.1)' },
      },
      y1: {
        position: 'right' as const,
        ticks: { color: '#64748b' },
        grid: { display: false },
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">AlfiePRO Subscription</h2>
          <p className="text-slate-400 text-sm mt-1">
            Platform billing and subscription status for {associationName}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <CreditCard size={18} className="text-blue-400" />
            </div>
            <span className="text-sm text-slate-400">Current Rate</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {currentRate
              ? `$${(currentRate.annual_rate || currentRate.rate_per_member).toFixed(2)}`
              : 'N/A'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentRate
              ? `per member / year ($${((currentRate.annual_rate || currentRate.rate_per_member) / 12).toFixed(2)}/mo)`
              : 'No rate configured'}
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Users size={18} className="text-emerald-400" />
            </div>
            <span className="text-sm text-slate-400">Active Members</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {latestSnapshot?.total_active_members ?? 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {latestSnapshot?.new_members_this_period
              ? `+${latestSnapshot.new_members_this_period} new this period`
              : 'As of last billing period'}
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${overdueCount > 0 ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
              <DollarSign size={18} className={overdueCount > 0 ? 'text-red-400' : 'text-yellow-400'} />
            </div>
            <span className="text-sm text-slate-400">Outstanding</span>
          </div>
          <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-400' : totalOwed > 0 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            ${totalOwed.toFixed(2)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {overdueCount > 0
              ? `${overdueCount} overdue payment${overdueCount > 1 ? 's' : ''}`
              : totalOwed > 0
                ? 'Awaiting payment'
                : 'All up to date'}
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <TrendingUp size={18} className="text-emerald-400" />
            </div>
            <span className="text-sm text-slate-400">Total Paid</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            ${totalPaid.toFixed(2)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Across {records.filter(r => r.payment_status === 'paid').length} billing period{records.filter(r => r.payment_status === 'paid').length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Chart */}
      {chartRecords.length > 1 && (
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Billing History</h3>
          <div className="h-64">
            <Bar data={memberChartData} options={chartOptions} />
          </div>
        </div>
      )}

      {/* Billing Records Table */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700/50">
        <div className="p-5 border-b border-slate-700/50">
          <h3 className="text-lg font-semibold text-white">Billing Records</h3>
          <p className="text-sm text-slate-400 mt-1">Monthly platform fees based on active member count</p>
        </div>

        {records.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No billing records yet</p>
            <p className="text-sm mt-1">Billing records will appear here once generated by the platform administrator.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Period</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Members</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Rate/Mo</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Annual Rate</th>
                  <th className="text-right p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Due Date</th>
                  <th className="text-center p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">Invoice</th>
                  <th className="p-4 text-xs font-medium text-slate-400 uppercase tracking-wider"></th>
                </tr>
              </thead>
              {records.map((record) => {
                const StatusIcon = statusIcons[record.payment_status] || Clock;
                const isExpanded = expandedRecord === record.id;
                const matchingSnapshot = snapshots.find(
                  s => s.billing_record_id === record.id
                );

                return (
                  <tbody key={record.id}>
                    <tr
                      className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer transition-colors"
                      onClick={() => setExpandedRecord(isExpanded ? null : record.id)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-slate-500" />
                          <span className="text-sm text-white font-medium">
                            {new Date(record.billing_period_start).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm text-white">{record.member_count}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm text-slate-300">${record.rate_per_member.toFixed(2)}</span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm text-slate-300">
                          {record.annual_rate ? `$${record.annual_rate.toFixed(2)}` : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className="text-sm font-semibold text-white">${record.total_amount.toFixed(2)}</span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[record.payment_status] || 'text-slate-400 bg-slate-400/10'}`}>
                          <StatusIcon size={12} />
                          {record.payment_status.charAt(0).toUpperCase() + record.payment_status.slice(1)}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="text-sm text-slate-400">
                          {record.due_date
                            ? new Date(record.due_date).toLocaleDateString('en-AU')
                            : '-'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); openInvoiceModal(record); }}
                          className="p-1.5 rounded-lg hover:bg-slate-700/50 text-sky-400 hover:text-sky-300 transition-colors"
                          title="Email invoice"
                        >
                          <Mail size={15} />
                        </button>
                      </td>
                      <td className="p-4">
                        {isExpanded
                          ? <ChevronUp size={16} className="text-slate-400" />
                          : <ChevronDown size={16} className="text-slate-400" />
                        }
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-700/10">
                        <td colSpan={9} className="p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-slate-500 block mb-1">Period</span>
                              <span className="text-slate-300">
                                {new Date(record.billing_period_start).toLocaleDateString('en-AU')} - {new Date(record.billing_period_end).toLocaleDateString('en-AU')}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 block mb-1">Calculation</span>
                              <span className="text-slate-300">
                                {record.member_count} members x ${record.rate_per_member.toFixed(2)}/mo
                              </span>
                            </div>
                            {matchingSnapshot && (
                              <div>
                                <span className="text-slate-500 block mb-1">New Members</span>
                                <span className="text-slate-300">
                                  +{matchingSnapshot.new_members_this_period} this period
                                </span>
                              </div>
                            )}
                            {record.payment_date && (
                              <div>
                                <span className="text-slate-500 block mb-1">Payment Date</span>
                                <span className="text-slate-300">
                                  {new Date(record.payment_date).toLocaleDateString('en-AU')}
                                </span>
                              </div>
                            )}
                            {record.payment_reference && (
                              <div>
                                <span className="text-slate-500 block mb-1">Reference</span>
                                <span className="text-slate-300">{record.payment_reference}</span>
                              </div>
                            )}
                            {record.notes && (
                              <div className="col-span-2">
                                <span className="text-slate-500 block mb-1">Notes</span>
                                <span className="text-slate-300">{record.notes}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </div>

      {invoiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setInvoiceModal(null)}>
          <div
            className="w-full max-w-md rounded-2xl border bg-slate-800 border-slate-700 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-sky-500/15">
                  <Mail size={18} className="text-sky-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Email Invoice</h3>
                  <p className="text-xs text-slate-400">
                    {new Date(invoiceModal.record.billing_period_start).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })} - ${invoiceModal.record.total_amount.toFixed(2)}
                  </p>
                </div>
              </div>
              <button onClick={() => setInvoiceModal(null)} className="p-1.5 rounded-lg hover:bg-slate-700">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {invoiceSent ? (
              <div className="p-8 text-center">
                <div className="p-3 rounded-full bg-emerald-500/15 inline-flex mb-4">
                  <CheckCircle size={28} className="text-emerald-400" />
                </div>
                <p className="font-semibold text-white mb-1">Invoice Sent</p>
                <p className="text-sm text-slate-400">Invoice emailed to {invoiceSent}</p>
                <button
                  onClick={() => setInvoiceModal(null)}
                  className="mt-4 px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="p-3 rounded-xl text-sm bg-slate-700/30 text-slate-300">
                  Amount: <span className="font-bold text-sky-400">${invoiceModal.record.total_amount.toFixed(2)}</span>
                  <span className="mx-2">|</span>
                  Members: {invoiceModal.record.member_count}
                  <span className="mx-2">|</span>
                  Rate: ${invoiceModal.record.rate_per_member.toFixed(2)}/mo
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Recipient Email *</label>
                  <input
                    type="email"
                    value={invoiceEmail}
                    onChange={e => setInvoiceEmail(e.target.value)}
                    placeholder="treasurer@association.org"
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-900 border-slate-600 text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Recipient Name</label>
                  <input
                    type="text"
                    value={invoiceName}
                    onChange={e => setInvoiceName(e.target.value)}
                    placeholder="Name"
                    className="w-full px-3 py-2 rounded-lg border text-sm bg-slate-900 border-slate-600 text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5 text-slate-300">Message (optional)</label>
                  <textarea
                    value={invoiceMessage}
                    onChange={e => setInvoiceMessage(e.target.value)}
                    rows={3}
                    placeholder="Additional message to include..."
                    className="w-full px-3 py-2 rounded-lg border text-sm resize-none bg-slate-900 border-slate-600 text-white placeholder-slate-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => setInvoiceModal(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendInvoiceEmail}
                    disabled={!invoiceEmail || sendingInvoice}
                    className="flex items-center gap-2 px-5 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
                  >
                    {sendingInvoice ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {sendingInvoice ? 'Sending...' : 'Send Invoice'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
