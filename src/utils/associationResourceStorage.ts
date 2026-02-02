import { supabase } from './supabase';

export type OrganizationType = 'club' | 'state' | 'national';

export interface ResourceCategory {
  id: string;
  organization_id: string;
  organization_type: OrganizationType;
  name: string;
  description?: string;
  icon: string;
  display_order: number;
  google_drive_folder_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AssociationResource {
  id: string;
  category_id: string;
  title: string;
  description?: string;
  resource_type: 'page' | 'file' | 'link' | 'external_tool' | 'google_drive';
  content?: any;
  file_url?: string;
  file_type?: string;
  file_size?: number;
  external_url?: string;
  thumbnail_url?: string;
  is_featured: boolean;
  is_public: boolean;
  view_count: number;
  download_count: number;
  tags: string[];
  display_order: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
  google_drive_file_id?: string;
  google_drive_folder_id?: string;
  google_drive_folder_path?: string;
  google_drive_parent_folder_id?: string;
  is_folder?: boolean;
  google_account_email?: string;
  last_synced_at?: string;
  sync_status?: 'synced' | 'pending' | 'error' | 'not_synced';
  sync_error_message?: string;
  // Extended fields for display
  source_organization_name?: string;
  source_organization_type?: OrganizationType;
  uploader_name?: string;
  uploader_avatar?: string;
}

export const fetchResourceCategories = async (
  organizationId: string,
  organizationType: OrganizationType
): Promise<ResourceCategory[]> => {
  const { data, error } = await supabase
    .from('resource_categories')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('organization_type', organizationType)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const createResourceCategory = async (
  categoryData: Omit<ResourceCategory, 'id' | 'created_at' | 'updated_at'>
): Promise<ResourceCategory> => {
  const { data, error } = await supabase
    .from('resource_categories')
    .insert(categoryData)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateResourceCategory = async (
  categoryId: string,
  updates: Partial<ResourceCategory>
): Promise<ResourceCategory> => {
  const { data, error} = await supabase
    .from('resource_categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', categoryId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteResourceCategory = async (categoryId: string): Promise<void> => {
  const { error } = await supabase
    .from('resource_categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
};

export const fetchResources = async (categoryId: string): Promise<AssociationResource[]> => {
  const { data, error } = await supabase
    .from('resources')
    .select(`
      *,
      uploader:profiles!resources_created_by_fkey(
        full_name,
        avatar_url
      )
    `)
    .eq('category_id', categoryId)
    .order('display_order', { ascending: true });

  if (error) throw error;

  // Transform data to include uploader name and avatar
  return (data || []).map((resource: any) => ({
    ...resource,
    uploader_name: resource.uploader?.full_name || 'Unknown',
    uploader_avatar: resource.uploader?.avatar_url,
    uploader: undefined // Remove the nested object
  }));
};

export const fetchAllResources = async (
  organizationId: string,
  organizationType: OrganizationType
): Promise<AssociationResource[]> => {
  const { data, error } = await supabase
    .from('resources')
    .select(`
      *,
      category:resource_categories!inner(*),
      uploader:profiles!resources_created_by_fkey(
        full_name,
        avatar_url
      )
    `)
    .eq('category.organization_id', organizationId)
    .eq('category.organization_type', organizationType)
    .order('display_order', { ascending: true });

  if (error) throw error;

  // Transform data to include uploader name and avatar
  return (data || []).map((resource: any) => ({
    ...resource,
    uploader_name: resource.uploader?.full_name || 'Unknown',
    uploader_avatar: resource.uploader?.avatar_url,
    uploader: undefined, // Remove the nested object
    category: undefined // Remove the nested category object if not needed
  }));
};

export const createResource = async (
  resourceData: Omit<AssociationResource, 'id' | 'created_at' | 'updated_at' | 'view_count' | 'download_count'>
): Promise<AssociationResource> => {
  const { data, error } = await supabase
    .from('resources')
    .insert(resourceData)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateResource = async (
  resourceId: string,
  updates: Partial<AssociationResource>
): Promise<AssociationResource> => {
  const { data, error } = await supabase
    .from('resources')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', resourceId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteResource = async (resourceId: string): Promise<void> => {
  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', resourceId);

  if (error) throw error;
};

export const uploadResourceFile = async (
  file: File,
  organizationId: string,
  organizationType: OrganizationType
): Promise<string> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${organizationId}/${organizationType}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('association-resources')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('association-resources')
    .getPublicUrl(fileName);

  return data.publicUrl;
};

export const deleteResourceFile = async (fileUrl: string): Promise<void> => {
  const path = fileUrl.split('/association-resources/')[1];
  if (!path) return;

  const { error } = await supabase.storage
    .from('association-resources')
    .remove([path]);

  if (error) throw error;
};

export const incrementViewCount = async (resourceId: string): Promise<void> => {
  const { error } = await supabase.rpc('increment_resource_view_count', {
    resource_id: resourceId
  });

  if (error) throw error;
};

export const incrementDownloadCount = async (resourceId: string): Promise<void> => {
  const { error } = await supabase.rpc('increment_resource_download_count', {
    resource_id: resourceId
  });

  if (error) throw error;
};

export const reorderCategories = async (
  categories: { id: string; display_order: number }[]
): Promise<void> => {
  const updates = categories.map(cat =>
    supabase
      .from('resource_categories')
      .update({ display_order: cat.display_order })
      .eq('id', cat.id)
  );

  await Promise.all(updates);
};

export const reorderResources = async (
  resources: { id: string; display_order: number }[]
): Promise<void> => {
  const updates = resources.map(res =>
    supabase
      .from('resources')
      .update({ display_order: res.display_order })
      .eq('id', res.id)
  );

  await Promise.all(updates);
};

/**
 * Fetch public resources from parent associations (for clubs)
 * Returns resources from both state and national associations that the club belongs to
 */
export const fetchPublicAssociationResources = async (
  clubId: string
): Promise<AssociationResource[]> => {
  console.log('[fetchPublicAssociationResources] Starting for club:', clubId);

  // Get club's associations
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('state_association_id')
    .eq('id', clubId)
    .single();

  console.log('[fetchPublicAssociationResources] Club data:', club, 'Error:', clubError);

  if (clubError || !club) return [];

  const results: AssociationResource[] = [];

  // Fetch state association resources if club belongs to one
  if (club.state_association_id) {
    console.log('[fetchPublicAssociationResources] Club has state association:', club.state_association_id);

    const { data: stateAssociation, error: stateError } = await supabase
      .from('state_associations')
      .select('id, name, abbreviation, national_association_id')
      .eq('id', club.state_association_id)
      .single();

    console.log('[fetchPublicAssociationResources] State association data:', stateAssociation, 'Error:', stateError);

    if (stateAssociation) {
      // Fetch public resources from state association
      console.log('[fetchPublicAssociationResources] Fetching public resources from state association:', stateAssociation.id);

      const { data: stateResources, error: stateResourcesError } = await supabase
        .from('resources')
        .select(`
          *,
          category:resource_categories!inner(*)
        `)
        .eq('category.organization_id', stateAssociation.id)
        .eq('category.organization_type', 'state')
        .eq('is_public', true)
        .order('display_order', { ascending: true });

      console.log('[fetchPublicAssociationResources] State resources:', stateResources?.length || 0, 'Error:', stateResourcesError);

      if (stateResources) {
        results.push(
          ...stateResources.map(r => ({
            ...r,
            source_organization_name: stateAssociation.name,
            source_organization_abbreviation: stateAssociation.abbreviation,
            source_organization_type: 'state' as OrganizationType
          }))
        );
      }

      // Fetch national association resources if state belongs to one
      if (stateAssociation.national_association_id) {
        const { data: nationalAssociation } = await supabase
          .from('national_associations')
          .select('id, name, abbreviation')
          .eq('id', stateAssociation.national_association_id)
          .single();

        if (nationalAssociation) {
          const { data: nationalResources } = await supabase
            .from('resources')
            .select(`
              *,
              category:resource_categories!inner(*)
            `)
            .eq('category.organization_id', nationalAssociation.id)
            .eq('category.organization_type', 'national')
            .eq('is_public', true)
            .order('display_order', { ascending: true });

          if (nationalResources) {
            results.push(
              ...nationalResources.map(r => ({
                ...r,
                source_organization_name: nationalAssociation.name,
                source_organization_abbreviation: nationalAssociation.abbreviation,
                source_organization_type: 'national' as OrganizationType
              }))
            );
          }
        }
      }
    }
  }

  return results;
};
