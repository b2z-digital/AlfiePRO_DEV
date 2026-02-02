import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Type, Hash, Calendar, CheckSquare, Circle, ChevronDown, Mail, Phone, Link as LinkIcon, AlignLeft, Save, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { RaceFormWithFields, FormField, FormFieldType, FormFieldConfig, FormFieldOption } from '../types/forms';
import { useNotifications } from '../contexts/NotificationContext';

interface FormBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  editingForm?: RaceFormWithFields | null;
  onSuccess?: () => void;
}

const FIELD_TYPES: { value: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'text', label: 'Text Input', icon: <Type size={16} /> },
  { value: 'textarea', label: 'Text Area', icon: <AlignLeft size={16} /> },
  { value: 'number', label: 'Number', icon: <Hash size={16} /> },
  { value: 'date', label: 'Date', icon: <Calendar size={16} /> },
  { value: 'email', label: 'Email', icon: <Mail size={16} /> },
  { value: 'phone', label: 'Phone', icon: <Phone size={16} /> },
  { value: 'url', label: 'URL', icon: <LinkIcon size={16} /> },
  { value: 'checkbox', label: 'Checkbox', icon: <CheckSquare size={16} /> },
  { value: 'radio', label: 'Radio Buttons', icon: <Circle size={16} /> },
  { value: 'select', label: 'Dropdown', icon: <ChevronDown size={16} /> }
];

