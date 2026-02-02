import { supabase } from './supabase';

export type LegalPageType = 'privacy_policy' | 'terms_of_service';

export interface LegalPage {
  id: string;
  page_type: LegalPageType;
  title: string;
  content: string;
  html_content: string;
  last_updated: string;
  updated_by: string | null;
}

export async function getLegalPage(pageType: LegalPageType): Promise<LegalPage | null> {
  const { data, error } = await supabase
    .from('global_legal_pages')
    .select('*')
    .eq('page_type', pageType)
    .maybeSingle();

  if (error) {
    console.error('Error fetching legal page:', error);
    return null;
  }

  return data;
}

export async function getAllLegalPages(): Promise<LegalPage[]> {
  const { data, error } = await supabase
    .from('global_legal_pages')
    .select('*')
    .order('page_type');

  if (error) {
    console.error('Error fetching legal pages:', error);
    return [];
  }

  return data || [];
}

export async function updateLegalPage(
  pageType: LegalPageType,
  updates: {
    title?: string;
    content?: string;
    html_content?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('global_legal_pages')
    .update(updates)
    .eq('page_type', pageType);

  if (error) {
    console.error('Error updating legal page:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export function getLegalPageTitle(pageType: LegalPageType): string {
  switch (pageType) {
    case 'privacy_policy':
      return 'Privacy Policy';
    case 'terms_of_service':
      return 'Terms of Service';
    default:
      return pageType;
  }
}

export function getLegalPageRoute(pageType: LegalPageType): string {
  switch (pageType) {
    case 'privacy_policy':
      return '/privacy';
    case 'terms_of_service':
      return '/terms';
    default:
      return `/${pageType}`;
  }
}
