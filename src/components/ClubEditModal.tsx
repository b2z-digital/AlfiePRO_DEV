import React, { useState, useEffect } from 'react';
import { X, Upload, Plus, Trash2, User, Phone, Mail, Building2, ChevronDown } from 'lucide-react';
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

const inputClasses = `
  w-full px-4 py-3 rounded-xl text-sm text-slate-200 placeholder-slate-500
  bg-slate-800/80 border border-slate-700/60
  focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50
  transition-all
`;

const inputWithIconClasses = `
  w-full pl-11 pr-4 py-3 rounded-xl text-sm text-slate-200 placeholder-slate-500
  bg-slate-800/80 border border-slate-700/60
  focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50
  transition-all
`;

const selectClasses = `
  w-full px-4 py-3 rounded-xl text-sm text-slate-200
  bg-slate-800/80 border border-slate-700/60 appearance-none
  focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50
  transition-all
`;

const labelClasses = 'block text-sm font-medium mb-2 text-slate-300';
const sublabelClasses = 'block text-xs font-medium mb-1.5 text-slate-400';

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

      const { error: clubError } = await supabase
        .from('clubs')
        .update({
          name: clubData.name,
          abbreviation: clubData.abbreviation,
          logo: clubData.logo
        })
        .eq('id', clubId);

      if (clubError) throw clubError;

      const { error: deleteError } = await supabase
        .from('committee_positions')
        .delete()
        .eq('club_id', clubId);

      if (deleteError) throw deleteError;

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/50">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <Building2 size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Edit Club Details</h2>
              <p className="text-sm text-blue-100 mt-0.5">Update your club information</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-xl transition"
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
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClasses}>Club Name *</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={clubData.name}
                      onChange={(e) => setClubData({ ...clubData, name: e.target.value })}
                      className={inputWithIconClasses}
                      placeholder="Enter club name"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClasses}>Abbreviated Name *</label>
                  <input
                    type="text"
                    value={clubData.abbreviation}
                    onChange={(e) => setClubData({ ...clubData, abbreviation: e.target.value })}
                    className={inputClasses}
                    placeholder="Enter abbreviated name"
                  />
                </div>
              </div>

              <div>
                <label className={labelClasses}>Club Logo</label>
                <div className="flex items-center gap-4">
                  {clubData.logo && (
                    <img
                      src={clubData.logo}
                      alt="Club logo"
                      className="w-16 h-16 object-contain rounded-xl border border-slate-700/60"
                    />
                  )}
                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer transition-colors bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/60">
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className={labelClasses.replace('mb-2', 'mb-0')}>Committee Positions</label>
                  <button
                    type="button"
                    onClick={handleAddPosition}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    <Plus size={14} />
                    Add Position
                  </button>
                </div>

                <div className="space-y-4">
                  {committeePositions.map((position, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-xl border bg-slate-800/50 border-slate-700/50"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="text-sm font-medium text-slate-300">
                          Position {index + 1}
                        </h4>
                        <button
                          onClick={() => handleRemovePosition(index)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className={sublabelClasses}>Position Title</label>
                          <input
                            type="text"
                            value={position.title}
                            onChange={(e) => handlePositionChange(index, 'title', e.target.value)}
                            className={inputClasses}
                            placeholder="e.g., Commodore, Secretary"
                          />
                        </div>

                        <div>
                          <label className={sublabelClasses}>Select Member</label>
                          <div className="relative">
                            <select
                              onChange={(e) => {
                                const member = members.find(m => m.id === e.target.value);
                                if (member) handleSelectMember(index, member);
                              }}
                              className={selectClasses}
                            >
                              <option value="">Select a member</option>
                              {members.map(member => (
                                <option key={member.id} value={member.id}>
                                  {member.first_name} {member.last_name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className={sublabelClasses}>Name</label>
                          <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              type="text"
                              value={position.name}
                              onChange={(e) => handlePositionChange(index, 'name', e.target.value)}
                              className={inputWithIconClasses}
                              placeholder="Full name"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={sublabelClasses}>Email</label>
                          <div className="relative">
                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              type="email"
                              value={position.email}
                              onChange={(e) => handlePositionChange(index, 'email', e.target.value)}
                              className={inputWithIconClasses}
                              placeholder="email@example.com"
                            />
                          </div>
                        </div>

                        <div>
                          <label className={sublabelClasses}>Phone</label>
                          <div className="relative">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                              type="tel"
                              value={position.phone}
                              onChange={(e) => handlePositionChange(index, 'phone', e.target.value)}
                              className={inputWithIconClasses}
                              placeholder="Phone number"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {committeePositions.length === 0 && (
                    <div className="text-center py-10 rounded-xl border-2 border-dashed border-slate-700/50 text-slate-500">
                      <p className="mb-2">No committee positions added yet</p>
                      <button
                        onClick={handleAddPosition}
                        className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
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

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700/50">
          <button
            onClick={onClose}
            disabled={saving}
            className={`
              px-5 py-2.5 rounded-xl font-medium transition-colors text-slate-300 hover:text-white hover:bg-slate-800
              ${saving ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !clubData?.name || !clubData?.abbreviation}
            className={`
              px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-500 font-medium transition-colors
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
