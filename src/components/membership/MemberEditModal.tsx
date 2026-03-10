import React, { useState, useEffect, useRef } from 'react';
import { X, User, Mail, Phone, Home, Building, Sailboat, Plus, Trash2, DollarSign, Calendar, CheckCircle, Clock, Upload, Camera, Globe, Link, Unlink, Shield, AlertCircle, Star, Users, Anchor, Hash, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { BoatType, MembershipLevel } from '../../types/member';
import { Avatar } from '../ui/Avatar';
import { AvatarCropModal } from '../ui/AvatarCropModal';
import imageCompression from 'browser-image-compression';
import { SAILING_NATIONS, getCountryFlag } from '../../utils/countryFlags';
import { AdminAddToClubModal } from './AdminAddToClubModal';

interface MemberEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  clubId: string;
  darkMode?: boolean;
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
  membership_level: string;
  is_financial: boolean;
  date_joined: string;
  renewal_date: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  user_id: string;
  avatar_url?: string;
  country?: string;
  country_code?: string;
  category?: string;
  boats?: Array<{
    id: string;
    boat_type: string;
    sail_number: string;
    hull: string;
    handicap?: number;
  }>;
}

export const MemberEditModal: React.FC<MemberEditModalProps> = ({
  isOpen,
  onClose,
  memberId,
  clubId,
  darkMode = true,
  onSuccess
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [boats, setBoats] = useState<Array<{ id?: string; boat_type: string; sail_number: string; hull: string; handicap?: number }>>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'boats' | 'membership'>('details');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [membershipTypes, setMembershipTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [linkedUserEmail, setLinkedUserEmail] = useState<string | null>(null);
  const [memberClubs, setMemberClubs] = useState<Array<{ club_id: string; club_name: string }>>([]);
  const [defaultClubId, setDefaultClubId] = useState<string | null>(null);
  const [settingDefaultClub, setSettingDefaultClub] = useState(false);
  const [showAddToClubModal, setShowAddToClubModal] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Array<{ id: string; name: string; abbreviation?: string }>>([]);

  useEffect(() => {
    if (isOpen && memberId) {
      fetchMemberData();
      fetchMembershipTypes();
    }
  }, [isOpen, memberId, clubId]);

  const fetchMemberData = async () => {
    try {
      setLoading(true);

      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .single();

      if (memberError) throw memberError;

      const { data: memberBoats, error: boatsError } = await supabase
        .from('member_boats')
        .select('*')
        .eq('member_id', memberId);

      if (boatsError) throw boatsError;

      if (member.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url, default_club_id')
          .eq('id', member.user_id)
          .single();

        member.avatar_url = profile?.avatar_url;
        setDefaultClubId(profile?.default_club_id || null);

        const { data: linkedUser } = await supabase.rpc('get_user_email_by_id', { p_user_id: member.user_id });
        setLinkedUserEmail(linkedUser || member.email || null);

        const { data: clubs } = await supabase
          .from('user_clubs')
          .select('club_id, clubs:club_id(name)')
          .eq('user_id', member.user_id);

        if (clubs) {
          setMemberClubs(clubs.map((c: any) => ({
            club_id: c.club_id,
            club_name: c.clubs?.name || 'Unknown'
          })));
        }
      } else {
        setLinkedUserEmail(null);
        setMemberClubs([]);
        setDefaultClubId(null);
      }

      setMemberData(member);
      setBoats(memberBoats || [{ boat_type: '', sail_number: '', hull: '' }]);
    } catch (error: any) {
      console.error('Error fetching member:', error);
      addNotification('error', 'Failed to load member data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembershipTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('membership_types')
        .select('id, name')
        .eq('club_id', clubId)
        .order('name', { ascending: true });

      if (error) throw error;

      setMembershipTypes(data || []);
    } catch (error: any) {
      console.error('Error fetching membership types:', error);
    }
  };

  const fetchAvailableClubs = async () => {
    try {
      const { data } = await supabase
        .from('clubs')
        .select('id, name, abbreviation')
        .order('name', { ascending: true });
      setAvailableClubs(data || []);
    } catch (err) {
      console.error('Error fetching clubs:', err);
    }
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !memberData) return;

    if (!file.type.startsWith('image/')) {
      addNotification('error', 'Please select an image file');
      return;
    }

    setSelectedImageFile(file);
    setShowCropModal(true);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleCroppedImage = async (croppedBlob: Blob) => {
    if (!memberData) return;

    try {
      setUploadingAvatar(true);
      setShowCropModal(false);

      const fileName = `${memberId}-${Date.now()}.jpg`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(filePath, croppedBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('members')
        .update({ avatar_url: publicUrl })
        .eq('id', memberId);

      if (updateError) throw updateError;

      if (memberData.user_id) {
        await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', memberData.user_id);
      }

      setMemberData({ ...memberData, avatar_url: publicUrl });
      addNotification('success', 'Avatar uploaded successfully');

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      addNotification('error', 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      setSelectedImageFile(null);
    }
  };

  const handleLinkAccount = async () => {
    if (!linkEmail.trim() || !memberData) return;

    setLinkingAccount(true);
    try {
      const { data, error } = await supabase.rpc('admin_link_member_to_account', {
        p_member_id: memberId,
        p_email: linkEmail.trim()
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to link account');

      addNotification('success', data.message);
      setLinkedUserEmail(linkEmail.trim());
      setMemberData({ ...memberData, user_id: data.user_id });
      setLinkEmail('');
      onSuccess?.();
    } catch (error: any) {
      addNotification('error', error.message || 'Failed to link account');
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleSetDefaultClub = async () => {
    if (!memberData?.user_id) return;

    setSettingDefaultClub(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_member_default_club', {
        p_member_id: memberId,
        p_club_id: clubId
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to set default club');

      addNotification('success', data.message);
      setDefaultClubId(clubId);
    } catch (error: any) {
      addNotification('error', error.message || 'Failed to set default club');
    } finally {
      setSettingDefaultClub(false);
    }
  };

  const handleUnlinkAccount = async () => {
    if (!memberData) return;

    setLinkingAccount(true);
    try {
      const { data, error } = await supabase.rpc('admin_unlink_member_from_account', {
        p_member_id: memberId
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to unlink account');

      addNotification('success', data.message);
      setLinkedUserEmail(null);
      setMemberData({ ...memberData, user_id: '' });
      onSuccess?.();
    } catch (error: any) {
      addNotification('error', error.message || 'Failed to unlink account');
    } finally {
      setLinkingAccount(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberData) return;

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase
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
          membership_level: memberData.membership_level,
          is_financial: memberData.is_financial,
          emergency_contact_name: memberData.emergency_contact_name,
          emergency_contact_phone: memberData.emergency_contact_phone,
          emergency_contact_relationship: memberData.emergency_contact_relationship,
          country: memberData.country,
          country_code: memberData.country_code,
          category: memberData.category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId);

      if (updateError) throw updateError;

      const existingBoatIds = boats.filter(b => b.id).map(b => b.id);
      const { data: currentBoats } = await supabase
        .from('member_boats')
        .select('id')
        .eq('member_id', memberId);

      const boatsToDelete = currentBoats?.filter(b => !existingBoatIds.includes(b.id)).map(b => b.id) || [];
      if (boatsToDelete.length > 0) {
        await supabase
          .from('member_boats')
          .delete()
          .in('id', boatsToDelete);
      }

      for (const boat of boats) {
        if (!boat.boat_type || !boat.sail_number) continue;

        if (boat.id) {
          await supabase
            .from('member_boats')
            .update({
              boat_type: boat.boat_type,
              sail_number: boat.sail_number,
              hull: boat.hull,
              updated_at: new Date().toISOString(),
            })
            .eq('id', boat.id);
        } else {
          await supabase
            .from('member_boats')
            .insert({
              member_id: memberId,
              boat_type: boat.boat_type,
              sail_number: boat.sail_number,
              hull: boat.hull,
            });
        }
      }

      addNotification('success', 'Member updated successfully');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Error updating member:', error);
      addNotification('error', error.message || 'Failed to update member');
    } finally {
      setSubmitting(false);
    }
  };

  const addBoat = () => {
    setBoats([...boats, { boat_type: '', sail_number: '', hull: '', handicap: 0 }]);
  };

  const removeBoat = (index: number) => {
    setBoats(boats.filter((_, i) => i !== index));
  };

  const updateBoat = (index: number, field: string, value: string | number) => {
    const newBoats = [...boats];
    newBoats[index] = { ...newBoats[index], [field]: value };
    setBoats(newBoats);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl border ${
        darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Blue Banner Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="flex items-center gap-4 relative z-10">
            {memberData && (
              <div className="relative group">
                <Avatar
                  name={`${memberData.first_name} ${memberData.last_name}`}
                  imageUrl={memberData.avatar_url}
                  size="xl"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {uploadingAvatar ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  ) : (
                    <Camera size={24} className="text-white" />
                  )}
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                Edit Member
              </h2>
              {memberData && (
                <p className="text-blue-100 text-sm mt-0.5">
                  {memberData.first_name} {memberData.last_name}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`border-b ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex gap-2 px-6 py-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'details'
                  ? darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User size={16} className="inline mr-2" />
              Details
            </button>
            <button
              onClick={() => setActiveTab('boats')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'boats'
                  ? darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sailboat size={16} className="inline mr-2" />
              Boats
            </button>
            <button
              onClick={() => setActiveTab('membership')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'membership'
                  ? darkMode ? 'bg-blue-500 text-white' : 'bg-blue-500 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <DollarSign size={16} className="inline mr-2" />
              Membership
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Loading...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {activeTab === 'details' && memberData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      First Name
                    </label>
                    <input
                      type="text"
                      value={memberData.first_name}
                      onChange={(e) => setMemberData({ ...memberData, first_name: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      required
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={memberData.last_name}
                      onChange={(e) => setMemberData({ ...memberData, last_name: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={memberData.email}
                      onChange={(e) => setMemberData({ ...memberData, email: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={memberData.phone}
                      onChange={(e) => setMemberData({ ...memberData, phone: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={memberData.street}
                    onChange={(e) => setMemberData({ ...memberData, street: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg ${
                      darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                    } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      City
                    </label>
                    <input
                      type="text"
                      value={memberData.city}
                      onChange={(e) => setMemberData({ ...memberData, city: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      State
                    </label>
                    <input
                      type="text"
                      value={memberData.state}
                      onChange={(e) => setMemberData({ ...memberData, state: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Postcode
                    </label>
                    <input
                      type="text"
                      value={memberData.postcode}
                      onChange={(e) => setMemberData({ ...memberData, postcode: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Country
                    </label>
                    <div className="relative">
                      <select
                        value={memberData.country_code || 'AU'}
                        onChange={(e) => {
                          const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                          setMemberData({
                            ...memberData,
                            country_code: e.target.value,
                            country: country?.name || e.target.value
                          });
                        }}
                        className={`w-full pl-12 pr-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none`}
                      >
                        {SAILING_NATIONS.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-2xl pointer-events-none">
                        {getCountryFlag(memberData.country_code || 'AU')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Category
                    </label>
                    <select
                      value={memberData.category || ''}
                      onChange={(e) => setMemberData({ ...memberData, category: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg ${
                        darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
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

                <div className={`border-t pt-4 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Emergency Contact
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={memberData.emergency_contact_name}
                        onChange={(e) => setMemberData({ ...memberData, emergency_contact_name: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={memberData.emergency_contact_phone}
                        onChange={(e) => setMemberData({ ...memberData, emergency_contact_phone: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={memberData.emergency_contact_relationship}
                        onChange={(e) => setMemberData({ ...memberData, emergency_contact_relationship: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'boats' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Fleet
                    </h3>
                    <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {boats.length} {boats.length === 1 ? 'boat' : 'boats'} registered
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addBoat}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-500/10 text-blue-400 rounded-xl hover:bg-blue-500/20 transition-all text-sm font-medium border border-blue-500/20"
                  >
                    <Plus size={15} />
                    Add Boat
                  </button>
                </div>

                {boats.length === 0 && (
                  <div className={`flex flex-col items-center justify-center py-12 rounded-2xl border-2 border-dashed ${
                    darkMode ? 'border-slate-700 bg-slate-800/30' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${
                      darkMode ? 'bg-slate-700/50' : 'bg-slate-200'
                    }`}>
                      <Sailboat size={24} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    </div>
                    <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No boats registered</p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>Add a boat to get started</p>
                  </div>
                )}

                {boats.map((boat, index) => {
                  const classColor = boat.boat_type === '10R' ? 'blue' :
                    boat.boat_type === 'IOM' ? 'emerald' :
                    boat.boat_type === 'DF65' ? 'amber' :
                    boat.boat_type === 'DF95' ? 'orange' :
                    boat.boat_type === 'Marblehead' ? 'cyan' :
                    boat.boat_type === 'A Class' ? 'rose' :
                    boat.boat_type === 'RC Laser' ? 'violet' : 'slate';
                  const colorMap: Record<string, { bg: string; text: string; border: string; badge: string; badgeText: string }> = {
                    blue: { bg: 'bg-blue-500/8', text: 'text-blue-400', border: 'border-blue-500/15', badge: 'bg-blue-500/15', badgeText: 'text-blue-300' },
                    emerald: { bg: 'bg-emerald-500/8', text: 'text-emerald-400', border: 'border-emerald-500/15', badge: 'bg-emerald-500/15', badgeText: 'text-emerald-300' },
                    amber: { bg: 'bg-amber-500/8', text: 'text-amber-400', border: 'border-amber-500/15', badge: 'bg-amber-500/15', badgeText: 'text-amber-300' },
                    orange: { bg: 'bg-orange-500/8', text: 'text-orange-400', border: 'border-orange-500/15', badge: 'bg-orange-500/15', badgeText: 'text-orange-300' },
                    cyan: { bg: 'bg-cyan-500/8', text: 'text-cyan-400', border: 'border-cyan-500/15', badge: 'bg-cyan-500/15', badgeText: 'text-cyan-300' },
                    rose: { bg: 'bg-rose-500/8', text: 'text-rose-400', border: 'border-rose-500/15', badge: 'bg-rose-500/15', badgeText: 'text-rose-300' },
                    violet: { bg: 'bg-violet-500/8', text: 'text-violet-400', border: 'border-violet-500/15', badge: 'bg-violet-500/15', badgeText: 'text-violet-300' },
                    slate: { bg: 'bg-slate-500/8', text: 'text-slate-400', border: 'border-slate-500/15', badge: 'bg-slate-500/15', badgeText: 'text-slate-300' },
                  };
                  const colors = darkMode ? (colorMap[classColor] || colorMap.slate) : {
                    bg: 'bg-white', text: 'text-slate-700', border: 'border-slate-200', badge: 'bg-slate-100', badgeText: 'text-slate-600'
                  };

                  return (
                    <div
                      key={index}
                      className={`relative rounded-2xl border overflow-hidden transition-all ${
                        darkMode
                          ? `${colors.bg} ${colors.border} hover:border-opacity-30`
                          : 'bg-white border-slate-200 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              darkMode ? colors.badge : 'bg-slate-100'
                            }`}>
                              <Sailboat size={18} className={darkMode ? colors.text : 'text-slate-500'} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  {boat.hull || boat.boat_type || `Boat ${index + 1}`}
                                </span>
                                {boat.boat_type && (
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    darkMode ? `${colors.badge} ${colors.badgeText}` : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {boat.boat_type}
                                  </span>
                                )}
                              </div>
                              {boat.sail_number && (
                                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  Sail {boat.sail_number}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className={`text-center px-3 py-1.5 rounded-xl ${
                              darkMode ? 'bg-slate-800/80' : 'bg-slate-50'
                            }`}>
                              <p className={`text-[10px] uppercase tracking-wider font-medium ${
                                darkMode ? 'text-slate-500' : 'text-slate-400'
                              }`}>Handicap</p>
                              <p className={`text-lg font-bold leading-tight ${
                                (boat.handicap || 0) > 0
                                  ? darkMode ? 'text-emerald-400' : 'text-emerald-600'
                                  : darkMode ? 'text-slate-400' : 'text-slate-600'
                              }`}>{boat.handicap || 0}</p>
                            </div>
                            {boats.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBoat(index)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  darkMode ? 'text-slate-600 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                                }`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className={`grid grid-cols-2 gap-2.5 pt-3 border-t ${
                          darkMode ? 'border-slate-700/30' : 'border-slate-100'
                        }`}>
                          <div>
                            <label className={`block text-[10px] uppercase tracking-wider font-medium mb-1 ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              Class
                            </label>
                            <select
                              value={boat.boat_type}
                              onChange={(e) => updateBoat(index, 'boat_type', e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl text-sm ${
                                darkMode
                                  ? 'bg-slate-800/60 text-white border-slate-700/50'
                                  : 'bg-slate-50 text-slate-900 border-slate-200'
                              } border focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all`}
                            >
                              <option value="">Select class</option>
                              <option value="10R">10R</option>
                              <option value="IOM">IOM</option>
                              <option value="DF65">DF65</option>
                              <option value="DF95">DF95</option>
                              <option value="Marblehead">Marblehead</option>
                              <option value="A Class">A Class</option>
                              <option value="RC Laser">RC Laser</option>
                            </select>
                          </div>
                          <div>
                            <label className={`block text-[10px] uppercase tracking-wider font-medium mb-1 ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              Sail Number
                            </label>
                            <input
                              type="text"
                              value={boat.sail_number}
                              onChange={(e) => updateBoat(index, 'sail_number', e.target.value)}
                              placeholder="e.g., 58"
                              className={`w-full px-3 py-2 rounded-xl text-sm ${
                                darkMode
                                  ? 'bg-slate-800/60 text-white border-slate-700/50 placeholder-slate-600'
                                  : 'bg-slate-50 text-slate-900 border-slate-200 placeholder-slate-400'
                              } border focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[10px] uppercase tracking-wider font-medium mb-1 ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              Hull / Design
                            </label>
                            <input
                              type="text"
                              value={boat.hull}
                              onChange={(e) => updateBoat(index, 'hull', e.target.value)}
                              placeholder="e.g., Trance"
                              className={`w-full px-3 py-2 rounded-xl text-sm ${
                                darkMode
                                  ? 'bg-slate-800/60 text-white border-slate-700/50 placeholder-slate-600'
                                  : 'bg-slate-50 text-slate-900 border-slate-200 placeholder-slate-400'
                              } border focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[10px] uppercase tracking-wider font-medium mb-1 ${
                              darkMode ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                              Handicap
                              <span className={`ml-1 normal-case tracking-normal ${
                                darkMode ? 'text-slate-600' : 'text-slate-300'
                              }`}>(auto-updated)</span>
                            </label>
                            <input
                              type="number"
                              value={boat.handicap || 0}
                              onChange={(e) => updateBoat(index, 'handicap', parseInt(e.target.value) || 0)}
                              placeholder="0"
                              min="0"
                              step="1"
                              className={`w-full px-3 py-2 rounded-xl text-sm ${
                                darkMode
                                  ? 'bg-slate-800/60 text-white border-slate-700/50 placeholder-slate-600'
                                  : 'bg-slate-50 text-slate-900 border-slate-200 placeholder-slate-400'
                              } border focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'membership' && memberData && (
              <div className="space-y-6">
                <div className={`p-6 rounded-lg ${darkMode ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-slate-50'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Membership Type
                      </label>
                      <select
                        value={memberData.membership_level || ''}
                        onChange={(e) => setMemberData({ ...memberData, membership_level: e.target.value })}
                        className={`w-full px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        <option value="">Not set</option>
                        {membershipTypes.map(type => (
                          <option key={type.id} value={type.name}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Financial Status
                      </label>
                      <select
                        value={memberData.is_financial ? 'financial' : 'unfinancial'}
                        onChange={(e) => setMemberData({ ...memberData, is_financial: e.target.value === 'financial' })}
                        className={`w-full px-4 py-2 rounded-lg ${
                          darkMode ? 'bg-slate-700 text-slate-200 border-slate-600' : 'bg-white text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        <option value="financial">Financial</option>
                        <option value="unfinancial">Unfinancial</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Date Joined
                      </label>
                      <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {new Date(memberData.date_joined).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Renewal Date
                      </label>
                      <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {memberData.renewal_date ? new Date(memberData.renewal_date).toLocaleDateString() : 'Not set'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <div className="flex items-center gap-2">
                    {memberData.is_financial ? (
                      <span className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                        <CheckCircle size={16} />
                        Financial
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full text-sm font-medium">
                        <Clock size={16} />
                        Unfinancial
                      </span>
                    )}
                  </div>
                </div>

                <div className={`border-t pt-6 mt-6 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Users size={20} className="text-blue-400" />
                    Club Memberships
                  </h3>
                  {memberClubs.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {memberClubs.map(mc => (
                        <div
                          key={mc.club_id}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${
                            mc.club_id === clubId
                              ? darkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                              : darkMode ? 'bg-slate-800/50 border border-slate-700/30' : 'bg-slate-50 border border-slate-200'
                          }`}
                        >
                          <Building size={14} className={mc.club_id === clubId ? 'text-blue-400' : darkMode ? 'text-slate-500' : 'text-slate-400'} />
                          <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {mc.club_name}
                          </span>
                          {mc.club_id === clubId && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">Current</span>
                          )}
                          {mc.club_id === defaultClubId && (
                            <Star size={12} className="text-amber-400 fill-amber-400" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      fetchAvailableClubs();
                      setShowAddToClubModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus size={16} />
                    Add to Another Club
                  </button>
                </div>

                {memberData.user_id && memberClubs.length > 1 && (
                  <div className={`border-t pt-6 mt-6 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                    <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      <Star size={20} className="text-amber-400" />
                      Default Club
                    </h3>
                    <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      This member belongs to {memberClubs.length} clubs. The default club loads automatically when they sign in.
                    </p>
                    {defaultClubId === clubId ? (
                      <div className={`p-4 rounded-lg ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                        <div className="flex items-center gap-3">
                          <Star size={18} className="text-amber-400 fill-amber-400" />
                          <span className={`font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                            This is the member's default club
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSetDefaultClub}
                        disabled={settingDefaultClub}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          darkMode
                            ? 'bg-slate-700 text-slate-200 hover:bg-slate-600 border border-slate-600'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                        } disabled:opacity-50`}
                      >
                        {settingDefaultClub ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                        ) : (
                          <Star size={16} />
                        )}
                        Set This Club as Default
                      </button>
                    )}
                  </div>
                )}

                <div className={`border-t pt-6 mt-6 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Shield size={20} className="text-blue-400" />
                    Account Linking
                  </h3>

                  {memberData.user_id ? (
                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Link size={18} className="text-green-400" />
                          </div>
                          <div>
                            <p className={`font-medium ${darkMode ? 'text-green-300' : 'text-green-800'}`}>
                              Linked to Account
                            </p>
                            <p className={`text-sm ${darkMode ? 'text-green-400/70' : 'text-green-600'}`}>
                              {linkedUserEmail || 'Loading...'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleUnlinkAccount}
                          disabled={linkingAccount}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                        >
                          {linkingAccount ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                          ) : (
                            <Unlink size={14} />
                          )}
                          Unlink
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`p-4 rounded-lg ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                        <div className="flex items-start gap-3">
                          <AlertCircle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className={`text-sm ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                              This member is not linked to a login account. They cannot access the app until linked.
                            </p>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400/60' : 'text-amber-600'}`}>
                              Enter the email address the member registered with (or will register with). If they haven't registered yet, they can sign up and auto-linking will match by email.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={linkEmail}
                          onChange={(e) => setLinkEmail(e.target.value)}
                          placeholder="Enter member's account email..."
                          className={`flex-1 px-4 py-2.5 rounded-lg ${
                            darkMode ? 'bg-slate-700 text-slate-200 border-slate-600 placeholder-slate-500' : 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                          } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        />
                        <button
                          type="button"
                          onClick={handleLinkAccount}
                          disabled={linkingAccount || !linkEmail.trim()}
                          className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {linkingAccount ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          ) : (
                            <Link size={16} />
                          )}
                          Link Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-6 border-t border-slate-700">
              <button
                type="button"
                onClick={onClose}
                className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {selectedImageFile && (
        <AvatarCropModal
          isOpen={showCropModal}
          imageFile={selectedImageFile}
          onClose={() => {
            setShowCropModal(false);
            setSelectedImageFile(null);
          }}
          onCrop={handleCroppedImage}
          darkMode={darkMode}
        />
      )}

      <AdminAddToClubModal
        isOpen={showAddToClubModal}
        onClose={() => setShowAddToClubModal(false)}
        memberIds={[memberId]}
        availableClubs={availableClubs}
        darkMode={darkMode}
        onSuccess={() => {
          fetchMemberData();
          onSuccess?.();
        }}
      />
    </div>
  );
};
