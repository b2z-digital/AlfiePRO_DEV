import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, Trash2, Search, FormInput, Eye, Copy, X, ChevronDown, File, Globe, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { RaceForm, RaceFormWithFields, FormField } from '../../types/forms';
import { useNotifications } from '../../contexts/NotificationContext';
import { PublicNorGeneratorSettingsModal } from '../documents/PublicNorGeneratorSettingsModal';

interface RaceDocumentsPageProps {
  darkMode: boolean;
}

export const RaceDocumentsPage: React.FC<RaceDocumentsPageProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<RaceForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewForm, setPreviewForm] = useState<RaceFormWithFields | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formToDelete, setFormToDelete] = useState<RaceForm | null>(null);

  const [templates, setTemplates] = useState<any[]>([]);
  const [templateToDelete, setTemplateToDelete] = useState<any | null>(null);
  const [showTemplatePreviewModal, setShowTemplatePreviewModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any | null>(null);
  const [showPublicGeneratorModal, setShowPublicGeneratorModal] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchForms();
    }
  }, [currentClub]);

  const fetchForms = async () => {
    if (!currentClub?.clubId) return;

    await Promise.all([fetchFormsData(), fetchTemplatesData()]);
  };

  const fetchFormsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('race_forms')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setForms(data || []);
    } catch (err) {
      console.error('Error fetching forms:', err);
      setError(err instanceof Error ? err.message : 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplatesData = async () => {
    try {
      setTemplatesLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleCreateForm = () => {
    navigate('/settings/race-documents/form-builder');
  };

  const handleCreateTemplate = () => {
    navigate('/settings/race-documents/wysiwyg-builder');
  };

  const handleCreateStructuredTemplate = () => {
    navigate('/settings/race-documents/template-builder');
  };

  const handlePreviewForm = async (form: RaceForm) => {
    try {
      setLoadingPreview(true);
      setError(null);

      // Fetch form with fields
      const { data: formDetails, error: formError } = await supabase
        .from('race_forms')
        .select('*')
        .eq('id', form.id)
        .single();

      if (formError) throw formError;

      const { data: fieldsData, error: fieldsError } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_id', form.id)
        .order('field_order');

      if (fieldsError) throw fieldsError;

      const formWithFields: RaceFormWithFields = {
        ...formDetails,
        fields: fieldsData || []
      };

      setPreviewForm(formWithFields);
      setShowPreviewModal(true);
    } catch (err) {
      console.error('Error fetching form for preview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load form preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleEditForm = async (form: RaceForm) => {
    try {
      // Fetch form with fields
      const { data: formDetails, error: formError } = await supabase
        .from('race_forms')
        .select('*')
        .eq('id', form.id)
        .single();

      if (formError) throw formError;

      const { data: fieldsData, error: fieldsError } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_id', form.id)
        .order('field_order');

      if (fieldsError) throw fieldsError;

      const formWithFields: RaceFormWithFields = {
        ...formDetails,
        fields: fieldsData || []
      };

      // Navigate to form builder with form data in state
      navigate('/settings/race-documents/form-builder', { 
        state: { editingForm: formWithFields } 
      });
    } catch (err) {
      console.error('Error fetching form details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load form details');
    }
  };

  const handleDeleteForm = async (formId: string) => {
    try {
      setDeleting(formId);
      setError(null);

      const { error } = await supabase
        .from('race_forms')
        .update({ is_active: false })
        .eq('id', formId);

      if (error) throw error;

      await fetchForms();
      addNotification('Form deleted successfully', 'success');
    } catch (err) {
      console.error('Error deleting form:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete form');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      setError(null);
      
      const { error } = await supabase
        .from('document_templates')
        .update({ is_active: false })
        .eq('id', templateId);

      if (error) throw error;
      
      await fetchTemplatesData();
      addNotification('Template deleted successfully', 'success');
    } catch (err) {
      console.error('Error deleting template:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleDeleteClick = (form: RaceForm) => {
    setFormToDelete(form);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (formToDelete) {
      await handleDeleteForm(formToDelete.id);
      setShowDeleteModal(false);
      setFormToDelete(null);
    }
  };

  const handleDeleteTemplateClick = (template: any) => {
    if (confirm('Are you sure you want to delete this template?')) {
      handleDeleteTemplate(template.id);
    }
  };

  const handleDuplicateForm = async (form: RaceForm) => {
    try {
      setError(null);

      // Fetch the form with its fields
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_id', form.id)
        .order('field_order');

      if (fieldsError) throw fieldsError;

      // Create new form
      const { data: newFormData, error: newFormError } = await supabase
        .from('race_forms')
        .insert({
          club_id: currentClub?.clubId,
          name: `${form.name} (Copy)`,
          description: form.description,
          is_active: true
        })
        .select()
        .single();

      if (newFormError) throw newFormError;

      // Duplicate fields if any exist
      if (fieldsData && fieldsData.length > 0) {
        const newFields = fieldsData.map(field => ({
          form_id: newFormData.id,
          field_name: field.field_name,
          field_label: field.field_label,
          field_type: field.field_type,
          options: field.options,
          is_required: field.is_required,
          placeholder: field.placeholder,
          field_order: field.field_order
        }));

        const { error: fieldsInsertError } = await supabase
          .from('form_fields')
          .insert(newFields);

        if (fieldsInsertError) throw fieldsInsertError;
      }

      addNotification('Form duplicated successfully', 'success');
      await fetchForms();
    } catch (err) {
      console.error('Error duplicating form:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate form');
    }
  };

  const handleEditTemplate = (template: any) => {
    // Route to appropriate builder based on template type
    const builderPath = template.template_type === 'html'
      ? '/settings/race-documents/wysiwyg-builder'
      : '/settings/race-documents/template-builder';

    navigate(builderPath, {
      state: { editingTemplate: template }
    });
  };

  const handlePreviewTemplate = (template: any) => {
    setPreviewTemplate(template);
    setShowTemplatePreviewModal(true);
  };

  const handleDuplicateTemplate = async (template: any) => {
    try {
      setError(null);

      const templateData = {
        club_id: currentClub?.clubId,
        name: `${template.name} (Copy)`,
        description: template.description,
        template_type: template.template_type,
        html_content: template.html_content,
        sections: template.sections || [],
        logo_url: template.logo_url,
        footer_text: template.footer_text,
        linked_form_id: template.linked_form_id,
        is_active: true
      };

      const { error } = await supabase
        .from('document_templates')
        .insert([templateData]);

      if (error) throw error;

      addNotification('Template duplicated successfully', 'success');
      await fetchTemplatesData();
    } catch (err) {
      console.error('Error duplicating template:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  };

  const renderFieldPreview = (field: FormField) => {
    const baseInputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white text-sm';

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            placeholder={field.placeholder || ''}
            className={`${baseInputClass} h-20 resize-none`}
            disabled
          />
        );
      case 'select':
        return (
          <select className={baseInputClass} disabled>
            <option>{field.placeholder || 'Select an option'}</option>
            {field.options?.map((option, i) => (
              <option key={i} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      case 'clubs':
        return (
          <select className={baseInputClass} disabled>
            <option>Select a club</option>
            <option>Lake Macquarie Radio Yacht Club</option>
            <option>Sydney Radio Yacht Club</option>
            <option>Melbourne Radio Yacht Club</option>
          </select>
        );
      case 'venue':
        return (
          <select className={baseInputClass} disabled>
            <option>Select a venue</option>
            <option>Grahamstown Lakes</option>
            <option>Sydney Harbour</option>
            <option>Port Phillip Bay</option>
          </select>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option, i) => (
              <label key={i} className="flex items-center gap-2">
                <input type="radio" name={field.field_name} disabled />
                <span className="text-sm text-gray-700">{option.label}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled />
            <span className="text-sm text-gray-700">{field.field_label}</span>
          </label>
        );
      case 'page_break':
        return (
          <div className="py-6 border-t-2 border-dashed border-gray-300 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm">
              <FileText size={14} />
              <span className="font-medium">Page Break</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Form continues on next page</p>
          </div>
        );
      default:
        return (
          <input
            type={field.field_type}
            placeholder={field.placeholder || ''}
            className={baseInputClass}
            disabled
          />
        );
    }
  };

  const filteredForms = forms.filter(form =>
    form.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (form.description && form.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <style>{`
        .document-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
          tab-size: 4;
        }
        .document-content h1 {
          font-size: 24px;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .document-content h2 {
          font-size: 20px;
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .document-content h3 {
          font-size: 18px;
          font-weight: bold;
          margin-top: 0.75em;
          margin-bottom: 0.5em;
        }
        .document-content p {
          margin-bottom: 1.25em;
          white-space: pre-wrap;
        }
        .document-content ol, .document-content ul {
          margin-left: 1.5em;
          margin-bottom: 1.25em;
        }
        .document-content li {
          margin-bottom: 0.25em;
        }
        .document-content .ql-indent-1 {
          padding-left: 3em;
        }
        .document-content .ql-indent-2 {
          padding-left: 6em;
        }
        .document-content .ql-indent-3 {
          padding-left: 9em;
        }
        .document-content .hanging-indent {
          padding-left: 3em;
          text-indent: -3em;
        }
        .document-content .ql-align-center {
          text-align: center;
        }
        .document-content .ql-align-right {
          text-align: right;
        }
        .document-content .ql-align-justify {
          text-align: justify;
        }
      `}</style>
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <FileText className="text-blue-400" size={32} />
              <div>
                <h1 className="text-3xl font-bold text-white">Race Documents</h1>
                <p className="text-slate-400">
                  Create and manage forms for race documentation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCreateForm}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={18} />
                Create New Form
              </button>
              
              <button
                onClick={handleCreateTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus size={18} />
                Create New Document
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Forms Section */}
          <div className={`
            rounded-xl border backdrop-blur-sm
            ${darkMode 
              ? 'bg-slate-800/30 border-slate-700/50' 
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className={`
              p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FormInput className="text-blue-400" size={20} />
                  <h2 className="text-lg font-semibold text-white">Forms</h2>
                </div>
                
                {forms.length > 0 && (
                  <div className="relative max-w-md">
                    <Search 
                      size={18} 
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search forms..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`
                        w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200 placeholder-slate-400 border border-slate-600' 
                          : 'bg-white text-slate-800 placeholder-slate-400 border border-slate-200'}
                      `}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
              ) : filteredForms.length === 0 ? (
                <div className="text-center py-12">
                  <FormInput size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    {searchTerm ? 'No forms found' : 'No forms created yet'}
                  </h3>
                  <p className="text-slate-400 mb-6">
                    {searchTerm 
                      ? 'Try adjusting your search terms' 
                      : 'Create your first form to collect information for race documents'}
                  </p>
                  {!searchTerm && (
                    <button
                      onClick={handleCreateForm}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create Your First Form
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredForms.map((form) => (
                    <div
                      key={form.id}
                      className={`
                        p-6 rounded-lg border transition-all hover:scale-[1.02]
                        ${darkMode 
                          ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700/70' 
                          : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                      `}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-white mb-2">{form.name}</h3>
                          {form.description && (
                            <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                              {form.description}
                            </p>
                          )}
                          <p className="text-xs text-slate-500">
                            Updated {formatDate(form.updated_at)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditForm(form)}
                          className={`
                            flex items-center justify-center p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' 
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
                          `}
                          title="Edit form"
                        >
                          <Edit2 size={14} />
                        </button>
                        
                        <button
                          onClick={() => handlePreviewForm(form)}
                          disabled={loadingPreview}
                          className={`
                            flex items-center justify-center p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' 
                              : 'bg-green-50 text-green-600 hover:bg-green-100'}
                          `}
                          title="Preview form"
                        >
                          <Eye size={14} />
                        </button>

                        <button
                          onClick={() => handleDuplicateForm(form)}
                          className={`
                            flex items-center justify-center p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30' 
                              : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}
                          `}
                          title="Duplicate form"
                        >
                          <Copy size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteClick(form)}
                          disabled={deleting === form.id}
                          className={`
                            flex items-center justify-center p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' 
                              : 'bg-red-50 text-red-600 hover:bg-red-100'}
                          `}
                          title="Delete form"
                        >
                          {deleting === form.id ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current"></div>
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document Templates Section - Placeholder for Phase 2 */}
          <div className={`
            mt-8 rounded-xl border backdrop-blur-sm
            ${darkMode 
              ? 'bg-slate-800/30 border-slate-700/50' 
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className={`
              p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <div className="flex items-center gap-2">
                <FileText className="text-purple-400" size={20} />
                <h2 className="text-lg font-semibold text-white">Document Templates</h2>
              </div>
            </div>

            <div className="p-6">
              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <File size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
                  <h3 className="text-lg font-medium text-white mb-2">
                    No document templates yet
                  </h3>
                  <p className="text-slate-400 mb-6">
                    Create your first document template to generate professional race documents
                  </p>
                  <button
                    onClick={handleCreateTemplate}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Create Your First Template
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={`
                        relative p-6 rounded-lg border transition-all hover:scale-[1.02]
                        ${darkMode 
                          ? 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700/70' 
                          : 'bg-white/5 border-slate-200/10 hover:bg-white/10'}
                      `}
                    >
                      <div className="flex-1 mb-4">
                        <h3 className="font-semibold text-white mb-2">{template.name}</h3>
                        {template.description && (
                          <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-500">
                          Updated {formatDate(template.updated_at)}
                        </p>
                      </div>

                      <div className="absolute bottom-4 right-4 flex items-center gap-2">
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className={`
                            p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' 
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}
                          `}
                          title="Edit template"
                        >
                          <Edit2 size={14} />
                        </button>
                        
                        <button
                          onClick={() => handlePreviewTemplate(template)}
                          className={`
                            p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' 
                              : 'bg-green-50 text-green-600 hover:bg-green-100'}
                          `}
                          title="Preview template"
                        >
                          <Eye size={14} />
                        </button>

                        <button
                          onClick={() => handleDuplicateTemplate(template)}
                          className={`
                            p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30' 
                              : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}
                          `}
                          title="Duplicate template"
                        >
                          <Copy size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteTemplateClick(template)}
                          className={`
                            p-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' 
                              : 'bg-red-50 text-red-600 hover:bg-red-100'}
                          `}
                          title="Delete template"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Public NOR Generator Section */}
          <div className={`
            mt-8 rounded-xl border backdrop-blur-sm
            ${darkMode
              ? 'bg-slate-800/30 border-slate-700/50'
              : 'bg-white/10 border-slate-200/20'}
          `}>
            <div className={`
              p-6 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="text-green-400" size={20} />
                  <h2 className="text-lg font-semibold text-white">Public NOR Generator</h2>
                </div>
                <button
                  onClick={() => setShowPublicGeneratorModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Settings size={16} />
                  Configure
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className={`text-center py-8 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                <Globe size={48} className="mx-auto mb-4 text-green-500 opacity-70" />
                <h3 className="text-lg font-medium text-white mb-2">
                  Share Your NOR Generator
                </h3>
                <p className="text-slate-400 mb-6 max-w-2xl mx-auto">
                  Create a public webpage where anyone can generate Notice of Race documents using your templates.
                  Perfect for clubs hosting regattas and events.
                </p>
                <button
                  onClick={() => setShowPublicGeneratorModal(true)}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors inline-flex items-center gap-2"
                >
                  <Settings size={18} />
                  Set Up Public Generator
                </button>
              </div>
            </div>
          </div>
      </div>

      {/* Public Generator Settings Modal */}
      {showPublicGeneratorModal && (
        <PublicNorGeneratorSettingsModal
          darkMode={darkMode}
          onClose={() => setShowPublicGeneratorModal(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
        {showDeleteModal && formToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`
              w-full max-w-md rounded-xl shadow-xl overflow-hidden
              ${darkMode ? 'bg-slate-800' : 'bg-white'}
            `}>
              <div className={`
                flex items-center justify-between p-6 border-b
                ${darkMode ? 'border-slate-700' : 'border-slate-200'}
              `}>
                <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Delete Form
                </h2>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={`
                    rounded-full p-2 transition-colors
                    ${darkMode 
                      ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                  `}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} className="text-white" />
                  </div>
                  <h3 className={`text-lg font-semibold mb-2 text-center ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Are you sure?
                  </h3>
                  <p className={`text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    This will permanently delete the form "{formToDelete.name}". This action cannot be undone.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleting === formToDelete.id}
                    className={`
                      flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                      ${darkMode
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                      ${deleting === formToDelete.id ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={deleting === formToDelete.id}
                    className={`
                      flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors
                      ${deleting === formToDelete.id ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    {deleting === formToDelete.id ? 'Deleting...' : 'Delete Form'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Preview Modal */}
        {showPreviewModal && previewForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Form Preview</h2>
                  <p className="text-sm text-gray-600 mt-1">Preview how your form will appear to users</p>
                </div>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewForm(null);
                  }}
                  className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                <div className="max-w-lg mx-auto bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  {(() => {
                    // Split fields into pages based on page breaks
                    const pages: any[][] = [[]];
                    let currentPageIndex = 0;
                    
                    previewForm.fields.forEach(field => {
                      if (field.field_type === 'page_break') {
                        pages.push([]);
                        currentPageIndex++;
                      } else {
                        pages[currentPageIndex].push(field);
                      }
                    });
                    
                    // Remove empty pages
                    const validPages = pages.filter(page => page.length > 0);
                    
                    if (validPages.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <FileText size={48} className="mx-auto mb-4 text-gray-400" />
                          <p className="text-gray-500">No fields in this form</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div>
                        {/* Form Header */}
                        <div className="mb-8">
                          <h3 className="text-2xl font-bold text-gray-900 mb-2">
                            {previewForm.name}
                          </h3>
                          {previewForm.description && (
                            <p className="text-gray-600">
                              {previewForm.description}
                            </p>
                          )}
                        </div>
                        
                        {/* Progress Bar (only show if multiple pages) */}
                        {validPages.length > 1 && (
                          <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-medium text-gray-700">Page 1 of {validPages.length}</span>
                              <span className="text-sm text-gray-500">{Math.round((1 / validPages.length) * 100)}% Complete</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                              <div 
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 shadow-sm" 
                                style={{ width: `${(1 / validPages.length) * 100}%` }}
                              ></div>
                            </div>
                            <div className="flex justify-between mt-2">
                              {validPages.map((_, index) => (
                                <div 
                                  key={index}
                                  className={`w-3 h-3 rounded-full ${
                                    index === 0 ? 'bg-blue-600' : 'bg-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Current Page Fields */}
                        <div className="space-y-6 mb-8">
                          {validPages[0]?.map((field, index) => (
                            <div key={index} className="space-y-2">
                              <label className="block font-medium text-gray-900">
                                {field.field_label}
                                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                              </label>
                              {renderFieldPreview(field)}
                            </div>
                          ))}
                        </div>
                        
                        {/* Navigation Buttons */}
                        <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                          <button
                            disabled
                            className="flex items-center gap-2 px-4 py-2 text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                          >
                            <ChevronDown className="rotate-90" size={16} />
                            Previous
                          </button>
                          
                          <div className="flex items-center gap-2">
                            {validPages.length > 1 ? (
                              <button
                                disabled
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed"
                              >
                                Next Page
                                <ChevronDown className="-rotate-90" size={16} />
                              </button>
                            ) : (
                              <button
                                disabled
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed"
                              >
                                Submit Form (Preview Only)
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Multi-page indicator */}
                        {validPages.length > 1 && (
                          <div className="text-center mt-6 pt-4 border-t border-gray-100">
                            <p className="text-sm text-gray-500">
                              This form has {validPages.length} pages total
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-white">
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewForm(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setPreviewForm(null);
                    handleEditForm(previewForm);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Edit Form
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template Preview Modal */}
        {showTemplatePreviewModal && previewTemplate && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Template Preview</h2>
                  <p className="text-sm text-gray-600 mt-1">{previewTemplate.name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowTemplatePreviewModal(false);
                    setPreviewTemplate(null);
                  }}
                  className="rounded-full p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
                <div className="max-w-4xl mx-auto bg-white shadow-lg p-12 min-h-[11in]" style={{ width: '8.5in' }}>
                  {/* Logo */}
                  {previewTemplate.logo_url && (
                    <div className="flex justify-center mb-8">
                      <img
                        src={previewTemplate.logo_url}
                        alt="Document logo"
                        className="h-24 object-contain"
                      />
                    </div>
                  )}

                  {/* Template Content */}
                  {previewTemplate.html_content ? (
                    <div
                      className="document-content text-gray-900"
                      dangerouslySetInnerHTML={{ __html: previewTemplate.html_content }}
                    />
                  ) : previewTemplate.sections && previewTemplate.sections.length > 0 ? (
                    <div className="space-y-6">
                      {previewTemplate.sections.map((section: any, index: number) => (
                        <div key={index}>
                          {section.type === 'heading' && (
                            <div className={`font-bold text-gray-900 mb-4 ${
                              section.level === 1 ? 'text-2xl' :
                              section.level === 2 ? 'text-xl' :
                              section.level === 3 ? 'text-lg' :
                              'text-base'
                            }`}>
                              {section.content || `Heading ${section.level}`}
                            </div>
                          )}
                          
                          {section.type === 'paragraph' && (
                            <p className="text-gray-700 leading-relaxed mb-4">
                              {section.content || 'Paragraph content will appear here...'}
                            </p>
                          )}
                          
                          {section.type === 'numbered_list' && (
                            <ol className="list-decimal list-inside text-gray-700 space-y-2 mb-4">
                              {section.content ? 
                                section.content.split('\n').filter((line: string) => line.trim()).map((item: string, i: number) => (
                                  <li key={i}>{item.trim()}</li>
                                )) : 
                                <li>List item will appear here...</li>
                              }
                            </ol>
                          )}
                          
                          {section.type === 'bullet_list' && (
                            <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
                              {section.content ? 
                                section.content.split('\n').filter((line: string) => line.trim()).map((item: string, i: number) => (
                                  <li key={i}>{item.trim()}</li>
                                )) : 
                                <li>List item will appear here...</li>
                              }
                            </ul>
                          )}
                          
                          {section.type === 'form_field' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                              <span className="text-blue-700 font-mono text-sm">
                                {section.content || '{{form_field}}'}
                              </span>
                            </div>
                          )}
                          
                          {section.type === 'page_break' && (
                            <div className="py-6 border-t-2 border-dashed border-gray-300 text-center mb-4">
                              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm">
                                <FileText size={14} />
                                Page Break
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FileText size={48} className="mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-500">No content in this template</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-white">
                <button
                  onClick={() => {
                    setShowTemplatePreviewModal(false);
                    setPreviewTemplate(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => {
                    setShowTemplatePreviewModal(false);
                    setPreviewTemplate(null);
                    handleEditTemplate(previewTemplate);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Edit Template
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  );
};