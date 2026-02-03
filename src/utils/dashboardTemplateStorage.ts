import { supabase } from './supabase';
import { DashboardLayout } from '../types/dashboard';

export interface SavedDashboardTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  is_default: boolean;
  is_public: boolean;
  is_system_template?: boolean;
  is_editable_by_super_admin?: boolean;
  template_data: DashboardLayout;
  club_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function saveTemplate(
  name: string,
  description: string,
  icon: string,
  layout: DashboardLayout,
  clubId: string | null,
  isPublic: boolean = false
): Promise<SavedDashboardTemplate | null> {
  try {
    // Convert the current layout format to the template format expected by handleApplyTemplate
    const templateWidgets = layout.widgets.map(widget => {
      const row = layout.rows.find(r => r.id === widget.rowId);
      return {
        type: widget.type,
        row: row?.order || 0,
        col: widget.columnIndex,
        width: widget.position.w,
        height: widget.position.h,
        settings: widget.settings,
        colorTheme: widget.colorTheme
      };
    });

    const rowConfigs = layout.rows.map(row => ({
      row: row.order,
      height: row.height,
      columns: row.columns
    }));

    const templateData = {
      lg: templateWidgets,
      row_configs: rowConfigs,
      version: layout.version || 1
    };

    const { data, error } = await supabase
      .from('dashboard_templates')
      .insert({
        name,
        description,
        icon,
        is_default: false,
        is_public: isPublic,
        template_data: templateData,
        club_id: clubId,
        created_by: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving template:', error);
    return null;
  }
}

export async function updateTemplate(
  templateId: string,
  updates: {
    name?: string;
    description?: string;
    icon?: string;
    template_data?: DashboardLayout;
    is_public?: boolean;
  }
): Promise<SavedDashboardTemplate | null> {
  try {
    // If template_data is being updated, convert it to the expected format
    let processedUpdates = { ...updates };
    if (updates.template_data) {
      const layout = updates.template_data;
      const templateWidgets = layout.widgets.map(widget => {
        const row = layout.rows.find(r => r.id === widget.rowId);
        return {
          type: widget.type,
          row: row?.order || 0,
          col: widget.columnIndex,
          width: widget.position.w,
          height: widget.position.h,
          settings: widget.settings,
          colorTheme: widget.colorTheme
        };
      });

      const rowConfigs = layout.rows.map(row => ({
        row: row.order,
        height: row.height,
        columns: row.columns
      }));

      const templateData = {
        lg: templateWidgets,
        row_configs: rowConfigs,
        version: layout.version || 1
      };

      processedUpdates.template_data = templateData as any;
    }

    const { data, error} = await supabase
      .from('dashboard_templates')
      .update(processedUpdates)
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating template:', error);
    return null;
  }
}

export async function getTemplates(clubId?: string): Promise<SavedDashboardTemplate[]> {
  try {
    let query = supabase
      .from('dashboard_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (clubId) {
      query = query.or(`is_system_template.eq.true,is_default.eq.true,is_public.eq.true,club_id.eq.${clubId}`);
    } else {
      query = query.or('is_system_template.eq.true,is_default.eq.true');
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
}

export async function getSystemTemplates(): Promise<SavedDashboardTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('dashboard_templates')
      .select('*')
      .eq('is_system_template', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching system templates:', error);
    return [];
  }
}

export async function getTemplate(templateId: string): Promise<SavedDashboardTemplate | null> {
  try {
    const { data, error } = await supabase
      .from('dashboard_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching template:', error);
    return null;
  }
}

export async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('dashboard_templates')
      .delete()
      .eq('id', templateId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting template:', error);
    return false;
  }
}

export async function updateDefaultTemplate(
  templateId: string,
  layout: DashboardLayout
): Promise<boolean> {
  try {
    // Convert the layout format
    const templateWidgets = layout.widgets.map(widget => {
      const row = layout.rows.find(r => r.id === widget.rowId);
      return {
        type: widget.type,
        row: row?.order || 0,
        col: widget.columnIndex,
        width: widget.position.w,
        height: widget.position.h,
        settings: widget.settings,
        colorTheme: widget.colorTheme
      };
    });

    const rowConfigs = layout.rows.map(row => ({
      row: row.order,
      height: row.height,
      columns: row.columns
    }));

    const templateData = {
      lg: templateWidgets,
      row_configs: rowConfigs,
      version: layout.version || 1
    };

    const { error } = await supabase
      .from('dashboard_templates')
      .update({ template_data: templateData })
      .eq('id', templateId)
      .eq('is_default', true);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating default template:', error);
    return false;
  }
}
