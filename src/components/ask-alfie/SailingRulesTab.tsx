import React, { useState, useEffect, useRef } from 'react';
import { Upload, Search, FileText, Trash2, CreditCard as Edit2, Eye, EyeOff, RefreshCw, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Clock, X, MoveVertical as MoreVertical, BookOpen, ExternalLink, Globe } from 'lucide-react';
import {
  AlfieKnowledgeDocument, getKnowledgeDocuments, uploadKnowledgeDocument,
  updateKnowledgeDocument, deleteKnowledgeDocument, triggerDocumentProcessing,
  reuploadKnowledgeDocumentFile, DOCUMENT_CATEGORIES
} from '../../utils/alfieKnowledgeStorage';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface SailingRulesTabProps {
  darkMode: boolean;
}

export default function SailingRulesTab({ darkMode }: SailingRulesTabProps) {
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<AlfieKnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<AlfieKnowledgeDocument | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [processingDocs, setProcessingDocs] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [reuploadDocId, setReuploadDocId] = useState<string | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);

  const [uploadForm, setUploadForm] = useState({
    title: '',
    category: 'sailing-rules',
    source_url: '',
    file: null as File | null
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const docs = await getKnowledgeDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading knowledge documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.title) return;
    setUploading(true);
    try {
      const doc = await uploadKnowledgeDocument(
        uploadForm.file,
        {
          title: uploadForm.title,
          category: uploadForm.category,
          source_url: uploadForm.source_url || undefined
        }
      );
      setDocuments(prev => [doc, ...prev]);
      setShowUploadModal(false);
      setUploadForm({ title: '', category: 'sailing-rules', source_url: '', file: null });
      addNotification({ type: 'success', title: 'Document Uploaded', message: `"${doc.title}" has been uploaded. Click Process to extract knowledge chunks.` });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Upload Failed', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async (doc: AlfieKnowledgeDocument) => {
    setProcessingDocs(prev => new Set(prev).add(doc.id));
    try {
      await triggerDocumentProcessing(doc.id);
      setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, processing_status: 'processing', processing_error: null } : d));
      addNotification({ type: 'success', title: 'Processing Started', message: `"${doc.title}" is being processed. This may take a few minutes.` });
      const pollInterval = setInterval(async () => {
        try {
          const updated = await getKnowledgeDocuments();
          setDocuments(updated);
          const current = updated.find(d => d.id === doc.id);
          if (current && current.processing_status !== 'processing') {
            clearInterval(pollInterval);
          }
        } catch { /* ignore polling errors */ }
      }, 5000);
      setTimeout(() => clearInterval(pollInterval), 120000);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Processing Failed', message: err.message });
      loadData();
    } finally {
      setProcessingDocs(prev => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
    }
  };

  const handleToggleActive = async (doc: AlfieKnowledgeDocument) => {
    try {
      const updated = await updateKnowledgeDocument(doc.id, { is_active: !doc.is_active });
      setDocuments(prev => prev.map(d => d.id === doc.id ? updated : d));
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleEdit = (doc: AlfieKnowledgeDocument) => {
    setEditingDoc(doc);
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    try {
      const updated = await updateKnowledgeDocument(editingDoc.id, {
        title: editingDoc.title,
        category: editingDoc.category,
        source_url: editingDoc.source_url
      });
      setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      setShowEditModal(false);
      setEditingDoc(null);
      addNotification({ type: 'success', title: 'Document Updated', message: 'Document details have been updated.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    try {
      await deleteKnowledgeDocument(docToDelete);
      setDocuments(prev => prev.filter(d => d.id !== docToDelete));
      addNotification({ type: 'success', title: 'Document Deleted', message: 'Document and associated knowledge chunks have been removed.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Delete Failed', message: err.message });
    } finally {
      setDeleteConfirmOpen(false);
      setDocToDelete(null);
    }
  };

  const handleReupload = async (file: File) => {
    if (!reuploadDocId) return;
    try {
      const updated = await reuploadKnowledgeDocumentFile(reuploadDocId, file);
      setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d));
      addNotification({ type: 'success', title: 'File Uploaded', message: `File attached. Click Process to extract knowledge chunks.` });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Upload Failed', message: err.message });
    } finally {
      setReuploadDocId(null);
    }
  };

  const filteredDocs = documents.filter(d => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !d.category.toLowerCase().includes(q) && !(d.file_name || '').toLowerCase().includes(q)) return false;
    }
    if (filterCategory && d.category !== filterCategory) return false;
    if (filterStatus) {
      if (filterStatus === 'active' && !d.is_active) return false;
      if (filterStatus === 'inactive' && d.is_active) return false;
      if (['pending', 'processing', 'completed', 'failed'].includes(filterStatus) && d.processing_status !== filterStatus) return false;
    }
    return true;
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const formatCategory = (cat: string) => {
    return cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getStatusBadge = (status: string | null) => {
    const s = status || 'pending';
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    const icons: Record<string, React.ReactNode> = {
      pending: <Clock className="w-3 h-3" />,
      processing: <RefreshCw className="w-3 h-3 animate-spin" />,
      completed: <CheckCircle2 className="w-3 h-3" />,
      failed: <AlertTriangle className="w-3 h-3" />
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[s] || styles.pending}`}>
        {icons[s]} {s}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="">All Categories</option>
            {DOCUMENT_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{formatCategory(cat)}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending Processing</option>
            <option value="completed">Processed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`w-6 h-6 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
          darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}>
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No documents found</p>
          <p className="text-sm">Upload sailing rules PDFs to build Alfie's knowledge base</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map(doc => (
            <div
              key={doc.id}
              className={`rounded-xl border p-4 transition-colors ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${!doc.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2.5 rounded-lg shrink-0 ${
                    darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-600'
                  }`}>
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {doc.title}
                      </h3>
                      {getStatusBadge(doc.processing_status)}
                      {!doc.is_active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          <EyeOff className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </div>
                    <div className={`flex items-center gap-4 mt-2 text-xs flex-wrap ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      <span className={`px-2 py-0.5 rounded-full ${
                        darkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-700'
                      }`}>
                        {formatCategory(doc.category)}
                      </span>
                      {doc.file_name && <span>{doc.file_name}</span>}
                      {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                      {doc.chunk_count != null && doc.chunk_count > 0 && (
                        <span>{doc.chunk_count} chunks</span>
                      )}
                      {doc.source_url && (
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center gap-1 ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <Globe className="w-3 h-3" /> Source
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    {doc.processing_status === 'failed' && doc.processing_error && (
                      <p className="text-xs text-red-500 mt-1">Error: {doc.processing_error}</p>
                    )}
                    {!doc.storage_path && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                          File missing - please re-upload the PDF
                        </span>
                        <button
                          onClick={() => {
                            setReuploadDocId(doc.id);
                            reuploadInputRef.current?.click();
                          }}
                          className="text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" /> Upload File
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.storage_path && (doc.processing_status === 'pending' || doc.processing_status === 'failed' || !doc.processing_status) && (
                    <button
                      onClick={() => handleProcess(doc)}
                      disabled={processingDocs.has(doc.id)}
                      className={`p-2 rounded-lg text-sm transition-colors ${
                        darkMode
                          ? 'hover:bg-gray-700 text-blue-400'
                          : 'hover:bg-gray-100 text-blue-600'
                      }`}
                      title="Process document"
                    >
                      <RefreshCw className={`w-4 h-4 ${processingDocs.has(doc.id) ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(doc)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    } ${doc.is_active
                      ? (darkMode ? 'text-green-400' : 'text-green-600')
                      : (darkMode ? 'text-gray-500' : 'text-gray-400')
                    }`}
                    title={doc.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {doc.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === doc.id ? null : doc.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                      }`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === doc.id && (
                      <div className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-lg border z-10 ${
                        darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                      }`}>
                        <button
                          onClick={() => handleEdit(doc)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                            darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Details
                        </button>
                        <button
                          onClick={() => { setDocToDelete(doc.id); setDeleteConfirmOpen(true); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Upload Sailing Rules Document</h3>
              <button onClick={() => setShowUploadModal(false)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Document Title *
                </label>
                <input
                  type="text"
                  value={uploadForm.title}
                  onChange={e => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., World Sailing Racing Rules 2025-2028"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Category
                </label>
                <select
                  value={uploadForm.category}
                  onChange={e => setUploadForm(prev => ({ ...prev, category: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {DOCUMENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{formatCategory(cat)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Source URL (optional)
                </label>
                <input
                  type="url"
                  value={uploadForm.source_url}
                  onChange={e => setUploadForm(prev => ({ ...prev, source_url: e.target.value }))}
                  placeholder="https://www.sailing.org/..."
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  PDF File *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setUploadForm(prev => ({ ...prev, file }));
                    if (file && !uploadForm.title) {
                      setUploadForm(prev => ({
                        ...prev,
                        file,
                        title: file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
                      }));
                    }
                  }}
                  className={`w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium ${
                    darkMode
                      ? 'text-gray-300 file:bg-gray-600 file:text-gray-200'
                      : 'text-gray-600 file:bg-blue-50 file:text-blue-700'
                  }`}
                />
                {uploadForm.file && (
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {formatFileSize(uploadForm.file.size)}
                  </p>
                )}
              </div>
            </div>
            <div className={`flex items-center justify-end gap-3 p-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => setShowUploadModal(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadForm.file || !uploadForm.title || uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Edit Document Details</h3>
              <button onClick={() => { setShowEditModal(false); setEditingDoc(null); }} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Document Title</label>
                <input
                  type="text"
                  value={editingDoc.title}
                  onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Category</label>
                <select
                  value={editingDoc.category}
                  onChange={e => setEditingDoc({ ...editingDoc, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  {DOCUMENT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{formatCategory(cat)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Source URL</label>
                <input
                  type="url"
                  value={editingDoc.source_url || ''}
                  onChange={e => setEditingDoc({ ...editingDoc, source_url: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            </div>
            <div className={`flex items-center justify-end gap-3 p-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => { setShowEditModal(false); setEditingDoc(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={reuploadInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleReupload(file);
          e.target.value = '';
        }}
      />

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDocToDelete(null); }}
        onConfirm={handleDelete}
        title="Delete Document"
        message="This will permanently delete this document and all associated knowledge chunks. This cannot be undone."
        confirmText="Delete"
        confirmStyle="danger"
        darkMode={darkMode}
      />
    </div>
  );
}