export const FormBuilderModal: React.FC<FormBuilderModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  editingForm,
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (editingForm) {
      setFormName(editingForm.name);
      setFormDescription(editingForm.description || '');
      setFields(editingForm.fields.map(field => ({
        field_label: field.field_label,
        field_name: field.field_name,
        field_type: field.field_type,
        is_required: field.is_required,
        placeholder: field.placeholder || '',
        options: field.options || []
      })));
    } else {
      setFormName('');
      setFormDescription('');
      setFields([]);
    }
  }, [editingForm]);

  const generateFieldName = (label: string): string => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  };

  const addField = () => {
    const newField: FormFieldConfig = {
      field_label: '',
      field_name: '',
      field_type: 'text',
      is_required: false,
      placeholder: '',
      options: []
    };
    setFields([...fields, newField]);
  };

  const updateField = (index: number, updates: Partial<FormFieldConfig>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updates };
    
    // Auto-generate field name when label changes
    if (updates.field_label !== undefined) {
      newFields[index].field_name = generateFieldName(updates.field_label);
    }
    
    setFields(newFields);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newFields.length) {
      [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
      setFields(newFields);
    }
  };

  const addOption = (fieldIndex: number) => {
    const newFields = [...fields];
    newFields[fieldIndex].options.push({ label: '', value: '' });
    setFields(newFields);
  };

  const updateOption = (fieldIndex: number, optionIndex: number, updates: Partial<FormFieldOption>) => {
    const newFields = [...fields];
    newFields[fieldIndex].options[optionIndex] = {
      ...newFields[fieldIndex].options[optionIndex],
      ...updates
    };
    
    // Auto-generate value when label changes
    if (updates.label !== undefined) {
      newFields[fieldIndex].options[optionIndex].value = updates.label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
    }
    
    setFields(newFields);
  };

  const removeOption = (fieldIndex: number, optionIndex: number) => {
    const newFields = [...fields];
    newFields[fieldIndex].options.splice(optionIndex, 1);
    setFields(newFields);
  };

  const validateForm = (): boolean => {
    if (!formName.trim()) {
      setError('Form name is required');
      return false;
    }

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (!field.field_label.trim()) {
        setError(`Field ${i + 1}: Label is required`);
        return false;
      }
      if (!field.field_name.trim()) {
        setError(`Field ${i + 1}: Field name is required`);
        return false;
      }
      if ((field.field_type === 'radio' || field.field_type === 'select') && field.options.length === 0) {
        setError(`Field ${i + 1}: At least one option is required for ${field.field_type} fields`);
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm() || !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      if (editingForm) {
        // Update existing form
        const { error: formError } = await supabase
          .from('race_forms')
          .update({
            name: formName,
            description: formDescription || null
          })
          .eq('id', editingForm.id);

        if (formError) throw formError;

        // Delete existing fields
        const { error: deleteError } = await supabase
          .from('form_fields')
          .delete()
          .eq('form_id', editingForm.id);

        if (deleteError) throw deleteError;

        // Insert new fields
        if (fields.length > 0) {
          const fieldsToInsert = fields.map((field, index) => ({
            form_id: editingForm.id,
            field_name: field.field_name,
            field_label: field.field_label,
            field_type: field.field_type,
            options: field.options,
            is_required: field.is_required,
            placeholder: field.placeholder || null,
            field_order: index + 1
          }));

          const { error: fieldsError } = await supabase
            .from('form_fields')
            .insert(fieldsToInsert);

          if (fieldsError) throw fieldsError;
        }
      } else {
        // Create new form
        const { data: formData, error: formError } = await supabase
          .from('race_forms')
          .insert({
            club_id: currentClub.clubId,
            name: formName,
            description: formDescription || null,
            is_active: true
          })
          .select()
          .single();

        if (formError) throw formError;

        // Insert fields
        if (fields.length > 0) {
          const fieldsToInsert = fields.map((field, index) => ({
            form_id: formData.id,
            field_name: field.field_name,
            field_label: field.field_label,
            field_type: field.field_type,
            options: field.options,
            is_required: field.is_required,
            placeholder: field.placeholder || null,
            field_order: index + 1
          }));

          const { error: fieldsError } = await supabase
            .from('form_fields')
            .insert(fieldsToInsert);

          if (fieldsError) throw fieldsError;
        }
      }

      addNotification('success', editingForm ? 'Form updated successfully' : 'Form created successfully');
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error saving form:', err);
      setError(err instanceof Error ? err.message : 'Failed to save form');
    } finally {
      setLoading(false);
    }
  };

  const renderFieldPreview = (field: FormFieldConfig) => {
    const baseInputClass = `
      w-full px-3 py-2 rounded-lg border text-sm
      ${darkMode 
        ? 'bg-slate-700 border-slate-600 text-white' 
        : 'bg-white border-slate-300 text-slate-900'}
    `;

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            placeholder={field.placeholder}
            className={`${baseInputClass} h-20 resize-none`}
            disabled
          />
        );
      case 'select':
        return (
          <select className={baseInputClass} disabled>
            <option>{field.placeholder || 'Select an option'}</option>
            {field.options.map((option, i) => (
              <option key={i} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options.map((option, i) => (
              <label key={i} className="flex items-center gap-2">
                <input type="radio" name={field.field_name} disabled />
                <span className="text-sm text-slate-300">{option.label}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled />
            <span className="text-sm text-slate-300">{field.field_label}</span>
          </label>
        );
      default:
        return (
          <input
            type={field.field_type}
            placeholder={field.placeholder}
            className={baseInputClass}
            disabled
          />
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-6xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Main Form Builder */}
        <div className="flex-1 flex flex-col">
          <div className={`
            flex items-center justify-between p-6 border-b
            ${darkMode ? 'border-slate-700' : 'border-slate-200'}
          `}>
            <div className="flex items-center gap-3">
              <Type className="text-blue-400" size={24} />
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                {editingForm ? 'Edit Form' : 'Create New Form'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                  ${showPreview
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }
                `}
              >
                <Eye size={16} />
                Preview
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                className={`
                  rounded-full p-2 transition-colors
                  ${darkMode 
                    ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                  ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Form Details */}
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Form Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Skipper Registration Form"
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Brief description of this form"
                  rows={3}
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                />
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  Form Fields
                </h3>
                <button
                  onClick={addField}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={16} />
                  Add Field
                </button>
              </div>

              {fields.length === 0 ? (
                <div className={`
                  text-center py-8 rounded-lg border-2 border-dashed
                  ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500'}
                `}>
                  <Type size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="mb-2">No fields added yet</p>
                  <button
                    onClick={addField}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Add your first field
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div
                      key={index}
                      className={`
                        p-4 rounded-lg border
                        ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
                      `}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <GripVertical size={16} className="text-slate-400" />
                          <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Field {index + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => moveField(index, 'up')}
                            disabled={index === 0}
                            className="p-1 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveField(index, 'down')}
                            disabled={index === fields.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-300 disabled:opacity-50"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => removeField(index)}
                            className="p-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Field Label *
                          </label>
                          <input
                            type="text"
                            value={field.field_label}
                            onChange={(e) => updateField(index, { field_label: e.target.value })}
                            placeholder="e.g., Skipper's Name"
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Field Type
                          </label>
                          <select
                            value={field.field_type}
                            onChange={(e) => updateField(index, { field_type: e.target.value as FormFieldType })}
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          >
                            {FIELD_TYPES.map(type => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Field Name
                          </label>
                          <input
                            type="text"
                            value={field.field_name}
                            onChange={(e) => updateField(index, { field_name: e.target.value })}
                            placeholder="Auto-generated"
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Placeholder
                          </label>
                          <input
                            type="text"
                            value={field.placeholder}
                            onChange={(e) => updateField(index, { placeholder: e.target.value })}
                            placeholder="Placeholder text"
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.is_required}
                            onChange={(e) => updateField(index, { is_required: e.target.checked })}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                          <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Required field
                          </span>
                        </label>
                      </div>

                      {/* Options for radio and select fields */}
                      {(field.field_type === 'radio' || field.field_type === 'select') && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Options
                            </label>
                            <button
                              onClick={() => addOption(index)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              + Add Option
                            </button>
                          </div>
                          <div className="space-y-2">
                            {field.options.map((option, optionIndex) => (
                              <div key={optionIndex} className="flex gap-2">
                                <input
                                  type="text"
                                  value={option.label}
                                  onChange={(e) => updateOption(index, optionIndex, { label: e.target.value })}
                                  placeholder="Option label"
                                  className={`
                                    flex-1 px-3 py-1 text-sm rounded border
                                    ${darkMode 
                                      ? 'bg-slate-700 border-slate-600 text-white' 
                                      : 'bg-white border-slate-300 text-slate-900'}
                                  `}
                                />
                                <button
                                  onClick={() => removeOption(index, optionIndex)}
                                  className="p-1 text-red-400 hover:text-red-300"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`
            flex justify-end gap-3 p-6 border-t
            ${darkMode ? 'border-slate-700' : 'border-slate-200'}
          `}>
            <button
              onClick={onClose}
              disabled={loading}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !formName.trim()}
              className={`
                flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
                ${(loading || !formName.trim()) ? 'opacity-50 cursor-not-allowed' : ''}
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
                  {editingForm ? 'Update Form' : 'Create Form'}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className={`
            w-96 border-l flex flex-col
            ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}
          `}>
            <div className={`
              p-4 border-b
              ${darkMode ? 'border-slate-700' : 'border-slate-200'}
            `}>
              <h3 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Form Preview
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div>
                  <h4 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    {formName || 'Untitled Form'}
                  </h4>
                  {formDescription && (
                    <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      {formDescription}
                    </p>
                  )}
                </div>

                {fields.map((field, index) => (
                  <div key={index} className="space-y-2">
                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {field.field_label}
                      {field.is_required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {renderFieldPreview(field)}
                  </div>
                ))}

                {fields.length === 0 && (
                  <div className="text-center py-8">
                    <Type size={32} className="mx-auto mb-2 text-slate-500 opacity-50" />
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Add fields to see preview
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};