import React, { useState, useEffect } from 'react';
import { Building, Plus, Trash2, Upload, X, Edit2, Phone, Mail, ArrowLeft, Users } from 'lucide-react';
import { Club, ClubFormData } from '../../types/club';
import { getStoredClubs, addClub, updateClub, deleteClub } from '../../utils/clubStorage';
import { ConfirmationModal } from '../ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { createClub } from '../../utils/auth';
import { getStoredMembers } from '../../utils/storage';
import { Member } from '../../types/member';
import { CommitteePositionForm } from '../CommitteePositionForm';

interface ClubSettingsProps {
  darkMode: boolean;
}

export const ClubSettings: React.FC<ClubSettingsProps> = ({
  darkMode
}) => {
  const { refreshUserClubs, setCurrentClub } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clubToDelete, setClubToDelete] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<ClubFormData>({
    name: '',
    abbreviation: '',
    logo: null,
    committeePositions: []
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchClubs();
    fetchMembers();
  }, []);

  const fetchClubs = async () => {
    try {
      setLoading(true);
      const storedClubs = await getStoredClubs();
      setClubs(storedClubs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    try {
      const storedMembers = await getStoredMembers();
      setMembers(storedMembers);
    } catch (err) {
      console.error('Error fetching members:', err);
    }
  };

  const handleAddPosition = () => {
    setFormData(prev => ({
      ...prev,
      committeePositions: [
        ...prev.committeePositions,
        { title: '', name: '', email: '', phone: '' }
      ]
    }));
  };

  const handleRemovePosition = (index: number) => {
    setFormData(prev => ({
      ...prev,
      committeePositions: prev.committeePositions.filter((_, i) => i !== index)
    }));
  };

  const handlePositionChange = (
    index: number,
    field: keyof typeof formData.committeePositions[0],
    value: string
  ) => {
    setFormData(prev => {
      const newPositions = [...prev.committeePositions];
      newPositions[index] = { ...newPositions[index], [field]: value };
      return { ...prev, committeePositions: newPositions };
    });
  };

  const handleSelectMember = (index: number, member: Member) => {
    setFormData(prev => {
      const newPositions = [...prev.committeePositions];
      newPositions[index] = { 
        ...newPositions[index], 
        name: `${member.first_name} ${member.last_name}`,
        email: member.email || '',
        phone: member.phone || ''
      };
      return { ...prev, committeePositions: newPositions };
    });
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
      setFormData(prev => ({
        ...prev,
        logo: reader.result as string
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      if (selectedClub) {
        const updatedClub = await updateClub(selectedClub.id, formData);
        if (!updatedClub) {
          throw new Error('Failed to update club');
        }
      } else {
        // Use the auth context's createClub function to ensure the user is added as admin
        const newClub = await createClub(formData.name, formData.abbreviation, formData.logo);
        if (!newClub) {
          throw new Error('Failed to add club');
        }
        
        // Refresh user clubs to include the new club
        await refreshUserClubs();
        
        // Set the new club as the current club
        const userClubs = await refreshUserClubs();
        const newUserClub = userClubs.find(uc => uc.club?.id === newClub.id);
        if (newUserClub) {
          setCurrentClub(newUserClub);
        }
      }

      await fetchClubs();
      setSelectedClub(null);
      setShowForm(false);
      setFormData({
        name: '',
        abbreviation: '',
        logo: null,
        committeePositions: []
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleEdit = (club: Club) => {
    setSelectedClub(club);
    setFormData({
      name: club.name,
      abbreviation: club.abbreviation,
      logo: club.logo,
      committeePositions: club.committeePositions.map(pos => ({
        title: pos.title,
        name: pos.name,
        email: pos.email || '',
        phone: pos.phone || ''
      }))
    });
    setShowForm(true);
  };

  const handleDeleteClick = (club: Club) => {
    setClubToDelete(club);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (clubToDelete) {
      try {
        const success = await deleteClub(clubToDelete.id);
        if (!success) {
          throw new Error('Failed to delete club');
        }
        await fetchClubs();
        
        // Refresh user clubs to reflect the deletion
        await refreshUserClubs();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }
    setShowDeleteConfirm(false);
    setClubToDelete(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <Building className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Club Settings</h1>
              <p className="text-slate-400">
                {clubs.length} {clubs.length === 1 ? 'club' : 'clubs'} registered
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus size={18} />
            Add Club
          </button>
        </div>
      </div>

        {showForm ? (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Club Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter club name"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Abbreviated Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.abbreviation}
                    onChange={(e) => setFormData(prev => ({ ...prev, abbreviation: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter abbreviated name"
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Club Logo
                </label>
                <div className="flex items-center gap-4">
                  {formData.logo && (
                    <img 
                      src={formData.logo} 
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
                  {formData.committeePositions.map((position, index) => (
                    <CommitteePositionForm
                      key={index}
                      index={index}
                      position={position}
                      members={members}
                      darkMode={darkMode}
                      onRemove={() => handleRemovePosition(index)}
                      onChange={(field, value) => handlePositionChange(index, field as any, value)}
                      onSelectMember={(member) => handleSelectMember(index, member)}
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-900/10 text-red-500 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setSelectedClub(null);
                    setFormData({
                      name: '',
                      abbreviation: '',
                      logo: null,
                      committeePositions: []
                    });
                  }}
                  className={`
                    px-4 py-2 rounded-lg font-medium transition-colors
                    ${darkMode
                      ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                  `}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  {selectedClub ? 'Update Club' : 'Save Club'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div>
            {loading ? (
              <div className={`
                text-center py-12 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'}
              `}>
                Loading clubs...
              </div>
            ) : clubs.length === 0 ? (
              <div className={`
                text-center py-12 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'}
              `}>
                <Building size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No Clubs</p>
                <p className="text-sm">Add your first club to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {clubs.map(club => (
                  <div
                    key={club.id}
                    className={`
                      p-6 rounded-lg border group relative
                      ${darkMode 
                        ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                        : 'bg-white border-slate-200 hover:bg-slate-50'}
                    `}
                  >
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(club)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-slate-600 text-slate-300' 
                              : 'hover:bg-slate-200 text-slate-600'
                          }`}
                          title="Edit club"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(club)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-red-900/50 text-red-400' 
                              : 'hover:bg-red-100 text-red-600'
                          }`}
                          title="Delete club"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mb-4">
                      {club.logo && (
                        <img 
                          src={club.logo} 
                          alt={`${club.name} logo`}
                          className="w-12 h-12 object-contain rounded-lg"
                        />
                      )}
                      <div>
                        <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {club.name}
                        </h3>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {club.abbreviation}
                        </p>
                      </div>
                    </div>

                    {club.committeePositions.length > 0 && (
                      <div className="space-y-2">
                        <h4 className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Committee Members
                        </h4>
                        <div className="space-y-1">
                          {club.committeePositions.map((position, index) => (
                            <div 
                              key={index}
                              className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                                    {position.title}:
                                  </span>{' '}
                                  {position.name}
                                </div>
                                {position.phone && (
                                  <div className="flex items-center gap-1 text-xs text-slate-400">
                                    <Phone size={12} />
                                    {position.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Club"
        message="Are you sure you want to delete this club? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        darkMode={darkMode}
      />
    </div>
  );
};