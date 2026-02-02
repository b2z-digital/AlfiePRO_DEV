export interface DocumentTemplate {
  id: string;
  club_id: string;
  name: string;
  description?: string;
  logo_url?: string;
  sections: DocumentSection[];
  template_type?: 'structured' | 'html';
  html_content?: string;
  page_settings?: {
    pageSize?: 'a4' | 'letter';
    orientation?: 'portrait' | 'landscape';
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
  };
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface DocumentSection {
  id: string;
  type: 'heading' | 'paragraph' | 'numbered_list' | 'bullet_list' | 'form_field' | 'page_break';
  content: string;
  level?: number; // For headings (1-6)
  form_field_id?: string; // Reference to form field when type is 'form_field'
  order: number;
  styling?: {
    fontSize?: string;
    fontWeight?: string;
    textAlign?: string;
    marginTop?: string;
    marginBottom?: string;
    color?: string;
  };
}

export interface FormFieldReference {
  id: string;
  label: string;
  field_name: string;
  field_type: string;
  form_id: string;
  form_name: string;
}

export interface DocumentTemplateWithFields extends DocumentTemplate {
  available_forms: {
    id: string;
    name: string;
    fields: FormFieldReference[];
  }[];
}