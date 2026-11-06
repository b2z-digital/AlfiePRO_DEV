import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Mail, Phone, House, Building, Sailboat, Plus, Trash2, DollarSign, CircleCheck as CheckCircle, Clock, Camera, Globe, Link, Unlink, Shield, CircleAlert as AlertCircle, Star, Trophy, ChevronDown, Award, Archive } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { BoatType, MembershipLevel } from '../../types/member';
import { AAvatar, AStatus } from '../alfie/Kit';
import { AvatarCropModal } from '../ui/AvatarCropModal';
import imageCompression from 'browser-image-compression';
import { SAILING_NATIONS, getCountryFlag } from '../../utils/countryFlags';
import { AdminAddToClubModal } from './AdminAddToClubModal';
import { ArchiveMemberModal } from '../ArchiveMemberModal';
import { archiveMember } from '../../utils/storage';
import { createMembershipTransaction } from '../../utils/membershipFinanceUtils';
import { getBoatClasses } from '../../utils/boatClassStorage';
import { BoatClass } from '../../types/boatClass';

function getBoatClassShortCode(name: string): string {
  const match = name.match(/\(([^)]+)\)$/);
  if (match) return match[1];
  if (name === 'Ten Rater') return '10R';
  return name;
}

interface MemberEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  clubId: string;
  darkMode?: boolean;
  onSuccess?: () => void;
  onRenew?: (memberId: string) => void;
  initialTab?: 'details' | 'boats' | 'membership';
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
  onSuccess,
  onRenew,
  initialTab
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memberData, setMemberData] = useState<MemberData | null>(null);
  const [boats, setBoats] = useState<Array<{ id?: string; boat_type: string; sail_number: string; hull: string; handicap?: number }>>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'boats' | 'membership'>(initialTab || 'details');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [membershipTypes, setMembershipTypes] = useState<Array<{ id: string; name: string; amount: number }>>([]);
  const [originalMembershipLevel, setOriginalMembershipLevel] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [linkedUserEmail, setLinkedUserEmail] = useState<string | null>(null);
  const [memberClubs, setMemberClubs] = useState<Array<{ club_id: string; club_name: string }>>([]);
  const [defaultClubId, setDefaultClubId] = useState<string | null>(null);
  const [settingDefaultClub, setSettingDefaultClub] = useState(false);
  const [showAddToClubModal, setShowAddToClubModal] = useState(false);
  const [availableClubs, setAvailableClubs] = useState<Array<{ id: string; name: string; abbreviation?: string }>>([]);
  const [boatClassOptions, setBoatClassOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [allBoatClasses, setAllBoatClasses] = useState<BoatClass[]>([]);
  const [openClassDropdown, setOpenClassDropdown] = useState<number | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const classButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [originalEmail, setOriginalEmail] = useState<string | null>(null);
  const [showUpdateLoginEmailPrompt, setShowUpdateLoginEmailPrompt] = useState(false);
  const [updatingLoginEmail, setUpdatingLoginEmail] = useState(false);
  const [pendingSavedEmail, setPendingSavedEmail] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  useEffect(() => {
    if (isOpen && memberId) {
      fetchMemberData();
      fetchMembershipTypes();
      fetchBoatClasses();
    }
  }, [isOpen, memberId, clubId]);

  const openClassDropdownAt = useCallback((index: number) => {
    if (openClassDropdown === index) {
      setOpenClassDropdown(null);
      setDropdownPos(null);
      return;
    }
    const btn = classButtonRefs.current[index];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setDropdownPos({ top: rect.top, left: rect.left });
    }
    setOpenClassDropdown(index);
  }, [openClassDropdown]);

  useEffect(() => {
    if (openClassDropdown === null) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-class-dropdown]')) {
        setOpenClassDropdown(null);
        setDropdownPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openClassDropdown]);

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
      setOriginalMembershipLevel(member.membership_level || null);
      setOriginalEmail(member.email || null);
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
        .select('id, name, amount')
        .eq('club_id', clubId)
        .order('name', { ascending: true });

      if (error) throw error;

      setMembershipTypes((data || []).map(t => ({ ...t, amount: t.amount || 0 })));
    } catch (error: any) {
      console.error('Error fetching membership types:', error);
    }
  };

  const fetchBoatClasses = async () => {
    try {
      const allClasses = await getBoatClasses();
      setAllBoatClasses(allClasses);
      const options = allClasses.map((bc: BoatClass) => ({
        value: getBoatClassShortCode(bc.name),
        label: bc.name
      }));
      setBoatClassOptions(options);
    } catch (error) {
      console.error('Error fetching boat classes:', error);
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

  const handleSendReminder = async () => {
    try {
      setSendingReminder(true);
      const { data, error } = await supabase.functions.invoke('send-renewal-reminder', {
        body: {
          member_id: memberId,
          club_id: clubId,
          force: true
        }
      });
      if (error) throw error;
      if (data?.email_sent === false && data?.notification_sent === false) {
        addNotification('Reminder created but email could not be sent (no email on file)', 'warning');
      } else {
        addNotification('Renewal reminder sent successfully', 'success');
      }
    } catch (err) {
      console.error('Error sending reminder:', err);
      addNotification('Failed to send renewal reminder', 'error');
    } finally {
      setSendingReminder(false);
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

      const membershipChanged = memberData.membership_level &&
        memberData.membership_level !== originalMembershipLevel;

      if (membershipChanged) {
        const selectedType = membershipTypes.find(t => t.name === memberData.membership_level);
        if (selectedType && selectedType.amount > 0) {
          const { data: existingTx } = await supabase
            .from('membership_transactions')
            .select('id')
            .eq('member_id', memberId)
            .eq('club_id', clubId)
            .eq('membership_type_id', selectedType.id)
            .in('payment_status', ['pending', 'paid'])
            .limit(1);

          if (!existingTx || existingTx.length === 0) {
            const memberName = `${memberData.first_name} ${memberData.last_name}`;
            await createMembershipTransaction({
              clubId,
              memberId,
              membershipTypeId: selectedType.id,
              memberName,
              membershipTypeName: selectedType.name,
              amount: selectedType.amount,
              paymentMethod: 'bank_transfer',
            }, 'pending');
          }
        }
      }

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
              handicap: boat.handicap || 0,
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
              handicap: boat.handicap || 0,
            });
        }
      }

      addNotification('success', 'Member updated successfully');

      const emailChanged = memberData.user_id &&
        memberData.email &&
        originalEmail &&
        memberData.email.toLowerCase() !== originalEmail.toLowerCase() &&
        linkedUserEmail &&
        memberData.email.toLowerCase() !== linkedUserEmail.toLowerCase();

      if (emailChanged) {
        setPendingSavedEmail(memberData.email);
        setShowUpdateLoginEmailPrompt(true);
      } else {
        onClose();
        if (onSuccess) {
          onSuccess();
        }
      }
    } catch (error: any) {
      console.error('Error updating member:', error);
      addNotification('error', error.message || 'Failed to update member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLoginEmail = async () => {
    if (!memberData?.user_id || !pendingSavedEmail) return;
    setUpdatingLoginEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-member-auth-email`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_id: memberId,
          new_email: pendingSavedEmail,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update login email');

      addNotification('success', `Login email updated to ${pendingSavedEmail}`);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to update login email');
    } finally {
      setUpdatingLoginEmail(false);
      setShowUpdateLoginEmailPrompt(false);
      setPendingSavedEmail(null);
      onClose();
      if (onSuccess) onSuccess();
    }
  };

  const handleSkipLoginEmailUpdate = () => {
    setShowUpdateLoginEmailPrompt(false);
    setPendingSavedEmail(null);
    onClose();
    if (onSuccess) onSuccess();
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

    if (field === 'handicap' && newBoats[index].boat_type) {
      const boatType = newBoats[index].boat_type;
      newBoats.forEach((b, i) => {
        if (i !== index && b.boat_type === boatType) {
          newBoats[i] = { ...newBoats[i], handicap: value as number };
        }
      });
    }

    if (field === 'boat_type' && value) {
      const existingBoatOfClass = newBoats.find((b, i) => i !== index && b.boat_type === value && b.handicap !== undefined);
      if (existingBoatOfClass) {
        newBoats[index] = { ...newBoats[index], handicap: existingBoatOfClass.handicap };
      }
    }

    setBoats(newBoats);
  };

  if (!isOpen) return null;

  const Sec: React.FC<{ icon: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
    <div className="a-sec">
      <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}>{icon}</span>
      <h3>{title}</h3>
      <div className="flex-1" />
      {right}
    </div>
  );
  const Cell: React.FC<{ label: React.ReactNode; icon?: React.ReactNode; trail?: React.ReactNode; children: React.ReactNode }> = ({ label, icon, trail, children }) => (
    <label className="a-cell">
      {icon && <span className="a-dim flex">{icon}</span>}
      <span className="flex-1 min-w-0"><span className="a-cell-l">{label}</span>{children}</span>
      {trail && <span className="a-dim flex">{trail}</span>}
    </label>
  );
  const Req = () => <span className="a-txt-r">*</span>;
  const typeName = memberData?.membership_level || '';
  const renewalDue = !!memberData?.is_financial && !!memberData?.renewal_date && new Date(memberData.renewal_date) < new Date();
  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set');
  const firstBoatIdx = (cls: string) => boats.findIndex(b => b.boat_type === cls);
  const ClassFlag = () => (
    <svg width="9" height="11" viewBox="0 0 10 12" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M1 .75v10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M1.75 1.25h6.5L1.75 5.5z" fill="currentColor" />
    </svg>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <section className="a-msheet" role="dialog" aria-modal="true" aria-label={memberData ? `Edit member — ${memberData.first_name} ${memberData.last_name}` : 'Edit member'}>
        <div className="flex items-center gap-4 flex-shrink-0" style={{ padding: '22px 20px 18px 24px' }}>
          <div className="relative flex-shrink-0">
            <button type="button" className="a-msheet-av" onClick={() => !uploadingAvatar && avatarInputRef.current?.click()} aria-label="Change photo">
              <AAvatar url={memberData?.avatar_url} first={memberData?.first_name} last={memberData?.last_name} size={64} />
              {uploadingAvatar && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><span className="animate-spin rounded-full h-6 w-6 border-2 border-white/30 border-t-white" /></span>}
              <span className="a-msheet-cam" aria-hidden="true"><Camera size={14} /></span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="a-cap">Edit member</p>
            <h2 className="a-display a-ink truncate" style={{ margin: '3px 0 6px', fontSize: 25, fontWeight: 600 }}>
              {memberData ? `${memberData.first_name} ${memberData.last_name}` : 'Loading…'}
            </h2>
            {memberData && (
              <div className="flex flex-wrap gap-x-3.5 gap-y-1">
                <AStatus tone={memberData.is_financial ? 'g' : 'a'} className="text-[12.5px]">{memberData.is_financial ? 'Financial' : 'Unfinancial'}</AStatus>
                {typeName && <span className="a-st a-mute text-[12.5px]"><span className="a-light a-light-b" style={{ boxShadow: 'none' }} />{typeName}</span>}
                <AStatus tone={memberData.user_id ? 'b' : 'n'} className="text-[12.5px]"><span className="a-mute">{memberData.user_id ? 'On the app' : 'Not on the app'}</span></AStatus>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="a-ib self-start" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="px-5 pb-4 flex-shrink-0">
          <div className="a-seg flex w-full" role="tablist" aria-label="Member sections">
            {([
              { key: 'details', icon: User, label: 'Details' },
              { key: 'boats', icon: Sailboat, label: 'Boats' },
              { key: 'membership', icon: DollarSign, label: 'Membership' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`a-seg-i flex-1 justify-center ${activeTab === key ? 'a-seg-on' : ''}`}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-9 w-9 border-2 border-white/10 border-t-[#0A84FF] mx-auto mb-3"></div>
            <p className="a-mute text-sm">Loading member data...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto flex flex-col gap-[22px]" style={{ padding: '4px 20px 20px' }}>
            {activeTab === 'details' && memberData && (
              <>
                <div>
                  <Sec icon={<User size={15} />} title="Personal information" />
                  <div className="a-grp">
                    <div className="a-gr">
                      <Cell label={<>First name <Req /></>}><input type="text" value={memberData.first_name} onChange={(e) => setMemberData({ ...memberData, first_name: e.target.value })} placeholder="First name" required /></Cell>
                      <Cell label={<>Last name <Req /></>}><input type="text" value={memberData.last_name} onChange={(e) => setMemberData({ ...memberData, last_name: e.target.value })} placeholder="Last name" required /></Cell>
                    </div>
                    <div className="a-gr">
                      <Cell label="Email" icon={<Mail size={16} />}><input type="email" value={memberData.email} onChange={(e) => setMemberData({ ...memberData, email: e.target.value })} placeholder="you@example.com" /></Cell>
                      <Cell label="Phone" icon={<Phone size={16} />}><input type="tel" value={memberData.phone} onChange={(e) => setMemberData({ ...memberData, phone: e.target.value })} placeholder="Phone number" /></Cell>
                    </div>
                    <div className="a-gr">
                      <Cell label={<>Country <Req /></>} icon={<Globe size={16} />} trail={<ChevronDown size={15} />}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true">{getCountryFlag(memberData.country_code || 'AU')}</span>
                          <select
                            value={memberData.country_code || 'AU'}
                            onChange={(e) => {
                              const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                              setMemberData({ ...memberData, country_code: e.target.value, country: country?.name || e.target.value });
                            }}
                          >
                            {SAILING_NATIONS.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
                          </select>
                        </span>
                      </Cell>
                      <Cell label="Category" icon={<Award size={16} />} trail={<ChevronDown size={15} />}>
                        <select value={memberData.category || ''} onChange={(e) => setMemberData({ ...memberData, category: e.target.value })}>
                          <option value="">Select category</option>
                          <option value="Junior">Junior</option>
                          <option value="Open">Open</option>
                          <option value="Master">Master</option>
                          <option value="Grand Master">Grand Master</option>
                          <option value="Legend">Legend</option>
                        </select>
                      </Cell>
                    </div>
                  </div>
                </div>

                <div>
                  <Sec icon={<House size={15} />} title="Address" />
                  <div className="a-grp">
                    <div className="a-gr a-gr1">
                      <Cell label="Street address"><input type="text" value={memberData.street} onChange={(e) => setMemberData({ ...memberData, street: e.target.value })} placeholder="Street address" /></Cell>
                    </div>
                    <div className="a-gr a-gr3">
                      <Cell label="Suburb"><input type="text" value={memberData.city} onChange={(e) => setMemberData({ ...memberData, city: e.target.value })} placeholder="Suburb" /></Cell>
                      <Cell label="State"><input type="text" value={memberData.state} onChange={(e) => setMemberData({ ...memberData, state: e.target.value })} placeholder="State" /></Cell>
                      <Cell label="Postcode"><input type="text" value={memberData.postcode} onChange={(e) => setMemberData({ ...memberData, postcode: e.target.value })} placeholder="Postcode" /></Cell>
                    </div>
                  </div>
                </div>

                <div>
                  <Sec icon={<Phone size={15} />} title="Emergency contact" />
                  <div className="a-grp">
                    <div className="a-gr a-gr3">
                      <Cell label="Name"><input type="text" value={memberData.emergency_contact_name} onChange={(e) => setMemberData({ ...memberData, emergency_contact_name: e.target.value })} placeholder="Contact name" /></Cell>
                      <Cell label="Phone"><input type="tel" value={memberData.emergency_contact_phone} onChange={(e) => setMemberData({ ...memberData, emergency_contact_phone: e.target.value })} placeholder="Contact phone" /></Cell>
                      <Cell label="Relationship"><input type="text" value={memberData.emergency_contact_relationship} onChange={(e) => setMemberData({ ...memberData, emergency_contact_relationship: e.target.value })} placeholder="e.g. Spouse" /></Cell>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'boats' && (() => {
              const classHandicaps: Record<string, number> = {};
              boats.forEach(b => {
                if (b.boat_type && !Object.prototype.hasOwnProperty.call(classHandicaps, b.boat_type)) {
                  classHandicaps[b.boat_type] = b.handicap || 0;
                }
              });
              const uniqueClasses = [...new Set(boats.filter(b => b.boat_type).map(b => b.boat_type))];
              const setClassHandicap = (cls: string, val: number) => {
                const idx = firstBoatIdx(cls);
                if (idx >= 0) updateBoat(idx, 'handicap', Math.max(0, val));
              };

              return (
                <>
                  {uniqueClasses.length > 0 && (
                    <div>
                      <Sec icon={<Trophy size={15} />} title="Class handicaps" />
                      <div className="flex gap-2.5 flex-wrap">
                        {uniqueClasses.map(cls => (
                          <div key={cls} className="a-hcap">
                            <span className="a-lb-cls"><ClassFlag />{cls}</span>
                            <div className="a-stp">
                              <button type="button" aria-label={`Lower ${cls} handicap`} onClick={() => setClassHandicap(cls, (classHandicaps[cls] || 0) - 1)}>−</button>
                              <input
                                type="number"
                                aria-label={`${cls} handicap`}
                                value={classHandicaps[cls] || 0}
                                min={0}
                                onChange={(e) => setClassHandicap(cls, parseInt(e.target.value) || 0)}
                                className="a-num"
                              />
                              <button type="button" aria-label={`Raise ${cls} handicap`} onClick={() => setClassHandicap(cls, (classHandicaps[cls] || 0) + 1)}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="a-dim text-[12.5px]" style={{ margin: '10px 4px 0' }}>Shared across every boat in the same class. Updated automatically after races.</p>
                    </div>
                  )}

                  <div>
                    <Sec
                      icon={<Sailboat size={15} />}
                      title="Fleet"
                      right={<>
                        <span className="a-dim text-[13px] mr-2">{boats.length} {boats.length === 1 ? 'boat' : 'boats'}</span>
                        <button type="button" onClick={addBoat} className="a-btn" style={{ height: 34, padding: '0 12px', borderRadius: 10 }}><Plus size={15} />Add boat</button>
                      </>}
                    />
                    {boats.length === 0 ? (
                      <div className="a-grp a-empty py-10">
                        <span className="a-tile"><Sailboat size={19} /></span>
                        <div className="a-ink text-sm font-semibold">No boats registered</div>
                        <div className="a-dim text-[12.5px]">Add a boat to get started</div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {boats.map((boat, index) => {
                          const selectedClass = allBoatClasses.find(bc => getBoatClassShortCode(bc.name) === boat.boat_type);
                          return (
                            <div key={index} className="a-grp">
                              <div className="flex items-center gap-3 a-grp-head" style={{ padding: '14px 12px 14px 16px' }}>
                                <span className="a-tile">
                                  {selectedClass?.class_image ? <img src={selectedClass.class_image} alt="" className="w-full h-full object-cover rounded-[30%]" /> : <Sailboat size={19} />}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="a-ink text-base font-semibold truncate">{boat.hull || boat.boat_type || `Boat ${index + 1}`}</div>
                                  {boat.boat_type && (
                                    <div className="flex items-center gap-2.5 mt-[5px]">
                                      <span className="a-lb-cls"><ClassFlag />{boat.boat_type}{boat.sail_number && <span className="a-dim" style={{ fontWeight: 500, letterSpacing: 0 }}>{boat.sail_number}</span>}</span>
                                      <span className="a-mute text-[12.5px]">Handicap <b className="a-num a-ink font-semibold">{boat.handicap || 0}</b></span>
                                    </div>
                                  )}
                                </div>
                                {boats.length > 1 && (
                                  <button type="button" onClick={() => removeBoat(index)} className="a-ib a-ib-d" aria-label="Remove boat"><Trash2 size={16} /></button>
                                )}
                              </div>
                              <div className="a-gr a-gr3">
                                <div className="a-cell" data-class-dropdown>
                                  <button
                                    type="button"
                                    ref={(el) => { classButtonRefs.current[index] = el; }}
                                    onClick={() => openClassDropdownAt(index)}
                                    className="flex items-center gap-2 w-full text-left bg-transparent border-0 p-0"
                                    aria-haspopup="listbox"
                                    aria-expanded={openClassDropdown === index}
                                  >
                                    <span className="flex-1 min-w-0">
                                      <span className="a-cell-l">Class</span>
                                      <span className="a-cell-v flex items-center gap-[7px]">{boat.boat_type ? <><ClassFlag />{boat.boat_type}</> : <span className="a-dim">Select</span>}</span>
                                    </span>
                                    <ChevronDown size={15} className="a-dim" />
                                  </button>
                                  {openClassDropdown === index && dropdownPos && createPortal(
                                    <div
                                      data-class-dropdown
                                      role="listbox"
                                      className="a-pop fixed z-[99999] w-60 max-h-64 overflow-y-auto p-1.5 flex flex-col gap-0.5"
                                      style={{ top: dropdownPos.top - 4, left: dropdownPos.left, transform: 'translateY(-100%)' }}
                                    >
                                      <button type="button" role="option" aria-selected={!boat.boat_type} onClick={() => { updateBoat(index, 'boat_type', ''); setOpenClassDropdown(null); setDropdownPos(null); }} className="a-pop-item">
                                        <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}><Sailboat size={14} /></span><span className="a-mute">None</span>
                                      </button>
                                      {allBoatClasses.map(bc => {
                                        const shortCode = getBoatClassShortCode(bc.name);
                                        return (
                                          <button key={bc.id} type="button" role="option" aria-selected={boat.boat_type === shortCode} onClick={() => { updateBoat(index, 'boat_type', shortCode); setOpenClassDropdown(null); setDropdownPos(null); }} className={`a-pop-item ${boat.boat_type === shortCode ? 'a-pop-item-on' : ''}`}>
                                            {bc.class_image
                                              ? <img src={bc.class_image} alt="" className="w-[30px] h-[30px] rounded-[30%] object-cover flex-shrink-0" />
                                              : <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}><Sailboat size={14} /></span>}
                                            <span className="truncate">{bc.name}</span>
                                          </button>
                                        );
                                      })}
                                      {boat.boat_type && !allBoatClasses.some(bc => getBoatClassShortCode(bc.name) === boat.boat_type) && (
                                        <button type="button" onClick={() => { setOpenClassDropdown(null); setDropdownPos(null); }} className="a-pop-item a-pop-item-on">
                                          <span className="a-tile a-tile-sm" style={{ width: 30, height: 30 }}><Sailboat size={14} /></span><span>{boat.boat_type}</span>
                                        </button>
                                      )}
                                    </div>,
                                    document.body
                                  )}
                                </div>
                                <Cell label="Sail no."><input type="text" value={boat.sail_number} onChange={(e) => updateBoat(index, 'sail_number', e.target.value)} placeholder="58" /></Cell>
                                <Cell label="Hull / design"><input type="text" value={boat.hull} onChange={(e) => updateBoat(index, 'hull', e.target.value)} placeholder="Trance" /></Cell>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}

            {activeTab === 'membership' && memberData && (
              <>
                <div>
                  <Sec icon={<DollarSign size={15} />} title="Membership" />
                  <div className="a-grp">
                    <div className="a-gr">
                      <Cell label="Membership type" trail={<ChevronDown size={15} />}>
                        <span className="flex items-center gap-2">
                          <span className="a-light a-light-b" style={{ boxShadow: 'none' }} />
                          <select value={memberData.membership_level || ''} onChange={(e) => setMemberData({ ...memberData, membership_level: e.target.value })}>
                            <option value="">Not set</option>
                            {membershipTypes.map(type => <option key={type.id} value={type.name}>{type.name}</option>)}
                          </select>
                        </span>
                      </Cell>
                      <Cell label="Financial status" trail={<ChevronDown size={15} />}>
                        <span className="flex items-center gap-[9px]">
                          <span className={`a-light ${memberData.is_financial ? 'a-light-g' : 'a-light-a'}`} />
                          <select value={memberData.is_financial ? 'financial' : 'unfinancial'} onChange={(e) => setMemberData({ ...memberData, is_financial: e.target.value === 'financial' })}>
                            <option value="financial">Financial</option>
                            <option value="unfinancial">Unfinancial</option>
                          </select>
                        </span>
                      </Cell>
                    </div>
                    <div className="a-gr">
                      <div className="a-cell"><span><span className="a-cell-l">Date joined</span><span className="a-cell-v a-num" style={{ letterSpacing: 0 }}>{fmt(memberData.date_joined)}</span></span></div>
                      <div className="a-cell"><span><span className="a-cell-l">Renews</span><span className={`a-cell-v a-num ${renewalDue ? 'a-txt-a' : ''}`} style={{ letterSpacing: 0 }}>{fmt(memberData.renewal_date)}</span></span></div>
                    </div>
                  </div>
                  {renewalDue && (
                    <div className="a-note mt-2.5">
                      <span className="a-txt-a flex"><Clock size={17} /></span>
                      <span className="flex-1 a-mute text-[13px]">Renewal is due.</span>
                      {onRenew && <button type="button" onClick={() => { onClose(); onRenew(memberId); }} className="a-btn a-btn-a a-btn-sm"><DollarSign size={14} />Renew</button>}
                      <button type="button" onClick={handleSendReminder} disabled={sendingReminder} className="a-btn a-btn-sm"><Mail size={14} />{sendingReminder ? 'Sending…' : 'Send reminder'}</button>
                    </div>
                  )}
                </div>

                <div>
                  <Sec icon={<Building size={15} />} title="Club memberships" />
                  <div className="a-grp">
                    {memberClubs.map(mc => (
                      <div key={mc.club_id} className={`a-lnk ${mc.club_id === clubId ? 'a-lnk-on' : ''}`}>
                        <span className={`a-tile a-tile-sm ${mc.club_id === clubId ? 'a-tile-rim' : ''}`}><Building size={15} /></span>
                        <span className={`flex-1 text-[14.5px] a-ink ${mc.club_id === clubId ? 'font-semibold' : ''}`}>{mc.club_name}</span>
                        {mc.club_id === defaultClubId && <span className="a-txt-a flex" title="Default club"><Star size={14} fill="currentColor" /></span>}
                        {mc.club_id === clubId && <AStatus tone="b" className="text-[12.5px] a-txt-b">This club</AStatus>}
                      </div>
                    ))}
                    <button type="button" onClick={() => { fetchAvailableClubs(); setShowAddToClubModal(true); }} className="a-lnk a-lnk-add w-full">
                      <span className="w-[34px] flex justify-center"><Plus size={16} /></span>Add to another club
                    </button>
                  </div>
                  {memberData.user_id && memberClubs.length > 1 && (
                    <div className="a-note mt-2.5">
                      <span className="a-txt-a flex"><Star size={17} /></span>
                      <span className="flex-1 a-mute text-[13px]">Belongs to {memberClubs.length} clubs. The default club opens when they sign in.</span>
                      {defaultClubId === clubId ? (
                        <AStatus tone="a" className="text-[12.5px]">Default</AStatus>
                      ) : (
                        <button type="button" onClick={handleSetDefaultClub} disabled={settingDefaultClub} className="a-btn" style={{ height: 34, padding: '0 12px', borderRadius: 10, fontSize: 13 }}>
                          {settingDefaultClub && <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-current border-t-transparent" />}Set as default
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Sec icon={<Shield size={15} />} title="App account" />
                  {memberData.user_id ? (
                    <div className="a-grp a-lnk" style={{ padding: 14 }}>
                      <span className="a-tile"><Link size={18} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="a-ink text-[14.5px] font-semibold">Linked to account</div>
                        <div className="a-dim text-[12.5px] mt-0.5 truncate">{linkedUserEmail || 'Loading…'}</div>
                      </div>
                      <button type="button" onClick={handleUnlinkAccount} disabled={linkingAccount} className="a-btn a-btn-q a-btn-reject" style={{ height: 34, padding: '0 12px' }}>
                        {linkingAccount ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-current border-t-transparent" /> : <Unlink size={14} />}Unlink
                      </button>
                    </div>
                  ) : (
                    <div className="a-grp" style={{ padding: 14 }}>
                      <div className="flex items-start gap-3">
                        <span className="a-txt-a flex mt-0.5"><AlertCircle size={17} /></span>
                        <div className="flex-1">
                          <p className="a-ink text-[13.5px] m-0">Not linked to a login account, so they can't use the app yet.</p>
                          <p className="a-dim text-[12.5px] mt-1 mb-0">Enter the email they registered with (or will register with). New sign-ups are matched by email automatically.</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <label className="a-field flex-1" style={{ height: 40 }}>
                          <Mail size={16} />
                          <span className="sr-only">Member's account email</span>
                          <input type="email" value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)} placeholder="Member's account email" />
                        </label>
                        <button type="button" onClick={handleLinkAccount} disabled={linkingAccount || !linkEmail.trim()} className="a-btn a-btn-p">
                          {linkingAccount ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white" /> : <Link size={16} />}Link account
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="a-danger">
                  <span className="a-tile a-tile-danger"><Archive size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="a-ink text-[14.5px] font-semibold">Archive member</div>
                    <div className="a-mute text-[12.5px] mt-0.5">Removes them from the active roster. History is kept and they can be reinstated from Cancelled.</div>
                  </div>
                  <button type="button" onClick={() => setShowArchiveModal(true)} className="a-btn a-btn-d" style={{ height: 36 }}>Archive</button>
                </div>
              </>
            )}
            </div>

            <div className="a-panel-foot flex-shrink-0" style={{ padding: '16px 20px' }}>
              <button type="button" onClick={onClose} className="a-btn" style={{ height: 44 }}>Cancel</button>
              <button type="submit" disabled={submitting} className="a-btn a-btn-p" style={{ height: 44 }}>
                <CheckCircle size={16} />{submitting ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </section>

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

      <ArchiveMemberModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        member={memberData as any}
        darkMode={darkMode}
        onConfirm={async (removeAuthAccess, reason) => {
          if (!memberData) return;
          const result = await archiveMember(memberData.id, removeAuthAccess, reason);
          if (!result.success) {
            addNotification(result.error || 'Failed to archive member', 'error');
            return;
          }
          addNotification(`${memberData.first_name} ${memberData.last_name} archived successfully`, 'success');
          setShowArchiveModal(false);
          onSuccess?.();
          onClose();
        }}
      />

      {showUpdateLoginEmailPrompt && memberData && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="a-sheet max-w-md w-full">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                  <Mail size={20} className="text-teal-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Update Login Email?</h3>
                  <p className="text-sm text-slate-400">
                    {memberData.first_name} {memberData.last_name}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-300 mb-4">
                You've changed this member's email address. Would you like to also update their login email so they can sign in with their new address?
              </p>
              <div className="space-y-3 mb-4">
                <div className="p-3 bg-slate-700/50 rounded-lg">
                  <p className="text-xs text-slate-400 mb-1">Current login email</p>
                  <p className="text-sm text-white font-mono">{linkedUserEmail}</p>
                </div>
                <div className="flex justify-center">
                  <ChevronDown size={16} className="text-teal-400" />
                </div>
                <div className="p-3 bg-teal-900/20 border border-teal-800/30 rounded-lg">
                  <p className="text-xs text-teal-400 mb-1">New login email</p>
                  <p className="text-sm text-white font-mono">{pendingSavedEmail}</p>
                </div>
              </div>
              <div className="p-3 bg-amber-900/20 border border-amber-900/30 rounded-lg">
                <p className="text-xs text-amber-400">
                  After updating, this member will need to use their new email address to sign in.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={handleSkipLoginEmailUpdate}
                disabled={updatingLoginEmail}
                className="px-4 py-2 text-slate-400 hover:text-slate-300 transition-colors"
              >
                No, just save the record
              </button>
              <button
                onClick={handleUpdateLoginEmail}
                disabled={updatingLoginEmail}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white rounded-lg hover:from-teal-600 hover:to-emerald-700 font-medium transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updatingLoginEmail ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Updating...
                  </span>
                ) : (
                  'Yes, update login email'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
