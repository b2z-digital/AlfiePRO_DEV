import { useState, useEffect } from 'react';
import {
  HelpCircle, Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, GripVertical, Search, FolderPlus, Save, X,
  ThumbsUp, ThumbsDown, Tag,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { faqStorage } from '../../utils/helpSupportStorage';
import { PLATFORM_AREAS } from '../../types/helpSupport';
import type { SupportFaqCategory, SupportFaq } from '../../types/helpSupport';

interface Props {
  darkMode?: boolean;
  onNotify: (message: string, type: 'success' | 'error') => void;
}

export default function FaqManagement({ darkMode = false, onNotify }: Props) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<SupportFaqCategory[]>([]);
  const [faqs, setFaqs] = useState<SupportFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SupportFaqCategory | null>(null);
  const [editingFaq, setEditingFaq] = useState<SupportFaq | null>(null);

  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', icon: 'HelpCircle', is_active: true });
  const [faqForm, setFaqForm] = useState({
    category_id: '' as string | null,
    question: '',
    answer: '',
    platform_area: 'general',
    tags: [] as string[],
    is_published: false,
    sort_order: 0,
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, faqList] = await Promise.all([
        faqStorage.getCategories(),
        faqStorage.getFaqs(),
      ]);
      setCategories(cats);
      setFaqs(faqList);
      if (cats.length > 0 && expandedCategories.size === 0) {
        setExpandedCategories(new Set([cats[0].id]));
      }
    } catch (err: any) {
      onNotify(err.message || 'Failed to load FAQs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openCategoryModal = (cat?: SupportFaqCategory) => {
    if (cat) {
      setEditingCategory(cat);
      setCategoryForm({ name: cat.name, description: cat.description, icon: cat.icon, is_active: cat.is_active });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', icon: 'HelpCircle', is_active: true });
    }
    setShowCategoryModal(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) { onNotify('Category name is required', 'error'); return; }
    try {
      if (editingCategory) {
        await faqStorage.updateCategory(editingCategory.id, categoryForm);
        onNotify('Category updated', 'success');
      } else {
        await faqStorage.createCategory(categoryForm);
        onNotify('Category created', 'success');
      }
      setShowCategoryModal(false);
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save category', 'error');
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category? FAQs in it will become uncategorized.')) return;
    try {
      await faqStorage.deleteCategory(id);
      onNotify('Category deleted', 'success');
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to delete category', 'error');
    }
  };

  const openFaqModal = (faq?: SupportFaq, categoryId?: string) => {
    if (faq) {
      setEditingFaq(faq);
      setFaqForm({
        category_id: faq.category_id,
        question: faq.question,
        answer: faq.answer,
        platform_area: faq.platform_area || 'general',
        tags: faq.tags || [],
        is_published: faq.is_published,
        sort_order: faq.sort_order,
      });
    } else {
      setEditingFaq(null);
      setFaqForm({
        category_id: categoryId || null,
        question: '',
        answer: '',
        platform_area: 'general',
        tags: [],
        is_published: false,
        sort_order: faqs.filter(f => f.category_id === categoryId).length,
      });
    }
    setTagInput('');
    setShowFaqModal(true);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !faqForm.tags.includes(t)) {
      setFaqForm(prev => ({ ...prev, tags: [...prev.tags, t] }));
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setFaqForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const saveFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      onNotify('Question and answer are required', 'error');
      return;
    }
    try {
      if (editingFaq) {
        await faqStorage.updateFaq(editingFaq.id, faqForm);
        onNotify('FAQ updated', 'success');
      } else {
        await faqStorage.createFaq({ ...faqForm, created_by: user?.id });
        onNotify('FAQ created', 'success');
      }
      setShowFaqModal(false);
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save FAQ', 'error');
    }
  };

  const deleteFaq = async (id: string) => {
    if (!confirm('Delete this FAQ?')) return;
    try {
      await faqStorage.deleteFaq(id);
      onNotify('FAQ deleted', 'success');
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to delete FAQ', 'error');
    }
  };

  const togglePublished = async (faq: SupportFaq) => {
    try {
      await faqStorage.updateFaq(faq.id, { is_published: !faq.is_published });
      loadData();
    } catch (err: any) {
      onNotify(err.message || 'Failed to update FAQ', 'error');
    }
  };

  const filteredFaqs = searchQuery
    ? faqs.filter(f =>
        f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.tags?.some(t => t.includes(searchQuery.toLowerCase()))
      )
    : faqs;

  const uncategorizedFaqs = filteredFaqs.filter(f => !f.category_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">FAQ Management</h2>
          <p className="text-sm text-slate-400 mt-1">{faqs.length} FAQs across {categories.length} categories</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search FAQs..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>
          <button onClick={() => openCategoryModal()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
            <FolderPlus size={16} />
            Add Category
          </button>
          <button onClick={() => openFaqModal()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm transition-colors">
            <Plus size={16} />
            Add FAQ
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {categories.map(cat => {
          const catFaqs = filteredFaqs.filter(f => f.category_id === cat.id);
          const isExpanded = expandedCategories.has(cat.id);
          return (
            <div key={cat.id} className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-700/30 transition-colors"
                onClick={() => toggleCategory(cat.id)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  <HelpCircle size={18} className="text-sky-400" />
                  <span className="font-semibold text-white">{cat.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">{catFaqs.length}</span>
                  {!cat.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Hidden</span>}
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openFaqModal(undefined, cat.id)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
                    <Plus size={16} />
                  </button>
                  <button onClick={() => openCategoryModal(cat)} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => deleteCategory(cat.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-slate-700/50">
                  {catFaqs.length === 0 ? (
                    <div className="px-5 py-8 text-center text-slate-500 text-sm">
                      No FAQs in this category yet.
                      <button onClick={() => openFaqModal(undefined, cat.id)} className="text-sky-400 hover:text-sky-300 ml-1">Add one</button>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/30">
                      {catFaqs.map(faq => (
                        <FaqRow key={faq.id} faq={faq} onEdit={() => openFaqModal(faq)} onDelete={() => deleteFaq(faq.id)} onTogglePublish={() => togglePublished(faq)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {uncategorizedFaqs.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/50">
              <span className="font-semibold text-slate-400">Uncategorized ({uncategorizedFaqs.length})</span>
            </div>
            <div className="divide-y divide-slate-700/30">
              {uncategorizedFaqs.map(faq => (
                <FaqRow key={faq.id} faq={faq} onEdit={() => openFaqModal(faq)} onDelete={() => deleteFaq(faq.id)} onTogglePublish={() => togglePublished(faq)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-bold text-white">{editingCategory ? 'Edit Category' : 'New Category'}</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g., Getting Started"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 h-20 resize-none"
                  placeholder="Brief description..."
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={categoryForm.is_active}
                  onChange={e => setCategoryForm(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-700"
                />
                <span className="text-sm text-slate-300">Active (visible to users)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700">
              <button onClick={() => setShowCategoryModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
              <button onClick={saveCategory} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">
                <Save size={16} />
                {editingCategory ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFaqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
              <h3 className="text-lg font-bold text-white">{editingFaq ? 'Edit FAQ' : 'New FAQ'}</h3>
              <button onClick={() => setShowFaqModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                  <select
                    value={faqForm.category_id || ''}
                    onChange={e => setFaqForm(prev => ({ ...prev, category_id: e.target.value || null }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Platform Area</label>
                  <select
                    value={faqForm.platform_area}
                    onChange={e => setFaqForm(prev => ({ ...prev, platform_area: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PLATFORM_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Question</label>
                <input
                  type="text"
                  value={faqForm.question}
                  onChange={e => setFaqForm(prev => ({ ...prev, question: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="What is the question?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Answer</label>
                <textarea
                  value={faqForm.answer}
                  onChange={e => setFaqForm(prev => ({ ...prev, answer: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500 h-40 resize-none"
                  placeholder="Provide a detailed answer..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    className="flex-1 px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Add a tag and press Enter"
                  />
                  <button onClick={addTag} className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">
                    <Tag size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {faqForm.tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-white"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={faqForm.is_published}
                    onChange={e => setFaqForm(prev => ({ ...prev, is_published: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-sky-500 bg-slate-700"
                  />
                  <span className="text-sm text-slate-300">Published (visible to users)</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400">Order:</label>
                  <input
                    type="number"
                    value={faqForm.sort_order}
                    onChange={e => setFaqForm(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-3 py-1.5 rounded-lg bg-slate-700/50 border border-slate-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700 sticky bottom-0 bg-slate-800">
              <button onClick={() => setShowFaqModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Cancel</button>
              <button onClick={saveFaq} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm">
                <Save size={16} />
                {editingFaq ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FaqRow({ faq, onEdit, onDelete, onTogglePublish }: {
  faq: SupportFaq;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-700/20 transition-colors group">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <GripVertical size={16} className="text-slate-600 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{faq.question}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{faq.answer.replace(/<[^>]*>/g, '').slice(0, 100)}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {faq.tags?.map(tag => (
              <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{tag}</span>
            ))}
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Eye size={12} /> {faq.view_count}
            </span>
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <ThumbsUp size={12} /> {faq.helpful_count}
            </span>
            <span className="text-xs text-red-400 flex items-center gap-1">
              <ThumbsDown size={12} /> {faq.not_helpful_count}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={onTogglePublish}
          className={`p-1.5 rounded-lg transition-colors ${faq.is_published ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-slate-500 hover:bg-slate-600'}`}
          title={faq.is_published ? 'Published' : 'Draft'}
        >
          {faq.is_published ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-600 text-slate-400 hover:text-white transition-colors">
          <Edit2 size={16} />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
