import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, Shield, Anchor, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';

interface MemberDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  darkMode: boolean;
  onSuccess?: () => void;
}

interface MemberData {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  is_financial: boolean;
  date_joined: string;
  renewal_date: string;
  avatar_url: string | null;
}

interface MemberBoat {
  id: string;
  boat_type: string;
  sail_number: string;
  hull: string;
  handicap: number;
}

export const MemberDetailsModal: React.FC<MemberDetailsModalProps> = ({
  isOpen,
  onClose,
  memberId,
  darkMode,
  onSuccess
}) => {
  const { currentClub } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [memberBoats, setMemberBoats] = useState<MemberBoat[]>([]);
  const [editingBoat, setEditingBoat] = useState<MemberBoat | null>(null);
  const [showAddBoat, setShowAddBoat] = useState(false);

  useEffect(() => {
    if (isOpen && memberId) {
      fetchMemberData();
      fetchMemberBoats();
    }
  }, [isOpen, memberId]);

  const fetchMemberData = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .single();

      if (error) throw error;
      setMemberData(data);
    } catch (err) {
      console.error('Error fetching member data:', err);
      setError('Failed to load member data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMemberBoats = async () => {
    try {
      const { data, error } = await supabase
        .from('member_boats')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at');

      if (error) throw error;
      setMemberBoats(data || []);
    } catch (err) {
      console.error('Error fetching member boats:', err);
    }
  };

  const handleSaveMember = async () => {
    if (!memberData) return;

    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('members')
        .update({
          first_name: memberData.first_name,
          last_name: memberData.last_name,
          email: memberData.email,
          phone: memberData.phone,
          street: memberData.street,
          city: memberData.city,
          state: memberData.state,
          postcode: memberData.postcode,
          emergency_contact_name: memberData.emergency_contact_name,
          emergency_contact_phone: memberData.emergency_contact_phone,
          emergency_contact_relationship: memberData.emergency_contact_relationship
        })
        .eq('id', memberId);

      if (error) throw error;

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving member data:', err);
      setError(err instanceof Error ? err.message : 'Failed to save member data');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBoat = async (boat: Partial<MemberBoat>) => {
    try {
      setError(null);

      if (editingBoat) {
        // Update existing boat
        const { error } = await supabase
          .from('member_boats')
          .update({
            boat_type: boat.boat_type,
            sail_number: boat.sail_number,
            hull: boat.hull,
            handicap: boat.handicap
          })
          .eq('id', editingBoat.id);

        if (error) throw error;
      } else {
        // Add new boat
        const { error } = await supabase
          .from('member_boats')
          .insert({
            member_id: memberId,
            boat_type: boat.boat_type,
            sail_number: boat.sail_number,
            hull: boat.hull,
            handicap: boat.handicap
          });

        if (error) throw error;
      }

      await fetchMemberBoats();
      setEditingBoat(null);
      setShowAddBoat(false);
    } catch (err) {
      console.error('Error saving boat:', err);
      setError(err instanceof Error ? err.message : 'Failed to save boat');
    }
  };

  const handleDeleteBoat = async (boatId: string) => {
    if (!confirm('Are you sure you want to delete this boat?')) return;

    try {
      setError(null);

      const { error } = await supabase
        .from('member_boats')
        .delete()
        .eq('id', boatId);

      if (error) throw error;

      await fetchMemberBoats();
    } catch (err) {
      console.error('Error deleting boat:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete boat');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {memberData?.avatar_url ? (
                <img
                  src={memberData.avatar_url}
                  alt={`${memberData.first_name} ${memberData.last_name}`}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-blue-700 border-2 border-white/30 flex items-center justify-center text-white text-xl font-semibold">
                  {memberData ? `${memberData.first_name[0]}${memberData.last_name[0]}` : ''}
                </div>
              )}
              <h2 className="text-2xl font-semibold text-white">
                {memberData ? `${memberData.first_name} ${memberData.last_name}` : 'Member Details'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : memberData ? (
            <div className="space-y-8">
              {error && (
                <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Personal Information */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <User className="text-blue-400" size={20} />
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Personal Information
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={memberData.first_name}
                      onChange={(e) => setMemberData({ ...memberData, first_name: e.target.value })}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Last Name *
                    </label>
                    <input
                      type="text"
                      value={memberData.last_name}
                      onChange={(e) => setMemberData({ ...memberData, last_name: e.target.value })}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={memberData.email}
                        onChange={(e) => setMemberData({ ...memberData, email: e.target.value })}
                        className={`
                          w-full pl-10 pr-3 py-2 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-900'}
                        `}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="tel"
                        value={memberData.phone || ''}
                        onChange={(e) => setMemberData({ ...memberData, phone: e.target.value })}
                        className={`
                          w-full pl-10 pr-3 py-2 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-900'}
                        `}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="text-blue-400" size={20} />
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Address
                  </h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={memberData.street || ''}
                      onChange={(e) => setMemberData({ ...memberData, street: e.target.value })}
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        City/Suburb
                      </label>
                      <input
                        type="text"
                        value={memberData.city || ''}
                        onChange={(e) => setMemberData({ ...memberData, city: e.target.value })}
                        className={`
                          w-full px-3 py-2 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-900'}
                        `}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        State
                      </label>
                      <input
                        type="text"
                        value={memberData.state || ''}
                        onChange={(e) => setMemberData({ ...memberData, state: e.target.value })}
                        className={`
                          w-full px-3 py-2 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-900'}
                        `}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Postcode
                      </label>
                      <input
                        type="text"
                        value={memberData.postcode || ''}
                        onChange={(e) => setMemberData({ ...memberData, postcode: e.target.value })}
                        className={`
                          w-full px-3 py-2 rounded-lg border
                          ${darkMode 
                            ? 'bg-slate-700 border-slate-600 text-white' 
                            : 'bg-white border-slate-300 text-slate-900'}
                        `}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Emergency Contact */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="text-blue-400" size={20} />
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Emergency Contact
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Contact Name
                    </label>
                    <input
                      type="text"
                      value={memberData.emergency_contact_name || ''}
                      onChange={(e) => setMemberData({ ...memberData, emergency_contact_name: e.target.value })}
                      placeholder="Emergency contact name"
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={memberData.emergency_contact_phone || ''}
                      onChange={(e) => setMemberData({ ...memberData, emergency_contact_phone: e.target.value })}
                      placeholder="Emergency contact phone"
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Relationship
                    </label>
                    <input
                      type="text"
                      value={memberData.emergency_contact_relationship || ''}
                      onChange={(e) => setMemberData({ ...memberData, emergency_contact_relationship: e.target.value })}
                      placeholder="e.g., Spouse, Parent"
                      className={`
                        w-full px-3 py-2 rounded-lg border
                        ${darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white' 
                          : 'bg-white border-slate-300 text-slate-900'}
                      `}
                    />
                  </div>
                </div>
              </div>

              {/* Member's Boats */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Anchor className="text-blue-400" size={20} />
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                      Member's Boats
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowAddBoat(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Plus size={14} />
                    Add Boat
                  </button>
                </div>

                <div className="space-y-4">
                  {memberBoats.map((boat) => (
                    <div
                      key={boat.id}
                      className={`
                        p-4 rounded-lg border
                        ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
                      `}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Boat Type
                          </label>
                          <select
                            value={boat.boat_type}
                            onChange={(e) => {
                              const updatedBoats = memberBoats.map(b =>
                                b.id === boat.id ? { ...b, boat_type: e.target.value } : b
                              );
                              setMemberBoats(updatedBoats);
                            }}
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          >
                            <option value="10 Rater">10 Rater</option>
                            <option value="IOM">IOM</option>
                            <option value="Marblehead">Marblehead</option>
                            <option value="A Class">A Class</option>
                            <option value="6 Metre">6 Metre</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Sail Number
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={boat.sail_number || ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              const updatedBoats = memberBoats.map(b =>
                                b.id === boat.id ? { ...b, sail_number: value } : b
                              );
                              setMemberBoats(updatedBoats);
                            }}
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode
                                ? 'bg-slate-700 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Hull
                          </label>
                          <input
                            type="text"
                            value={boat.hull || ''}
                            onChange={(e) => {
                              const updatedBoats = memberBoats.map(b =>
                                b.id === boat.id ? { ...b, hull: e.target.value } : b
                              );
                              setMemberBoats(updatedBoats);
                            }}
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div className="flex items-end gap-2">
                          <button
                            onClick={() => handleSaveBoat(boat)}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => handleDeleteBoat(boat.id)}
                            className="p-2 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {showAddBoat && (
                    <div className={`
                      p-4 rounded-lg border
                      ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
                    `}>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Boat Type
                          </label>
                          <select
                            defaultValue="10 Rater"
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          >
                            <option value="10 Rater">10 Rater</option>
                            <option value="IOM">IOM</option>
                            <option value="Marblehead">Marblehead</option>
                            <option value="A Class">A Class</option>
                            <option value="6 Metre">6 Metre</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Sail Number
                          </label>
                          <input
                            type="text"
                            placeholder="70"
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Hull
                          </label>
                          <input
                            type="text"
                            placeholder="B6"
                            className={`
                              w-full px-3 py-2 rounded-lg border text-sm
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          />
                        </div>

                        <div className="flex items-end gap-2">
                          <button
                            onClick={() => {
                              // Handle add boat logic here
                              setShowAddBoat(false);
                            }}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => setShowAddBoat(false)}
                            className="p-2 text-slate-400 hover:text-slate-300 transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {memberBoats.length === 0 && !showAddBoat && (
                    <div className={`
                      text-center py-8 rounded-lg border-2 border-dashed
                      ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500'}
                    `}>
                      <Anchor size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="mb-2">No boats registered</p>
                      <button
                        onClick={() => setShowAddBoat(true)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Add the first boat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-400">Failed to load member data</p>
            </div>
          )}
        </div>

        <div className={`
          flex justify-end gap-3 p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              ${saving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Close
          </button>
          <button
            onClick={handleSaveMember}
            disabled={saving || !memberData?.first_name || !memberData?.last_name}
            className={`
              px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
              ${(saving || !memberData?.first_name || !memberData?.last_name) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};