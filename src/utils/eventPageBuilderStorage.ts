import { supabase } from './supabase';
import type { EventPageLayout, EventGlobalSection } from '../types/eventWidgets';

export const eventPageBuilderStorage = {
  async getPageLayout(websiteId: string, pageSlug: string): Promise<EventPageLayout | null> {
    try {
      const { data, error } = await supabase
        .from('event_page_layouts')
        .select('*')
        .eq('event_website_id', websiteId)
        .eq('page_slug', pageSlug)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching page layout:', error);
      return null;
    }
  },

  async savePageLayout(layout: Partial<EventPageLayout>): Promise<boolean> {
    try {
      console.log('Storage: Saving layout to database...', layout);

      const { data, error } = await supabase
        .from('event_page_layouts')
        .upsert({
          event_website_id: layout.event_website_id,
          page_slug: layout.page_slug,
          rows: layout.rows || []
        }, {
          onConflict: 'event_website_id,page_slug'
        })
        .select();

      if (error) {
        console.error('Storage: Database error:', error);
        throw error;
      }

      console.log('Storage: Saved successfully!', data);
      return true;
    } catch (error) {
      console.error('Error saving page layout:', error);
      return false;
    }
  },

  async deletePageLayout(websiteId: string, pageSlug: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('event_page_layouts')
        .delete()
        .eq('event_website_id', websiteId)
        .eq('page_slug', pageSlug);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting page layout:', error);
      return false;
    }
  },

  async getGlobalSection(websiteId: string, sectionType: 'header' | 'menu' | 'footer'): Promise<EventGlobalSection | null> {
    try {
      const { data, error } = await supabase
        .from('event_global_sections')
        .select('*')
        .eq('event_website_id', websiteId)
        .eq('section_type', sectionType)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching global section:', error);
      return null;
    }
  },

  async getAllGlobalSections(websiteId: string): Promise<EventGlobalSection[]> {
    try {
      const { data, error } = await supabase
        .from('event_global_sections')
        .select('*')
        .eq('event_website_id', websiteId)
        .order('section_type');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching global sections:', error);
      return [];
    }
  },

  async saveGlobalSection(section: Partial<EventGlobalSection>): Promise<boolean> {
    try {
      console.log('Storage: Saving global section to database...', section);

      const { data, error } = await supabase
        .from('event_global_sections')
        .upsert({
          event_website_id: section.event_website_id,
          section_type: section.section_type,
          enabled: section.enabled !== undefined ? section.enabled : true,
          config: section.config || {}
        }, {
          onConflict: 'event_website_id,section_type'
        })
        .select();

      if (error) {
        console.error('Storage: Database error:', error);
        throw error;
      }

      console.log('Storage: Global section saved successfully!', data);
      return true;
    } catch (error) {
      console.error('Error saving global section:', error);
      return false;
    }
  },

  async toggleGlobalSection(websiteId: string, sectionType: 'header' | 'menu' | 'footer', enabled: boolean): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('event_global_sections')
        .update({ enabled })
        .eq('event_website_id', websiteId)
        .eq('section_type', sectionType);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error toggling global section:', error);
      return false;
    }
  }
};
