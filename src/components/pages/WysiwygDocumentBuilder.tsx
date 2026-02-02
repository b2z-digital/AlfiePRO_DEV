import React, { useState, useEffect, useRef } from 'react';
import { Save, Eye, Upload, X, FileText, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactQuill, { Quill } from 'react-quill';
import { useNotifications } from '../../contexts/NotificationContext';
import 'react-quill/dist/quill.snow.css';
import jsPDF from 'jspdf';

// Register custom line break blot for Shift+Enter
const Inline = Quill.import('blots/inline');

class LineBreakBlot extends Inline {
  static blotName = 'linebreak';
  static tagName = 'BR';

  static create() {
    return super.create();
  }

  static formats() {
    return true;
  }

  format() {
    // No formatting needed
  }

  length() {
    return 1;
  }
}

Quill.register(LineBreakBlot, true);

interface WysiwygDocumentBuilderProps {
  onSuccess?: () => void;
}

const DEFAULT_MERGE_FIELDS = [
  { key: 'regatta_name', label: 'Regatta Name', category: 'Event' },
  { key: 'event_name', label: 'Event Name', category: 'Event' },
  { key: 'event_start_date', label: 'Start Date', category: 'Event' },
  { key: 'event_end_date', label: 'End Date', category: 'Event' },
  { key: 'regatta_location_description_for_title_page', label: 'Venue Location', category: 'Event' },
  { key: 'state_association', label: 'State Association', category: 'Organization' },
  { key: 'clubs', label: 'Club Name', category: 'Organization' },
  { key: 'club_name', label: 'Club Name (Direct)', category: 'Organization' },
  { key: 'club_email', label: 'Club Email', category: 'Organization' },
];

export const WysiwygDocumentBuilder: React.FC<WysiwygDocumentBuilderProps> = ({ onSuccess }) => {
  const { currentClub, darkMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotifications();
  const editingTemplate = location.state?.editingTemplate;
  const quillRef = useRef<ReactQuill>(null);

  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [documentType, setDocumentType] = useState<'nor' | 'si' | 'amendment' | 'notice' | 'other'>('nor');
  const [htmlContent, setHtmlContent] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [footerText, setFooterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loadSampleData, setLoadSampleData] = useState(false);
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [linkedFormId, setLinkedFormId] = useState<string | null>(null);
  const [availableForms, setAvailableForms] = useState<any[]>([]);
  const [formFields, setFormFields] = useState<any[]>([]);
  const [mergeFields, setMergeFields] = useState(DEFAULT_MERGE_FIELDS);

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchForms();
    }
  }, [currentClub]);

  useEffect(() => {
    if (editingTemplate) {
      setTemplateName(editingTemplate.name || '');
      setTemplateDescription(editingTemplate.description || '');
      setDocumentType(editingTemplate.document_type || 'nor');
      setHtmlContent(editingTemplate.html_content || '');
      setLogoUrl(editingTemplate.logo_url || null);
      setFooterText(editingTemplate.footer_text || '');
      setLinkedFormId(editingTemplate.linked_form_id || null);
    }
  }, [editingTemplate]);

  useEffect(() => {
    if (linkedFormId) {
      fetchFormFields(linkedFormId);
    } else {
      setFormFields([]);
      setMergeFields(DEFAULT_MERGE_FIELDS);
    }
  }, [linkedFormId]);

  const fetchForms = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('race_forms')
        .select('id, name, description')
        .eq('club_id', currentClub.clubId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAvailableForms(data || []);
    } catch (error: any) {
      console.error('Error fetching forms:', error);
    }
  };

  const fetchFormFields = async (formId: string) => {
    try {
      const { data, error } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_id', formId)
        .order('field_order');

      if (error) throw error;

      const fields = (data || []).map(field => ({
        key: field.field_name,
        label: field.field_label,
        category: 'Form Fields'
      }));

      setFormFields(fields);
      setMergeFields([...DEFAULT_MERGE_FIELDS, ...fields]);
    } catch (error: any) {
      console.error('Error fetching form fields:', error);
    }
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['link', 'image'],
      ['clean']
    ]
  };

  const quillFormats = [
    'header', 'size', 'bold', 'italic', 'underline', 'strike',
    'color', 'background', 'align', 'list', 'bullet', 'indent',
    'link', 'image', 'linebreak'
  ];

  // Add custom Tab key and Shift+Enter handlers after component mounts
  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    // Override Tab key behavior
    const keyboard = quill.getModule('keyboard');
    keyboard.addBinding({
      key: 9, // Tab key
      handler: function(range: any) {
        quill.insertText(range.index, '\t');
        return false;
      }
    });

    // Add Shift+Enter for soft line break (br tag)
    keyboard.addBinding({
      key: 13, // Enter key
      shiftKey: true,
      handler: function(range: any) {
        const currentIndex = range.index;

        // Delete selection if any
        if (range.length > 0) {
          quill.deleteText(currentIndex, range.length, 'user');
        }

        // Insert the line break using insertEmbed
        quill.insertEmbed(currentIndex, 'linebreak', true, 'user');

        // Move cursor after the break
        quill.setSelection(currentIndex + 1, 0, 'silent');

        return false;
      }
    });
  }, []);

  const toggleHangingIndent = () => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const range = quill.getSelection();
    if (!range) return;

    const [block] = quill.getLine(range.index);
    if (block && block.domNode) {
      const currentClass = block.domNode.className || '';
      if (currentClass.includes('hanging-indent')) {
        block.domNode.className = currentClass.replace('hanging-indent', '').trim();
      } else {
        block.domNode.className = (currentClass + ' hanging-indent').trim();
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentClub) return;

    try {
      setLoading(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `${currentClub.id}/document-logos/${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
      addNotification('Logo uploaded successfully', 'success');
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      addNotification(error.message || 'Failed to upload logo', 'error');
    } finally {
      setLoading(false);
    }
  };

  const insertMergeField = (fieldKey: string) => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;

    const cursorPosition = quill.getSelection()?.index || 0;
    quill.insertText(cursorPosition, `{{${fieldKey}}}`);
    quill.setSelection(cursorPosition + fieldKey.length + 4, 0);
    setShowMergeFields(false);
  };

  const handleSave = async () => {
    if (!currentClub || !templateName.trim() || !htmlContent.trim()) {
      addNotification('Please fill in template name and content', 'error');
      return;
    }

    try {
      setLoading(true);

      const templateData = {
        club_id: currentClub.clubId,
        name: templateName,
        description: templateDescription,
        document_type: documentType,
        template_type: 'html',
        html_content: htmlContent,
        logo_url: logoUrl,
        footer_text: footerText,
        linked_form_id: linkedFormId,
        sections: [], // Keep empty for backward compatibility
        is_active: true
      };

      if (editingTemplate?.id) {
        const { error } = await supabase
          .from('document_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        addNotification('Template updated successfully', 'success');
      } else {
        const { error } = await supabase
          .from('document_templates')
          .insert([templateData]);

        if (error) throw error;
        addNotification('Template created successfully', 'success');
      }

      // Don't navigate away - just show success message and stay on page
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      addNotification(error.message || 'Failed to save template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    setShowPreview(true);
    setLoadSampleData(false);
  };

  const getPreviewContent = () => {
    let content = htmlContent;

    if (loadSampleData) {
      // Sample data mapping
      const sampleData: Record<string, string> = {
        '{{regatta_name}}': '<span class="regatta-name">Australian National Championship</span>',
        '{{event_start_date}}': '15 January 2026',
        '{{event_end_date}}': '20 January 2026',
        '{{state_association}}': 'Victorian Radio Yachting Association',
        '{{clubs}}': 'Melbourne Model Yacht Club, Geelong Radio Sailing Club',
        '{{regatta_location_description_for_title_page}}': 'Albert Park Lake, Melbourne, Victoria',
        '{{organiser_name}}': 'John Smith',
        '{{organiser_email}}': 'john.smith@example.com',
        '{{organiser_phone}}': '+61 400 123 456',
        '{{entry_fee}}': '$150.00',
        '{{early_bird_fee}}': '$120.00',
        '{{entry_deadline}}': '1 January 2026',
        '{{competitor_limit}}': '50',
        '{{boat_class}}': 'DF95',
        '{{venue_name}}': 'Albert Park Lake',
        '{{venue_address}}': '123 Sailing Circuit, Albert Park VIC 3206'
      };

      Object.entries(sampleData).forEach(([key, value]) => {
        content = content.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
      });

      // Also replace any form field merge fields
      formFields.forEach((field: any) => {
        const placeholder = `{{${field.mapping_key || field.id}}}`;
        content = content.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), `Sample ${field.label}`);
      });
    } else {
      // Without sample data, still wrap regatta_name for uppercase styling
      content = content.replace(/\{\{regatta_name\}\}/g, '<span class="regatta-name">{{regatta_name}}</span>');
    }

    return content;
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {editingTemplate ? 'Edit Template' : 'Create New Template'}
              </h1>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Design your document with full formatting control
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreview}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                <Eye size={20} />
                Preview
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold ${
                  loading
                    ? 'opacity-60 cursor-not-allowed'
                    : ''
                } ${
                  darkMode
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                <Save size={20} />
                {loading ? 'Saving...' : 'Save Template'}
              </button>
              <button
                onClick={() => navigate('/settings/documents')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-120px)]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Left Side - Editor (now first and larger) */}
          <div className="lg:col-span-2 h-full flex flex-col">
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col`}>
              <div className={`p-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Document Content
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Format your document exactly as you want it to appear in the PDF
                    </p>
                  </div>
                  <button
                    onClick={toggleHangingIndent}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                      darkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                    }`}
                    title="Toggle hanging indent for selected paragraph"
                  >
                    ⇥ Hanging Indent
                  </button>
                </div>
              </div>
              <div className={`flex-1 p-6 ${darkMode ? 'wysiwyg-dark' : ''}`} style={{ minHeight: 0, overflow: 'hidden' }}>
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={htmlContent}
                  onChange={setHtmlContent}
                  modules={quillModules}
                  formats={quillFormats}
                  style={{ height: '100%' }}
                  className={darkMode ? 'dark-quill full-height-quill padded-editor' : 'full-height-quill padded-editor'}
                />
              </div>
            </div>
          </div>

          {/* Right Sidebar - Settings */}
          <div className="lg:col-span-1 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            {/* Template Info */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Template Information
              </h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Notice of Race Template"
                    className={`w-full px-3 py-2 border rounded-lg ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Brief description of this template"
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Document Type *
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as any)}
                    className={`w-full px-3 py-2 border rounded-lg ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="nor">Notice of Race (NOR)</option>
                    <option value="si">Sailing Instructions (SI)</option>
                    <option value="amendment">Amendment</option>
                    <option value="notice">Notice</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Linked Form */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Link to Form
              </h3>
              <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Select a form to use its fields as merge fields
              </p>
              <select
                value={linkedFormId || ''}
                onChange={(e) => setLinkedFormId(e.target.value || null)}
                className={`w-full px-3 py-2 border rounded-lg ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="">No form linked</option>
                {availableForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Logo Upload */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Header Logo
              </h3>
              <div className="space-y-4">
                {logoUrl ? (
                  <div className="relative">
                    <img src={logoUrl} alt="Logo" className="w-full h-32 object-contain rounded-lg border" />
                    <button
                      onClick={() => setLogoUrl(null)}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer ${
                    darkMode ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'
                  }`}>
                    <Upload size={32} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
                    <span className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Click to upload logo
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Footer Text */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Footer Text
              </h3>
              <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Text to display at the bottom of each page
              </p>
              <textarea
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="e.g., Notice of Race (NOR) Ver 1.0  •  20 November 2025  •  Page {page}"
                rows={3}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
              <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                Use {'{page}'} for page number
              </p>
            </div>

            {/* Merge Fields */}
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-sm p-6`}>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Insert Merge Fields
              </h3>
              <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Click to insert dynamic data fields into your document
              </p>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {/* Group by category */}
                {DEFAULT_MERGE_FIELDS.length > 0 && (
                  <div>
                    <div className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      EVENT FIELDS
                    </div>
                    {DEFAULT_MERGE_FIELDS.filter(f => f.category === 'Event').map((field, index) => (
                      <button
                        key={`event-${field.key}-${index}`}
                        onClick={() => insertMergeField(field.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${
                          darkMode
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{field.label}</div>
                        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          {`{{${field.key}}}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {DEFAULT_MERGE_FIELDS.filter(f => f.category === 'Organization').length > 0 && (
                  <div className="mt-3">
                    <div className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      ORGANIZATION
                    </div>
                    {DEFAULT_MERGE_FIELDS.filter(f => f.category === 'Organization').map((field, index) => (
                      <button
                        key={`org-${field.key}-${index}`}
                        onClick={() => insertMergeField(field.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${
                          darkMode
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="font-medium">{field.label}</div>
                        <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          {`{{${field.key}}}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {formFields.length > 0 && (
                  <div className="mt-3">
                    <div className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      FORM FIELDS
                    </div>
                    {formFields.map((field, index) => (
                      <button
                        key={`form-${field.key}-${index}`}
                        onClick={() => insertMergeField(field.key)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${
                          darkMode
                            ? 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300'
                            : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                        }`}
                      >
                        <div className="font-medium">{field.label}</div>
                        <div className={`text-xs ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          {`{{${field.key}}}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col`}>
            <div className={`p-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
              <div>
                <h3 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Document Preview
                </h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  PDF output preview
                </p>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loadSampleData}
                    onChange={(e) => setLoadSampleData(e.target.checked)}
                    className="rounded"
                  />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Load Sample Data
                  </span>
                </label>
                <button
                  onClick={() => setShowPreview(false)}
                  className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            <div className={`flex-1 overflow-y-auto ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} p-8`}>
              <div className={`max-w-4xl mx-auto ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg p-12 min-h-[11in]`} style={{ width: '8.5in' }}>
                {/* Logo */}
                {logoUrl && (
                  <div className="flex justify-center mb-8">
                    <img src={logoUrl} alt="Logo" className="h-24 object-contain" />
                  </div>
                )}

                {/* Content */}
                <div
                  className={`document-content ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                  dangerouslySetInnerHTML={{ __html: getPreviewContent() }}
                />

                {/* Footer */}
                {footerText && (
                  <div className={`mt-12 pt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-300'} text-center text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {footerText.replace('{page}', '1')}
                  </div>
                )}
              </div>
            </div>
            <div className={`p-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex justify-between items-center`}>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Preview shows approximate PDF layout. Actual output may vary slightly.
              </p>
              <button
                onClick={() => setShowPreview(false)}
                className={`px-6 py-2 rounded-lg font-semibold ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-800 hover:bg-gray-900 text-white'
                }`}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .full-height-quill {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .full-height-quill .ql-toolbar {
          border: none;
          border-bottom: 1px solid #e5e7eb;
          padding: 12px;
        }
        .full-height-quill .ql-container {
          flex: 1;
          overflow-y: auto;
          border: none;
          font-size: 14px;
        }
        .padded-editor .ql-editor {
          padding: 24px 32px;
          min-height: 100%;
          white-space: pre-wrap;
          tab-size: 4;
        }
        .padded-editor .ql-editor p {
          margin-bottom: 1.25em;
        }
        .padded-editor .ql-editor ol,
        .padded-editor .ql-editor ul {
          margin-bottom: 1.25em;
        }

        /* Hanging Indent Style */
        .hanging-indent {
          padding-left: 3em;
          text-indent: -3em;
        }

        /* Document Preview Styles */
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

        /* Preserve text alignment in preview */
        .document-content .ql-align-center {
          text-align: center;
        }
        .document-content .ql-align-right {
          text-align: right;
        }
        .document-content .ql-align-justify {
          text-align: justify;
        }

        /* Make regatta_name uppercase */
        .document-content .regatta-name {
          text-transform: uppercase;
        }

        /* Style for soft line breaks (br tags) - minimal spacing */
        .ql-editor br,
        .document-content br {
          display: inline;
          content: '';
        }

        .ql-editor p br:last-child,
        .document-content p br:last-child {
          display: none;
        }

        .dark-quill .ql-toolbar {
          background: #374151;
          border-color: #4B5563;
        }
        .dark-quill .ql-stroke {
          stroke: #D1D5DB;
        }
        .dark-quill .ql-fill {
          fill: #D1D5DB;
        }
        .dark-quill .ql-picker-label {
          color: #D1D5DB;
        }
        .dark-quill .ql-container {
          background: #1F2937;
          border-color: #4B5563;
          color: #F3F4F6;
        }
        .dark-quill .ql-editor {
          color: #F3F4F6;
        }
      `}</style>
    </div>
  );
};
