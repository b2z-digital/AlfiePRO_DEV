import React, { useState, useEffect, useRef } from 'react';
import { X, User, Mail, Phone, Home, Building, Calendar, CreditCard, Sailboat, Plus, Trash2, AlertTriangle, Check, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BoatType } from '../../types/member';
import { CodeOfConductModal } from '../CodeOfConductModal';
import { Avatar } from '../ui/Avatar';

interface MembershipFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  isRenewal?: boolean;
  existingMemberId?: string;
  darkMode?: boolean;
  onSuccess?: () => void;
  readOnly?: boolean;
}

export const MembershipFormModal: React.FC<MembershipFormModalProps> = ({
  isOpen,
  onClose,
  clubId,
  isRenewal = false,
  existingMemberId,
  darkMode = true,
  onSuccess,
  readOnly = false
}) => {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [membershipTypes, setMembershipTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [codeOfConduct, setCodeOfConduct] = useState<string>('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showCodeOfConductModal, setShowCodeOfConductModal] = useState(false);
  const [memberAvatar, setMemberAvatar] = useState<string | null>(null);
  const [showCodeOfConduct, setShowCodeOfConduct] = useState(false);
  
  const [formData, setFormData] = useState({
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
    boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '' }]
  });
  
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>('bank_transfer');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  // Reset form when modal is opened
  useEffect(() => {
    if (isOpen) {
      // Reset form data to empty values
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
        boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '' }]
      });
      
      // Reset other state
      setSelectedTypeId('');
      setAgreeToTerms(false);
      setShowPaymentForm(false);
      setError(null);
      setSuccess(false);
      
      // Fetch fresh data
      fetchData();
    }
  }, [isOpen, clubId, existingMemberId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch club details including code of conduct
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('code_of_conduct')
        .eq('id', clubId)
        .single();
      
      if (clubError) throw clubError;
      
      if (clubData) {
        setCodeOfConduct(clubData.code_of_conduct || '');
      }
      
      // Fetch membership types
      const { data: typesData, error: typesError } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('amount', { ascending: true });
      
      if (typesError) throw typesError;
      
      setMembershipTypes(typesData || []);
      if (typesData && typesData.length > 0) {
        setSelectedTypeId(typesData[0].id);
      }
      
      // If this is a renewal or edit, fetch existing member data
      if (existingMemberId) {
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select(`
            *,
            boats: member_boats (*)
          `)
          .eq('id', existingMemberId)
          .single();

        if (memberError) throw memberError;

        if (memberData) {
          setFormData({
            first_name: memberData.first_name || '',
            last_name: memberData.last_name || '',
            email: memberData.email || '',
            phone: memberData.phone || '',
            street: memberData.street || '',
            city: memberData.city || '',
            state: memberData.state || '',
            postcode: memberData.postcode || '',
            emergency_contact_name: memberData.emergency_contact_name || '',
            emergency_contact_phone: memberData.emergency_contact_phone || '',
            emergency_contact_relationship: memberData.emergency_contact_relationship || '',
            boats: memberData.boats?.length > 0
              ? memberData.boats.map((boat: any) => ({
                  boat_type: boat.boat_type,
                  sail_number: boat.sail_number || '',
                  hull: boat.hull || ''
                }))
              : [{ boat_type: '' as BoatType, sail_number: '', hull: '' }]
          });

          // Set the membership type to the member's current type if available
          if (memberData.membership_level) {
            const matchingType = typesData?.find(type => type.name === memberData.membership_level);
            if (matchingType) {
              setSelectedTypeId(matchingType.id);
            }
          }

          // Fetch avatar if user_id is linked
          if (memberData.user_id) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('avatar_url')
              .eq('id', memberData.user_id)
              .single();

            if (profileData?.avatar_url) {
              setMemberAvatar(profileData.avatar_url);
            }
          }
        }
      } else if (user) {
        // Pre-fill with user data if available
        setFormData(prev => ({
          ...prev,
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          email: user.email || ''
        }));
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };
  
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
      boats: [...prev.boats, { boat_type: '' as BoatType, sail_number: '', hull: '' }]
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
    
    if (readOnly) {
      onClose();
      return;
    }
    
    if (!agreeToTerms && codeOfConduct) {
      setError('You must agree to the Code of Conduct');
      return;
    }
    
    if (!selectedTypeId) {
      setError('Please select a membership type');
      return;
    }
    
    try {
      setSubmitting(true);
      setError(null);
      
      const selectedType = membershipTypes.find(type => type.id === selectedTypeId);
      if (!selectedType) throw new Error('Selected membership type not found');
      
      // If payment method is card and amount is greater than 0, show payment form
      if (paymentMethod === 'card' && !isRenewal && selectedType.amount > 0) {
        setShowPaymentForm(true);
        setSubmitting(false);
        return;
      }
      
      // For bank transfer, free memberships, or renewals, proceed with creating/updating the membership
      let memberId = existingMemberId;
      
      if (!memberId) {
        // Create new member
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .insert({
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone: formData.phone,
            street: formData.street,
            city: formData.city,
            state: formData.state,
            postcode: formData.postcode,
            emergency_contact_name: formData.emergency_contact_name,
            emergency_contact_phone: formData.emergency_contact_phone,
            emergency_contact_relationship: formData.emergency_contact_relationship,
            club_id: clubId,
            date_joined: new Date().toISOString().split('T')[0],
            membership_level: selectedType.name,
            is_financial: false, // Will be set to true after payment confirmation
            amount_paid: selectedType.amount
            // Removed user_id assignment - this should only happen when a user claims their profile
          })
          .select()
          .single();
        
        if (memberError) throw memberError;
        memberId = memberData.id;
        
        // Add boats
        if (formData.boats.length > 0 && formData.boats[0].boat_type) {
          const { error: boatsError } = await supabase
            .from('member_boats')
            .insert(
              formData.boats
                .filter(boat => boat.boat_type) // Only insert boats with a type
                .map(boat => ({
                  member_id: memberId,
                  boat_type: boat.boat_type,
                  sail_number: boat.sail_number,
                  hull: boat.hull
                }))
            );
          
          if (boatsError) throw boatsError;
        }
      } else {
        // Update existing member
        const { error: memberError } = await supabase
          .from('members')
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            phone: formData.phone,
            street: formData.street,
            city: formData.city,
            state: formData.state,
            postcode: formData.postcode,
            emergency_contact_name: formData.emergency_contact_name,
            emergency_contact_phone: formData.emergency_contact_phone,
            emergency_contact_relationship: formData.emergency_contact_relationship,
            membership_level: selectedType.name,
            amount_paid: selectedType.amount
            // Removed user_id assignment - this should only happen when a user claims their profile
          })
          .eq('id', memberId);
        
        if (memberError) throw memberError;
        
        // Delete existing boats
        const { error: deleteBoatsError } = await supabase
          .from('member_boats')
          .delete()
          .eq('member_id', memberId);
        
        if (deleteBoatsError) throw deleteBoatsError;
        
        // Add updated boats
        if (formData.boats.length > 0 && formData.boats[0].boat_type) {
          const { error: boatsError } = await supabase
            .from('member_boats')
            .insert(
              formData.boats
                .filter(boat => boat.boat_type) // Only insert boats with a type
                .map(boat => ({
                  member_id: memberId,
                  boat_type: boat.boat_type,
                  sail_number: boat.sail_number,
                  hull: boat.hull
                }))
            );
          
          if (boatsError) throw boatsError;
        }
      }
      
      // Create membership payment record
      const { error: paymentError } = await supabase
        .from('membership_payments')
        .insert({
          member_id: memberId,
          membership_type_id: selectedTypeId,
          amount: selectedType.amount,
          currency: selectedType.currency,
          status: selectedType.amount === 0 || paymentMethod === 'card' ? 'completed' : 'pending',
          payment_method: selectedType.amount === 0 ? 'free' : paymentMethod
        });
      
      if (paymentError) throw paymentError;
      
      // Create membership renewal record
      const today = new Date();
      let expiryDate = new Date();
      
      // Calculate expiry date based on renewal period
      switch (selectedType.renewal_period) {
        case "monthly":
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          break;
        case "quarterly":
          expiryDate.setMonth(expiryDate.getMonth() + 3);
          break;
        case "annual":
        default:
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          break;
        case "lifetime":
          expiryDate = new Date(2099, 11, 31); // Far future date for lifetime memberships
          break;
      }
      
      const { error: renewalError } = await supabase
        .from('membership_renewals')
        .insert({
          member_id: memberId,
          membership_type_id: selectedTypeId,
          renewal_date: today.toISOString().split('T')[0],
          expiry_date: expiryDate.toISOString().split('T')[0],
          amount_paid: selectedType.amount,
          payment_method: selectedType.amount === 0 ? 'free' : paymentMethod,
          payment_reference: selectedType.amount === 0 ? 'Lifetime membership' : 
                            paymentMethod === 'bank_transfer' ? 'Pending bank transfer' : 'Online payment'
        });
      
      if (renewalError) throw renewalError;
      
      // Update member as financial
      const { error: updateError } = await supabase
        .from('members')
        .update({
          is_financial: true,
          renewal_date: expiryDate.toISOString().split('T')[0]
        })
        .eq('id', memberId);
      
      if (updateError) throw updateError;
      
      setSuccess(true);
      
      // Close modal after success
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error submitting membership form:', err);
      setError(err instanceof Error ? err.message : 'Failed to process membership');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handlePaymentSuccess = async () => {
    // This would be called after successful Stripe payment
    setShowPaymentForm(false);
    setSuccess(true);
    
    // Close modal after success
    setTimeout(() => {
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-4xl bg-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          {existingMemberId && formData.first_name ? (
            <div className="flex items-center gap-3">
              <Avatar
                firstName={formData.first_name}
                lastName={formData.last_name}
                imageUrl={memberAvatar}
                size="md"
              />
              <div className="flex items-baseline gap-2">
                <h2 className="text-xl font-semibold text-white">
                  {formData.first_name} {formData.last_name}
                </h2>
                {!readOnly && (
                  <span className="text-slate-400 text-sm">- Edit Membership</span>
                )}
              </div>
            </div>
          ) : (
            <h2 className="text-xl font-semibold text-white">
              {readOnly ? 'Member Details' :
                isRenewal ? 'Renew Membership' :
                existingMemberId ? 'Edit Membership' :
                'New Membership Application'}
            </h2>
          )}
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-slate-400">Loading membership form...</div>
            </div>
          ) : (
            <>
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
                        {isRenewal 
                          ? 'Your membership has been renewed successfully!' 
                          : existingMemberId
                            ? 'Membership updated successfully!'
                            : 'Your membership application has been submitted successfully!'}
                      </h3>
                    </div>
                  </div>
                </div>
              )}

              {showPaymentForm ? (
                <div className="space-y-6">
                  <div className="mb-4">
                    <p className="text-slate-300">
                      Complete your payment to finalize your membership.
                    </p>
                    <div className="mt-2 p-3 rounded-lg bg-slate-700/50 border border-slate-600/50">
                      <div className="flex justify-between">
                        <span className="text-slate-300">Membership Type:</span>
                        <span className="text-white font-medium">
                          {membershipTypes.find(t => t.id === selectedTypeId)?.name}
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-300">Amount:</span>
                        <span className="text-white font-medium">
                          ${membershipTypes.find(t => t.id === selectedTypeId)?.amount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* This would be replaced with actual Stripe Elements */}
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Card Number
                      </label>
                      <div className="relative">
                        <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          placeholder="4242 4242 4242 4242"
                          className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Expiry Date
                        </label>
                        <input
                          type="text"
                          placeholder="MM/YY"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          CVC
                        </label>
                        <input
                          type="text"
                          placeholder="123"
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPaymentForm(false)}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handlePaymentSuccess}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Pay Now
                    </button>
                  </div>
                  
                  <p className="text-xs text-slate-400 mt-4 text-center">
                    This is a demo payment form. In production, this would be replaced with Stripe Elements.
                  </p>
                </div>
              ) : (
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
                          readOnly={readOnly}
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
                          readOnly={readOnly}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Email Address *
                        </label>
                        <div className="relative">
                          <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            required
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="you@example.com"
                            readOnly={readOnly}
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
                            readOnly={readOnly}
                          />
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
                          readOnly={readOnly}
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
                            readOnly={readOnly}
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
                            readOnly={readOnly}
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
                            readOnly={readOnly}
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
                          readOnly={readOnly}
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
                          readOnly={readOnly}
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
                          readOnly={readOnly}
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Boats */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-white flex items-center gap-2">
                        <Sailboat size={20} className="text-blue-400" />
                        Your Boats
                      </h3>
                      
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={handleAddBoat}
                          className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm transition-colors"
                        >
                          <Plus size={16} />
                          Add Boat
                        </button>
                      )}
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
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => handleRemoveBoat(index)}
                                className="absolute top-2 right-2 p-1 rounded-full text-slate-400 hover:text-slate-300 hover:bg-slate-600/50"
                              >
                                <X size={16} />
                              </button>
                            )}
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                  Boat Type
                                </label>
                                <select
                                  value={boat.boat_type || ''}
                                  onChange={(e) => handleBoatChange(index, 'boat_type', e.target.value as BoatType)}
                                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={readOnly}
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
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={boat.sail_number}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^0-9]/g, '');
                                    handleBoatChange(index, 'sail_number', value);
                                  }}
                                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  placeholder="Enter sail number"
                                  readOnly={readOnly}
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
                                  readOnly={readOnly}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {!readOnly && (
                    <>
                      {/* Membership Type Selection */}
                      <div>
                        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                          <CreditCard size={20} className="text-blue-400" />
                          Membership Type
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {membershipTypes.map(type => (
                            <div 
                              key={type.id}
                              className={`
                                p-4 rounded-lg border cursor-pointer transition-all
                                ${selectedTypeId === type.id
                                  ? 'bg-blue-600/20 border-blue-500/50 ring-2 ring-blue-500 ring-opacity-50'
                                  : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700'}
                              `}
                              onClick={() => setSelectedTypeId(type.id)}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="radio"
                                  id={`type-${type.id}`}
                                  checked={selectedTypeId === type.id}
                                  onChange={() => setSelectedTypeId(type.id)}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600"
                                />
                                <label htmlFor={`type-${type.id}`} className="text-white font-medium">
                                  {type.name}
                                </label>
                              </div>
                              
                              {type.description && (
                                <p className="text-sm text-slate-300 mb-2 ml-6">{type.description}</p>
                              )}
                              
                              <div className="text-lg font-semibold text-white ml-6">
                                {type.amount > 0 ? (
                                  <>
                                    ${type.amount.toFixed(2)} {type.currency}
                                    <span className="text-sm font-normal text-slate-400 ml-1">
                                      / {type.renewal_period === 'annual' ? 'year' : 
                                         type.renewal_period === 'monthly' ? 'month' : 
                                         type.renewal_period === 'quarterly' ? 'quarter' : 
                                         'lifetime'}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-green-400">Free</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Payment Method - Only show for paid memberships */}
                      {membershipTypes.find(type => type.id === selectedTypeId)?.amount > 0 && (
                        <div>
                          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                            <CreditCard size={20} className="text-blue-400" />
                            Payment Method
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div 
                              className={`
                                p-4 rounded-lg border cursor-pointer transition-all
                                ${paymentMethod === 'card'
                                  ? 'bg-blue-600/20 border-blue-500/50 ring-2 ring-blue-500 ring-opacity-50'
                                  : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700'}
                              `}
                              onClick={() => setPaymentMethod('card')}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="radio"
                                  id="payment-card"
                                  checked={paymentMethod === 'card'}
                                  onChange={() => setPaymentMethod('card')}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600"
                                />
                                <label htmlFor="payment-card" className="text-white font-medium">
                                  Credit/Debit Card
                                </label>
                              </div>
                              <p className="text-sm text-slate-300 ml-6">
                                Pay securely online with your credit or debit card
                              </p>
                            </div>
                            
                            <div 
                              className={`
                                p-4 rounded-lg border cursor-pointer transition-all
                                ${paymentMethod === 'bank_transfer'
                                  ? 'bg-blue-600/20 border-blue-500/50 ring-2 ring-blue-500 ring-opacity-50'
                                  : 'bg-slate-700/50 border-slate-600/50 hover:bg-slate-700'}
                              `}
                              onClick={() => setPaymentMethod('bank_transfer')}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="radio"
                                  id="payment-bank"
                                  checked={paymentMethod === 'bank_transfer'}
                                  onChange={() => setPaymentMethod('bank_transfer')}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-600"
                                />
                                <label htmlFor="payment-bank" className="text-white font-medium">
                                  Bank Transfer
                                </label>
                              </div>
                              <p className="text-sm text-slate-300 ml-6">
                                Pay via bank transfer (details will be provided)
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Code of Conduct Agreement */}
                      {codeOfConduct && (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-white font-medium">Code of Conduct</h3>
                            <button
                              type="button"
                              onClick={() => setShowCodeOfConduct(!showCodeOfConduct)}
                              className="text-slate-400 hover:text-slate-300 transition-colors"
                            >
                              {showCodeOfConduct ? <ChevronUp size={20} /> : <Eye size={20} />}
                            </button>
                          </div>

                          {showCodeOfConduct && (
                            <div className="mb-4 p-4 bg-slate-700/50 rounded-lg border border-slate-600/50 max-h-64 overflow-y-auto">
                              <div
                                className="text-sm text-slate-300 prose prose-invert prose-sm max-w-none"
                                dangerouslySetInnerHTML={{ __html: codeOfConduct }}
                              />
                            </div>
                          )}

                          <div className="flex items-start gap-2 mb-4">
                            <input
                              type="checkbox"
                              id="agree-terms"
                              checked={agreeToTerms}
                              onChange={(e) => setAgreeToTerms(e.target.checked)}
                              className="h-5 w-5 mt-0.5 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="agree-terms" className="text-sm text-slate-300">
                              I have read and agree to the club's Code of Conduct, Constitution, and By-Laws.
                              I understand that by submitting this form, I am applying for membership and agree to
                              follow all club rules and regulations.
                            </label>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Submit Button */}
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      {readOnly ? 'Close' : 'Cancel'}
                    </button>
                    
                    {!readOnly && (
                      <button
                        type="submit"
                        disabled={submitting || success}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? 'Processing...' : isRenewal ? 'Renew Membership' : existingMemberId ? 'Update Member' : 'Submit Application'}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {/* Code of Conduct Modal */}
      {showCodeOfConductModal && (
        <CodeOfConductModal
          isOpen={showCodeOfConductModal}
          onClose={() => setShowCodeOfConductModal(false)}
          content={codeOfConduct}
          clubName={currentClub?.club?.name || 'Club'}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};