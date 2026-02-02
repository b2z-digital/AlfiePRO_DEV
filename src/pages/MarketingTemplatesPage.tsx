import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../contexts/NotificationContext';
import { Plus, Mail, Search, Filter, X, Palette, Trash2 } from 'lucide-react';
import { getMarketingEmailTemplates, createMarketingEmailTemplate, deleteMarketingEmailTemplate } from '../utils/marketingStorage';
import type { MarketingEmailTemplate } from '../types/marketing';

interface MarketingTemplatesPageProps {
  darkMode?: boolean;
}

export default function MarketingTemplatesPage({ darkMode = true }: MarketingTemplatesPageProps) {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [templates, setTemplates] = useState<MarketingEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateCategory, setTemplateCategory] = useState('general');

  useEffect(() => {
    loadData();
  }, [currentClub]);

  async function loadData() {
    try {
      setLoading(true);
      const templatesData = await getMarketingEmailTemplates(currentClub?.clubId);
      setTemplates(templatesData);
    } catch (error) {
      console.error('Error loading templates:', error);
      addNotification('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setTemplateName('');
    setTemplateDescription('');
    setTemplateCategory('general');
    setShowCreateModal(true);
  }

  async function handleCreateTemplate() {
    if (!currentClub) {
      addNotification('Please select a club first', 'error');
      return;
    }

    if (!templateName.trim()) {
      addNotification('Please enter a template name', 'warning');
      return;
    }

    try {
      console.log('Creating template with data:', {
        club_id: currentClub.clubId,
        name: templateName,
        description: templateDescription || null,
        category: templateCategory,
        email_content_json: { rows: [] },
        email_content_html: '',
        is_public: false
      });

      const newTemplate = await createMarketingEmailTemplate({
        club_id: currentClub.clubId,
        name: templateName,
        description: templateDescription || null,
        category: templateCategory,
        email_content_json: { rows: [] } as any,
        email_content_html: '',
        is_public: false
      });

      addNotification('Template created successfully', 'success');
      setShowCreateModal(false);

      // Reload templates list to show the new template
      await loadData();
    } catch (error: any) {
      console.error('Error creating template:', error);
      console.error('Error details:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      const errorMessage = error?.message || 'Failed to create template';
      addNotification(errorMessage, 'error');
    }
  }

  async function handleUseTemplate(template: MarketingEmailTemplate) {
    // For now, just navigate to campaigns page - they can create a campaign there
    addNotification('Template ready to use. Go to Campaigns to create a campaign with this template.', 'info');
    navigate('/marketing/campaigns');
  }

  function handleEditTemplate(template: MarketingEmailTemplate) {
    navigate(`/marketing/templates/${template.id}/edit`);
  }

  async function handleDeleteTemplate(template: MarketingEmailTemplate) {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${template.name}"? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      await deleteMarketingEmailTemplate(template.id);
      addNotification('Template deleted successfully', 'success');
      await loadData();
    } catch (error) {
      console.error('Error deleting template:', error);
      addNotification('Failed to delete template', 'error');
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (template.description && template.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'event', label: 'Event' },
    { value: 'newsletter', label: 'Newsletter' },
    { value: 'announcement', label: 'Announcement' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-16 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Email Templates
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Browse and create beautiful email templates
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5" />
            Create Template
          </button>
          <button
            onClick={() => navigate('/marketing')}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Back to Marketing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={`rounded-xl p-4 ${
        darkMode
          ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
          : 'bg-white shadow-sm border border-gray-200'
      }`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`group rounded-xl overflow-hidden transition-all ${
                darkMode
                  ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:border-slate-600 hover:shadow-xl hover:shadow-blue-500/10'
                  : 'bg-white shadow-sm border border-gray-200 hover:border-blue-200 hover:shadow-lg'
              }`}
            >
              {/* Template Preview */}
              <div className={`relative w-full h-64 overflow-hidden ${
                darkMode ? 'bg-slate-900/50' : 'bg-gray-50'
              }`}>
                {template.email_content_html && template.email_content_html.trim() ? (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="w-full h-full" style={{
                      transform: 'scale(0.25)',
                      transformOrigin: 'top left',
                      width: '400%',
                      height: '400%'
                    }}>
                      <iframe
                        srcDoc={template.email_content_html}
                        title={`Preview of ${template.name}`}
                        className="w-full h-full border-0 bg-white"
                        sandbox="allow-same-origin"
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
                    {/* Overlay gradient for better text visibility */}
                    <div className={`absolute inset-0 ${
                      darkMode
                        ? 'bg-gradient-to-t from-slate-800/80 via-transparent to-transparent'
                        : 'bg-gradient-to-t from-white/80 via-transparent to-transparent'
                    }`} />
                  </div>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${
                    darkMode
                      ? 'bg-gradient-to-br from-slate-800 to-slate-900'
                      : 'bg-gradient-to-br from-gray-100 to-gray-200'
                  }`}>
                    <div className="text-center">
                      <Mail className={`w-16 h-16 mx-auto mb-2 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
                      <p className={`text-sm ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                        Blank Template
                      </p>
                    </div>
                  </div>
                )}

                {/* Hover Actions Overlay */}
                <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
                  darkMode ? 'bg-slate-900/80' : 'bg-white/90'
                } backdrop-blur-sm`}>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg"
                    >
                      <Palette className="w-4 h-4" />
                      Edit Template
                    </button>
                    <button
                      onClick={() => handleUseTemplate(template)}
                      className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                        darkMode
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Use Template
                    </button>
                  </div>
                </div>
              </div>

              {/* Template Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className={`font-semibold text-base flex-1 line-clamp-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {template.name}
                  </h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      darkMode ? 'bg-slate-700 text-slate-300' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {template.category}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTemplate(template);
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-red-500/20 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-600'
                      }`}
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {template.description && (
                  <p className={`text-sm line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    {template.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl p-12 text-center ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <Mail className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            No templates found
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            {searchTerm || selectedCategory !== 'all'
              ? 'Try adjusting your filters'
              : 'Create your first template to get started'}
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5" />
            Create Template
          </button>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`max-w-2xl w-full rounded-xl p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Palette className="w-5 h-5 text-white" />
                </div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Create New Template
                </h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Welcome Email, Event Announcement"
                  className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Brief description of this template..."
                  className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Category *
                </label>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTemplate}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Palette className="w-4 h-4" />
                Create & Design
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
