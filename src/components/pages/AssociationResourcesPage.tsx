import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FolderOpen, Plus, SquarePen as Edit2, Trash2, FileText, Search, Grid2x2 as Grid, List, HardDrive, RefreshCw, ChevronRight, Hop as Home, Upload, File, Image as ImageIcon, Music, Film, Archive, FolderPlus, CloudUpload as UploadCloud, Eye, Download, ExternalLink, MoveVertical as MoreVertical, X, Building2, Users, Cloud } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import * as ResourceStorage from '../../utils/associationResourceStorage';
import { supabase } from '../../utils/supabase';

interface ResourcesPageProps {
  darkMode: boolean;
}

type SectionType = 'all' | 'drive' | 'dropbox' | 'shared' | string;

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
  const [driveOrgId, setDriveOrgId] = useState<string | null>(null);
  const [driveOrgType, setDriveOrgType] = useState<string>('club');

  // Dropbox
  const [hasDropbox, setHasDropbox] = useState(false);
  const [dropboxRootPath, setDropboxRootPath] = useState<string>('/AlfiePRO Resources');
  const [dropboxItems, setDropboxItems] = useState<DriveItem[]>([]);
  const [loadingDropbox, setLoadingDropbox] = useState(false);
  const [dropboxBreadcrumbs, setDropboxBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [currentDropboxPath, setCurrentDropboxPath] = useState<string | null>(null);
  const [dropboxOrgId, setDropboxOrgId] = useState<string | null>(null);
  const [dropboxOrgType, setDropboxOrgType] = useState<string>('club');

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ item: DriveItem; x: number; y: number } | null>(null);

  // Drive rename modal
  const [driveRenameItem, setDriveRenameItem] = useState<DriveItem | null>(null);
  const [driveRenameName, setDriveRenameName] = useState('');
  const [driveRenaming, setDriveRenaming] = useState(false);

  // Drive new folder modal
  const [showDriveNewFolderModal, setShowDriveNewFolderModal] = useState(false);
  const [driveNewFolderName, setDriveNewFolderName] = useState('');
  const [driveNewFolderCreating, setDriveNewFolderCreating] = useState(false);

  // In-app confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Drag & drop for local resource moving
  const [draggedResource, setDraggedResource] = useState<ResourceStorage.AssociationResource | null>(null);
  const [draggedCategory, setDraggedCategory] = useState<ResourceStorage.ResourceCategory | null>(null);
  const [dropTargetCatId, setDropTargetCatId] = useState<string | null>(null);

  // Drag & drop for Google Drive items
  const [draggedDriveItem, setDraggedDriveItem] = useState<DriveItem | null>(null);
  const [dropTargetDriveFolderId, setDropTargetDriveFolderId] = useState<string | null>(null);

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  };

  const handleDropOnCategory = async (targetCatId: string) => {
    if (draggedResource && draggedResource.category_id !== targetCatId) {
      try {
        await ResourceStorage.updateResource(draggedResource.id, { category_id: targetCatId });
        addNotification(`"${draggedResource.title}" moved`, 'success');
        loadAll();
      } catch {
        addNotification('Failed to move resource', 'error');
      }
    }
    setDraggedResource(null);
    setDraggedCategory(null);
    setDropTargetCatId(null);
  };

  const handleDriveDropOnFolder = async (targetFolderId: string) => {
    if (!draggedDriveItem || draggedDriveItem.id === targetFolderId) {
      setDraggedDriveItem(null);
      setDropTargetDriveFolderId(null);
      return;
    }
    try {
      await callDriveApi({
        action: 'move_file',
        organizationId: driveOrgId || organizationId,
        organizationType: driveOrgType || organizationType,
        fileId: draggedDriveItem.id,
        targetFolderId,
        currentParentId: currentDriveFolderId,
      });
      addNotification(`"${draggedDriveItem.name}" moved`, 'success');
      if (currentDriveFolderId) browseDriveFolder(currentDriveFolderId);
    } catch (err: any) {
      addNotification(err.message || 'Failed to move file', 'error');
    }
    setDraggedDriveItem(null);
    setDropTargetDriveFolderId(null);
  };

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
    if (organizationId) loadAll(true);
  }, [organizationId, organizationType, currentClub?.clubId]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        checkGoogleDrive();
        checkDropbox();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [organizationId, currentClub?.clubId]);

  useEffect(() => {
    if (activeSection === 'drive' && hasGoogleDrive && driveItems.length === 0) {
      const rootId = driveRootFolderId || 'root';
      browseDriveFolder(rootId, undefined, true);
    }
  }, [activeSection, hasGoogleDrive]);

  useEffect(() => {
    if (activeSection === 'dropbox' && hasDropbox && dropboxItems.length === 0) {
      browseDropboxFolder(dropboxRootPath, undefined, true);
    }
  }, [activeSection, hasDropbox]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const loadAll = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
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
      await checkDropbox();
    } catch (err) {
      console.error('Error loading resources:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkGoogleDrive = async (): Promise<boolean> => {
    const lookups: { column: string; id: string; type: string }[] = [];

    if (organizationType === 'club' && organizationId) {
      lookups.push({ column: 'club_id', id: organizationId, type: 'club' });
    } else if (organizationId) {
      const assocColumn = organizationType === 'state' ? 'state_association_id' : 'national_association_id';
      lookups.push({ column: assocColumn, id: organizationId, type: organizationType });
      if (currentClub?.clubId) {
        lookups.push({ column: 'club_id', id: currentClub.clubId, type: 'club' });
      }
    } else if (currentClub?.clubId) {
      lookups.push({ column: 'club_id', id: currentClub.clubId, type: 'club' });
    }

    if (lookups.length === 0) {
      setHasGoogleDrive(false);
      return false;
    }

    try {
      for (const lookup of lookups) {
        const { data: allIntegrations, error } = await supabase
          .from('integrations')
          .select('id, platform, is_active, credentials')
          .eq(lookup.column, lookup.id);

        if (error) continue;

        const driveIntegration = (allIntegrations || []).find(
          i => i.platform === 'google_drive' && i.is_active && i.credentials?.refresh_token
        );

        if (driveIntegration) {
          setHasGoogleDrive(true);
          setDriveOrgId(lookup.id);
          setDriveOrgType(lookup.type);
          if (driveIntegration.credentials?.folder_id) {
            setDriveRootFolderId(driveIntegration.credentials.folder_id);
          }
          return true;
        }
      }

      setHasGoogleDrive(false);
      return false;
    } catch (err) {
      console.warn('checkGoogleDrive error:', err);
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

  const checkDropbox = async (): Promise<boolean> => {
    const lookups: { column: string; id: string; type: string }[] = [];

    if (organizationType === 'club' && organizationId) {
      lookups.push({ column: 'club_id', id: organizationId, type: 'club' });
    } else if (organizationId) {
      const assocColumn = organizationType === 'state' ? 'state_association_id' : 'national_association_id';
      lookups.push({ column: assocColumn, id: organizationId, type: organizationType });
      if (currentClub?.clubId) {
        lookups.push({ column: 'club_id', id: currentClub.clubId, type: 'club' });
      }
    } else if (currentClub?.clubId) {
      lookups.push({ column: 'club_id', id: currentClub.clubId, type: 'club' });
    }

    if (lookups.length === 0) {
      setHasDropbox(false);
      return false;
    }

    try {
      for (const lookup of lookups) {
        const { data: allIntegrations, error } = await supabase
          .from('integrations')
          .select('id, platform, is_active, credentials')
          .eq(lookup.column, lookup.id);

        if (error) continue;

        const dropboxIntegration = (allIntegrations || []).find(
          i => i.platform === 'dropbox' && i.is_active && i.credentials?.refresh_token
        );

        if (dropboxIntegration) {
          setHasDropbox(true);
          setDropboxOrgId(lookup.id);
          setDropboxOrgType(lookup.type);
          if (dropboxIntegration.credentials?.root_folder_path) {
            setDropboxRootPath(dropboxIntegration.credentials.root_folder_path);
          }
          return true;
        }
      }

      setHasDropbox(false);
      return false;
    } catch (err) {
      console.warn('checkDropbox error:', err);
      setHasDropbox(false);
      return false;
    }
  };

  const callDropboxApi = async (body: object) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-dropbox-files`,
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
      throw new Error(err.error || 'Dropbox API error');
    }
    return res.json();
  };

  const browseDropboxFolder = async (folderPath: string, folderName?: string, resetBreadcrumbs = false) => {
    setLoadingDropbox(true);
    try {
      const data = await callDropboxApi({
        action: 'list_folder',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        folderPath,
      });
      const items: DriveItem[] = (data.files || []).map((f: any) => ({
        id: f.path || f.id,
        name: f.name,
        mimeType: f.mimeType || (f.isFolder ? 'application/vnd.dropbox.folder' : 'application/octet-stream'),
        modifiedTime: f.modifiedTime,
        size: f.size ? String(f.size) : undefined,
        isFolder: f.isFolder,
      }));
      setDropboxItems(items);
      setCurrentDropboxPath(folderPath);
      if (resetBreadcrumbs) {
        setDropboxBreadcrumbs([]);
      } else if (folderName) {
        setDropboxBreadcrumbs(prev => [...prev, { id: folderPath, name: folderName }]);
      }
    } catch (err: any) {
      addNotification(err.message || 'Failed to load Dropbox folder', 'error');
    } finally {
      setLoadingDropbox(false);
    }
  };

  const navigateDropboxTo = async (index: number) => {
    const newCrumbs = dropboxBreadcrumbs.slice(0, index);
    setDropboxBreadcrumbs(newCrumbs);
    const targetPath = index === 0
      ? dropboxRootPath
      : dropboxBreadcrumbs[index - 1].id;
    setLoadingDropbox(true);
    try {
      const data = await callDropboxApi({
        action: 'list_folder',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        folderPath: targetPath,
      });
      setDropboxItems((data.files || []).map((f: any) => ({
        id: f.path || f.id,
        name: f.name,
        mimeType: f.mimeType || (f.isFolder ? 'application/vnd.dropbox.folder' : 'application/octet-stream'),
        modifiedTime: f.modifiedTime,
        size: f.size ? String(f.size) : undefined,
        isFolder: f.isFolder,
      })));
      setCurrentDropboxPath(targetPath);
    } finally {
      setLoadingDropbox(false);
    }
  };

  const handleDropboxItemClick = async (item: DriveItem) => {
    if (item.isFolder) {
      browseDropboxFolder(item.id, item.name);
    } else {
      try {
        const data = await callDropboxApi({
          action: 'get_download_link',
          organizationId: dropboxOrgId || organizationId,
          organizationType: dropboxOrgType || organizationType,
          filePath: item.id,
        });
        if (data.link) window.open(data.link, '_blank');
      } catch (err: any) {
        addNotification(err.message || 'Failed to open file', 'error');
      }
    }
  };

  const handleDropboxDownload = async (item: DriveItem) => {
    try {
      const data = await callDropboxApi({
        action: 'get_download_link',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        filePath: item.id,
      });
      if (data.link) window.open(data.link, '_blank');
    } catch (err: any) {
      addNotification(err.message || 'Failed to download file', 'error');
    }
  };

  const handleDropboxDelete = (item: DriveItem) => {
    showConfirm(
      `Delete "${item.name}" from Dropbox?`,
      async () => {
        try {
          await callDropboxApi({
            action: item.isFolder ? 'delete_folder' : 'delete_file',
            organizationId: dropboxOrgId || organizationId,
            organizationType: dropboxOrgType || organizationType,
            filePath: item.id,
            folderPath: item.isFolder ? item.id : undefined,
          });
          addNotification(`"${item.name}" deleted`, 'success');
          if (currentDropboxPath) browseDropboxFolder(currentDropboxPath);
        } catch (err: any) {
          addNotification(err.message || 'Failed to delete file', 'error');
        }
      }
    );
  };

  const handleDropboxRename = async (item: DriveItem, newName: string) => {
    try {
      await callDropboxApi({
        action: 'rename_file',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        filePath: item.id,
        newName: newName.trim(),
      });
      addNotification(`Renamed to "${newName.trim()}"`, 'success');
      if (currentDropboxPath) browseDropboxFolder(currentDropboxPath);
    } catch (err: any) {
      addNotification(err.message || 'Failed to rename', 'error');
    }
  };

  const handleDropboxMove = async (item: DriveItem, targetFolderPath: string) => {
    try {
      await callDropboxApi({
        action: 'move_file',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        filePath: item.id,
        targetFolderPath,
      });
      addNotification(`"${item.name}" moved`, 'success');
      if (currentDropboxPath) browseDropboxFolder(currentDropboxPath);
    } catch (err: any) {
      addNotification(err.message || 'Failed to move file', 'error');
    }
  };

  const handleCreateDropboxFolder = async (folderName: string) => {
    if (!folderName.trim() || !currentDropboxPath) return;
    try {
      await callDropboxApi({
        action: 'create_folder',
        organizationId: dropboxOrgId || organizationId,
        organizationType: dropboxOrgType || organizationType,
        folderName: folderName.trim(),
        parentPath: currentDropboxPath,
      });
      addNotification(`Folder "${folderName.trim()}" created in Dropbox`, 'success');
      browseDropboxFolder(currentDropboxPath);
    } catch (err: any) {
      addNotification(err.message || 'Failed to create folder', 'error');
    }
  };

  const uploadFilesToDropbox = async (files: File[], folderPath: string) => {
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
        await callDropboxApi({
          action: 'upload_file',
          organizationId: dropboxOrgId || organizationId,
          organizationType: dropboxOrgType || organizationType,
          fileName: file.name,
          fileData: fileData.split(',')[1],
          folderPath,
        });
        uploaded++;
      } catch (err: any) {
        addNotification(`Failed to upload ${file.name}: ${err.message}`, 'error');
      }
    }
    setUploading(false);
    if (uploaded > 0) {
      addNotification(`Uploaded ${uploaded} file${uploaded > 1 ? 's' : ''} to Dropbox`, 'success');
      browseDropboxFolder(folderPath);
    }
  };

  const handleOpenDropbox = () => {
    setActiveSection('dropbox');
  };

  const browseDriveFolder = async (folderId: string, folderName?: string, resetBreadcrumbs = false) => {
    setLoadingDrive(true);
    try {
      const data = await callDriveApi({
        action: 'list_folder',
        organizationId: driveOrgId || organizationId,
        organizationType: driveOrgType || organizationType,
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
        organizationId: driveOrgId || organizationId,
        organizationType: driveOrgType || organizationType,
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

  const handleDriveDelete = (item: DriveItem) => {
    showConfirm(
      `Delete "${item.name}" from Google Drive?`,
      async () => {
        try {
          await callDriveApi({
            action: 'delete_file',
            organizationId: driveOrgId || organizationId,
            organizationType: driveOrgType || organizationType,
            fileId: item.id,
          });
          addNotification(`"${item.name}" deleted`, 'success');
          if (currentDriveFolderId) browseDriveFolder(currentDriveFolderId);
        } catch (err: any) {
          addNotification(err.message || 'Failed to delete file', 'error');
        }
      }
    );
  };

  const handleDriveRename = async () => {
    if (!driveRenameItem || !driveRenameName.trim()) return;
    setDriveRenaming(true);
    try {
      await callDriveApi({
        action: 'rename_file',
        organizationId: driveOrgId || organizationId,
        organizationType: driveOrgType || organizationType,
        fileId: driveRenameItem.id,
        newName: driveRenameName.trim(),
      });
      addNotification(`Renamed to "${driveRenameName.trim()}"`, 'success');
      setDriveRenameItem(null);
      setDriveRenameName('');
      if (currentDriveFolderId) browseDriveFolder(currentDriveFolderId);
    } catch (err: any) {
      addNotification(err.message || 'Failed to rename', 'error');
    } finally {
      setDriveRenaming(false);
    }
  };

  const openDriveRename = (item: DriveItem) => {
    setDriveRenameItem(item);
    setDriveRenameName(item.name);
  };

  const handleCreateDriveFolder = async () => {
    if (!driveNewFolderName.trim() || !currentDriveFolderId) return;
    setDriveNewFolderCreating(true);
    try {
      await callDriveApi({
        action: 'create_folder',
        organizationId: driveOrgId || organizationId,
        organizationType: driveOrgType || organizationType,
        folderName: driveNewFolderName.trim(),
        parentFolderId: currentDriveFolderId,
      });
      addNotification(`Folder "${driveNewFolderName.trim()}" created in Google Drive`, 'success');
      setShowDriveNewFolderModal(false);
      setDriveNewFolderName('');
      browseDriveFolder(currentDriveFolderId);
    } catch (err: any) {
      addNotification(err.message || 'Failed to create folder', 'error');
    } finally {
      setDriveNewFolderCreating(false);
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
    } else if (activeSection === 'dropbox' && hasDropbox && currentDropboxPath) {
      await uploadFilesToDropbox(files, currentDropboxPath);
    } else if (activeSection !== 'drive' && activeSection !== 'dropbox' && activeSection !== 'all' && activeSection !== 'shared') {
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
          organizationId: driveOrgId || organizationId,
          organizationType: driveOrgType || organizationType,
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
      await loadAll();
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
      await loadAll();
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

  const handleDeleteCategory = (catId: string) => {
    showConfirm(
      'Delete this folder and all its resources?',
      async () => {
        try {
          const catResources = await ResourceStorage.fetchResources(catId);
          for (const r of catResources) {
            if (r.file_url) await ResourceStorage.deleteResourceFile(r.file_url);
            await ResourceStorage.deleteResource(r.id);
          }
          await ResourceStorage.deleteResourceCategory(catId);
          if (activeSection === catId) setActiveSection('all');
          addNotification('Folder deleted', 'success');
          await loadAll();
        } catch {
          addNotification('Failed to delete folder', 'error');
        }
      }
    );
  };

  const handleSaveResource = async () => {
    if (!resourceTitle.trim() || activeSection === 'all' || activeSection === 'drive' || activeSection === 'dropbox' || activeSection === 'shared') return;
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
      await loadAll();
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

  const handleDeleteResource = (resource: ResourceStorage.AssociationResource) => {
    showConfirm(
      `Delete "${resource.title}"?`,
      async () => {
        try {
          if (resource.file_url) await ResourceStorage.deleteResourceFile(resource.file_url);
          await ResourceStorage.deleteResource(resource.id);
          addNotification('Resource deleted', 'success');
          await loadAll();
        } catch {
          addNotification('Failed to delete resource', 'error');
        }
      }
    );
  };

  const getFileIcon = (mimeType?: string, isFolder?: boolean) => {
    if (isFolder) return FolderOpen;
    if (!mimeType) return File;
    if (mimeType.startsWith('image/')) return ImageIcon;
    if (mimeType.startsWith('audio/')) return Music;
    if (mimeType.startsWith('video/')) return Film;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return FileText;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return Archive;
    if (mimeType === 'application/vnd.google-apps.folder' || mimeType === 'application/vnd.dropbox.folder') return FolderOpen;
    if (mimeType.startsWith('application/vnd.google-apps.')) return FileText;
    return File;
  };

  const getFileIconColor = (mimeType?: string, isFolder?: boolean) => {
    if (isFolder || mimeType === 'application/vnd.google-apps.folder' || mimeType === 'application/vnd.dropbox.folder') return 'text-amber-400';
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
    if (isFolder || mimeType === 'application/vnd.google-apps.folder' || mimeType === 'application/vnd.dropbox.folder') return 'bg-amber-500/15';
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
  const isDropboxSection = activeSection === 'dropbox';
  const isAllSection = activeSection === 'all';
  const isSharedSection = activeSection === 'shared';
  const isCloudSection = isDriveSection || isDropboxSection;
  const currentCategory = categories.find(c => c.id === activeSection);

  const categoryResources = isAllSection
    ? resources
    : (!isCloudSection && !isSharedSection)
    ? resources.filter(r => r.category_id === activeSection)
    : [];

  const filteredResources = categoryResources.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDriveItems = driveItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDropboxItems = dropboxItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSharedResources = sharedResources.filter(r =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-[22px] h-full p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-9 lg:pl-9">
      {/* Page Header */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><FolderOpen size={24} /></span>
          <div className="flex-1 min-w-[220px]">
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Documents</h1>
            <p className="a-mute mt-1 text-[14.5px]">
              {isClubContext ? 'Manage club documents and access shared association resources' : 'Manage and share resources with your members'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isCloudSection && !isAllSection && !isSharedSection && (
              <button
                onClick={() => { resetResourceForm(); setShowResourceModal(true); }}
                className="a-btn a-btn-p" style={{ height: 42, borderRadius: 13 }}
              >
                <Plus size={17} />
                Add resource
              </button>
            )}
            {isDriveSection && currentDriveFolderId && (
              <label className="a-btn a-btn-p cursor-pointer" style={{ height: 42, borderRadius: 13 }}>
                <Upload size={17} />
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
            {isDropboxSection && currentDropboxPath && (
              <label className="a-btn a-btn-p cursor-pointer" style={{ height: 42, borderRadius: 13 }}>
                <Upload size={17} />
                Upload
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length && currentDropboxPath) {
                      await uploadFilesToDropbox(files, currentDropboxPath);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}
            {isDriveSection && currentDriveFolderId ? (
              <button
                onClick={() => { setDriveNewFolderName(''); setShowDriveNewFolderModal(true); }}
                className="a-btn"
              >
                <FolderPlus size={16} />
                New folder
              </button>
            ) : isDropboxSection && currentDropboxPath ? (
              <button
                onClick={() => { setDriveNewFolderName(''); setShowDriveNewFolderModal(true); }}
                className="a-btn"
              >
                <FolderPlus size={16} />
                New folder
              </button>
            ) : !isCloudSection && (
              <button
                onClick={() => { resetCategoryForm(); setShowCategoryModal(true); }}
                className="a-btn"
              >
                <FolderPlus size={16} />
                New folder
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-4">
        {/* Sidebar */}
        <aside className="a-card lg:w-[260px] flex-shrink-0 self-start flex flex-col overflow-y-auto lg:max-h-full" style={{ padding: 12 }}>
          <nav className="flex flex-col gap-0.5 flex-1">
            <p className="a-cap" style={{ padding: '6px 10px' }}>Library</p>
            {/* All Files */}
            <SidebarItem
              icon={Home}
              label="All files"
              count={resources.length}
              active={isAllSection}
              onClick={() => setActiveSection('all')}
            />

            {(hasGoogleDrive || hasDropbox) && <p className="a-cap" style={{ padding: '14px 10px 6px' }}>Connected</p>}
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

            {/* Dropbox */}
            {hasDropbox && (
              <SidebarItem
                icon={Cloud}
                label="Dropbox"
                active={isDropboxSection}
                onClick={handleOpenDropbox}
                accent="blue"
              />
            )}

            {/* Shared from association */}
            {isClubContext && sharedResources.length > 0 && (
              <SidebarItem
                icon={Building2}
                label="Shared with club"
                count={sharedResources.length}
                active={isSharedSection}
                onClick={() => setActiveSection('shared')}
                accent="blue"
              />
            )}

            {categories.length > 0 && (
              <p className="a-cap" style={{ padding: '14px 10px 6px' }}>Folders</p>
            )}

            {categories.map(cat => (
              <div
                key={cat.id}
                className={`group relative flex items-center gap-0.5 rounded-[12px] transition-all ${
                  dropTargetCatId === cat.id ? 'a-drop-target' : ''
                }`}
                onDragOver={e => { if (draggedResource || draggedCategory) { e.preventDefault(); setDropTargetCatId(cat.id); } }}
                onDragLeave={() => setDropTargetCatId(null)}
                onDrop={e => { e.preventDefault(); handleDropOnCategory(cat.id); }}
              >
                <button
                  onClick={() => setActiveSection(cat.id)}
                  className={`a-lib flex-1 min-w-0 ${activeSection === cat.id ? 'a-lib-on' : ''}`}
                >
                  <FolderOpen size={17} className="flex-shrink-0 a-txt-a" />
                  <span className="flex-1 truncate text-left">{cat.name}</span>
                  <span className="a-cnt group-hover:invisible">
                    {resources.filter(r => r.category_id === cat.id).length}
                  </span>
                </button>
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center invisible group-hover:visible">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setEditingCategory(cat);
                      setCategoryName(cat.name);
                      setCategoryDescription(cat.description || '');
                      setShowCategoryModal(true);
                    }}
                    className="a-ib" style={{ width: 28, height: 28 }}
                    title="Rename folder"
                    aria-label="Rename folder"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                    className="a-ib a-ib-d" style={{ width: 28, height: 28 }}
                    title="Delete folder"
                    aria-label="Delete folder"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content area */}
        <div
          ref={dropZoneRef}
          className="flex-1 flex flex-col min-h-0 min-w-0 transition-colors relative gap-4"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Toolbar bar */}
          <div className="flex-shrink-0 flex flex-wrap items-center gap-2.5">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px] text-[15px]">
              {isDriveSection ? (
                <>
                  <button
                    onClick={() => navigateDriveTo(0)}
                    className="flex items-center gap-1.5 a-mute"
                  >
                    <HardDrive size={16} className="a-txt-g" />
                    <span className={driveBreadcrumbs.length === 0 ? 'a-display a-ink text-[20px] font-semibold' : ''}>Google Drive</span>
                  </button>
                  {driveBreadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight size={15} className="a-dim flex-shrink-0" />
                      <button
                        onClick={() => navigateDriveTo(i + 1)}
                        className={`truncate max-w-[180px] ${i === driveBreadcrumbs.length - 1 ? 'a-display a-ink text-[20px] font-semibold' : 'a-mute'}`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </>
              ) : isDropboxSection ? (
                <>
                  <button
                    onClick={() => navigateDropboxTo(0)}
                    className="flex items-center gap-1.5 a-mute"
                  >
                    <Cloud size={16} className="a-txt-b" />
                    <span className={dropboxBreadcrumbs.length === 0 ? 'a-display a-ink text-[20px] font-semibold' : ''}>Dropbox</span>
                  </button>
                  {dropboxBreadcrumbs.map((crumb, i) => (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight size={15} className="a-dim flex-shrink-0" />
                      <button
                        onClick={() => navigateDropboxTo(i + 1)}
                        className={`truncate max-w-[180px] ${i === dropboxBreadcrumbs.length - 1 ? 'a-display a-ink text-[20px] font-semibold' : 'a-mute'}`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <span className="a-display a-ink text-[20px] font-semibold">
                  {isAllSection ? 'All files' : isSharedSection ? 'Shared with club' : (currentCategory?.name || 'Resources')}
                </span>
              )}
              {!isCloudSection && (
                <span className="a-cnt ml-1">
                  {isSharedSection ? filteredSharedResources.length : filteredResources.length}
                </span>
              )}
              {isDriveSection && !loadingDrive && (
                <span className="a-cnt ml-1">{filteredDriveItems.length}</span>
              )}
              {isDropboxSection && !loadingDropbox && (
                <span className="a-cnt ml-1">{filteredDropboxItems.length}</span>
              )}
            </div>

            {/* Search */}
            <label className="a-field" style={{ width: 320, maxWidth: '100%' }}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search files"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </label>

            {/* View toggle */}
            <div className="a-seg" role="radiogroup" aria-label="Layout">
              <button onClick={() => setViewMode('list')} className={`a-seg-i ${viewMode === 'list' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="List view" title="List view">
                <List size={17} />
              </button>
              <button onClick={() => setViewMode('grid')} className={`a-seg-i ${viewMode === 'grid' ? 'a-seg-on' : ''}`} style={{ padding: '0 10px' }} aria-label="Grid view" title="Grid view">
                <Grid size={17} />
              </button>
            </div>

            {isDriveSection && (
              <button
                onClick={() => currentDriveFolderId && browseDriveFolder(currentDriveFolderId)}
                disabled={loadingDrive}
                className="a-ib disabled:opacity-50"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw size={17} className={loadingDrive ? 'animate-spin' : ''} />
              </button>
            )}
            {isDropboxSection && (
              <button
                onClick={() => currentDropboxPath && browseDropboxFolder(currentDropboxPath)}
                disabled={loadingDropbox}
                className="a-ib disabled:opacity-50"
                title="Refresh"
                aria-label="Refresh"
              >
                <RefreshCw size={17} className={loadingDropbox ? 'animate-spin' : ''} />
              </button>
            )}
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
              <div className="a-dropzone absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <UploadCloud size={44} className="mx-auto mb-3 a-txt-b" />
                  <p className="a-ink font-semibold text-[17px]">Drop files to upload</p>
                  <p className="a-dim text-[13px] mt-1">
                    {activeSection === 'drive' ? 'Upload to Google Drive' : activeSection === 'dropbox' ? 'Upload to Dropbox' : 'Upload to folder'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="a-note flex-shrink-0 flex items-center gap-2.5">
              <RefreshCw size={15} className="animate-spin a-txt-b" />
              <span className="a-ink text-[13.5px] font-medium">Uploading files…</span>
            </div>
          )}

          {/* Main scroll area */}
          <div className="flex-1 overflow-y-auto pb-4">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                  <p className="a-dim text-[13.5px]">Loading documents…</p>
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
                onRename={openDriveRename}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                draggedDriveItem={draggedDriveItem}
                onDragStartDriveItem={setDraggedDriveItem}
                onDragEndDriveItem={() => { setDraggedDriveItem(null); setDropTargetDriveFolderId(null); }}
                dropTargetDriveFolderId={dropTargetDriveFolderId}
                onDropOnDriveFolder={handleDriveDropOnFolder}
                onDragOverDriveFolder={setDropTargetDriveFolderId}
              />
            ) : isDropboxSection ? (
              <DriveView
                items={filteredDropboxItems}
                loading={loadingDropbox}
                viewMode={viewMode}
                hasGoogleDrive={hasDropbox}
                driveRootFolderId={dropboxRootPath}
                onItemClick={handleDropboxItemClick}
                onDownload={handleDropboxDownload}
                onDelete={handleDropboxDelete}
                onRename={(item) => {
                  setDriveRenameItem(item);
                  setDriveRenameName(item.name);
                }}
                getFileIcon={getFileIcon}
                getFileIconColor={getFileIconColor}
                getFileBgColor={getFileBgColor}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
                contextMenu={contextMenu}
                setContextMenu={setContextMenu}
                draggedDriveItem={draggedDriveItem}
                onDragStartDriveItem={setDraggedDriveItem}
                onDragEndDriveItem={() => { setDraggedDriveItem(null); setDropTargetDriveFolderId(null); }}
                dropTargetDriveFolderId={dropTargetDriveFolderId}
                onDropOnDriveFolder={async (targetPath) => {
                  if (draggedDriveItem && draggedDriveItem.id !== targetPath) {
                    await handleDropboxMove(draggedDriveItem, targetPath);
                  }
                  setDraggedDriveItem(null);
                  setDropTargetDriveFolderId(null);
                }}
                onDragOverDriveFolder={setDropTargetDriveFolderId}
                providerLabel="Dropbox"
                providerIcon={Cloud}
                providerAccentColor="blue"
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
                hasDropbox={hasDropbox}
                sharedCount={sharedResources.length}
                isClubContext={isClubContext}
                onSetSection={setActiveSection}
                onOpenDrive={handleOpenDrive}
                onOpenDropbox={handleOpenDropbox}
                onNewFolder={() => { resetCategoryForm(); setShowCategoryModal(true); }}
                onEditCategory={(cat) => {
                  setEditingCategory(cat);
                  setCategoryName(cat.name);
                  setCategoryDescription(cat.description || '');
                  setShowCategoryModal(true);
                }}
                onDeleteCategory={handleDeleteCategory}
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
                draggedResource={draggedResource}
                onDragStartResource={setDraggedResource}
                onDragEndResource={() => { setDraggedResource(null); setDropTargetCatId(null); }}
                dropTargetCatId={dropTargetCatId}
                onDropOnCategory={handleDropOnCategory}
                onDragOverCategory={setDropTargetCatId}
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
                onDragStartResource={setDraggedResource}
                onDragEndResource={() => { setDraggedResource(null); setDropTargetCatId(null); }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Category modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="a-sheet w-full max-w-md">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="a-display a-ink text-[19px] font-semibold">
                {editingCategory ? 'Rename Folder' : 'New Folder'}
              </h3>
              <button onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }} className="a-ib" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="a-flab">Folder Name</label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  placeholder="e.g. Race Documents, Minutes..."
                  className="a-inp w-full"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                />
              </div>
              <div>
                <label className="a-flab">Description <span className="a-dim font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={categoryDescription}
                  onChange={e => setCategoryDescription(e.target.value)}
                  placeholder="Brief description"
                  className="a-inp w-full"
                />
              </div>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setShowCategoryModal(false); resetCategoryForm(); }} className="a-btn">
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={categorySaving || !categoryName.trim()}
                className="a-btn a-btn-p disabled:opacity-50"
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
          <div className="a-sheet w-full max-w-lg">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="a-display a-ink text-[19px] font-semibold">
                {editingResource ? 'Edit Resource' : 'Add Resource'}
              </h3>
              <button onClick={() => { setShowResourceModal(false); resetResourceForm(); }} className="a-ib" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="a-flab">Type</label>
                <div className="a-seg" style={{ display: 'flex' }}>
                  {(['file', 'link', 'page'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setResourceType(t)}
                      className={`a-seg-i flex-1 justify-center capitalize ${resourceType === t ? 'a-seg-on' : ''}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="a-flab">Title</label>
                <input
                  type="text"
                  value={resourceTitle}
                  onChange={e => setResourceTitle(e.target.value)}
                  placeholder="Resource title"
                  className="a-inp w-full"
                  autoFocus
                />
              </div>
              <div>
                <label className="a-flab">Description <span className="a-dim font-normal">(optional)</span></label>
                <input
                  type="text"
                  value={resourceDescription}
                  onChange={e => setResourceDescription(e.target.value)}
                  placeholder="Brief description"
                  className="a-inp w-full"
                />
              </div>
              {resourceType === 'file' && (
                <div>
                  <label className="a-flab">File</label>
                  <input
                    type="file"
                    onChange={e => setResourceFile(e.target.files?.[0] || null)}
                    className="a-file w-full text-[13px]"
                  />
                </div>
              )}
              {resourceType === 'link' && (
                <div>
                  <label className="a-flab">URL</label>
                  <input
                    type="url"
                    value={resourceUrl}
                    onChange={e => setResourceUrl(e.target.value)}
                    placeholder="https://"
                    className="a-inp w-full"
                  />
                </div>
              )}
              {resourceType === 'page' && (
                <div>
                  <label className="a-flab">Content</label>
                  <textarea
                    value={resourceContent}
                    onChange={e => setResourceContent(e.target.value)}
                    placeholder="Page content..."
                    rows={4}
                    className="a-inp a-ta w-full"
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
                <span className="a-ink text-[14px]">Visible to all members</span>
              </label>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setShowResourceModal(false); resetResourceForm(); }} className="a-btn">
                Cancel
              </button>
              <button
                onClick={handleSaveResource}
                disabled={resourceSaving || !resourceTitle.trim()}
                className="a-btn a-btn-p disabled:opacity-50"
              >
                {resourceSaving ? 'Saving...' : editingResource ? 'Update' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="a-sheet w-full max-w-sm">
            <div className="p-6">
              <p className="a-ink text-[14px] font-medium leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="a-btn"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="a-btn a-btn-d"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drive/Dropbox New Folder Modal */}
      {showDriveNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="a-sheet w-full max-w-sm">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="a-display a-ink text-[19px] font-semibold">New Folder in {isDropboxSection ? 'Dropbox' : 'Google Drive'}</h3>
              <button onClick={() => { setShowDriveNewFolderModal(false); setDriveNewFolderName(''); }} className="a-ib" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <label className="a-flab">Folder Name</label>
              <input
                type="text"
                value={driveNewFolderName}
                onChange={e => setDriveNewFolderName(e.target.value)}
                placeholder="e.g. Race Documents 2026"
                className="a-inp w-full"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (isDropboxSection) {
                      handleCreateDropboxFolder(driveNewFolderName);
                      setShowDriveNewFolderModal(false);
                      setDriveNewFolderName('');
                    } else {
                      handleCreateDriveFolder();
                    }
                  }
                }}
              />
              <p className="a-dim mt-2 text-[12px]">
                This folder will be created inside the current {isDropboxSection ? 'Dropbox' : 'Google Drive'} location.
              </p>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setShowDriveNewFolderModal(false); setDriveNewFolderName(''); }} className="a-btn">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isDropboxSection) {
                    handleCreateDropboxFolder(driveNewFolderName);
                    setShowDriveNewFolderModal(false);
                    setDriveNewFolderName('');
                  } else {
                    handleCreateDriveFolder();
                  }
                }}
                disabled={driveNewFolderCreating || !driveNewFolderName.trim()}
                className="a-btn a-btn-p disabled:opacity-50"
              >
                {driveNewFolderCreating ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drive Rename Modal */}
      {driveRenameItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="a-sheet w-full max-w-sm">
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="a-display a-ink text-[19px] font-semibold">Rename</h3>
              <button onClick={() => { setDriveRenameItem(null); setDriveRenameName(''); }} className="a-ib" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <label className="a-flab">New name</label>
              <input
                type="text"
                value={driveRenameName}
                onChange={e => setDriveRenameName(e.target.value)}
                className="a-inp w-full"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (isDropboxSection && driveRenameItem) {
                      setDriveRenaming(true);
                      handleDropboxRename(driveRenameItem, driveRenameName).finally(() => {
                        setDriveRenaming(false);
                        setDriveRenameItem(null);
                        setDriveRenameName('');
                      });
                    } else {
                      handleDriveRename();
                    }
                  }
                }}
              />
            </div>
            <div className="p-5 pt-0 flex justify-end gap-3">
              <button onClick={() => { setDriveRenameItem(null); setDriveRenameName(''); }} className="a-btn">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (isDropboxSection && driveRenameItem) {
                    setDriveRenaming(true);
                    handleDropboxRename(driveRenameItem, driveRenameName).finally(() => {
                      setDriveRenaming(false);
                      setDriveRenameItem(null);
                      setDriveRenameName('');
                    });
                  } else {
                    handleDriveRename();
                  }
                }}
                disabled={driveRenaming || !driveRenameName.trim()}
                className="a-btn a-btn-p disabled:opacity-50"
              >
                {driveRenaming ? 'Renaming...' : 'Rename'}
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
}> = ({ icon: Icon, label, count, active, onClick, accent }) => (
  <button onClick={onClick} className={`a-lib w-full ${active ? 'a-lib-on' : ''}`}>
    <Icon size={17} className="flex-shrink-0" />
    <span className="flex-1 text-left truncate">{label}</span>
    {accent && count === undefined && <span className="a-light a-light-g" />}
    {count !== undefined && count > 0 && <span className="a-cnt">{count}</span>}
  </button>
);

// All Files overview
const AllFilesView: React.FC<{
  categories: ResourceStorage.ResourceCategory[];
  resources: ResourceStorage.AssociationResource[];
  filteredResources: ResourceStorage.AssociationResource[];
  viewMode: 'grid' | 'list';
  hasGoogleDrive: boolean;
  hasDropbox?: boolean;
  sharedCount: number;
  isClubContext: boolean;
  onSetSection: (s: string) => void;
  onOpenDrive: () => void;
  onOpenDropbox?: () => void;
  onNewFolder: () => void;
  onEditCategory: (cat: ResourceStorage.ResourceCategory) => void;
  onDeleteCategory: (catId: string) => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  onEditResource: (r: ResourceStorage.AssociationResource) => void;
  onDeleteResource: (r: ResourceStorage.AssociationResource) => void;
  draggedResource: ResourceStorage.AssociationResource | null;
  onDragStartResource: (r: ResourceStorage.AssociationResource) => void;
  onDragEndResource: () => void;
  dropTargetCatId: string | null;
  onDropOnCategory: (catId: string) => void;
  onDragOverCategory: (catId: string | null) => void;
}> = ({ categories, resources, filteredResources, viewMode, hasGoogleDrive, hasDropbox, sharedCount, isClubContext, onSetSection, onOpenDrive, onOpenDropbox, onNewFolder, onEditCategory, onDeleteCategory, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, onEditResource, onDeleteResource, draggedResource, onDragStartResource, onDragEndResource, dropTargetCatId, onDropOnCategory, onDragOverCategory }) => {
  const source = (icon: React.ReactNode, title: string, sub: string, onClick: () => void) => (
    <button onClick={onClick} className="a-qa text-left">
      <span className="a-tile" style={{ width: 44, height: 44 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="a-ink text-[15px] font-semibold">{title}</div>
        <span className="a-st text-[12.5px] mt-[3px]"><span className="a-light a-light-g" /><span className="a-mute">{sub}</span></span>
      </div>
      <ChevronRight size={16} className="a-dim" />
    </button>
  );
  return (
    <div className="flex flex-col gap-5">
      {(hasGoogleDrive || hasDropbox || (isClubContext && sharedCount > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {hasGoogleDrive && source(<HardDrive size={20} />, 'Google Drive', 'Connected · browse files', onOpenDrive)}
          {hasDropbox && onOpenDropbox && source(<Cloud size={20} />, 'Dropbox', 'Connected · browse files', onOpenDropbox)}
          {isClubContext && sharedCount > 0 && source(<Building2 size={20} />, 'Shared with club', `${sharedCount} resources from your association`, () => onSetSection('shared'))}
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <p className="a-cap mb-2.5">Folders</p>
          <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3' : 'a-card overflow-hidden'}>
            {categories.map(cat => {
              const count = resources.filter(r => r.category_id === cat.id).length;
              const isTarget = dropTargetCatId === cat.id && !!draggedResource;
              const dnd = {
                onDragOver: (e: React.DragEvent) => { if (draggedResource) { e.preventDefault(); onDragOverCategory(cat.id); } },
                onDragLeave: () => onDragOverCategory(null),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); onDropOnCategory(cat.id); },
              };
              if (viewMode === 'grid') {
                return (
                  <div key={cat.id} {...dnd} onClick={() => onSetSection(cat.id)} className={`a-fold group relative ${isTarget ? 'a-drop-target' : ''}`} role="button" tabIndex={0}>
                    <span className="a-tile" style={{ width: 44, height: 44 }}><FolderOpen size={20} className="a-txt-a" /></span>
                    <div className="min-w-0">
                      <div className="a-ink text-[15px] font-semibold truncate">{cat.name}</div>
                      <div className="a-dim text-[12.5px] mt-0.5">{count} item{count !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="absolute flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ top: 12, right: 12 }}>
                      <button onClick={e => { e.stopPropagation(); onEditCategory(cat); }} className="a-ib" style={{ width: 28, height: 28 }} title="Rename folder" aria-label="Rename folder"><Edit2 size={13} /></button>
                      <button onClick={e => { e.stopPropagation(); onDeleteCategory(cat.id); }} className="a-ib a-ib-d" style={{ width: 28, height: 28 }} title="Delete folder" aria-label="Delete folder"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={cat.id} {...dnd} onClick={() => onSetSection(cat.id)} className={`a-fr a-fr-row group ${isTarget ? 'a-drop-target' : ''}`} role="button" tabIndex={0}>
                  <span className="a-tile" style={{ width: 40, height: 40 }}><FolderOpen size={18} className="a-txt-a" /></span>
                  <span className="a-ink text-[14.5px] font-medium truncate">{cat.name}</span>
                  <span className="a-lb-fmt justify-self-start">Folder</span>
                  <span className="a-mute text-[13px]">{count} item{count !== 1 ? 's' : ''}</span>
                  <div className="a-acts flex justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEditCategory(cat)} className="a-ib" title="Rename folder" aria-label="Rename folder"><Edit2 size={16} /></button>
                    <button onClick={() => onDeleteCategory(cat.id)} className="a-ib a-ib-d" title="Delete folder" aria-label="Delete folder"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
            {viewMode === 'grid' && (
              <button onClick={onNewFolder} className="a-fold a-fold-add text-left">
                <span className="a-tile" style={{ width: 44, height: 44 }}><FolderPlus size={20} /></span>
                <div className="text-[14px] font-semibold">New folder</div>
              </button>
            )}
          </div>
        </div>
      )}

      {filteredResources.length > 0 && (
        <div>
          <p className="a-cap mb-2.5">Files</p>
          <ResourceTable
            resources={filteredResources}
            getFileIcon={getFileIcon}
            getFileIconColor={getFileIconColor}
            formatFileSize={formatFileSize}
            formatDate={formatDate}
            onEdit={onEditResource}
            onDelete={onDeleteResource}
            onDragStartResource={onDragStartResource}
            onDragEndResource={onDragEndResource}
          />
        </div>
      )}

      {categories.length === 0 && !hasGoogleDrive && !hasDropbox && (
        <div className="a-card a-empty flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
          <span className="a-tile mb-3" style={{ width: 52, height: 52 }}><FolderOpen size={22} /></span>
          <p className="a-ink font-semibold mb-1">No documents yet</p>
          <p className="a-dim text-[13.5px] mb-5">Create a folder to start organising your documents</p>
          <button onClick={onNewFolder} className="a-btn a-btn-p"><FolderPlus size={16} />New folder</button>
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
  onDragStartResource: (r: ResourceStorage.AssociationResource) => void;
  onDragEndResource: () => void;
}> = ({ resources, viewMode, onAddResource, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, onEditResource, onDeleteResource, onDragStartResource, onDragEndResource }) => {
  if (resources.length === 0) {
    return (
      <div className="a-card a-empty flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
        <span className="a-tile mb-3" style={{ width: 52, height: 52 }}><File size={22} /></span>
        <p className="a-ink font-semibold mb-1">This folder is empty</p>
        <p className="a-dim text-[13.5px] mb-5">Add files, links or pages to this folder</p>
        <button onClick={onAddResource} className="a-btn a-btn-p"><Plus size={16} />Add resource</button>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {resources.map(r => {
          const Icon = getFileIcon(r.file_type || r.resource_type);
          const iconColor = getFileIconColor(r.file_type || r.resource_type);
          return (
            <div
              key={r.id}
              draggable
              onDragStart={() => onDragStartResource(r)}
              onDragEnd={onDragEndResource}
              className="a-fold group relative cursor-grab active:cursor-grabbing active:opacity-60"
              onClick={() => r.external_url ? window.open(r.external_url, '_blank') : r.file_url ? window.open(r.file_url, '_blank') : undefined}
            >
              <span className="a-tile" style={{ width: 44, height: 44 }}><Icon size={20} className={iconColor} /></span>
              <div className="min-w-0">
                <div className="a-ink text-[14px] font-semibold line-clamp-2">{r.title}</div>
                {r.file_size && <div className="a-dim text-[12px] mt-0.5">{formatFileSize(r.file_size)}</div>}
              </div>
              <div className="absolute flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ top: 12, right: 12 }}>
                <button onClick={e => { e.stopPropagation(); onEditResource(r); }} className="a-ib" style={{ width: 28, height: 28 }} aria-label="Edit"><Edit2 size={13} /></button>
                <button onClick={e => { e.stopPropagation(); onDeleteResource(r); }} className="a-ib a-ib-d" style={{ width: 28, height: 28 }} aria-label="Delete"><Trash2 size={13} /></button>
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
      onDragStartResource={onDragStartResource}
      onDragEndResource={onDragEndResource}
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
  onDragStartResource?: (r: ResourceStorage.AssociationResource) => void;
  onDragEndResource?: () => void;
}> = ({ resources, getFileIcon, getFileIconColor, formatFileSize, formatDate, onEdit, onDelete, readOnly, onDragStartResource, onDragEndResource }) => (
  <div className="a-card overflow-hidden">
    <div className="a-fr a-fr-h">
      <span />
      <p className="a-cap">Name</p>
      <p className="a-cap">Type</p>
      <p className="a-cap">Added</p>
      <span />
    </div>
    {resources.map(r => {
      const Icon = getFileIcon(r.file_type || r.resource_type);
      const iconColor = getFileIconColor(r.file_type || r.resource_type);
      const url = r.file_url || r.external_url;
      const ext = (r.title?.match(/\.([a-z0-9]{2,5})$/i)?.[1] || r.file_url?.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toUpperCase();
      const typeLabel = r.resource_type === 'google_drive' ? 'Drive' : r.resource_type === 'file' ? (ext || (r.file_type?.includes('pdf') ? 'PDF' : 'File')) : r.resource_type;
      return (
        <div
          key={r.id}
          draggable={!!onDragStartResource}
          onDragStart={() => onDragStartResource?.(r)}
          onDragEnd={onDragEndResource}
          className="a-fr a-fr-row group cursor-grab active:cursor-grabbing active:opacity-60"
          onClick={() => url && window.open(url, '_blank')}
          role="button"
          tabIndex={0}
        >
          <span className="a-tile" style={{ width: 40, height: 40 }}><Icon size={18} className={iconColor} /></span>
          <div className="min-w-0">
            <div className="a-ink text-[14.5px] font-medium truncate">{r.title}</div>
            {(r.description || r.file_size) && <div className="a-dim text-[12px] truncate mt-0.5">{[r.description, r.file_size ? formatFileSize(r.file_size) : null].filter(Boolean).join(' · ')}</div>}
          </div>
          <span className="a-lb-fmt justify-self-start capitalize">{typeLabel}</span>
          <span className="a-mute text-[13px]">{formatDate(r.created_at)}</span>
          <div className="a-acts flex justify-end gap-0.5" onClick={e => e.stopPropagation()}>
            {url && <button onClick={() => window.open(url, '_blank')} className="a-ib" title="Open" aria-label="Open"><Eye size={16} /></button>}
            {!readOnly && onEdit && <button onClick={() => onEdit(r)} className="a-ib" title="Edit" aria-label="Edit"><Edit2 size={16} /></button>}
            {!readOnly && onDelete && <button onClick={() => onDelete(r)} className="a-ib a-ib-d" title="Delete" aria-label="Delete"><Trash2 size={16} /></button>}
          </div>
        </div>
      );
    })}
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
      <div className="a-card a-empty flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
        <span className="a-tile mb-3" style={{ width: 52, height: 52 }}><Users size={22} /></span>
        <p className="a-ink font-semibold mb-1">Nothing shared yet</p>
        <p className="a-dim text-[13.5px]">Your association hasn’t shared any resources yet</p>
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
    <div className="flex flex-col gap-5">
      {Object.entries(grouped).map(([orgName, items]) => (
        <div key={orgName}>
          <div className="flex items-center gap-2 mb-2.5">
            <Building2 size={14} className="a-dim" />
            <p className="a-cap">{orgName}</p>
            <span className="a-cnt">{items.length}</span>
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

// Drive/Dropbox view with context menu
const DriveView: React.FC<{
  items: DriveItem[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  hasGoogleDrive: boolean;
  driveRootFolderId: string | null;
  onItemClick: (item: DriveItem) => void;
  onDownload: (item: DriveItem) => void;
  onDelete: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  formatDate: (iso?: string) => string;
  contextMenu: { item: DriveItem; x: number; y: number } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<{ item: DriveItem; x: number; y: number } | null>>;
  draggedDriveItem: DriveItem | null;
  onDragStartDriveItem: (item: DriveItem) => void;
  onDragEndDriveItem: () => void;
  dropTargetDriveFolderId: string | null;
  onDropOnDriveFolder: (folderId: string) => void;
  onDragOverDriveFolder: (folderId: string | null) => void;
  providerLabel?: string;
  providerIcon?: React.ElementType;
  providerAccentColor?: string;
}> = ({ items, loading, viewMode, hasGoogleDrive, driveRootFolderId, onItemClick, onDownload, onDelete, onRename, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, formatDate, contextMenu, setContextMenu, draggedDriveItem, onDragStartDriveItem, onDragEndDriveItem, dropTargetDriveFolderId, onDropOnDriveFolder, onDragOverDriveFolder, providerLabel, providerIcon, providerAccentColor }) => {
  const label = providerLabel || 'Google Drive';
  const ProviderIcon = providerIcon || HardDrive;
  const accentBorder = providerAccentColor === 'blue' ? 'border-b-2 border-blue-500' : 'border-b-2 border-green-500';

  if (!hasGoogleDrive) {
    return (
      <div className="a-card a-empty flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
        <div className="a-tile mb-3" style={{ width: 52, height: 52 }}>
          <ProviderIcon size={22} />
        </div>
        <p className="a-ink font-semibold mb-1">{label} not connected</p>
        <p className="a-dim text-[13.5px]">Connect {label} in Settings &rarr; Integrations</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className={`animate-spin rounded-full h-8 w-8 ${accentBorder} mx-auto mb-3`} />
          <p className="a-dim text-[13.5px]">Loading {label}...</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="a-card a-empty flex flex-col items-center justify-center text-center" style={{ padding: 48 }}>
        <div className="a-tile mb-3" style={{ width: 52, height: 52 }}>
          <FolderOpen size={22} />
        </div>
        <p className="a-ink font-semibold mb-1">This folder is empty</p>
        <p className="a-dim text-[13.5px]">Drag and drop files here to upload</p>
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
      <div className="flex flex-col gap-5">
        {folders.length > 0 && (
          <div>
            <p className="a-cap mb-2.5">Folders</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {folders.map(item => (
                <DriveGridCard
                  key={item.id}
                  item={item}
                  onClick={onItemClick}
                  onRightClick={handleRightClick}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onRename={onRename}
                  getFileIcon={getFileIcon}
                  getFileIconColor={getFileIconColor}
                  getFileBgColor={getFileBgColor}
                  formatFileSize={formatFileSize}
                  isDragTarget={dropTargetDriveFolderId === item.id && !!draggedDriveItem && draggedDriveItem.id !== item.id}
                  onDragStart={() => onDragStartDriveItem(item)}
                  onDragEnd={onDragEndDriveItem}
                  onDragOver={e => { if (draggedDriveItem && draggedDriveItem.id !== item.id) { e.preventDefault(); onDragOverDriveFolder(item.id); } }}
                  onDragLeave={() => onDragOverDriveFolder(null)}
                  onDrop={e => { e.preventDefault(); onDropOnDriveFolder(item.id); }}
                />
              ))}
            </div>
          </div>
        )}
        {files.length > 0 && (
          <div>
            <p className="a-cap mb-2.5">Files</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {files.map(item => (
                <DriveGridCard
                  key={item.id}
                  item={item}
                  onClick={onItemClick}
                  onRightClick={handleRightClick}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onRename={onRename}
                  getFileIcon={getFileIcon}
                  getFileIconColor={getFileIconColor}
                  getFileBgColor={getFileBgColor}
                  formatFileSize={formatFileSize}
                  isDragTarget={false}
                  onDragStart={() => onDragStartDriveItem(item)}
                  onDragEnd={onDragEndDriveItem}
                  onDragOver={() => {}}
                  onDragLeave={() => {}}
                  onDrop={() => {}}
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
            onRename={onRename}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="a-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="a-thead-row">
              <th className="a-cap text-left px-4 py-3 w-8"></th>
              <th className="a-cap text-left px-4 py-3">Name</th>
              <th className="a-cap text-left px-4 py-3 w-36 hidden sm:table-cell">Modified</th>
              <th className="a-cap text-left px-4 py-3 w-24 hidden md:table-cell">Size</th>
              <th className="w-24 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="a-tbody">
            {[...folders, ...files].map(item => {
              const Icon = getFileIcon(item.mimeType, item.isFolder);
              const iconColor = getFileIconColor(item.mimeType, item.isFolder);
              const isTarget = item.isFolder && dropTargetDriveFolderId === item.id && !!draggedDriveItem && draggedDriveItem.id !== item.id;
              return (
                <tr
                  key={item.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); onDragStartDriveItem(item); }}
                  onDragEnd={onDragEndDriveItem}
                  onDragOver={e => { if (item.isFolder && draggedDriveItem && draggedDriveItem.id !== item.id) { e.preventDefault(); onDragOverDriveFolder(item.id); } }}
                  onDragLeave={() => { if (item.isFolder) onDragOverDriveFolder(null); }}
                  onDrop={e => { e.preventDefault(); if (item.isFolder) onDropOnDriveFolder(item.id); }}
                  className={`group transition-colors cursor-grab active:cursor-grabbing active:opacity-60 ${
                    isTarget ? 'a-drop-target' : 'a-tr-hover'
                  }`}
                  onClick={() => onItemClick(item)}
                  onContextMenu={e => handleRightClick(e, item)}
                >
                  <td className="px-4 py-3">
                    <Icon size={16} className={isTarget ? 'text-green-400' : iconColor} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium transition-colors ${isTarget ? 'a-txt-g' : 'a-ink'}`}>{item.name}</span>
                  </td>
                  <td className="a-mute px-4 py-3 text-[13px] hidden sm:table-cell">{formatDate(item.modifiedTime)}</td>
                  <td className="a-mute px-4 py-3 text-[13px] hidden md:table-cell">{formatFileSize(item.size)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!item.isFolder && (
                        <button onClick={() => onDownload(item)} className="a-ib" style={{ width: 32, height: 32 }} title="Download">
                          <Download size={12} />
                        </button>
                      )}
                      <button onClick={() => onRename(item)} className="a-ib" style={{ width: 32, height: 32 }} title="Rename">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => window.open(item.webViewLink, '_blank')} className="a-ib" style={{ width: 32, height: 32 }} title="Open in Drive">
                        <ExternalLink size={12} />
                      </button>
                      <button onClick={() => onDelete(item)} className="a-ib a-ib-d" style={{ width: 32, height: 32 }} title="Delete">
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
          onRename={onRename}
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
  onRename: (item: DriveItem) => void;
  getFileIcon: (m?: string, f?: boolean) => React.ElementType;
  getFileIconColor: (m?: string, f?: boolean) => string;
  getFileBgColor: (m?: string, f?: boolean) => string;
  formatFileSize: (b?: string | number) => string;
  isDragTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}> = ({ item, onClick, onRightClick, onDownload, onDelete, onRename, getFileIcon, getFileIconColor, getFileBgColor, formatFileSize, isDragTarget, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop }) => {
  const Icon = getFileIcon(item.mimeType, item.isFolder);
  const iconColor = getFileIconColor(item.mimeType, item.isFolder);
  const bgColor = getFileBgColor(item.mimeType, item.isFolder);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`a-fold group relative cursor-grab active:cursor-grabbing active:opacity-60 ${
        isDragTarget
          ? 'border-green-400/70 bg-green-500/10 scale-105 shadow-lg shadow-green-500/20'
          : ''
      }`}
      onClick={() => onClick(item)}
      onContextMenu={e => onRightClick(e, item)}
    >
      <div className="a-tile" style={{ width: 44, height: 44 }}>
        <Icon size={20} className={isDragTarget ? 'a-txt-g' : iconColor} />
      </div>
      <p className={`text-[14px] font-semibold line-clamp-2 w-full ${isDragTarget ? 'a-txt-g' : 'a-ink'}`}>{item.name}</p>
      {!item.isFolder && item.size && <p className="a-dim text-[12px]">{formatFileSize(item.size)}</p>}
      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1" onClick={e => e.stopPropagation()}>
        {!item.isFolder && (
          <button onClick={() => onDownload(item)} className="a-ib" style={{ width: 28, height: 28 }} title="Download">
            <Download size={10} />
          </button>
        )}
        <button onClick={() => onRename(item)} className="a-ib" style={{ width: 28, height: 28 }} title="Rename">
          <Edit2 size={10} />
        </button>
        <button onClick={() => window.open(item.webViewLink, '_blank')} className="a-ib" style={{ width: 28, height: 28 }} title="Open in Drive">
          <ExternalLink size={10} />
        </button>
        <button onClick={() => onDelete(item)} className="a-ib a-ib-d" style={{ width: 28, height: 28 }} title="Delete">
          <Trash2 size={10} />
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
  onRename: (item: DriveItem) => void;
  onClose: () => void;
}> = ({ item, x, y, onOpen, onDownload, onDelete, onRename, onClose }) => {
  return (
    <div
      className="a-pop fixed z-[9999] min-w-[190px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      <button
        className="a-pop-item w-full"
        onClick={() => { onOpen(item); onClose(); }}
      >
        {item.isFolder ? <FolderOpen size={14} /> : <Eye size={14} />}
        {item.isFolder ? 'Open folder' : 'Open file'}
      </button>
      {!item.isFolder && (
        <button
          className="a-pop-item w-full"
          onClick={() => { onDownload(item); onClose(); }}
        >
          <Download size={14} />
          Download
        </button>
      )}
      <button
        className="a-pop-item w-full"
        onClick={() => { onRename(item); onClose(); }}
      >
        <Edit2 size={14} />
        Rename
      </button>
      <button
        className="a-pop-item w-full"
        onClick={() => { window.open(item.webViewLink, '_blank'); onClose(); }}
      >
        <ExternalLink size={14} />
        Open in Google Drive
      </button>
      <div className="a-pop-rule" />
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
