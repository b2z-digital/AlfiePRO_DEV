import React, { useRef } from 'react';
import { Palette, Upload, Image, X, FileText } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { StepProps } from './types';

export const BrandingStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const featuredInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 500,
        useWebWorker: true
      });
      const preview = URL.createObjectURL(compressed);
      updateFormData({ logoFile: compressed, logoPreview: preview });
    } catch {
      const preview = URL.createObjectURL(file);
      updateFormData({ logoFile: file, logoPreview: preview });
    }
  };

  const handleFeaturedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      });
      const preview = URL.createObjectURL(compressed);
      updateFormData({ featuredImageFile: compressed, featuredImagePreview: preview });
    } catch {
      const preview = URL.createObjectURL(file);
      updateFormData({ featuredImageFile: file, featuredImagePreview: preview });
    }
  };

  const wordCount = formData.clubIntroduction.trim()
    ? formData.clubIntroduction.trim().split(/\s+/).length
    : 0;

  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-blue-500/20' : 'bg-blue-50'
        }`}>
          <Palette className="text-blue-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Club Branding
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Add your club's visual identity and description
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <label className={`block text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Club Logo
        </label>
        <div className="flex items-center gap-5">
          {formData.logoPreview ? (
            <div className="relative">
              <img
                src={formData.logoPreview}
                alt="Logo preview"
                className="w-20 h-20 rounded-xl object-cover border-2 border-emerald-500/50"
              />
              <button
                onClick={() => updateFormData({ logoFile: null, logoPreview: '' })}
                className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className={`w-20 h-20 rounded-xl flex items-center justify-center ${
              darkMode ? 'bg-slate-600/50 border-2 border-dashed border-slate-500' : 'bg-slate-200 border-2 border-dashed border-slate-300'
            }`}>
              <Image className={darkMode ? 'text-slate-400' : 'text-slate-500'} size={28} />
            </div>
          )}
          <div>
            <button
              onClick={() => logoInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors text-sm"
            >
              <Upload size={16} />
              Upload Logo
            </button>
            <p className={`text-xs mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Square image, at least 500x500px
            </p>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <label className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Club Introduction
          </label>
          <span className={`text-xs ${wordCount > 600 ? 'text-red-400' : darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            {wordCount} / 600 words
          </span>
        </div>
        <div className="relative">
          <FileText className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
          <textarea
            value={formData.clubIntroduction}
            onChange={(e) => updateFormData({ clubIntroduction: e.target.value })}
            rows={5}
            className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all duration-200 resize-none ${
              darkMode
                ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:bg-slate-700 focus:border-emerald-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
            } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
            placeholder="Write a compelling introduction about your club's history, mission, and what makes it special..."
          />
        </div>
        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          This appears on your club's public website and member directory listing
        </p>
      </div>

      <div className={`p-5 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
        <label className={`block text-sm font-semibold mb-3 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Featured Image
        </label>
        <p className={`text-xs mb-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
          This image appears as the hero banner on your dashboard and public website
        </p>

        {formData.featuredImagePreview ? (
          <div className="relative rounded-xl overflow-hidden">
            <img
              src={formData.featuredImagePreview}
              alt="Featured preview"
              className="w-full h-48 object-cover"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={() => featuredInputRef.current?.click()}
                className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg shadow-lg transition-colors"
              >
                <Upload size={16} />
              </button>
              <button
                onClick={() => updateFormData({ featuredImageFile: null, featuredImagePreview: '' })}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => featuredInputRef.current?.click()}
            className={`w-full h-48 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all ${
              darkMode
                ? 'bg-slate-600/30 border-2 border-dashed border-slate-500 hover:border-emerald-500 hover:bg-slate-600/50'
                : 'bg-slate-100 border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-slate-50'
            }`}
          >
            <Upload className={`mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} size={28} />
            <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Click to upload featured image
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              Recommended: 1920x600px or wider
            </p>
          </div>
        )}
        <input
          ref={featuredInputRef}
          type="file"
          accept="image/*"
          onChange={handleFeaturedUpload}
          className="hidden"
        />
      </div>
    </div>
  );
};
