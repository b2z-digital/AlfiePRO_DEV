import { supabase } from './supabase';
import type {
  EventWebsite,
  EventWebsitePage,
  EventSponsor,
  EventWebsiteMedia,
  EventWebsiteDocument,
  EventWebsiteCompetitor,
  EventWebsiteNews,
  EventWebsiteSocialPost,
  EventWebsiteSettings,
  EventWebsiteAnalytics
} from '../types/eventWebsite';

export const eventWebsiteStorage = {
  // Event Websites
  async getEventWebsite(eventId: string): Promise<EventWebsite | null> {
    // Query event_websites table directly
    const { data, error } = await supabase
      .from('event_websites')
      .select('*')
      .or(`id.eq.${eventId},event_id.eq.${eventId}`)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Get event website for any linked event (primary or bundled)
  async getEventWebsiteForEvent(eventId: string): Promise<EventWebsite | null> {
    // First check if it's a primary event
    const primaryWebsite = await this.getEventWebsite(eventId);
    if (primaryWebsite) return primaryWebsite;

    // Check if this event is linked to any website via event_website_events
    const { data: linkedEvent, error } = await supabase
      .from('event_website_events')
      .select('event_website_id')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error || !linkedEvent) return null;

    // Get the full website record
    const { data: website, error: websiteError } = await supabase
      .from('event_websites')
      .select('*')
      .eq('id', linkedEvent.event_website_id)
      .maybeSingle();

    if (websiteError) throw websiteError;
    return website;
  },

  async getEventWebsiteBySlug(slug: string): Promise<EventWebsite | null> {
    const { data, error } = await supabase
      .from('event_websites')
      .select('*')
      .eq('slug', slug)
      .eq('enabled', true)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createEventWebsite(website: Partial<EventWebsite>): Promise<EventWebsite> {
    const { data, error } = await supabase
      .from('event_websites')
      .insert([website])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventWebsite(id: string, updates: Partial<EventWebsite>): Promise<EventWebsite> {
    const { data, error } = await supabase
      .from('event_websites')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventWebsite(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_websites')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async publishEventWebsite(id: string): Promise<EventWebsite> {
    return this.updateEventWebsite(id, {
      status: 'published',
      published_at: new Date().toISOString()
    });
  },

  // Pages
  async getEventWebsitePages(websiteId: string): Promise<EventWebsitePage[]> {
    // Load from event_page_layouts instead as it's the source of truth for the page builder
    const { data, error } = await supabase
      .from('event_page_layouts')
      .select('*, event_website_id, title, page_slug, page_type, is_published, show_in_navigation, navigation_order')
      .eq('event_website_id', websiteId)
      .order('navigation_order', { ascending: true });

    if (error) throw error;

    // Map event_page_layouts to EventWebsitePage format
    const pages = (data || []).map(layout => ({
      id: layout.id,
      event_website_id: layout.event_website_id,
      title: layout.title || 'Untitled',
      slug: layout.page_slug || '',
      page_type: layout.page_type || 'custom',
      content_blocks: layout.rows || [],
      is_published: layout.is_published !== undefined ? layout.is_published : false,
      show_in_navigation: layout.show_in_navigation !== undefined ? layout.show_in_navigation : true,
      navigation_order: layout.navigation_order || 0,
      created_at: layout.created_at,
      updated_at: layout.updated_at
    }));

    return pages;
  },

  async getEventWebsitePage(id: string): Promise<EventWebsitePage | null> {
    const { data, error } = await supabase
      .from('event_website_pages')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getEventWebsitePageBySlug(websiteId: string, slug: string): Promise<EventWebsitePage | null> {
    const { data, error } = await supabase
      .from('event_website_pages')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createEventWebsitePage(page: Partial<EventWebsitePage>): Promise<EventWebsitePage> {
    const { data, error } = await supabase
      .from('event_website_pages')
      .insert([page])
      .select()
      .single();

    if (error) throw error;

    // Also create a corresponding entry in event_page_layouts for the actual page content
    if (data && page.event_website_id && page.slug) {
      try {
        await supabase
          .from('event_page_layouts')
          .insert([{
            event_website_id: page.event_website_id,
            page_slug: page.slug,
            title: page.title || 'Untitled Page',
            page_type: page.page_type || 'custom',
            is_homepage: false,
            is_published: page.is_published || false,
            show_in_navigation: page.show_in_navigation || false,
            navigation_order: page.navigation_order || 0,
            rows: []
          }]);
      } catch (layoutError) {
        console.error('Error creating page layout:', layoutError);
        // Don't fail the whole operation if layout creation fails
      }
    }

    return data;
  },

  async updateEventWebsitePage(id: string, updates: Partial<EventWebsitePage>): Promise<EventWebsitePage> {
    const { data, error } = await supabase
      .from('event_website_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Also sync key fields to event_page_layouts if they were updated
    if (data && (updates.is_published !== undefined || updates.show_in_navigation !== undefined || updates.navigation_order !== undefined || updates.title !== undefined)) {
      try {
        const layoutUpdates: any = {};
        if (updates.is_published !== undefined) layoutUpdates.is_published = updates.is_published;
        if (updates.show_in_navigation !== undefined) layoutUpdates.show_in_navigation = updates.show_in_navigation;
        if (updates.navigation_order !== undefined) layoutUpdates.navigation_order = updates.navigation_order;
        if (updates.title !== undefined) layoutUpdates.title = updates.title;

        await supabase
          .from('event_page_layouts')
          .update(layoutUpdates)
          .eq('event_website_id', data.event_website_id)
          .eq('page_slug', data.slug);
      } catch (layoutError) {
        console.error('Error syncing page layout:', layoutError);
      }
    }

    return data;
  },

  async deleteEventWebsitePage(id: string): Promise<void> {
    // Delete from event_page_layouts which is the source of truth
    const { error } = await supabase
      .from('event_page_layouts')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Sponsors
  async getEventSponsors(websiteId: string): Promise<EventSponsor[]> {
    const { data, error } = await supabase
      .from('event_sponsors')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createEventSponsor(sponsor: Partial<EventSponsor>): Promise<EventSponsor> {
    const { data, error } = await supabase
      .from('event_sponsors')
      .insert([sponsor])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventSponsor(id: string, updates: Partial<EventSponsor>): Promise<EventSponsor> {
    const { data, error } = await supabase
      .from('event_sponsors')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventSponsor(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_sponsors')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async trackSponsorImpression(id: string): Promise<void> {
    await supabase.rpc('increment_sponsor_impression', { sponsor_id: id });
  },

  async trackSponsorClick(id: string): Promise<void> {
    await supabase.rpc('increment_sponsor_click', { sponsor_id: id });
  },

  // Media
  async getEventWebsiteMedia(websiteId: string, galleryName?: string): Promise<EventWebsiteMedia[]> {
    let query = supabase
      .from('event_website_media')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('is_approved', true)
      .order('display_order', { ascending: true });

    if (galleryName) {
      query = query.eq('gallery_name', galleryName);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async createEventWebsiteMedia(media: Partial<EventWebsiteMedia>): Promise<EventWebsiteMedia> {
    const { data, error } = await supabase
      .from('event_website_media')
      .insert([media])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventWebsiteMedia(id: string, updates: Partial<EventWebsiteMedia>): Promise<EventWebsiteMedia> {
    const { data, error } = await supabase
      .from('event_website_media')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventWebsiteMedia(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_website_media')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Documents
  async getEventWebsiteDocuments(websiteId: string): Promise<EventWebsiteDocument[]> {
    const { data, error } = await supabase
      .from('event_website_documents')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('is_published', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createEventWebsiteDocument(doc: Partial<EventWebsiteDocument>): Promise<EventWebsiteDocument> {
    const { data, error } = await supabase
      .from('event_website_documents')
      .insert([doc])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventWebsiteDocument(id: string, updates: Partial<EventWebsiteDocument>): Promise<EventWebsiteDocument> {
    const { data, error } = await supabase
      .from('event_website_documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventWebsiteDocument(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_website_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async trackDocumentDownload(id: string): Promise<void> {
    await supabase.rpc('increment_document_download', { document_id: id });
  },

  // Competitors
  async getEventWebsiteCompetitors(websiteId: string): Promise<EventWebsiteCompetitor[]> {
    const { data, error } = await supabase
      .from('event_website_competitors')
      .select('*')
      .eq('event_website_id', websiteId)
      .order('sail_number', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createEventWebsiteCompetitor(competitor: Partial<EventWebsiteCompetitor>): Promise<EventWebsiteCompetitor> {
    const { data, error } = await supabase
      .from('event_website_competitors')
      .insert([competitor])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventWebsiteCompetitor(id: string, updates: Partial<EventWebsiteCompetitor>): Promise<EventWebsiteCompetitor> {
    const { data, error } = await supabase
      .from('event_website_competitors')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventWebsiteCompetitor(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_website_competitors')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // News
  async getEventWebsiteNews(websiteId: string, limit?: number): Promise<EventWebsiteNews[]> {
    let query = supabase
      .from('event_website_news')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('is_published', true)
      .order('published_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getEventWebsiteNewsArticle(websiteId: string, slug: string): Promise<EventWebsiteNews | null> {
    const { data, error } = await supabase
      .from('event_website_news')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createEventWebsiteNews(news: Partial<EventWebsiteNews>): Promise<EventWebsiteNews> {
    const { data, error } = await supabase
      .from('event_website_news')
      .insert([news])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateEventWebsiteNews(id: string, updates: Partial<EventWebsiteNews>): Promise<EventWebsiteNews> {
    const { data, error } = await supabase
      .from('event_website_news')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteEventWebsiteNews(id: string): Promise<void> {
    const { error } = await supabase
      .from('event_website_news')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Settings
  async getEventWebsiteSettings(websiteId: string): Promise<EventWebsiteSettings | null> {
    const { data, error } = await supabase
      .from('event_website_settings')
      .select('*')
      .eq('event_website_id', websiteId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async createOrUpdateEventWebsiteSettings(settings: Partial<EventWebsiteSettings>): Promise<EventWebsiteSettings> {
    const { data, error } = await supabase
      .from('event_website_settings')
      .upsert([{ ...settings, updated_at: new Date().toISOString() }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Analytics
  async trackPageView(websiteId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await supabase
      .from('event_website_analytics')
      .upsert([
        {
          event_website_id: websiteId,
          date: today,
          page_views: 1
        }
      ], {
        onConflict: 'event_website_id,date'
      });

    await supabase
      .from('event_websites')
      .update({ visitor_count: supabase.sql`visitor_count + 1` })
      .eq('id', websiteId);
  },

  async getEventWebsiteAnalytics(websiteId: string, days: number = 30): Promise<EventWebsiteAnalytics[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('event_website_analytics')
      .select('*')
      .eq('event_website_id', websiteId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Social Feed
  async getEventWebsiteSocialFeed(websiteId: string, limit: number = 20): Promise<EventWebsiteSocialPost[]> {
    const { data, error } = await supabase
      .from('event_website_social_feed')
      .select('*')
      .eq('event_website_id', websiteId)
      .eq('is_approved', true)
      .order('posted_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // Upload file to storage
  async uploadEventWebsiteFile(file: File, path: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${path}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('event-websites')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('event-websites')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },

  async deleteEventWebsiteFile(url: string): Promise<void> {
    const path = url.split('/event-websites/')[1];
    if (!path) return;

    const { error } = await supabase.storage
      .from('event-websites')
      .remove([path]);

    if (error) throw error;
  }
};
