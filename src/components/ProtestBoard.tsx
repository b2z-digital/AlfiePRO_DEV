import React, { useState, useEffect } from 'react';
import { TriangleAlert as AlertTriangle, Plus, Clock, CircleCheck as CheckCircle, Circle as XCircle, Calendar, MapPin, Gavel, FileText, ChevronDown, ChevronUp, MessageSquare, Trash2, CreditCard as Edit3, Search, Pencil, Bot, Image as ImageIcon } from 'lucide-react';
import {
  getProtests, createProtest, updateProtest, deleteProtest,
  getScoringEnquiries, createScoringEnquiry, updateScoringEnquiry, deleteScoringEnquiry,
  EventProtest, ScoringEnquiry
} from '../utils/protestStorage';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { RaceScenarioCanvas } from './ask-alfie/RaceScenarioCanvas';
import { AskAlfieChatPanel, ProtestFilingData } from './ask-alfie/AskAlfieChatPanel';

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
  const { user } = useAuth();
  const [userName, setUserName] = useState('');
  const [activeTab, setActiveTab] = useState<'protests' | 'enquiries'>('protests');
  const [protests, setProtests] = useState<EventProtest[]>([]);
  const [enquiries, setEnquiries] = useState<ScoringEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFileForm, setShowFileForm] = useState(false);
  const [showEnquiryForm, setShowEnquiryForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDiagramCanvas, setShowDiagramCanvas] = useState(false);
  const [showAlfiePanel, setShowAlfiePanel] = useState<string | null>(null);
  const [diagramImage, setDiagramImage] = useState<string | null>(null);
  const [alfieContext, setAlfieContext] = useState<string>('');

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
    if (!user) return;
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle().then(({ data }) => {
      const name = data?.full_name || user.email || '';
      setUserName(name);
      setProtestForm(prev => ({ ...prev, filed_by_name: name }));
      setEnquiryForm(prev => ({ ...prev, submitted_by_name: name }));
    });
  }, [user]);

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
      diagram_image: diagramImage,
      alfie_ruling: pendingAlfieData?.ruling || null,
      alfie_ruling_confidence: pendingAlfieData?.confidence || null,
      alfie_rules_cited: pendingAlfieData?.rulesCited || null,
    });
    if (result.success) {
      setShowFileForm(false);
      setDiagramImage(null);
      setPendingAlfieData(null);
      setProtestForm({
        protest_type: 'boat_vs_boat',
        filed_by_name: userName || '',
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
        submitted_by_name: userName || '',
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
      updates.decided_by = userName || 'Admin';
    }

    const result = await updateProtest(protestId, updates);
    if (result.success) {
      setEditingId(null);
      await loadData();
    }
  };

  const handleDiagramSave = (imageData: string) => {
    setDiagramImage(imageData);
    setShowDiagramCanvas(false);
  };

  const handleAskAlfieForRuling = (protest: EventProtest) => {
    const context = `Protest: ${protest.filed_by_name} (${protest.filed_by_sail_number || 'no sail'}) vs ${protest.protestee_name || 'Race Committee'}. Race ${protest.race_number}. Incident: ${protest.incident_description}. Rules alleged broken: ${protest.rules_alleged_broken || 'not specified'}. Type: ${getProtestTypeLabel(protest.protest_type)}.`;
    setAlfieContext(context);
    setShowAlfiePanel(protest.id);
  };

  // Store Alfie ruling data to attach when submitting the form
  const [pendingAlfieData, setPendingAlfieData] = useState<ProtestFilingData | null>(null);

  const handleAlfieFileProtest = (data: ProtestFilingData) => {
    // Pre-populate the protest form with Alfie's analysis
    setProtestForm(prev => ({
      ...prev,
      filed_by_name: prev.filed_by_name || userName || '',
      incident_description: data.incidentDescription || prev.incident_description,
      rules_alleged_broken: data.rulesCited || prev.rules_alleged_broken,
    }));
    if (data.diagramImage) {
      setDiagramImage(data.diagramImage);
    }
    setPendingAlfieData(data);
    setShowAlfiePanel(null);
    setShowFileForm(true);
  };

  const handleAlfieSaveRuling = async (data: ProtestFilingData) => {
    if (!showAlfiePanel) return;
    await updateProtest(showAlfiePanel, {
      alfie_ruling: data.ruling,
      alfie_ruling_confidence: data.confidence,
      alfie_rules_cited: data.rulesCited || null,
      diagram_image: data.diagramImage || undefined,
    });
    setShowAlfiePanel(null);
    await loadData();
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

  const STATUS_STEPS: EventProtest['status'][] = ['filed', 'scheduled', 'heard', 'decided'];

  const getStatusStepIndex = (status: EventProtest['status']) => {
    if (status === 'withdrawn') return -1;
    return STATUS_STEPS.indexOf(status);
  };

  // Diagram canvas overlay
  if (showDiagramCanvas) {
    return (
      <div className="relative w-full h-[500px] rounded-xl overflow-hidden border border-slate-700">
        <RaceScenarioCanvas
          onSave={(imageData) => handleDiagramSave(imageData)}
          onClose={() => setShowDiagramCanvas(false)}
          darkMode
        />
      </div>
    );
  }

  // AskAlfie panel for ruling
  if (showAlfiePanel) {
    const isNewProtest = showAlfiePanel === 'new';
    const protest = isNewProtest ? null : protests.find(p => p.id === showAlfiePanel);
    return (
      <div className={`rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <Bot className={`w-5 h-5 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {isNewProtest ? 'Ask Alfie - File New Protest' : 'Ask Alfie - Ruling Assistance'}
            </h3>
          </div>
          <button
            onClick={() => setShowAlfiePanel(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Back to Protests
          </button>
        </div>
        {isNewProtest && (
          <div className={`px-4 py-3 border-b ${darkMode ? 'border-slate-700 bg-sky-900/10' : 'border-slate-200 bg-sky-50'}`}>
            <p className={`text-xs ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>
              Describe the incident to Alfie, draw a diagram if needed, then click "File as Protest" on the ruling to create the protest record.
            </p>
          </div>
        )}
        {protest && (
          <div className={`p-4 border-b ${darkMode ? 'border-slate-700 bg-slate-750' : 'border-slate-200 bg-slate-50'}`}>
            <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Protest Context:</p>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {protest.filed_by_name} vs {protest.protestee_name || 'Race Committee'} - Race {protest.race_number}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {protest.incident_description}
            </p>
            {protest.diagram_image && (
              <img src={protest.diagram_image} alt="Incident diagram" className="mt-2 max-h-32 rounded border border-slate-600" />
            )}
          </div>
        )}
        <div className="h-[500px]">
          <AskAlfieChatPanel
            embedded
            darkMode
            onClose={() => setShowAlfiePanel(null)}
            initialMessage={alfieContext ? `I need a ruling on this protest situation. ${alfieContext} What rules apply and what is the likely outcome?` : undefined}
            onFileProtest={protest ? handleAlfieSaveRuling : handleAlfieFileProtest}
          />
        </div>
      </div>
    );
  }

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
            {activeTab === 'protests' && (
              <button
                onClick={() => {
                  setAlfieContext('');
                  setShowAlfiePanel('new');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  darkMode ? 'bg-slate-700 text-sky-400 hover:bg-slate-600' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                }`}
              >
                <Bot className="w-4 h-4" />
                Ask Alfie
              </button>
            )}
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
            <div className="animate-spin w-6 h-6 border-4 border-sky-600 border-t-transparent rounded-full mx-auto mb-2" />
            Loading...
          </div>
        ) : activeTab === 'protests' ? (
          <>
            {/* File Protest Form */}
            {showFileForm && (
              <div className={`mb-4 p-4 rounded-lg border ${darkMode ? 'bg-slate-750 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>File a Protest</h3>
                {pendingAlfieData && (
                  <div className={`mb-3 p-3 rounded-lg border flex items-start gap-2 ${darkMode ? 'bg-sky-900/20 border-sky-700/50' : 'bg-sky-50 border-sky-200'}`}>
                    <Bot className={`w-4 h-4 mt-0.5 flex-shrink-0 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${darkMode ? 'text-sky-300' : 'text-sky-700'}`}>
                        Pre-populated by Alfie (confidence: {pendingAlfieData.confidence})
                      </p>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-sky-400/70' : 'text-sky-600/70'}`}>
                        Review and edit the fields below before submitting.
                      </p>
                    </div>
                    <button
                      onClick={() => setPendingAlfieData(null)}
                      className={`text-xs px-2 py-0.5 rounded ${darkMode ? 'text-sky-400 hover:bg-sky-800/30' : 'text-sky-600 hover:bg-sky-100'}`}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
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

                  {/* Diagram Section */}
                  <div className="md:col-span-2">
                    <label className={`text-xs font-medium ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Incident Diagram</label>
                    <div className="mt-1 flex items-center gap-3">
                      <button
                        onClick={() => setShowDiagramCanvas(true)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          darkMode
                            ? 'border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Pencil className="w-4 h-4" />
                        {diagramImage ? 'Edit Diagram' : 'Draw Diagram'}
                      </button>
                      {diagramImage && (
                        <div className="flex items-center gap-2">
                          <img src={diagramImage} alt="Diagram" className="h-12 rounded border border-slate-600" />
                          <button
                            onClick={() => setDiagramImage(null)}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => { setShowFileForm(false); setDiagramImage(null); setPendingAlfieData(null); }}
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
              <div className="space-y-3">
                {protests.map((protest) => {
                  const stepIndex = getStatusStepIndex(protest.status);

                  return (
                    <div
                      key={protest.id}
                      className={`rounded-lg border ${darkMode ? 'border-slate-700 bg-slate-750' : 'border-slate-200 bg-slate-50'}`}
                    >
                      {/* Status Progress Bar */}
                      {protest.status !== 'withdrawn' && (
                        <div className={`px-3 pt-3 pb-1`}>
                          <div className="flex items-center gap-1">
                            {STATUS_STEPS.map((step, idx) => (
                              <React.Fragment key={step}>
                                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                  idx <= stepIndex
                                    ? 'bg-sky-600 text-white'
                                    : darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'
                                }`}>
                                  {idx < stepIndex ? <CheckCircle className="w-3 h-3" /> : idx + 1}
                                </div>
                                {idx < STATUS_STEPS.length - 1 && (
                                  <div className={`flex-1 h-0.5 ${
                                    idx < stepIndex
                                      ? 'bg-sky-600'
                                      : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                                  }`} />
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                          <div className="flex justify-between mt-0.5">
                            {STATUS_STEPS.map((step) => (
                              <span key={step} className={`text-[9px] capitalize ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                {step}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3">
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
                              {protest.diagram_image && (
                                <span className={`text-xs flex items-center gap-0.5 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}>
                                  <ImageIcon className="w-3 h-3" /> Diagram
                                </span>
                              )}
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
                            {isAdmin && (
                              <button
                                onClick={() => handleAskAlfieForRuling(protest)}
                                className={`p-1.5 rounded transition-colors ${darkMode ? 'hover:bg-slate-700 text-sky-400' : 'hover:bg-slate-200 text-sky-600'}`}
                                title="Ask Alfie for ruling"
                              >
                                <Bot className="w-4 h-4" />
                              </button>
                            )}
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

                            {/* Diagram */}
                            {protest.diagram_image && (
                              <div className={`mt-3 p-3 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                                <p className={`text-xs font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Incident Diagram:</p>
                                <img
                                  src={protest.diagram_image}
                                  alt="Incident diagram"
                                  className="max-w-full max-h-48 rounded border border-slate-600"
                                />
                              </div>
                            )}

                            {/* AskAlfie Ruling */}
                            {protest.alfie_ruling && (
                              <div className={`mt-3 p-3 rounded-lg border ${darkMode ? 'bg-sky-900/20 border-sky-800/50' : 'bg-sky-50 border-sky-200'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <Bot className={`w-4 h-4 ${darkMode ? 'text-sky-400' : 'text-sky-600'}`} />
                                  <p className={`text-xs font-semibold ${darkMode ? 'text-sky-400' : 'text-sky-700'}`}>
                                    Alfie Ruling Recommendation
                                    {protest.alfie_ruling_confidence && (
                                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] ${
                                        protest.alfie_ruling_confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                        protest.alfie_ruling_confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      }`}>
                                        {protest.alfie_ruling_confidence} confidence
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{protest.alfie_ruling}</p>
                                {protest.alfie_rules_cited && (
                                  <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Rules cited: {protest.alfie_rules_cited}
                                  </p>
                                )}
                              </div>
                            )}

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
                              <div className="flex items-center gap-2 mt-3">
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
                                  className={`flex items-center gap-1 text-xs font-medium ${darkMode ? 'text-sky-400' : 'text-sky-600'}`}
                                >
                                  <Edit3 className="w-3 h-3" /> Manage Protest
                                </button>
                                <button
                                  onClick={() => handleAskAlfieForRuling(protest)}
                                  className={`flex items-center gap-1 text-xs font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                                >
                                  <Bot className="w-3 h-3" /> Ask Alfie for Ruling
                                </button>
                              </div>
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
                    </div>
                  );
                })}
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
                                await updateScoringEnquiry(enquiry.id, { status: 'resolved', resolution: 'Reviewed and corrected', resolved_by: userName || 'Admin', resolved_at: new Date().toISOString() });
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
