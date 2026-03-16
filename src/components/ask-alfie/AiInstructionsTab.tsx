import React, { useState, useEffect } from 'react';
import { Plus, Search, CreditCard as Edit2, Trash2, Eye, EyeOff, X, RefreshCw, MoveVertical as MoreVertical, Sparkles, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AlfieAiInstruction, getAiInstructions, createAiInstruction,
  updateAiInstruction, deleteAiInstruction,
  AI_INSTRUCTION_CATEGORIES, AI_INSTRUCTION_CATEGORY_LABELS
} from '../../utils/alfieKnowledgeStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface AiInstructionsTabProps {
  darkMode: boolean;
}

const emptyForm = {
  title: '',
  category: 'general' as string,
  instruction_text: '',
  priority: 0
};

const CATEGORY_COLORS: Record<string, { badge: string; icon: string }> = {
  tone_of_voice: {
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    icon: 'text-sky-500'
  },
  response_style: {
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    icon: 'text-teal-500'
  },
  context_rules: {
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: 'text-amber-500'
  },
  persona: {
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    icon: 'text-rose-500'
  },
  boundaries: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: 'text-red-500'
  },
  formatting: {
    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    icon: 'text-cyan-500'
  },
  general: {
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    icon: 'text-gray-500'
  }
};

