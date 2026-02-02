import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { AdPlacement, PageType, AdPosition } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';

interface PlacementFormModalProps {
  placement?: AdPlacement | null;
  onClose: (success?: boolean) => void;
}

export const PlacementFormModal: React.FC<PlacementFormModalProps> = ({ placement, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    page_type: 'all' as PageType,
    position: 'sidebar' as AdPosition,
    size_width: 300,
    size_height: 250,
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  // Position options based on page type
  const getPositionOptions = (pageType: PageType): { value: AdPosition; label: string; sizes: { width: number; height: number } }[] => {
    switch (pageType) {
      case 'alfie_tv':
        return [
          { value: 'hero', label: 'Hero', sizes: { width: 728, height: 90 } },
        ];
      case 'event_calendar':
        return [
          { value: 'header', label: 'Header', sizes: { width: 728, height: 90 } },
          { value: 'sidebar', label: 'Sidebar', sizes: { width: 300, height: 250 } },
        ];
      case 'media':
      case 'yacht_classes':
      case 'my_garage':
      case 'weather':
      case 'news':
      case 'results':
        return [
          { value: 'header', label: 'Header', sizes: { width: 728, height: 90 } },
          { value: 'sidebar', label: 'Sidebar', sizes: { width: 300, height: 250 } },
          { value: 'inline', label: 'Inline', sizes: { width: 300, height: 250 } },
        ];
      case 'all':
      default:
        return [
          { value: 'header', label: 'Header', sizes: { width: 728, height: 90 } },
          { value: 'sidebar', label: 'Sidebar', sizes: { width: 300, height: 250 } },
          { value: 'inline', label: 'Inline', sizes: { width: 300, height: 250 } },
          { value: 'footer', label: 'Footer', sizes: { width: 728, height: 90 } },
          { value: 'hero', label: 'Hero', sizes: { width: 728, height: 90 } },
        ];
    }
  };

  useEffect(() => {
    if (placement) {
      setFormData({
        name: placement.name,
        description: placement.description || '',
        page_type: placement.page_type,
        position: placement.position,
        size_width: placement.size_width,
        size_height: placement.size_height,
        is_active: placement.is_active,
      });
    }
  }, [placement]);

  // Update position and size when page type changes
  const handlePageTypeChange = (newPageType: PageType) => {
    const positionOptions = getPositionOptions(newPageType);
    const defaultPosition = positionOptions[0];

    setFormData({
      ...formData,
      page_type: newPageType,
      position: defaultPosition.value,
      size_width: defaultPosition.sizes.width,
      size_height: defaultPosition.sizes.height,
    });
  };

  // Update size when position changes
  const handlePositionChange = (newPosition: AdPosition) => {
    const positionOptions = getPositionOptions(formData.page_type);
    const selectedOption = positionOptions.find(opt => opt.value === newPosition);

    if (selectedOption) {
      setFormData({
        ...formData,
        position: newPosition,
        size_width: selectedOption.sizes.width,
        size_height: selectedOption.sizes.height,
      });
    } else {
      setFormData({ ...formData, position: newPosition });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      addNotification('Please enter a placement name', 'error');
      return;
    }

    try {
      setLoading(true);
      if (placement) {
        await advertisingStorage.updatePlacement(placement.id, formData);
        addNotification('Placement updated successfully', 'success');
      } else {
        await advertisingStorage.createPlacement(formData);
        addNotification('Placement created successfully', 'success');
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving placement:', error);
      addNotification('Failed to save placement', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {placement ? 'Edit Placement' : 'Add Placement'}
          </h2>
          <button onClick={() => onClose()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Placement Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Page Type</label>
              <select
                value={formData.page_type}
                onChange={(e) => handlePageTypeChange(e.target.value as PageType)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">All Pages</option>
                <option value="event_calendar">Event Calendar</option>
                <option value="media">Media</option>
                <option value="yacht_classes">Yacht Classes</option>
                <option value="alfie_tv">AlfieTV</option>
                <option value="my_garage">Boat Shed</option>
                <option value="weather">Weather</option>
                <option value="news">News</option>
                <option value="results">Results</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Position</label>
              <select
                value={formData.position}
                onChange={(e) => handlePositionChange(e.target.value as AdPosition)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {getPositionOptions(formData.page_type).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Recommended size: {getPositionOptions(formData.page_type).find(opt => opt.value === formData.position)?.sizes.width}x{getPositionOptions(formData.page_type).find(opt => opt.value === formData.position)?.sizes.height}px
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Width (px)</label>
              <input
                type="number"
                value={formData.size_width}
                onChange={(e) => setFormData({ ...formData, size_width: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Height (px)</label>
              <input
                type="number"
                value={formData.size_height}
                onChange={(e) => setFormData({ ...formData, size_height: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="placement_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4 text-blue-600 rounded"
            />
            <label htmlFor="placement_active" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Active</label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : placement ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
