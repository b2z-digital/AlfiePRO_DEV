import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Type, Hash, Calendar, CheckSquare, Circle, ChevronDown, Mail, Phone, Link as LinkIcon, AlignLeft, Save, Eye, Building, MapPin, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { RaceFormWithFields, FormField, FormFieldType, FormFieldConfig, FormFieldOption } from '../../types/forms';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';
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

interface FormBuilderPageProps {
  editingForm?: RaceFormWithFields | null;
  onSuccess?: () => void;
}

const FIELD_TYPES: { value: FormFieldType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'text', label: 'Single Line Text', icon: <Type size={20} />, description: 'Short text input field' },
  { value: 'textarea', label: 'Paragraph Text', icon: <AlignLeft size={20} />, description: 'Multi-line text area' },
  { value: 'number', label: 'Number', icon: <Hash size={20} />, description: 'Numeric input field' },
  { value: 'date', label: 'Date', icon: <Calendar size={20} />, description: 'Date picker field' },
  { value: 'email', label: 'Email', icon: <Mail size={20} />, description: 'Email address field' },
  { value: 'phone', label: 'Phone', icon: <Phone size={20} />, description: 'Phone number field' },
  { value: 'url', label: 'Website URL', icon: <LinkIcon size={20} />, description: 'URL input field' },
  { value: 'checkbox', label: 'Checkboxes', icon: <CheckSquare size={20} />, description: 'Multiple choice checkboxes' },
  { value: 'radio', label: 'Radio Buttons', icon: <Circle size={20} />, description: 'Single choice options' },
  { value: 'select', label: 'Dropdown', icon: <ChevronDown size={20} />, description: 'Dropdown selection' },
  { value: 'clubs', label: 'Clubs', icon: <Building size={20} />, description: 'Select from available clubs' },
  { value: 'venue', label: 'Venue', icon: <MapPin size={20} />, description: 'Select from available venues' },
  { value: 'page_break', label: 'Page Break', icon: <FileText size={20} />, description: 'Split form into multiple pages' }
];

const MAPPING_KEYS = [
  { value: '', label: 'None (Manual Entry)', description: 'User must fill this field manually' },
  { value: 'event_name', label: 'Event/Regatta Name', description: 'Auto-fills from event name' },
  { value: 'event_start_date', label: 'Event Start Date', description: 'Auto-fills from event start date' },
  { value: 'event_end_date', label: 'Event End Date', description: 'Auto-fills from event end date' },
  { value: 'event_day_2_date', label: 'Day 2 Date', description: 'Auto-calculates 2nd day date' },
  { value: 'event_day_3_date', label: 'Day 3 Date', description: 'Auto-calculates 3rd day date' },
  { value: 'event_day_4_date', label: 'Day 4 Date', description: 'Auto-calculates 4th day date' },
  { value: 'venue_id', label: 'Venue (Dropdown)', description: 'Auto-selects venue from event' },
  { value: 'venue_name', label: 'Venue Name (Text)', description: 'Auto-fills venue name as text' },
  { value: 'state_association_id', label: 'State Association', description: 'Auto-fills state association' },
  { value: 'club_id', label: 'Club', description: 'Auto-fills organizing club' },
  { value: 'boat_class_name', label: 'Boat/Yacht Class', description: 'Auto-fills boat class name' },
  { value: 'number_of_days', label: 'Number of Racing Days', description: 'Auto-calculates racing days' },
];

interface SortableFieldItemProps {
  field: FormFieldConfig;
  index: number;
  updateField: (index: number, updates: Partial<FormFieldConfig>) => void;
  removeField: (index: number) => void;
  addOption: (fieldIndex: number) => void;
  removeOption: (fieldIndex: number, optionIndex: number) => void;
  updateOption: (fieldIndex: number, optionIndex: number, updates: Partial<FormFieldOption>) => void;
}

