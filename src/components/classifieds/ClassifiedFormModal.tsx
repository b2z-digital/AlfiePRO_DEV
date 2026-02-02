import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import type { Classified, ClassifiedFormData } from '../../types/classified';
import { CLASSIFIED_CONDITIONS } from '../../types/classified';
import { createClassified, updateClassified } from '../../utils/classifiedStorage';
import { supabase } from '../../utils/supabase';

interface Props {
  classified?: Classified;
  onClose: () => void;
  onSave: () => void;
}

const CATEGORIES = [
  { value: 'yachts', label: 'Yachts & Boats' },
  { value: 'components', label: 'Components & Parts' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'services', label: 'Services' }
];

const BOAT_CLASSES = ['DF65', 'DF95', '10R', 'IOM', 'Marblehead', 'A Class', 'RC Laser', 'Other'];

export default function ClassifiedFormModal({ classified, onClose, onSave }: Props) {
  const { user, currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const isEditing = !!classified;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [memberData, setMemberData] = useState<any>(null);

  const [formData, setFormData] = useState<ClassifiedFormData>({
    title: classified?.title || '',
    description: classified?.description || '',
    price: classified?.price || 0,
    location: classified?.location || '',
    category: classified?.category || 'yachts',
    condition: classified?.condition || 'used',
    images: classified?.images || [],
    contact_email: classified?.contact_email || user?.email || '',
    contact_phone: classified?.contact_phone || '',
    club_id: classified?.club_id || currentClub?.clubId,
    is_public: classified?.is_public ?? false,
    boat_class: (classified as any)?.boat_class || ''
  });

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showConditionDropdown, setShowConditionDropdown] = useState(false);
  const [showBoatClassDropdown, setShowBoatClassDropdown] = useState(false);

  // Load member data to pre-fill location and phone
  useEffect(() => {
    const loadMemberData = async () => {
      if (!user?.id || isEditing) return;

      try {
        const { data, error } = await supabase
          .from('members')
          .select('phone, city, state')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data) {
          setMemberData(data);
          if ((data.city || data.state) && !formData.location) {
            const locationParts = [];
            if (data.city) locationParts.push(data.city);
            if (data.state) locationParts.push(data.state);
            handleChange('location', locationParts.join(', '));
          }
          if (data.phone && !formData.contact_phone) {
            handleChange('contact_phone', data.phone);
          }
        }
      } catch (error) {
        console.error('Error loading member data:', error);
      }
    };

    loadMemberData();
  }, [user?.id]);

  const handleChange = (field: keyof ClassifiedFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      await uploadImages(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadImages(Array.from(files));
  };

  const uploadImages = async (files: File[]) => {
    setUploading(true);
    const newImages: string[] = [];

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${user?.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);

        newImages.push(publicUrl);
      }

      handleChange('images', [...formData.images, ...newImages]);
    } catch (error) {
      console.error('Error uploading images:', error);
      alert('Failed to upload some images');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = [...formData.images];
    newImages.splice(index, 1);
    handleChange('images', newImages);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (formData.images.length === 0) {
      addNotification('error', 'Please add at least one image');
      return;
    }

    setSaving(true);
    try {
      if (isEditing && classified) {
        await updateClassified(classified.id, formData);
      } else {
        await createClassified(formData, user.id);
      }

      onSave();
      addNotification('success', isEditing ? 'Listing updated successfully!' : 'Listing created successfully!');
    } catch (error) {
      console.error('Error saving classified:', error);
      addNotification('error', 'Failed to save listing. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">
            {isEditing ? 'Edit Listing' : 'Create New Listing'}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-88px)] p-6 pb-8">
          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 10R Sanga in excellent condition"
              />
            </div>

            {/* Category, Condition & Boat Class */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Category *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-slate-400">⛵</span>
                      {CATEGORIES.find(c => c.value === formData.category)?.label || formData.category}
                    </span>
                    <ChevronDown size={20} />
                  </button>
                  {showCategoryDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => {
                            handleChange('category', cat.value);
                            setShowCategoryDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center gap-2"
                        >
                          <span className="text-slate-400">⛵</span>
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Condition *
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowConditionDropdown(!showConditionDropdown)}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span>{CLASSIFIED_CONDITIONS.find(c => c.value === formData.condition)?.label || 'Select'}</span>
                    <ChevronDown size={20} />
                  </button>
                  {showConditionDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                      {CLASSIFIED_CONDITIONS.map(cond => (
                        <button
                          key={cond.value}
                          type="button"
                          onClick={() => {
                            handleChange('condition', cond.value);
                            setShowConditionDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-slate-700"
                        >
                          {cond.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Boat Class
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowBoatClassDropdown(!showBoatClassDropdown)}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    <span>{formData.boat_class || 'Select (optional)'}</span>
                    <ChevronDown size={20} />
                  </button>
                  {showBoatClassDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleChange('boat_class', '');
                          setShowBoatClassDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-400 hover:bg-slate-700"
                      >
                        None
                      </button>
                      {BOAT_CLASSES.map(boatClass => (
                        <button
                          key={boatClass}
                          type="button"
                          onClick={() => {
                            handleChange('boat_class', boatClass);
                            setShowBoatClassDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-slate-700"
                        >
                          {boatClass}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Price & Location */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Price ($) *
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => handleChange('price', parseFloat(e.target.value))}
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Sydney, NSW"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                required
                rows={6}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Describe your item in detail..."
              />
            </div>

            {/* Image Upload - Drag & Drop */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Images *
              </label>

              {/* Uploaded Images */}
              {formData.images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {formData.images.map((image, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-slate-900 group">
                      <img src={image} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
                }`}
              >
                <Upload className="mx-auto mb-4 text-slate-400" size={48} />
                <p className="text-white font-medium mb-2">
                  {uploading ? 'Uploading...' : 'Drop images here or click to browse'}
                </p>
                <p className="text-sm text-slate-400">
                  Supports JPG, PNG, GIF up to 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Contact Email *
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => handleChange('contact_email', e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Contact Phone *
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => handleChange('contact_phone', e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 0400 000 000"
                />
              </div>
            </div>

            {/* Visibility Options */}
            <div className="bg-slate-800/50 rounded-xl p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_public}
                  onChange={(e) => handleChange('is_public', e.target.checked)}
                  className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <div className="text-white font-medium">Make listing public</div>
                  <div className="text-sm text-blue-300">
                    Allow members from other clubs to see this listing
                  </div>
                </div>
              </label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Listing'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
