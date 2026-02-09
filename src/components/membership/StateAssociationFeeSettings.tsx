import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Calendar, AlertCircle, CheckCircle, Edit2, Save, LogOut } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../utils/supabase';

interface FeeStructure {
  id: string;
  state_association_id: string;
  club_fee_amount: number;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
}

interface StateAssociationFeeSettingsProps {
  darkMode: boolean;
  stateAssociationId: string;
}

export const StateAssociationFeeSettings: React.FC<StateAssociationFeeSettingsProps> = ({
  darkMode,
  stateAssociationId
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clubFee: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    notes: ''
  });

  useEffect(() => {
    loadFeeStructures();
  }, [stateAssociationId]);

  const loadFeeStructures = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('state_association_club_fees')
        .select('*')
        .eq('state_association_id', stateAssociationId)
        .order('effective_from', { ascending: false });

      if (error) throw error;
      setFeeStructures(data || []);
    } catch (error) {
      console.error('Error loading fee structures:', error);
      addNotification('error', 'Failed to Load', 'Could not load fee structures.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const { data: user } = await supabase.auth.getUser();

      const structureData = {
        state_association_id: stateAssociationId,
        club_fee_amount: parseFloat(formData.clubFee),
        effective_from: formData.effectiveFrom,
        effective_to: formData.effectiveTo || null,
        notes: formData.notes || null,
        created_by: user.user?.id
      };

      if (editingId) {
        const { error } = await supabase
          .from('state_association_club_fees')
          .update(structureData)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('state_association_club_fees')
          .insert(structureData);

        if (error) throw error;
      }

      addNotification('success', 'Success', editingId ? 'Fee structure updated' : 'Fee structure created');
      setShowAddForm(false);
      setEditingId(null);
      resetForm();
      loadFeeStructures();
    } catch (error) {
      console.error('Error saving fee structure:', error);
      addNotification('error', 'Failed to Save', 'Could not save fee structure.');
    }
  };

  const handleEdit = (structure: FeeStructure) => {
    setFormData({
      clubFee: structure.club_fee_amount.toString(),
      effectiveFrom: structure.effective_from,
      effectiveTo: structure.effective_to || '',
      notes: structure.notes || ''
    });
    setEditingId(structure.id);
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      clubFee: '',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: '',
      notes: ''
    });
    setEditingId(null);
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingId(null);
    resetForm();
  };

  const currentStructure = feeStructures.find(s =>
    !s.effective_to || new Date(s.effective_to) >= new Date()
  );

  if (loading) {
    return (
      <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className={`ml-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Loading fee structures...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Club Membership Fees
        </h2>
        <p className={`mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Set the fees that clubs must pay to the state association per member per year
        </p>
      </div>

      {/* Current Structure */}
      {currentStructure && (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg border-l-4 border-green-500`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Current Fee Structure
              </h3>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                Effective from {new Date(currentStructure.effective_from).toLocaleDateString()}
                {currentStructure.effective_to && ` until ${new Date(currentStructure.effective_to).toLocaleDateString()}`}
              </p>
            </div>
            <CheckCircle className="w-6 h-6 text-green-500" />
          </div>

          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-blue-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-blue-500" />
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-blue-700'}`}>
                Club Fee
              </span>
            </div>
            <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              ${currentStructure.club_fee_amount.toFixed(2)}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              per member per year
            </p>
          </div>

          {currentStructure.notes && (
            <div className={`mt-4 p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <strong>Notes:</strong> {currentStructure.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add New Structure Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className={`w-full p-4 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-2 ${
            darkMode
              ? 'border-gray-600 hover:border-gray-500 text-gray-400 hover:text-gray-300'
              : 'border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700'
          }`}
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add New Fee Structure</span>
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg border-2 border-blue-500`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {editingId ? 'Edit Fee Structure' : 'New Fee Structure'}
            </h3>
            <button
              onClick={handleCancel}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Important Notice */}
            <div className={`p-3 rounded-lg flex items-start gap-2 ${
              darkMode ? 'bg-orange-900 bg-opacity-20' : 'bg-orange-50'
            }`}>
              <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className={`text-sm ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
                <strong>Important:</strong> Changes to fee structures will apply to new memberships from the effective date. Existing member records are not affected.
              </p>
            </div>

            {/* Fee Amount */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Club Membership Fee ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.clubFee}
                onChange={(e) => setFormData(prev => ({ ...prev, clubFee: e.target.value }))}
                required
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                placeholder="15.00"
              />
              <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Amount that each club must pay per member per year
              </p>
            </div>

            {/* Effective Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Effective From
                </label>
                <div className="relative">
                  <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <input
                    type="date"
                    value={formData.effectiveFrom}
                    onChange={(e) => setFormData(prev => ({ ...prev, effectiveFrom: e.target.value }))}
                    required
                    className={`w-full pl-10 pr-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white [color-scheme:dark]'
                        : 'bg-white border-gray-300 text-gray-900 [color-scheme:light]'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Effective To (Optional)
                </label>
                <div className="relative">
                  <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <input
                    type="date"
                    value={formData.effectiveTo}
                    onChange={(e) => setFormData(prev => ({ ...prev, effectiveTo: e.target.value }))}
                    min={formData.effectiveFrom}
                    className={`w-full pl-10 pr-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-gray-700 border-gray-600 text-white [color-scheme:dark]'
                        : 'bg-white border-gray-300 text-gray-900 [color-scheme:light]'
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="Add any notes about this fee structure change..."
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Update Structure' : 'Save Structure'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Historical Structures */}
      {feeStructures.length > 1 && (
        <div className={`p-6 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Historical Fee Structures
          </h3>
          <div className="space-y-3">
            {feeStructures
              .filter(s => s.id !== currentStructure?.id)
              .map((structure) => (
                <div
                  key={structure.id}
                  className={`p-4 rounded-lg border ${
                    darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Club Fee: ${structure.club_fee_amount.toFixed(2)}
                      </p>
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                        {new Date(structure.effective_from).toLocaleDateString()}
                        {structure.effective_to && ` - ${new Date(structure.effective_to).toLocaleDateString()}`}
                      </p>
                      {structure.notes && (
                        <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {structure.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleEdit(structure)}
                      className={`p-2 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
                      }`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
