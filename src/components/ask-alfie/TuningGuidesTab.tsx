import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Search, FileText, Trash2, Edit2, Eye, EyeOff,
  RefreshCw, CheckCircle2, AlertTriangle, Clock, X,
  ChevronDown, MoreVertical, Download
} from 'lucide-react';
import {
  AlfieTuningGuide, getTuningGuides, uploadTuningGuide,
  updateTuningGuide, deleteTuningGuide, triggerGuideProcessing,
  getBoatTypes
} from '../../utils/alfieKnowledgeStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import { ConfirmationModal } from '../ConfirmationModal';

interface TuningGuidesTabProps {
  darkMode: boolean;
}

export default function TuningGuidesTab({ darkMode }: TuningGuidesTabProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [guides, setGuides] = useState<AlfieTuningGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBoatType, setFilterBoatType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [boatTypes, setBoatTypes] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGuide, setEditingGuide] = useState<AlfieTuningGuide | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [guideToDelete, setGuideToDelete] = useState<string | null>(null);
  const [processingGuides, setProcessingGuides] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [uploadForm, setUploadForm] = useState({
    name: '',
    boat_type: '',
    hull_type: '',
    description: '',
    version: '1.0',
    file: null as File | null
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [guidesData, boatTypesData] = await Promise.all([
        getTuningGuides(),
        getBoatTypes()
      ]);
      setGuides(guidesData);
      setBoatTypes(boatTypesData);
    } catch (err) {
      console.error('Error loading tuning guides:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.name || !user) return;
    setUploading(true);
    try {
      const guide = await uploadTuningGuide(
        uploadForm.file,
        {
          name: uploadForm.name,
          boat_type: uploadForm.boat_type,
          hull_type: uploadForm.hull_type,
          description: uploadForm.description,
          version: uploadForm.version
        },
        user.id
      );
      setGuides(prev => [guide, ...prev]);
      setShowUploadModal(false);
      setUploadForm({ name: '', boat_type: '', hull_type: '', description: '', version: '1.0', file: null });
      addNotification({ type: 'success', title: 'Guide Uploaded', message: `"${guide.name}" has been uploaded. Click Process to extract knowledge.` });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Upload Failed', message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async (guide: AlfieTuningGuide) => {
    setProcessingGuides(prev => new Set(prev).add(guide.id));
    try {
      await triggerGuideProcessing(guide.id);
      addNotification({ type: 'success', title: 'Processing Started', message: `"${guide.name}" is being processed. This may take a few minutes.` });
      setTimeout(() => loadData(), 5000);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Processing Failed', message: err.message });
    } finally {
      setProcessingGuides(prev => {
        const next = new Set(prev);
        next.delete(guide.id);
        return next;
      });
    }
  };

  const handleToggleActive = async (guide: AlfieTuningGuide) => {
    try {
      const updated = await updateTuningGuide(guide.id, { is_active: !guide.is_active });
      setGuides(prev => prev.map(g => g.id === guide.id ? updated : g));
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleEdit = (guide: AlfieTuningGuide) => {
    setEditingGuide(guide);
    setShowEditModal(true);
    setOpenMenuId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingGuide) return;
    try {
      const updated = await updateTuningGuide(editingGuide.id, {
        name: editingGuide.name,
        boat_type: editingGuide.boat_type,
        hull_type: editingGuide.hull_type,
        description: editingGuide.description,
        version: editingGuide.version
      });
      setGuides(prev => prev.map(g => g.id === updated.id ? updated : g));
      setShowEditModal(false);
      setEditingGuide(null);
      addNotification({ type: 'success', title: 'Guide Updated', message: 'Tuning guide details have been updated.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  const handleDelete = async () => {
    if (!guideToDelete) return;
    try {
      await deleteTuningGuide(guideToDelete);
      setGuides(prev => prev.filter(g => g.id !== guideToDelete));
      addNotification({ type: 'success', title: 'Guide Deleted', message: 'Tuning guide and associated knowledge have been removed.' });
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Delete Failed', message: err.message });
    } finally {
      setDeleteConfirmOpen(false);
      setGuideToDelete(null);
    }
  };

  const filteredGuides = guides.filter(g => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!g.name.toLowerCase().includes(q) && !g.boat_type.toLowerCase().includes(q) && !g.description.toLowerCase().includes(q)) return false;
    }
    if (filterBoatType && g.boat_type !== filterBoatType) return false;
    if (filterStatus && g.status !== filterStatus) return false;
    return true;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
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
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {icons[status]} {status}
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
              placeholder="Search guides..."
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
            value={filterBoatType}
            onChange={e => setFilterBoatType(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="">All Boat Types</option>
            {boatTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={`px-3 py-2 rounded-lg border text-sm ${
              darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
            }`}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          Upload Guide
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className={`w-6 h-6 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
        </div>
      ) : filteredGuides.length === 0 ? (
        <div className={`text-center py-16 rounded-xl border-2 border-dashed ${
          darkMode ? 'border-gray-700 text-gray-400' : 'border-gray-200 text-gray-500'
        }`}>
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No tuning guides found</p>
          <p className="text-sm">Upload a PDF tuning guide to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuides.map(guide => (
            <div
              key={guide.id}
              className={`rounded-xl border p-4 transition-colors ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              } ${!guide.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2.5 rounded-lg shrink-0 ${
                    darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {guide.name}
                      </h3>
                      {getStatusBadge(guide.status)}
                      {!guide.is_active && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                          <EyeOff className="w-3 h-3" /> Inactive
                        </span>
                      )}
                    </div>
                    {guide.description && (
                      <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {guide.description}
                      </p>
                    )}
                    <div className={`flex items-center gap-4 mt-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {guide.boat_type && (
                        <span className={`px-2 py-0.5 rounded-full ${
                          darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {guide.boat_type}
                        </span>
                      )}
                      {guide.hull_type && <span>Hull: {guide.hull_type}</span>}
                      <span>v{guide.version}</span>
                      <span>{formatFileSize(guide.file_size)}</span>
                      <span>{guide.file_name}</span>
                      {guide.status === 'completed' && (
                        <>
                          <span>{guide.chunk_count} chunks</span>
                          <span>{guide.image_count} images</span>
                        </>
                      )}
                    </div>
                    {guide.status === 'failed' && guide.processing_error && (
                      <p className="text-xs text-red-500 mt-1">Error: {guide.processing_error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(guide.status === 'pending' || guide.status === 'failed') && (
                    <button
                      onClick={() => handleProcess(guide)}
                      disabled={processingGuides.has(guide.id)}
                      className={`p-2 rounded-lg text-sm transition-colors ${
                        darkMode
                          ? 'hover:bg-gray-700 text-blue-400'
                          : 'hover:bg-gray-100 text-blue-600'
                      }`}
                      title="Process guide"
                    >
                      <RefreshCw className={`w-4 h-4 ${processingGuides.has(guide.id) ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(guide)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                    } ${guide.is_active
                      ? (darkMode ? 'text-green-400' : 'text-green-600')
                      : (darkMode ? 'text-gray-500' : 'text-gray-400')
                    }`}
                    title={guide.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {guide.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === guide.id ? null : guide.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                      }`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === guide.id && (
                      <div className={`absolute right-0 top-full mt-1 w-40 rounded-lg shadow-lg border z-10 ${
                        darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'
                      }`}>
                        <button
                          onClick={() => handleEdit(guide)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                            darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Details
                        </button>
                        <button
                          onClick={() => { setGuideToDelete(guide.id); setDeleteConfirmOpen(true); setOpenMenuId(null); }}
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
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Upload Tuning Guide</h3>
              <button onClick={() => setShowUploadModal(false)} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Guide Name *
                </label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={e => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., DF95 Rig Tuning Guide"
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Boat Type
                  </label>
                  <select
                    value={uploadForm.boat_type}
                    onChange={e => setUploadForm(prev => ({ ...prev, boat_type: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">All Boat Types</option>
                    {boatTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Hull Type
                  </label>
                  <input
                    type="text"
                    value={uploadForm.hull_type}
                    onChange={e => setUploadForm(prev => ({ ...prev, hull_type: e.target.value }))}
                    placeholder="e.g., A hull, B hull"
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description
                </label>
                <textarea
                  value={uploadForm.description}
                  onChange={e => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of what this guide covers..."
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Version
                </label>
                <input
                  type="text"
                  value={uploadForm.version}
                  onChange={e => setUploadForm(prev => ({ ...prev, version: e.target.value }))}
                  placeholder="1.0"
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
                  accept=".pdf"
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setUploadForm(prev => ({ ...prev, file }));
                    if (file && !uploadForm.name) {
                      setUploadForm(prev => ({ ...prev, name: file.name.replace('.pdf', '').replace(/_/g, ' ') }));
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
                disabled={!uploadForm.file || !uploadForm.name || uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload Guide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingGuide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`flex items-center justify-between p-5 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Edit Guide Details</h3>
              <button onClick={() => { setShowEditModal(false); setEditingGuide(null); }} className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Guide Name</label>
                <input
                  type="text"
                  value={editingGuide.name}
                  onChange={e => setEditingGuide({ ...editingGuide, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Boat Type</label>
                  <select
                    value={editingGuide.boat_type}
                    onChange={e => setEditingGuide({ ...editingGuide, boat_type: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">All Boat Types</option>
                    {boatTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Hull Type</label>
                  <input
                    type="text"
                    value={editingGuide.hull_type}
                    onChange={e => setEditingGuide({ ...editingGuide, hull_type: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                  value={editingGuide.description}
                  onChange={e => setEditingGuide({ ...editingGuide, description: e.target.value })}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Version</label>
                <input
                  type="text"
                  value={editingGuide.version}
                  onChange={e => setEditingGuide({ ...editingGuide, version: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>
            </div>
            <div className={`flex items-center justify-end gap-3 p-5 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={() => { setShowEditModal(false); setEditingGuide(null); }}
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

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setGuideToDelete(null); }}
        onConfirm={handleDelete}
        title="Delete Tuning Guide"
        message="This will permanently delete this tuning guide and all associated knowledge chunks and images. This cannot be undone."
        confirmText="Delete"
        confirmStyle="danger"
        darkMode={darkMode}
      />
    </div>
  );
}
