import React, { useState, useEffect } from 'react';
import { X, Building, Users, CheckCircle, AlertTriangle, Search, Shield, DollarSign, ArrowRight, Info } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface AdminAddToClubModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberIds: string[];
  availableClubs: Array<{ id: string; name: string; abbreviation?: string }>;
  darkMode?: boolean;
  onSuccess?: () => void;
}

interface MemberClubInfo {
  memberId: string;
  memberName: string;
  currentClubs: Array<{ club_id: string; club_name: string }>;
  alreadyInTarget: boolean;
}

interface MembershipType {
  id: string;
  name: string;
  amount: number | null;
  is_active: boolean;
}

export const AdminAddToClubModal: React.FC<AdminAddToClubModalProps> = ({
  isOpen,
  onClose,
  memberIds,
  availableClubs,
  darkMode = true,
  onSuccess
}) => {
  const { addNotification } = useNotifications();
  const [step, setStep] = useState<'select-club' | 'review' | 'processing'>('select-club');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [selectedMembershipTypeId, setSelectedMembershipTypeId] = useState('');
  const [setFinancial, setSetFinancial] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [memberClubInfo, setMemberClubInfo] = useState<MemberClubInfo[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [results, setResults] = useState<{ added: number; skipped: number; errors: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('select-club');
      setSelectedClubId('');
      setSearchTerm('');
      setSelectedMembershipTypeId('');
      setSetFinancial(false);
      setResults(null);
      setMemberClubInfo([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedClubId) {
      fetchMembershipTypes();
      fetchMemberClubInfo();
    }
  }, [selectedClubId]);

  const fetchMembershipTypes = async () => {
    const { data } = await supabase
      .from('membership_types')
      .select('id, name, amount, is_active')
      .eq('club_id', selectedClubId)
      .eq('is_active', true)
      .order('amount', { ascending: true });
    setMembershipTypes(data || []);
  };

  const fetchMemberClubInfo = async () => {
    setLoadingInfo(true);
    try {
      const infos: MemberClubInfo[] = [];
      for (const memberId of memberIds) {
        const { data: member } = await supabase
          .from('members')
          .select('id, first_name, last_name, club_id, clubs:club_id(name)')
          .eq('id', memberId)
          .maybeSingle();

        if (!member) continue;

        let currentClubs: Array<{ club_id: string; club_name: string }> = [];
        if (member.club_id) {
          currentClubs.push({
            club_id: member.club_id,
            club_name: (member.clubs as any)?.name || 'Unknown'
          });
        }

        if (member.id) {
          const { data: otherMembers } = await supabase
            .from('members')
            .select('club_id, clubs:club_id(name)')
            .eq('email', (await supabase.from('members').select('email').eq('id', memberId).maybeSingle()).data?.email || '')
            .neq('id', memberId);

          if (otherMembers) {
            for (const om of otherMembers) {
              if (om.club_id && !currentClubs.find(c => c.club_id === om.club_id)) {
                currentClubs.push({
                  club_id: om.club_id,
                  club_name: (om.clubs as any)?.name || 'Unknown'
                });
              }
            }
          }
        }

        infos.push({
          memberId: member.id,
          memberName: `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Unknown',
          currentClubs,
          alreadyInTarget: currentClubs.some(c => c.club_id === selectedClubId)
        });
      }
      setMemberClubInfo(infos);
    } catch (err) {
      console.error('Error fetching member info:', err);
    }
    setLoadingInfo(false);
  };

  const eligibleMembers = memberClubInfo.filter(m => !m.alreadyInTarget);
  const skippedMembers = memberClubInfo.filter(m => m.alreadyInTarget);
  const membersWithExistingClub = eligibleMembers.filter(m => m.currentClubs.length > 0);
  const selectedClub = availableClubs.find(c => c.id === selectedClubId);
  const selectedType = membershipTypes.find(t => t.id === selectedMembershipTypeId);

  const filteredClubs = availableClubs.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.abbreviation || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddToClub = async () => {
    if (!selectedClubId || eligibleMembers.length === 0) return;
    setProcessing(true);
    setStep('processing');

    let added = 0;
    let skipped = skippedMembers.length;
    let errors = 0;

    for (const memberInfo of eligibleMembers) {
      try {
        const { data: sourceMember } = await supabase
          .from('members')
          .select('*')
          .eq('id', memberInfo.memberId)
          .maybeSingle();

        if (!sourceMember) {
          errors++;
          continue;
        }

        const isAlreadyMemberOfAnotherClub = memberInfo.currentClubs.length > 0;

        const { data: existingInTarget } = await supabase
          .from('members')
          .select('id')
          .eq('email', sourceMember.email)
          .eq('club_id', selectedClubId)
          .maybeSingle();

        if (existingInTarget) {
          skipped++;
          continue;
        }

        const newMemberData: Record<string, any> = {
          first_name: sourceMember.first_name,
          last_name: sourceMember.last_name,
          email: sourceMember.email,
          phone: sourceMember.phone,
          street: sourceMember.street,
          city: sourceMember.city,
          state: sourceMember.state,
          postcode: sourceMember.postcode,
          country: sourceMember.country,
          country_code: sourceMember.country_code,
          club_id: selectedClubId,
          club: selectedClub?.name || '',
          membership_status: 'active',
          is_financial: setFinancial,
          date_joined: new Date().toISOString(),
          user_id: sourceMember.user_id,
          avatar_url: sourceMember.avatar_url,
          emergency_contact_name: sourceMember.emergency_contact_name,
          emergency_contact_phone: sourceMember.emergency_contact_phone,
          emergency_contact_relationship: sourceMember.emergency_contact_relationship,
        };

        if (selectedType) {
          newMemberData.membership_level = selectedType.name;
        }

        const { data: newMember, error: insertError } = await supabase
          .from('members')
          .insert(newMemberData)
          .select('id')
          .single();

        if (insertError) throw insertError;

        if (sourceMember.user_id) {
          const { data: existingUserClub } = await supabase
            .from('user_clubs')
            .select('id')
            .eq('user_id', sourceMember.user_id)
            .eq('club_id', selectedClubId)
            .maybeSingle();

          if (!existingUserClub) {
            await supabase
              .from('user_clubs')
              .insert({
                user_id: sourceMember.user_id,
                club_id: selectedClubId,
                role: 'member'
              });
          }
        }

        added++;
      } catch (err) {
        console.error(`Error adding member ${memberInfo.memberName}:`, err);
        errors++;
      }
    }

    setResults({ added, skipped, errors });
    setProcessing(false);

    if (added > 0) {
      addNotification('success', `Added ${added} member${added !== 1 ? 's' : ''} to ${selectedClub?.name}`);
      onSuccess?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Add to Club</h2>
                <p className="text-blue-100 text-sm">
                  {memberIds.length === 1
                    ? 'Add this member to an additional club'
                    : `Add ${memberIds.length} members to an additional club`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {step === 'select-club' && (
            <div className="space-y-5">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Select Target Club
                </label>
                <div className="relative mb-3">
                  <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type="text"
                    placeholder="Search clubs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-lg ${
                      darkMode ? 'bg-slate-800 text-white border-slate-700 placeholder-slate-500' : 'bg-slate-50 text-slate-900 border-slate-300 placeholder-slate-400'
                    } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {filteredClubs.map(club => (
                    <button
                      key={club.id}
                      onClick={() => setSelectedClubId(club.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                        selectedClubId === club.id
                          ? 'bg-blue-600/20 border-blue-500/50 ring-1 ring-blue-500/30'
                          : darkMode
                            ? 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      } border`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        selectedClubId === club.id ? 'bg-blue-500' : darkMode ? 'bg-slate-700' : 'bg-slate-200'
                      }`}>
                        <Building size={14} className={selectedClubId === club.id ? 'text-white' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {club.name}
                        </p>
                        {club.abbreviation && (
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{club.abbreviation}</p>
                        )}
                      </div>
                      {selectedClubId === club.id && <CheckCircle size={18} className="text-blue-400 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {selectedClubId && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Membership Type
                      </label>
                      <select
                        value={selectedMembershipTypeId}
                        onChange={(e) => setSelectedMembershipTypeId(e.target.value)}
                        className={`w-full px-3 py-2.5 rounded-lg ${
                          darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-slate-50 text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        <option value="">Select type...</option>
                        {membershipTypes.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.amount ? ` ($${t.amount})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Financial Status
                      </label>
                      <select
                        value={setFinancial ? 'financial' : 'unfinancial'}
                        onChange={(e) => setSetFinancial(e.target.value === 'financial')}
                        className={`w-full px-3 py-2.5 rounded-lg ${
                          darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-slate-50 text-slate-900 border-slate-300'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      >
                        <option value="unfinancial">Unfinancial</option>
                        <option value="financial">Financial</option>
                      </select>
                    </div>
                  </div>

                  {loadingInfo ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                      <span className={`ml-3 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Checking existing memberships...
                      </span>
                    </div>
                  ) : (
                    <>
                      {membersWithExistingClub.length > 0 && (
                        <div className={`p-4 rounded-lg ${darkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
                          <div className="flex items-start gap-3">
                            <Info size={18} className="text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                                Multi-Club Membership
                              </p>
                              <p className={`text-xs mt-1 ${darkMode ? 'text-blue-400/70' : 'text-blue-600'}`}>
                                {membersWithExistingClub.length === 1
                                  ? 'This member already belongs to a club. They will be added as an additional membership -- association fees will not be duplicated.'
                                  : `${membersWithExistingClub.length} members already belong to other clubs. They will be added as additional memberships -- association fees will not be duplicated.`}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {skippedMembers.length > 0 && (
                        <div className={`p-4 rounded-lg ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                          <div className="flex items-start gap-3">
                            <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className={`text-sm font-medium ${darkMode ? 'text-amber-300' : 'text-amber-800'}`}>
                                {skippedMembers.length} already {skippedMembers.length === 1 ? 'is a member' : 'are members'} of {selectedClub?.name}
                              </p>
                              <div className="mt-2 space-y-1">
                                {skippedMembers.slice(0, 5).map(m => (
                                  <p key={m.memberId} className={`text-xs ${darkMode ? 'text-amber-400/60' : 'text-amber-600'}`}>
                                    {m.memberName}
                                  </p>
                                ))}
                                {skippedMembers.length > 5 && (
                                  <p className={`text-xs ${darkMode ? 'text-amber-400/60' : 'text-amber-600'}`}>
                                    ...and {skippedMembers.length - 5} more
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8">
              {processing ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Adding members to {selectedClub?.name}...
                  </p>
                </div>
              ) : results && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle size={32} className="text-green-400" />
                    </div>
                  </div>
                  <h3 className={`text-lg font-semibold text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Complete
                  </h3>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50'}`}>
                      <p className="text-2xl font-bold text-green-400">{results.added}</p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-green-400/70' : 'text-green-600'}`}>Added</p>
                    </div>
                    <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50'}`}>
                      <p className="text-2xl font-bold text-amber-400">{results.skipped}</p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-amber-400/70' : 'text-amber-600'}`}>Skipped</p>
                    </div>
                    <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50'}`}>
                      <p className="text-2xl font-bold text-red-400">{results.errors}</p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-red-400/70' : 'text-red-600'}`}>Errors</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`p-6 border-t ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
          {step === 'select-club' && (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  darkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAddToClub}
                disabled={!selectedClubId || eligibleMembers.length === 0 || loadingInfo}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <ArrowRight size={16} />
                {eligibleMembers.length === 0 && selectedClubId
                  ? 'All members already in this club'
                  : `Add ${eligibleMembers.length} Member${eligibleMembers.length !== 1 ? 's' : ''} to Club`}
              </button>
            </div>
          )}
          {step === 'processing' && !processing && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
