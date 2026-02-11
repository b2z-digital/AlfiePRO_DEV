import React, { useState, useEffect, useRef } from 'react';
import { Save, Upload, X, Image as ImageIcon, AlertCircle, Check, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import imageCompression from 'browser-image-compression';
import CoverImageUploadModal from '../CoverImageUploadModal';

interface ClubProfileSettingsProps {
  darkMode: boolean;
}

interface StateAssociation {
  id: string;
  name: string;
  state: string;
  status: string;
}

interface BoatClass {
  id: string;
  name: string;
}

interface SailingDay {
  id?: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  boat_class_id: string | null;
  description: string;
  is_active: boolean;
}

export const ClubProfileSettings: React.FC<ClubProfileSettingsProps> = ({ darkMode }) => {
  const { currentClub, refreshClubData } = useAuth();
  const [clubName, setClubName] = useState('');
  const [abbreviatedName, setAbbreviatedName] = useState('');
  const [clubIntroduction, setClubIntroduction] = useState('');
  const [stateAssociationId, setStateAssociationId] = useState<string>('');
  const [stateAssociations, setStateAssociations] = useState<StateAssociation[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [featuredImageUrl, setFeaturedImageUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [featuredImageFile, setFeaturedImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingFeatured, setIsDraggingFeatured] = useState(false);
  const [showCoverImageModal, setShowCoverImageModal] = useState(false);
  const [coverImagePosition, setCoverImagePosition] = useState({ x: 0, y: 0, scale: 1 });
  const [sailingDays, setSailingDays] = useState<SailingDay[]>([]);
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentClub) {
      loadClubData();
      loadStateAssociations();
      loadSailingDays();
      loadBoatClasses();
    }
  }, [currentClub?.clubId]);

  useEffect(() => {
    // Count words in introduction
    const words = clubIntroduction.trim().split(/\s+/).filter(word => word.length > 0);
    setWordCount(words.length);
  }, [clubIntroduction]);

  const loadClubData = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('name, abbreviation, logo, club_introduction, featured_image_url, cover_image_url, cover_image_position_x, cover_image_position_y, cover_image_scale, state_association_id')
        .eq('id', currentClub.clubId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setClubName(data.name || '');
        setAbbreviatedName(data.abbreviation || '');
        setClubIntroduction(data.club_introduction || '');
        setLogoUrl(data.logo || null);
        // Use cover_image_url if available, fall back to featured_image_url for backwards compatibility
        setFeaturedImageUrl(data.cover_image_url || data.featured_image_url || null);
        setStateAssociationId(data.state_association_id || '');
        setCoverImagePosition({
          x: data.cover_image_position_x || 0,
          y: data.cover_image_position_y || 0,
          scale: data.cover_image_scale || 1
        });
      }
    } catch (err) {
      console.error('Error loading club data:', err);
      setError('Failed to load club data');
    }
  };

  const loadStateAssociations = async () => {
    try {
      const { data, error } = await supabase
        .from('state_associations')
        .select('id, name, state, status')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setStateAssociations(data || []);
    } catch (err) {
      console.error('Error loading state associations:', err);
    }
  };

  const loadSailingDays = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('club_sailing_days')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('day_of_week');

      if (error) throw error;
      setSailingDays(data || []);
    } catch (err) {
      console.error('Error loading sailing days:', err);
    }
  };

  const loadBoatClasses = async () => {
    if (!currentClub?.clubId) return;

    try {
      const { data, error } = await supabase
        .from('club_boat_classes')
        .select('boat_class_id, boat_classes(id, name)')
        .eq('club_id', currentClub.clubId);

      if (error) throw error;

      const classes = data?.map((item: any) => ({
        id: item.boat_classes.id,
        name: item.boat_classes.name
      })) || [];

      setBoatClasses(classes);
    } catch (err) {
      console.error('Error loading boat classes:', err);
    }
  };

  const addSailingDay = () => {
    setSailingDays([...sailingDays, {
      day_of_week: 'Saturday',
      start_time: '12:00',
      end_time: '16:00',
      boat_class_id: null,
      description: '',
      is_active: true
    }]);
  };

  const updateSailingDay = (index: number, field: keyof SailingDay, value: any) => {
    const updated = [...sailingDays];
    updated[index] = { ...updated[index], [field]: value };
    setSailingDays(updated);
  };

  const removeSailingDay = async (index: number) => {
    const dayToRemove = sailingDays[index];

    // If it has an ID, delete from database
    if (dayToRemove.id) {
      try {
        const { error } = await supabase
          .from('club_sailing_days')
          .delete()
          .eq('id', dayToRemove.id);

        if (error) throw error;
      } catch (err) {
        console.error('Error deleting sailing day:', err);
        setError('Failed to delete sailing day');
        return;
      }
    }

    // Remove from state
    setSailingDays(sailingDays.filter((_, i) => i !== index));
  };

  const handleImageChange = async (file: File, type: 'logo' | 'featured') => {
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
        setFeaturedImageFile(compressedFile);
        setFeaturedImageUrl(URL.createObjectURL(compressedFile));
      }
    } catch (err) {
      console.error('Error compressing image:', err);
      setError('Failed to process image');
    }
  };

  const handleDragOver = (e: React.DragEvent, type: 'logo' | 'featured') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(true);
    } else {
      setIsDraggingFeatured(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent, type: 'logo' | 'featured') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(false);
    } else {
      setIsDraggingFeatured(false);
    }
  };

  const handleDrop = async (e: React.DragEvent, type: 'logo' | 'featured') => {
    e.preventDefault();
    if (type === 'logo') {
      setIsDraggingLogo(false);
    } else {
      setIsDraggingFeatured(false);
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        await handleImageChange(file, type);
      } else {
        setError('Please upload an image file');
      }
    }
  };

  const uploadImage = async (file: File, path: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${path}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err) {
      console.error('Error uploading image:', err);
      return null;
    }
  };

  const handleSave = async () => {
    if (!currentClub?.clubId) return;

    if (!clubName.trim()) {
      setError('Club name is required');
      return;
    }

    if (!abbreviatedName.trim()) {
      setError('Abbreviated name is required');
      return;
    }

    if (wordCount > 600) {
      setError('Club introduction must be under 600 words');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let newLogoUrl = logoUrl;
      let newFeaturedImageUrl = featuredImageUrl;

      // Upload logo if changed
      if (logoFile) {
        const uploadedUrl = await uploadImage(logoFile, `clubs/${currentClub.clubId}/logo`);
        if (uploadedUrl) newLogoUrl = uploadedUrl;
      }

      // Upload featured image if changed
      if (featuredImageFile) {
        const uploadedUrl = await uploadImage(featuredImageFile, `clubs/${currentClub.clubId}/featured`);
        if (uploadedUrl) newFeaturedImageUrl = uploadedUrl;
      }

      // Update club data
      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          name: clubName.trim(),
          abbreviation: abbreviatedName.trim(),
          club_introduction: clubIntroduction.trim() || null,
          logo: newLogoUrl,
          featured_image_url: newFeaturedImageUrl,
          cover_image_url: newFeaturedImageUrl, // Sync with cover_image_url
          state_association_id: stateAssociationId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentClub.clubId);

      if (updateError) throw updateError;

      // Save sailing days
      for (const day of sailingDays) {
        if (day.id) {
          // Update existing sailing day
          const { error: dayError } = await supabase
            .from('club_sailing_days')
            .update({
              day_of_week: day.day_of_week,
              start_time: day.start_time,
              end_time: day.end_time,
              boat_class_id: day.boat_class_id,
              description: day.description,
              is_active: day.is_active
            })
            .eq('id', day.id);

          if (dayError) throw dayError;
        } else {
          // Insert new sailing day
          const { error: dayError } = await supabase
            .from('club_sailing_days')
            .insert({
              club_id: currentClub.clubId,
              day_of_week: day.day_of_week,
              start_time: day.start_time,
              end_time: day.end_time,
              boat_class_id: day.boat_class_id,
              description: day.description,
              is_active: day.is_active
            });

          if (dayError) throw dayError;
        }
      }

      setSuccess(true);
      setLogoFile(null);
      setFeaturedImageFile(null);

      // Reload sailing days to get IDs for newly added ones
      await loadSailingDays();

      // Refresh club data in auth context
      if (refreshClubData) {
        await refreshClubData();
      }

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving club profile:', err);
      setError('Failed to save club profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCoverImage = async (file: File, position: { x: number; y: number; scale: number }) => {
    if (!currentClub?.clubId) {
      throw new Error('No club selected');
    }

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${currentClub.clubId}/cover-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          cover_image_url: publicUrl,
          featured_image_url: publicUrl,
          cover_image_position_x: position.x,
          cover_image_position_y: position.y,
          cover_image_scale: position.scale
        })
        .eq('id', currentClub.clubId);

      if (updateError) throw updateError;

      setFeaturedImageUrl(publicUrl);
      setCoverImagePosition(position);

      if (refreshClubData) {
        await refreshClubData();
      }
    } catch (error) {
      console.error('Error saving cover image:', error);
      throw error;
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">
          Club Profile
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Manage your club's basic information and branding
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <Check size={20} className="text-green-400" />
          <span className="text-green-400 text-sm">Club profile updated successfully</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={20} className="text-red-400" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}

      {/* Basic Information */}
      <div className="space-y-6">
      <div className="p-6 rounded-lg border bg-slate-800 border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-white">
          Basic Information
        </h3>

        <div className="space-y-4">
          {/* Club Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Club Name *
            </label>
            <input
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border bg-slate-700 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter club name"
            />
          </div>

          {/* Abbreviated Name */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Abbreviated Name *
            </label>
            <input
              type="text"
              value={abbreviatedName}
              onChange={(e) => setAbbreviatedName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border bg-slate-700 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., LMRYC"
            />
          </div>

          {/* State Association */}
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              State Association
            </label>
            <select
              value={stateAssociationId}
              onChange={(e) => setStateAssociationId(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border bg-slate-700 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">No State Association</option>
              {stateAssociations.map((assoc) => (
                <option key={assoc.id} value={assoc.id}>
                  {assoc.name} ({assoc.state})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Select your state association to appear in their member club directory
            </p>
          </div>
        </div>
      </div>

      {/* Club Logo */}
      <div className="p-6 rounded-lg border bg-slate-800 border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-white">
          Club Logo *
        </h3>

        <div className="flex items-start gap-4">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Club logo"
              className="w-24 h-24 rounded-lg object-cover border-2 border-slate-600"
            />
          )}

          <div className="flex-1">
            <button
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
            >
              <Upload size={18} />
              Upload Logo
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleImageChange(e.target.files[0], 'logo')}
              className="hidden"
            />
            <p className="mt-2 text-xs text-slate-400">
              Recommended: Square image, at least 500x500px
            </p>
          </div>
        </div>
      </div>

      {/* Club Introduction */}
      <div className="p-6 rounded-lg border bg-slate-800 border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Club Introduction
          </h3>
          <span className={`text-sm ${wordCount > 600 ? 'text-red-400' : 'text-slate-400'}`}>
            {wordCount} / 600 words
          </span>
        </div>

        <textarea
          value={clubIntroduction}
          onChange={(e) => setClubIntroduction(e.target.value)}
          rows={8}
          className="w-full px-4 py-3 rounded-lg border bg-slate-700 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Provide an introduction to your club. This will be displayed on your club's home page."
        />
        <p className="mt-2 text-xs text-slate-400">
          Write a compelling introduction about your club's history, mission, and what makes it special.
        </p>
      </div>

      {/* Featured Image */}
      <div className="p-6 rounded-lg border bg-slate-800 border-slate-700">
        <h3 className="text-lg font-semibold mb-4 text-white">
          Featured Image
        </h3>

        <div className="relative border-2 border-dashed rounded-lg border-slate-600 bg-slate-700/30">
          {featuredImageUrl ? (
            <div className="relative">
              <img
                src={featuredImageUrl}
                alt="Featured image"
                className="w-full h-64 object-cover rounded-lg"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => setShowCoverImageModal(true)}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Edit or reposition cover image"
                >
                  <Upload size={18} className="text-white" />
                </button>
                <button
                  onClick={() => {
                    setFeaturedImageUrl(null);
                    setFeaturedImageFile(null);
                  }}
                  className="p-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  title="Remove cover image"
                >
                  <X size={18} className="text-white" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center">
              <ImageIcon size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="mb-2 text-slate-300">
                Drag and drop your featured image here
              </p>
              <p className="text-sm mb-4 text-slate-400">
                or
              </p>
              <button
                onClick={() => setShowCoverImageModal(true)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
              >
                Browse Files
              </button>
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-400">
          This image will be used as the cover image on your club's home page and dashboard header. Recommended: 1920x600px
        </p>
      </div>

      {/* Sailing Days */}
      <div className="p-6 rounded-lg border bg-slate-800 border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Sailing Days
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              Define your regular sailing schedule
            </p>
          </div>
          <button
            onClick={addSailingDay}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={18} />
            Add Sailing Day
          </button>
        </div>

        <div className="space-y-4">
          {sailingDays.length === 0 ? (
            <p className="text-center text-slate-400 py-8">
              No sailing days defined yet. Click "Add Sailing Day" to get started.
            </p>
          ) : (
            sailingDays.map((day, index) => (
              <div key={index} className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Day of Week */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Day
                    </label>
                    <select
                      value={day.day_of_week}
                      onChange={(e) => updateSailingDay(index, 'day_of_week', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-slate-800 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                      <option value="Sunday">Sunday</option>
                    </select>
                  </div>

                  {/* Start Time */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={day.start_time}
                      onChange={(e) => updateSailingDay(index, 'start_time', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-slate-800 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* End Time */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={day.end_time}
                      onChange={(e) => updateSailingDay(index, 'end_time', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border bg-slate-800 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Boat Class */}
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Boat Class
                    </label>
                    <select
                      value={day.boat_class_id || ''}
                      onChange={(e) => updateSailingDay(index, 'boat_class_id', e.target.value || null)}
                      className="w-full px-3 py-2 rounded-lg border bg-slate-800 border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Classes</option>
                      {boatClasses.map((boatClass) => (
                        <option key={boatClass.id} value={boatClass.id}>
                          {boatClass.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2 text-slate-300">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={day.description || ''}
                    onChange={(e) => updateSailingDay(index, 'description', e.target.value)}
                    placeholder="e.g., Club Championship Series"
                    className="w-full px-3 py-2 rounded-lg border bg-slate-800 border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Remove Button */}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => removeSailingDay(index)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors font-medium"
        >
          <Save size={18} />
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Cover Image Upload Modal */}
      <CoverImageUploadModal
        isOpen={showCoverImageModal}
        onClose={() => setShowCoverImageModal(false)}
        onSave={handleSaveCoverImage}
        currentImageUrl={featuredImageUrl}
        currentPosition={coverImagePosition}
      />
    </div>
  );
};
