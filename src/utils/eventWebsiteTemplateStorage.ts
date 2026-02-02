import { supabase } from './supabase';

export interface EventWebsiteTemplate {
  id: string;
  name: string;
  description: string | null;
  template_type: 'single_event' | 'multi_event';
  preview_image: string | null;
  created_by: string | null;
  club_id: string | null;
  state_association_id: string | null;
  national_association_id: string | null;
  is_public: boolean;
  use_count: number;
  category: string | null;
  config: any;
  created_at: string;
  updated_at: string;
  pages?: EventWebsiteTemplatePage[];
  global_sections?: EventWebsiteTemplateGlobalSection[];
}

export interface EventWebsiteTemplatePage {
  id?: string;
  template_id?: string;
  page_slug: string;
  page_name: string;
  page_order: number;
  is_in_nav: boolean;
  is_home: boolean;
  icon: string | null;
  layout_config: any;
  created_at?: string;
}

export interface EventWebsiteTemplateGlobalSection {
  id?: string;
  template_id?: string;
  section_type: 'header' | 'footer' | 'navigation';
  config: any;
  created_at?: string;
}

/**
 * Save an existing event website as a template
 */
export const saveEventWebsiteAsTemplate = async (
  eventWebsiteId: string,
  templateData: {
    name: string;
    description?: string;
    template_type: 'single_event' | 'multi_event';
    category?: string;
    is_public?: boolean;
    club_id?: string;
    state_association_id?: string;
    national_association_id?: string;
  }
): Promise<{ template: EventWebsiteTemplate | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Note: We don't validate club_id here to avoid RLS policy conflicts
    // The foreign key constraint on event_website_templates will catch invalid club IDs
    // And the RLS policies on event_website_templates ensure proper access control

    // Fetch the event website pages and layouts
    const { data: pages, error: pagesError } = await supabase
      .from('event_page_layouts')
      .select('*')
      .eq('event_website_id', eventWebsiteId)
      .order('navigation_order');

    if (pagesError) throw pagesError;

    // Fetch global sections
    const { data: globalSections, error: globalError } = await supabase
      .from('event_global_sections')
      .select('*')
      .eq('event_website_id', eventWebsiteId);

    if (globalError) throw globalError;

    // Fetch event website config
    const { data: eventWebsite, error: websiteError } = await supabase
      .from('event_websites')
      .select('theme_config, meta_title, meta_description')
      .eq('id', eventWebsiteId)
      .single();

    if (websiteError) throw websiteError;

    // Extract colors from theme_config
    const themeConfig = eventWebsite?.theme_config || {};

    // Build insert data, filtering out undefined values
    const insertData: any = {
      name: templateData.name,
      description: templateData.description,
      template_type: templateData.template_type,
      category: templateData.category,
      is_public: templateData.is_public || false,
      created_by: user.id,
      config: {
        colors: {
          primary: themeConfig.primaryColor || '#3B82F6',
          secondary: themeConfig.secondaryColor || '#1E40AF',
          accent: themeConfig.accentColor,
        },
        theme: {
          fontFamily: themeConfig.fontFamily || 'Inter',
        },
        seo: {
          defaultTitle: eventWebsite?.meta_title,
          defaultDescription: eventWebsite?.meta_description,
        },
      },
    };

    // Only add organization IDs if they are defined
    if (templateData.club_id) insertData.club_id = templateData.club_id;
    if (templateData.state_association_id) insertData.state_association_id = templateData.state_association_id;
    if (templateData.national_association_id) insertData.national_association_id = templateData.national_association_id;

    // Create the template
    const { data: template, error: templateError } = await supabase
      .from('event_website_templates')
      .insert(insertData)
      .select()
      .single();

    if (templateError) throw templateError;

    // Create template pages
    if (pages && pages.length > 0) {
      const templatePages = pages.map(page => ({
        template_id: template.id,
        page_slug: page.page_slug,
        page_name: page.title || page.page_slug,
        page_order: page.navigation_order || 0,
        is_in_nav: page.show_in_navigation !== false,
        is_home: page.is_homepage || false,
        icon: page.icon || null,
        layout_config: page.rows || [],
      }));

      const { error: pagesInsertError } = await supabase
        .from('event_website_template_pages')
        .insert(templatePages);

      if (pagesInsertError) throw pagesInsertError;
    }

    // Create template global sections
    if (globalSections && globalSections.length > 0) {
      const templateGlobalSections = globalSections.map(section => ({
        template_id: template.id,
        section_type: section.section_type,
        config: section.config,
      }));

      const { error: sectionsInsertError } = await supabase
        .from('event_website_template_global_sections')
        .insert(templateGlobalSections);

      if (sectionsInsertError) throw sectionsInsertError;
    }

    return { template, error: null };
  } catch (error) {
    console.error('Error saving event website as template:', error);
    return { template: null, error };
  }
};

/**
 * Get all available templates (public + user's organization templates)
 */
