import React, { useState, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, Calendar, CreditCard, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';
import { sendWelcomeEmail } from '../utils/membershipUtils';
import { useNotifications } from '../contexts/NotificationContext';

interface MemberOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  clubId: string;
  onSuccess?: () => void;
}

interface MembershipType {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  renewal_period: string;
}

interface MemberFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  membership_type_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

export const MemberOnboardingModal: React.FC<MemberOnboardingModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  clubId,
  onSuccess
}) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { addNotification } = useNotifications();
  
  const [formData, setFormData] = useState<MemberFormData>({
    first_name: user?.user_metadata?.first_name || '',
    last_name: user?.user_metadata?.last_name || '',
    email: user?.email || '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postcode: '',
    membership_type_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  });

  useEffect(() => {
    if (isOpen && clubId) {
      fetchMembershipTypes();
    }
  }, [isOpen, clubId]);

  const fetchMembershipTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('amount');

      if (error) throw error;
      setMembershipTypes(data || []);
    } catch (err) {
      console.error('Error fetching membership types:', err);
      setError('Failed to load membership options');
    }
  };

  const handleInputChange = (field: keyof MemberFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.first_name && formData.last_name && formData.email);
      case 2:
        return !!(formData.street && formData.city && formData.state && formData.postcode);
      case 3:
        return !!formData.membership_type_id;
      case 4:
        return !!(formData.emergency_contact_name && formData.emergency_contact_phone);
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
      setError(null);
    } else {
      setError('Please fill in all required fields');
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(4)) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Create member record
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .insert({
          club_id: clubId,
          user_id: user?.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          street: formData.street,
          city: formData.city,
          state: formData.state,
          postcode: formData.postcode,
          date_joined: new Date().toISOString().split('T')[0],
          is_financial: false, // Will be updated when payment is processed
          emergency_contact_name: formData.emergency_contact_name,
          emergency_contact_phone: formData.emergency_contact_phone,
          emergency_contact_relationship: formData.emergency_contact_relationship
        })
        .select()
        .single();

      if (memberError) throw memberError;

      // Get selected membership type for payment
      const selectedMembershipType = membershipTypes.find(mt => mt.id === formData.membership_type_id);
      
      if (selectedMembershipType && selectedMembershipType.amount > 0) {
        // Create payment record
        const { error: paymentError } = await supabase
          .from('membership_payments')
          .insert({
            member_id: memberData.id,
            membership_type_id: formData.membership_type_id,
            amount: selectedMembershipType.amount,
            currency: selectedMembershipType.currency,
            status: 'pending'
          });

        if (paymentError) throw paymentError;
      } else {
        // Free membership - mark as financial immediately
        const { error: updateError } = await supabase
          .from('members')
          .update({ 
            is_financial: true,
            renewal_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 year from now
          })
          .eq('id', memberData.id);

        if (updateError) throw updateError;
        
        // Send welcome email for free memberships
        const { data: clubData } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', clubId)
          .single();
        
        if (clubData) {
          await sendWelcomeEmail({
            first_name: formData.first_name,
            last_name: formData.last_name,
            email: formData.email,
            club_name: clubData.name,
            club_id: clubId,
            user_id: user?.id
          });
        }
      }

      addNotification('success', 'Membership application submitted successfully!');
      setSuccess(true);
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 2000);

    } catch (err) {
      console.error('Error creating membership:', err);
      setError(err instanceof Error ? err.message : 'Failed to create membership');
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        Personal Information
      </h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            First Name *
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => handleInputChange('first_name', e.target.value)}
            className={`
              w-full px-3 py-2 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700 border-slate-600 text-white' 
                : 'bg-white border-slate-300 text-slate-900'}
            `}
            placeholder="Enter your first name"
          />
        </div>
        
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            Last Name *
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => handleInputChange('last_name', e.target.value)}
            className={`
              w-full px-3 py-2 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700 border-slate-600 text-white' 
                : 'bg-white border-slate-300 text-slate-900'}
            `}
            placeholder="Enter your last name"
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Email Address *
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleInputChange('email', e.target.value)}
          disabled
          className={`
            w-full px-3 py-2 rounded-lg border opacity-60
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
        />
        <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          This is your account email and cannot be changed
        </p>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Phone Number
        </label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => handleInputChange('phone', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          placeholder="Enter your phone number"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        Address Information
      </h3>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Street Address *
        </label>
        <input
          type="text"
          value={formData.street}
          onChange={(e) => handleInputChange('street', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          placeholder="Enter your street address"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            City *
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            className={`
              w-full px-3 py-2 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700 border-slate-600 text-white' 
                : 'bg-white border-slate-300 text-slate-900'}
            `}
            placeholder="Enter your city"
          />
        </div>
        
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            State *
          </label>
          <input
            type="text"
            value={formData.state}
            onChange={(e) => handleInputChange('state', e.target.value)}
            className={`
              w-full px-3 py-2 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700 border-slate-600 text-white' 
                : 'bg-white border-slate-300 text-slate-900'}
            `}
            placeholder="Enter your state"
          />
        </div>
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Postcode *
        </label>
        <input
          type="text"
          value={formData.postcode}
          onChange={(e) => handleInputChange('postcode', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          placeholder="Enter your postcode"
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        Membership Type
      </h3>
      
      <div className="space-y-3">
        {membershipTypes.map(type => (
          <div
            key={type.id}
            className={`
              p-4 rounded-lg border cursor-pointer transition-all
              ${formData.membership_type_id === type.id
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-800'
                : darkMode
                  ? 'border-slate-600 hover:border-slate-500'
                  : 'border-slate-300 hover:border-slate-400'
              }
              ${darkMode ? 'bg-slate-700' : 'bg-white'}
            `}
            onClick={() => handleInputChange('membership_type_id', type.id)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  {type.name}
                </h4>
                {type.description && (
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {type.description}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                  ${type.amount}
                </div>
                <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  per {type.renewal_period}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {membershipTypes.length === 0 && (
        <div className="text-center py-8">
          <CreditCard size={48} className="mx-auto mb-4 text-slate-500 opacity-50" />
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
            No membership types available
          </p>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        Emergency Contact
      </h3>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Contact Name *
        </label>
        <input
          type="text"
          value={formData.emergency_contact_name}
          onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          placeholder="Enter emergency contact name"
        />
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Contact Phone *
        </label>
        <input
          type="tel"
          value={formData.emergency_contact_phone}
          onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
          placeholder="Enter emergency contact phone"
        />
      </div>
      
      <div>
        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Relationship
        </label>
        <select
          value={formData.emergency_contact_relationship}
          onChange={(e) => handleInputChange('emergency_contact_relationship', e.target.value)}
          className={`
            w-full px-3 py-2 rounded-lg border
            ${darkMode 
              ? 'bg-slate-700 border-slate-600 text-white' 
              : 'bg-white border-slate-300 text-slate-900'}
          `}
        >
          <option value="">Select relationship</option>
          <option value="spouse">Spouse</option>
          <option value="parent">Parent</option>
          <option value="child">Child</option>
          <option value="sibling">Sibling</option>
          <option value="friend">Friend</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
  );

  const renderStep5 = () => {
    const selectedType = membershipTypes.find(mt => mt.id === formData.membership_type_id);
    
    return (
      <div className="space-y-4">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          Review & Submit
        </h3>
        
        <div className={`
          p-4 rounded-lg border
          ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}
        `}>
          <h4 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            Membership Summary
          </h4>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Name:</span>
              <span className={darkMode ? 'text-white' : 'text-slate-800'}>
                {formData.first_name} {formData.last_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Email:</span>
              <span className={darkMode ? 'text-white' : 'text-slate-800'}>{formData.email}</span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Membership:</span>
              <span className={darkMode ? 'text-white' : 'text-slate-800'}>{selectedType?.name}</span>
            </div>
            {selectedType && selectedType.amount > 0 && (
              <div className="flex justify-between">
                <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Amount:</span>
                <span className={darkMode ? 'text-white' : 'text-slate-800'}>
                  ${selectedType.amount} {selectedType.currency}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {selectedType && selectedType.amount > 0 && (
          <div className={`
            p-4 rounded-lg border
            ${darkMode ? 'bg-blue-900/20 border-blue-600/30' : 'bg-blue-50 border-blue-200'}
          `}>
            <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
              After submitting, you'll be redirected to complete your membership payment.
            </p>
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Join Club
            </h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Step {currentStep} of 5
            </p>
          </div>
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

        {/* Progress Bar */}
        <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4, 5].map(step => (
              <div
                key={step}
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step <= currentStep
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-400'
                      : 'bg-slate-200 text-slate-500'
                  }
                `}
              >
                {step < currentStep ? <Check size={16} /> : step}
              </div>
            ))}
          </div>
          <div className={`h-2 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
            <div 
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-white" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                Membership Application Submitted!
              </h3>
              <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                Your membership application has been submitted successfully.
              </p>
            </div>
          ) : (
            <>
              {currentStep === 1 && renderStep1()}
              {currentStep === 2 && renderStep2()}
              {currentStep === 3 && renderStep3()}
              {currentStep === 4 && renderStep4()}
              {currentStep === 5 && renderStep5()}

              {error && (
                <div className={`
                  mt-4 p-4 rounded-lg border flex items-start gap-3
                  ${darkMode 
                    ? 'bg-red-900/20 border-red-900/30' 
                    : 'bg-red-50 border-red-200'}
                `}>
                  <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                  <div>
                    <h3 className="text-red-400 font-medium">Error</h3>
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between mt-6">
                <button
                  onClick={handlePrevious}
                  disabled={currentStep === 1}
                  className={`
                    px-4 py-2 rounded-lg font-medium transition-colors
                    ${currentStep === 1
                      ? 'opacity-50 cursor-not-allowed'
                      : darkMode
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                    }
                  `}
                >
                  Previous
                </button>

                {currentStep < 5 ? (
                  <button
                    onClick={handleNext}
                    disabled={!validateStep(currentStep)}
                    className={`
                      px-6 py-2 rounded-lg font-medium transition-colors
                      ${!validateStep(currentStep)
                        ? 'opacity-50 cursor-not-allowed bg-slate-600'
                        : 'bg-blue-600 hover:bg-blue-700'
                      } text-white
                    `}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !validateStep(4)}
                    className={`
                      px-6 py-2 rounded-lg font-medium transition-colors text-white
                      ${loading || !validateStep(4)
                        ? 'opacity-50 cursor-not-allowed bg-slate-600'
                        : 'bg-green-600 hover:bg-green-700'
                      }
                    `}
                  >
                    {loading ? 'Submitting...' : 'Submit Application'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};