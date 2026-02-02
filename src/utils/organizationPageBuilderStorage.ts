import { supabase } from './supabase';
import type {
  OrganizationType,
  OrganizationPageLayout,
  OrganizationGlobalSection
} from '../types/organizationWidgets';
import type { EventPageRow } from '../types/eventWidgets';

function getOwnerColumn(type: OrganizationType): string {
  switch (type) {
    case 'club': return 'club_id';
    case 'state_association': return 'state_association_id';
    case 'national_association': return 'national_association_id';
  }
}

export async function getOrganizationPages(
  type: OrganizationType,
  organizationId: string
): Promise<OrganizationPageLayout[]> {
  const column = getOwnerColumn(type);
  const { data, error } = await supabase
    .from('organization_page_layouts')
    .select('*')
    .eq(column, organizationId)
    .order('navigation_order', { ascending: true });

  if (error) {
    console.error('Error fetching organization pages:', error);
    return [];
  }
  return data || [];
}

export async function getOrganizationPage(
  type: OrganizationType,
  organizationId: string,
  pageSlug: string
): Promise<OrganizationPageLayout | null> {
  const column = getOwnerColumn(type);
  const { data, error } = await supabase
    .from('organization_page_layouts')
    .select('*')
    .eq(column, organizationId)
    .eq('page_slug', pageSlug)
    .maybeSingle();

  if (error) {
    console.error('Error fetching organization page:', error);
    return null;
  }
  return data;
}

export async function createOrganizationPage(
  type: OrganizationType,
  organizationId: string,
  pageData: {
    page_slug: string;
    page_title: string;
    page_icon?: string;
    rows?: EventPageRow[];
    is_published?: boolean;
    show_in_navigation?: boolean;
    is_homepage?: boolean;
  }
): Promise<OrganizationPageLayout | null> {
  const column = getOwnerColumn(type);
  const existingPages = await getOrganizationPages(type, organizationId);
  const maxOrder = existingPages.reduce((max, p) => Math.max(max, p.navigation_order || 0), 0);

  const { data, error } = await supabase
    .from('organization_page_layouts')
    .insert({
      [column]: organizationId,
      page_slug: pageData.page_slug,
      page_title: pageData.page_title,
      page_icon: pageData.page_icon || 'FileText',
      rows: pageData.rows || [],
      is_published: pageData.is_published ?? false,
      show_in_navigation: pageData.show_in_navigation ?? true,
      navigation_order: maxOrder + 1,
      is_homepage: pageData.is_homepage ?? false
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating organization page:', error);
    return null;
  }
  return data;
}

export async function updateOrganizationPage(
  pageId: string,
  updates: Partial<OrganizationPageLayout>
): Promise<OrganizationPageLayout | null> {
  const { data, error } = await supabase
    .from('organization_page_layouts')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', pageId)
    .select()
    .single();

  if (error) {
    console.error('Error updating organization page:', error);
    return null;
  }
  return data;
}

export async function deleteOrganizationPage(pageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('organization_page_layouts')
    .delete()
    .eq('id', pageId);

  if (error) {
    console.error('Error deleting organization page:', error);
    return false;
  }
  return true;
}

export async function updatePageOrder(
  type: OrganizationType,
  organizationId: string,
  pageOrders: { id: string; order: number }[]
): Promise<boolean> {
  try {
    for (const { id, order } of pageOrders) {
      const { error } = await supabase
        .from('organization_page_layouts')
        .update({ navigation_order: order })
        .eq('id', id);
      if (error) throw error;
    }
    return true;
  } catch (error) {
    console.error('Error updating page order:', error);
    return false;
  }
}

export async function setHomepage(
  type: OrganizationType,
  organizationId: string,
  pageId: string
): Promise<boolean> {
  const column = getOwnerColumn(type);
  try {
    await supabase
      .from('organization_page_layouts')
      .update({ is_homepage: false })
      .eq(column, organizationId);

    const { error } = await supabase
      .from('organization_page_layouts')
      .update({ is_homepage: true })
      .eq('id', pageId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error setting homepage:', error);
    return false;
  }
}

export async function getOrganizationGlobalSections(
  type: OrganizationType,
  organizationId: string
): Promise<OrganizationGlobalSection[]> {
  const column = getOwnerColumn(type);
  const { data, error } = await supabase
    .from('organization_global_sections')
    .select('*')
    .eq(column, organizationId);

  if (error) {
    console.error('Error fetching global sections:', error);
    return [];
  }
  return data || [];
}

export async function getOrganizationGlobalSection(
  type: OrganizationType,
  organizationId: string,
  sectionType: 'header' | 'menu' | 'footer'
): Promise<OrganizationGlobalSection | null> {
  const column = getOwnerColumn(type);
  const { data, error } = await supabase
    .from('organization_global_sections')
    .select('*')
    .eq(column, organizationId)
    .eq('section_type', sectionType)
    .maybeSingle();

  if (error) {
    console.error('Error fetching global section:', error);
    return null;
  }
  return data;
}

export async function upsertOrganizationGlobalSection(
  type: OrganizationType,
  organizationId: string,
  sectionType: 'header' | 'menu' | 'footer',
  config: Record<string, any>,
  enabled: boolean = true
): Promise<OrganizationGlobalSection | null> {
  const column = getOwnerColumn(type);
  const existing = await getOrganizationGlobalSection(type, organizationId, sectionType);

  if (existing) {
    const { data, error } = await supabase
      .from('organization_global_sections')
      .update({ config, enabled, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating global section:', error);
      return null;
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from('organization_global_sections')
      .insert({
        [column]: organizationId,
        section_type: sectionType,
        config,
        enabled
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating global section:', error);
      return null;
    }
    return data;
  }
}
