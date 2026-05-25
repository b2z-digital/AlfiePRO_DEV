import React, { useState, useEffect } from 'react';
import { TriangleAlert as AlertTriangle, Plus, Clock, CircleCheck as CheckCircle, Circle as XCircle, Calendar, MapPin, Gavel, FileText, ChevronDown, ChevronUp, MessageSquare, Trash2, CreditCard as Edit3, Search } from 'lucide-react';
import {
  getProtests, createProtest, updateProtest, deleteProtest,
  getScoringEnquiries, createScoringEnquiry, updateScoringEnquiry, deleteScoringEnquiry,
  EventProtest, ScoringEnquiry
} from '../utils/protestStorage';
import { useAuth } from '../contexts/AuthContext';

interface ProtestBoardProps {
  eventId: string;
  clubId: string;
  darkMode: boolean;
  isAdmin: boolean;
  eventName?: string;
}

export const ProtestBoard: React.FC<ProtestBoardProps> = ({
  eventId,
  clubId,
  darkMode,
  isAdmin,
  eventName
}) => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'protests' | 'enquiries'>('protests');
  const [protests, setProtests] = useState<EventProtest[]>([]);
  const [enquiries, setEnquiries] = useState<ScoringEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFileForm, setShowFileForm] = useState(false);
  const [showEnquiryForm, setShowEnquiryForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Protest form state
  const [protestForm, setProtestForm] = useState({
    protest_type: 'boat_vs_boat' as EventProtest['protest_type'],
    filed_by_name: '',
    filed_by_sail_number: '',
    protestee_sail_number: '',
    protestee_name: '',
    race_number: 1,
    incident_description: '',
    rules_alleged_broken: '',
    witnesses: '',
  });

  // Enquiry form state
  const [enquiryForm, setEnquiryForm] = useState({
    submitted_by_name: '',
    sail_number: '',
    race_number: 1,
    issue_type: 'wrong_position' as ScoringEnquiry['issue_type'],
    description: '',
  });

  // Admin edit state
  const [adminEdit, setAdminEdit] = useState({
    hearing_time: '',
    hearing_location: '',
    status: '' as EventProtest['status'],
    decision: '',
    decision_summary: '',
    penalty_applied: '',
  });

  useEffect(() => {
    loadData();
  }, [eventId]);

  useEffect(() => {
    if (profile) {
      setProtestForm(prev => ({ ...prev, filed_by_name: profile.full_name || '' }));
      setEnquiryForm(prev => ({ ...prev, submitted_by_name: profile.full_name || '' }));
    }
  }, [profile]);

  const loadData = async () => {
    setLoading(true);
    const [protestData, enquiryData] = await Promise.all([
      getProtests(eventId),
      getScoringEnquiries(eventId),
    ]);
    setProtests(protestData);
    setEnquiries(enquiryData);
    setLoading(false);
  };

  const handleFileProtest = async () => {
    if (!protestForm.filed_by_name || !protestForm.incident_description) return;
    const result = await createProtest({
      event_id: eventId,
      club_id: clubId,
      filed_by_user_id: user?.id || null,
      ...protestForm,
      protestee_sail_number: protestForm.protestee_sail_number || null,
      protestee_name: protestForm.protestee_name || null,
      rules_alleged_broken: protestForm.rules_alleged_broken || null,
      witnesses: protestForm.witnesses || null,
      hearing_time: null,
      hearing_location: null,
      decision: null,
      decision_summary: null,
      penalty_applied: null,
      decided_at: null,
      decided_by: null,
      protest_time_limit: null,
    });
    if (result.success) {
      setShowFileForm(false);
      setProtestForm({
        protest_type: 'boat_vs_boat',
        filed_by_name: profile?.full_name || '',
        filed_by_sail_number: '',
        protestee_sail_number: '',
        protestee_name: '',
        race_number: 1,
        incident_description: '',
        rules_alleged_broken: '',
        witnesses: '',
      });
      await loadData();
    }
  };

  const handleFileEnquiry = async () => {
    if (!enquiryForm.submitted_by_name || !enquiryForm.description) return;
    const result = await createScoringEnquiry({
      event_id: eventId,
      club_id: clubId,
      submitted_by_user_id: user?.id || null,
      ...enquiryForm,
    });
    if (result.success) {
      setShowEnquiryForm(false);
      setEnquiryForm({
        submitted_by_name: profile?.full_name || '',
        sail_number: '',
        race_number: 1,
        issue_type: 'wrong_position',
        description: '',
      });
      await loadData();
    }
  };

  const handleAdminUpdate = async (protestId: string) => {
    const updates: Partial<EventProtest> = {};
    if (adminEdit.status) updates.status = adminEdit.status;
    if (adminEdit.hearing_time) updates.hearing_time = new Date(adminEdit.hearing_time).toISOString();
    if (adminEdit.hearing_location) updates.hearing_location = adminEdit.hearing_location;
    if (adminEdit.decision) updates.decision = adminEdit.decision;
    if (adminEdit.decision_summary) updates.decision_summary = adminEdit.decision_summary;
    if (adminEdit.penalty_applied) updates.penalty_applied = adminEdit.penalty_applied;
    if (adminEdit.status === 'decided') {
      updates.decided_at = new Date().toISOString();
      updates.decided_by = profile?.full_name || 'Admin';
    }

    const result = await updateProtest(protestId, updates);
    if (result.success) {
      setEditingId(null);
      await loadData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filed': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'heard': return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400';
      case 'decided': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'withdrawn': return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
      case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'under_review': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'resolved': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'rejected': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getProtestTypeLabel = (type: string) => {
    switch (type) {
      case 'boat_vs_boat': return 'Boat vs Boat';
      case 'race_committee': return 'Race Committee';
      case 'redress_request': return 'Redress Request';
      case 'scoring_enquiry': return 'Scoring Enquiry';
      default: return type;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className={`rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className={`w-5 h-5 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Protest Board
            </h2>
            {eventName && (
              <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                - {eventName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => activeTab === 'protests' ? setShowFileForm(true) : setShowEnquiryForm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {activeTab === 'protests' ? 'File Protest' : 'Submit Enquiry'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setActiveTab('protests')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'protests'
                ? darkMode ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'
                : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Protests ({protests.length})
          </button>
          <button
            onClick={() => setActiveTab('enquiries')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'enquiries'
                ? darkMode ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-700'
                : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Score Reviews ({enquiries.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Loading...
          </div>
        ) : activeTab === 'protests' ? (
          <>
            {/* File Protest Form */}
            {showFileForm && (
              <div className={`mb-4 p-4 rounded-lg border ${darkMode ? 'bg-slate-750 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>File a Protest</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Type</label>
                    <select
                      value={protestForm.protest_type}
                      onChange={(e) => setProtestForm(p => ({ ...p, protest_type: e.target.value as any }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    >
                      <option value="boat_vs_boat">Boat vs Boat</option>
                      <option value="race_committee">Race Committee</option>
                      <option value="redress_request">Redress Request</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Race Number</label>
                    <input
                      type="number"
                      min={1}
                      value={protestForm.race_number}
                      onChange={(e) => setProtestForm(p => ({ ...p, race_number: parseInt(e.target.value) || 1 }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Your Name</label>
                    <input
                      type="text"
                      value={protestForm.filed_by_name}
                      onChange={(e) => setProtestForm(p => ({ ...p, filed_by_name: e.target.value }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Your Sail Number</label>
                    <input
                      type="text"
                      value={protestForm.filed_by_sail_number}
                      onChange={(e) => setProtestForm(p => ({ ...p, filed_by_sail_number: e.target.value }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  {protestForm.protest_type === 'boat_vs_boat' && (
                    <>
                      <div>
                        <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Protestee Name</label>
                        <input
                          type="text"
                          value={protestForm.protestee_name}
                          onChange={(e) => setProtestForm(p => ({ ...p, protestee_name: e.target.value }))}
                          className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                        />
                      </div>
                      <div>
                        <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Protestee Sail Number</label>
                        <input
                          type="text"
                          value={protestForm.protestee_sail_number}
                          onChange={(e) => setProtestForm(p => ({ ...p, protestee_sail_number: e.target.value }))}
                          className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                        />
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2">
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Incident Description</label>
                    <textarea
                      rows={3}
                      value={protestForm.incident_description}
                      onChange={(e) => setProtestForm(p => ({ ...p, incident_description: e.target.value }))}
                      placeholder="Describe the incident..."
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Rules Alleged Broken</label>
                    <input
                      type="text"
                      value={protestForm.rules_alleged_broken}
                      onChange={(e) => setProtestForm(p => ({ ...p, rules_alleged_broken: e.target.value }))}
                      placeholder="e.g. Rule 10, 11, 18.2"
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Witnesses</label>
                    <input
                      type="text"
                      value={protestForm.witnesses}
                      onChange={(e) => setProtestForm(p => ({ ...p, witnesses: e.target.value }))}
                      placeholder="Names of witnesses"
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setShowFileForm(false)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFileProtest}
                    disabled={!protestForm.filed_by_name || !protestForm.incident_description}
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Submit Protest
                  </button>
                </div>
              </div>
            )}

            {/* Protests List */}
            {protests.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <Gavel className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No protests filed for this event.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {protests.map((protest) => (
                  <div
                    key={protest.id}
                    className={`rounded-lg border p-3 ${darkMode ? 'border-slate-700 bg-slate-750' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(protest.status)}`}>
                            {protest.status.charAt(0).toUpperCase() + protest.status.slice(1)}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                            {getProtestTypeLabel(protest.protest_type)}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Race {protest.race_number}
                          </span>
                        </div>
                        <div className={`mt-1 text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {protest.filed_by_name} {protest.filed_by_sail_number ? `(${protest.filed_by_sail_number})` : ''}
                          {protest.protest_type === 'boat_vs_boat' && protest.protestee_name && (
                            <span className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {' '}vs {protest.protestee_name} {protest.protestee_sail_number ? `(${protest.protestee_sail_number})` : ''}
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Filed {formatDateTime(protest.created_at)}
                          {protest.rules_alleged_broken && ` | Rules: ${protest.rules_alleged_broken}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setExpandedId(expandedId === protest.id ? null : protest.id)}
                          className={`p-1 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}
                        >
                          {expandedId === protest.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => deleteProtest(protest.id).then(loadData)}
                            className={`p-1 rounded text-red-500 ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {expandedId === protest.id && (
                      <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                        <div className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          <p className="mb-2">{protest.incident_description}</p>
                          {protest.witnesses && (
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Witnesses: {protest.witnesses}</p>
                          )}
                        </div>

                        {/* Hearing info */}
                        {(protest.hearing_time || protest.hearing_location) && (
                          <div className={`mt-2 p-2 rounded ${darkMode ? 'bg-slate-700' : 'bg-blue-50'}`}>
                            <p className={`text-xs font-medium ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                              <Calendar className="w-3 h-3 inline mr-1" />
                              Hearing: {formatDateTime(protest.hearing_time)}
                              {protest.hearing_location && ` at ${protest.hearing_location}`}
                            </p>
                          </div>
                        )}

                        {/* Decision */}
                        {protest.decision && (
                          <div className={`mt-2 p-2 rounded ${darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                            <p className={`text-xs font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>Decision:</p>
                            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{protest.decision_summary || protest.decision}</p>
                            {protest.penalty_applied && (
                              <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>Penalty: {protest.penalty_applied}</p>
                            )}
                            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              Decided by {protest.decided_by} on {formatDateTime(protest.decided_at)}
                            </p>
                          </div>
                        )}

                        {/* Admin actions */}
                        {isAdmin && editingId !== protest.id && (
                          <button
                            onClick={() => {
                              setEditingId(protest.id);
                              setAdminEdit({
                                status: protest.status,
                                hearing_time: protest.hearing_time ? new Date(protest.hearing_time).toISOString().slice(0, 16) : '',
                                hearing_location: protest.hearing_location || '',
                                decision: protest.decision || '',
                                decision_summary: protest.decision_summary || '',
                                penalty_applied: protest.penalty_applied || '',
                              });
                            }}
                            className={`mt-2 flex items-center gap-1 text-xs font-medium ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}
                          >
                            <Edit3 className="w-3 h-3" /> Manage Protest
                          </button>
                        )}

                        {isAdmin && editingId === protest.id && (
                          <div className={`mt-3 p-3 rounded-lg border ${darkMode ? 'border-slate-600 bg-slate-700' : 'border-slate-300 bg-white'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</label>
                                <select
                                  value={adminEdit.status}
                                  onChange={(e) => setAdminEdit(a => ({ ...a, status: e.target.value as any }))}
                                  className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-300'}`}
                                >
                                  <option value="filed">Filed</option>
                                  <option value="scheduled">Scheduled</option>
                                  <option value="heard">Heard</option>
                                  <option value="decided">Decided</option>
                                  <option value="withdrawn">Withdrawn</option>
                                </select>
                              </div>
                              <div>
                                <label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Hearing Time</label>
                                <input
                                  type="datetime-local"
                                  value={adminEdit.hearing_time}
                                  onChange={(e) => setAdminEdit(a => ({ ...a, hearing_time: e.target.value }))}
                                  className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-300'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Hearing Location</label>
                                <input
                                  type="text"
                                  value={adminEdit.hearing_location}
                                  onChange={(e) => setAdminEdit(a => ({ ...a, hearing_location: e.target.value }))}
                                  className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-300'}`}
                                />
                              </div>
                              <div>
                                <label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Penalty Applied</label>
                                <input
                                  type="text"
                                  value={adminEdit.penalty_applied}
                                  onChange={(e) => setAdminEdit(a => ({ ...a, penalty_applied: e.target.value }))}
                                  placeholder="e.g. DSQ, 20% scoring penalty"
                                  className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-300'}`}
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Decision Summary</label>
                                <textarea
                                  rows={2}
                                  value={adminEdit.decision_summary}
                                  onChange={(e) => setAdminEdit(a => ({ ...a, decision_summary: e.target.value }))}
                                  className={`w-full mt-0.5 px-2 py-1.5 rounded border text-sm ${darkMode ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-300'}`}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <button onClick={() => setEditingId(null)} className={`px-2 py-1 text-xs rounded ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                Cancel
                              </button>
                              <button
                                onClick={() => handleAdminUpdate(protest.id)}
                                className="px-3 py-1 bg-sky-600 text-white text-xs rounded font-medium"
                              >
                                Save Changes
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Score Review Form */}
            {showEnquiryForm && (
              <div className={`mb-4 p-4 rounded-lg border ${darkMode ? 'bg-slate-750 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Submit Score Review</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Your Name</label>
                    <input
                      type="text"
                      value={enquiryForm.submitted_by_name}
                      onChange={(e) => setEnquiryForm(f => ({ ...f, submitted_by_name: e.target.value }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Sail Number</label>
                    <input
                      type="text"
                      value={enquiryForm.sail_number}
                      onChange={(e) => setEnquiryForm(f => ({ ...f, sail_number: e.target.value }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Race Number</label>
                    <input
                      type="number"
                      min={1}
                      value={enquiryForm.race_number}
                      onChange={(e) => setEnquiryForm(f => ({ ...f, race_number: parseInt(e.target.value) || 1 }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                  <div>
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Issue Type</label>
                    <select
                      value={enquiryForm.issue_type}
                      onChange={(e) => setEnquiryForm(f => ({ ...f, issue_type: e.target.value as any }))}
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    >
                      <option value="wrong_position">Wrong Position</option>
                      <option value="missing_result">Missing Result</option>
                      <option value="wrong_penalty">Wrong Penalty</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Description</label>
                    <textarea
                      rows={2}
                      value={enquiryForm.description}
                      onChange={(e) => setEnquiryForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Describe the scoring issue..."
                      className={`w-full mt-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300'}`}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button onClick={() => setShowEnquiryForm(false)} className={`px-3 py-1.5 rounded-lg text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Cancel</button>
                  <button
                    onClick={handleFileEnquiry}
                    disabled={!enquiryForm.submitted_by_name || !enquiryForm.description || !enquiryForm.sail_number}
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Submit Review
                  </button>
                </div>
              </div>
            )}

            {/* Enquiries List */}
            {enquiries.length === 0 ? (
              <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No score reviews submitted.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {enquiries.map((enquiry) => (
                  <div
                    key={enquiry.id}
                    className={`rounded-lg border p-3 ${darkMode ? 'border-slate-700 bg-slate-750' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getStatusColor(enquiry.status)}`}>
                            {enquiry.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Race {enquiry.race_number}</span>
                          <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{enquiry.issue_type.replace('_', ' ')}</span>
                        </div>
                        <p className={`text-sm mt-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {enquiry.submitted_by_name} ({enquiry.sail_number}): {enquiry.description}
                        </p>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          Submitted {formatDateTime(enquiry.created_at)}
                        </p>
                        {enquiry.resolution && (
                          <div className={`mt-2 p-2 rounded ${darkMode ? 'bg-emerald-900/20' : 'bg-emerald-50'}`}>
                            <p className={`text-xs ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                              Resolution: {enquiry.resolution}
                            </p>
                          </div>
                        )}
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          {enquiry.status === 'pending' && (
                            <button
                              onClick={async () => {
                                await updateScoringEnquiry(enquiry.id, { status: 'resolved', resolution: 'Reviewed and corrected', resolved_by: profile?.full_name || 'Admin', resolved_at: new Date().toISOString() });
                                await loadData();
                              }}
                              className="p-1 rounded text-emerald-500"
                              title="Mark resolved"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteScoringEnquiry(enquiry.id).then(loadData)}
                            className="p-1 rounded text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
