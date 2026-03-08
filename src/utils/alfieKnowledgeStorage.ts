import { supabase } from './supabase';

export interface AlfieTuningGuide {
  id: string;
  name: string;
  boat_type: string;
  hull_type: string;
  description: string;
  version: string;
  storage_path: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error: string | null;
  processed_at: string | null;
  chunk_count: number;
  image_count: number;
  uploaded_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlfieKnowledgeCorrection {
  id: string;
  topic: string;
  boat_type: string;
  scenario: string;
  incorrect_response: string;
  correct_information: string;
  priority: 'high' | 'medium' | 'low';
  status: 'active' | 'inactive';
  times_surfaced: number;
  last_surfaced_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const TUNING_GUIDE_TOPICS = [
  'general',
  'rig-tuning',
  'sail-trim',
  'hull-setup',
  'keel-and-rudder',
  'mast-bend',
  'shroud-tension',
  'backstay',
  'jib-setup',
  'mainsail-setup',
  'wind-conditions',
  'racing-rules',
  'boat-maintenance',
  'measurement',
  'class-rules'
] as const;

export async function getTuningGuides(): Promise<AlfieTuningGuide[]> {
  const { data, error } = await supabase
    .from('alfie_tuning_guides')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getTuningGuide(id: string): Promise<AlfieTuningGuide | null> {
  const { data, error } = await supabase
    .from('alfie_tuning_guides')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function uploadTuningGuide(
  file: File,
  metadata: {
    name: string;
    boat_type: string;
    hull_type?: string;
    description?: string;
    version?: string;
  },
  userId: string
): Promise<AlfieTuningGuide> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `tuning-guides/${metadata.boat_type || 'general'}/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('alfie-knowledge')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('alfie_tuning_guides')
    .insert({
      name: metadata.name,
      boat_type: metadata.boat_type || '',
      hull_type: metadata.hull_type || '',
      description: metadata.description || '',
      version: metadata.version || '1.0',
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      status: 'pending',
      uploaded_by: userId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTuningGuide(
  id: string,
  updates: Partial<Pick<AlfieTuningGuide, 'name' | 'boat_type' | 'hull_type' | 'description' | 'version' | 'is_active'>>
): Promise<AlfieTuningGuide> {
  const { data, error } = await supabase
    .from('alfie_tuning_guides')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTuningGuide(id: string): Promise<void> {
  const guide = await getTuningGuide(id);
  if (guide?.storage_path) {
    await supabase.storage.from('alfie-knowledge').remove([guide.storage_path]);
  }

  const { error } = await supabase
    .from('alfie_tuning_guides')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function triggerGuideProcessing(guideId: string): Promise<void> {
  await supabase
    .from('alfie_tuning_guides')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', guideId);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-alfie-document`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ guideId })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Processing failed: ${errorText}`);
  }
}

export async function getCorrections(): Promise<AlfieKnowledgeCorrection[]> {
  const { data, error } = await supabase
    .from('alfie_knowledge_corrections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createCorrection(
  correction: {
    topic: string;
    boat_type?: string;
    scenario: string;
    incorrect_response?: string;
    correct_information: string;
    priority: 'high' | 'medium' | 'low';
  },
  userId: string
): Promise<AlfieKnowledgeCorrection> {
  const { data, error } = await supabase
    .from('alfie_knowledge_corrections')
    .insert({
      topic: correction.topic,
      boat_type: correction.boat_type || '',
      scenario: correction.scenario,
      incorrect_response: correction.incorrect_response || '',
      correct_information: correction.correct_information,
      priority: correction.priority,
      status: 'active',
      created_by: userId
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCorrection(
  id: string,
  updates: Partial<Pick<AlfieKnowledgeCorrection, 'topic' | 'boat_type' | 'scenario' | 'incorrect_response' | 'correct_information' | 'priority' | 'status'>>
): Promise<AlfieKnowledgeCorrection> {
  const { data, error } = await supabase
    .from('alfie_knowledge_corrections')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCorrection(id: string): Promise<void> {
  const { error } = await supabase
    .from('alfie_knowledge_corrections')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getBoatTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('boat_classes')
    .select('name')
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return (data || []).map(bc => bc.name);
}

export interface AlfieKnowledgeDocument {
  id: string;
  title: string;
  category: string;
  source_url: string | null;
  content_text: string | null;
  is_active: boolean;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  chunk_count: number | null;
  processing_status: string | null;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export const DOCUMENT_CATEGORIES = [
  'sailing-rules',
  'class-rules',
  'racing-rules',
  'measurement-rules',
  'safety-rules',
  'protest-rules',
  'scoring-rules',
  'general-knowledge'
] as const;

export async function getKnowledgeDocuments(): Promise<AlfieKnowledgeDocument[]> {
  const { data, error } = await supabase
    .from('alfie_knowledge_documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function uploadKnowledgeDocument(
  file: File,
  metadata: {
    title: string;
    category: string;
    source_url?: string;
  }
): Promise<AlfieKnowledgeDocument> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `documents/${metadata.category || 'general'}/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('alfie-knowledge')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('alfie_knowledge_documents')
    .insert({
      title: metadata.title,
      category: metadata.category || 'sailing-rules',
      source_url: metadata.source_url || null,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      is_active: true,
      processing_status: 'pending'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateKnowledgeDocument(
  id: string,
  updates: Partial<Pick<AlfieKnowledgeDocument, 'title' | 'category' | 'source_url' | 'is_active'>>
): Promise<AlfieKnowledgeDocument> {
  const { data, error } = await supabase
    .from('alfie_knowledge_documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function reuploadKnowledgeDocumentFile(
  id: string,
  file: File
): Promise<AlfieKnowledgeDocument> {
  const { data: doc } = await supabase
    .from('alfie_knowledge_documents')
    .select('category, storage_path')
    .eq('id', id)
    .maybeSingle();

  if (doc?.storage_path) {
    await supabase.storage.from('alfie-knowledge').remove([doc.storage_path]);
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `documents/${doc?.category || 'general'}/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('alfie-knowledge')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('alfie_knowledge_documents')
    .update({
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      processing_status: 'pending',
      processing_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  const { data: doc } = await supabase
    .from('alfie_knowledge_documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();

  if (doc?.storage_path) {
    await supabase.storage.from('alfie-knowledge').remove([doc.storage_path]);
  }

  await supabase
    .from('alfie_knowledge_chunks')
    .delete()
    .eq('document_id', id);

  const { error } = await supabase
    .from('alfie_knowledge_documents')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function triggerDocumentProcessing(documentId: string): Promise<void> {
  await supabase
    .from('alfie_knowledge_documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-alfie-document`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ documentId })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Processing failed: ${errorText}`);
  }
}

export async function getKnowledgeStats(): Promise<{
  totalGuides: number;
  activeGuides: number;
  totalCorrections: number;
  activeCorrections: number;
  totalDocuments: number;
  activeDocuments: number;
  totalChunks: number;
  totalImages: number;
}> {
  const [guides, corrections, documents, chunks, images] = await Promise.all([
    supabase.from('alfie_tuning_guides').select('id, is_active'),
    supabase.from('alfie_knowledge_corrections').select('id, status'),
    supabase.from('alfie_knowledge_documents').select('id, is_active'),
    supabase.from('alfie_knowledge_chunks').select('id', { count: 'exact', head: true }),
    supabase.from('alfie_knowledge_images').select('id', { count: 'exact', head: true })
  ]);

  const guideData = guides.data || [];
  const correctionData = corrections.data || [];
  const documentData = documents.data || [];

  return {
    totalGuides: guideData.length,
    activeGuides: guideData.filter(g => g.is_active).length,
    totalCorrections: correctionData.length,
    activeCorrections: correctionData.filter(c => c.status === 'active').length,
    totalDocuments: documentData.length,
    activeDocuments: documentData.filter(d => d.is_active).length,
    totalChunks: chunks.count || 0,
    totalImages: images.count || 0
  };
}
