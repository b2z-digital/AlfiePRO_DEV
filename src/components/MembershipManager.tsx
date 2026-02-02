import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Users, UserPlus, Upload, Download, Search, Edit2, Sailboat, Phone, Mail, Building, Grid, List, Filter, RefreshCw, Calendar, Check, AlertTriangle, ChevronDown, ChevronUp, FileDown } from 'lucide-react';
import { MemberImportExportModal } from './MemberImportExportModal';
import { Member, MemberFormData, ImportedMember, BoatType, MembershipLevel } from '../types/member';
import { getStoredMembers, addMember, updateMember, deleteMember, getEditSession, setEditSession, clearEditSession, isEditSessionValid, addMembers, parseDate, parseAmount } from '../utils/storage';
import { getStoredClubs } from '../utils/clubStorage';
import { Club } from '../types/club';
import Papa from 'papaparse';
import { ArchiveMemberModal } from './ArchiveMemberModal';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';
import { formatDate } from '../utils/date';

interface MembershipManagerProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
}

type ViewMode = 'grid' | 'list';
type TabView = 'members' | 'renewals';
type RenewalFilter = 'all' | 'financial' | 'expired' | 'expiring-soon';

export const MembershipManager: React.FC<MembershipManagerProps> = ({
  isOpen,
  onClose,
  darkMode
}) => {
  const { currentClub } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedClub, setSelectedClub] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<TabView>('members');
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('all');
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [formData, setFormData] = useState<MemberFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    club: '',
    street: '',
    city: '',
    state: '',
    postcode: '',
    date_joined: new Date().toISOString().split('T')[0],
    membership_level: null,
    membership_level_custom: null,
    is_financial: false,
    amount_paid: null,
    boats: [],
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchClubs();
      
      const session = getEditSession();
      if (session && isEditSessionValid()) {
        const member = members.find(m => m.id === session.memberId);
        if (member) {
          handleEdit(member);
        } else {
          clearEditSession();
        }
      } else if (session) {
        clearEditSession();
      }

      if (!editingMember && formData.boats.length === 0) {
        setFormData(prev => ({
          ...prev,
          boats: [{ boat_type: null, sail_number: '', hull: '', handicap: null }]
        }));
      }
    } else {
      setShowAddForm(false);
      setEditingMember(null);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        club: '',
        street: '',
        city: '',
        state: '',
        postcode: '',
        date_joined: new Date().toISOString().split('T')[0],
        membership_level: null,
        membership_level_custom: null,
        is_financial: false,
        amount_paid: null,
        boats: [],
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relationship: ''
      });
      setSearchTerm('');
      setSelectedLetter(null);
      setSelectedClub('');
    }
  }, [isOpen]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const storedMembers = await getStoredMembers();
      setMembers(storedMembers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchClubs = async () => {
    try {
      const storedClubs = await getStoredClubs();
      setClubs(storedClubs);
    } catch (err) {
      console.error('Error fetching clubs:', err);
    }
  };

  const getAlphabetLetters = () => {
    const letters = new Set<string>();
    members.forEach(member => {
      const firstLetter = member.last_name.charAt(0).toUpperCase();
      if (/[A-Z]/.test(firstLetter)) {
        letters.add(firstLetter);
      }
    });
    return Array.from(letters).sort();
  };

  const getMemberStatus = (member: Member) => {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    if (!member.is_financial) {
      return { status: 'expired', label: 'Expired', color: 'text-red-400 bg-red-900/30' };
    }
    
    if (!member.renewal_date) {
      return { status: 'unknown', label: 'Unknown', color: 'text-yellow-400 bg-yellow-900/30' };
    }
    
    const renewalDate = new Date(member.renewal_date);
    
    if (renewalDate < today) {
      return { status: 'expired', label: 'Expired', color: 'text-red-400 bg-red-900/30' };
    }
    
    if (renewalDate < thirtyDaysFromNow) {
      return { status: 'expiring-soon', label: 'Expiring Soon', color: 'text-yellow-400 bg-yellow-900/30' };
    }
    
    return { status: 'active', label: 'Active', color: 'text-green-400 bg-green-900/30' };
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = `${member.first_name} ${member.last_name} ${member.boats?.map(b => b.sail_number).join(' ')}`.toLowerCase()
      .includes(searchTerm.toLowerCase());
    
    const matchesLetter = !selectedLetter || member.last_name.charAt(0).toUpperCase() === selectedLetter;
    const matchesClub = !selectedClub || member.club === selectedClub;
    
    // Additional filter for renewals tab
    if (activeTab === 'renewals') {
      const memberStatus = getMemberStatus(member).status;
      
      if (renewalFilter === 'financial' && memberStatus !== 'active') {
        return false;
      }
      
      if (renewalFilter === 'expired' && memberStatus !== 'expired') {
        return false;
      }
      
      if (renewalFilter === 'expiring-soon' && memberStatus !== 'expiring-soon') {
        return false;
      }
    }
    
    return matchesSearch && matchesLetter && matchesClub;
  }).sort((a, b) => a.last_name.localeCompare(b.last_name));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    try {
      if (editingMember) {
        const updated = await updateMember(editingMember.id, formData);
        if (!updated) {
          throw new Error('Failed to update member');
        }
      } else {
        const added = await addMember(formData);
        if (!added) {
          throw new Error('Failed to add member');
        }
      }

      await fetchMembers();
      setShowAddForm(false);
      setEditingMember(null);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        club: '',
        street: '',
        city: '',
        state: '',
        postcode: '',
        date_joined: new Date().toISOString().split('T')[0],
        membership_level: null,
        membership_level_custom: null,
        is_financial: false,
        amount_paid: null,
        boats: [],
        emergency_contact_name: '',
        emergency_contact_phone: '',
        emergency_contact_relationship: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDeleteClick = (member: Member) => {
    setMemberToDelete(member);
    setShowDeleteConfirm(true);
  };

  const handleConfirmArchive = async (removeAuthAccess: boolean, reason?: string) => {
    if (memberToDelete) {
      try {
        const { archiveMember } = await import('../utils/storage');
        const result = await archiveMember(memberToDelete.id, removeAuthAccess, reason);
        if (!result.success) {
          throw new Error(result.error || 'Failed to archive member');
        }

        const preserved = result.details?.preserved || {};
        const summary = [];
        if (preserved.boats > 0) summary.push(`${preserved.boats} boat(s)`);
        if (preserved.race_results > 0) summary.push(`${preserved.race_results} race result(s)`);
        if (preserved.payments > 0) summary.push(`${preserved.payments} payment(s)`);
        if (preserved.attendance > 0) summary.push(`${preserved.attendance} record(s)`);

        console.log('Member archived successfully.', summary.length > 0 ? `Preserved: ${summary.join(', ')}.` : '');
        if (result.details?.auth_user_deleted) {
          console.log('Authentication access removed.');
        }

        setShowDeleteConfirm(false);
        setMemberToDelete(null);
        await fetchMembers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setShowDeleteConfirm(false);
        setMemberToDelete(null);
      }
    }
  };

  const handleEdit = (member: Member) => {
    setEditingMember(member);
    setEditSession(member.id);
    setFormData({
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email || '',
      phone: member.phone || '',
      club: member.club || '',
      street: member.street || '',
      city: member.city || '',
      state: member.state || '',
      postcode: member.postcode || '',
      date_joined: member.date_joined || new Date().toISOString().split('T')[0],
      membership_level: member.membership_level || null,
      membership_level_custom: member.membership_level_custom || null,
      is_financial: member.is_financial || false,
      amount_paid: member.amount_paid || null,
      boats: member.boats?.map(boat => ({
        boat_type: boat.boat_type as BoatType,
        sail_number: boat.sail_number || '',
        hull: boat.hull || '',
        handicap: boat.handicap || null
      })) || [],
      emergency_contact_name: member.emergency_contact_name || '',
      emergency_contact_phone: member.emergency_contact_phone || '',
      emergency_contact_relationship: member.emergency_contact_relationship || ''
    });
    setShowAddForm(true);
  };

  const handleAddBoat = () => {
    setFormData(prev => ({
      ...prev,
      boats: [...prev.boats, { boat_type: null, sail_number: '', hull: '', handicap: null }]
    }));
  };

  const handleRemoveBoat = (index: number) => {
    setFormData(prev => {
      const newBoats = [...prev.boats];
      newBoats.splice(index, 1);
      return { ...prev, boats: newBoats };
    });
  };

  const handleBoatChange = (index: number, field: keyof typeof formData.boats[0], value: string | number | null) => {
    setFormData(prev => {
      const newBoats = [...prev.boats];
      newBoats[index] = { ...newBoats[index], [field]: value };
      return { ...prev, boats: newBoats };
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<ImportedMember>(file, {
      header: true,
      complete: async (results) => {
        const formDataArray = results.data
          .filter(row => row['First Name'] && row['Last Name'])
          .map(row => ({
            first_name: row['First Name'],
            last_name: row['Last Name'],
            email: row['Email'] || '',
            phone: row['Phone']?.replace(/^0/, '') || '',
            club: row['Club'] || '',
            street: row['Street'] || '',
            city: row['City'] || '',
            state: row['State'] || '',
            postcode: row['Postcode'] || '',
            date_joined: row['Date Joined'] || new Date().toISOString().split('T')[0],
            membership_level: row['Membership Level'] as MembershipLevel || null,
            membership_level_custom: null,
            is_financial: row['Financial']?.toLowerCase() === 'yes',
            amount_paid: parseAmount(row['Amount Paid']),
            emergency_contact_name: row['Emergency Contact'] || '',
            emergency_contact_phone: row['Emergency Phone'] || '',
            emergency_contact_relationship: row['Emergency Relationship'] || '',
            boats: row['Boat Type'] ? [{
              boat_type: row['Boat Type'] as BoatType,
              sail_number: row['Sail Number'] || '',
              hull: row['Hull'] || '',
              handicap: row['Handicap'] ? parseInt(row['Handicap']) : null
            }] : []
          }));

        try {
          await addMembers(formDataArray);
          await fetchMembers();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      },
      error: (error) => {
        setError(error.message);
      }
    });
  };

  const handleExport = () => {
    const csv = Papa.unparse(members.map(member => ({
      'First Name': member.first_name,
      'Last Name': member.last_name,
      'Email': member.email || '',
      'Phone': member.phone || '',
      'Club': member.club || '',
      'Street': member.street || '',
      'City': member.city || '',
      'State': member.state || '',
      'Postcode': member.postcode || '',
      'Date Joined': member.date_joined || '',
      'Membership Level': member.membership_level === 'Custom' ? member.membership_level_custom : member.membership_level || '',
      'Financial': member.is_financial ? 'Yes' : 'No',
      'Amount Paid': member.amount_paid || '',
      'Renewal Date': member.renewal_date || '',
      'Emergency Contact': member.emergency_contact_name || '',
      'Emergency Phone': member.emergency_contact_phone || '',
      'Emergency Relationship': member.emergency_contact_relationship || '',
      'Boats': member.boats?.map(b => 
        `${b.boat_type} (${b.sail_number || 'No sail number'}${b.hull ? `, ${b.hull}` : ''})`
      ).join('; ') || ''
    })));

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `members_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleManualRenewal = async (memberId: string) => {
    try {
      // Get the member details
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('id', memberId)
        .single();
      
      if (memberError) throw memberError;
      
      // Get the membership type
      const { data: membershipTypes, error: typesError } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', currentClub?.clubId)
        .eq('is_active', true);
      
      if (typesError) throw typesError;
      
      if (!membershipTypes || membershipTypes.length === 0) {
        throw new Error('No active membership types found');
      }
      
      // Find the matching membership type or use the first one
      const membershipType = membershipTypes.find(t => t.name === member.membership_level) || membershipTypes[0];
      
      // Calculate renewal date (1 year from now)
      const today = new Date();
      const expiryDate = new Date(today);
      expiryDate.setFullYear(today.getFullYear() + 1);
      
      // Update the member as financial
      const { error: updateError } = await supabase
        .from('members')
        .update({
          is_financial: true,
          renewal_date: expiryDate.toISOString().split('T')[0]
        })
        .eq('id', memberId);
      
      if (updateError) throw updateError;
      
      // Create a renewal record
      const { error: renewalError } = await supabase
        .from('membership_renewals')
        .insert({
          member_id: memberId,
          membership_type_id: membershipType.id,
          renewal_date: today.toISOString().split('T')[0],
          expiry_date: expiryDate.toISOString().split('T')[0],
          amount_paid: membershipType.amount,
          payment_method: 'manual',
          payment_reference: 'Manual renewal by admin'
        });
      
      if (renewalError) throw renewalError;
      
      // Create a payment record
      const { error: paymentError } = await supabase
        .from('membership_payments')
        .insert({
          member_id: memberId,
          membership_type_id: membershipType.id,
          amount: membershipType.amount,
          currency: membershipType.currency,
          status: 'completed',
          payment_method: 'manual'
        });
      
      if (paymentError) throw paymentError;
      
      // Refresh the members list
      await fetchMembers();
      
      alert('Membership renewed successfully');
    } catch (err) {
      console.error('Error renewing membership:', err);
      alert('Failed to renew membership: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleSendRenewalReminder = async (memberId: string) => {
    // This would send a renewal reminder email
    // For now, we'll just show a placeholder
    alert('This would send a renewal reminder email to the member');
  };

  const handleBulkRenewalReminders = async () => {
    // This would send renewal reminders to all expiring members
    // For now, we'll just show a placeholder
    alert('This would send renewal reminders to all expiring members');
  };

  if (!isOpen) return null;

  return (
    <div className={`
      w-full max-w-6xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
      ${darkMode ? 'bg-slate-800' : 'bg-white'}
    `}>
      <div className={`
        flex items-center justify-between p-6 border-b
        ${darkMode ? 'border-slate-700' : 'border-slate-200'}
      `}>
        <div className="flex items-center gap-3">
          <Users className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
          <div>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Club Members
            </h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {members.length} {members.length === 1 ? 'member' : 'members'} registered
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <Plus size={18} />
            Add Member
          </button>

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
      </div>

      <div className="flex-1 overflow-y-auto">
        {showAddForm ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Contact Information Section */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Contact Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter first name"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter last name"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter email"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Club
                  </label>
                  <select
                    value={formData.club}
                    onChange={(e) => setFormData(prev => ({ ...prev, club: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors appearance-none
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                  >
                    <option value="">Select club</option>
                    {clubs.map(club => (
                      <option key={club.id} value={club.name}>
                        {club.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Address Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => setFormData(prev => ({ ...prev, street: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter street address"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter city"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter state"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Postcode
                  </label>
                  <input
                    type="text"
                    value={formData.postcode}
                    onChange={(e) => setFormData(prev => ({ ...prev, postcode: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter postcode"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact Section */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter emergency contact name"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact_phone: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Enter emergency contact phone"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Relationship
                  </label>
                  <input
                    type="text"
                    value={formData.emergency_contact_relationship}
                    onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact_relationship: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="e.g., Spouse, Parent, Friend"
                  />
                </div>
              </div>
            </div>

            {/* Membership Section */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                Membership Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Date Joined
                  </label>
                  <input
                    type="date"
                    value={formData.date_joined}
                    onChange={(e) => setFormData(prev => ({ ...prev, date_joined: e.target.value }))}
                    className={`
                      w-full px-3 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Membership Level
                  </label>
                  <div className="space-y-2">
                    <select
                      value={formData.membership_level || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        membership_level: e.target.value as MembershipLevel || null,
                        membership_level_custom: e.target.value === 'Custom' ? '' : null
                      }))}
                      className={`
                        w-full px-3 py-2 rounded-lg transition-colors appearance-none
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                    >
                      <option value="">Select level</option>
                      <option value="Full">Full</option>
                      <option value="Full Pro Rata">Full Pro Rata</option>
                      <option value="Associate">Associate</option>
                      <option value="Custom">Custom...</option>
                    </select>

                    {formData.membership_level === 'Custom' && (
                      <input
                        type="text"
                        value={formData.membership_level_custom || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          membership_level_custom: e.target.value 
                        }))}
                        placeholder="Enter custom membership level"
                        className={`
                          w-full px-3 py-2 rounded-lg transition-colors
                          ${darkMode 
                            ? 'bg-slate-700 text-slate-200' 
                            : 'bg-white text-slate-900 border border-slate-200'}
                        `}
                      />
                    )}
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Amount Paid
                  </label>
                  <div className="relative">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      $
                    </span>
                    <input
                      type="number"
                      value={formData.amount_paid || ''}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        amount_paid: e.target.value ? parseFloat(e.target.value) : null 
                      }))}
                      className={`
                        w-full pl-8 pr-3 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                      step="0.01"
                      min="0"
                      placeholder="Enter amount"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <label className={`flex items-center gap-2 cursor-pointer ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    <input
                      type="checkbox"
                      checked={formData.is_financial}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_financial: e.target.checked }))}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium">Financial Member</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Boats Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  Boats
                </h3>
                <button
                  type="button"
                  onClick={handleAddBoat}
                  className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} />
                  Add Boat
                </button>
              </div>
              <div className="space-y-4">
                {formData.boats.map((boat, index) => (
                  <div 
                    key={index}
                    className={`
                      relative p-4 rounded-lg border
                      ${darkMode 
                        ? 'bg-slate-700/50 border-slate-600' 
                        : 'bg-white border-slate-200'}
                    `}
                  >
                    <button
                      type="button"
                      onClick={() => handleRemoveBoat(index)}
                      className={`
                        absolute top-2 right-2 p-1.5 rounded-full transition-colors
                        ${darkMode 
                          ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-600' 
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
                      `}
                    >
                      <X size={14} />
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Boat Type
                        </label>
                        <select
                          value={boat.boat_type || ''}
                          onChange={(e) => handleBoatChange(index, 'boat_type', e.target.value as BoatType)}
                          className={`
                            w-full px-3 py-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-slate-800 text-slate-200' 
                              : 'bg-white text-slate-900 border border-slate-200'}
                          `}
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
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Sail Number
                        </label>
                        <input
                          type="text"
                          value={boat.sail_number}
                          onChange={(e) => handleBoatChange(index, 'sail_number', e.target.value)}
                          className={`
                            w-full px-3 py-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-slate-800 text-slate-200' 
                              : 'bg-white text-slate-900 border border-slate-200'}
                          `}
                          placeholder="Enter sail number"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Hull
                        </label>
                        <input
                          type="text"
                          value={boat.hull}
                          onChange={(e) => handleBoatChange(index, 'hull', e.target.value)}
                          className={`
                            w-full px-3 py-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-slate-800 text-slate-200' 
                              : 'bg-white text-slate-900 border border-slate-200'}
                          `}
                          placeholder="Enter hull details"
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Handicap
                        </label>
                        <input
                          type="number"
                          value={boat.handicap || ''}
                          onChange={(e) => {
                            const value = e.target.value ? parseInt(e.target.value) : null;
                            handleBoatChange(index, 'handicap', value);
                          }}
                          className={`
                            w-full px-3 py-2 rounded-lg transition-colors
                            ${darkMode 
                              ? 'bg-slate-800 text-slate-200' 
                              : 'bg-white text-slate-900 border border-slate-200'}
                          `}
                          min="0"
                          max="200"
                          step="10"
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {formData.boats.length === 0 && (
                <div className={`
                  text-center py-6 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700/30 border-slate-600/50 text-slate-400' 
                    : 'bg-slate-50 border-slate-200/50 text-slate-500'}
                `}>
                  <p className="text-sm">No boats added yet</p>
                  <button
                    type="button"
                    onClick={handleAddBoat}
                    className="mt-2 text-blue-500 hover:text-blue-400 text-sm"
                  >
                    Add a boat
                  </button>
                </div>
              )}
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
                  clearEditSession();
                  setShowAddForm(false);
                  setEditingMember(null);
                  setFormData({
                    first_name: '',
                    last_name: '',
                    email: '',
                    phone: '',
                    club: '',
                    street: '',
                    city: '',
                    state: '',
                    postcode: '',
                    date_joined: new Date().toISOString().split('T')[0],
                    membership_level: null,
                    membership_level_custom: null,
                    is_financial: false,
                    amount_paid: null,
                    boats: [],
                    emergency_contact_name: '',
                    emergency_contact_phone: '',
                    emergency_contact_relationship: ''
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
                {editingMember ? 'Update Member' : 'Add Member'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-slate-700 mb-6">
              <button
                onClick={() => setActiveTab('members')}
                className={`
                  px-4 py-2 font-medium text-sm border-b-2 -mb-px
                  ${activeTab === 'members'
                    ? 'border-blue-500 text-blue-500'
                    : 'border-transparent text-slate-400 hover:text-slate-300'}
                `}
              >
                All Members
              </button>
              <button
                onClick={() => setActiveTab('renewals')}
                className={`
                  px-4 py-2 font-medium text-sm border-b-2 -mb-px
                  ${activeTab === 'renewals'
                    ? 'border-blue-500 text-blue-500'
                    : 'border-transparent text-slate-400 hover:text-slate-300'}
                `}
              >
                Membership Renewals
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative flex items-center gap-2">
                  <div className="flex-1 relative">
                    <Search
                      size={18}
                      className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                        darkMode ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="Search members..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`
                        w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                        ${darkMode
                          ? 'bg-slate-700 text-slate-200 placeholder-slate-400'
                          : 'bg-white text-slate-900 placeholder-slate-400 border border-slate-200'}
                      `}
                    />
                  </div>
                  <button
                    onClick={() => setShowImportExportModal(true)}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                    title="Import / Export Members"
                  >
                    <FileDown size={18} />
                  </button>
                </div>
              </div>

              {activeTab === 'renewals' && (
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-slate-400" />
                  <select
                    value={renewalFilter}
                    onChange={(e) => setRenewalFilter(e.target.value as RenewalFilter)}
                    className={`
                      px-4 py-2 rounded-lg transition-colors appearance-none
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                  >
                    <option value="all">All Members</option>
                    <option value="financial">Financial</option>
                    <option value="expired">Expired</option>
                    <option value="expiring-soon">Expiring Soon</option>
                  </select>
                </div>
              )}

              <div className="flex-1 min-w-[200px]">
                <select
                  value={selectedClub}
                  onChange={(e) => setSelectedClub(e.target.value)}
                  className={`
                    w-full px-4 py-2 rounded-lg transition-colors appearance-none
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-white text-slate-900 border border-slate-200'}
                  `}
                >
                  <option value="">All Clubs</option>
                  {clubs.map(club => (
                    <option key={club.id} value={club.name}>
                      {club.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2 p-1 bg-slate-700 rounded-lg">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Grid view"
                >
                  <Grid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="List view"
                >
                  <List size={18} />
                </button>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingMember(null);
                    setFormData({
                      first_name: '',
                      last_name: '',
                      email: '',
                      phone: '',
                      club: '',
                      street: '',
                      city: '',
                      state: '',
                      postcode: '',
                      date_joined: new Date().toISOString().split('T')[0],
                      membership_level: null,
                      membership_level_custom: null,
                      is_financial: false,
                      amount_paid: null,
                      boats: [{ boat_type: null, sail_number: '', hull: '', handicap: null }],
                      emergency_contact_name: '',
                      emergency_contact_phone: '',
                      emergency_contact_relationship: ''
                    });
                    setShowAddForm(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  <UserPlus size={18} />
                  Add Member
                </button>

                {activeTab === 'renewals' && (
                  <button
                    onClick={handleBulkRenewalReminders}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors"
                  >
                    <Mail size={18} />
                    Send Renewal Reminders
                  </button>
                )}
              </div>
            </div>

            {/* Alphabet Filter */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedLetter(null)}
                className={`
                  px-3 py-1 rounded text-sm font-medium transition-colors
                  ${!selectedLetter
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }
                `}
              >
                All
              </button>
              {getAlphabetLetters().map(letter => (
                <button
                  key={letter}
                  onClick={() => setSelectedLetter(letter === selectedLetter ? null : letter)}
                  className={`
                    px-3 py-1 rounded text-sm font-medium transition-colors
                    ${letter === selectedLetter
                      ? 'bg-blue-600 text-white'
                      : darkMode
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }
                  `}
                >
                  {letter}
                </button>
              ))}
            </div>

            {error && (
              <div className="px-6">
                <div className="p-3 bg-red-900/10 text-red-500 rounded-lg text-sm">
                  {error}
                </div>
              </div>
            )}

            {loading ? (
              <div className={`text-center py-12 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'}
              `}>
                Loading members...
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className={`text-center py-12 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700/50 border-slate-600 text-slate-400' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'}
              `}>
                <Users size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No Members Found</p>
                <p className="text-sm">
                  {searchTerm || selectedLetter || selectedClub 
                    ? 'Try adjusting your filters' 
                    : 'Add your first member to get started'}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredMembers.map((member) => {
                  const memberStatus = getMemberStatus(member);
                  
                  return (
                    <div
                      key={member.id}
                      className={`
                        relative p-4 rounded-lg border group
                        ${darkMode 
                          ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                          : 'bg-white border-slate-200 hover:bg-slate-50'}
                      `}
                    >
                      <div className="mb-3 flex justify-between">
                        <h3 className={`text-base font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          {member.first_name} {member.last_name}
                        </h3>
                        <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${memberStatus.color}`}>
                          {memberStatus.label}
                        </div>
                      </div>

                      {member.boats && member.boats.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {member.boats.map((boat, i) => (
                            <div 
                              key={i}
                              className={`
                                flex items-center gap-1 text-xs
                                ${darkMode ? 'text-slate-300' : 'text-slate-700'}
                              `}
                            >
                              <Sailboat size={12} className="text-blue-400" />
                              <span>
                                {boat.boat_type}
                                {boat.sail_number && ` #${boat.sail_number}`}
                                {boat.hull && ` - ${boat.hull}`}
                                {boat.handicap !== null && ` | ${boat.handicap} sec`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className={`space-y-0.5 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {member.club && (
                          <div className="flex items-center gap-1">
                            <Building size={12} />
                            <span className="truncate">{member.club}</span>
                          </div>
                        )}
                        {member.email && (
                          <div className="flex items-center gap-1">
                            <Mail size={12} />
                            <span className="truncate">{member.email}</span>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center gap-1">
                            <Phone size={12} />
                            <span>{member.phone}</span>
                          </div>
                        )}
                        {member.membership_level && (
                          <div className="flex items-center gap-1">
                            <Users size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span>
                              {member.membership_level === 'Custom' 
                                ? member.membership_level_custom 
                                : member.membership_level}
                            </span>
                          </div>
                        )}
                        {member.renewal_date && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span>Renewal: {formatDate(member.renewal_date)}</span>
                          </div>
                        )}
                      </div>

                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex gap-2">
                          {activeTab === 'renewals' && (
                            <button
                              onClick={() => handleManualRenewal(member.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                darkMode 
                                  ? 'hover:bg-green-900/50 text-green-400' 
                                  : 'hover:bg-green-100 text-green-600'
                              }`}
                              title="Renew membership"
                            >
                              <RefreshCw size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleEdit(member)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              darkMode 
                                ? 'hover:bg-slate-600 text-slate-300' 
                                : 'hover:bg-slate-200 text-slate-600'
                            }`}
                            title="Edit member"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(member)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              darkMode 
                                ? 'hover:bg-red-900/50 text-red-400' 
                                : 'hover:bg-red-100 text-red-600'
                            }`}
                            title="Delete member"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredMembers.map((member) => {
                  const memberStatus = getMemberStatus(member);
                  
                  return (
                    <div
                      key={member.id}
                      className={`
                        flex items-center gap-4 p-4 rounded-lg border group relative
                        ${darkMode 
                          ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                          : 'bg-white border-slate-200 hover:bg-slate-50'}
                      `}
                    >
                      <div className="h-12 w-12 flex-shrink-0 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
                        {member.first_name.charAt(0)}{member.last_name.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={`text-base font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            {member.first_name} {member.last_name}
                          </h3>
                          <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${memberStatus.color}`}>
                            {memberStatus.label}
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                          {member.club && (
                            <div className="flex items-center gap-1 text-xs">
                              <Building size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                {member.club}
                              </span>
                            </div>
                          )}
                          
                          {member.email && (
                            <div className="flex items-center gap-1 text-xs">
                              <Mail size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                {member.email}
                              </span>
                            </div>
                          )}
                          
                          {member.phone && (
                            <div className="flex items-center gap-1 text-xs">
                              <Phone size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                {member.phone}
                              </span>
                            </div>
                          )}
                          
                          {member.membership_level && (
                            <div className="flex items-center gap-1 text-xs">
                              <Users size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                {member.membership_level === 'Custom' 
                                  ? member.membership_level_custom 
                                  : member.membership_level}
                              </span>
                            </div>
                          )}
                          
                          {member.renewal_date && (
                            <div className="flex items-center gap-1 text-xs">
                              <Calendar size={12} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                              <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
                                Renewal: {formatDate(member.renewal_date)}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {member.boats && member.boats.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {member.boats.map((boat, i) => (
                              <div 
                                key={i}
                                className={`
                                  flex items-center gap-1 text-xs px-2 py-1 rounded-full
                                  ${darkMode ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-700'}
                                `}
                              >
                                <Sailboat size={10} className="text-blue-400" />
                                <span>
                                  {boat.boat_type}
                                  {boat.sail_number && ` #${boat.sail_number}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {activeTab === 'renewals' && (
                          <button
                            onClick={() => handleManualRenewal(member.id)}
                            className={`p-2 rounded-lg transition-colors ${
                              darkMode 
                                ? 'hover:bg-green-900/50 text-green-400' 
                                : 'hover:bg-green-100 text-green-600'
                            }`}
                            title="Renew membership"
                          >
                            <RefreshCw size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(member)}
                          className={`p-2 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-slate-600 text-slate-300' 
                              : 'hover:bg-slate-200 text-slate-600'
                          }`}
                          title="Edit member"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(member)}
                          className={`p-2 rounded-lg transition-colors ${
                            darkMode 
                              ? 'hover:bg-red-900/50 text-red-400' 
                              : 'hover:bg-red-100 text-red-600'
                          }`}
                          title="Delete member"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`
        flex justify-end gap-3 p-6 border-t flex-shrink-0
        ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}
      `}>
        <button
          onClick={onClose}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${darkMode
              ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
              : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
          `}
        >
          Close
        </button>
      </div>

      <ArchiveMemberModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setMemberToDelete(null);
        }}
        onConfirm={handleConfirmArchive}
        member={memberToDelete}
        darkMode={darkMode}
      />

      <MemberImportExportModal
        isOpen={showImportExportModal}
        onClose={() => setShowImportExportModal(false)}
        darkMode={darkMode}
        members={members}
        onImportComplete={fetchMembers}
        currentClubId={currentClub?.id || ''}
      />
    </div>
  );
};