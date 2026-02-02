import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotification } from '../../contexts/NotificationContext';

interface AddClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  stateAssociationId: string;
  darkMode: boolean;
}

export const AddClubModal: React.FC<AddClubModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  stateAssociationId,
  darkMode
}) => {
  const { addNotification } = useNotification();
  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    location: '',
    email: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('clubs')
        .insert({
          name: formData.name,
          abbreviation: formData.abbreviation,
          location: formData.location,
          email: formData.email,
          phone: formData.phone,
          state_association_id: stateAssociationId
        });

      if (error) throw error;

      addNotification('success', 'Club added successfully');
      onSuccess();
    } catch (error) {
      console.error('Error adding club:', error);
      addNotification('error', 'Failed to add club');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className={`w-full max-w-2xl rounded-xl p-6 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Add New Club
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Club Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Abbreviation
            </label>
            <input
              type="text"
              value={formData.abbreviation}
              onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Phone
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Club'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
