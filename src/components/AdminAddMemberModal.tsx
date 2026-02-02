import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, Home, Building, Sailboat, Plus, Trash2, AlertTriangle, Check, Search, UserPlus, Globe, Award } from 'lucide-react';
import { BoatType, MemberFormData } from '../types/member';
import { addAdminMember } from '../utils/storage'; // New utility function
import { supabase } from '../utils/supabase';
import { getClubMemberClaims, acceptMemberClaim } from '../utils/multiClubMembershipStorage';
import { useAuth } from '../contexts/AuthContext';
import { SAILING_NATIONS, getCountryFlag } from '../utils/countryFlags';

interface AdminAddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode: boolean;
  onSuccess: () => void;
}

type TabType = 'new' | 'claim';

export const AdminAddMemberModal: React.FC<AdminAddMemberModalProps> = ({
  isOpen,
  onClose,
  clubId,
  darkMode,
  onSuccess
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string>('');

  // Claim tab state
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaim, setSelectedClaim] = useState<any | null>(null);

  const [formData, setFormData] = useState<MemberFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postcode: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }],
    country: 'Australia',
    country_code: 'AU',
    category: '',
    // Default values for fields not in this form, but required by MemberFormData
    club: '', // Will be set to current club name
    date_joined: new Date().toISOString().split('T')[0],
    membership_level: null,
    membership_level_custom: null,
    is_financial: true,
    amount_paid: null
  });

  useEffect(() => {
    // Fetch club name when modal opens
    if (isOpen && clubId) {
      fetchClubName();
      loadClaims();
    }
  }, [isOpen, clubId]);

  const fetchClubName = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .single();

      if (error) throw error;

      if (data) {
        setClubName(data.name);
        setFormData(prev => ({
          ...prev,
          club: data.name,
          country: prev.country || 'Australia',
          country_code: prev.country_code || 'AU'
        }));
      }
    } catch (err) {
      console.error('Error fetching club name:', err);
    }
  };

  const loadClaims = async () => {
    setLoadingClaims(true);
    try {
      const claims = await getClubMemberClaims(clubId);
      setPendingClaims(claims);
    } catch (err) {
      console.error('Error loading claims:', err);
    }
    setLoadingClaims(false);
  };

  const handleClaimMember = async (claim: any) => {
    if (!user) return;

    setSubmitting(true);
    setError(null);

    const success = await acceptMemberClaim(claim.id, user.id);

    if (success) {
      setSuccess(true);
      setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } else {
      setError('Failed to claim member. They may need to register an account first.');
    }

    setSubmitting(false);
  };

  const filteredClaims = pendingClaims.filter(claim => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = claim.profiles?.full_name || claim.full_name || '';
    const email = claim.profiles?.email || claim.email || '';
    const memberNumber = claim.profiles?.member_number || '';

    return (
      fullName.toLowerCase().includes(query) ||
      email.toLowerCase().includes(query) ||
      memberNumber.toLowerCase().includes(query)
    );
  });

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBoatChange = (index: number, field: keyof typeof formData.boats[0], value: string) => {
    setFormData(prev => {
      const updatedBoats = [...prev.boats];
      updatedBoats[index] = { ...updatedBoats[index], [field]: value };
      return { ...prev, boats: updatedBoats };
    });
  };

  const handleAddBoat = () => {
    setFormData(prev => ({
      ...prev,
      boats: [...prev.boats, { boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }]
    }));
  };

  const handleRemoveBoat = (index: number) => {
    if (formData.boats.length <= 1) return;

    setFormData(prev => ({
      ...prev,
      boats: prev.boats.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Check if a member with this email already exists for this club
      const { data: existingMember, error: checkError } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', clubId)
        .eq('email', formData.email)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingMember) {
        setError('A member with this email already exists in this club.');
        return;
      }

      // Validate required fields
      if (!formData.first_name || !formData.last_name) {
        throw new Error('First name and last name are required');
      }

      const newMember = await addAdminMember(formData, clubId);

      if (!newMember) {
        throw new Error('Failed to create member record. Please check your connection and try again.');
      }

      console.log('Member successfully added to Supabase:', newMember.id);
      setSuccess(true);
      
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        street: '',
        city: '',
        state: '',
        postcode: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relationship: '',
        boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }],
        country: 'Australia',
        country_code: 'AU',
        category: '',
        club: clubName,
        date_joined: new Date().toISOString().split('T')[0],
        membership_level: null,
        membership_level_custom: null,
        is_financial: true,
        amount_paid: null
      });
      
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error adding member:', err);
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        {/* Blue Gradient Header */}
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <UserPlus className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Add Member</h2>
              <p className="text-cyan-100 text-sm mt-0.5">{clubName || 'Club Member Management'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <button
            onClick={() => setActiveTab('new')}
            className={`flex-1 px-6 py-3 font-medium transition-colors ${
              activeTab === 'new'
                ? darkMode
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700/50'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <UserPlus size={18} />
              <span>Add New Member</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('claim')}
            className={`flex-1 px-6 py-3 font-medium transition-colors relative ${
              activeTab === 'claim'
                ? darkMode
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700/50'
                  : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Search size={18} />
              <span>Claim Existing Member</span>
              {pendingClaims.length > 0 && (
                <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingClaims.length}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-300">
                    {error}
                  </h3>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-300">
                    {activeTab === 'new' ? 'Member added successfully!' : 'Member claimed successfully!'}
                  </h3>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'claim' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or member number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Claims List */}
              {loadingClaims ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
                  <p className="text-slate-400 mt-4">Loading members...</p>
                </div>
              ) : filteredClaims.length === 0 ? (
                <div className="text-center py-12">
                  <User size={48} className="mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-400">
                    {searchQuery ? `No members found matching "${searchQuery}"` : 'No members available to claim'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 hover:bg-slate-700 transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-semibold text-slate-100">
                              {claim.profiles?.full_name || claim.full_name || 'Unknown Name'}
                            </h4>
                            {claim.match_confidence && claim.match_confidence > 0.8 && (
                              <span className="bg-green-900/30 text-green-400 text-xs px-2 py-1 rounded-full font-medium border border-green-800">
                                {Math.round(claim.match_confidence * 100)}% Match
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            <div className="text-slate-400">
                              <span className="font-medium text-slate-300">Email:</span> {claim.profiles?.email || claim.email || 'N/A'}
                            </div>
                            <div className="text-slate-400">
                              <span className="font-medium text-slate-300">Member #:</span> {claim.profiles?.member_number || 'Not assigned'}
                            </div>
                            {(claim.profiles?.date_of_birth || claim.date_of_birth) && (
                              <div className="text-slate-400">
                                <span className="font-medium text-slate-300">DOB:</span> {new Date(claim.profiles?.date_of_birth || claim.date_of_birth).toLocaleDateString()}
                              </div>
                            )}
                            {claim.phone && (
                              <div className="text-slate-400">
                                <span className="font-medium text-slate-300">Phone:</span> {claim.phone}
                              </div>
                            )}
                          </div>

                          {claim.match_reasons && claim.match_reasons.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-slate-500 mb-1">Match reasons:</p>
                              <div className="flex flex-wrap gap-1">
                                {claim.match_reasons.map((reason: string, idx: number) => (
                                  <span
                                    key={idx}
                                    className="bg-slate-600 text-slate-300 text-xs px-2 py-0.5 rounded"
                                  >
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleClaimMember(claim)}
                          disabled={submitting}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
                        >
                          <Check size={18} />
                          Claim Member
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'new' && (
            <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Information */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <User size={20} className="text-blue-400" />
                Personal Information
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter first name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter last name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>
              </div>

              {/* Country and Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Country <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                    <div className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl z-10 pointer-events-none">
                      {formData.country_code && getCountryFlag(formData.country_code)}
                    </div>
                    <select
                      required
                      value={formData.country_code || 'AU'}
                      onChange={(e) => {
                        const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                        setFormData(prev => ({
                          ...prev,
                          country_code: e.target.value,
                          country: country?.name || e.target.value
                        }));
                      }}
                      className="w-full pl-20 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {SAILING_NATIONS.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Category
                  </label>
                  <div className="relative">
                    <Award size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      name="category"
                      value={formData.category || ''}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Category</option>
                      <option value="Junior">Junior</option>
                      <option value="Open">Open</option>
                      <option value="Master">Master</option>
                      <option value="Grand Master">Grand Master</option>
                      <option value="Legend">Legend</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Home size={20} className="text-blue-400" />
                Address
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="street"
                    value={formData.street}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter street address"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      City/Suburb
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter city"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter state"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Postcode
                    </label>
                    <input
                      type="text"
                      name="postcode"
                      value={formData.postcode}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter postcode"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Phone size={20} className="text-blue-400" />
                Emergency Contact
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Emergency contact name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Emergency contact phone"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Relationship
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Spouse, Parent"
                  />
                </div>
              </div>
            </div>

            {/* Boats */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <Sailboat size={20} className="text-blue-400" />
                  Member Boats
                </h3>

                <button
                  type="button"
                  onClick={handleAddBoat}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
                >
                  <Plus size={16} />
                  Add Boat
                </button>
              </div>

              <div className="space-y-4">
                {formData.boats.length === 0 ? (
                  <div className="text-center py-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
                    <Sailboat size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-slate-400">No boats added yet</p>
                  </div>
                ) : (
                  formData.boats.map((boat, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 relative"
                    >
                      <button
                        type="button"
                        onClick={() => handleRemoveBoat(index)}
                        className="absolute top-2 right-2 p-1 rounded-full text-slate-400 hover:text-slate-300 hover:bg-slate-600/50"
                      >
                        <X size={16} />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            Boat Type
                          </label>
                          <select
                            value={boat.boat_type || ''}
                            onChange={(e) => handleBoatChange(index, 'boat_type', e.target.value as BoatType)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select boat type</option>
                            <option value="DF65">Dragon Force 65</option>
                            <option value="DF95">Dragon Force 95</option>
                            <option value="10R">10 Rater</option>
                            <option value="IOM">IOM</option>
                            <option value="Marblehead">Marblehead</option>
                            <option value="A Class">A Class</option>
                            <option value="RC Laser">RC Laser</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            Sail Number
                          </label>
                          <input
                            type="text"
                            value={boat.sail_number}
                            onChange={(e) => handleBoatChange(index, 'sail_number', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter sail number"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">
                            Hull
                          </label>
                          <input
                            type="text"
                            value={boat.hull}
                            onChange={(e) => handleBoatChange(index, 'hull', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter hull details"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting || success}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding Member...' : 'Add Member'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
};