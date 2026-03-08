import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Edit2, Trash2, Eye, EyeOff, X,
  AlertCircle, CheckCircle2, MoreVertical, MessageSquare,
  ArrowUpCircle, ArrowRightCircle, ArrowDownCircle, RefreshCw
} from 'lucide-react';
import {
  AlfieKnowledgeCorrection, getCorrections, createCorrection,
  updateCorrection, deleteCorrection, getBoatTypes,
  TUNING_GUIDE_TOPICS
} from '../../utils/alfieKnowledgeStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface CorrectionsTabProps {
  darkMode: boolean;
}

const emptyForm = {
  topic: 'general',
  boat_type: '',
  scenario: '',
  incorrect_response: '',
  correct_information: '',
  priority: 'medium' as 'high' | 'medium' | 'low'
};

export default function CorrectionsTab({ darkMode }: CorrectionsTabProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const [corrections, setCorrections] = useState<AlfieKnowledgeCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBoatType, setFilterBoatType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [boatTypes, setBoatTypes] = useState<string[]>([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCorrection, setEditingCorrection] = useState<AlfieKnowledgeCorrection | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [correctionToDelete, setCorrectionToDelete] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [correctionsData, boatTypesData] = await Promise.all([
        getCorrections(),
        getBoatTypes()
      ]);
      setCorrections(correctionsData);
      setBoatTypes(boatTypesData);
    } catch (err) {
      console.error('Error loading corrections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingCorrection(null);
    setFormData(emptyForm);
    setShowFormModal(true);
  };

  const handleOpenEdit = (correction: AlfieKnowledgeCorrection) => {
    setEditingCorrection(correction);
    setFormData({
      topic: correction.topic,
      boat_type: correction.boat_type,
      scenario: correction.scenario,
      incorrect_response: correction.incorrect_response,
      correct_information: correction.correct_information,
      priority: correction.priority
    });
    setShowFormModal(true);
    setOpenMenuId(null);
  };

  const handleSave = async () => {
    if (!formData.scenario || !formData.correct_information || !user) return;
    setSaving(true);
    try {
      if (editingCorrection) {
        const updated = await updateCorrection(editingCorrection.id, formData);
        setCorrections(prev => prev.map(c => c.id === updated.id ? updated : c));
        addNotification({ type: 'success', title: 'Correction Updated', message: 'Knowledge correction has been updated.' });
      } else {
        const created = await createCorrection(formData, user.id);
        setCorrections(prev => [created, ...prev]);
        addNotification({ type: 'success', title: 'Correction Created', message: 'New knowledge correction has been added to Alfie\'s knowledge base.' });
      }
      setShowFormModal(false);
      setEditingCorrection(null);
      setFormData(emptyForm);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Save Failed', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (correction: AlfieKnowledgeCorrection) => {
    try {
      const newStatus = correction.status === 'active' ? 'inactive' : 'active';
      const updated = await updateCorrection(correction.id, { status: newStatus });
      setCorrections(prev => prev.map(c => c.id === updated.id ? updated : c));
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleDelete = async () => {
    if (!correctionToDelete) return;
    try {
      await deleteCorrection(correctionToDelete);
      setCorrections(prev => prev.filter(c => c.id !== correctionToDelete));
      addNotification({ type: 'success', title: 'Correction Deleted', message: 'Knowledge correction has been removed.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Delete Failed', message: err.message });
    } finally {
      setDeleteConfirmOpen(false);
      setCorrectionToDelete(null);
    }
  };

  const filteredCorrections = corrections.filter(c => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.scenario.toLowerCase().includes(q) && !c.correct_information.toLowerCase().includes(q) && !c.topic.toLowerCase().includes(q)) return false;
    }
    if (filterBoatType && c.boat_type !== filterBoatType) return false;
    if (filterPriority && c.priority !== filterPriority) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <ArrowUpCircle className="w-4 h-4 text-red-500" />;
      case 'medium': return <ArrowRightCircle className="w-4 h-4 text-yellow-500" />;
      case 'low': return <ArrowDownCircle className="w-4 h-4 text-green-500" />;
      default: return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      low: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[priority] || ''}`}>
        {getPriorityIcon(priority)} {priority}
      </span>
    );
  };

  const formatTopic = (topic: string) => topic.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search corrections..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <select
            value={filterBoatType}
            onChange={e => setFilterBoatType(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">All Boats</option>
            {boatTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Correction
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`w-6 h-6 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        </div>
      ) : filteredCorrections.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
          darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}>
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No corrections found</p>
          <p className="text-sm">Add a knowledge correction to improve Alfie's responses</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCorrections.map(correction => (
            <div
              key={correction.id}
              className={`rounded-xl border transition-colors ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${correction.status === 'inactive' ? 'opacity-60' : ''}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {formatTopic(correction.topic)}
                      </span>
                      {getPriorityBadge(correction.priority)}
                      {correction.boat_type && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {correction.boat_type}
                        </span>
                      )}
                      {correction.status === 'inactive' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          <EyeOff className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setExpandedId(expandedId === correction.id ? null : correction.id)}
                      className="text-left w-full"
                    >
                      <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {correction.scenario}
                      </p>
                    </button>
                    <div className={`flex items-center gap-4 mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <span>Surfaced {correction.times_surfaced} times</span>
                      {correction.last_surfaced_at && (
                        <span>Last: {new Date(correction.last_surfaced_at).toLocaleDateString()}</span>
                      )}
                      <span>Created: {new Date(correction.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleStatus(correction)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                      } ${correction.status === 'active'
                        ? (darkMode ? 'text-green-400' : 'text-green-600')
                        : (darkMode ? 'text-gray-500' : 'text-gray-400')
                      }`}
                      title={correction.status === 'active' ? 'Deactivate' : 'Activate'}
                    >
                      {correction.status === 'active' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === correction.id ? null : correction.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === correction.id && (
                        <div className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-lg border z-10 ${
                          darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                        }`}>
                          <button
                            onClick={() => handleOpenEdit(correction)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                              darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => { setCorrectionToDelete(correction.id); setDeleteConfirmOpen(true); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {expandedId === correction.id && (
                  <div className={`mt-3 pt-3 border-t space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    {correction.incorrect_response && (
                      <div>
                        <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                          Incorrect/Problematic Response:
                        </p>
                        <p className={`text-sm p-3 rounded-lg ${
                          darkMode ? 'bg-red-900/10 text-gray-300 border border-red-900/30' : 'bg-red-50 text-gray-700 border border-red-100'
                        }`}>
                          {correction.incorrect_response}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className={`text-xs font-medium mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                        Correct Information:
                      </p>
                      <p className={`text-sm p-3 rounded-lg ${
                        darkMode ? 'bg-green-900/10 text-gray-300 border border-green-900/30' : 'bg-green-50 text-gray-700 border border-green-100'
                      }`}>
                        {correction.correct_information}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-5 border-b sticky top-0 z-10 ${
              darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {editingCorrection ? 'Edit Knowledge Correction' : 'Add Knowledge Correction'}
              </h3>
              <button onClick={() => { setShowFormModal(false); setEditingCorrection(null); }} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Topic / Category *
                  </label>
                  <select
                    value={formData.topic}
                    onChange={e => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {TUNING_GUIDE_TOPICS.map(t => (
                      <option key={t} value={t}>{formatTopic(t)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Boat Type (optional)
                  </label>
                  <select
                    value={formData.boat_type}
                    onChange={e => setFormData(prev => ({ ...prev, boat_type: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">All Boat Types</option>
                    {boatTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Question / Scenario *
                </label>
                <textarea
                  value={formData.scenario}
                  onChange={e => setFormData(prev => ({ ...prev, scenario: e.target.value }))}
                  placeholder="What was asked or what situation does this correction apply to?"
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Incorrect / Problematic Response
                </label>
                <textarea
                  value={formData.incorrect_response}
                  onChange={e => setFormData(prev => ({ ...prev, incorrect_response: e.target.value }))}
                  placeholder="What did Alfie say that was wrong? (optional)"
                  rows={3}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Correct Information *
                </label>
                <textarea
                  value={formData.correct_information}
                  onChange={e => setFormData(prev => ({ ...prev, correct_information: e.target.value }))}
                  placeholder="What should Alfie know and say instead?"
                  rows={4}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Priority *
                </label>
                <div className="flex items-center gap-3">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setFormData(prev => ({ ...prev, priority: p }))}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        formData.priority === p
                          ? (p === 'high' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                            : p === 'medium' ? 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                            : 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800')
                          : (darkMode ? 'border-gray-600 text-gray-400 hover:border-gray-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')
                      }`}
                    >
                      {getPriorityIcon(p)}
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className={`flex items-center justify-end gap-3 p-5 border-t sticky bottom-0 ${
              darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}>
              <button
                onClick={() => { setShowFormModal(false); setEditingCorrection(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.scenario || !formData.correct_information || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Saving...' : (editingCorrection ? 'Save Changes' : 'Add Correction')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setCorrectionToDelete(null); }}
        onConfirm={handleDelete}
        title="Delete Correction"
        message="This will permanently delete this knowledge correction. This cannot be undone."
        confirmText="Delete"
        confirmStyle="danger"
        darkMode={darkMode}
      />
    </div>
  );
}
