import React, { useState } from 'react';
import { X, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface CategoryCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (category: any) => void;
  darkMode: boolean;
  type: 'income' | 'expense';
}

export const CategoryCreationModal: React.FC<CategoryCreationModalProps> = ({
  isOpen,
  onClose,
  onCategoryCreated,
  darkMode = true,
  type
}) => {
  const { currentClub } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Category name is required');
      return;
    }

    if (!currentClub?.clubId) {
      setError('No club selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: insertError } = await supabase
        .from('budget_categories')
        .insert({
          club_id: currentClub.clubId,
          name: name.trim(),
          description: description.trim() || null,
          type,
          is_active: true
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onCategoryCreated(data);
      }

      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      console.error('Error creating category:', err);
      setError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-md mx-4 rounded-xl shadow-xl border ${darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-gray-900 border-slate-200'}`}>
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Tag className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Add New Category
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`rounded-full p-2 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Category Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}`}
                placeholder="Enter category name"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'}`}
                placeholder="Enter category description"
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${darkMode ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};