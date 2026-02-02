import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Home, Building, Calendar, CreditCard, Sailboat, Plus, Trash2, AlertTriangle, Check, X } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BoatType } from '../../types/member';

interface MembershipType {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  renewal_period: string;
  is_active: boolean;
}

interface MembershipFormProps {
  clubId: string;
  isRenewal?: boolean;
  existingMemberId?: string;
  darkMode?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const MembershipForm: React.FC<MembershipFormProps> = ({
  clubId,
  isRenewal = false,
  existingMemberId,
  darkMode = true,
  onSuccess,
  onCancel
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [codeOfConduct, setCodeOfConduct] = useState<string>('');
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  
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
  
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank_transfer'>('card');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  useEffect(() => {
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
    
    fetchData();
  }, [clubId, existingMemberId, user, isRenewal]);
  
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
    
    if (!agreeToTerms) {
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
            user_id: user?.id,
            date_joined: new Date().toISOString().split('T')[0],
            membership_level: selectedType.name,
            is_financial: false, // Will be set to true after payment confirmation
            amount_paid: selectedType.amount
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
      
      // Redirect or show success message
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/dashboard');
        }
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
    
    // Redirect or show success message
    setTimeout(() => {
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    }, 2000);
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400">Loading membership form...</div>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        <h2 className="text-2xl font-bold text-white mb-6">
          {isRenewal ? 'Renew Membership' : 'Membership Application'}
        </h2>
        
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
                    : 'Your membership application has been submitted successfully!'}
                </h3>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  First Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    name="first_name"
                    required
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter first name"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Last Name *
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    name="last_name"
                    required
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter last name"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter email address"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Address Information */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Address</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Street Address *
                </label>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    name="street"
                    required
                    value={formData.street}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter street address"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    City/Suburb *
                  </label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      name="city"
                      required
                      value={formData.city}
                      onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="Enter city/suburb"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    State *
                  </label>
                  <select
                    name="state"
                    required
                    value={formData.state}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    <option value="">Select state</option>
                    <option value="ACT">ACT</option>
                    <option value="NSW">NSW</option>
                    <option value="NT">NT</option>
                    <option value="QLD">QLD</option>
                    <option value="SA">SA</option>
                    <option value="TAS">TAS</option>
                    <option value="VIC">VIC</option>
                    <option value="WA">WA</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Postcode *
                  </label>
                  <input
                    type="text"
                    name="postcode"
                    required
                    value={formData.postcode}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    placeholder="Enter postcode"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Emergency Contact */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  name="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Enter emergency contact name"
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
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="Enter emergency contact phone"
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
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  placeholder="e.g., Spouse, Parent, Friend"
                />
              </div>
            </div>
          </div>
          
          {/* Boats */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Boats</h3>
              <button
                type="button"
                onClick={handleAddBoat}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Add Boat
              </button>
            </div>
            
            <div className="space-y-4">
              {formData.boats.map((boat, index) => (
                <div 
                  key={index}
                  className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-slate-300">Boat {index + 1}</h4>
                    {formData.boats.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBoat(index)}
                        className="p-1 rounded-full text-slate-400 hover:text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Boat Class
                      </label>
                      <select
                        value={boat.boat_type}
                        onChange={(e) => handleBoatChange(index, 'boat_type', e.target.value as BoatType)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      >
                        <option value="">Select boat class</option>
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
                      <label className="block text-xs font-medium text-slate-400 mb-1">
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
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        placeholder="Enter sail number"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">
                        Hull
                      </label>
                      <input
                        type="text"
                        value={boat.hull}
                        onChange={(e) => handleBoatChange(index, 'hull', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        placeholder="e.g., Trance, Diamond"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Membership Type Selection */}
          <div>
            <h3 className="text-lg font-medium text-white mb-4">Membership Type</h3>
            
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
              <h3 className="text-lg font-medium text-white mb-4">Payment Method</h3>
              
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
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-white">Code of Conduct</h3>
              <button
                type="button"
                onClick={() => {
                  // Open code of conduct in modal
                  const modal = document.getElementById('code-of-conduct-modal');
                  if (modal) {
                    modal.classList.remove('hidden');
                  }
                }}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                View Full Code of Conduct
              </button>
            </div>
            
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
          
          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            )}
            
            <button
              type="submit"
              disabled={submitting || success}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processing...' : isRenewal ? 'Renew Membership' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Code of Conduct Modal */}
      <div id="code-of-conduct-modal" className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 hidden">
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <h3 className="text-lg font-medium text-white">Code of Conduct</h3>
            <button
              onClick={() => {
                const modal = document.getElementById('code-of-conduct-modal');
                if (modal) {
                  modal.classList.add('hidden');
                }
              }}
              className="text-slate-400 hover:text-slate-300"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-8rem)]">
            <div 
              className="prose prose-sm max-w-none prose-invert"
              dangerouslySetInnerHTML={{ __html: codeOfConduct }}
            />
          </div>
          <div className="flex justify-end p-4 border-t border-slate-700">
            <button
              onClick={() => {
                const modal = document.getElementById('code-of-conduct-modal');
                if (modal) {
                  modal.classList.add('hidden');
                }
                setAgreeToTerms(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              I Agree
            </button>
          </div>
        </div>
      </div>
      
      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-medium text-white">Payment</h3>
              <button
                onClick={() => setShowPaymentForm(false)}
                className="text-slate-400 hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
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
              
              <button
                type="button"
                onClick={handlePaymentSuccess}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Pay Now
              </button>
              
              <p className="text-xs text-slate-400 mt-4 text-center">
                This is a demo payment form. In production, this would be replaced with Stripe Elements.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};