import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, GripVertical, Type, Hash, List, FileText, Save, Eye, Upload, X, Image, ChevronDown, Copy, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { DocumentTemplate, DocumentSection, FormFieldReference } from '../../types/documentTemplates';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactQuill from 'react-quill';
import { useNotifications } from '../../contexts/NotificationContext';
import 'react-quill/dist/quill.snow.css';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DocumentTemplateBuilderProps {
  editingTemplate?: DocumentTemplate | null;
  onSuccess?: () => void;
}

const SECTION_TYPES = [
  { value: 'header_section', label: 'Header Section', icon: <Type size={20} />, description: 'Add formatted header with event details' },
  { value: 'heading', label: 'Heading', icon: <Type size={20} />, description: 'Add a heading or title' },
  { value: 'paragraph', label: 'Paragraph', icon: <FileText size={20} />, description: 'Add text content' },
  { value: 'numbered_list', label: 'Numbered List', icon: <Hash size={20} />, description: 'Add a multi-level numbered list' },
  { value: 'bullet_list', label: 'Bullet List', icon: <List size={20} />, description: 'Add a bullet point list' },
  { value: 'form_field', label: 'Form Field', icon: <Type size={20} />, description: 'Insert data from a form' },
  { value: 'page_break', label: 'Page Break', icon: <FileText size={20} />, description: 'Start a new page' }
];

const getQuillModules = (index: number) => ({
  toolbar: [
    [{ 'header': [1, 2, 3, false] }],
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    ['link'],
    ['clean']
  ]
});

const getQuillFormats = () => [
  'header', 'bold', 'italic', 'underline', 'list', 'bullet', 'indent', 'link', 'code-block'
];

// Sample data for preview
const SAMPLE_DATA: {[key: string]: string} = {
  'regatta_name': 'DF95 NSW State Championship',
  'sailing_dates_for_title': '25-26 October 2025',
  'state_association': 'NSW Radio Yachting Association',
  'clubs': 'Lake Macquarie Radio Sailing Club',
  'regatta_location_description_for_title_page': 'Booragul Foreshore Reserve, Lake Macquarie',
  'is_this_a_ranking_event': 'This is an ARYA Ranking Event',
  'event_start_date': '25/10/2025',
  'event_end_date': '26/10/2025',
  'registration_deadline': '18/10/2025',
  'entry_fee': '$50.00',
  'race_officer': 'John Smith',
  'contact_email': 'ro@example.com',
  'contact_phone': '0412 345 678'
};

const replaceMergeFields = (content: string, useSampleData: boolean): string => {
  if (!useSampleData) return content;

  let result = content;
  Object.keys(SAMPLE_DATA).forEach(key => {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, SAMPLE_DATA[key]);
  });
  return result;
};