export const getAvailableTemplates = async (filters?: {
  template_type?: 'single_event' | 'multi_event';
  category?: string;
}): Promise<{ templates: EventWebsiteTemplate[]; error: any }> => {
  try {
    let query = supabase
      .from('event_website_templates')
      .select(`
        *,
        event_website_template_pages:event_website_template_pages(count)
      `)
      .order('use_count', { ascending: false });

    if (filters?.template_type) {
      query = query.eq('template_type', filters.template_type);
    }

    if (filters?.category) {
      query = query.eq('category', filters.category);
    }

    const { data: templates, error } = await query;

    if (error) throw error;

    return { templates: templates || [], error: null };
  } catch (error) {
    console.error('Error fetching templates:', error);
    return { templates: [], error };
  }
};

/**
 * Get a specific template with all its pages and global sections
 */
export const getTemplate = async (
  templateId: string
): Promise<{ template: EventWebsiteTemplate | null; error: any }> => {
  try {
    const { data: template, error: templateError } = await supabase
      .from('event_website_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) throw templateError;

    const { data: pages, error: pagesError } = await supabase
      .from('event_website_template_pages')
      .select('*')
      .eq('template_id', templateId)
      .order('page_order');

    if (pagesError) throw pagesError;

    const { data: globalSections, error: sectionsError } = await supabase
      .from('event_website_template_global_sections')
      .select('*')
      .eq('template_id', templateId);

    if (sectionsError) throw sectionsError;

    return {
      template: {
        ...template,
        pages: pages || [],
        global_sections: globalSections || [],
      },
      error: null,
    };
  } catch (error) {
    console.error('Error fetching template:', error);
    return { template: null, error };
  }
};

/**
 * Apply a template to a new event website
 */
export const applyTemplateToEventWebsite = async (
  templateId: string,
  eventWebsiteId: string
): Promise<{ success: boolean; error: any }> => {
  try {
    // Get the template with all its data
    const { template, error: fetchError } = await getTemplate(templateId);
    if (fetchError || !template) throw fetchError || new Error('Template not found');

    // Update event website with template theme config
    if (template.config?.colors || template.config?.theme) {
      const themeConfig: any = {
        primaryColor: template.config.colors?.primary || '#3B82F6',
        secondaryColor: template.config.colors?.secondary || '#1E40AF',
      };

      if (template.config.colors?.accent) {
        themeConfig.accentColor = template.config.colors.accent;
      }

      if (template.config.theme?.fontFamily) {
        themeConfig.fontFamily = template.config.theme.fontFamily;
      }

      const { error: updateError } = await supabase
        .from('event_websites')
        .update({
          theme_config: themeConfig,
        })
        .eq('id', eventWebsiteId);

      if (updateError) throw updateError;
    }

    // Create pages from template
    if (template.pages && template.pages.length > 0) {
      const eventPages = template.pages.map(page => ({
        event_website_id: eventWebsiteId,
        page_slug: page.page_slug,
        title: page.page_name,
        navigation_order: page.page_order,
        show_in_navigation: page.is_in_nav,
        is_homepage: page.is_home,
        icon: page.icon,
        rows: page.layout_config,
        is_published: true,
        page_type: page.is_home ? 'home' : 'custom',
      }));

      const { error: pagesError } = await supabase
        .from('event_page_layouts')
        .insert(eventPages);

      if (pagesError) throw pagesError;
    }

    // Create global sections from template
    if (template.global_sections && template.global_sections.length > 0) {
      const eventGlobalSections = template.global_sections.map(section => ({
        event_website_id: eventWebsiteId,
        section_type: section.section_type,
        config: section.config,
      }));

      const { error: sectionsError } = await supabase
        .from('event_global_sections')
        .insert(eventGlobalSections);

      if (sectionsError) throw sectionsError;
    }

    // Increment template use count
    await supabase.rpc('increment_template_use_count', { p_template_id: templateId });

    return { success: true, error: null };
  } catch (error) {
    console.error('Error applying template:', error);
    return { success: false, error };
  }
};

/**
 * Delete a template
 */
export const deleteTemplate = async (
  templateId: string
): Promise<{ success: boolean; error: any }> => {
  try {
    const { error } = await supabase
      .from('event_website_templates')
      .delete()
      .eq('id', templateId);

    if (error) throw error;

    return { success: true, error: null };
  } catch (error) {
    console.error('Error deleting template:', error);
    return { success: false, error };
  }
};

/**
 * Update a template
 */
export const updateTemplate = async (
  templateId: string,
  updates: Partial<EventWebsiteTemplate>
): Promise<{ template: EventWebsiteTemplate | null; error: any }> => {
  try {
    const { data: template, error } = await supabase
      .from('event_website_templates')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .select()
      .single();

    if (error) throw error;

    return { template, error: null };
  } catch (error) {
    console.error('Error updating template:', error);
    return { template: null, error };
  }
};
