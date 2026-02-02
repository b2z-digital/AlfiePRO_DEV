import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../utils/supabase';
import imageCompression from 'browser-image-compression';

interface AssociationProfileSettingsProps {
  darkMode: boolean;
}

export const AssociationProfileSettings: React.FC<AssociationProfileSettingsProps> = ({ darkMode }) => {
  const { currentOrganization } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'profile'>('profile');
  const [associationName, setAssociationName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const tableName = currentOrganization?.type === 'state' ? 'state_associations' : 'national_associations';
  const associationType = currentOrganization?.type === 'state' ? 'State' : 'National';
  useEffect(() => {
    if (currentOrganization) {
      loadAssociationData();
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    const words = description.trim().split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);
  }, [description]);

  const loadAssociationData = async () => {
    if (!currentOrganization?.id) return;

    try {
      // First try to load basic profile data
      const { data: profileData, error: profileError } = await supabase
        .from(tableName)
        .select('name, short_name, description, logo_url, cover_image_url')
        .eq('id', currentOrganization.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profileData) {
        setAssociationName(profileData.name || '');
        setShortName(profileData.short_name || '');
        setDescription(profileData.description || '');
        setLogoUrl(profileData.logo_url || null);
        setCoverImageUrl(profileData.cover_image_url || null);
      }
    } catch (err: any) {
      console.error('Error loading association data:', err);
      setError(err.message || 'Failed to load association data');
    }
  };

  const handleImageChange = async (file: File, type: 'logo' | 'cover') => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: type === 'logo' ? 500 : 1920,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);

      if (type === 'logo') {
        setLogoFile(compressedFile);
        setLogoUrl(URL.createObjectURL(compressedFile));
      } else {
        setCoverImageFile(compressedFile);
        setCoverImageUrl(URL.createObjectURL(compressedFile));
      }
    } catch (err) {
      console.error('Error compressing image:', err);
      setError('Failed to process image');
    }
  };

  const handleDragOver = (e: React.DragEvent, type: 'logo' | 'cover') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(true);
    } else {
      setIsDraggingCover(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, type: 'logo' | 'cover') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(false);
    } else {
      setIsDraggingCover(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, type: 'logo' | 'cover') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(false);
    } else {
      setIsDraggingCover(false);
    }

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      await handleImageChange(imageFile, type);
    }
  };

  const uploadImage = async (file: File, type: 'logo' | 'cover'): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentOrganization?.id}-${type}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let newLogoUrl = logoUrl;
      let newCoverUrl = coverImageUrl;

      if (logoFile) {
        newLogoUrl = await uploadImage(logoFile, 'logo');
      }

      if (coverImageFile) {
        newCoverUrl = await uploadImage(coverImageFile, 'cover');
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          name: associationName,
          short_name: shortName,
          description,
          logo_url: newLogoUrl,
          cover_image_url: newCoverUrl,
        })
        .eq('id', currentOrganization?.id);

      if (updateError) throw updateError;

      addNotification(`${associationType} Association profile updated successfully!`, 'success');
      setLogoFile(null);
      setCoverImageFile(null);
    } catch (err: any) {
      console.error('Error updating association:', err);
      setError(err.message || 'Failed to update association profile');
    } finally {
      setLoading(false);
    }
  };

  if (!currentOrganization) {
    return (
      <div className={`p-6 rounded-xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm`}>
        <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          No association selected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className={`rounded-xl ${darkMode ? 'bg-gray-800/50' : 'bg-gray-900/5'} border ${darkMode ? 'border-gray-700/50' : 'border-gray-200/50'} overflow-hidden`}>
        <div className={`border-b ${darkMode ? 'border-gray-700/50' : 'border-gray-200/50'}`}>
          <div className="flex">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-6 py-3 font-medium transition-colors relative ${
                activeTab === 'profile'
                  ? darkMode
                    ? 'text-blue-400'
                    : 'text-blue-600'
                  : darkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Profile
              {activeTab === 'profile' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${darkMode ? 'bg-blue-400' : 'bg-blue-600'}`} />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {error && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-red-900/20' : 'bg-red-50'} border ${darkMode ? 'border-red-800/50' : 'border-red-200/50'} flex items-start gap-3`}>
                  <AlertCircle className={`${darkMode ? 'text-red-400' : 'text-red-600'} flex-shrink-0 mt-0.5`} size={20} />
                  <div className="flex-1">
                    <h3 className={`font-medium ${darkMode ? 'text-red-200' : 'text-red-900'} mb-1`}>Error</h3>
                    <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className={`${darkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                  >
                    <X size={20} />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {associationType} Association Name *
                  </label>
                  <input
                    type="text"
                    value={associationName}
                    onChange={(e) => setAssociationName(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Short Name / Abbreviation
                  </label>
                  <input
                    type="text"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="e.g., NSW, VIC"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="Describe your association..."
                />
                <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {wordCount} words
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Logo
                  </label>
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDraggingLogo
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : darkMode
                        ? 'border-gray-600 hover:border-gray-500'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => logoInputRef.current?.click()}
                    onDragOver={(e) => handleDragOver(e, 'logo')}
                    onDragLeave={(e) => handleDragLeave(e, 'logo')}
                    onDrop={(e) => handleDrop(e, 'logo')}
                  >
                    {logoUrl ? (
                      <div className="relative">
                        <img
                          src={logoUrl}
                          alt="Logo preview"
                          className="max-h-32 mx-auto rounded"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogoUrl(null);
                            setLogoFile(null);
                          }}
                          className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <ImageIcon className={`mx-auto mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} size={40} />
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Click or drag to upload
                        </p>
                      </div>
                    )}
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageChange(file, 'logo');
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Cover Image
                  </label>
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isDraggingCover
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : darkMode
                        ? 'border-gray-600 hover:border-gray-500'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => coverInputRef.current?.click()}
                    onDragOver={(e) => handleDragOver(e, 'cover')}
                    onDragLeave={(e) => handleDragLeave(e, 'cover')}
                    onDrop={(e) => handleDrop(e, 'cover')}
                  >
                    {coverImageUrl ? (
                      <div className="relative">
                        <img
                          src={coverImageUrl}
                          alt="Cover preview"
                          className="max-h-32 mx-auto rounded"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCoverImageUrl(null);
                            setCoverImageFile(null);
                          }}
                          className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <ImageIcon className={`mx-auto mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} size={40} />
                        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Click or drag to upload
                        </p>
                      </div>
                    )}
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageChange(file, 'cover');
                      }}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg ${
                    darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                  } text-white transition-colors disabled:opacity-50`}
                >
                  <Save size={18} />
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
