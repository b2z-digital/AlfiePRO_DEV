import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Building2, Plus, MapPin, Flag, Upload, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import imageCompression from 'browser-image-compression';

interface StateAssociation {
  id: string;
  name: string;
  state: string;
  logo_url: string | null;
  national_association_id: string | null;
  status?: string;
  short_name?: string | null;
}

interface AddStateAssociationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  nationalAssociationId: string;
  editingAssociation?: StateAssociation | null;
  darkMode: boolean;
}

export const AddStateAssociationModal: React.FC<AddStateAssociationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  nationalAssociationId,
  editingAssociation,
}) => {
  const [mode, setMode] = useState<'select' | 'create' | 'edit'>('select');
  const [allAssociations, setAllAssociations] = useState<StateAssociation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Form state for creating/editing state association
  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    state: '',
    status: 'pending'
  });

  useEffect(() => {
    if (isOpen) {
      if (editingAssociation) {
        setMode('edit');
        setFormData({
          name: editingAssociation.name,
          short_name: editingAssociation.short_name || '',
          state: editingAssociation.state,
          status: editingAssociation.status || 'pending'
        });
        setLogoPreview(editingAssociation.logo_url);
        setLogoFile(null);
      } else if (mode === 'select') {
        loadAllAssociations();
      }
    } else {
      // Reset form when modal closes
      setFormData({
        name: '',
        short_name: '',
        state: '',
        status: 'pending'
      });
      setLogoFile(null);
      setLogoPreview(null);
    }
  }, [isOpen, mode, editingAssociation]);

  const handleLogoChange = async (file: File) => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 500,
        useWebWorker: true
      };

      const compressedFile = await imageCompression(file, options);
      setLogoFile(compressedFile);
      setLogoPreview(URL.createObjectURL(compressedFile));
    } catch (err) {
      console.error('Error compressing image:', err);
      alert('Failed to process image');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));

    if (imageFile) {
      await handleLogoChange(imageFile);
    }
  };

  const uploadLogo = async (stateAssocId: string): Promise<string | null> => {
    if (!logoFile) return null;

    const fileExt = logoFile.name.split('.').pop();
    const fileName = `${stateAssocId}-logo-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, logoFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleRemoveLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const loadAllAssociations = async () => {
    try {
      setLoading(true);

      console.log('Loading state associations, excluding national_association_id:', nationalAssociationId);

      // Get all state associations - we'll filter in JavaScript instead
      const { data, error } = await supabase
        .from('state_associations')
        .select('id, name, short_name, state, logo_url, national_association_id')
        .order('name', { ascending: true });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('All state associations from database:', data);

      // Filter out associations already linked to THIS national association
      const filteredAssociations = (data || []).filter(assoc =>
        assoc.national_association_id !== nationalAssociationId
      );

      console.log('Filtered associations (excluding current national):', filteredAssociations);

      setAllAssociations(filteredAssociations);
    } catch (error) {
      console.error('Error loading state associations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAssociation = async (associationId: string) => {
    try {
      setCreating(true);

      const { error } = await supabase
        .from('state_associations')
        .update({ national_association_id: nationalAssociationId })
        .eq('id', associationId);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error linking state association:', error);
      alert('Failed to link state association');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateAssociation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.state.trim()) {
      alert('Please enter both name and state');
      return;
    }

    try {
      setCreating(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the state association
      const { data: newAssociation, error: insertError } = await supabase
        .from('state_associations')
        .insert({
          name: formData.name.trim(),
          short_name: formData.short_name.trim() || null,
          state: formData.state.trim(),
          national_association_id: nationalAssociationId,
          status: 'active'
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Upload logo if provided
      if (logoFile) {
        const logoUrl = await uploadLogo(newAssociation.id);
        if (logoUrl) {
          await supabase
            .from('state_associations')
            .update({ logo_url: logoUrl })
            .eq('id', newAssociation.id);
        }
      }

      // Add the creator as a state_admin
      const { error: userAssocError } = await supabase
        .from('user_state_associations')
        .insert({
          user_id: user.id,
          state_association_id: newAssociation.id,
          role: 'state_admin'
        });

      if (userAssocError) throw userAssocError;

      onSuccess();
      onClose();

      // Reset form
      setFormData({
        name: '',
        short_name: '',
        state: '',
        status: 'pending'
      });
    } catch (error) {
      console.error('Error creating state association:', error);
      alert('Failed to create state association');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateAssociation = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingAssociation || !formData.name.trim() || !formData.state.trim()) {
      alert('Please enter both name and state');
      return;
    }

    try {
      setCreating(true);

      // Upload logo if a new one was selected
      let logoUrl = editingAssociation.logo_url;
      if (logoFile) {
        logoUrl = await uploadLogo(editingAssociation.id);
      }

      const { error } = await supabase
        .from('state_associations')
        .update({
          name: formData.name.trim(),
          short_name: formData.short_name.trim() || null,
          state: formData.state.trim(),
          status: formData.status,
          logo_url: logoUrl
        })
        .eq('id', editingAssociation.id);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating state association:', error);
      alert('Failed to update state association');
    } finally {
      setCreating(false);
    }
  };

  const filteredAssociations = allAssociations.filter(assoc =>
    assoc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assoc.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="a-dlg">
      <div className="a-sheet max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="a-dlg-head justify-between">
          <div className="flex items-center gap-3">
            <div className="a-tile a-tile-sm">
              <Building2 className="a-txt-b" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold a-ink">
                {mode === 'edit' ? 'Edit State Association' : 'Add State Association'}
              </h2>
              <p className="text-sm a-mute">
                {mode === 'edit' ? 'Update association details and status' : 'Link an existing state association or create a new one'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-slate-700 text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector (hide in edit mode) */}
        {mode !== 'edit' && (
          <div className="flex gap-2 p-4 border-b border-slate-700">
            <button
              onClick={() => setMode('select')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Link Existing Association
            </button>
            <button
              onClick={() => setMode('create')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === 'create'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              Create New Association
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {mode === 'select' ? (
            <>
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 a-mute" size={20} />
                  <input
                    type="text"
                    placeholder="Search state associations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Associations List */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 a-mute">
                    Loading state associations...
                  </p>
                </div>
              ) : filteredAssociations.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 size={48} className="a-dim mx-auto mb-4" />
                  <p className="font-medium a-mute">
                    {searchQuery ? 'No state associations found' : 'No available state associations'}
                  </p>
                  <p className="text-sm mt-1 a-mute">
                    {searchQuery ? 'Try a different search term' : 'Create a new state association instead'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAssociations.map((assoc) => (
                    <div
                      key={assoc.id}
                      className="a-box p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {assoc.logo_url ? (
                            <img src={assoc.logo_url} alt={assoc.name} className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-600">
                              <Building2 size={20} className="a-mute" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate a-ink">
                              {assoc.name}
                            </h3>
                            <div className="flex items-center gap-1 mt-1">
                              <Flag size={12} className="a-dim" />
                              <p className="text-xs a-mute">
                                {assoc.state}
                              </p>
                            </div>
                            {assoc.national_association_id && (
                              <p className="text-xs mt-1 a-txt-a">
                                Currently linked to another national association
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleLinkAssociation(assoc.id)}
                          disabled={creating}
                          className="a-btn a-btn-p"
                        >
                          Link
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : mode === 'edit' ? (
            /* Edit State Association Form */
            <form onSubmit={handleUpdateAssociation} className="space-y-4">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Logo
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg transition-colors ${
                    isDraggingLogo
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {logoPreview ? (
                    <div className="relative aspect-square w-32 mx-auto p-2">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="a-btn a-btn-d"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <ImageIcon size={32} className="mx-auto mb-2 a-dim" />
                      <p className="text-sm mb-1 a-mute">
                        Drop logo here or click to upload
                      </p>
                      <p className="text-xs a-dim">
                        PNG, JPG up to 1MB
                      </p>
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleLogoChange(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Association Name <span className="a-txt-r">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="a-inp"
                  placeholder="Enter association name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Abbreviation
                </label>
                <input
                  type="text"
                  value={formData.short_name}
                  onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                  className="a-inp"
                  placeholder="e.g., NSWRYA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  <Flag size={14} className="inline mr-1" />
                  State/Territory <span className="a-txt-r">*</span>
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="a-inp"
                  placeholder="e.g., New South Wales, NSW"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Status <span className="a-txt-r">*</span>
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="a-inp"
                  required
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="a-btn flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="a-btn a-btn-p flex-1 justify-center"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Updating...
                    </>
                  ) : (
                    'Update Association'
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Create New State Association Form */
            <form onSubmit={handleCreateAssociation} className="space-y-4">
              {/* Logo Upload */}
              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Logo
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-lg transition-colors ${
                    isDraggingLogo
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {logoPreview ? (
                    <div className="relative aspect-square w-32 mx-auto p-2">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="a-btn a-btn-d"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <ImageIcon size={32} className="mx-auto mb-2 a-dim" />
                      <p className="text-sm mb-1 a-mute">
                        Drop logo here or click to upload
                      </p>
                      <p className="text-xs a-dim">
                        PNG, JPG up to 1MB
                      </p>
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleLogoChange(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Association Name <span className="a-txt-r">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="a-inp"
                  placeholder="Enter association name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  Abbreviation
                </label>
                <input
                  type="text"
                  value={formData.short_name}
                  onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                  className="a-inp"
                  placeholder="e.g., NSWRYA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 a-mute">
                  <Flag size={14} className="inline mr-1" />
                  State/Territory <span className="a-txt-r">*</span>
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="a-inp"
                  placeholder="e.g., New South Wales, NSW"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="a-btn flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="a-btn a-btn-p flex-1 justify-center"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={20} />
                      Create Association
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
