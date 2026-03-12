import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen, Plus, Edit2, Trash2, FileText, Link as LinkIcon,
  ExternalLink, Download, Search, Grid, List, HardDrive,
  RefreshCw, ChevronRight, Home, Upload, File, Image as ImageIcon,
  Music, Film, Archive, FolderPlus,
  UploadCloud, Eye
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import * as ResourceStorage from '../../utils/associationResourceStorage';
import { supabase } from '../../utils/supabase';

interface ResourcesPageProps {
  darkMode: boolean;
}

type SectionType = 'all' | 'drive' | string;

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime?: string;
  size?: string;
  thumbnailLink?: string;
  isFolder: boolean;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

export const AssociationResourcesPage: React.FC<ResourcesPageProps> = ({ darkMode }) => {
  const { currentOrganization, currentClub, user } = useAuth();
  const { addNotification } = useNotifications();

  const organizationId = currentOrganization?.id || currentClub?.clubId;
  const organizationType: ResourceStorage.OrganizationType = currentOrganization?.type || 'club';
  const organizationName = currentOrganization?.name || currentClub?.club?.name || 'Organization';

  // Navigation
  const [activeSection, setActiveSection] = useState<SectionType>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Local resources (categories + DB resources)
  const [categories, setCategories] = useState<ResourceStorage.ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceStorage.AssociationResource[]>([]);
  const [loading, setLoading] = useState(true);

  // Google Drive state
  const [hasGoogleDrive, setHasGoogleDrive] = useState(false);
  const [driveRootFolderId, setDriveRootFolderId] = useState<string | null>(null);
  const [driveItems, setDriveItems] = useState<DriveItem[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentDriveFolderId, setCurrentDriveFolderId] = useState<string | null>(null);

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceStorage.ResourceCategory | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  // Resource modal
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingResource, setEditingResource] = useState<ResourceStorage.AssociationResource | null>(null);
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceDescription, setResourceDescription] = useState('');
  const [resourceType, setResourceType] = useState<'file' | 'link' | 'page'>('file');
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceContent, setResourceContent] = useState('');
  const [resourceIsPublic, setResourceIsPublic] = useState(true);
  const [resourceSaving, setResourceSaving] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadAll();
    }
  }, [organizationId, organizationType]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && organizationId) checkGoogleDrive();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [organizationId]);

  useEffect(() => {
    if (activeSection === 'drive' && hasGoogleDrive) {
      if (currentDriveFolderId) {
        browseDriveFolder(currentDriveFolderId);
      } else if (driveRootFolderId) {
        browseDriveFolder(driveRootFolderId);
      }
    }
  }, [activeSection]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cats] = await Promise.all([
        ResourceStorage.fetchResourceCategories(organizationId!, organizationType),
        checkGoogleDrive(),
      ]);
      setCategories(cats);
      const allRes: ResourceStorage.AssociationResource[] = [];
      for (const cat of cats) {
        const res = await ResourceStorage.fetchResources(cat.id);
        allRes.push(...res);
      }
      setResources(allRes);
    } catch (err) {
      console.error('Error loading resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkGoogleDrive = async (): Promise<boolean> => {
    if (!organizationId) return false;
    try {
      const idColumn = organizationType === 'club' ? 'club_id'
        : organizationType === 'state' ? 'state_association_id'
        : 'national_association_id';
      const { data } = await supabase
        .from('integrations')
        .select('id, credentials')
        .eq(idColumn, organizationId)
        .eq('platform', 'google_drive')
        .maybeSingle();
      const connected = !!data?.credentials?.refresh_token;
      setHasGoogleDrive(connected);
      if (connected && data?.credentials?.folder_id) {
        setDriveRootFolderId(data.credentials.folder_id);
      }
      return connected;
    } catch {
      setHasGoogleDrive(false);
      return false;
    }
  };

  const callDriveApi = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Drive API error');
    }
    return res.json();
  };

  const browseDriveFolder = async (folderId: string, folderName?: string, resetBreadcrumbs = false) => {
    setLoadingDrive(true);
    try {
      const data = await callDriveApi({
        action: 'list_folder',
        organizationId,
        organizationType,
        folderId,
      });
      const items: DriveItem[] = (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink,
        webContentLink: f.webContentLink,
        modifiedTime: f.modifiedTime,
        size: f.size,
        thumbnailLink: f.thumbnailLink,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      }));
      setDriveItems(items);
      setCurrentDriveFolderId(folderId);

      if (resetBreadcrumbs) {
        setDriveBreadcrumbs([]);
      } else if (folderName) {
        setDriveBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
      }
    } catch (err: any) {
      addNotification(err.message || 'Failed to load Drive folder', 'error');
    } finally {
      setLoadingDrive(false);
    }
  };

  const navigateDriveUp = async (index: number) => {
    const newCrumbs = driveBreadcrumbs.slice(0, index);
    setDriveBreadcrumbs(newCrumbs);
    const targetId = index === 0 ? driveRootFolderId! : driveBreadcrumbs[index - 1].id;
    setLoadingDrive(true);
    try {
      const data = await callDriveApi({
        action: 'list_folder',
        organizationId,
        organizationType,
        folderId: targetId,
      });
      setDriveItems((data.files || []).map((f: any) => ({
        id: f.id, name: f.name, mimeType: f.mimeType,
        webViewLink: f.webViewLink, webContentLink: f.webContentLink,
        modifiedTime: f.modifiedTime, size: f.size,
        isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      })));
      setCurrentDriveFolderId(targetId);
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleDriveItemClick = (item: DriveItem) => {
    if (item.isFolder) {
      browseDriveFolder(item.id, item.name);
    } else {
      window.open(item.webViewLink, '_blank');
    }
  };

  const handleOpenDrive = () => {
    setActiveSection('drive');
    if (driveRootFolderId && driveItems.length === 0) {
      browseDriveFolder(driveRootFolderId, undefined, true);
    }
  };

  // Drag & drop upload
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    if (activeSection === 'drive' && hasGoogleDrive && currentDriveFolderId) {
      await uploadFilesToDrive(files, currentDriveFolderId);
    } else if (activeSection !== 'drive' && activeSection !== 'all') {
      await uploadFilesToCategory(files, activeSection);
    } else {
      addNotification('Select a folder or category to upload files', 'info');
    }
  }, [activeSection, hasGoogleDrive, currentDriveFolderId]);

  const uploadFilesToDrive = async (files: File[], folderId: string) => {
    setUploading(true);
    let uploaded = 0;
    for (const file of files) {
      try {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await callDriveApi({
          action: 'upload_file',
          organizationId,
          organizationType,
          fileName: file.name,
          fileData: fileData.split(',')[1],
          mimeType: file.type || 'application/octet-stream',
          folderId,
        });
        uploaded++;
      } catch (err: any) {
        addNotification(`Failed to upload ${file.name}: ${err.message}`, 'error');
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      addNotification(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''} to Google Drive`, 'success');
      browseDriveFolder(folderId);
    }
  };

  const uploadFilesToCategory = async (files: File[], categoryId: string) => {
    setUploading(true);
    let uploaded = 0;
    for (const file of files) {
      try {
        const fileUrl = await ResourceStorage.uploadResourceFile(file, organizationId!, organizationType);
        await ResourceStorage.createResource({
          category_id: categoryId,
          title: file.name,
          description: '',
          resource_type: 'file',
          file_url: fileUrl,
          file_type: file.type,
          file_size: file.size,
          is_public: true,
          is_featured: false,
          tags: [],
          display_order: 0,
          created_by: user?.id,
          sync_status: 'not_synced',
        });
        uploaded++;
      } catch (err: any) {
        addNotification(`Failed to upload ${file.name}`, 'error');
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      addNotification(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}`, 'success');
      loadAll();
    }
  };

  // Category management
  const handleSaveCategory = async () => {
    if (!organizationId || !categoryName.trim()) return;
    setCategorySaving(true);
    try {
      if (editingCategory) {
        await ResourceStorage.updateResourceCategory(editingCategory.id, {
          name: categoryName,
          description: categoryDescription,
        });
        addNotification('Folder updated', 'success');
      } else {
        const newCat = await ResourceStorage.createResourceCategory({
          organization_id: organizationId,
          organization_type: organizationType,
          name: categoryName,
          description: categoryDescription,
          icon: 'folder',
          display_order: categories.length,
        });
        setActiveSection(newCat.id);
        addNotification('Folder created', 'success');
      }
      setShowCategoryModal(false);
      resetCategoryForm();
      loadAll();
    } catch (err) {
      addNotification('Failed to save folder', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const resetCategoryForm = () => {
    setCategoryName('');
    setCategoryDescription('');
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!confirm('Delete this folder and all its resources?')) return;
    try {
      const catResources = await ResourceStorage.fetchResources(catId);
      for (const r of catResources) {
        if (r.file_url) await ResourceStorage.deleteResourceFile(r.file_url);
        await ResourceStorage.deleteResource(r.id);
      }
      await ResourceStorage.deleteResourceCategory(catId);
      if (activeSection === catId) setActiveSection('all');
      addNotification('Folder deleted', 'success');
      loadAll();
    } catch {
      addNotification('Failed to delete folder', 'error');
    }
  };

  // Resource management
  const handleSaveResource = async () => {
    if (!resourceTitle.trim() || activeSection === 'all' || activeSection === 'drive') return;
    setResourceSaving(true);
    try {
      let fileUrl: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;
      if (resourceType === 'file' && resourceFile) {
        fileUrl = await ResourceStorage.uploadResourceFile(resourceFile, organizationId!, organizationType);
        fileType = resourceFile.type;
        fileSize = resourceFile.size;
      }
      const payload = {
        category_id: activeSection,
        title: resourceTitle,
        description: resourceDescription,
        resource_type: resourceType,
        content: resourceContent,
        external_url: resourceUrl || undefined,
        file_url: fileUrl || undefined,
        file_type: fileType || undefined,
        file_size: fileSize || undefined,
        is_public: resourceIsPublic,
        is_featured: false,
        tags: [],
        display_order: 0,
        created_by: user?.id,
        sync_status: 'not_synced' as const,
      };
      if (editingResource) {
        await ResourceStorage.updateResource(editingResource.id, payload);
        addNotification('Resource updated', 'success');
      } else {
        await ResourceStorage.createResource(payload);
        addNotification('Resource added', 'success');
      }
      setShowResourceModal(false);
      resetResourceForm();
      loadAll();
    } catch {
      addNotification('Failed to save resource', 'error');
    } finally {
      setResourceSaving(false);
    }
  };

  const resetResourceForm = () => {
    setResourceTitle('');
    setResourceDescription('');
    setResourceType('file');
    setResourceFile(null);
    setResourceUrl('');
    setResourceContent('');
    setResourceIsPublic(true);
    setEditingResource(null);
  };

  const handleDeleteResource = async (resource: ResourceStorage.AssociationResource) => {
    if (!confirm(`Delete "${resource.title}"?`)) return;
    try {
      if (resource.file_url) await ResourceStorage.deleteResourceFile(resource.file_url);
      await ResourceStorage.deleteResource(resource.id);
      addNotification('Resource deleted', 'success');
      loadAll();
    } catch {
      addNotification('Failed to delete resource', 'error');
    }
  };

  const getFileIcon = (mimeType?: string, isFolder?: boolean) => {
    if (isFolder) return FolderOpen;
    if (!mimeType) return File;
    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType.startsWith('video/')) return Film;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return FileText;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileText;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return FileText;
    if (mimeType === 'application/vnd.google-apps.folder') return FolderOpen;
    if (mimeType.startsWith('application/vnd.google-apps.')) return FileText;
    return File;
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return '';
    const n = parseInt(bytes);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Current category resources (filtered)
  const categoryResources = activeSection !== 'all' && activeSection !== 'drive'
    ? resources.filter(r => r.category_id === activeSection)
    : activeSection === 'all'
    ? resources
    : [];

  const filteredResources = categoryResources.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDriveItems = driveItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentCategory = categories.find(c => c.id === activeSection);
  const isDriveSection = activeSection === 'drive';
  const isAllSection = activeSection === 'all';

  return (
    <div className="flex h-full min-h-0 bg-slate-900">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-slate-800/60 border-r border-slate-700/50 flex flex-col">
        <div className="p-4 border-b border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Resources</h2>
        </div>

        <nav className="flex-1 overflow-y-auto p-2">
          {/* All Files */}
          <button
            onClick={() => setActiveSection('all')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
              isAllSection
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Home size={15} />
            <span>All Files</span>
          </button>

          {/* Google Drive */}
          {hasGoogleDrive && (
            <button
              onClick={handleOpenDrive}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${
                isDriveSection
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              <HardDrive size={15} className={isDriveSection ? 'text-green-400' : 'text-slate-400'} />
              <span>Google Drive</span>
            </button>
          )}

          {/* Divider */}
          {categories.length > 0 && (
            <div className="my-2 border-t border-slate-700/40" />
          )}

          {/* Categories */}
          {categories.map(cat => (
            <div
              key={cat.id}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 cursor-pointer ${
                activeSection === cat.id
                  ? 'bg-slate-700/70 text-white border border-slate-600/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              }`}
              onClick={() => setActiveSection(cat.id)}
            >
              <FolderOpen size={15} className="flex-shrink-0" />
              <span className="flex-1 truncate">{cat.name}</span>
              <div className="hidden group-hover:flex items-center gap-1">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setEditingCategory(cat);
                    setCategoryName(cat.name);
                    setCategoryDescription(cat.description || '');
                    setShowCategoryModal(true);
                  }}
                  className="p-0.5 hover:text-white rounded"
                  title="Rename folder"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                  className="p-0.5 hover:text-red-400 rounded"
                  title="Delete folder"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              {resources.filter(r => r.category_id === cat.id).length > 0 && (
                <span className="text-xs text-slate-500">
                  {resources.filter(r => r.category_id === cat.id).length}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* Sidebar footer actions */}
        <div className="p-2 border-t border-slate-700/50 flex flex-col gap-1">
          <button
            onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 transition-colors"
          >
            <FolderPlus size={14} />
            <span>New Folder</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div
        ref={dropZoneRef}
        className={`flex-1 flex flex-col min-h-0 transition-colors ${
          isDragging ? 'bg-blue-900/20' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-700/50 flex-shrink-0">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {isDriveSection ? (
              <>
                <button
                  onClick={() => { setDriveBreadcrumbs([]); if (driveRootFolderId) browseDriveFolder(driveRootFolderId, undefined, true); }}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <HardDrive size={14} />
                  <span>Google Drive</span>
                </button>
                {driveBreadcrumbs.map((crumb, i) => (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
                    <button
                      onClick={() => navigateDriveUp(i + 1)}
                      className={`text-sm truncate max-w-[160px] transition-colors ${
                        i === driveBreadcrumbs.length - 1
                          ? 'text-white font-medium'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-white">
                  {isAllSection ? 'All Files' : currentCategory?.name || 'Resources'}
                </span>
                {!isAllSection && !isDriveSection && currentCategory && (
                  <span className="text-xs text-slate-500 ml-2">
                    {filteredResources.length} {filteredResources.length === 1 ? 'item' : 'items'}
                  </span>
                )}
                {isAllSection && (
                  <span className="text-xs text-slate-500 ml-2">
                    {filteredResources.length} {filteredResources.length === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative w-52">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-700/50 border border-slate-600/50 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-700/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <List size={14} />
            </button>
          </div>

          {/* Action buttons */}
          {isDriveSection && (
            <button
              onClick={() => currentDriveFolderId && browseDriveFolder(currentDriveFolderId)}
              disabled={loadingDrive}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loadingDrive ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}

          {isDriveSection && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer">
              <Upload size={13} />
              Upload
              <input
                type="file"
                multiple
                className="hidden"
                onChange={async e => {
                  const files = Array.from(e.target.files || []);
                  if (files.length && currentDriveFolderId) {
                    await uploadFilesToDrive(files, currentDriveFolderId);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          )}

          {!isDriveSection && !isAllSection && (
            <button
              onClick={() => { resetResourceForm(); setShowResourceModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
            >
              <Plus size={13} />
              Add Resource
            </button>
          )}

          {!isDriveSection && isAllSection && (
            <button
              onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm text-white transition-colors"
            >
              <FolderPlus size={13} />
              New Folder
            </button>
          )}
        </div>

        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-blue-900/30 border-2 border-dashed border-blue-500/60 rounded-lg m-4">
            <div className="text-center">
              <UploadCloud size={40} className="mx-auto mb-2 text-blue-400" />
              <p className="text-blue-300 font-medium">Drop files here to upload</p>
            </div>
          </div>
        )}

        {/* Upload indicator */}
        {uploading && (
          <div className="flex items-center gap-2 px-5 py-2 bg-blue-900/20 border-b border-blue-700/30 text-sm text-blue-300">
            <RefreshCw size={13} className="animate-spin" />
            Uploading files...
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw size={20} className="animate-spin text-slate-500" />
            </div>
          ) : isDriveSection ? (
            <DriveExplorer
              items={filteredDriveItems}
              loading={loadingDrive}
              viewMode={viewMode}
              onItemClick={handleDriveItemClick}
              getFileIcon={getFileIcon}
              formatFileSize={formatFileSize}
              formatDate={formatDate}
              hasGoogleDrive={hasGoogleDrive}
              driveRootFolderId={driveRootFolderId}
              onOpenDrive={() => driveRootFolderId && browseDriveFolder(driveRootFolderId, undefined, true)}
            />
          ) : (
            <LocalResourcesView
              resources={filteredResources}
              categories={categories}
              viewMode={viewMode}
              isAllSection={isAllSection}
              activeSection={activeSection}
              onSetSection={setActiveSection}
              onEditResource={r => {
                setEditingResource(r);
                setResourceTitle(r.title);
                setResourceDescription(r.description || '');
                setResourceType(r.resource_type === 'google_drive' ? 'file' : r.resource_type as any);
                setResourceUrl(r.external_url || '');
                setResourceContent(r.content || '');
                setResourceIsPublic(r.is_public);
                setShowResourceModal(true);
              }}
              onDeleteResource={handleDeleteResource}
              onAddResource={() => { resetResourceForm(); setShowResourceModal(true); }}
              onNewFolder={() => { resetCategoryForm(); setShowCategoryModal(true); }}
              getFileIcon={getFileIcon}
              formatFileSize={formatFileSize}
              formatDate={formatDate}
              hasGoogleDrive={hasGoogleDrive}
              onOpenDrive={handleOpenDrive}
            />
          )}
        </div>
      </div>

      {/* Category modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                {editingCategory ? 'Rename Folder' : 'New Folder'}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Folder Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  placeholder="Enter folder name"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Description <span className="text-slate-500">(optional)</span></label>
                <input
                  type="text"
                  value={categoryDescription}
                  onChange={e => setCategoryDescription(e.target.value)}
                  placeholder="Brief description"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button
                onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={categorySaving || !categoryName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {categorySaving ? 'Saving...' : editingCategory ? 'Rename' : 'Create Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-5 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">
                {editingResource ? 'Edit Resource' : 'Add Resource'}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {(['file', 'link', 'page'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setResourceType(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                        resourceType === t
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Title</label>
                <input
                  type="text"
                  value={resourceTitle}
                  onChange={e => setResourceTitle(e.target.value)}
                  placeholder="Resource title"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Description <span className="text-slate-500">(optional)</span></label>
                <input
                  type="text"
                  value={resourceDescription}
                  onChange={e => setResourceDescription(e.target.value)}
                  placeholder="Brief description"
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              {resourceType === 'file' && (
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1.5">File</label>
                  <input
                    type="file"
                    onChange={e => setResourceFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600"
                  />
                </div>
              )}
              {resourceType === 'link' && (
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1.5">URL</label>
                  <input
                    type="url"
                    value={resourceUrl}
                    onChange={e => setResourceUrl(e.target.value)}
                    placeholder="https://"
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
              {resourceType === 'page' && (
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1.5">Content</label>
                  <textarea
                    value={resourceContent}
                    onChange={e => setResourceContent(e.target.value)}
                    placeholder="Page content..."
                    rows={4}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resourceIsPublic}
                  onChange={e => setResourceIsPublic(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-slate-300">Visible to all members</span>
              </label>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button
                onClick={() => { setShowResourceModal(false); resetResourceForm(); }}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveResource}
                disabled={resourceSaving || !resourceTitle.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {resourceSaving ? 'Saving...' : editingResource ? 'Update' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-components ---

interface DriveExplorerProps {
  items: DriveItem[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  onItemClick: (item: DriveItem) => void;
  getFileIcon: (mimeType?: string, isFolder?: boolean) => React.ElementType;
  formatFileSize: (bytes?: string) => string;
  formatDate: (iso?: string) => string;
  hasGoogleDrive: boolean;
  driveRootFolderId: string | null;
  onOpenDrive: () => void;
}

const DriveExplorer: React.FC<DriveExplorerProps> = ({
  items, loading, viewMode, onItemClick, getFileIcon, formatFileSize, formatDate,
  hasGoogleDrive, driveRootFolderId, onOpenDrive
}) => {
  if (!hasGoogleDrive || !driveRootFolderId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <HardDrive size={40} className="text-slate-600 mb-3" />
        <p className="text-slate-400 font-medium mb-1">Google Drive not connected</p>
        <p className="text-slate-500 text-sm">Connect Google Drive in Settings → Integrations</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw size={20} className="animate-spin text-slate-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <FolderOpen size={36} className="text-slate-600 mb-3" />
        <p className="text-slate-500">This folder is empty</p>
      </div>
    );
  }

  const folders = items.filter(i => i.isFolder);
  const files = items.filter(i => !i.isFolder);

  if (viewMode === 'grid') {
    return (
      <div>
        {folders.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Folders</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {folders.map(item => (
                <DriveGridItem key={item.id} item={item} onItemClick={onItemClick} getFileIcon={getFileIcon} formatDate={formatDate} formatFileSize={formatFileSize} />
              ))}
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Files</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {files.map(item => (
                <DriveGridItem key={item.id} item={item} onItemClick={onItemClick} getFileIcon={getFileIcon} formatDate={formatDate} formatFileSize={formatFileSize} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-8"></th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Name</th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-32">Modified</th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-24">Size</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {[...folders, ...files].map(item => (
            <DriveListItem key={item.id} item={item} onItemClick={onItemClick} getFileIcon={getFileIcon} formatDate={formatDate} formatFileSize={formatFileSize} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DriveGridItem: React.FC<{
  item: DriveItem;
  onItemClick: (item: DriveItem) => void;
  getFileIcon: (mimeType?: string, isFolder?: boolean) => React.ElementType;
  formatDate: (iso?: string) => string;
  formatFileSize: (bytes?: string) => string;
}> = ({ item, onItemClick, getFileIcon, formatDate, formatFileSize }) => {
  const Icon = getFileIcon(item.mimeType, item.isFolder);
  return (
    <button
      onClick={() => onItemClick(item)}
      className="group flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-700/50 transition-all text-left w-full"
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
        item.isFolder ? 'bg-amber-500/15' : 'bg-slate-700/60'
      }`}>
        <Icon size={24} className={item.isFolder ? 'text-amber-400' : 'text-slate-400'} />
      </div>
      <p className="text-xs text-slate-300 text-center line-clamp-2 w-full">{item.name}</p>
      {!item.isFolder && (
        <p className="text-xs text-slate-600">{formatFileSize(item.size)}</p>
      )}
    </button>
  );
};

const DriveListItem: React.FC<{
  item: DriveItem;
  onItemClick: (item: DriveItem) => void;
  getFileIcon: (mimeType?: string, isFolder?: boolean) => React.ElementType;
  formatDate: (iso?: string) => string;
  formatFileSize: (bytes?: string) => string;
}> = ({ item, onItemClick, getFileIcon, formatDate, formatFileSize }) => {
  const Icon = getFileIcon(item.mimeType, item.isFolder);
  return (
    <tr
      className="hover:bg-slate-700/30 cursor-pointer transition-colors group"
      onClick={() => onItemClick(item)}
    >
      <td className="px-4 py-2.5">
        <Icon size={16} className={item.isFolder ? 'text-amber-400' : 'text-slate-400'} />
      </td>
      <td className="px-4 py-2.5">
        <span className="text-sm text-slate-200 group-hover:text-white transition-colors">{item.name}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{formatDate(item.modifiedTime)}</td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{formatFileSize(item.size)}</td>
    </tr>
  );
};

interface LocalResourcesViewProps {
  resources: ResourceStorage.AssociationResource[];
  categories: ResourceStorage.ResourceCategory[];
  viewMode: 'grid' | 'list';
  isAllSection: boolean;
  activeSection: string;
  onSetSection: (s: string) => void;
  onEditResource: (r: ResourceStorage.AssociationResource) => void;
  onDeleteResource: (r: ResourceStorage.AssociationResource) => void;
  onAddResource: () => void;
  onNewFolder: () => void;
  getFileIcon: (mimeType?: string, isFolder?: boolean) => React.ElementType;
  formatFileSize: (bytes?: string) => string;
  formatDate: (iso?: string) => string;
  hasGoogleDrive: boolean;
  onOpenDrive: () => void;
}

const LocalResourcesView: React.FC<LocalResourcesViewProps> = ({
  resources, categories, viewMode, isAllSection, activeSection,
  onSetSection, onEditResource, onDeleteResource, onAddResource, onNewFolder,
  getFileIcon, formatFileSize, formatDate, hasGoogleDrive, onOpenDrive
}) => {
  if (isAllSection) {
    return (
      <div>
        {hasGoogleDrive && (
          <div className="mb-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Connected Storage</p>
            <button
              onClick={onOpenDrive}
              className="flex items-center gap-3 px-4 py-3 bg-slate-800/50 border border-slate-700/50 hover:border-green-600/40 hover:bg-slate-700/40 rounded-xl w-full text-left transition-all group"
            >
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <HardDrive size={20} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200 group-hover:text-white">Google Drive</p>
                <p className="text-xs text-slate-500">Browse and manage your Drive files</p>
              </div>
              <ChevronRight size={16} className="text-slate-600 ml-auto" />
            </button>
          </div>
        )}

        {categories.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Folders</p>
            <div className={viewMode === 'grid'
              ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'
              : 'flex flex-col gap-1'
            }>
              {categories.map(cat => {
                const count = resources.filter(r => r.category_id === cat.id).length;
                if (viewMode === 'grid') {
                  return (
                    <button
                      key={cat.id}
                      onClick={() => onSetSection(cat.id)}
                      className="flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-700/50 transition-all"
                    >
                      <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                        <FolderOpen size={24} className="text-amber-400" />
                      </div>
                      <p className="text-xs text-slate-300 text-center">{cat.name}</p>
                      <p className="text-xs text-slate-600">{count} item{count !== 1 ? 's' : ''}</p>
                    </button>
                  );
                }
                return (
                  <button
                    key={cat.id}
                    onClick={() => onSetSection(cat.id)}
                    className="flex items-center gap-3 px-4 py-3 bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/50 hover:bg-slate-700/30 rounded-xl transition-all group"
                  >
                    <FolderOpen size={18} className="text-amber-400 flex-shrink-0" />
                    <span className="text-sm text-slate-200 group-hover:text-white flex-1 text-left">{cat.name}</span>
                    <span className="text-xs text-slate-500">{count} item{count !== 1 ? 's' : ''}</span>
                    <ChevronRight size={14} className="text-slate-600" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {categories.length === 0 && !hasGoogleDrive && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderOpen size={40} className="text-slate-700 mb-3" />
            <p className="text-slate-400 font-medium mb-1">No folders yet</p>
            <p className="text-slate-500 text-sm mb-4">Create a folder to organise your resources</p>
            <button
              onClick={onNewFolder}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              <Plus size={14} />
              New Folder
            </button>
          </div>
        )}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <File size={36} className="text-slate-700 mb-3" />
        <p className="text-slate-400 font-medium mb-1">No resources yet</p>
        <p className="text-slate-500 text-sm mb-4">Add files, links, or pages to this folder</p>
        <button
          onClick={onAddResource}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
        >
          <Plus size={14} />
          Add Resource
        </button>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {resources.map(r => {
          const Icon = getFileIcon(r.file_type || r.resource_type);
          return (
            <div key={r.id} className="group relative flex flex-col items-center gap-2 p-3 rounded-xl bg-slate-800/50 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-700/50 transition-all">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Icon size={24} className="text-blue-400" />
              </div>
              <p className="text-xs text-slate-300 text-center line-clamp-2 w-full">{r.title}</p>
              <p className="text-xs text-slate-600">{formatFileSize(r.file_size?.toString())}</p>
              <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                {r.external_url && (
                  <button onClick={() => window.open(r.external_url!, '_blank')} className="p-1 bg-slate-700 rounded hover:bg-slate-600">
                    <Eye size={11} className="text-slate-300" />
                  </button>
                )}
                <button onClick={() => onEditResource(r)} className="p-1 bg-slate-700 rounded hover:bg-slate-600">
                  <Edit2 size={11} className="text-slate-300" />
                </button>
                <button onClick={() => onDeleteResource(r)} className="p-1 bg-slate-700 rounded hover:bg-red-600">
                  <Trash2 size={11} className="text-slate-300" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-700/50">
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-8"></th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5">Name</th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-32">Added</th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-24">Size</th>
            <th className="text-left text-xs font-medium text-slate-500 px-4 py-2.5 w-24">Type</th>
            <th className="w-20 px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/30">
          {resources.map(r => {
            const Icon = getFileIcon(r.file_type || r.resource_type);
            return (
              <tr key={r.id} className="hover:bg-slate-700/20 group transition-colors">
                <td className="px-4 py-3">
                  <Icon size={16} className="text-slate-400" />
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm text-slate-200">{r.title}</p>
                    {r.description && <p className="text-xs text-slate-500 truncate max-w-xs">{r.description}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatFileSize(r.file_size?.toString())}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 capitalize">
                    {r.resource_type === 'google_drive' ? 'Drive' : r.resource_type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="hidden group-hover:flex items-center justify-end gap-1">
                    {(r.external_url || r.file_url) && (
                      <button
                        onClick={() => window.open(r.external_url || r.file_url!, '_blank')}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                        title="Open"
                      >
                        <Eye size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => onEditResource(r)}
                      className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => onDeleteResource(r)}
                      className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
