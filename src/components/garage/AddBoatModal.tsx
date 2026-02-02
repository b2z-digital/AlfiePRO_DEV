import React, { useState } from 'react';
import { X, Save, Anchor, FileText, Upload } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface AddBoatModalProps {
  darkMode: boolean;
  memberId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = 'basic' | 'certification';

export const AddBoatModal: React.FC<AddBoatModalProps> = ({
  darkMode,
  memberId,
  onClose,
  onSuccess
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [formData, setFormData] = useState({
    boat_type: '',
    sail_number: '',
    hull: '',
    handicap: '',
    description: '',
    purchase_date: '',
    purchase_value: '',
    is_primary: false,
    boat_name: '',
    design_name: '',
    designer_name: '',
    hull_registration_number: '',
    registration_date: '',
    certification_authority: ''
  });
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.boat_type || !formData.sail_number) {
      addNotification('error', 'Please fill in boat type and sail number');
      return;
    }

    try {
      setLoading(true);

      // Upload certificate if provided
      let certificateUrl = null;
      let certificateFileName = null;

      if (certificateFile) {
        setUploadingCertificate(true);
        const fileExt = certificateFile.name.split('.').pop();
        const fileName = `${memberId}-${Date.now()}.${fileExt}`;
        const filePath = `certificates/${fileName}`;

        const { error: uploadError, data: uploadData } = await supabase.storage
          .from('media')
          .upload(filePath, certificateFile);

        if (uploadError) {
          console.error('Certificate upload error:', uploadError);
          addNotification('warning', 'Boat added but certificate upload failed');
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

          certificateUrl = publicUrlData.publicUrl;
          certificateFileName = certificateFile.name;
        }
        setUploadingCertificate(false);
      }

      const { data, error } = await supabase
        .from('member_boats')
        .insert([{
          member_id: memberId,
          boat_type: formData.boat_type,
          sail_number: formData.sail_number,
          hull: formData.hull || null,
          handicap: formData.handicap ? parseInt(formData.handicap) : null,
          description: formData.description || null,
          purchase_date: formData.purchase_date || null,
          purchase_value: formData.purchase_value ? parseFloat(formData.purchase_value) : null,
          is_primary: formData.is_primary,
          boat_name: formData.boat_name || null,
          design_name: formData.design_name || null,
          designer_name: formData.designer_name || null,
          hull_registration_number: formData.hull_registration_number || null,
          registration_date: formData.registration_date || null,
          certification_authority: formData.certification_authority || null,
          certification_file_url: certificateUrl,
          certification_file_name: certificateFileName
        }])
        .select()
        .single();

      if (error) throw error;

      addNotification('success', 'Boat added successfully!');
      onSuccess();
    } catch (err) {
      console.error('Error adding boat:', err);
      addNotification('error', 'Failed to add boat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div className={`
        w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Anchor className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Add New Boat</h2>
              <p className="text-cyan-100 text-sm mt-0.5">Add your boat to your garage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`
          flex border-b
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}>
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`
              flex-1 px-6 py-3 font-medium transition-all relative
              ${activeTab === 'basic'
                ? darkMode
                  ? 'text-cyan-400'
                  : 'text-cyan-600'
                : darkMode
                  ? 'text-slate-400 hover:text-slate-300'
                  : 'text-slate-600 hover:text-slate-800'
              }
            `}
          >
            Basic Information
            {activeTab === 'basic' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('certification')}
            className={`
              flex-1 px-6 py-3 font-medium transition-all relative
              ${activeTab === 'certification'
                ? darkMode
                  ? 'text-cyan-400'
                  : 'text-cyan-600'
                : darkMode
                  ? 'text-slate-400 hover:text-slate-300'
                  : 'text-slate-600 hover:text-slate-800'
              }
            `}
          >
            Registration & Certification
            {activeTab === 'certification' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600"></div>
            )}
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {/* Basic Information Tab */}
            {activeTab === 'basic' && (
              <div className="space-y-6 animate-slideIn">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Boat Type <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., IOM, DF95, 10R"
                      value={formData.boat_type}
                      onChange={(e) => setFormData({ ...formData, boat_type: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Sail Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., 123"
                      value={formData.sail_number}
                      onChange={(e) => setFormData({ ...formData, sail_number: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Hull Type
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Trance, BritPop"
                      value={formData.hull}
                      onChange={(e) => setFormData({ ...formData, hull: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Handicap
                    </label>
                    <input
                      type="number"
                      placeholder="e.g., 1000"
                      value={formData.handicap}
                      onChange={(e) => setFormData({ ...formData, handicap: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>
                </div>

                {/* Description - Full Width */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Description
                  </label>
                  <textarea
                    placeholder="Add notes about your boat..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className={`
                      w-full px-4 py-2.5 rounded-lg border transition-colors resize-none
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                        : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                {/* Purchase Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                      style={{ colorScheme: darkMode ? 'dark' : 'light' }}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Purchase Value
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.purchase_value}
                      onChange={(e) => setFormData({ ...formData, purchase_value: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>
                </div>

                {/* Primary Boat Checkbox */}
                <div>
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
            )}

            {/* Registration & Certification Tab */}
            {activeTab === 'certification' && (
              <div className="space-y-6 animate-slideIn">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Boat Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Alfie"
                      value={formData.boat_name}
                      onChange={(e) => setFormData({ ...formData, boat_name: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Design Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Trance"
                      value={formData.design_name}
                      onChange={(e) => setFormData({ ...formData, design_name: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Designer Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Brad Gibson"
                      value={formData.designer_name}
                      onChange={(e) => setFormData({ ...formData, designer_name: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Registration Date
                    </label>
                    <input
                      type="date"
                      value={formData.registration_date}
                      onChange={(e) => setFormData({ ...formData, registration_date: e.target.value })}
                      className={`
                        w-full px-4 py-2.5 rounded-lg border transition-colors
                        ${darkMode
                          ? 'bg-slate-700 border-slate-600 text-white focus:border-cyan-500'
                          : 'bg-white border-slate-200 text-slate-900 focus:border-cyan-500'}
                        focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                      `}
                      style={{ colorScheme: darkMode ? 'dark' : 'light' }}
                    />
                  </div>
                </div>

                {/* Hull Registration Number - Full Width */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Hull Registration Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., IOM-AUS-123"
                    value={formData.hull_registration_number}
                    onChange={(e) => setFormData({ ...formData, hull_registration_number: e.target.value })}
                    className={`
                      w-full px-4 py-2.5 rounded-lg border-2 font-mono text-lg font-semibold tracking-wider transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-cyan-500/50 text-cyan-300 placeholder-slate-500 focus:border-cyan-500'
                        : 'bg-blue-50 border-cyan-300 text-cyan-700 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                {/* Certification Authority - Full Width */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Certification Authority
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Australian Radio Yachting Association"
                    value={formData.certification_authority}
                    onChange={(e) => setFormData({ ...formData, certification_authority: e.target.value })}
                    className={`
                      w-full px-4 py-2.5 rounded-lg border transition-colors
                      ${darkMode
                        ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                        : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500'}
                      focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                    `}
                  />
                </div>

                {/* Certification Document Upload */}
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Certification Document (PDF)
                  </label>
                  <div className={`
                    relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer
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
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={onClose}
                className={`
                  px-6 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105
                  ${darkMode
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                `}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`
                  px-8 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2
                  ${!loading
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-600/30'
                    : 'bg-slate-400 text-white cursor-not-allowed'}
                `}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Add Boat
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

        .animate-slideIn {
          animation: slideIn 0.4s ease-out;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        button {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        button:active {
          transform: scale(0.98);
        }

        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          ring: 2px;
          ring-color: rgb(59 130 246);
          transition: all 0.2s ease;
        }
      `}</style>
    </div>
  );
};