export default function AiInstructionsTab({ darkMode }: AiInstructionsTabProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const [instructions, setInstructions] = useState<AlfieAiInstruction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<AlfieAiInstruction | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [instructionToDelete, setInstructionToDelete] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAiInstructions();
      setInstructions(data);
    } catch (err) {
      console.error('Error loading AI instructions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingInstruction(null);
    setFormData(emptyForm);
    setShowFormModal(true);
  };

  const handleOpenEdit = (instruction: AlfieAiInstruction) => {
    setEditingInstruction(instruction);
    setFormData({
      title: instruction.title,
      category: instruction.category,
      instruction_text: instruction.instruction_text,
      priority: instruction.priority
    });
    setShowFormModal(true);
    setOpenMenuId(null);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.instruction_text.trim() || !user) return;
    setSaving(true);
    try {
      if (editingInstruction) {
        const updated = await updateAiInstruction(editingInstruction.id, formData, user.id);
        setInstructions(prev => prev.map(i => i.id === updated.id ? updated : i));
        addNotification({ type: 'success', title: 'Instruction Updated', message: 'AI instruction has been updated.' });
      } else {
        const created = await createAiInstruction(formData, user.id);
        setInstructions(prev => [created, ...prev]);
        addNotification({ type: 'success', title: 'Instruction Created', message: 'New AI instruction has been added.' });
      }
      setShowFormModal(false);
      setEditingInstruction(null);
      setFormData(emptyForm);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Save Failed', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (instruction: AlfieAiInstruction) => {
    try {
      const updated = await updateAiInstruction(instruction.id, { is_active: !instruction.is_active }, user?.id);
      setInstructions(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleDelete = async () => {
    if (!instructionToDelete) return;
    try {
      await deleteAiInstruction(instructionToDelete);
      setInstructions(prev => prev.filter(i => i.id !== instructionToDelete));
      addNotification({ type: 'success', title: 'Instruction Deleted', message: 'AI instruction has been removed.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Delete Failed', message: err.message });
    } finally {
      setDeleteConfirmOpen(false);
      setInstructionToDelete(null);
    }
  };

  const filteredInstructions = instructions.filter(i => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!i.title.toLowerCase().includes(q) && !i.instruction_text.toLowerCase().includes(q)) return false;
    }
    if (filterCategory && i.category !== filterCategory) return false;
    if (filterStatus === 'active' && !i.is_active) return false;
    if (filterStatus === 'inactive' && i.is_active) return false;
    return true;
  });

  const getCategoryBadge = (category: string) => {
    const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
    const label = AI_INSTRUCTION_CATEGORY_LABELS[category] || category;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search instructions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
          >
            <option value="">All Categories</option>
            {AI_INSTRUCTION_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{AI_INSTRUCTION_CATEGORY_LABELS[cat]}</option>
            ))}
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
          Add Instruction
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`w-6 h-6 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        </div>
      ) : filteredInstructions.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
          darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}>
          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No instructions found</p>
          <p className="text-sm">Add instructions to shape how Alfie communicates and responds</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInstructions.map(instruction => (
            <div
              key={instruction.id}
              className={`rounded-xl border transition-colors ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${!instruction.is_active ? 'opacity-60' : ''}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === instruction.id ? null : instruction.id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {getCategoryBadge(instruction.category)}
                      {instruction.priority > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-700'
                        }`}>
                          Priority: {instruction.priority}
                        </span>
                      )}
                      {!instruction.is_active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          <EyeOff className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </div>
                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {instruction.title}
                    </p>
                    <p className={`text-sm mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {instruction.instruction_text}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(instruction)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        instruction.is_active
                          ? 'text-green-500 hover:bg-green-500/10'
                          : (darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100')
                      }`}
                      title={instruction.is_active ? 'Disable instruction' : 'Enable instruction'}
                    >
                      {instruction.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === instruction.id ? null : instruction.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                        }`}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === instruction.id && (
                        <div className={`absolute right-0 top-full mt-1 w-36 rounded-lg border shadow-lg z-10 ${
                          darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                        }`}>
                          <button
                            onClick={() => handleOpenEdit(instruction)}
                            className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left ${
                              darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => {
                              setInstructionToDelete(instruction.id);
                              setDeleteConfirmOpen(true);
                              setOpenMenuId(null);
                            }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {expandedId === instruction.id && (
                  <div className={`mt-3 pt-3 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <pre className={`whitespace-pre-wrap text-sm font-sans ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {instruction.instruction_text}
                    </pre>
                    <p className={`text-xs mt-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Created: {new Date(instruction.created_at).toLocaleDateString()}
                      {instruction.updated_at !== instruction.created_at && (
                        <> &middot; Updated: {new Date(instruction.updated_at).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <Sparkles className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {editingInstruction ? 'Edit Instruction' : 'Add AI Instruction'}
                </h2>
              </div>
              <button
                onClick={() => { setShowFormModal(false); setEditingInstruction(null); setFormData(emptyForm); }}
                className={`p-1 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Friendly sailing expert tone"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {AI_INSTRUCTION_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{AI_INSTRUCTION_CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Priority
                  </label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                    min={0}
                    max={100}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Higher priority instructions are applied first (0-100)
                  </p>
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Instruction *
                </label>
                <textarea
                  value={formData.instruction_text}
                  onChange={e => setFormData(prev => ({ ...prev, instruction_text: e.target.value }))}
                  rows={8}
                  placeholder="Write the instruction for Alfie here. For example:&#10;&#10;Always greet the user warmly and use their first name when available.&#10;When discussing sail trim, use practical terminology that club members would understand.&#10;If you don't know the answer, say so honestly rather than guessing."
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
              <div className={`p-3 rounded-lg text-xs ${darkMode ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                <p className="font-medium mb-1">Tips for writing effective instructions:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Be specific and clear about what Alfie should or should not do</li>
                  <li>Use examples where possible to illustrate the desired behaviour</li>
                  <li>Tone of Voice instructions shape how Alfie communicates in every response</li>
                  <li>Context & Usage rules tell Alfie when and how to use specific resources</li>
                  <li>Boundaries define topics Alfie should avoid or redirect</li>
                </ul>
              </div>
            </div>
            <div className={`flex items-center justify-end gap-3 p-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => { setShowFormModal(false); setEditingInstruction(null); setFormData(emptyForm); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.title.trim() || !formData.instruction_text.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
                {editingInstruction ? 'Update Instruction' : 'Add Instruction'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setInstructionToDelete(null); }}
        onConfirm={handleDelete}
        title="Delete AI Instruction"
        message="Are you sure you want to delete this instruction? This will change how Alfie responds."
        confirmLabel="Delete"
        isDangerous
      />
    </div>
  );
}
