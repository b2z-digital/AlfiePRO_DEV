import { supabase } from './supabase';

/**
 * Attachments (supplier invoices, receipts) on club and association transactions.
 * Files live in the private `finance-attachments` bucket at
 * `<transaction_table>/<transaction_id>/<random>-<file name>`; one row per file in
 * `finance_attachments`. Access follows the transaction (see the migration).
 */

export type FinanceTable = 'transactions' | 'association_transactions';

export interface FinanceAttachment {
  id: string;
  transaction_table: FinanceTable;
  transaction_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

const BUCKET = 'finance-attachments';
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.csv,.xls,.xlsx,.doc,.docx,application/pdf,image/*';

export function attachmentProblem(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than 15 MB`;
  return null;
}

export async function listAttachments(table: FinanceTable, transactionId: string): Promise<FinanceAttachment[]> {
  const { data, error } = await supabase
    .from('finance_attachments')
    .select('*')
    .eq('transaction_table', table)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as FinanceAttachment[];
}

export async function uploadAttachment(table: FinanceTable, transactionId: string, file: File): Promise<FinanceAttachment> {
  const problem = attachmentProblem(file);
  if (problem) throw new Error(problem);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'file';
  const path = `${table}/${transactionId}/${crypto.randomUUID()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('finance_attachments')
    .insert({
      transaction_table: table,
      transaction_id: transactionId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
    })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as FinanceAttachment;
}

export async function uploadAttachments(table: FinanceTable, transactionId: string, files: File[]): Promise<{ saved: number; failed: string[] }> {
  const failed: string[] = [];
  let saved = 0;
  for (const f of files) {
    try { await uploadAttachment(table, transactionId, f); saved++; } catch (e) {
      console.error('Attachment upload failed', f.name, e);
      failed.push(f.name);
    }
  }
  return { saved, failed };
}

export async function removeAttachment(att: FinanceAttachment): Promise<void> {
  const { error } = await supabase.from('finance_attachments').delete().eq('id', att.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([att.file_path]).catch(() => {});
}

/** Removes a transaction's files from storage (its rows go with the transaction). Best effort. */
export async function removeAllAttachmentFiles(table: FinanceTable, transactionId: string): Promise<void> {
  try {
    const list = await listAttachments(table, transactionId);
    if (list.length) await supabase.storage.from(BUCKET).remove(list.map((a) => a.file_path));
  } catch { /* nothing attached, or no access */ }
}

export async function openAttachment(att: FinanceAttachment): Promise<void> {
  // Open the tab first, in the click, so pop-up blockers allow it
  const win = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.file_path, 60 * 10);
  if (error || !data?.signedUrl) {
    win?.close();
    throw error || new Error('Could not open the file');
  }
  if (win) win.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
