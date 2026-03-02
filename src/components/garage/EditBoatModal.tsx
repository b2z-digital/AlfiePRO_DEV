import React, { useState } from 'react';
import { X, Save, FileText, Upload, Trash2, ExternalLink } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface Boat {
  id: string;
  boat_type: string;
  sail_number: string;
  hull: string;
  handicap: number | null;
  description: string | null;
  is_primary: boolean;
  boat_name?: string;
  design_name?: string;
  designer_name?: string;
  hull_registration_number?: string;
  registration_date?: string;
  certification_authority?: string;
  certification_file_url?: string;
  certification_file_name?: string;
  tuning_guide_url?: string;
  tuning_guide_file_name?: string;
}

interface EditBoatModalProps {
  boat: Boat;
  darkMode: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditBoatModal: React.FC<EditBoatModalProps> = ({
  boat,
  darkMode,
  onClose,
  onSuccess
}) => {
  const { addNotification } = useNotifications();
  const [formData, setFormData] = useState({
    boat_type: boat.boat_type,
    sail_number: boat.sail_number,
    hull: boat.hull,
    handicap: boat.handicap?.toString() || '',
    description: boat.description || '',
    is_primary: boat.is_primary,
    boat_name: boat.boat_name || '',
    design_name: boat.design_name || '',
    designer_name: boat.designer_name || '',
    hull_registration_number: boat.hull_registration_number || '',
    registration_date: boat.registration_date || '',
    certification_authority: boat.certification_authority || ''
  });
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [deletingCertificate, setDeletingCertificate] = useState(false);
  const [tuningGuideFile, setTuningGuideFile] = useState<File | null>(null);
  const [uploadingTuningGuide, setUploadingTuningGuide] = useState(false);
  const [deletingTuningGuide, setDeletingTuningGuide] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleDeleteCertificate = async () => {
    if (!boat.certification_file_url) return;

    try {
      setDeletingCertificate(true);

      // Extract file path from URL
      const url = new URL(boat.certification_file_url);
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)/);
      if (pathMatch) {
        const filePath = pathMatch[1];
        await supabase.storage.from('media').remove([filePath]);
      }

      // Update database
      const { error } = await supabase
        .from('member_boats')
        .update({
          certification_file_url: null,
          certification_file_name: null
        })
        .eq('id', boat.id);

      if (error) throw error;

      addNotification('success', 'Certificate deleted');
      onSuccess();
    } catch (err) {
      console.error('Error deleting certificate:', err);
      addNotification('error', 'Failed to delete certificate');
    } finally {
      setDeletingCertificate(false);
    }
  };

  const handleDeleteTuningGuide = async () => {
    if (!boat.tuning_guide_url) return;

    try {
      setDeletingTuningGuide(true);

      // Extract file path from URL
      const url = new URL(boat.tuning_guide_url);
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)/);
      if (pathMatch) {
        const filePath = pathMatch[1];
        await supabase.storage.from('media').remove([filePath]);
      }

      // Update database
      const { error } = await supabase
        .from('member_boats')
        .update({
          tuning_guide_url: null,
          tuning_guide_file_name: null
        })
        .eq('id', boat.id);

      if (error) throw error;

      addNotification('success', 'Tuning guide deleted');
      onSuccess();
    } catch (err) {
      console.error('Error deleting tuning guide:', err);
      addNotification('error', 'Failed to delete tuning guide');
    } finally {
      setDeletingTuningGuide(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.boat_type || !formData.sail_number) {
      addNotification('error', 'Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      // Upload certificate if new file provided
      let certificateUrl = boat.certification_file_url;
      let certificateFileName = boat.certification_file_name;

      // Upload tuning guide if new file provided
      let tuningGuideUrl = boat.tuning_guide_url;
      let tuningGuideFileName = boat.tuning_guide_file_name;

      if (certificateFile) {
        setUploadingCertificate(true);

        // Delete old certificate if exists
        if (boat.certification_file_url) {
          const url = new URL(boat.certification_file_url);
          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)/);
          if (pathMatch) {
            await supabase.storage.from('media').remove([pathMatch[1]]);
          }
        }

        // Upload new certificate
        const fileExt = certificateFile.name.split('.').pop();
        const fileName = `${boat.id}-${Date.now()}.${fileExt}`;
        const filePath = `certificates/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, certificateFile);

        if (uploadError) {
          console.error('Certificate upload error:', uploadError);
          addNotification('warning', 'Boat updated but certificate upload failed');
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

          certificateUrl = publicUrlData.publicUrl;
          certificateFileName = certificateFile.name;
        }
        setUploadingCertificate(false);
      }

      if (tuningGuideFile) {
        setUploadingTuningGuide(true);

        // Delete old tuning guide if exists
        if (boat.tuning_guide_url) {
          const url = new URL(boat.tuning_guide_url);
          const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/media\/(.+)/);
          if (pathMatch) {
            await supabase.storage.from('media').remove([pathMatch[1]]);
          }
        }

        // Upload new tuning guide
        const fileExt = tuningGuideFile.name.split('.').pop();
        const fileName = `${boat.id}-tuning-${Date.now()}.${fileExt}`;
        const filePath = `tuning-guides/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, tuningGuideFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Tuning guide upload error:', uploadError);
          addNotification('error', `Tuning guide upload failed: ${uploadError.message}`);
          setUploadingTuningGuide(false);
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

          tuningGuideUrl = publicUrlData.publicUrl;
          tuningGuideFileName = tuningGuideFile.name;
        }
        setUploadingTuningGuide(false);
      }

      const { error } = await supabase
        .from('member_boats')
        .update({
          boat_type: formData.boat_type,
          sail_number: formData.sail_number,
          hull: formData.hull,
          handicap: formData.handicap ? parseFloat(formData.handicap) : null,
          description: formData.description || null,
          is_primary: formData.is_primary,
          boat_name: formData.boat_name || null,
          design_name: formData.design_name || null,
          designer_name: formData.designer_name || null,
          hull_registration_number: formData.hull_registration_number || null,
          registration_date: formData.registration_date || null,
          certification_authority: formData.certification_authority || null,
          certification_file_url: certificateUrl,
          certification_file_name: certificateFileName,
          tuning_guide_url: tuningGuideUrl,
          tuning_guide_file_name: tuningGuideFileName
        })
        .eq('id', boat.id);

      if (error) throw error;

      addNotification('success', 'Boat updated successfully');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating boat:', err);
      addNotification('error', 'Failed to update boat');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`
        w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto
        ${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'}
      `}>
        {/* Header */}
        <div className={`
          sticky top-0 z-10 flex items-center justify-between p-6 border-b
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <h2 className="text-2xl font-bold">Edit Boat</h2>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-lg transition-colors
              ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}
            `}
          >
            <X size={24} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Boat Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., IOM, DF95, 10R"
                  value={formData.boat_type}
                  onChange={(e) => setFormData({ ...formData, boat_type: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Sail Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., 123"
                  value={formData.sail_number}
                  onChange={(e) => setFormData({ ...formData, sail_number: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Hull Registration #
                </label>
                <input
                  type="text"
                  placeholder="e.g., IOM-AUS-123"
                  value={formData.hull_registration_number}
                  onChange={(e) => setFormData({ ...formData, hull_registration_number: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors font-mono tracking-wide
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Hull Type
                </label>
                <input
                  type="text"
                  placeholder="e.g., Trance, BritPop"
                  value={formData.hull}
                  onChange={(e) => setFormData({ ...formData, hull: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Handicap
                </label>
                <input
                  type="number"
                  placeholder="e.g., 1000"
                  value={formData.handicap}
                  onChange={(e) => setFormData({ ...formData, handicap: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Description
              </label>
              <textarea
                placeholder="Add notes about your boat..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className={`
                  w-full px-4 py-3 rounded-xl border transition-colors resize-none
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                  focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                `}
              />
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_primary}
                  onChange={(e) => setFormData({ ...formData, is_primary: e.target.checked })}
                  className="w-5 h-5 rounded border-2 border-slate-400 text-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                />
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Set as primary boat
                </span>
              </label>
            </div>
          </div>

          {/* Registration & Certification */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
              Registration & Certification
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Boat Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Alfie"
                    value={formData.boat_name}
                    onChange={(e) => setFormData({ ...formData, boat_name: e.target.value })}
                    className={`
                      w-full px-4 py-3 rounded-xl border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Design Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Trance"
                    value={formData.design_name}
                    onChange={(e) => setFormData({ ...formData, design_name: e.target.value })}
                    className={`
                      w-full px-4 py-3 rounded-xl border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Designer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Brad Gibson"
                    value={formData.designer_name}
                    onChange={(e) => setFormData({ ...formData, designer_name: e.target.value })}
                    className={`
                      w-full px-4 py-3 rounded-xl border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Registration Date
                  </label>
                  <input
                    type="date"
                    value={formData.registration_date}
                    onChange={(e) => setFormData({ ...formData, registration_date: e.target.value })}
                    className={`
                      w-full px-4 py-3 rounded-xl border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white focus:border-cyan-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Hull Registration Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., IOM-AUS-123"
                  value={formData.hull_registration_number}
                  onChange={(e) => setFormData({ ...formData, hull_registration_number: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border-2 font-mono text-lg font-semibold tracking-wider transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-cyan-500/50 text-cyan-300 placeholder-slate-500 focus:border-cyan-500'
                      : 'bg-blue-50 border-cyan-300 text-cyan-700 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Certification Authority
                </label>
                <input
                  type="text"
                  placeholder="e.g., Australian Radio Yachting Association"
                  value={formData.certification_authority}
                  onChange={(e) => setFormData({ ...formData, certification_authority: e.target.value })}
                  className={`
                    w-full px-4 py-3 rounded-xl border transition-colors
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                    focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                  `}
                />
              </div>

              {/* Existing Certificate */}
              {boat.certification_file_url && !certificateFile && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Current Certificate
                  </label>
                  <div className={`
                    flex items-center justify-between p-4 rounded-xl border-2
                    ${darkMode
                      ? 'bg-red-500/10 border-red-500/30'
                      : 'bg-red-50 border-red-200'}
                  `}>
                    <div className="flex items-center gap-3">
                      <FileText className="text-red-500" size={28} />
                      <div>
                        <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {boat.certification_file_name || 'Certificate'}
                        </p>
                        <a
                          href={boat.certification_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1"
                        >
                          View PDF <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteCertificate}
                      disabled={deletingCertificate}
                      className={`
                        p-2 rounded-lg transition-colors
                        ${darkMode
                          ? 'hover:bg-red-500/20 text-red-400'
                          : 'hover:bg-red-100 text-red-600'}
                      `}
                      title="Delete certificate"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}

              {/* Upload New Certificate */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {boat.certification_file_url ? 'Replace Certificate (PDF)' : 'Certification Document (PDF)'}
                </label>
                <div className={`
                  relative border-2 border-dashed rounded-xl p-6 transition-colors
                  ${darkMode
                    ? 'border-slate-600 hover:border-cyan-500 bg-slate-700/50'
                    : 'border-slate-300 hover:border-cyan-500 bg-slate-50'}
                `}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.type === 'application/pdf') {
                        setCertificateFile(file);
                      } else {
                        addNotification('error', 'Please select a PDF file');
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-center pointer-events-none">
                    {certificateFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="text-red-500" size={32} />
                        <div className="text-left">
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {certificateFile.name}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {(certificateFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className={`mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={32} />
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Click to upload certification PDF
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tuning Guide Section */}
            <div>
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Tuning Guide
              </h3>

              {/* Existing Tuning Guide */}
              {boat.tuning_guide_url && !tuningGuideFile && (
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Current Tuning Guide
                  </label>
                  <div className={`
                    flex items-center justify-between p-4 rounded-xl border-2
                    ${darkMode
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : 'bg-blue-50 border-blue-200'}
                  `}>
                    <div className="flex items-center gap-3">
                      <FileText className="text-blue-500" size={28} />
                      <div>
                        <p className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {boat.tuning_guide_file_name || 'Tuning Guide'}
                        </p>
                        <a
                          href={boat.tuning_guide_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-cyan-500 hover:text-cyan-400 flex items-center gap-1"
                        >
                          View PDF <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteTuningGuide}
                      disabled={deletingTuningGuide}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete tuning guide"
                    >
                      {deletingTuningGuide ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500"></div>
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Upload New Tuning Guide */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  {boat.tuning_guide_url ? 'Replace Tuning Guide (PDF)' : 'Tuning Guide (PDF)'}
                </label>
                <div className={`
                  relative border-2 border-dashed rounded-xl p-6 transition-colors
                  ${darkMode
                    ? 'border-slate-600 hover:border-blue-500 bg-slate-700/50'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50'}
                `}>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.type === 'application/pdf') {
                        setTuningGuideFile(file);
                      } else {
                        addNotification('error', 'Please select a PDF file');
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="text-center pointer-events-none">
                    {tuningGuideFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileText className="text-blue-500" size={32} />
                        <div className="text-left">
                          <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                            {tuningGuideFile.name}
                          </p>
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {(tuningGuideFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className={`mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={32} />
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Click to upload manufacturer tuning guide PDF
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={saving || uploadingCertificate || uploadingTuningGuide}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:from-slate-500 disabled:to-slate-600 text-white rounded-xl transition-all shadow-lg shadow-cyan-500/20"
            >
              <Save size={20} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`
                px-6 py-3 rounded-xl transition-colors
                ${darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}
              `}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