export const DocumentTemplateBuilder: React.FC<DocumentTemplateBuilderProps> = ({
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editingTemplate = location.state?.editingTemplate as DocumentTemplate | null;
  
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<DocumentSection[]>([]);
  const [availableForms, setAvailableForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { addNotification } = useNotifications();
  const [selectedFormId, setSelectedFormId] = useState<string>('');
  const [documentType, setDocumentType] = useState<'nor' | 'si' | 'amendment' | 'notice' | 'other'>('nor');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const quillRefs = useRef<{[key: string]: any}>({});
  const [allFormFields, setAllFormFields] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({ elements: true, fields: true });
  const [useSampleData, setUseSampleData] = useState(false);
  const [templateVersion, setTemplateVersion] = useState('1.0');

  // Separate refs for each ReactQuill instance
  const quillInstanceRefs = useRef<{[key: string]: any}>({});

  useEffect(() => {
    if (editingTemplate) {
      setTemplateName(editingTemplate.name);
      setTemplateDescription(editingTemplate.description || '');
      setLogoUrl(editingTemplate.logo_url || null);
      setSections(editingTemplate.sections || []);
      setSelectedFormId(editingTemplate.linked_form_id || '');
      setDocumentType(editingTemplate.document_type || 'nor');
    } else {
      setTemplateName('');
      setTemplateDescription('');
      setLogoUrl(null);
      setSections([]);
      setSelectedFormId('');
      setDocumentType('nor');
    }

    fetchAvailableForms();
  }, [editingTemplate]);

  const fetchAvailableForms = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data: forms, error: formsError } = await supabase
        .from('race_forms')
        .select('id, name')
        .eq('club_id', currentClub.clubId)
        .eq('is_active', true)
        .order('name');

      if (formsError) throw formsError;

      const formsWithFields = await Promise.all(
        (forms || []).map(async (form) => {
          const { data: fields, error: fieldsError } = await supabase
            .from('form_fields')
            .select('id, field_label, field_name, field_type')
            .eq('form_id', form.id)
            .order('field_order');

          if (fieldsError) throw fieldsError;

          return {
            ...form,
            fields: fields || []
          };
        })
      );

      setAvailableForms(formsWithFields);
      
      // Create a flat list of all form fields for the sidebar
      const allFields = formsWithFields.flatMap(form => 
        form.fields.map(field => ({
          ...field,
          form_name: form.name,
          shortcode: `{{${field.field_name}}}`
        }))
      );
      setAllFormFields(allFields);
    } catch (err) {
      console.error('Error fetching forms:', err);
      setError('Failed to load available forms');
    }
  };

  const addSection = (type: string) => {
    const newSection: DocumentSection = {
      id: Date.now().toString(),
      type: type as any,
      content: '',
      order: sections.length,
      level: type === 'heading' ? 1 : undefined
    };
    setSections([...sections, newSection]);
  };

  const updateSection = (index: number, updates: Partial<DocumentSection>) => {
    const newSections = [...sections];
    newSections[index] = { ...newSections[index], ...updates };
    setSections(newSections);
  };

  const insertFormFieldAtCursor = (sectionIndex: number, fieldName: string) => {
    // Find the section and append the form field
    const newSections = [...sections];
    const currentContent = newSections[sectionIndex].content || '';
    newSections[sectionIndex].content = currentContent + `{{${fieldName}}}`;
    setSections(newSections);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((items) => {
        const oldIndex = items.findIndex((_, i) => i.toString() === active.id);
        const newIndex = items.findIndex((_, i) => i.toString() === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        // Update order values
        reordered.forEach((section, i) => {
          section.order = i;
        });
        return reordered;
      });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const validateTemplate = (): boolean => {
    if (!templateName.trim()) {
      setError('Template name is required');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateTemplate() || !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      const templateData = {
        club_id: currentClub.clubId,
        name: templateName,
        description: templateDescription || null,
        document_type: documentType,
        logo_url: logoUrl,
        sections: sections,
        linked_form_id: selectedFormId || null,
        is_active: true
      };

      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('document_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
      } else {
        // Create new template
        const { error } = await supabase
          .from('document_templates')
          .insert(templateData);

        if (error) throw error;
      }

      addNotification('success', editingTemplate ? 'Template updated successfully' : 'Template created successfully');
      if (onSuccess) onSuccess();
      navigate('/settings', { state: { activeTab: 'race-documents' } });
    } catch (err) {
      console.error('Error saving template:', err);
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  const SortableSectionWrapper = ({ section, index, children }: { section: DocumentSection, index: number, children: React.ReactNode }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: index.toString() });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
            >
              <GripVertical size={16} />
            </button>
            <span className="text-sm font-medium text-gray-900">
              Section {index + 1} - {SECTION_TYPES.find(t => t.value === section.type)?.label}
            </span>
          </div>
          <button
            onClick={() => removeSection(index)}
            className="p-1 text-red-500 hover:text-red-700"
          >
            <Trash2 size={16} />
          </button>
        </div>
        {children}
      </div>
    );
  };

  const renderSectionEditor = (section: DocumentSection, index: number) => {
    const selectedForm = availableForms.find(form => form.id === selectedFormId);

    return (
      <SortableSectionWrapper key={section.id} section={section} index={index}>
        <div>

        {section.type === 'header_section' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-700">
                This section creates a formatted header with event details (logo, event name, date, association, venue, ranking status)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Alignment
              </label>
              <select
                value={section.alignment || 'center'}
                onChange={(e) => updateSection(index, { alignment: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={section.showLogo !== false}
                  onChange={(e) => updateSection(index, { showLogo: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Show Logo</span>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={section.showRankingStatus !== false}
                  onChange={(e) => updateSection(index, { showRankingStatus: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Show "Ranking Event" status (conditional)</span>
              </label>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Fields used: Event Name, Event Date, Association Name, Venue, Ranking Event Status
            </div>
          </div>
        )}

        {section.type === 'heading' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Heading Level
                </label>
                <select
                  value={section.level || 1}
                  onChange={(e) => updateSection(index, { level: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                >
                  {[1, 2, 3, 4, 5, 6].map(level => (
                    <option key={level} value={level}>H{level}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text Alignment
                </label>
                <select
                  value={section.alignment || 'left'}
                  onChange={(e) => updateSection(index, { alignment: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Heading Text
              </label>
              <input
                type="text"
                value={section.content}
                onChange={(e) => updateSection(index, { content: e.target.value })}
                placeholder="Enter heading text"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
              />
            </div>
          </div>
        )}

        {(section.type === 'paragraph' || section.type === 'numbered_list' || section.type === 'bullet_list') && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content
            </label>
            {section.type === 'numbered_list' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                <p className="text-xs text-amber-800 font-medium mb-1">Multi-Level Numbering Tip:</p>
                <p className="text-xs text-amber-700">
                  Use the indent button (→) to create sub-levels (1.1, 1.2). The PDF will automatically format as:<br/>
                  <span className="font-mono">1 Main Point<br/>
                  &nbsp;&nbsp;1.1 Sub-point<br/>
                  &nbsp;&nbsp;1.2 Sub-point<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;1.2.1 Sub-sub-point</span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <div className="relative">
                <ReactQuill
                  key={`${section.id}-${section.type}`}
                  ref={(el) => {
                    if (el) {
                      quillRefs.current[index] = el;
                    }
                  }}
                  theme="snow"
                  value={section.content}
                  onChange={(content, delta, source, editor) => {
                    // Only update if the change came from user input
                    if (source === 'user') {
                      updateSection(index, { content });
                    }
                  }}
                  modules={getQuillModules(index)}
                  formats={getQuillFormats()}
                  placeholder={
                    section.type === 'paragraph' ? 'Enter paragraph content' :
                    section.type === 'numbered_list' ? 'Enter numbered list content' :
                    'Enter bullet list content'
                  }
                  className="bg-white rounded-lg"
                  style={{ minHeight: '150px' }}
                />
              </div>
              
              {availableForms.length > 0 && (
                <div className="text-sm text-gray-600">
                  <strong>Tip:</strong> Use the "Available Form Fields" panel on the right to insert form fields at your cursor position.
                </div>
              )}
            </div>
          </div>
        )}

        {section.type === 'form_field' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Form
              </label>
              <select
                value={selectedFormId}
                onChange={(e) => setSelectedFormId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
              >
                <option value="">Select a form</option>
                {availableForms.map(form => (
                  <option key={form.id} value={form.id}>{form.name}</option>
                ))}
              </select>
            </div>
            
            {selectedForm && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Field
                </label>
                <select
                  value={section.form_field_id || ''}
                  onChange={(e) => {
                    const field = selectedForm.fields.find(f => f.id === e.target.value);
                    updateSection(index, { 
                      form_field_id: e.target.value,
                      content: field ? `{{${field.field_name}}}` : ''
                    });
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                >
                  <option value="">Select a field</option>
                  {selectedForm.fields.map(field => (
                    <option key={field.id} value={field.id}>
                      {field.field_label} ({field.field_type})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {section.type === 'page_break' && (
          <div className="py-4 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
              <FileText size={16} />
              <span className="font-medium">Page Break</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">Document continues on next page</p>
          </div>
        )}
        </div>
      </SortableSectionWrapper>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Removed Back button - using X close button instead */}
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {editingTemplate ? 'Edit Document Template' : 'Create Document Template'}
              </h1>
              <p className="text-sm text-gray-500">
                Build a document template with form field integration
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                ${showPreview
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              <Eye size={16} />
              Preview
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !templateName.trim()}
              className={`
                flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                ${(loading || !templateName.trim()) ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </>
              )}
            </button>
            <button
              onClick={() => navigate('/settings', { state: { activeTab: 'race-documents' } })}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)] bg-gray-50">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto bg-white border-r border-gray-200">
          <div className="max-w-4xl mx-auto p-6 space-y-8">
            {error && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            {/* Template Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Template Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Notice of Race Template"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Brief description of this template"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Type *
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  >
                    <option value="nor">Notice of Race (NOR)</option>
                    <option value="si">Sailing Instructions (SI)</option>
                    <option value="amendment">Amendment</option>
                    <option value="notice">Notice</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Linked Form *
                  </label>
                  <select
                    value={selectedFormId}
                    onChange={(e) => setSelectedFormId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  >
                    <option value="">Select a form to link</option>
                    {availableForms.map(form => (
                      <option key={form.id} value={form.id}>{form.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">
                    Link this template to a form to enable document generation
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Logo (Optional)
                  </label>
                  <div className="flex items-center gap-4">
                    {logoUrl && (
                      <img 
                        src={logoUrl} 
                        alt="Template logo" 
                        className="w-16 h-16 object-contain rounded-lg border"
                      />
                    )}
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200">
                      <Upload size={18} />
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    {logoUrl && (
                      <button
                        onClick={() => setLogoUrl(null)}
                        className="p-2 text-red-500 hover:text-red-700"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Document Sections */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Sections</h2>

              {sections.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <>
                    <FileText size={48} className="mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No sections added yet</h3>
                    <p className="text-gray-500 mb-6">Add sections from the right panel to start building your document</p>
                  </>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sections.map((_, i) => i.toString())}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {sections.map((section, index) => renderSectionEditor(section, index))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Section Types Sidebar */}
        <div className="w-96 bg-gray-50 border-l border-gray-200 overflow-y-auto flex flex-col">
          <div className="p-4 bg-white border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 mb-3">Build Document</h3>
            <input
              type="text"
              placeholder="Search elements or fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Document Elements Section */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <button
                onClick={() => setExpandedSections(prev => ({ ...prev, elements: !prev.elements }))}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">Document Elements</span>
                <ChevronDown
                  size={16}
                  className={`transform transition-transform ${expandedSections.elements ? 'rotate-180' : ''}`}
                />
              </button>

              {expandedSections.elements && (
                <div className="p-3 pt-0 space-y-2">
                  {SECTION_TYPES.filter(type =>
                    searchQuery === '' ||
                    type.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    type.description.toLowerCase().includes(searchQuery.toLowerCase())
                  ).map((sectionType) => (
                    <button
                      key={sectionType.value}
                      onClick={() => addSection(sectionType.value)}
                      className="w-full p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group cursor-pointer text-left"
                      title={sectionType.description}
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-gray-600 group-hover:text-blue-600">
                          {sectionType.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                            {sectionType.label}
                          </div>
                          <div className="text-xs text-gray-500 group-hover:text-blue-600 truncate">
                            {sectionType.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form Fields Panel */}
            {allFormFields.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, fields: !prev.fields }))}
                  className="w-full p-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Type size={16} className="text-blue-600" />
                    <span className="font-medium text-gray-900">Form Fields</span>
                    <span className="text-xs text-gray-500">({allFormFields.length})</span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transform transition-transform ${expandedSections.fields ? 'rotate-180' : ''}`}
                  />
                </button>

                {expandedSections.fields && (
                  <div className="border-t border-gray-200">
                    <div className="p-3 bg-blue-50">
                      <p className="text-xs text-blue-700">
                        Click to insert at cursor position or copy the token
                      </p>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {allFormFields.filter(field =>
                        searchQuery === '' ||
                        field.field_label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        field.field_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        field.form_name.toLowerCase().includes(searchQuery.toLowerCase())
                      ).map((field, fieldIndex) => (
                        <div 
                          key={`${field.form_name}-${field.id}`} 
                          className="p-3 hover:bg-blue-50 transition-colors cursor-pointer group"
                          onClick={() => {
                            // Find the currently focused section and insert the field
                            const focusedSection = Object.keys(quillRefs.current).find(key => {
                              const quill = quillRefs.current[key]?.getEditor();
                              return quill && quill.hasFocus();
                            });
                            
                            if (focusedSection) {
                              insertFormFieldAtCursor(parseInt(focusedSection), field.field_name);
                            } else {
                              // If no section is focused, show a message
                              alert('Please click in a text editor first, then click the form field to insert it at your cursor position.');
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h6 className="font-medium text-gray-900 text-sm group-hover:text-blue-700">
                                  {field.field_label}
                                </h6>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-800">
                                  {field.field_type}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">
                                From: {field.form_name}
                              </p>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono group-hover:bg-blue-100 group-hover:text-blue-800 border border-gray-200 truncate">
                                  {field.shortcode}
                                </code>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(field.shortcode);
                                    addNotification('success', 'Token copied to clipboard!');
                                  }}
                                  className="p-1.5 hover:bg-blue-100 rounded transition-colors border border-transparent hover:border-blue-200"
                                  title="Copy token"
                                >
                                  <Copy size={14} className="text-gray-600" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full-Screen Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-8">
            <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-full flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center gap-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
                    <p className="text-sm text-gray-600 mt-1">PDF output preview</p>
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={useSampleData}
                      onChange={(e) => setUseSampleData(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-blue-900">Load Sample Data</span>
                  </label>
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* PDF-Style Document Preview */}
              <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
                <div className="space-y-6">
                  {/* Render all sections across multiple pages with automatic breaks */}
                  {(() => {
                    if (sections.length === 0) {
                      return (
                        <div
                          className="bg-white shadow-lg mx-auto relative"
                          style={{
                            width: '210mm',
                            height: '297mm',
                            padding: '25mm 20mm 20mm 20mm',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                          }}
                        >
                          <div className="text-center py-16 text-gray-400">
                            <FileText size={48} className="mx-auto mb-4" />
                            <p>No sections added yet</p>
                            <p className="text-sm mt-2">Add sections to see the preview</p>
                          </div>
                        </div>
                      );
                    }

                    // For now, render all content on pages and let CSS handle overflow visibility
                    // A4 height minus margins = 297mm - 45mm = 252mm available content height per page
                    const pages: any[][] = [[]];
                    let currentPageIndex = 0;

                    sections.forEach((section) => {
                      // Manual page break creates new page
                      if (section.type === 'page_break') {
                        currentPageIndex++;
                        pages[currentPageIndex] = [];
                      } else {
                        if (!pages[currentPageIndex]) {
                          pages[currentPageIndex] = [];
                        }
                        pages[currentPageIndex].push(section);
                      }
                    });

                    // Remove empty pages
                    const validPages = pages.filter(page => page.length > 0);

                    return validPages.map((pageSections, pageNum) => (
                      <div
                        key={pageNum}
                        className="bg-white shadow-lg mx-auto relative overflow-hidden"
                        style={{
                          width: '210mm',
                          height: '297mm',
                          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                        }}
                      >
                        <style>{`
                          .document-paragraph p,
                          .document-numbered-list p {
                            margin: 0 0 0.35em 0;
                            padding: 0;
                            text-indent: -4.5em;
                            margin-left: 4.5em;
                          }
                          .document-paragraph .ql-indent-1,
                          .document-numbered-list .ql-indent-1 {
                            text-indent: -4.5em;
                            margin-left: 7em;
                          }
                          .document-paragraph .ql-indent-2,
                          .document-numbered-list .ql-indent-2 {
                            text-indent: -4.5em;
                            margin-left: 9.5em;
                          }
                        `}</style>
                        {/* Page Content Area */}
                        <div
                          className="space-y-1 overflow-hidden document-preview-content"
                          style={{
                            padding: '25mm 20mm 0 20mm',
                            height: 'calc(297mm - 40mm)',
                            maxHeight: 'calc(297mm - 40mm)',
                            fontSize: '10pt',
                            lineHeight: '1.15',
                            fontFamily: 'Arial, sans-serif'
                          }}
                        >
                          {pageSections.map((section, index) => {
                      // Header Section
                      if (section.type === 'header_section') {
                        const alignment = section.alignment || 'center';
                        return (
                          <div key={section.id} className={`space-y-1 text-${alignment} mb-6`}>
                            {section.showLogo !== false && logoUrl && (
                              <div className={`flex ${alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start'} mb-3`}>
                                <img src={logoUrl} alt="Logo" className="h-32 object-contain" />
                              </div>
                            )}
                            <div className="font-black text-gray-900 uppercase" style={{ fontSize: '16pt', lineHeight: '1.3', fontWeight: 900 }}>
                              {replaceMergeFields('{regatta_name}', useSampleData)}
                            </div>
                            <div className="text-gray-700" style={{ fontSize: '11pt', lineHeight: '1.2' }}>
                              {replaceMergeFields('{sailing_dates_for_title}', useSampleData)}
                            </div>
                            <div className="font-medium text-gray-800" style={{ fontSize: '11pt', lineHeight: '1.2' }}>
                              {replaceMergeFields('{state_association}', useSampleData)} / {replaceMergeFields('{clubs}', useSampleData)}
                            </div>
                            <div className="text-gray-700" style={{ fontSize: '11pt', lineHeight: '1.2' }}>
                              {replaceMergeFields('{regatta_location_description_for_title_page}', useSampleData)}
                            </div>
                            {section.showRankingStatus !== false && (
                              <div className="font-medium text-gray-600" style={{ fontSize: '10pt', lineHeight: '1.2' }}>
                                {replaceMergeFields('{is_this_a_ranking_event}', useSampleData)}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Heading
                      if (section.type === 'heading') {
                        const alignment = section.alignment || 'left';
                        const HeadingTag = `h${section.level || 1}` as keyof JSX.IntrinsicElements;
                        const fontSize = section.level === 1 ? '16pt' :
                                       section.level === 2 ? '11pt' :
                                       section.level === 3 ? '10pt' :
                                       section.level === 4 ? '10pt' :
                                       '10pt';
                        const fontWeight = section.level === 1 ? 900 : 700;
                        const marginClass = section.level === 1 ? 'mt-6 mb-6' : section.level === 2 ? 'mt-5 mb-2' : 'mb-1';
                        return (
                          <div key={section.id} className={`text-gray-900 text-${alignment} ${marginClass}`} style={{ fontSize, lineHeight: '1.2', textTransform: section.level === 1 ? 'uppercase' : 'none', fontWeight }}>
                            {replaceMergeFields(section.content || `Heading ${section.level}`, useSampleData)}
                          </div>
                        );
                      }

                      // Paragraph
                      if (section.type === 'paragraph') {
                        return (
                          <div key={section.id} className="text-gray-800 mb-4 document-paragraph" style={{ fontSize: '10pt', lineHeight: '1.15' }}>
                            <div
                              dangerouslySetInnerHTML={{
                                __html: replaceMergeFields(section.content || 'Paragraph content will appear here...', useSampleData)
                              }}
                              style={{ fontSize: '10pt', lineHeight: '1.15', textAlign: 'justify' }}
                            />
                          </div>
                        );
                      }

                      // Numbered List
                      if (section.type === 'numbered_list') {
                        return (
                          <div key={section.id} className="mb-4 document-numbered-list">
                            <div
                              dangerouslySetInnerHTML={{
                                __html: replaceMergeFields(section.content || '<ol><li>List item will appear here...</li></ol>', useSampleData)
                              }}
                              className="text-gray-800"
                              style={{ fontSize: '10pt', lineHeight: '1.15', textAlign: 'justify' }}
                            />
                          </div>
                        );
                      }

                      // Bullet List
                      if (section.type === 'bullet_list') {
                        return (
                          <div key={section.id} className="mb-1">
                            <div
                              dangerouslySetInnerHTML={{
                                __html: replaceMergeFields(section.content || '<ul><li>List item will appear here...</li></ul>', useSampleData)
                              }}
                              className="text-gray-800"
                              style={{ fontSize: '10pt', lineHeight: '1.15' }}
                            />
                          </div>
                        );
                      }

                      // Form Field
                      if (section.type === 'form_field') {
                        return (
                          <div key={section.id} className="mb-4 inline-block px-2 py-1 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm font-mono">
                            {section.content || 'form_field'}
                          </div>
                        );
                      }

                      return null;
                    })}
                        </div>

                        {/* Page Footer */}
                        <div
                          className="absolute bottom-0 left-0 right-0 border-t-2 border-gray-800 pt-2 flex items-center justify-between text-gray-700"
                          style={{
                            padding: '8px 20mm 8px 20mm',
                            height: '15mm',
                            fontSize: '9pt',
                            lineHeight: '1.3'
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{templateName || 'Document Template'} Ver {templateVersion}</span>
                            <span className="text-gray-500">•</span>
                            <span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span>Produced by AlfiePRO NOR Generator</span>
                            <span className="font-medium">Page {pageNum + 1}</span>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Preview shows approximate PDF layout. Actual output may vary slightly.
                  </p>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};