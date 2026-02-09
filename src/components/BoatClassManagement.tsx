import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Sailboat, Image as ImageIcon, X, Upload } from 'lucide-react';
import { BoatClass } from '../types/boatClass';
import {
  getBoatClasses,
  createBoatClass,
  updateBoatClass,
  deleteBoatClass,
  uploadBoatClassImage
} from '../utils/boatClassStorage';
import { useNotifications } from '../contexts/NotificationContext';
import { ConfirmationModal } from './ConfirmationModal';
import imageCompression from 'browser-image-compression';

interface BoatClassManagementProps {
  darkMode: boolean;
  associationType: 'national' | 'state';
  associationId: string;
  associationName: string;
}

export const BoatClassManagement: React.FC<BoatClassManagementProps> = ({
  darkMode,
  associationType,
  associationId,
  associationName
}) => {
  const { addNotification } = useNotifications();
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<BoatClass | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<BoatClass | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    class_image: '',
    gallery_images: [] as string[]
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    fetchBoatClasses();
  }, [associationId]);

  const fetchBoatClasses = async () => {
    try {
      setLoading(true);
      console.log('Fetching boat classes for:', { associationType, associationId, associationName });
      const data = await getBoatClasses();
      console.log('Boat classes loaded:', data);
      setBoatClasses(data);
    } catch (error) {
      console.error('Error fetching boat classes:', error);
      addNotification('error', 'Failed to load boat classes');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClass = () => {
    setEditingClass(null);
    setFormData({
      name: '',
      description: '',
      class_image: '',
      gallery_images: []
    });
    setShowModal(true);
  };

  const handleEditClass = (boatClass: BoatClass) => {
    setEditingClass(boatClass);
    setFormData({
      name: boatClass.name,
      description: boatClass.description || '',
      class_image: boatClass.class_image || '',
      gallery_images: boatClass.gallery_images || []
    });
    setShowModal(true);
  };

  const handleDeleteClick = (boatClass: BoatClass) => {
    setClassToDelete(boatClass);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!classToDelete) return;

    try {
      await deleteBoatClass(classToDelete.id);
      addNotification('success', 'Boat class deleted successfully');
      fetchBoatClasses();
    } catch (error) {
      console.error('Error deleting boat class:', error);
      addNotification('error', 'Failed to delete boat class');
    } finally {
      setShowDeleteConfirm(false);
      setClassToDelete(null);
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'main' | 'gallery'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (type === 'main') {
        setUploadingImage(true);
      } else {
        setUploadingGallery(true);
      }

      // Compress image
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: type === 'main' ? 800 : 1200,
        useWebWorker: true
      });

      // Upload to storage
      const timestamp = Date.now();
      const fileName = `${associationId}/${timestamp}-${file.name}`;
      const publicUrl = await uploadBoatClassImage(compressed, fileName);

      if (type === 'main') {
        setFormData(prev => ({ ...prev, class_image: publicUrl }));
      } else {
        setFormData(prev => ({
          ...prev,
          gallery_images: [...prev.gallery_images, publicUrl]
        }));
      }

      addNotification('success', 'Image uploaded successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      addNotification('error', 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      setUploadingGallery(false);
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gallery_images: prev.gallery_images.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      addNotification('error', 'Please enter a class name');
      return;
    }

    try {
      if (editingClass) {
        await updateBoatClass(editingClass.id, {
          name: formData.name,
          description: formData.description || null,
          class_image: formData.class_image || null,
          gallery_images: formData.gallery_images
        });
        addNotification('success', 'Boat class updated successfully');
      } else {
        await createBoatClass({
          name: formData.name,
          description: formData.description || null,
          class_image: formData.class_image || null,
          gallery_images: formData.gallery_images,
          created_by_type: associationType,
          created_by_association_id: associationId
        });
        addNotification('success', 'Boat class created successfully');
      }

      setShowModal(false);
      fetchBoatClasses();
    } catch (error) {
      console.error('Error saving boat class:', error);
      addNotification('error', 'Failed to save boat class');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Sailboat className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Yacht Classes</h1>
              <p className="text-slate-400">
                Manage yacht classes for {associationName}
              </p>
            </div>
          </div>
          <button
            onClick={handleAddClass}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-lg hover:shadow-xl"
          >
            <Plus size={20} />
            Add Class
          </button>
        </div>

        {/* Classes Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : boatClasses.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex p-6 rounded-full bg-slate-800 mb-6">
              <Sailboat size={48} className="text-slate-500" />
            </div>
            <p className="text-xl text-slate-400 mb-2">No yacht classes yet</p>
            <p className="text-slate-500">Click "Add Class" to create your first yacht class.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boatClasses.map(boatClass => (
              <div
                key={boatClass.id}
                className="rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] bg-slate-800 border border-slate-700"
              >
                {/* Image */}
                <div className="relative h-48 bg-gradient-to-br from-slate-700 to-slate-800">
                  {boatClass.class_image ? (
                    <img
                      src={boatClass.class_image}
                      alt={boatClass.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Sailboat size={48} className="text-slate-500" />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button
                      onClick={() => handleEditClass(boatClass)}
                      className="p-2 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors"
                      title="Edit class"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(boatClass)}
                      className="p-2 bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                      title="Delete class"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="text-xl font-bold mb-2 text-white">
                    {boatClass.name}
                  </h3>
                  {boatClass.description && (
                    <p className="text-sm line-clamp-2 text-slate-400">
                      {boatClass.description}
                    </p>
                  )}
                  {boatClass.gallery_images && boatClass.gallery_images.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <ImageIcon size={16} className="text-slate-500" />
                      <span className="text-sm text-slate-500">
                        {boatClass.gallery_images.length} {boatClass.gallery_images.length === 1 ? 'image' : 'images'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto bg-slate-800">
            <div className="sticky top-0 p-6 border-b z-10 bg-slate-800 border-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  {editingClass ? 'Edit Boat Class' : 'Add Boat Class'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg transition-colors hover:bg-slate-700 text-slate-400"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Class Name */}
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Class Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg border bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="e.g., Laser, 420, Optimist"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full px-4 py-3 rounded-lg border bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Describe the boat class..."
                />
              </div>

              {/* Class Image */}
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Class Image (for tiles)
                </label>
                {formData.class_image ? (
                  <div className="relative">
                    <img
                      src={formData.class_image}
                      alt="Class preview"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, class_image: '' }))}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <label className="block w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-slate-600 hover:border-blue-500 bg-slate-700/50">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleImageUpload(e, 'main')}
                      className="hidden"
                      disabled={uploadingImage}
                    />
                    <div className="flex flex-col items-center justify-center h-full">
                      {uploadingImage ? (
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      ) : (
                        <>
                          <Upload size={32} className="text-slate-500" />
                          <span className="mt-2 text-sm text-slate-400">
                            Click to upload image
                          </span>
                        </>
                      )}
                    </div>
                  </label>
                )}
              </div>

              {/* Gallery Images */}
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">
                  Gallery Images
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  {formData.gallery_images.map((image, index) => (
                    <div key={index} className="relative">
                      <img
                        src={image}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveGalleryImage(index)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="block w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors border-slate-600 hover:border-blue-500 bg-slate-700/50">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleImageUpload(e, 'gallery')}
                    className="hidden"
                    disabled={uploadingGallery}
                  />
                  <div className="flex flex-col items-center justify-center h-full">
                    {uploadingGallery ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    ) : (
                      <>
                        <Upload size={24} className="text-slate-500" />
                        <span className="mt-1 text-sm text-slate-400">
                          Add gallery image
                        </span>
                      </>
                    )}
                  </div>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 rounded-xl border transition-colors border-slate-600 text-slate-300 hover:bg-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium shadow-lg hover:shadow-xl"
                >
                  {editingClass ? 'Update Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Boat Class"
        message={`Are you sure you want to delete "${classToDelete?.name}"? Clubs will no longer be able to select this class.`}
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />
    </div>
  );
};
