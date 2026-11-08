import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, FileText, Image as ImageIcon, X, Loader2, Plus } from 'lucide-react';
import {
  ATTACHMENT_ACCEPT,
  attachmentProblem,
  FinanceAttachment,
  FinanceTable,
  formatFileSize,
  listAttachments,
  openAttachment,
  removeAttachment,
  uploadAttachment,
} from '../../utils/financeAttachments';

/**
 * Supplier invoices / receipts on a transaction.
 * - With a `transactionId`, it lists, opens, adds and removes saved files.
 * - Without one (a transaction still being created), it collects files in
 *   `pendingFiles`; the page uploads them once the transaction is saved.
 */
interface TransactionAttachmentsProps {
  table: FinanceTable;
  transactionId?: string | null;
  pendingFiles?: File[];
  onPendingChange?: (files: File[]) => void;
  canEdit?: boolean;
  /** 'sheet' sits inside the a-msheet modal; 'page' sits on the expense/deposit pages */
  variant?: 'sheet' | 'page';
  onError?: (message: string) => void;
}

const isImage = (name: string, mime?: string | null) =>
  (mime || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name);

export const TransactionAttachments: React.FC<TransactionAttachmentsProps> = ({
  table,
  transactionId,
  pendingFiles,
  onPendingChange,
  canEdit = true,
  variant = 'sheet',
  onError,
}) => {
  const live = !!transactionId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState<FinanceAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const report = useCallback((msg: string) => {
    setMessage(msg);
    onError?.(msg);
  }, [onError]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    setLoading(true);
    listAttachments(table, transactionId!)
      .then((rows) => { if (!cancelled) setSaved(rows); })
      .catch((e) => { console.error('Loading attachments failed', e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [live, table, transactionId]);

  const handlePick = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setMessage(null);
    const tooBig = files.map(attachmentProblem).filter(Boolean) as string[];
    const ok = files.filter((f) => !attachmentProblem(f));
    if (tooBig.length) report(tooBig.join('. '));

    if (!live) {
      onPendingChange?.([...(pendingFiles || []), ...ok]);
      return;
    }
    for (const f of ok) {
      setUploading((n) => n + 1);
      try {
        const row = await uploadAttachment(table, transactionId!, f);
        setSaved((prev) => [...prev, row]);
      } catch (e) {
        console.error('Attachment upload failed', e);
        report(`Couldn't attach ${f.name}. Please try again.`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const handleRemove = async (att: FinanceAttachment) => {
    setBusyId(att.id);
    setMessage(null);
    try {
      await removeAttachment(att);
      setSaved((prev) => prev.filter((a) => a.id !== att.id));
    } catch (e) {
      console.error('Removing attachment failed', e);
      report(`Couldn't remove ${att.file_name}.`);
    } finally {
      setBusyId(null);
    }
  };

  const handleOpen = async (att: FinanceAttachment) => {
    try { await openAttachment(att); } catch (e) {
      console.error('Opening attachment failed', e);
      report(`Couldn't open ${att.file_name}.`);
    }
  };

  const removePending = (idx: number) => {
    onPendingChange?.((pendingFiles || []).filter((_, i) => i !== idx));
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={ATTACHMENT_ACCEPT}
      className="hidden"
      onChange={(e) => { handlePick(e.target.files); e.target.value = ''; }}
    />
  );

  const items: { key: string; name: string; size: number | null; mime?: string | null; onOpen?: () => void; onRemove?: () => void; busy?: boolean }[] = live
    ? saved.map((a) => ({
        key: a.id, name: a.file_name, size: a.file_size, mime: a.mime_type,
        onOpen: () => handleOpen(a),
        onRemove: canEdit ? () => handleRemove(a) : undefined,
        busy: busyId === a.id,
      }))
    : (pendingFiles || []).map((f, i) => ({
        key: `${i}-${f.name}`, name: f.name, size: f.size, mime: f.type,
        onRemove: () => removePending(i),
      }));

  if (variant === 'page') {
    return (
      <div>
        {fileInput}
        <div className="flex items-center justify-between mb-2">
          <span className="block text-sm font-medium text-slate-300">Attachments</span>
          <span className="text-xs text-slate-400">PDF or image, up to 15 MB each</span>
        </div>
        {items.length > 0 && (
          <ul className="mb-3 space-y-2">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-3 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg">
                <span className="text-slate-400 flex">{isImage(it.name, it.mime) ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
                {it.onOpen ? (
                  <button type="button" onClick={it.onOpen} className="flex-1 min-w-0 text-left text-sm text-white truncate hover:underline">{it.name}</button>
                ) : (
                  <span className="flex-1 min-w-0 text-sm text-white truncate">{it.name}</span>
                )}
                <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(it.size)}</span>
                {it.onRemove && (
                  <button
                    type="button"
                    onClick={it.onRemove}
                    disabled={it.busy}
                    className="p-1 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    aria-label={`Remove ${it.name}`}
                  >
                    {it.busy ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-60"
          >
            {uploading > 0 ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
            {uploading > 0 ? 'Uploading…' : items.length ? 'Add another attachment' : 'Add Attachment'}
          </button>
        )}
        {message && <p className="mt-2 text-sm text-red-400" role="alert">{message}</p>}
      </div>
    );
  }

  // Sheet variant (Transaction details modal)
  return (
    <div className="a-grp">
      {fileInput}
      <div className="a-lnk">
        <span className="a-tile a-tile-sm"><Paperclip size={15} /></span>
        <span className="flex-1 a-ink text-sm font-medium">Attachments</span>
        {loading
          ? <Loader2 size={15} className="animate-spin a-dim" />
          : <span className="a-dim text-xs">{items.length ? `${items.length} file${items.length === 1 ? '' : 's'}` : 'None yet'}</span>}
      </div>
      {items.map((it) => (
        <div key={it.key} className="a-lnk">
          <span className="a-dim flex">{isImage(it.name, it.mime) ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
          <button
            type="button"
            onClick={it.onOpen}
            className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
            title="Open"
          >
            <span className="block a-ink text-sm truncate">{it.name}</span>
            <span className="block a-dim text-xs">{formatFileSize(it.size)}</span>
          </button>
          {it.onRemove && (
            <button type="button" onClick={it.onRemove} disabled={it.busy} className="a-ib a-ib-d" aria-label={`Remove ${it.name}`}>
              {it.busy ? <Loader2 size={15} className="animate-spin" /> : <X size={16} />}
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading > 0}
          className="a-lnk a-lnk-add w-full"
        >
          {uploading > 0 ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {uploading > 0 ? 'Uploading…' : 'Add supplier invoice or receipt'}
        </button>
      )}
      {message && <div className="a-lnk text-sm" style={{ color: '#FF8A8A' }} role="alert">{message}</div>}
    </div>
  );
};

export default TransactionAttachments;
