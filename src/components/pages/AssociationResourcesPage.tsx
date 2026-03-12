import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FolderOpen, Plus, Edit2, Trash2, FileText,
  Search, Grid, List, HardDrive,
  RefreshCw, ChevronRight, Home, Upload, File, Image as ImageIcon,
  Music, Film, Archive, FolderPlus, UploadCloud, Eye,
  Download, ExternalLink, MoreVertical, X, Building2, Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import * as ResourceStorage from '../../utils/associationResourceStorage';
import { supabase } from '../../utils/supabase';

interface ResourcesPageProps {
  darkMode: boolean;
}

type SectionType = 'all' | 'drive' | 'shared' | string;

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
  const isClubContext = !currentOrganization && !!currentClub;

  // Navigation
  const [activeSection, setActiveSection] = useState<SectionType>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Local resources
  const [categories, setCategories] = useState<ResourceStorage.ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceStorage.AssociationResource[]>([]);
  const [sharedResources, setSharedResources] = useState<ResourceStorage.AssociationResource[]>([]);
  const [loading, setLoading] = useState(true);

  // Google Drive
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ item: DriveItem; x: number; y: number } | null>(null);

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
    if (organizationId) loadAll();
  }, [organizationId, organizationType]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && organizationId) checkGoogleDrive();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [organizationId]);

  useEffect(() => {
    if (activeSection === 'drive' && hasGoogleDrive && driveItems.length === 0) {
      const rootId = driveRootFolderId || 'root';
      browseDriveFolder(rootId, undefined, true);
    }
  }, [activeSection, hasGoogleDrive]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const cats = await ResourceStorage.fetchResourceCategories(organizationId!, organizationType);
      setCategories(cats);
      const allRes: ResourceStorage.AssociationResource[] = [];
      for (const cat of cats) {
        const res = await ResourceStorage.fetchResources(cat.id);
        allRes.push(...res);
      }
      setResources(allRes);

      // Load shared resources for clubs
      if (isClubContext && currentClub?.clubId) {
        try {
          const shared = await ResourceStorage.fetchPublicAssociationResources(currentClub.clubId);
          setSharedResources(shared);
        } catch {
          setSharedResources([]);
        }
      }

      await checkGoogleDrive();
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

  const navigateDriveTo = async (index: number) => {
    const newCrumbs = driveBreadcrumbs.slice(0, index);
    setDriveBreadcrumbs(newCrumbs);
    const targetId = index === 0
      ? (driveRootFolderId || 'root')
      : driveBreadcrumbs[index - 1].id;
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

  const handleDriveDownload = (item: DriveItem) => {
    if (item.webContentLink) {
      window.open(item.webContentLink, '_blank');
    } else if (item.webViewLink) {
      window.open(item.webViewLink, '_blank');
    }
  };

  const handleDriveDelete = async (item: DriveItem) => {
    if (!confirm(`Delete "${item.name}" from Google Drive?`)) return;
    try {
      await callDriveApi({
        action: 'delete_file',
        organizationId,
        organizationType,
        fileId: item.id,
      });
      addNotification(`"${item.name}" deleted`, 'success');
      if (currentDriveFolderId) browseDriveFolder(currentDriveFolderId);
    } catch (err: any) {
      addNotification(err.message || 'Failed to delete file', 'error');
    }
  };

  const handleOpenDrive = () => {
    setActiveSection('drive');
  };

  // Drag & drop
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
    } else if (activeSection !== 'drive' && activeSection !== 'all' && activeSection !== 'shared') {
      await uploadFilesToCategory(files, activeSection);
    } else {
      addNotification('Select a folder to upload files into', 'info');
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
      } catch {
        addNotification(`Failed to upload ${file.name}`, 'error');
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      addNotification(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''}`, 'success');
      loadAll();
    }
  };

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
    } catch {
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

  const handleSaveResource = async () => {
    if (!resourceTitle.trim() || activeSection === 'all' || activeSection === 'drive' || activeSection === 'shared') return;
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
    if (mimeType === 'application/vnd.google-apps.folder') return FolderOpen;
    if (mimeType.startsWith('application/vnd.google-apps.')) return FileText;
    return File;
  };

  const getFileIconColor = (mimeType?: string, isFolder?: boolean) => {
    if (isFolder || mimeType === 'application/vnd.google-apps.folder') return 'text-amber-400';
    if (!mimeType) return 'text-slate-400';
    if (mimeType.startsWith('image/')) return 'text-green-400';
    if (mimeType.startsWith('audio/')) return 'text-purple-400';
    if (mimeType.startsWith('video/')) return 'text-pink-400';
    if (mimeType.includes('pdf')) return 'text-red-400';
    if (mimeType.includes('document') || mimeType.startsWith('text/')) return 'text-blue-400';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-emerald-400';
    if (mimeType.includes('presentation')) return 'text-orange-400';
    if (mimeType.startsWith('application/vnd.google-apps.')) return 'text-blue-400';
    return 'text-slate-400';
  };

  const getFileBgColor = (mimeType?: string, isFolder?: boolean) => {
    if (isFolder || mimeType === 'application/vnd.google-apps.folder') return 'bg-amber-500/15';
    if (!mimeType) return 'bg-slate-700/50';
    if (mimeType.startsWith('image/')) return 'bg-green-500/15';
    if (mimeType.startsWith('audio/')) return 'bg-purple-500/15';
    if (mimeType.startsWith('video/')) return 'bg-pink-500/15';
    if (mimeType.includes('pdf')) return 'bg-red-500/15';
    if (mimeType.includes('document') || mimeType.startsWith('text/')) return 'bg-blue-500/15';
    return 'bg-slate-700/50';
  };

  const formatFileSize = (bytes?: string | number) => {
    const n = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isDriveSection = activeSection === 'drive';
  const isAllSection = activeSection === 'all';
  const isSharedSection = activeSection === 'shared';
  const currentCategory = categories.find(c => c.id === activeSection);

  const categoryResources = isAllSection
    ? resources
    : (!isDriveSection && !isSharedSection)
    ? resources.filter(r => r.category_id === activeSection)
    : [];

  const filteredResources = categoryResources.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDriveItems = driveItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSharedResources = sharedResources.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Page Header */}
      <div className="flex-shrink-0 px-6 py-5 border-b border-slate-700/50 bg-slate-900/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-600 shadow-lg shadow-blue-500/20">
              <FolderOpen size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Resources</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                {isClubContext ? 'Club & shared association resources' : 'Manage and share resources with your members'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isDriveSection && !isAllSection && !isSharedSection && (
              <button
                onClick={() => { resetResourceForm(); setShowResourceModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20 font-medium text-sm"
              >
                <Plus size={15} />
                Add Resource
              </button>
            )}
            {isDriveSection && currentDriveFolderId && (
              <label className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all hover:scale-105 hover:shadow-lg hover:shadow-green-500/20 font-medium text-sm cursor-pointer">
                <Upload size={15} />
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
            <button
              onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700/80 hover:bg-slate-700 border border-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-all text-sm"
            >
              <FolderPlus size={15} />
              New Folder
            </button>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-slate-700/50 bg-slate-900/40 flex flex-col overflow-y-auto">
          <nav className="p-3 space-y-0.5 flex-1">
            {/* All Files */}
            <SidebarItem
              icon={Home}
              label="All Files"
              count={resources.length}
              active={isAllSection}
              onClick={() => setActiveSection('all')}
            />

            {/* Google Drive */}
            {hasGoogleDrive && (
              <SidebarItem
                icon={HardDrive}
                label="Google Drive"
                active={isDriveSection}
                onClick={handleOpenDrive}
                accent="green"
              />
            )}

            {/* Shared from association */}
            {isClubContext && sharedResources.length > 0 && (
              <SidebarItem
                icon={Building2}
                label="Shared with Club"
                count={sharedResources.length}
                active={isSharedSection}
                onClick={() => setActiveSection('shared')}
                accent="blue"
              />
            )}

            {categories.length > 0 && (
              <div className="pt-3 pb-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-3 mb-1">Folders</p>
              </div>
            )}

            {categories.map(cat => (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setActiveSection(cat.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                    activeSection === cat.id
                      ? 'bg-slate-700/80 text-white border border-slate-600/60 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                  }`}
                >
                  <FolderOpen size={14} className={activeSection === cat.id ? 'text-amber-400' : 'text-slate-500'} />
                  <span className="flex-1 truncate text-left">{cat.name}</span>
                  <span className="text-xs text-slate-600">
                    {resources.filter(r => r.category_id === cat.id).length}
                  </span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-slate-800 rounded px-0.5">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setEditingCategory(cat);
                      setCategoryName(cat.name);
                      setCategoryDescription(cat.description || '');
                      setShowCategoryModal(true);
                    }}
                    className="p-1 hover:text-white text-slate-400 rounded transition-colors"
                  >
                    <Edit2 size={10} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                    className="p-1 hover:text-red-400 text-slate-400 rounded transition-colors"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div
          ref={dropZoneRef}
          className={`flex-1 flex flex-col min-h-0 transition-colors relative ${
            isDragging ? 'bg-blue-900/10' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Toolbar bar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-slate-700/40 bg-slate-800/30">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 flex-1 min-w-0 text-sm">
              {isDriveSection ? (
                <>
                  <button
                    onClick={() => navigateDriveTo(0)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <HardDrive size={13} className="text-green-400" />
                    <span className={driveBreadcrumbs.length === 0 ? 'text-white font-medium' : ''}>Google Drive</span>
                  </button>
                  {driveBreadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight size={13} className="text-slate-600 flex-shrink-0" />
                      <button
                        onClick={() => navigateDriveTo(i + 1)}
                        className={`truncate max-w-[140px] transition-colors ${
                          i === driveBreadcrumbs.length - 1
                            ? 'text-white font-medium'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <span className="font-medium text-white">
                  {isAllSection ? 'All Files' : isSharedSection ? 'Shared with Club' : (currentCategory?.name || 'Resources')}
                </span>
              )}
              {!isDriveSection && (
                <span className="text-xs text-slate-500 ml-2">
                  {isSharedSection ? filteredSharedResources.length : filteredResources.length} items
                </span>
              )}
              {isDriveSection && !loadingDrive && (
                <span className="text-xs text-slate-500 ml-2">{filteredDriveItems.length} items</span>
              )}
            </div>

            {/* Search */}
            <div className="relative w-56">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
              />
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-slate-700/50 rounded-lg p-0.5 border border-slate-600/30">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <List size={13} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Grid size={13} />
              </button>
            </div>

            {isDriveSection && (
              <button
                onClick={() => currentDriveFolderId && browseDriveFolder(currentDriveFolderId)}
                disabled={loadingDrive}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={13} className={loadingDrive ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
              <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-blue-400/60 bg-blue-900/20 flex items-center justify-center">
                <div className="text-center">
                  <UploadCloud size={48} className="mx-auto mb-3 text-blue-400" />
                  <p className="text-blue-300 font-semibold text-lg">Drop files here to upload</p>
                  <p className="text-blue-400/70 text-sm mt-1">
                    {activeSection === 'drive' ? 'Upload to Google Drive' : 'Upload to folder'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-2.5 bg-blue-900/20 border-b border-blue-700/30">
              <RefreshCw size={13} className="animate-spin text-blue-400" />
              <span className="text-sm text-blue-300 font-medium">Uploading files...</span>
            </div>
          )}

          {/* Main scroll area */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Loading resources...</p>
                </div>
              </div>
            ) : isDriveSection ? (
              <DriveView
                items={filteredDriveItems}
                loading={loadingDrive}
                viewMode={viewMode}
                hasGoogleDrive={hasGoogleDrive}
                driveRootFolderId={driveRootFolderId}
                onItemClick={handleDriveItemClick}
                onDownload={handleDriveDownload}
                onDelete={handleDriveDelete}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
              />
            ) : isSharedSection ? (
              <SharedResourcesView
                resources={filteredSharedResources}
                viewMode={viewMode}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
              />
            ) : isAllSection ? (
              <AllFilesView
                categories={categories}
                resources={resources}
                filteredResources={filteredResources}
                viewMode={viewMode}
                hasGoogleDrive={hasGoogleDrive}
                sharedCount={sharedResources.length}
                isClubContext={isClubContext}
                onSetSection={setActiveSection}
                onOpenDrive={handleOpenDrive}
                onNewFolder={() => { resetCategoryForm(); setShowCategoryModal(true); }}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
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
              />
            ) : (
              <FolderView
                resources={filteredResources}
                viewMode={viewMode}
                onAddResource={() => { resetResourceForm(); setShowResourceModal(true); }}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
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
              />
            )}
          </div>
        </div>
      </div>

      {/* Category modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white">
                {editingCategory ? 'Rename Folder' : 'New Folder'}
              </h3>
              <button onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Folder Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  placeholder="e.g. Race Documents, Minutes..."
                  className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Description <span className="text-slate-500 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={categoryDescription}
                  onChange={e => setCategoryDescription(e.target.value)}
                  placeholder="Brief description"
                  className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={categorySaving || !categoryName.trim()}
                className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 font-medium"
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
          <div className="bg-slate-800 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
              <h3 className="text-lg font-semibold text-white">
                {editingResource ? 'Edit Resource' : 'Add Resource'}
              </h3>
              <button onClick={() => { setShowResourceModal(false); resetResourceForm(); }} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {(['file', 'link', 'page'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setResourceType(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors font-medium ${
                        resourceType === t
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700 hover:text-white'
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
                  className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">Description <span className="text-slate-500 font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={resourceDescription}
                  onChange={e => setResourceDescription(e.target.value)}
                  placeholder="Brief description"
                  className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
                />
              </div>
              {resourceType === 'file' && (
                <div>
                  <label className="text-sm font-medium text-slate-300 block mb-1.5">File</label>
                  <input
                    type="file"
                    onChange={e => setResourceFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600 file:transition-colors file:text-sm"
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
                    className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors"
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
                    className="w-full bg-slate-700/50 border border-slate-600/60 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
                  />
                </div>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={resourceIsPublic}
                  onChange={e => setResourceIsPublic(e.target.checked)}
                  className="rounded accent-blue-500"
                />
                <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Visible to all members</span>
              </label>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setShowResourceModal(false); resetResourceForm(); }} className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveResource}
                disabled={resourceSaving || !resourceTitle.trim()}
                className="px-4 py-2 text-sm bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 font-medium"
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

const SidebarItem: React.FC<{
  icon: React.ElementType;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  accent?: 'blue' | 'green';
}> = ({ icon: Icon, label, count, active, onClick, accent }) => {
  const accentColor = accent === 'green' ? 'text-green-400' : accent === 'blue' ? 'text-blue-400' : 'text-slate-400';
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
        active
          ? 'bg-slate-700/80 text-white border border-slate-600/60 shadow-sm'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
      }`}
    >
      <Icon size={14} className={active ? (accent ? accentColor : 'text-blue-400') : (accent ? accentColor : 'text-slate-500')} />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-slate-500">{count}</span>
      )}
    </button>
  );
};

// All Files overview
const AllFilesView: React.FC<{
  categories: ResourceStorage.ResourceCategory[];
  resources: ResourceStorage.AssociationResource[];
  filteredResources: ResourceStorage.AssociationResource[];
  viewMode: 'grid' | 'list';
  hasGoogleDrive: boolean;
  sharedCount: number;
  isClubContext: boolean;
  onSetSection: (s: string) => void;
  onOpenDrive: () => void;
  onNewFolder: () => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  onEditResource: (r: ResourceStorage.AssociationResource) => void;
  onDeleteResource: (r: ResourceStorage.AssociationResource) => void;
}> = ({ categories, resources, filteredResources, viewMode, hasGoogleDrive, sharedCount, isClubContext, onSetSection, onOpenDrive, onNewFolder, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, onEditResource, onDeleteResource }) => {
  return (
    <div className="space-y-6">
      {/* Storage sources */}
      {(hasGoogleDrive || (isClubContext && sharedCount > 0)) && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Connected Storage</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hasGoogleDrive && (
              <button
                onClick={onOpenDrive}
                className="flex items-center gap-3 p-4 bg-gradient-to-br from-slate-800/80 to-slate-700/40 border border-slate-700/50 hover:border-green-500/40 rounded-xl transition-all hover:shadow-lg hover:shadow-green-500/10 group text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                  <HardDrive size={20} className="text-green-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white">Google Drive</p>
                  <p className="text-xs text-slate-500">Browse connected Drive</p>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </button>
            )}
            {isClubContext && sharedCount > 0 && (
              <button
                onClick={() => onSetSection('shared')}
                className="flex items-center gap-3 p-4 bg-gradient-to-br from-slate-800/80 to-slate-700/40 border border-slate-700/50 hover:border-blue-500/40 rounded-xl transition-all hover:shadow-lg hover:shadow-blue-500/10 group text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white">Shared with Club</p>
                  <p className="text-xs text-slate-500">{sharedCount} resources from association</p>
                </div>
                <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Folders */}
      {categories.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Folders</p>
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
            : 'space-y-1'
          }>
            {categories.map(cat => {
              const count = resources.filter(r => r.category_id === cat.id).length;
              if (viewMode === 'grid') {
                return (
                  <button
                    key={cat.id}
                    onClick={() => onSetSection(cat.id)}
                    className="flex flex-col items-center gap-2 p-4 bg-gradient-to-br from-slate-800/70 to-slate-700/40 border border-slate-700/50 hover:border-amber-500/30 rounded-xl transition-all hover:shadow-lg hover:shadow-amber-500/10 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <FolderOpen size={24} className="text-amber-400" />
                    </div>
                    <p className="text-xs font-medium text-slate-300 group-hover:text-white text-center">{cat.name}</p>
                    <p className="text-xs text-slate-600">{count} item{count !== 1 ? 's' : ''}</p>
                  </button>
                );
              }
              return (
                <button
                  key={cat.id}
                  onClick={() => onSetSection(cat.id)}
                  className="flex items-center gap-3 px-4 py-3 bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 hover:bg-slate-700/30 rounded-xl transition-all group w-full text-left"
                >
                  <FolderOpen size={18} className="text-amber-400 flex-shrink-0" />
                  <span className="flex-1 text-sm text-slate-300 group-hover:text-white font-medium">{cat.name}</span>
                  {cat.description && <span className="text-xs text-slate-500 hidden sm:block">{cat.description}</span>}
                  <span className="text-xs text-slate-500">{count} item{count !== 1 ? 's' : ''}</span>
                  <ChevronRight size={13} className="text-slate-600 group-hover:text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* All resources flat list when searching */}
      {filteredResources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">All Files</p>
          <ResourceTable
            resources={filteredResources}
            getFileIcon={getFileIcon}
            getFileIconColor={getFileIconColor}
            formatFileSize={formatFileSize}
            formatDate={formatDate}
            onEdit={onEditResource}
            onDelete={onDeleteResource}
          />
        </div>
      )}

      {/* Empty */}
      {categories.length === 0 && !hasGoogleDrive && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
            <FolderOpen size={28} className="text-slate-600" />
          </div>
          <p className="text-slate-300 font-semibold mb-1">No resources yet</p>
          <p className="text-slate-500 text-sm mb-5">Create a folder to start organising your resources</p>
          <button
            onClick={onNewFolder}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-sm font-medium transition-all hover:scale-105"
          >
            <FolderPlus size={14} />
            New Folder
          </button>
        </div>
      )}
    </div>
  );
};

// Folder contents view
const FolderView: React.FC<{
  resources: ResourceStorage.AssociationResource[];
  viewMode: 'grid' | 'list';
  onAddResource: () => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  onEditResource: (r: ResourceStorage.AssociationResource) => void;
  onDeleteResource: (r: ResourceStorage.AssociationResource) => void;
}> = ({ resources, viewMode, onAddResource, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, onEditResource, onDeleteResource }) => {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
          <File size={28} className="text-slate-600" />
        </div>
        <p className="text-slate-300 font-semibold mb-1">No resources yet</p>
        <p className="text-slate-500 text-sm mb-5">Add files, links, or pages to this folder</p>
        <button
          onClick={onAddResource}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-sm font-medium transition-all hover:scale-105"
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
          const iconColor = getFileIconColor(r.file_type || r.resource_type);
          const bgColor = getFileBgColor(r.file_type || r.resource_type);
          return (
            <div key={r.id} className="group relative flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-slate-800/70 to-slate-700/40 border border-slate-700/50 hover:border-slate-600/70 hover:shadow-lg transition-all cursor-pointer"
              onClick={() => r.external_url ? window.open(r.external_url, '_blank') : r.file_url ? window.open(r.file_url, '_blank') : undefined}
            >
              <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>
                <Icon size={24} className={iconColor} />
              </div>
              <p className="text-xs font-medium text-slate-300 group-hover:text-white text-center line-clamp-2 w-full">{r.title}</p>
              {r.file_size && <p className="text-xs text-slate-600">{formatFileSize(r.file_size)}</p>}
              <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                <button onClick={e => { e.stopPropagation(); onEditResource(r); }} className="p-1 bg-slate-700/90 rounded hover:bg-slate-600 transition-colors">
                  <Edit2 size={10} className="text-slate-300" />
                </button>
                <button onClick={e => { e.stopPropagation(); onDeleteResource(r); }} className="p-1 bg-slate-700/90 rounded hover:bg-red-600/80 transition-colors">
                  <Trash2 size={10} className="text-slate-300" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ResourceTable
      resources={resources}
      getFileIcon={getFileIcon}
      getFileIconColor={getFileIconColor}
      formatFileSize={formatFileSize}
      formatDate={formatDate}
      onEdit={onEditResource}
      onDelete={onDeleteResource}
    />
  );
};

// Reusable resource table
const ResourceTable: React.FC<{
  resources: ResourceStorage.AssociationResource[];
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  onEdit?: (r: ResourceStorage.AssociationResource) => void;
  onDelete?: (r: ResourceStorage.AssociationResource) => void;
  readOnly?: boolean;
}> = ({ resources, getFileIcon, getFileIconColor, formatFileSize, formatDate, onEdit, onDelete, readOnly }) => (
  <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-700/50 bg-slate-900/30">
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-8"></th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Name</th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36 hidden sm:table-cell">Added</th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-24 hidden md:table-cell">Size</th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-24 hidden lg:table-cell">Type</th>
          {!readOnly && <th className="w-20 px-4 py-3"></th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-700/30">
        {resources.map(r => {
          const Icon = getFileIcon(r.file_type || r.resource_type);
          const iconColor = getFileIconColor(r.file_type || r.resource_type);
          const url = r.file_url || r.external_url;
          return (
            <tr
              key={r.id}
              className="hover:bg-slate-700/20 group transition-colors cursor-pointer"
              onClick={() => url && window.open(url, '_blank')}
            >
              <td className="px-4 py-3">
                <Icon size={16} className={iconColor} />
              </td>
              <td className="px-4 py-3">
                <div>
                  <p className="text-sm text-slate-200 group-hover:text-white font-medium transition-colors">{r.title}</p>
                  {r.description && <p className="text-xs text-slate-500 truncate max-w-xs mt-0.5">{r.description}</p>}
                </div>
              </td>
              <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">{formatDate(r.created_at)}</td>
              <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{formatFileSize(r.file_size)}</td>
              <td className="px-4 py-3 hidden lg:table-cell">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400 capitalize">
                  {r.resource_type === 'google_drive' ? 'Drive' : r.resource_type}
                </span>
              </td>
              {!readOnly && (
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="hidden group-hover:flex items-center justify-end gap-1">
                    {url && (
                      <button onClick={() => window.open(url, '_blank')} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors" title="Open">
                        <Eye size={12} />
                      </button>
                    )}
                    {onEdit && (
                      <button onClick={() => onEdit(r)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors" title="Edit">
                        <Edit2 size={12} />
                      </button>
                    )}
                    {onDelete && (
                      <button onClick={() => onDelete(r)} className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

// Shared resources view
const SharedResourcesView: React.FC<{
  resources: ResourceStorage.AssociationResource[];
  viewMode: 'grid' | 'list';
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
}> = ({ resources, viewMode, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate }) => {
  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
          <Users size={28} className="text-slate-600" />
        </div>
        <p className="text-slate-300 font-semibold mb-1">No shared resources</p>
        <p className="text-slate-500 text-sm">Your association hasn't shared any resources yet</p>
      </div>
    );
  }

  // Group by source
  const grouped: Record<string, ResourceStorage.AssociationResource[]> = {};
  for (const r of resources) {
    const key = (r as any).source_organization_name || 'Association';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([orgName, items]) => (
        <div key={orgName}>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={14} className="text-blue-400" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{orgName}</p>
            <span className="text-xs text-slate-600">({items.length})</span>
          </div>
          <ResourceTable
            resources={items}
            getFileIcon={getFileIcon}
            getFileIconColor={getFileIconColor}
            formatFileSize={formatFileSize}
            formatDate={formatDate}
            readOnly
          />
        </div>
      ))}
    </div>
  );
};

// Drive view with context menu
const DriveView: React.FC<{
  items: DriveItem[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  hasGoogleDrive: boolean;
  driveRootFolderId: string | null;
  onItemClick: (item: DriveItem) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  contextMenu: { item: DriveItem; x: number; y: number } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<{ item: DriveItem; x: number; y: number } | null>>;
}> = ({ items, loading, viewMode, hasGoogleDrive, driveRootFolderId, onItemClick, onDownload, onDelete, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, contextMenu, setContextMenu }) => {
  if (!hasGoogleDrive) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
          <HardDrive size={28} className="text-slate-600" />
        </div>
        <p className="text-slate-300 font-semibold mb-1">Google Drive not connected</p>
        <p className="text-slate-500 text-sm">Connect Google Drive in Settings → Integrations</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading Drive...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mb-4">
          <FolderOpen size={28} className="text-slate-600" />
        </div>
        <p className="text-slate-300 font-semibold mb-1">This folder is empty</p>
        <p className="text-slate-500 text-sm">Drag and drop files here to upload</p>
      </div>
    );
  }

  const folders = items.filter(i => i.isFolder);
  const files = items.filter(i => !i.isFolder);

  const handleRightClick = (e: React.MouseEvent, item: DriveItem) => {
    e.preventDefault();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  if (viewMode === 'grid') {
    return (
      <div className="space-y-6">
        {folders.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Folders</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {folders.map(item => (
                <DriveGridCard
                  key={item.id}
                  item={item}
                  onClick={onItemClick}
                  onRightClick={handleRightClick}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  getFileIcon={getFileIcon}
                  getFileIconColor={getFileIconColor}
                  getFileBgColor={getFileBgColor}
                  formatFileSize={formatFileSize}
                />
              ))}
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Files</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {files.map(item => (
                <DriveGridCard
                  key={item.id}
                  item={item}
                  onClick={onItemClick}
                  onRightClick={handleRightClick}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  getFileIcon={getFileIcon}
                  getFileIconColor={getFileIconColor}
                  getFileBgColor={getFileBgColor}
                  formatFileSize={formatFileSize}
                />
              ))}
            </div>
          </div>
        )}
        {contextMenu && (
          <DriveContextMenu
            item={contextMenu.item}
            x={contextMenu.x}
            y={contextMenu.y}
            onOpen={onItemClick}
            onDownload={onDownload}
            onDelete={onDelete}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50 bg-slate-900/30">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-8"></th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Name</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-36 hidden sm:table-cell">Modified</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-24 hidden md:table-cell">Size</th>
              <th className="w-24 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {[...folders, ...files].map(item => {
              const Icon = getFileIcon(item.mimeType, item.isFolder);
              const iconColor = getFileIconColor(item.mimeType, item.isFolder);
              return (
                <tr
                  key={item.id}
                  className="hover:bg-slate-700/20 group transition-colors cursor-pointer"
                  onClick={() => onItemClick(item)}
                  onContextMenu={e => handleRightClick(e, item)}
                >
                  <td className="px-4 py-3">
                    <Icon size={16} className={iconColor} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-slate-200 group-hover:text-white font-medium transition-colors">{item.name}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">{formatDate(item.modifiedTime)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{formatFileSize(item.size)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="hidden group-hover:flex items-center justify-end gap-1">
                      {!item.isFolder && (
                        <button onClick={() => onDownload(item)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors" title="Download">
                          <Download size={12} />
                        </button>
                      )}
                      <button onClick={() => window.open(item.webViewLink, '_blank')} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors" title="Open in Drive">
                        <ExternalLink size={12} />
                      </button>
                      <button onClick={() => onDelete(item)} className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-colors" title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {contextMenu && (
        <DriveContextMenu
          item={contextMenu.item}
          x={contextMenu.x}
          y={contextMenu.y}
          onOpen={onItemClick}
          onDownload={onDownload}
          onDelete={onDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

const DriveGridCard: React.FC<{
  item: DriveItem;
  onClick: (item: DriveItem) => void;
  onRightClick: (e: React.MouseEvent, item: DriveItem) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
}> = ({ item, onClick, onRightClick, onDownload, onDelete, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize }) => {
  const Icon = getFileIcon(item.mimeType, item.isFolder);
  const iconColor = getFileIconColor(item.mimeType, item.isFolder);
  const bgColor = getFileBgColor(item.mimeType, item.isFolder);
  return (
    <div
      className="group relative flex flex-col items-center gap-2 p-4 rounded-xl bg-gradient-to-br from-slate-800/70 to-slate-700/40 border border-slate-700/50 hover:border-slate-600/70 hover:shadow-lg transition-all cursor-pointer"
      onClick={() => onClick(item)}
      onContextMenu={e => onRightClick(e, item)}
    >
      <div className={`w-12 h-12 rounded-xl ${bgColor} flex items-center justify-center`}>
        <Icon size={24} className={iconColor} />
      </div>
      <p className="text-xs font-medium text-slate-300 group-hover:text-white text-center line-clamp-2 w-full">{item.name}</p>
      {!item.isFolder && item.size && <p className="text-xs text-slate-600">{formatFileSize(item.size)}</p>}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1" onClick={e => e.stopPropagation()}>
        {!item.isFolder && (
          <button onClick={() => onDownload(item)} className="p-1 bg-slate-700/90 rounded hover:bg-slate-600 transition-colors" title="Download">
            <Download size={10} className="text-slate-300" />
          </button>
        )}
        <button onClick={() => window.open(item.webViewLink, '_blank')} className="p-1 bg-slate-700/90 rounded hover:bg-slate-600 transition-colors" title="Open in Drive">
          <ExternalLink size={10} className="text-slate-300" />
        </button>
        <button onClick={() => onDelete(item)} className="p-1 bg-slate-700/90 rounded hover:bg-red-600/80 transition-colors" title="Delete">
          <Trash2 size={10} className="text-slate-300" />
        </button>
      </div>
    </div>
  );
};

const DriveContextMenu: React.FC<{
  item: DriveItem;
  x: number;
  y: number;
  onOpen: (item: DriveItem) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onClose: () => void;
}> = ({ item, x, y, onOpen, onDownload, onDelete, onClose }) => {
  return (
    <div
      className="fixed z-[9999] bg-slate-800 border border-slate-700/60 rounded-xl shadow-2xl py-1 min-w-[180px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
        onClick={() => { onOpen(item); onClose(); }}
      >
        {item.isFolder ? <FolderOpen size={14} /> : <Eye size={14} />}
        {item.isFolder ? 'Open folder' : 'Open file'}
      </button>
      {!item.isFolder && (
        <button
          className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
          onClick={() => { onDownload(item); onClose(); }}
        >
          <Download size={14} />
          Download
        </button>
      )}
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
        onClick={() => { window.open(item.webViewLink, '_blank'); onClose(); }}
      >
        <ExternalLink size={14} />
        Open in Google Drive
      </button>
      <div className="border-t border-slate-700/50 my-1" />
      <button
        className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors"
        onClick={() => { onDelete(item); onClose(); }}
      >
        <Trash2 size={14} />
        Delete
      </button>
    </div>
  );
};
