import React, { useState, useEffect } from 'react';
import { X, Search, MapPin, Users, Sailboat, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface Club {
  id: string;
  name: string;
  abbreviation: string;
  logo: string | null;
  state_association_id: string | null;
  state_associations: {
    name: string;
    abbreviation: string;
  } | null;
  location?: string;
  member_count?: number;
  yacht_classes?: string[];
}

interface JoinAnotherClubModalProps {
  darkMode: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const JoinAnotherClubModal: React.FC<JoinAnotherClubModalProps> = ({
  darkMode,
  onClose,
  onSuccess
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<'search' | 'preview' | 'applying'>('search');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [filteredClubs, setFilteredClubs] = useState<Club[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMemberships, setCurrentMemberships] = useState<string[]>([]);
  const [membershipTypes, setMembershipTypes] = useState<any[]>([]);
  const [selectedMembershipType, setSelectedMembershipType] = useState<string>('');
  const [feeBreakdown, setFeeBreakdown] = useState<{
    clubFee: number;
    stateFee: number;
    nationalFee: number;
    total: number;
    relationshipType: string;
  } | null>(null);

  useEffect(() => {
    fetchClubs();
    fetchCurrentMemberships();
  }, []);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredClubs(clubs);
    } else {
      const filtered = clubs.filter(club =>
        club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        club.abbreviation?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredClubs(filtered);
    }
  }, [searchTerm, clubs]);

  const fetchClubs = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select(`
          id,
          name,
          abbreviation,
          logo,
          state_association_id,
          state_associations:state_association_id (
            name,
            abbreviation
          )
        `)
        .order('name');

      if (error) throw error;
      setClubs(data || []);
      setFilteredClubs(data || []);
    } catch (err) {
      console.error('Error fetching clubs:', err);
      addNotification('error', 'Failed to load clubs');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentMemberships = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('club_memberships')
        .select('club_id')
        .eq('member_id', user.id)
        .eq('status', 'active');

      if (error) throw error;
      setCurrentMemberships(data?.map(m => m.club_id) || []);
    } catch (err) {
      console.error('Error fetching memberships:', err);
    }
  };

  const handleSelectClub = async (club: Club) => {
    setSelectedClub(club);
    setStep('preview');
    await fetchMembershipTypesAndFees(club.id);
  };

  const fetchMembershipTypesAndFees = async (clubId: string) => {
    try {
      // Fetch membership types for this club
      const { data: types, error: typesError } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('amount');

      if (typesError) throw typesError;
      setMembershipTypes(types || []);

      if (types && types.length > 0) {
        setSelectedMembershipType(types[0].id);
        await calculateFees(clubId, types[0].id);
      }
    } catch (err) {
      console.error('Error fetching membership types:', err);
    }
  };

  const calculateFees = async (clubId: string, membershipTypeId: string) => {
    if (!user) return;

    try {
      // Check if this would be an associate membership
      const { data: shouldPayFees } = await supabase
        .rpc('should_pay_association_fees', {
          p_member_id: user.id,
          p_club_id: clubId,
          p_relationship_type: 'associate'
        });

      // Get club fee from membership type
      const membershipType = membershipTypes.find(t => t.id === membershipTypeId);
      const clubFee = parseFloat(membershipType?.amount || '0');

      let stateFee = 0;
      let nationalFee = 0;

      // Only fetch association fees if member should pay them
      if (shouldPayFees) {
        // Fetch state fee
        const { data: club } = await supabase
          .from('clubs')
          .select('state_association_id')
          .eq('id', clubId)
          .single();

        if (club?.state_association_id) {
          const currentYear = new Date().getFullYear();

          const { data: stateFeeData } = await supabase
            .from('state_association_club_fees')
            .select('club_fee_amount')
            .eq('state_association_id', club.state_association_id)
            .lte('effective_from', new Date().toISOString())
            .order('effective_from', { ascending: false })
            .limit(1)
            .single();

          stateFee = parseFloat(stateFeeData?.club_fee_amount || '0');

          // Fetch national fee
          const { data: nationalFeeData } = await supabase
            .from('national_association_state_fees')
            .select('state_fee_amount')
            .eq('state_association_id', club.state_association_id)
            .lte('effective_from', new Date().toISOString())
            .order('effective_from', { ascending: false })
            .limit(1)
            .single();

          nationalFee = parseFloat(nationalFeeData?.state_fee_amount || '0');
        }
      }

      setFeeBreakdown({
        clubFee,
        stateFee,
        nationalFee,
        total: clubFee + stateFee + nationalFee,
        relationshipType: currentMemberships.length > 0 ? 'associate' : 'primary'
      });
    } catch (err) {
      console.error('Error calculating fees:', err);
    }
  };

  const handleApply = async () => {
    if (!user || !selectedClub || !selectedMembershipType) return;

    setStep('applying');

    try {
      const { data: application, error } = await supabase
        .from('membership_applications')
        .insert({
          club_id: selectedClub.id,
          user_id: user.id,
          membership_type_id: selectedMembershipType,
          status: 'pending',
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          email: user.email,
          application_type: 'additional_club'
        })
        .select()
        .single();

      if (error) throw error;

      addNotification('success', `Application submitted to ${selectedClub.name}`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Error submitting application:', err);
      addNotification('error', err.message || 'Failed to submit application');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white'} rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex justify-between items-center`}>
          <div>
            <h2 className="text-xl font-semibold">Join Another Club</h2>
            {step === 'search' && (
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                Search for clubs and submit an application
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'search' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                <input
                  type="text"
                  placeholder="Search clubs by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              {/* Club List */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredClubs.map((club) => {
                    const alreadyMember = currentMemberships.includes(club.id);
                    return (
                      <div
                        key={club.id}
                        className={`p-4 rounded-lg border ${
                          alreadyMember
                            ? darkMode
                              ? 'border-gray-700 bg-gray-800 opacity-50'
                              : 'border-gray-200 bg-gray-50 opacity-50'
                            : darkMode
                            ? 'border-gray-700 bg-gray-750 hover:border-blue-500 cursor-pointer'
                            : 'border-gray-200 bg-white hover:border-blue-500 cursor-pointer'
                        } transition-colors`}
                        onClick={() => !alreadyMember && handleSelectClub(club)}
                      >
                        <div className="flex items-start space-x-3">
                          {club.logo ? (
                            <img
                              src={club.logo}
                              alt={club.name}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                              <Sailboat className="w-6 h-6" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold truncate">{club.name}</h3>
                            {club.abbreviation && (
                              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {club.abbreviation}
                              </p>
                            )}
                            {club.state_associations && (
                              <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                                <MapPin className="w-3 h-3 inline mr-1" />
                                {club.state_associations.name}
                              </p>
                            )}
                            {alreadyMember && (
                              <div className="flex items-center mt-2 text-green-500 text-sm">
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Already a member
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && selectedClub && (
            <div className="space-y-6">
              {/* Club Info */}
              <div className={`p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-start space-x-4">
                  {selectedClub.logo ? (
                    <img
                      src={selectedClub.logo}
                      alt={selectedClub.name}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center`}>
                      <Sailboat className="w-8 h-8" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{selectedClub.name}</h3>
                    {selectedClub.state_associations && (
                      <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {selectedClub.state_associations.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Membership Type Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Membership Type
                </label>
                <select
                  value={selectedMembershipType}
                  onChange={(e) => {
                    setSelectedMembershipType(e.target.value);
                    calculateFees(selectedClub.id, e.target.value);
                  }}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  {membershipTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} - ${parseFloat(type.amount).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fee Breakdown */}
              {feeBreakdown && (
                <div className={`p-4 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'}`}>
                  <h4 className="font-semibold mb-3">Fee Breakdown</h4>

                  {currentMemberships.length > 0 && (
                    <div className={`mb-3 p-3 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-600 dark:text-blue-400">Associate Membership</p>
                          <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                            Since you're already a member of another club, you'll join as an associate member.
                            {feeBreakdown.stateFee === 0 && ' State and national fees are already covered by your primary membership.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Club Fee</span>
                      <span className="font-medium">${feeBreakdown.clubFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>State Association Fee</span>
                      <span className="font-medium">
                        {feeBreakdown.stateFee > 0 ? `$${feeBreakdown.stateFee.toFixed(2)}` : 'Included'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>National Association Fee</span>
                      <span className="font-medium">
                        {feeBreakdown.nationalFee > 0 ? `$${feeBreakdown.nationalFee.toFixed(2)}` : 'Included'}
                      </span>
                    </div>
                    <div className={`pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex justify-between text-lg font-bold`}>
                      <span>Total</span>
                      <span className="text-blue-500">${feeBreakdown.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setStep('search')}
                  className={`flex-1 px-4 py-2 rounded-lg border ${
                    darkMode
                      ? 'border-gray-600 hover:bg-gray-700'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Submit Application
                </button>
              </div>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
              <p className="text-lg font-medium">Submitting your application...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