const SortableFieldItem: React.FC<SortableFieldItemProps> = ({
  field,
  index,
  updateField,
  removeField,
  addOption,
  removeOption,
  updateOption,
}) => {
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
            Field {index + 1}
          </span>
        </div>
        <button
          onClick={() => removeField(index)}
          className="p-1 text-red-500 hover:text-red-700"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Field Label *
          </label>
          <input
            type="text"
            value={field.field_label}
            onChange={(e) => updateField(index, { field_label: e.target.value })}
            placeholder="e.g., Skipper's Name"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Field Type
          </label>
          <select
            value={field.field_type}
            onChange={(e) => updateField(index, { field_type: e.target.value as FormFieldType })}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {FIELD_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Field Name
          </label>
          <input
            type="text"
            value={field.field_name}
            onChange={(e) => updateField(index, { field_name: e.target.value })}
            placeholder="field_name"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {!['page_break', 'clubs', 'venue'].includes(field.field_type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Placeholder
            </label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => updateField(index, { placeholder: e.target.value })}
              placeholder="Enter placeholder text..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {field.field_type !== 'page_break' && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Auto-Populate From Event Data
            </label>
            <select
              value={field.mapping_key || ''}
              onChange={(e) => updateField(index, { mapping_key: e.target.value || undefined })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {MAPPING_KEYS.map(key => (
                <option key={key.value} value={key.value}>
                  {key.label} {key.description && `- ${key.description}`}
                </option>
              ))}
            </select>
            {field.mapping_key && (
              <p className="mt-1 text-sm text-green-600">
                This field will automatically populate from event setup data
              </p>
            )}
          </div>
        )}
      </div>

      {['radio', 'select', 'checkbox'].includes(field.field_type) && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Options
          </label>
          {field.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-center gap-3 mb-3">
              <input
                type="text"
                value={option.label}
                onChange={(e) => updateOption(index, optionIndex, { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="Option label"
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => removeOption(index, optionIndex)}
                className="p-2 text-red-500 hover:text-red-700"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => addOption(index)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add Option
          </button>
        </div>
      )}

      {field.field_type !== 'page_break' && (
        <div className="mt-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={field.is_required}
              onChange={(e) => updateField(index, { is_required: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Required field</span>
          </label>
        </div>
      )}
    </div>
  );
};

export const FormBuilderPage: React.FC<FormBuilderPageProps> = ({
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editingForm = location.state?.editingForm as RaceFormWithFields | null;
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { addNotification } = useNotifications();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
        mapping_key: field.mapping_key,
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
      is_required: true,
      placeholder: '',
      options: []
    };
    setFields([...fields, newField]);
  };

  const addFieldFromType = (fieldType: FormFieldType) => {
    const fieldTypeInfo = FIELD_TYPES.find(ft => ft.value === fieldType);
    const newField: FormFieldConfig = {
      field_label: fieldTypeInfo?.label || '',
      field_name: generateFieldName(fieldTypeInfo?.label || ''),
      field_type: fieldType,
      is_required: true,
      placeholder: '',
      options: fieldType === 'radio' || fieldType === 'select' ? [{ label: 'Option 1', value: 'option_1' }] : []
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setFields((items) => {
        const oldIndex = items.findIndex((_, i) => i.toString() === active.id);
        const newIndex = items.findIndex((_, i) => i.toString() === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
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
            mapping_key: field.mapping_key || null,
            field_order: index
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
            mapping_key: field.mapping_key || null,
            field_order: index
          }));

          const { error: fieldsError } = await supabase
            .from('form_fields')
            .insert(fieldsToInsert);

          if (fieldsError) throw fieldsError;
        }
      }

      addNotification('success', editingForm ? 'Form updated successfully' : 'Form created successfully');
      if (onSuccess) onSuccess();
      navigate('/settings', { state: { activeTab: 'race-documents' } });
    } catch (err) {
      console.error('Error saving form:', err);
      setError(err instanceof Error ? err.message : 'Failed to save form');
    } finally {
      setLoading(false);
    }
  };

  const renderFieldPreview = (field: FormFieldConfig) => {
    const baseInputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white text-sm';

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
            {field.options.map((option, i) => (
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
          <div className="py-8 border-t-2 border-dashed border-gray-300 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg">
              <FileText size={16} />
              <span className="font-medium">Page Break</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">Form continues on next page</p>
          </div>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {editingForm ? 'Edit Form' : 'Create New Form'}
            </h1>
            <p className="text-sm text-gray-500">
              Build a custom form for race documents
            </p>
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
            <button
              onClick={() => navigate('/settings', { state: { activeTab: 'race-documents' } })}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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

            {/* Form Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Form Details</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Form Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g., Skipper Registration Form"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief description of this form"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Form Fields</h2>

              {fields.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <Type size={48} className="mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No fields added yet</h3>
                  <p className="text-gray-500 mb-6">Drag field types from the right panel to start building your form</p>
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                    <span>or</span>
                    <button
                      onClick={addField}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      click here to add a basic field
                    </button>
                  </div>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={fields.map((_, i) => i.toString())}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-4">
                      {fields.map((field, index) => (
                        <SortableFieldItem
                          key={index}
                          field={field}
                          index={index}
                          updateField={updateField}
                          removeField={removeField}
                          addOption={addOption}
                          removeOption={removeOption}
                          updateOption={updateOption}
                        />
                      ))}

                      {/* Add Field Button */}
                      <div className="flex justify-start pt-4">
                        <button
                          onClick={addField}
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          <Plus size={16} />
                          Add Field
                        </button>
                      </div>
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* Field Types Sidebar */}
        <div className="w-80 bg-gray-50 border-l border-gray-200 overflow-y-auto">
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Field Types</h3>
              <p className="text-sm text-gray-600">Drag fields to the form or click to add</p>
            </div>
            
            {/* Standard Fields */}
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">Standard Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_TYPES.filter(type => ['text', 'textarea', 'number', 'date'].includes(type.value)).map((fieldType) => (
                  <button
                    key={fieldType.value}
                    onClick={() => addFieldFromType(fieldType.value)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group cursor-pointer text-left"
                    title={fieldType.description}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="text-gray-600 group-hover:text-blue-600 mb-2">
                        {fieldType.icon}
                      </div>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700">
                        {fieldType.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Contact Fields */}
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">Contact Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_TYPES.filter(type => ['email', 'phone', 'url'].includes(type.value)).map((fieldType) => (
                  <button
                    key={fieldType.value}
                    onClick={() => addFieldFromType(fieldType.value)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group cursor-pointer text-left"
                    title={fieldType.description}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="text-gray-600 group-hover:text-blue-600 mb-2">
                        {fieldType.icon}
                      </div>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700">
                        {fieldType.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Choice Fields */}
            <div className="mb-8">
              <h4 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">Choice Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_TYPES.filter(type => ['checkbox', 'radio', 'select'].includes(type.value)).map((fieldType) => (
                  <button
                    key={fieldType.value}
                    onClick={() => addFieldFromType(fieldType.value)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group cursor-pointer text-left"
                    title={fieldType.description}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="text-gray-600 group-hover:text-blue-600 mb-2">
                        {fieldType.icon}
                      </div>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700">
                        {fieldType.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Special Fields */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">Special Fields</h4>
              <div className="grid grid-cols-2 gap-3">
                {FIELD_TYPES.filter(type => ['clubs', 'venue', 'page_break'].includes(type.value)).map((fieldType) => (
                  <button
                    key={fieldType.value}
                    onClick={() => addFieldFromType(fieldType.value)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group cursor-pointer text-left"
                    title={fieldType.description}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="text-gray-600 group-hover:text-blue-600 mb-2">
                        {fieldType.icon}
                      </div>
                      <span className="text-xs font-medium text-gray-700 group-hover:text-blue-700">
                        {fieldType.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Preview Panel */}
        {showPreview && (
          <div className="w-96 bg-white border-l border-gray-200 flex flex-col shadow-lg">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Form Preview</h3>
              <p className="text-sm text-gray-600 mt-1">Live preview of your form</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">
                    {formName || 'Untitled Form'}
                  </h4>
                  {formDescription && (
                    <p className="text-gray-600 mb-6">
                      {formDescription}
                    </p>
                  )}
                </div>

                {(() => {
                  // Split fields into pages based on page breaks
                  const pages: FormFieldConfig[][] = [[]];
                  let currentPageIndex = 0;
                  
                  fields.forEach(field => {
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
                        <FileText size={40} className="mx-auto mb-3 text-gray-400" />
                        <p className="text-gray-500">Add fields to see preview</p>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-8">
                      {/* Progress Bar */}
                      {validPages.length > 1 && (
                        <div className="mb-6">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Page 1 of {validPages.length}</span>
                            <span className="text-sm text-gray-500">{Math.round((1 / validPages.length) * 100)}% Complete</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                              style={{ width: `${(1 / validPages.length) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                      
                      {/* Current Page Fields */}
                      <div className="space-y-4">
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
                      {validPages.length > 1 && (
                        <div className="flex justify-between pt-6 border-t border-gray-200">
                          <button
                            disabled
                            className="px-4 py-2 text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <button
                            disabled
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg opacity-50 cursor-not-allowed"
                          >
                            Next Page
                          </button>
                        </div>
                      )}
                      
                      {/* Show indicator for additional pages */}
                      {validPages.length > 1 && (
                        <div className="text-center py-4 border-t border-gray-200">
                          <p className="text-sm text-gray-500">
                            + {validPages.length - 1} more page{validPages.length > 2 ? 's' : ''} in this form
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};