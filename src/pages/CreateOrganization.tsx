import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building, Users, Globe, Upload, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

interface OrganizationFormData {
  name: string;
  abbreviation: string;
  logo: string | null;
}

export const CreateOrganization: React.FC = () => {
  const { user, userSubscription, refreshUserClubs } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<OrganizationFormData>({
    name: '',
    abbreviation: '',
    logo: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    // Redirect if no active subscription
    if (!userSubscription || userSubscription.status !== 'active') {
      navigate('/onboarding/subscribe');
    }
  }, [userSubscription, navigate]);

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

  const validateForm = () => {
    const errors: {[key: string]: string} = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Organization name is required';
    } else if (formData.name.length < 3) {
      errors.name = 'Organization name must be at least 3 characters';
    }
    
    if (!formData.abbreviation.trim()) {
      errors.abbreviation = 'Abbreviation is required';
    } else if (formData.abbreviation.length < 2) {
      errors.abbreviation = 'Abbreviation must be at least 2 characters';
    } else if (formData.abbreviation.length > 10) {
      errors.abbreviation = 'Abbreviation must be 10 characters or less';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userSubscription) return;

    if (!validateForm()) {
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Determine organization type and role based on subscription
      let organizationType: string;
      let userRole: string;

      switch (userSubscription.subscription_type) {
        case 'club':
          organizationType = 'club';
          userRole = 'admin';
          break;
        case 'state_association':
          organizationType = 'state_association';
          userRole = 'state_admin';
          break;
        case 'national_association':
          organizationType = 'national_association';
          userRole = 'national_admin';
          break;
        default:
          throw new Error('Invalid subscription type');
      }

      // Check if abbreviation is already taken
      const { data: existingClub, error: checkError } = await supabase
        .from('clubs')
        .select('id')
        .eq('abbreviation', formData.abbreviation.toUpperCase())
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingClub) {
        setValidationErrors({ abbreviation: 'This abbreviation is already taken' });
        return;
      }
      // Create the organization (club)
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .insert({
          name: formData.name,
          abbreviation: formData.abbreviation.toUpperCase(),
          logo: formData.logo,
          organization_type: organizationType,
          created_by_user_id: user.id
        })
        .select()
        .single();

      if (clubError) throw clubError;

      // Add user as admin of the new organization
      const { error: userClubError } = await supabase
        .from('user_clubs')
        .insert({
          user_id: user.id,
          club_id: clubData.id,
          role: userRole
        });

      if (userClubError) throw userClubError;

      // Create default membership types for clubs
      if (organizationType === 'club') {
        const defaultMembershipTypes = [
          {
            club_id: clubData.id,
            name: 'Full Member',
            description: 'Full club membership with all benefits',
            amount: 100,
            currency: 'AUD',
            renewal_period: 'annual',
            is_active: true
          },
          {
            club_id: clubData.id,
            name: 'Associate Member',
            description: 'Associate membership with limited benefits',
            amount: 50,
            currency: 'AUD',
            renewal_period: 'annual',
            is_active: true
          }
        ];

        const { error: membershipTypesError } = await supabase
          .from('membership_types')
          .insert(defaultMembershipTypes);

        if (membershipTypesError) {
          console.warn('Failed to create default membership types:', membershipTypesError);
        }
      }

      // Create default finance settings
      const { error: financeSettingsError } = await supabase
        .from('club_finance_settings')
        .insert({
          club_id: clubData.id,
          invoice_title: 'INVOICE',
          organization_number: '',
          invoice_prefix: 'INV-',
          deposit_prefix: 'DEP-',
          expense_prefix: 'EXP-',
          invoice_next_number: 1,
          deposit_next_number: 1,
          expense_next_number: 1,
          footer_information: `${formData.name}\nThank you for your business.`,
          payment_information: 'Please pay within 30 days of invoice date.'
        });

      if (financeSettingsError) {
        console.warn('Failed to create default finance settings:', financeSettingsError);
      }

      // Create default tax rate (GST for Australian organizations)
      const { error: taxRateError } = await supabase
        .from('tax_rates')
        .insert({
          club_id: clubData.id,
          name: 'GST',
          rate: 0.10,
          currency: 'AUD',
          is_default: true,
          is_active: true
        });

      if (taxRateError) {
        console.warn('Failed to create default tax rate:', taxRateError);
      }

      setSuccess(`${organizationType === 'club' ? 'Club' : 'Organization'} created successfully!`);

      // Refresh user clubs to include the new organization
      await refreshUserClubs();

      // Small delay to show success message
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err: any) {
      console.error('Error creating organization:', err);
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const getOrganizationDetails = () => {
    if (!userSubscription) return null;

    switch (userSubscription.subscription_type) {
      case 'club':
        return {
          icon: <Building size={32} className="text-blue-400" />,
          title: 'Create Your Club',
          description: 'Set up your yacht club to start managing races and members',
          placeholder: 'e.g., Lake Macquarie Radio Yacht Club'
        };
      case 'state_association':
        return {
          icon: <Users size={32} className="text-purple-400" />,
          title: 'Create Your State Association',
          description: 'Set up your state association to coordinate clubs and create state-wide events',
          placeholder: 'e.g., NSW Radio Yachting Association'
        };
      case 'national_association':
        return {
          icon: <Globe size={32} className="text-green-400" />,
          title: 'Create Your National Association',
          description: 'Set up your national association to coordinate state bodies and create national events',
          placeholder: 'e.g., Radio Yachting Australia'
        };
      default:
        return null;
    }
  };

  const orgDetails = getOrganizationDetails();

  if (!userSubscription || !orgDetails) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <Logo className="w-16 h-16 relative z-10 text-blue-400" />
            </div>
            <div className="flex justify-center mb-4">
              {orgDetails.icon}
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{orgDetails.title}</h1>
            <p className="text-slate-400">{orgDetails.description}</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                <div>
                  <h3 className="text-red-400 font-medium">Error</h3>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="text-green-400 mt-0.5" size={18} />
                <div>
                  <h3 className="text-green-400 font-medium">Success</h3>
                  <p className="text-green-300 text-sm">{success}</p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                Organization Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder={orgDetails.placeholder}
              />
              {validationErrors.name && (
                <p className="text-red-400 text-sm mt-1">{validationErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="abbreviation" className="block text-sm font-medium text-slate-300 mb-2">
                Abbreviation
              </label>
              <input
                id="abbreviation"
                type="text"
                required
                value={formData.abbreviation}
                onChange={(e) => setFormData(prev => ({ ...prev, abbreviation: e.target.value }))}
                className="w-full px-3 py-3 bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                placeholder="e.g., LMRYC"
              />
              {validationErrors.abbreviation && (
                <p className="text-red-400 text-sm mt-1">{validationErrors.abbreviation}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Logo (Optional)
              </label>
              <div className="flex items-center gap-4">
                {formData.logo && (
                  <img 
                    src={formData.logo} 
                    alt="Organization logo" 
                    className="w-16 h-16 object-contain rounded-lg"
                  />
                )}
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors bg-slate-700/50 text-slate-200 hover:bg-slate-600/50 border border-slate-600/50">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <span>Create Organization</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};