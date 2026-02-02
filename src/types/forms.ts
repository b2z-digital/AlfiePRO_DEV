export interface RaceForm {
  id: string;
  club_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface FormField {
  id: string;
  form_id: string;
  field_name: string;
  field_label: string;
  field_type: FormFieldType;
  options: FormFieldOption[];
  is_required: boolean;
  placeholder?: string;
  field_order: number;
  mapping_key?: string;
  created_at: string;
  updated_at: string;
}

export type FormFieldType = 
  | 'text' 
  | 'textarea' 
  | 'number' 
  | 'date' 
  | 'checkbox' 
  | 'radio' 
  | 'select' 
  | 'email' 
  | 'phone' 
  | 'url'
  | 'clubs'
  | 'venue'
  | 'page_break';

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormFieldConfig {
  field_label: string;
  field_name: string;
  field_type: FormFieldType;
  is_required: boolean;
  placeholder?: string;
  options: FormFieldOption[];
  mapping_key?: string;
}

export interface RaceFormWithFields extends RaceForm {
  fields: FormField[];
}