import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Trash2, User, Phone, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { useNotifications } from '../contexts/NotificationContext';

interface ClubEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode: boolean;
  onSuccess?: () => void;
}

interface ClubData {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  organization_type: string;
}

interface CommitteePosition {
  id?: string;
  title: string;
  name: string;
  email: string;
  phone: string;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export const ClubEditModal: React.FC<ClubEditModalProps> = ({
  isOpen,
  onClose,
  clubId,
  darkMode,
  onSuccess
}) => {
  const { refreshUserClubs } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubData, setClubData] = useState<ClubData | null>(null);
  const [committeePositions, setCommitteePositions] = useState<CommitteePosition[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isOpen && clubId) {
      fetchClubData();
      fetchCommitteePositions();
      fetchMembers();
    }
  }, [isOpen, clubId]);

  const fetchClubData = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name, abbreviation, logo, organization_type')
        .eq('id', clubId)
        .single();

      if (error) throw error;
      setClubData(data);
    } catch (err) {
      console.error('Error fetching club data:', err);
      setError('Failed to load club data');
    }
  };

  const fetchCommitteePositions = async () => {
    try {
      const { data, error } = await supabase
        .from('committee_positions')
        .select('*')
        .eq('club_id', clubId)
        .order('title');

      if (error) throw error;
      setCommitteePositions(data || []);
    } catch (err) {
      console.error('Error fetching committee positions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('id, first_name, last_name, email, phone')
        .eq('club_id', clubId)
        .order('first_name');

      if (error) throw error;
      setMembers(data || []);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (clubData) {
        setClubData({
          ...clubData,
          logo: reader.result as string
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddPosition = () => {
    setCommitteePositions([
      ...committeePositions,
      { title: '', name: '', email: '', phone: '' }
    ]);
  };

  const handleRemovePosition = (index: number) => {
    setCommitteePositions(committeePositions.filter((_, i) => i !== index));
  };

  const handlePositionChange = (
    index: number,
    field: keyof CommitteePosition,
    value: string
  ) => {
    const newPositions = [...committeePositions];
    newPositions[index] = { ...newPositions[index], [field]: value };
    setCommitteePositions(newPositions);
  };

  const handleSelectMember = (index: number, member: Member) => {
    const newPositions = [...committeePositions];
    newPositions[index] = {
      ...newPositions[index],
      name: `${member.first_name} ${member.last_name}`,
      email: member.email || '',
      phone: member.phone || ''
    };
    setCommitteePositions(newPositions);
  };

  const handleSave = async () => {
    if (!clubData) return;

    try {
      setSaving(true);
      setError(null);

      // Update club data
      const { error: clubError } = await supabase
        .from('clubs')
        .update({
          name: clubData.name,
          abbreviation: clubData.abbreviation,
          logo: clubData.logo
        })
        .eq('id', clubId);

      if (clubError) throw clubError;

      // Delete existing committee positions
      const { error: deleteError } = await supabase
        .from('committee_positions')
        .delete()
        .eq('club_id', clubId);

      if (deleteError) throw deleteError;

      // Insert new committee positions
      if (committeePositions.length > 0) {
        const positionsToInsert = committeePositions
          .filter(pos => pos.title && pos.name)
          .map(pos => ({
            club_id: clubId,
            title: pos.title,
            name: pos.name,
            email: pos.email || null,
            phone: pos.phone || null
          }));

        if (positionsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('committee_positions')
            .insert(positionsToInsert);

          if (insertError) throw insertError;
        }
      }

      // Refresh user clubs to update the UI
      await refreshUserClubs();

      addNotification('success', 'Club details updated successfully');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error saving club data:', err);
      setError(err instanceof Error ? err.message : 'Failed to save club data');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Edit Club Details
          </h2>
          <button
            onClick={onClose}
            className={`
              rounded-full p-2 transition-colors
              ${darkMode 
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
            `}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : clubData ? (
            <div className="space-y-6">
              {error && (
                <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Club Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Club Name *
                  </label>
                  <input
                    type="text"
                    value={clubData.name}
                    onChange={(e) => setClubData({ ...clubData, name: e.target.value })}
                    className={`
                      w-full px-3 py-2 rounded-lg border
                      ${darkMode 
                        ? 'bg-slate-700 border-slate-600 text-white' 
                        : 'bg-white border-slate-300 text-slate-900'}
                    `}
                    placeholder="Enter club name"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Abbreviated Name *
                  </label>
                  <input
                    type="text"
                    value={clubData.abbreviation}
                    onChange={(e) => setClubData({ ...clubData, abbreviation: e.target.value })}
                    className={`
                      w-full px-3 py-2 rounded-lg border
                      ${darkMode 
                        ? 'bg-slate-700 border-slate-600 text-white' 
                        : 'bg-white border-slate-300 text-slate-900'}
                    `}
                    placeholder="Enter abbreviated name"
                  />
                </div>
              </div>

              {/* Club Logo */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Club Logo
                </label>
                <div className="flex items-center gap-4">
                  {clubData.logo && (
                    <img 
                      src={clubData.logo} 
                      alt="Club logo" 
                      className="w-16 h-16 object-contain rounded-lg"
                    />
                  )}
                  <label className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                      : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'}
                  `}>
                    <Upload size={18} />
                    Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Committee Positions */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Committee Positions
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPosition}
                    className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={14} />
                    Add Position
                  </button>
                </div>

                <div className="space-y-4">
                  {committeePositions.map((position, index) => (
                    <div
                      key={index}
                      className={`
                        p-4 rounded-lg border
                        ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}
                      `}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h4 className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Position {index + 1}
                        </h4>
                        <button
                          onClick={() => handleRemovePosition(index)}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Position Title
                          </label>
                          <input
                            type="text"
                            value={position.title}
                            onChange={(e) => handlePositionChange(index, 'title', e.target.value)}
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                            placeholder="e.g., Commodore, Secretary"
                          />
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Select Member
                          </label>
                          <select
                            onChange={(e) => {
                              const member = members.find(m => m.id === e.target.value);
                              if (member) handleSelectMember(index, member);
                            }}
                            className={`
                              w-full px-3 py-2 text-sm rounded-lg border
                              ${darkMode 
                                ? 'bg-slate-700 border-slate-600 text-white' 
                                : 'bg-white border-slate-300 text-slate-900'}
                            `}
                          >
                            <option value="">Select a member</option>
                            {members.map(member => (
                              <option key={member.id} value={member.id}>
                                {member.first_name} {member.last_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Name
                          </label>
                          <div className="relative">
                            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={position.name}
                              onChange={(e) => handlePositionChange(index, 'name', e.target.value)}
                              className={`
                                w-full pl-10 pr-3 py-2 text-sm rounded-lg border
                                ${darkMode 
                                  ? 'bg-slate-700 border-slate-600 text-white' 
                                  : 'bg-white border-slate-300 text-slate-900'}
                              `}
                              placeholder="Full name"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Email
                          </label>
                          <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="email"
                              value={position.email}
                              onChange={(e) => handlePositionChange(index, 'email', e.target.value)}
                              className={`
                                w-full pl-10 pr-3 py-2 text-sm rounded-lg border
                                ${darkMode 
                                  ? 'bg-slate-700 border-slate-600 text-white' 
                                  : 'bg-white border-slate-300 text-slate-900'}
                              `}
                              placeholder="email@example.com"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            Phone
                          </label>
                          <div className="relative">
                            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="tel"
                              value={position.phone}
                              onChange={(e) => handlePositionChange(index, 'phone', e.target.value)}
                              className={`
                                w-full pl-10 pr-3 py-2 text-sm rounded-lg border
                                ${darkMode 
                                  ? 'bg-slate-700 border-slate-600 text-white' 
                                  : 'bg-white border-slate-300 text-slate-900'}
                              `}
                              placeholder="Phone number"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {committeePositions.length === 0 && (
                    <div className={`
                      text-center py-8 rounded-lg border-2 border-dashed
                      ${darkMode ? 'border-slate-600 text-slate-400' : 'border-slate-300 text-slate-500'}
                    `}>
                      <p className="mb-2">No committee positions added yet</p>
                      <button
                        onClick={handleAddPosition}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Add your first position
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-400">Failed to load club data</p>
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clubData?.name || !clubData?.abbreviation}
            className={`
              px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
              ${(saving || !clubData?.name || !clubData?.abbreviation) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};