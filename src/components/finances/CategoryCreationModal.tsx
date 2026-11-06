import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Tag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface CategoryCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (category: any) => void;
  darkMode: boolean;
  type?: 'income' | 'expense';
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const CategoryCreationModal: React.FC<CategoryCreationModalProps> = ({
  isOpen,
  onClose,
  onCategoryCreated,
  darkMode = true,
  type,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>(type || 'expense');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAssociation = !!associationId && !!associationType;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Category name is required');
      return;
    }

    if (!isAssociation && !currentClub?.clubId) {
      setError('No club selected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isAssociation) {
        const { data, error: insertError } = await supabase
          .from('association_budget_categories')
          .insert({
            association_id: associationId,
            association_type: associationType,
            name: name.trim(),
            description: description.trim() || null,
            type: categoryType,
            is_active: true
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (data) {
          onCategoryCreated(data);
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('budget_categories')
          .insert({
            club_id: currentClub?.clubId,
            name: name.trim(),
            description: description.trim() || null,
            type: categoryType,
            is_active: true
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (data) {
          onCategoryCreated(data);
        }
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

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <form onSubmit={handleSubmit} className="a-msheet" style={{ width: 460 }} role="dialog" aria-modal="true" aria-label="New category">
        <div className="flex items-center gap-3" style={{ padding: '20px 18px 16px 22px' }}>
          <span className="a-tile a-tile-rim"><Tag size={19} /></span>
          <h2 className="a-display a-ink flex-1 m-0 text-[21px] font-semibold">New category</h2>
          <button type="button" onClick={onClose} className="a-ib" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="flex flex-col gap-[18px]" style={{ padding: '4px 22px 22px' }}>
          {error && <div className="a-note"><span className="a-txt-r text-sm">{error}</span></div>}
          <label>
            <span className="a-flab">Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="a-inp" placeholder="e.g. Equipment, Events" required />
          </label>
          {!type && (
            <div>
              <span className="a-flab">Type</span>
              <div className="a-seg flex w-full" role="radiogroup" aria-label="Category type">
                <button type="button" role="radio" aria-checked={categoryType === 'income'} onClick={() => setCategoryType('income')} className={`a-seg-i flex-1 justify-center ${categoryType === 'income' ? 'a-seg-on' : ''}`}>
                  <span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Income
                </button>
                <button type="button" role="radio" aria-checked={categoryType === 'expense'} onClick={() => setCategoryType('expense')} className={`a-seg-i flex-1 justify-center ${categoryType === 'expense' ? 'a-seg-on' : ''}`}>
                  <span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Expense
                </button>
              </div>
            </div>
          )}
          <label>
            <span className="a-flab">Description <span className="a-dim font-normal">· optional</span></span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="a-inp" placeholder="What goes in this category?" rows={3} style={{ resize: 'none' }} />
          </label>
        </div>

        <div className="a-panel-foot" style={{ padding: '16px 22px' }}>
          <button type="button" onClick={onClose} className="a-btn flex-1" style={{ height: 46 }}>Cancel</button>
          <button type="submit" disabled={loading || !name.trim()} className="a-btn a-btn-p" style={{ height: 46, flex: 1.4 }}>
            {loading ? 'Saving…' : 'Save category'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};
