import React, { useState, useEffect } from 'react';
import { Anchor, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useImpersonation } from '../../contexts/ImpersonationContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface Boat {
  id: string;
  boat_type: string;
  sail_number: string;
  hull: string;
  handicap: number | null;
}

interface MyBoatsPageProps {
  darkMode: boolean;
}

export const MyBoatsPage: React.FC<MyBoatsPageProps> = ({ darkMode }) => {
  const { user, currentClub } = useAuth();
  const { isImpersonating, session: impersonationSession } = useImpersonation();
  const effectiveUserId = isImpersonating ? impersonationSession?.targetUserId : user?.id;
  const { addNotification } = useNotifications();
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingBoatId, setEditingBoatId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    boat_type: '',
    sail_number: '',
    hull: '',
    handicap: null as number | null
  });

  useEffect(() => {
    if (currentClub?.clubId && effectiveUserId) {
      fetchMemberAndBoats();
    }
  }, [currentClub, effectiveUserId]);

  const fetchMemberAndBoats = async () => {
    try {
      setLoading(true);

      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', currentClub?.clubId)
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!memberData) {
        addNotification('error', 'Member record not found');
        return;
      }

      setMemberId(memberData.id);

      const { data: boatsData, error: boatsError } = await supabase
        .from('member_boats')
        .select('*')
        .eq('member_id', memberData.id)
        .order('boat_type', { ascending: true });

      if (boatsError) throw boatsError;

      setBoats(boatsData || []);
    } catch (err) {
      console.error('Error fetching boats:', err);
      addNotification('error', 'Failed to load boats');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBoat = async () => {
    if (!memberId || !formData.boat_type || !formData.sail_number) {
      addNotification('error', 'Please fill in boat type and sail number');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('member_boats')
        .insert([{
          member_id: memberId,
          boat_type: formData.boat_type,
          sail_number: formData.sail_number,
          hull: formData.hull || '',
          handicap: formData.handicap
        }])
        .select()
        .single();

      if (error) throw error;

      setBoats([...boats, data]);
      setFormData({ boat_type: '', sail_number: '', hull: '', handicap: null });
      setIsAdding(false);
      addNotification('success', 'Boat added successfully');
    } catch (err) {
      console.error('Error adding boat:', err);
      addNotification('error', 'Failed to add boat');
    }
  };

  const handleUpdateBoat = async () => {
    if (!editingBoatId || !formData.boat_type || !formData.sail_number) {
      addNotification('error', 'Please fill in boat type and sail number');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('member_boats')
        .update({
          boat_type: formData.boat_type,
          sail_number: formData.sail_number,
          hull: formData.hull || '',
          handicap: formData.handicap
        })
        .eq('id', editingBoatId)
        .select()
        .single();

      if (error) throw error;

      setBoats(boats.map(b => b.id === editingBoatId ? data : b));
      setFormData({ boat_type: '', sail_number: '', hull: '', handicap: null });
      setEditingBoatId(null);
      addNotification('success', 'Boat updated successfully');
    } catch (err) {
      console.error('Error updating boat:', err);
      addNotification('error', 'Failed to update boat');
    }
  };

  const handleDeleteBoat = async (boatId: string) => {
    if (!confirm('Are you sure you want to delete this boat?')) return;

    try {
      const { error } = await supabase
        .from('member_boats')
        .delete()
        .eq('id', boatId);

      if (error) throw error;

      setBoats(boats.filter(b => b.id !== boatId));
      addNotification('success', 'Boat deleted successfully');
    } catch (err) {
      console.error('Error deleting boat:', err);
      addNotification('error', 'Failed to delete boat');
    }
  };

  const startEdit = (boat: Boat) => {
    setEditingBoatId(boat.id);
    setFormData({
      boat_type: boat.boat_type,
      sail_number: boat.sail_number,
      hull: boat.hull || '',
      handicap: boat.handicap
    });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingBoatId(null);
    setIsAdding(false);
    setFormData({ boat_type: '', sail_number: '', hull: '', handicap: null });
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-16">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading boats...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">My Boats</h1>
              <p className="text-slate-400">Manage your registered boats</p>
            </div>
            {!isAdding && !editingBoatId && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
                <span>Add Boat</span>
              </button>
            )}
          </div>

          {(isAdding || editingBoatId) && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                {isAdding ? 'Add New Boat' : 'Edit Boat'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Boat Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., IOM, 10R"
                    value={formData.boat_type}
                    onChange={(e) => setFormData({ ...formData, boat_type: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Sail Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 123"
                    value={formData.sail_number}
                    onChange={(e) => setFormData({ ...formData, sail_number: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Hull Type
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Trance, Cheinz"
                    value={formData.hull}
                    onChange={(e) => setFormData({ ...formData, hull: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Handicap
                  </label>
                  <input
                    type="number"
                    placeholder="e.g., 1000"
                    value={formData.handicap || ''}
                    onChange={(e) => setFormData({ ...formData, handicap: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={isAdding ? handleAddBoat : handleUpdateBoat}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{isAdding ? 'Add Boat' : 'Save Changes'}</span>
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {boats.length === 0 ? (
            <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
              <Anchor className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-2">No boats registered yet</p>
              <p className="text-slate-500 text-sm">Click "Add Boat" to register your first boat</p>
            </div>
          ) : (
            <div className="space-y-4">
              {boats.map((boat) => (
                <div
                  key={boat.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Anchor className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{boat.boat_type}</h3>
                        <p className="text-slate-400 text-sm">
                          Sail: {boat.sail_number}
                          {boat.hull && ` • Hull: ${boat.hull}`}
                          {boat.handicap && ` • Handicap: ${boat.handicap}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEdit(boat)}
                        className="p-2 text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                        title="Edit boat"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteBoat(boat.id)}
                        className="p-2 text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                        title="Delete boat"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
