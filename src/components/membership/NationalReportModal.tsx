import React, { useState, useEffect } from 'react';
import { X, Send, Download, Mail, Users, FileText, Clock, CheckCircle, AlertTriangle, Building2, Calendar, ChevronRight, Loader2, Settings2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';

interface MemberForReport {
  remittance_id: string;
  member_name: string;
  member_email: string;
  member_phone: string;
  member_city: string;
  member_state: string;
  member_postcode: string;
  member_country: string;
  member_category: string;
  membership_level: string;
  date_joined: string | null;
  club_name: string;
  state_fee: number;
  national_fee: number;
  membership_year: number;
  payment_date: string | null;
  already_reported: boolean;
}

interface NationalReportModalProps {
  darkMode: boolean;
  stateAssociationId: string;
  stateAssociationName: string;
  selectedYear: number | 'all';
  onClose: () => void;
  onComplete: () => void;
}

const AVAILABLE_MEMBER_FIELDS: { key: string; label: string }[] = [
  { key: 'member_name', label: 'Member Name' },
  { key: 'club_name', label: 'Club' },
  { key: 'national_fee', label: 'National Fee' },
  { key: 'payment_date', label: 'Payment Date' },
  { key: 'state_fee', label: 'State Fee' },
  { key: 'membership_year', label: 'Membership Year' },
  { key: 'member_email', label: 'Email' },
  { key: 'member_phone', label: 'Phone' },
  { key: 'member_city', label: 'City' },
  { key: 'member_state', label: 'State' },
  { key: 'member_postcode', label: 'Postcode' },
  { key: 'member_country', label: 'Country' },
  { key: 'member_category', label: 'Category' },
  { key: 'membership_level', label: 'Membership Type' },
  { key: 'date_joined', label: 'Date Joined' },
];

export const NationalReportModal: React.FC<NationalReportModalProps> = ({
  stateAssociationId,
  stateAssociationName,
  selectedYear,
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState<'scope' | 'preview' | 'delivery'>('scope');
  const [reportScope, setReportScope] = useState<'all' | 'new_since_last' | 'custom'>('new_since_last');
  const [deliveryMethod, setDeliveryMethod] = useState<'email' | 'download'>('email');
  const [members, setMembers] = useState<MemberForReport[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState('');
  const [notes, setNotes] = useState('');
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);
  const [previouslyReportedIds, setPreviouslyReportedIds] = useState<Set<string>>(new Set());
  const [csvFields, setCsvFields] = useState<Set<string>>(
    new Set(AVAILABLE_MEMBER_FIELDS.map(f => f.key))
  );
  const [showFieldSelector, setShowFieldSelector] = useState(false);

  useEffect(() => {
    loadMembersAndHistory();
  }, []);

  const loadMembersAndHistory = async () => {
    setLoading(true);
    try {
      const { data: reportedData } = await supabase
        .from('national_report_members')
        .select('remittance_id, national_report_submissions!inner(state_association_id)')
        .eq('national_report_submissions.state_association_id', stateAssociationId);

      const reportedIds = new Set((reportedData || []).map((r: any) => r.remittance_id));
      setPreviouslyReportedIds(reportedIds);

      const { data: lastReport } = await supabase
        .from('national_report_submissions')
        .select('created_at')
        .eq('state_association_id', stateAssociationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastReport) {
        setLastReportDate(lastReport.created_at);
      }

      let query = supabase
        .from('membership_remittances')
        .select(`
          id,
          state_contribution_amount,
          national_contribution_amount,
          state_to_national_status,
          state_to_national_paid_date,
          membership_year,
          members!inner(first_name, last_name, email, phone, city, state, postcode, country, category, membership_level, date_joined),
          clubs!inner(name)
        `)
        .eq('state_association_id', stateAssociationId)
        .eq('state_to_national_status', 'paid');

      if (selectedYear !== 'all') {
        query = query.eq('membership_year', selectedYear);
      }

      const { data: remittanceData } = await query;

      const formatted: MemberForReport[] = (remittanceData || []).map((r: any) => ({
        remittance_id: r.id,
        member_name: `${r.members.first_name} ${r.members.last_name}`,
        member_email: r.members.email || '',
        member_phone: r.members.phone || '',
        member_city: r.members.city || '',
        member_state: r.members.state || '',
        member_postcode: r.members.postcode || '',
        member_country: r.members.country || '',
        member_category: r.members.category || '',
        membership_level: r.members.membership_level || '',
        date_joined: r.members.date_joined || null,
        club_name: r.clubs.name,
        state_fee: Number(r.state_contribution_amount) || 0,
        national_fee: Number(r.national_contribution_amount) || 0,
        membership_year: r.membership_year,
        payment_date: r.state_to_national_paid_date,
        already_reported: reportedIds.has(r.id)
      }));

      formatted.sort((a, b) => a.club_name.localeCompare(b.club_name) || a.member_name.localeCompare(b.member_name));
      setMembers(formatted);

      const newMembers = formatted.filter(m => !m.already_reported);
      setSelectedMembers(new Set(newMembers.map(m => m.remittance_id)));

      const currentYear = selectedYear !== 'all' ? selectedYear : new Date().getFullYear();
      setSubject(`Member Payment Report - ${stateAssociationName || 'State Association'} - ${currentYear}${reportedIds.size > 0 ? ' (Update)' : ''}`);
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredMembers = () => {
    if (reportScope === 'all') return members;
    if (reportScope === 'new_since_last') return members.filter(m => !m.already_reported);
    return members.filter(m => selectedMembers.has(m.remittance_id));
  };

  const handleScopeSelect = (scope: 'all' | 'new_since_last' | 'custom') => {
    setReportScope(scope);
    if (scope === 'all') {
      setSelectedMembers(new Set(members.map(m => m.remittance_id)));
    } else if (scope === 'new_since_last') {
      setSelectedMembers(new Set(members.filter(m => !m.already_reported).map(m => m.remittance_id)));
    }
  };

  const toggleMember = (id: string) => {
    const next = new Set(selectedMembers);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedMembers(next);
  };

  const toggleAllVisible = () => {
    const visible = getFilteredMembers();
    const allSelected = visible.every(m => selectedMembers.has(m.remittance_id));
    const next = new Set(selectedMembers);
    if (allSelected) {
      visible.forEach(m => next.delete(m.remittance_id));
    } else {
      visible.forEach(m => next.add(m.remittance_id));
    }
    setSelectedMembers(next);
  };

  const toggleCsvField = (key: string) => {
    const next = new Set(csvFields);
    if (next.has(key)) {
      if (key === 'member_name') return;
      next.delete(key);
    } else {
      next.add(key);
    }
    setCsvFields(next);
  };

  const reportMembers = reportScope === 'custom'
    ? members.filter(m => selectedMembers.has(m.remittance_id))
    : getFilteredMembers();

  const totalState = reportMembers.reduce((s, m) => s + m.state_fee, 0);
  const totalNational = reportMembers.reduce((s, m) => s + m.national_fee, 0);

  const getFieldValue = (m: MemberForReport, key: string): string => {
    switch (key) {
      case 'member_name': return m.member_name;
      case 'club_name': return m.club_name;
      case 'national_fee': return m.national_fee.toFixed(2);
      case 'state_fee': return m.state_fee.toFixed(2);
      case 'membership_year': return String(m.membership_year);
      case 'payment_date': return m.payment_date ? new Date(m.payment_date).toLocaleDateString() : '';
      case 'member_email': return m.member_email;
      case 'member_phone': return m.member_phone;
      case 'member_city': return m.member_city;
      case 'member_state': return m.member_state;
      case 'member_postcode': return m.member_postcode;
      case 'member_country': return m.member_country;
      case 'member_category': return m.member_category;
      case 'membership_level': return m.membership_level;
      case 'date_joined': return m.date_joined ? new Date(m.date_joined).toLocaleDateString() : '';
      default: return '';
    }
  };

  const generateCSV = () => {
    const selectedFieldDefs = AVAILABLE_MEMBER_FIELDS.filter(f => csvFields.has(f.key));
    const headers = selectedFieldDefs.map(f => f.label);
    const rows = reportMembers.map(m =>
      selectedFieldDefs.map(f => getFieldValue(m, f.key))
    );

    rows.push([]);
    const totalRow = selectedFieldDefs.map(f => {
      if (f.key === 'member_name') return 'TOTALS';
      if (f.key === 'national_fee') return totalNational.toFixed(2);
      if (f.key === 'state_fee') return totalState.toFixed(2);
      return '';
    });
    rows.push(totalRow);
    rows.push(selectedFieldDefs.map((f, i) => i === 0 ? 'Total Members' : i === 1 ? String(reportMembers.length) : ''));

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    return csv;
  };

  const handleDownload = async () => {
    setSubmitting(true);
    try {
      const csv = generateCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const year = selectedYear !== 'all' ? selectedYear : new Date().getFullYear();
      a.href = url;
      a.download = `national-member-report-${year}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try {
        await saveReportRecord('download');
      } catch (logError: any) {
        console.error('Failed to save report log (download completed):', logError);
      }
      onComplete();
    } catch (error) {
      console.error('Error generating download:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!recipientEmail) {
      alert('Please enter a recipient email address.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/send-national-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          subject: subject,
          notes: notes,
          state_association_name: stateAssociationName,
          members: reportMembers.map(m => ({
            member_name: m.member_name,
            member_email: m.member_email,
            member_phone: m.member_phone,
            member_city: m.member_city,
            member_state: m.member_state,
            member_postcode: m.member_postcode,
            member_country: m.member_country,
            member_category: m.member_category,
            membership_level: m.membership_level,
            date_joined: m.date_joined,
            club_name: m.club_name,
            state_fee: m.state_fee,
            national_fee: m.national_fee,
            membership_year: m.membership_year,
            payment_date: m.payment_date
          })),
          total_state: totalState,
          total_national: totalNational,
          state_association_id: stateAssociationId,
          is_incremental: reportScope === 'new_since_last',
          csv_fields: Array.from(csvFields)
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send email');
      }

      try {
        await saveReportRecord('email');
      } catch (logError: any) {
        console.error('Failed to save report log (email was sent):', logError);
      }
      onComplete();
    } catch (error: any) {
      console.error('Error sending email:', error);
      alert('Failed to send email: ' + (error.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveReportRecord = async (type: 'email' | 'download') => {
    const { data: { user } } = await supabase.auth.getUser();
    const year = selectedYear !== 'all' ? selectedYear : new Date().getFullYear();

    const { data: report, error: reportError } = await supabase
      .from('national_report_submissions')
      .insert({
        state_association_id: stateAssociationId,
        report_type: type,
        report_scope: reportScope,
        membership_year: year,
        member_count: reportMembers.length,
        total_state_amount: totalState,
        total_national_amount: totalNational,
        recipient_email: type === 'email' ? recipientEmail : null,
        recipient_name: type === 'email' ? recipientName : null,
        subject: type === 'email' ? subject : null,
        notes: notes || null,
        sent_by: user?.id || null
      })
      .select('id')
      .maybeSingle();

    if (reportError) {
      console.error('Error saving report record:', reportError);
      throw reportError;
    }

    if (report) {
      const memberRecords = reportMembers.map(m => ({
        report_id: report.id,
        remittance_id: m.remittance_id,
        member_name: m.member_name,
        club_name: m.club_name,
        state_fee: m.state_fee,
        national_fee: m.national_fee,
        membership_year: m.membership_year,
        payment_date: m.payment_date
      }));

      const batchSize = 50;
      for (let i = 0; i < memberRecords.length; i += batchSize) {
        const batch = memberRecords.slice(i, i + batchSize);
        const { error: batchError } = await supabase.from('national_report_members').insert(batch);
        if (batchError) {
          console.error('Error saving report members batch:', batchError);
        }
      }
    }
  };

  const newMemberCount = members.filter(m => !m.already_reported).length;
  const alreadyReportedCount = members.filter(m => m.already_reported).length;

  const clubGroups = reportMembers.reduce<Record<string, MemberForReport[]>>((acc, m) => {
    if (!acc[m.club_name]) acc[m.club_name] = [];
    acc[m.club_name].push(m);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#131c31] border border-slate-700/80 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-700/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 border border-teal-500/20">
              <FileText size={20} className="text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Generate National Report</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'scope' && 'Choose which members to include'}
                {step === 'preview' && `${reportMembers.length} members selected`}
                {step === 'delivery' && 'Choose how to send the report'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700/80 transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="flex items-center gap-0 px-6 pt-4">
          {['scope', 'preview', 'delivery'].map((s, i) => (
            <React.Fragment key={s}>
              <button
                onClick={() => {
                  if (s === 'scope') setStep('scope');
                  else if (s === 'preview' && step !== 'scope') setStep('preview');
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  step === s
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                    : ['scope'].indexOf(step) < ['scope', 'preview', 'delivery'].indexOf(s)
                    ? 'text-slate-500'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>{i + 1}</span>
                {s === 'scope' ? 'Scope' : s === 'preview' ? 'Preview' : 'Send'}
              </button>
              {i < 2 && <ChevronRight size={14} className="text-slate-600 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-teal-400 animate-spin mb-3" />
              <p className="text-sm text-slate-400">Loading member data...</p>
            </div>
          ) : (
            <>
              {step === 'scope' && (
                <div className="space-y-4">
                  {lastReportDate && (
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm">
                      <Clock size={15} className="text-blue-400 flex-shrink-0" />
                      <span className="text-blue-300">Last report sent: {new Date(lastReportDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-slate-400" />
                        <span className="text-xs text-slate-400 font-medium">State Paid to National</span>
                      </div>
                      <p className="text-xl font-bold text-white">{members.length}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-orange-400" />
                        <span className="text-xs text-slate-400 font-medium">Not Yet Reported</span>
                      </div>
                      <p className="text-xl font-bold text-orange-300">{newMemberCount}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {newMemberCount > 0 && (
                      <button
                        onClick={() => handleScopeSelect('new_since_last')}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                          reportScope === 'new_since_last'
                            ? 'border-teal-500/60 bg-teal-500/10'
                            : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg mt-0.5 ${reportScope === 'new_since_last' ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                              <Clock size={16} className={reportScope === 'new_since_last' ? 'text-teal-400' : 'text-slate-400'} />
                            </div>
                            <div>
                              <p className={`font-semibold ${reportScope === 'new_since_last' ? 'text-teal-300' : 'text-white'}`}>New Members Only</p>
                              <p className="text-xs text-slate-400 mt-0.5">Only members not yet reported to National</p>
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                            reportScope === 'new_since_last' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-300'
                          }`}>{newMemberCount}</span>
                        </div>
                      </button>
                    )}

                    <button
                      onClick={() => handleScopeSelect('all')}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        reportScope === 'all'
                          ? 'border-teal-500/60 bg-teal-500/10'
                          : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg mt-0.5 ${reportScope === 'all' ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                            <Users size={16} className={reportScope === 'all' ? 'text-teal-400' : 'text-slate-400'} />
                          </div>
                          <div>
                            <p className={`font-semibold ${reportScope === 'all' ? 'text-teal-300' : 'text-white'}`}>All Remitted Members</p>
                            <p className="text-xs text-slate-400 mt-0.5">All members remitted from State to National{alreadyReportedCount > 0 ? ` (includes ${alreadyReportedCount} previously reported)` : ''}</p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          reportScope === 'all' ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-300'
                        }`}>{members.length}</span>
                      </div>
                    </button>

                    <button
                      onClick={() => handleScopeSelect('custom')}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        reportScope === 'custom'
                          ? 'border-teal-500/60 bg-teal-500/10'
                          : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg mt-0.5 ${reportScope === 'custom' ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                          <CheckCircle size={16} className={reportScope === 'custom' ? 'text-teal-400' : 'text-slate-400'} />
                        </div>
                        <div>
                          <p className={`font-semibold ${reportScope === 'custom' ? 'text-teal-300' : 'text-white'}`}>Custom Selection</p>
                          <p className="text-xs text-slate-400 mt-0.5">Manually choose which members to include</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {reportScope === 'custom' && (
                    <div className="mt-4 rounded-xl border border-slate-700/60 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/60 border-b border-slate-700/40">
                        <button onClick={toggleAllVisible} className="text-xs text-teal-400 hover:text-teal-300 font-medium">
                          {members.every(m => selectedMembers.has(m.remittance_id)) ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-xs text-slate-400">{selectedMembers.size} selected</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {members.map(m => (
                          <button
                            key={m.remittance_id}
                            onClick={() => toggleMember(m.remittance_id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-slate-800/50 last:border-0 ${
                              selectedMembers.has(m.remittance_id) ? 'bg-teal-500/5' : 'hover:bg-slate-800/40'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                              selectedMembers.has(m.remittance_id)
                                ? 'bg-teal-500 border-teal-500'
                                : 'border-slate-600 bg-slate-800'
                            }`}>
                              {selectedMembers.has(m.remittance_id) && <CheckCircle size={10} className="text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{m.member_name}</p>
                              <p className="text-xs text-slate-500">{m.club_name}</p>
                            </div>
                            <span className="text-xs text-slate-400 font-medium">${m.national_fee.toFixed(2)}</span>
                            {m.already_reported && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 text-blue-400 font-medium">Sent</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 'preview' && (
                <div className="space-y-4">
                  {stateAssociationName && (
                    <div className="px-4 py-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                      <p className="text-xs text-teal-300 font-medium">Reporting from</p>
                      <p className="text-sm font-semibold text-white mt-0.5">{stateAssociationName}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-center">
                      <p className="text-2xl font-bold text-white">{reportMembers.length}</p>
                      <p className="text-xs text-teal-300 mt-0.5">Members</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-center">
                      <p className="text-2xl font-bold text-white">${totalState.toFixed(2)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">State Fees</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-center">
                      <p className="text-2xl font-bold text-white">${totalNational.toFixed(2)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">National Fees</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700/60 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/40 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Members by Club</span>
                      <span className="text-xs text-slate-400">{Object.keys(clubGroups).length} clubs</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {Object.entries(clubGroups).map(([clubName, clubMembers]) => (
                        <div key={clubName} className="border-b border-slate-800/50 last:border-0">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/30">
                            <div className="flex items-center gap-2">
                              <Building2 size={13} className="text-slate-500" />
                              <span className="text-sm font-medium text-slate-300">{clubName}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-500">{clubMembers.length} members</span>
                              <span className="text-xs font-medium text-teal-400">
                                ${clubMembers.reduce((s, m) => s + m.national_fee, 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {clubMembers.map(m => (
                            <div key={m.remittance_id} className="flex items-center justify-between px-4 py-2 pl-10">
                              <span className="text-sm text-slate-300">{m.member_name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-500">{m.payment_date ? new Date(m.payment_date).toLocaleDateString() : '-'}</span>
                                <span className="text-xs font-medium text-white">${m.national_fee.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 'delivery' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setDeliveryMethod('email')}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        deliveryMethod === 'email'
                          ? 'border-blue-500/60 bg-blue-500/10'
                          : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${deliveryMethod === 'email' ? 'bg-blue-500/20' : 'bg-slate-700'}`}>
                          <Mail size={18} className={deliveryMethod === 'email' ? 'text-blue-400' : 'text-slate-400'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${deliveryMethod === 'email' ? 'text-blue-300' : 'text-white'}`}>Email Report</p>
                          <p className="text-xs text-slate-400 mt-0.5">Send directly to National</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => setDeliveryMethod('download')}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        deliveryMethod === 'download'
                          ? 'border-teal-500/60 bg-teal-500/10'
                          : 'border-slate-700/60 bg-slate-800/50 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${deliveryMethod === 'download' ? 'bg-teal-500/20' : 'bg-slate-700'}`}>
                          <Download size={18} className={deliveryMethod === 'download' ? 'text-teal-400' : 'text-slate-400'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${deliveryMethod === 'download' ? 'text-teal-300' : 'text-white'}`}>Download CSV</p>
                          <p className="text-xs text-slate-400 mt-0.5">Save report file locally</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {deliveryMethod === 'email' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">Recipient Email *</label>
                          <input
                            type="email"
                            required
                            value={recipientEmail}
                            onChange={e => setRecipientEmail(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50"
                            placeholder="national@example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1.5">Recipient Name</label>
                          <input
                            type="text"
                            value={recipientName}
                            onChange={e => setRecipientName(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50"
                            placeholder="National Secretary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Subject</label>
                        <input
                          type="text"
                          value={subject}
                          onChange={e => setSubject(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes (optional)</label>
                        <textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          rows={3}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50 resize-none"
                          placeholder="Any additional notes for the National Association..."
                        />
                      </div>
                    </div>
                  )}

                  {deliveryMethod === 'download' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes (optional - saved to report history)</label>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={2}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500/50 resize-none"
                        placeholder="Notes about this report..."
                      />
                    </div>
                  )}

                  {/* CSV Field Selector */}
                  <div className="rounded-xl border border-slate-700/60 overflow-hidden">
                    <button
                      onClick={() => setShowFieldSelector(!showFieldSelector)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/40 hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Settings2 size={15} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-300">CSV / Attachment Fields</span>
                        <span className="px-2 py-0.5 rounded-md text-xs bg-slate-700 text-slate-400">{csvFields.size} selected</span>
                      </div>
                      <ChevronRight size={14} className={`text-slate-500 transition-transform ${showFieldSelector ? 'rotate-90' : ''}`} />
                    </button>
                    {showFieldSelector && (
                      <div className="px-4 py-3 border-t border-slate-700/40 grid grid-cols-2 gap-2">
                        {AVAILABLE_MEMBER_FIELDS.map(field => (
                          <button
                            key={field.key}
                            onClick={() => toggleCsvField(field.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                              csvFields.has(field.key)
                                ? 'bg-teal-500/10 border border-teal-500/30 text-teal-300'
                                : 'bg-slate-800/50 border border-slate-700/40 text-slate-400 hover:border-slate-600'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                              csvFields.has(field.key)
                                ? 'bg-teal-500 border-teal-500'
                                : 'border-slate-600'
                            }`}>
                              {csvFields.has(field.key) && <CheckCircle size={8} className="text-white" />}
                            </div>
                            <span className="text-xs font-medium">{field.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Report Summary</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {reportMembers.length} members across {Object.keys(clubGroups).length} clubs
                        </p>
                        {stateAssociationName && (
                          <p className="text-xs text-teal-400 mt-1">From: {stateAssociationName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-teal-400">${totalNational.toFixed(2)}</p>
                        <p className="text-xs text-slate-500">National fees</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-700/60">
          <button
            onClick={() => {
              if (step === 'preview') setStep('scope');
              else if (step === 'delivery') setStep('preview');
              else onClose();
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors border border-slate-700/60"
          >
            {step === 'scope' ? 'Cancel' : 'Back'}
          </button>

          <div className="flex items-center gap-2">
            {step === 'scope' && (
              <button
                onClick={() => setStep('preview')}
                disabled={reportMembers.length === 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-teal-600/20"
              >
                Preview Report
                <ChevronRight size={16} />
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={() => setStep('delivery')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-teal-600/20"
              >
                Choose Delivery
                <ChevronRight size={16} />
              </button>
            )}
            {step === 'delivery' && (
              <button
                onClick={deliveryMethod === 'email' ? handleSendEmail : handleDownload}
                disabled={submitting || (deliveryMethod === 'email' && !recipientEmail)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all flex items-center gap-2 shadow-lg shadow-teal-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {deliveryMethod === 'email' ? 'Sending...' : 'Generating...'}
                  </>
                ) : (
                  <>
                    {deliveryMethod === 'email' ? <Send size={16} /> : <Download size={16} />}
                    {deliveryMethod === 'email' ? 'Send Email' : 'Download CSV'}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
