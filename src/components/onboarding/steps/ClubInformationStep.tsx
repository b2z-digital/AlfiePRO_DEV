import React, { useState } from 'react';
import { Upload, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import imageCompression from 'browser-image-compression';
import { useNotifications } from '../../../contexts/NotificationContext';

interface ClubInformationStepProps {
  data: {
    name: string;
    abbreviation: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
    description?: string;
  };
  onUpdate: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ClubInformationStep: React.FC<ClubInformationStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
}) => {
  const { addNotification } = useNotifications();
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 500,
        useWebWorker: true,
      });

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `club-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, compressedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      onUpdate({ logo: urlData.publicUrl });
      addNotification('success', 'Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      addNotification('error', 'Failed to upload logo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.name.trim()) {
      newErrors.name = 'Club name is required';
    }

    if (!data.abbreviation.trim()) {
      newErrors.abbreviation = 'Abbreviation is required';
    } else if (data.abbreviation.length > 10) {
      newErrors.abbreviation = 'Abbreviation must be 10 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Club Information</h2>
      <p className="text-slate-300 mb-6">
        Tell us about your yacht club. This information will be displayed on your
        club website and in the member portal.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Club Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g., Newcastle Radio Yacht Squadron"
            className={`w-full px-4 py-3 rounded-lg bg-slate-800 text-white border focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.name ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          {errors.name && (
            <p className="text-red-500 text-sm mt-1">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Abbreviation <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.abbreviation}
            onChange={(e) => onUpdate({ abbreviation: e.target.value.toUpperCase() })}
            placeholder="e.g., NRYS"
            maxLength={10}
            className={`w-full px-4 py-3 rounded-lg bg-slate-800 text-white border focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.abbreviation ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          {errors.abbreviation && (
            <p className="text-red-500 text-sm mt-1">{errors.abbreviation}</p>
          )}
          <p className="text-slate-400 text-sm mt-1">
            Short name for your club (max 10 characters)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Club Logo
          </label>
          <div className="flex items-start gap-4">
            {data.logo && (
              <div className="w-24 h-24 rounded-lg border-2 border-slate-600 overflow-hidden">
                <img
                  src={data.logo}
                  alt="Club logo"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex-1">
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-green-500 cursor-pointer transition-colors bg-slate-800/50">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-300">
                    {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    PNG, JPG up to 5MB
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Primary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={data.primaryColor || '#10b981'}
                onChange={(e) => onUpdate({ primaryColor: e.target.value })}
                className="w-12 h-10 rounded border border-slate-600 cursor-pointer bg-slate-800"
              />
              <input
                type="text"
                value={data.primaryColor || '#10b981'}
                onChange={(e) => onUpdate({ primaryColor: e.target.value })}
                placeholder="#10b981"
                className="flex-1 px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Secondary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={data.secondaryColor || '#3b82f6'}
                onChange={(e) => onUpdate({ secondaryColor: e.target.value })}
                className="w-12 h-10 rounded border border-slate-600 cursor-pointer bg-slate-800"
              />
              <input
                type="text"
                value={data.secondaryColor || '#3b82f6'}
                onChange={(e) => onUpdate({ secondaryColor: e.target.value })}
                placeholder="#3b82f6"
                className="flex-1 px-4 py-2 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            Club Description
          </label>
          <textarea
            value={data.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Tell us about your club, its history, and what makes it special..."
            rows={4}
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <p className="text-slate-400 text-sm mt-1">
            This will appear on your club website
          </p>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
