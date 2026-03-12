import React, { useState, useEffect } from 'react';
import {
  FolderOpen, Plus, Edit, Edit2, Trash2, FileText, Link as LinkIcon,
  ExternalLink, Download, Upload, Settings, Search, Grid,
  List, Star, Lock, Unlock, ChevronDown, ChevronRight, Music,
  File, Image as ImageIcon, LogOut, HardDrive, RefreshCw, Check, AlertCircle,
  Building2, Users
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import * as ResourceStorage from '../../utils/associationResourceStorage';
import { supabase } from '../../utils/supabase';

interface ResourcesPageProps {
  darkMode: boolean;
}

export const AssociationResourcesPage: React.FC<ResourcesPageProps> = ({ darkMode }) => {
  const { currentOrganization, currentClub, user } = useAuth();
  const { addNotification } = useNotifications();

  const [categories, setCategories] = useState<ResourceStorage.ResourceCategory[]>([]);
  const [resources, setResources] = useState<ResourceStorage.AssociationResource[]>([]);
  const [associationResources, setAssociationResources] = useState<ResourceStorage.AssociationResource[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'club' | 'association'>('club');
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ResourceStorage.ResourceCategory | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceStorage.AssociationResource | null>(null);

  // Category modal form state
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('folder');
  const [categorySaving, setCategorySaving] = useState(false);

  // Resource modal form state
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceDescription, setResourceDescription] = useState('');
  const [resourceType, setResourceType] = useState<'page' | 'file' | 'link' | 'external_tool' | 'google_drive'>('page');
  const [resourceContent, setResourceContent] = useState('');
  const [resourceExternalUrl, setResourceExternalUrl] = useState('');
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceIsPublic, setResourceIsPublic] = useState(true);
  const [resourceIsFeatured, setResourceIsFeatured] = useState(false);
  const [resourceTags, setResourceTags] = useState<string[]>([]);
  const [resourceTagInput, setResourceTagInput] = useState('');
  const [resourceSaving, setResourceSaving] = useState(false);

  // Google Drive state
  const [showGoogleDriveFilePicker, setShowGoogleDriveFilePicker] = useState(false);
  const [googleDriveFiles, setGoogleDriveFiles] = useState<any[]>([]);
  const [loadingGoogleDriveFiles, setLoadingGoogleDriveFiles] = useState(false);
  const [selectedGoogleDriveFile, setSelectedGoogleDriveFile] = useState<any | null>(null);
  const [hasGoogleDriveIntegration, setHasGoogleDriveIntegration] = useState(false);
  const [syncingGoogleDrive, setSyncingGoogleDrive] = useState(false);

  // Determine the current organization details (club or association)
  const organizationId = currentOrganization?.id || currentClub?.clubId;
  const organizationType: ResourceStorage.OrganizationType = currentOrganization?.type || 'club';
  const organizationName = currentOrganization?.name || currentClub?.club?.name || 'Organization';

  useEffect(() => {
    if (organizationId) {
      loadData().then(() => {
        // After data is loaded, check if we need initial sync
        checkInitialSync();
      });
    }
  }, [organizationId, organizationType]);

  // Check if we need to do an initial sync after Google Drive connection
  const checkInitialSync = async () => {
    if (!organizationId || filterSource !== 'club') return;

    try {
      const hasIntegration = await checkGoogleDriveIntegration();
      if (!hasIntegration) return;

      // Check if we have any Google Drive resources already
      const { data: existingResources } = await supabase
        .from('resources')
        .select('id')
        .eq('resource_type', 'google_drive')
        .limit(1);

      // If Google Drive is connected but no resources exist, and the OAuth callback
      // should have created resources but didn't, trigger sync
      if (existingResources && existingResources.length === 0) {
        console.log('Google Drive connected but no resources found. Triggering initial sync...');
        await handleSyncGoogleDriveResources(true);
        // Reload data to show the new category and resources
        await loadData();
      }
    } catch (error) {
      console.error('Error checking initial sync:', error);
    }
  };

  // Re-check Google Drive integration when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && organizationId) {
        checkGoogleDriveIntegration();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [organizationId]);

  const loadData = async () => {
    if (!organizationId) return;

    try {
      setLoading(true);
      const cats = await ResourceStorage.fetchResourceCategories(
        organizationId,
        organizationType
      );
      setCategories(cats);

      // Load resources if a category is selected
      if (selectedCategory) {
        const res = await ResourceStorage.fetchResources(selectedCategory);
        setResources(res);
      } else if (filterSource === 'club' && cats.length > 0) {
        // Load all club resources when "My Club" is selected
        const allResources: ResourceStorage.AssociationResource[] = [];
        for (const category of cats) {
          const res = await ResourceStorage.fetchResources(category.id);
          allResources.push(...res);
        }
        setResources(allResources);
      }

      // Load public resources from parent associations (for clubs only)
      if (organizationType === 'club' && organizationId) {
        console.log('Loading public association resources for club:', organizationId);
        const publicResources = await ResourceStorage.fetchPublicAssociationResources(organizationId);
        console.log('Public association resources loaded:', publicResources.length, publicResources);
        setAssociationResources(publicResources);
      }

      // Check if Google Drive integration is configured
      await checkGoogleDriveIntegration();
    } catch (error) {
      console.error('Error loading resources:', error);
      addNotification('Failed to load resources', 'error');
    } finally {
      setLoading(false);
    }
  };

  const checkGoogleDriveIntegration = async (): Promise<boolean> => {
    if (!organizationId) return false;

    try {
      const idColumn = organizationType === 'club' ? 'club_id' :
                       organizationType === 'state' ? 'state_association_id' :
                       'national_association_id';

      const { data, error } = await supabase
        .from('integrations')
        .select('id, credentials')
        .eq(idColumn, organizationId)
        .eq('platform', 'google_drive')
        .maybeSingle();

      const hasIntegration = !error && !!data?.id && !!data?.credentials?.refresh_token;
      setHasGoogleDriveIntegration(hasIntegration);
      return hasIntegration;
    } catch (error) {
      setHasGoogleDriveIntegration(false);
      return false;
    }
  };

  // Helper function to ensure a category exists (auto-create if needed)
  const ensureCategoryExists = async (): Promise<string> => {
    if (selectedCategory) {
      return selectedCategory;
    }

    if (categories.length > 0) {
      const firstCategoryId = categories[0].id;
      setSelectedCategory(firstCategoryId);
      return firstCategoryId;
    }

    // Create default "Club Files" category
    const defaultCategory = await ResourceStorage.createResourceCategory(
      organizationId!,
      organizationType,
      'Club Files',
      'Default category for club resources',
      'folder'
    );
    setCategories([defaultCategory]);
    setSelectedCategory(defaultCategory.id);
    return defaultCategory.id;
  };

  useEffect(() => {
    loadResources();
  }, [selectedCategory, filterSource]);

  const loadResources = async () => {
    if (!organizationId) {
      setResources([]);
      return;
    }

    // If a specific category is selected, load only that category's resources
    if (selectedCategory) {
      try {
        const res = await ResourceStorage.fetchResources(selectedCategory);
        setResources(res);
      } catch (error) {
        console.error('Error loading resources:', error);
      }
      return;
    }

    // If "My Club" or "All Resources" is selected (no specific category), load all club resources
    if (filterSource === 'club' || filterSource === 'all') {
      try {
        // Load resources from all categories
        const allResources: ResourceStorage.AssociationResource[] = [];
        for (const category of categories) {
          const res = await ResourceStorage.fetchResources(category.id);
          allResources.push(...res);
        }
        setResources(allResources);
      } catch (error) {
        console.error('Error loading all resources:', error);
      }
    } else {
      // Association view without category - clear resources
      setResources([]);
    }
  };

  // Create a Google Drive folder for a category
  const createGoogleDriveFolder = async (categoryName: string): Promise<string | null> => {
    if (!organizationId || !hasGoogleDriveIntegration) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create_folder',
            organizationId,
            organizationType,
            folderName: categoryName
          }),
        }
      );

      if (!response.ok) {
        console.error('Failed to create Google Drive folder');
        return null;
      }

      const data = await response.json();
      return data.folderId;
    } catch (error) {
      console.error('Error creating Google Drive folder:', error);
      return null;
    }
  };

  const uploadToGoogleDrive = async (file: File, folderId: string): Promise<{ fileId: string; webViewLink: string } | null> => {
    if (!organizationId) return null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Convert file to base64
      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'upload_file',
            organizationId,
            organizationType,
            fileName: file.name,
            fileData: fileData.split(',')[1], // Remove data URL prefix
            mimeType: file.type,
            folderId
          }),
        }
      );

      if (!response.ok) {
        console.error('Failed to upload to Google Drive');
        return null;
      }

      const data = await response.json();
      return { fileId: data.fileId, webViewLink: data.webViewLink };
    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
      return null;
    }
  };

  const handleSaveCategory = async () => {
    if (!organizationId || !categoryName.trim()) return;

    try {
      setCategorySaving(true);

      if (editingCategory) {
        await ResourceStorage.updateResourceCategory(editingCategory.id, {
          name: categoryName,
          description: categoryDescription,
          icon: categoryIcon
        });
        addNotification('Category updated successfully', 'success');
      } else {
        const newCategory = await ResourceStorage.createResourceCategory({
          organization_id: organizationId,
          organization_type: organizationType,
          name: categoryName,
          description: categoryDescription,
          icon: categoryIcon,
          display_order: categories.length
        });
        addNotification('Category created successfully', 'success');

        // If Google Drive is connected, create a folder for this category
        if (hasGoogleDriveIntegration) {
          const folderId = await createGoogleDriveFolder(categoryName);
          if (folderId) {
            // Store the Google Drive folder ID in the category
            await ResourceStorage.updateResourceCategory(newCategory.id, {
              google_drive_folder_id: folderId
            });
            addNotification(`Google Drive folder "${categoryName}" created`, 'success');
          }
        }

        // Select the new category
        setSelectedCategory(newCategory.id);
      }

      setShowCategoryModal(false);
      resetCategoryForm();
      loadData();
    } catch (error) {
      console.error('Error saving category:', error);
      addNotification('Failed to save category', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const resetCategoryForm = () => {
    setCategoryName('');
    setCategoryDescription('');
    setCategoryIcon('folder');
    setEditingCategory(null);
  };

  const handleSaveResource = async () => {
    if (!organizationId || !selectedCategory || !resourceTitle.trim()) return;

    try {
      setResourceSaving(true);

      let fileUrl = null;
      let fileType = null;
      let fileSize = null;
      let googleDriveFileId = null;
      let actualResourceType = resourceType;

      // Check if the category has Google Drive integration
      const category = categories.find(c => c.id === selectedCategory);
      const hasGoogleDriveFolder = category?.google_drive_folder_id;

      // Handle file upload
      if (resourceType === 'file' && resourceFile) {
        if (hasGoogleDriveFolder && category) {
          // Upload to Google Drive
          const result = await uploadToGoogleDrive(resourceFile, category.google_drive_folder_id!);
          if (result) {
            fileUrl = result.webViewLink;
            googleDriveFileId = result.fileId;
            actualResourceType = 'google_drive'; // Mark as Google Drive resource
            addNotification('File uploaded to Google Drive', 'success');
          } else {
            throw new Error('Failed to upload file to Google Drive');
          }
        } else {
          // Upload to Supabase storage
          fileUrl = await ResourceStorage.uploadResourceFile(
            resourceFile,
            organizationId,
            organizationType
          );
        }
        fileType = resourceFile.type;
        fileSize = resourceFile.size;
      }

      if (editingResource) {
        await ResourceStorage.updateResource(editingResource.id, {
          title: resourceTitle,
          description: resourceDescription,
          resource_type: actualResourceType,
          content: resourceContent,
          external_url: actualResourceType === 'google_drive' ? fileUrl : resourceExternalUrl,
          file_url: fileUrl || editingResource.file_url,
          file_type: fileType || editingResource.file_type,
          file_size: fileSize || editingResource.file_size,
          google_drive_file_id: googleDriveFileId || editingResource.google_drive_file_id,
          is_public: resourceIsPublic,
          is_featured: resourceIsFeatured,
          tags: resourceTags,
          sync_status: actualResourceType === 'google_drive' ? 'synced' : undefined,
          last_synced_at: actualResourceType === 'google_drive' ? new Date().toISOString() : undefined
        });
        addNotification('Resource updated successfully', 'success');
      } else {
        await ResourceStorage.createResource({
          category_id: selectedCategory,
          title: resourceTitle,
          description: resourceDescription,
          resource_type: actualResourceType,
          content: resourceContent,
          external_url: actualResourceType === 'google_drive' ? fileUrl : resourceExternalUrl,
          file_url: fileUrl,
          file_type: fileType,
          file_size: fileSize,
          google_drive_file_id: googleDriveFileId,
          is_public: resourceIsPublic,
          is_featured: resourceIsFeatured,
          tags: resourceTags,
          display_order: 0,
          created_by: user?.id,
          sync_status: actualResourceType === 'google_drive' ? 'synced' : 'not_synced',
          last_synced_at: actualResourceType === 'google_drive' ? new Date().toISOString() : undefined
        });
        addNotification('Resource created successfully', 'success');
      }

      setShowResourceModal(false);
      resetResourceForm();
      loadResources();
    } catch (error) {
      console.error('Error saving resource:', error);
      addNotification('Failed to save resource', 'error');
    } finally {
      setResourceSaving(false);
    }
  };

  const resetResourceForm = () => {
    setResourceTitle('');
    setResourceDescription('');
    setResourceType('page');
    setResourceContent('');
    setResourceExternalUrl('');
    setResourceFile(null);
    setResourceIsPublic(true);
    setResourceIsFeatured(false);
    setResourceTags([]);
    setResourceTagInput('');
    setEditingResource(null);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category and all its resources?')) return;

    try {
      // Find the category to get its Google Drive folder ID
      const category = categories.find(c => c.id === categoryId);

      // First, delete all resources in this category
      const categoryResources = await ResourceStorage.fetchResources(categoryId);
      console.log(`Deleting ${categoryResources.length} resources from category`);

      for (const resource of categoryResources) {
        // Delete from Google Drive if it's a Google Drive resource
        if (resource.resource_type === 'google_drive' && resource.google_drive_file_id && hasGoogleDriveIntegration) {
          try {
            console.log('Attempting to delete Google Drive file:', resource.google_drive_file_id, resource.title);
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    action: 'delete_file',
                    organizationId,
                    organizationType,
                    fileId: resource.google_drive_file_id
                  }),
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                console.error('Failed to delete Google Drive file:', resource.title, errorData);
              } else {
                console.log('Successfully deleted Google Drive file:', resource.title);
              }
            }
          } catch (error) {
            console.error('Error deleting file from Google Drive:', error);
          }
        }

        if (resource.file_url) {
          await ResourceStorage.deleteResourceFile(resource.file_url);
        }
        await ResourceStorage.deleteResource(resource.id);
      }

      // Delete the Google Drive folder if this category has one
      if (category?.google_drive_folder_id && hasGoogleDriveIntegration) {
        try {
          console.log('Attempting to delete Google Drive folder:', category.google_drive_folder_id);
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'delete_folder',
                  organizationId,
                  organizationType,
                  folderId: category.google_drive_folder_id
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              console.error('Failed to delete Google Drive folder:', errorData);
              addNotification(`Failed to delete from Google Drive: ${errorData.error || 'Unknown error'}`, 'error');
            } else {
              console.log('Successfully deleted Google Drive folder');
            }
          }
        } catch (error) {
          console.error('Error deleting folder from Google Drive:', error);
          addNotification('Error deleting from Google Drive. Check console for details.', 'error');
        }
      }

      // Then delete the category from the database
      await ResourceStorage.deleteResourceCategory(categoryId);
      addNotification('Category deleted successfully', 'success');

      // Clear selection if the deleted category was selected
      if (selectedCategory === categoryId) {
        setSelectedCategory(null);
      }

      loadData();
    } catch (error) {
      console.error('Error deleting category:', error);
      addNotification('Failed to delete category', 'error');
    }
  };

  const handleDeleteResource = async (resourceId: string, fileUrl?: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return;

    try {
      // Find the resource to get its Google Drive file ID
      const resource = resources.find(r => r.id === resourceId);

      // Delete from Google Drive if it's a Google Drive resource
      if (resource?.resource_type === 'google_drive' && resource.google_drive_file_id && hasGoogleDriveIntegration) {
        try {
          console.log('Attempting to delete Google Drive file:', resource.google_drive_file_id);
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const response = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'delete_file',
                  organizationId,
                  organizationType,
                  fileId: resource.google_drive_file_id
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              console.error('Failed to delete Google Drive file:', errorData);
            } else {
              console.log('Successfully deleted Google Drive file');
            }
          }
        } catch (error) {
          console.error('Error deleting file from Google Drive:', error);
        }
      }

      if (fileUrl) {
        await ResourceStorage.deleteResourceFile(fileUrl);
      }
      await ResourceStorage.deleteResource(resourceId);
      addNotification('Resource deleted successfully', 'success');
      loadResources();
    } catch (error) {
      console.error('Error deleting resource:', error);
      addNotification('Failed to delete resource', 'error');
    }
  };

  const handleDownloadResource = async (resource: ResourceStorage.AssociationResource) => {
    try {
      await ResourceStorage.incrementDownloadCount(resource.id);

      if (resource.resource_type === 'google_drive' && resource.external_url) {
        window.open(resource.external_url, '_blank');
      } else if (resource.file_url) {
        window.open(resource.file_url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading resource:', error);
    }
  };

  const handleViewResource = async (resource: ResourceStorage.AssociationResource) => {
    try {
      await ResourceStorage.incrementViewCount(resource.id);

      if (resource.resource_type === 'google_drive' && resource.external_url) {
        window.open(resource.external_url, '_blank');
      } else if (resource.resource_type === 'link' && resource.external_url) {
        window.open(resource.external_url, '_blank');
      } else if (resource.file_url) {
        window.open(resource.file_url, '_blank');
      }
    } catch (error) {
      console.error('Error viewing resource:', error);
    }
  };

  const handleAddTag = () => {
    if (resourceTagInput.trim() && !resourceTags.includes(resourceTagInput.trim())) {
      setResourceTags([...resourceTags, resourceTagInput.trim()]);
      setResourceTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setResourceTags(resourceTags.filter(t => t !== tag));
  };

  const handleSyncGoogleDriveResources = async (silent = false) => {
    if (!organizationId || syncingGoogleDrive) return;

    try {
      // Use the currently selected category, or ensure one exists
      const categoryToUse = selectedCategory || await ensureCategoryExists();
      const category = categories.find(c => c.id === categoryToUse);

      let folderId = category?.google_drive_folder_id;

      if (!folderId) {
        const idColumn = organizationType === 'club' ? 'club_id' :
                        organizationType === 'state' ? 'state_association_id' :
                        'national_association_id';

        const { data: integration } = await supabase
          .from('integrations')
          .select('credentials')
          .eq(idColumn, organizationId)
          .eq('platform', 'google_drive')
          .maybeSingle();

        folderId = integration?.credentials?.folder_id || integration?.credentials?.root_folder_id;
      }

      if (!folderId) {
        addNotification('No Google Drive folder configured. Please set up Google Drive in Settings.', 'error');
        return;
      }

      if (!silent) {
        setSyncingGoogleDrive(true);
      }
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-google-drive-files`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'sync',
            organizationId,
            organizationType,
            folderId
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Google Drive sync error:', errorData);
        if (response.status === 400) {
          addNotification(errorData.error || 'Please configure Google Drive integration in Settings first.', 'error');
          return;
        }
        throw new Error(errorData.error || 'Failed to sync Google Drive resources');
      }

      const data = await response.json();
      console.log('Google Drive sync response:', data);

      // Create database entries for files that don't exist yet
      let newCount = 0;
      let updatedCount = 0;

      if (data.success && data.files) {
        console.log(`Processing ${data.files.length} files from Google Drive`);

        for (const file of data.files) {
          console.log('Processing file:', file.name, 'ID:', file.id);

          // Check if this file already exists in the database
          const { data: existingResource, error: checkError } = await supabase
            .from('resources')
            .select('id')
            .eq('google_drive_file_id', file.id)
            .eq('category_id', categoryToUse)
            .maybeSingle();

          if (checkError) {
            console.error('Error checking for existing resource:', checkError);
          }

          console.log('Existing resource:', existingResource ? 'Found' : 'Not found');

          if (!existingResource) {
            try {
              // Create new resource entry
              const newResource = await ResourceStorage.createResource({
                category_id: categoryToUse,
                title: file.name,
                description: `Synced from Google Drive`,
                resource_type: 'google_drive',
                external_url: file.webViewLink,
                google_drive_file_id: file.id,
                file_type: file.mimeType,
                file_size: parseInt(file.size || '0'),
                is_public: true,
                is_featured: false,
                tags: [],
                display_order: 0,
                created_by: user?.id,
                sync_status: 'synced',
                last_synced_at: new Date().toISOString()
              });
              console.log('Created new resource:', newResource);
              newCount++;
            } catch (createError) {
              console.error('Error creating resource:', createError);
              throw createError;
            }
          } else {
            console.log('Resource already exists, skipping');
            updatedCount++;
          }
        }
      }

      console.log(`Sync complete: ${newCount} new, ${updatedCount} existing`);

      if (!category?.google_drive_folder_id && categoryToUse && folderId) {
        await supabase
          .from('resource_categories')
          .update({ google_drive_folder_id: folderId })
          .eq('id', categoryToUse);
      }

      await loadResources();
      await loadData();

      if (!silent || newCount > 0) {
        let message = 'Successfully synced! All files are up to date.';

        if (newCount > 0) {
          message = `Added ${newCount} ${newCount === 1 ? 'file' : 'files'} from Google Drive`;
        }

        addNotification(message, 'success');
      }
    } catch (error: any) {
      console.error('Error syncing Google Drive resources:', error);
      if (!silent) {
        addNotification('Failed to sync Google Drive resources. Please check your Google Drive integration.', 'error');
      }
    } finally {
      if (!silent) {
        setSyncingGoogleDrive(false);
      }
    }
  };

  const getResourceIcon = (type: string, fileType?: string) => {
    if (type === 'page') return FileText;
    if (type === 'link') return LinkIcon;
    if (type === 'external_tool') return ExternalLink;
    if (type === 'google_drive') return HardDrive;

    if (type === 'file') {
      if (fileType?.startsWith('audio/')) return Music;
      if (fileType?.startsWith('image/')) return ImageIcon;
      if (fileType?.includes('pdf')) return File;
      return File;
    }

    return File;
  };

  // Combine club resources and association resources ONLY when viewing "All Resources" or "Association"
  // Do NOT mix association resources when a specific category is selected
  const allResources = organizationType === 'club' && !selectedCategory
    ? [...resources, ...associationResources]
    : resources;

  const filteredResources = allResources.filter(resource => {
    const matchesSearch = resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === 'all' || resource.resource_type === filterType;

    // For "My Club" view, only show Google Drive synced resources (not manually uploaded ones)
    // Google Drive synced resources have sync_status = 'synced' and come from the root folders
    const matchesSource =
      filterSource === 'all' ||
      (filterSource === 'club' && !resource.source_organization_type && resource.sync_status === 'synced') ||
      (filterSource === 'association' && resource.source_organization_type);

    // Filter by current folder path for Google Drive resources
    const matchesFolder = resource.resource_type === 'google_drive'
      ? (resource.google_drive_folder_path || '') === currentFolderPath
      : true;

    return matchesSearch && matchesType && matchesSource && matchesFolder;
  });

  // Separate folders and files
  const folders = filteredResources.filter(r => r.is_folder);
  const files = filteredResources.filter(r => !r.is_folder);
  const sortedResources = [...folders, ...files];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className={`mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Loading resources...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white/60 border-gray-200'} border-b backdrop-blur-sm`}>
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Club Resources
              </h1>
              <p className={`mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Manage documents, files, links, and tools for your club members
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 transition-all duration-200"
            >
              <Plus className="w-5 h-5" />
              <span>New Category</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-8rem)]">
        {/* Sidebar */}
        <div className={`w-80 ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-white/30 border-gray-200'} border-r overflow-y-auto`}>
          <div className="p-6">
            <h2 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Categories
            </h2>

            {/* All Resources */}
            <button
              onClick={() => {
                setSelectedCategory(null);
                setFilterSource('club');
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 ${
                selectedCategory === null && filterSource === 'club'
                  ? darkMode
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                  : darkMode
                  ? 'text-gray-400 hover:bg-slate-700/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <FolderOpen className="w-5 h-5" />
              <span className="flex-1 text-left">All Resources</span>
            </button>

            {/* My Club */}
            <button
              onClick={() => {
                setSelectedCategory(null);
                setFilterSource('club');
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 ${
                selectedCategory === null && filterSource === 'club'
                  ? darkMode
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-green-50 text-green-700 border border-green-200'
                  : darkMode
                  ? 'text-gray-400 hover:bg-slate-700/50'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Building2 className="w-5 h-5" />
              <span className="flex-1 text-left">My Club</span>
            </button>

            {/* Association */}
            {organizationType === 'club' && associationResources.length > 0 && (
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setFilterSource('association');
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-4 transition-all duration-200 ${
                  selectedCategory === null && filterSource === 'association'
                    ? darkMode
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                    : darkMode
                    ? 'text-gray-400 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Building2 className="w-5 h-5" />
                <span className="flex-1 text-left">Association</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  darkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                }`}>
                  {associationResources.length}
                </span>
              </button>
            )}

            <div className={`border-t pt-4 mt-4 ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              {categories.map((category) => (
                <div
                  key={category.id}
                  className={`group flex items-center gap-2 mb-1 rounded-lg ${
                    selectedCategory === category.id
                      ? darkMode
                        ? 'bg-slate-700'
                        : 'bg-gray-100'
                      : ''
                  }`}
                >
                  <button
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      selectedCategory === category.id
                        ? darkMode
                          ? 'text-blue-400'
                          : 'text-blue-700'
                        : darkMode
                        ? 'text-gray-400 hover:bg-slate-700/50'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <FolderOpen className="w-5 h-5" />
                    <span className="flex-1 text-left">{category.name}</span>
                    {category.google_drive_folder_id && (
                      <HardDrive
                        className={`w-4 h-4 ${darkMode ? 'text-green-400' : 'text-green-600'}`}
                        title="Linked to Google Drive"
                      />
                    )}
                  </button>

                  <div className="flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryName(category.name);
                        setCategoryDescription(category.description || '');
                        setCategoryIcon(category.icon);
                        setShowCategoryModal(true);
                      }}
                      className={`p-1 rounded hover:bg-slate-600 ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                      title="Edit category"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
                      className={`p-1 rounded hover:bg-red-600 ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                      title="Delete category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              {/* Search and Filters */}
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="text"
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-all duration-200 ${
                      darkMode
                        ? 'bg-slate-800/50 border-slate-700 text-white placeholder-gray-500 focus:border-blue-500'
                        : 'bg-white/60 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                    darkMode
                      ? 'bg-slate-800/50 border-slate-700 text-white'
                      : 'bg-white/60 border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                >
                  <option value="all">All Types</option>
                  <option value="page">Pages</option>
                  <option value="file">Files</option>
                  <option value="link">Links</option>
                  <option value="google_drive">Google Drive</option>
                  <option value="external_tool">External Tools</option>
                </select>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      viewMode === 'grid'
                        ? darkMode
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-50 text-blue-700'
                        : darkMode
                        ? 'text-gray-400 hover:bg-slate-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Grid view"
                  >
                    <Grid className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      viewMode === 'list'
                        ? darkMode
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-blue-50 text-blue-700'
                        : darkMode
                        ? 'text-gray-400 hover:bg-slate-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title="List view"
                  >
                    <List className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 ml-4">
                {hasGoogleDriveIntegration ? (
                  <button
                    onClick={handleSyncGoogleDriveResources}
                    disabled={syncingGoogleDrive}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 ${
                      syncingGoogleDrive
                        ? 'opacity-75 cursor-wait'
                        : darkMode
                        ? 'bg-slate-800/50 border-slate-700 text-white hover:bg-slate-700'
                        : 'bg-white/60 border-gray-300 text-gray-900 hover:bg-gray-50'
                    }`}
                    title="Sync Google Drive resources"
                  >
                    <RefreshCw className={`w-5 h-5 ${syncingGoogleDrive ? 'animate-spin' : ''}`} />
                    <span>{syncingGoogleDrive ? 'Syncing...' : 'Sync Drive'}</span>
                  </button>
                ) : (
                  <div className="relative group">
                    <button
                      disabled
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200 opacity-50 cursor-not-allowed ${
                        darkMode
                          ? 'bg-slate-800/50 border-slate-700 text-white'
                          : 'bg-white/60 border-gray-300 text-gray-900'
                      }`}
                      title="Google Drive not configured"
                    >
                      <RefreshCw className="w-5 h-5" />
                      <span>Sync Drive</span>
                    </button>
                    <div className={`absolute left-0 top-full mt-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 ${
                      darkMode ? 'bg-slate-700 text-white' : 'bg-gray-800 text-white'
                    }`}>
                      Configure Google Drive in Settings first
                    </div>
                  </div>
                )}

                <button
                  onClick={async () => {
                    await ensureCategoryExists();
                    setEditingResource(null);
                    setShowResourceModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 animate-pulse"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Resource</span>
                </button>
              </div>
            </div>

            {/* Folder Breadcrumb Navigation */}
            {(currentFolderPath || folders.length > 0) && (
              <div className={`flex items-center justify-between gap-2 text-sm mb-4 p-3 rounded-lg ${
                darkMode ? 'bg-slate-800/50 text-gray-300' : 'bg-gray-50 text-gray-700'
              }`}>
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  {currentFolderPath ? (
                    <>
                      <button
                        onClick={() => setCurrentFolderPath('')}
                        className={`hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
                      >
                        Home
                      </button>
                      {currentFolderPath.split('/').map((folder, index, arr) => {
                        const pathToFolder = arr.slice(0, index + 1).join('/');
                        return (
                          <React.Fragment key={pathToFolder}>
                            <span className={darkMode ? 'text-gray-600' : 'text-gray-400'}>/</span>
                            {index === arr.length - 1 ? (
                              <span className="font-medium">{folder}</span>
                            ) : (
                              <button
                                onClick={() => setCurrentFolderPath(pathToFolder)}
                                className={`hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
                              >
                                {folder}
                              </button>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                  ) : (
                    <span className="font-medium">All Files</span>
                  )}
                </div>
                {folders.length > 0 && !currentFolderPath && (
                  <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    Click a folder to view its contents
                  </span>
                )}
              </div>
            )}

            {/* Resources Grid/List */}
            {sortedResources.length === 0 ? (
              <div className="text-center py-16">
                <FileText className={`w-20 h-20 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  No resources yet
                </p>
                <p className={`mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  {hasGoogleDriveIntegration
                    ? 'Sync your Google Drive or add resources manually'
                    : 'Get started by creating a resource or category'}
                </p>
                <button
                  onClick={async () => {
                    await ensureCategoryExists();
                    setEditingResource(null);
                    setShowResourceModal(true);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105 transition-all duration-200 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Your First Resource</span>
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {sortedResources.map((resource) => {
                  const IconComponent = getResourceIcon(resource.resource_type, resource.file_type);
                  const isFolder = resource.is_folder;

                  return (
                    <div
                      key={resource.id}
                      className={`group relative rounded-xl border p-6 transition-all duration-200 hover:shadow-lg ${
                        darkMode
                          ? 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                          : 'bg-white/60 border-gray-200 hover:border-blue-300'
                      } ${isFolder ? 'cursor-pointer' : ''}`}
                      onClick={() => {
                        if (isFolder && resource.google_drive_folder_path !== undefined) {
                          const newPath = resource.google_drive_folder_path
                            ? `${resource.google_drive_folder_path}/${resource.title}`
                            : resource.title;
                          setCurrentFolderPath(newPath);
                        }
                      }}
                    >
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-3 rounded-lg ${
                            isFolder
                              ? darkMode ? 'bg-yellow-500/20' : 'bg-yellow-50'
                              : resource.resource_type === 'google_drive'
                              ? darkMode ? 'bg-blue-500/20' : 'bg-blue-50'
                              : darkMode ? 'bg-slate-700' : 'bg-gray-100'
                          }`}>
                            {isFolder ? (
                              <FolderOpen className={`w-6 h-6 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                            ) : (
                              <IconComponent className={`w-6 h-6 ${
                                resource.resource_type === 'google_drive'
                                  ? darkMode ? 'text-blue-400' : 'text-blue-600'
                                  : darkMode ? 'text-gray-400' : 'text-gray-600'
                              }`} />
                            )}
                          </div>

                          {!isFolder && resource.is_featured && (
                            <Star className={`w-5 h-5 fill-current ${darkMode ? 'text-yellow-400' : 'text-yellow-500'}`} />
                          )}
                        </div>

                        <h3 className={`text-lg font-semibold mb-2 line-clamp-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {resource.title}
                        </h3>

                        {resource.description && !isFolder && (
                          <p className={`text-sm mb-3 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {resource.description}
                          </p>
                        )}

                        {/* Source Organization Badge */}
                        {resource.source_organization_type && (
                          <div className="mb-3">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                              darkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                            }`}>
                              <Building2 className="w-3 h-3" />
                              {resource.source_organization_name || 'Association'}
                            </span>
                          </div>
                        )}

                        {/* Uploader Info */}
                        {resource.uploader_name && !resource.is_folder && (
                          <p className={`text-xs mb-3 flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            <Users className="w-3 h-3" />
                            Uploaded by {resource.uploader_name}
                          </p>
                        )}

                        {!isFolder && (
                          <>
                            <div className={`flex items-center gap-4 text-xs mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              <span className="flex items-center gap-1">
                                <Download className="w-3 h-3" />
                                {resource.download_count}
                              </span>
                              <span>{resource.view_count} views</span>
                              {resource.is_public ? (
                                <span className="flex items-center gap-1">
                                  <Unlock className="w-3 h-3" />
                                  Public
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Lock className="w-3 h-3" />
                                  Private
                                </span>
                              )}
                            </div>

                            {resource.tags && resource.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-4">
                                {resource.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className={`text-xs px-2 py-1 rounded-full ${
                                      darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                                    }`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewResource(resource);
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                                  darkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                <ExternalLink className="w-4 h-4" />
                                <span>View</span>
                              </button>

                              {!resource.source_organization_type && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingResource(resource);
                                      setResourceTitle(resource.title);
                                      setResourceDescription(resource.description || '');
                                      setResourceType(resource.resource_type);
                                      setResourceContent(resource.content || '');
                                      setResourceExternalUrl(resource.external_url || '');
                                      setResourceIsPublic(resource.is_public);
                                      setResourceIsFeatured(resource.is_featured);
                                      setResourceTags(resource.tags || []);
                                      setShowResourceModal(true);
                                    }}
                                    className={`p-2 rounded-lg transition-all duration-200 ${
                                      darkMode
                                        ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                    title="Edit resource"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteResource(resource.id, resource.file_url);
                                    }}
                                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
                                    title="Delete resource"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedResources.map((resource) => {
                    const IconComponent = getResourceIcon(resource.resource_type, resource.file_type);
                    const isFolder = resource.is_folder;

                    return (
                      <div
                        key={resource.id}
                        className={`group flex items-center gap-4 p-4 rounded-lg border transition-all duration-200 ${
                          darkMode
                            ? 'bg-slate-800/50 border-slate-700 hover:border-blue-500/50'
                            : 'bg-white/60 border-gray-200 hover:border-blue-300'
                        } ${isFolder ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (isFolder && resource.google_drive_folder_path !== undefined) {
                            const newPath = resource.google_drive_folder_path
                              ? `${resource.google_drive_folder_path}/${resource.title}`
                              : resource.title;
                            setCurrentFolderPath(newPath);
                          }
                        }}
                      >
                        <div className={`p-2 rounded-lg ${
                          isFolder
                            ? darkMode ? 'bg-yellow-500/20' : 'bg-yellow-50'
                            : resource.resource_type === 'google_drive'
                            ? darkMode ? 'bg-blue-500/20' : 'bg-blue-50'
                            : darkMode ? 'bg-slate-700' : 'bg-gray-100'
                        }`}>
                          {isFolder ? (
                            <FolderOpen className={`w-5 h-5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                          ) : (
                            <IconComponent className={`w-5 h-5 ${
                              resource.resource_type === 'google_drive'
                                ? darkMode ? 'text-blue-400' : 'text-blue-600'
                                : darkMode ? 'text-gray-400' : 'text-gray-600'
                            }`} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={`font-medium truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {resource.title}
                            </h3>
                            {!isFolder && resource.is_featured && (
                              <Star className={`w-4 h-4 fill-current flex-shrink-0 ${darkMode ? 'text-yellow-400' : 'text-yellow-500'}`} />
                            )}
                            {resource.source_organization_type && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                                darkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                              }`}>
                                <Building2 className="w-3 h-3" />
                                {resource.source_organization_name || 'Association'}
                              </span>
                            )}
                          </div>

                          {resource.description && !isFolder && (
                            <p className={`text-sm truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {resource.description}
                            </p>
                          )}

                          {/* Uploader Info */}
                          {resource.uploader_name && !resource.is_folder && (
                            <p className={`text-xs mt-1 flex items-center gap-1 ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              <Users className="w-3 h-3" />
                              Uploaded by {resource.uploader_name}
                            </p>
                          )}
                        </div>

                        {!isFolder && (
                          <div className="flex items-center gap-4">
                            <div className={`flex items-center gap-4 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                              <span className="flex items-center gap-1">
                                <Download className="w-3 h-3" />
                                {resource.download_count}
                              </span>
                              <span>{resource.view_count} views</span>
                              {resource.is_public ? (
                                <Unlock className="w-4 h-4" title="Public" />
                              ) : (
                                <Lock className="w-4 h-4" title="Private" />
                              )}
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewResource(resource);
                                }}
                                className={`p-2 rounded-lg transition-all duration-200 ${
                                  darkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                                title="View resource"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>

                              {!resource.source_organization_type && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingResource(resource);
                                      setResourceTitle(resource.title);
                                      setResourceDescription(resource.description || '');
                                      setResourceType(resource.resource_type);
                                      setResourceContent(resource.content || '');
                                      setResourceExternalUrl(resource.external_url || '');
                                      setResourceIsPublic(resource.is_public);
                                      setResourceIsFeatured(resource.is_featured);
                                      setResourceTags(resource.tags || []);
                                      setShowResourceModal(true);
                                    }}
                                    className={`p-2 rounded-lg transition-all duration-200 ${
                                      darkMode
                                        ? 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                    title="Edit resource"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteResource(resource.id, resource.file_url);
                                    }}
                                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
                                    title="Delete resource"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-2xl max-w-md w-full`}>
            <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {editingCategory ? 'Edit Category' : 'New Category'}
              </h2>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  resetCategoryForm();
                }}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Category Name
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  placeholder="Enter category name"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  placeholder="Describe this category"
                />
              </div>
            </div>

            <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  resetCategoryForm();
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={!categoryName.trim() || categorySaving}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {categorySaving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resource Modal */}
      {showResourceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-2xl max-w-2xl w-full my-8`}>
            <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {editingResource ? 'Edit Resource' : 'New Resource'}
              </h2>
              <button
                onClick={() => {
                  setShowResourceModal(false);
                  resetResourceForm();
                }}
                className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Title
                </label>
                <input
                  type="text"
                  value={resourceTitle}
                  onChange={(e) => setResourceTitle(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  placeholder="Enter resource title"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={resourceDescription}
                  onChange={(e) => setResourceDescription(e.target.value)}
                  rows={3}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  placeholder="Describe this resource"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Resource Type
                </label>
                <select
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value as any)}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                >
                  <option value="page">Page</option>
                  <option value="file">File Upload</option>
                  <option value="link">Link</option>
                  <option value="external_tool">External Tool</option>
                </select>
              </div>

              {resourceType === 'file' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Upload File
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setResourceFile(e.target.files?.[0] || null)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  />
                </div>
              )}

              {(resourceType === 'link' || resourceType === 'external_tool') && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    URL
                  </label>
                  <input
                    type="url"
                    value={resourceExternalUrl}
                    onChange={(e) => setResourceExternalUrl(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                    placeholder="https://example.com"
                  />
                </div>
              )}

              {resourceType === 'page' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Content
                  </label>
                  <textarea
                    value={resourceContent}
                    onChange={(e) => setResourceContent(e.target.value)}
                    rows={8}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                    placeholder="Enter page content"
                  />
                </div>
              )}

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Tags (Optional)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={resourceTagInput}
                    onChange={(e) => setResourceTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                    placeholder="Add a tag"
                  />
                  <button
                    onClick={handleAddTag}
                    type="button"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {resourceTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {resourceTags.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                          darkMode ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className={`hover:text-red-500 transition-colors`}
                        >
                          <LogOut className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resourceIsPublic}
                    onChange={(e) => setResourceIsPublic(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Public (visible to all members)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resourceIsFeatured}
                    onChange={(e) => setResourceIsFeatured(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Featured
                  </span>
                </label>
              </div>
            </div>

            <div className={`flex items-center justify-end gap-3 p-6 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
              <button
                onClick={() => {
                  setShowResourceModal(false);
                  resetResourceForm();
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveResource}
                disabled={!resourceTitle.trim() || resourceSaving}
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {resourceSaving ? 'Saving...' : editingResource ? 'Update Resource' : 'Create Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
