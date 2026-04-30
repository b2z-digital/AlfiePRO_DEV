import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Users, UserPlus, UserCog, CircleAlert as AlertCircle, Check, CircleCheck as CheckCircle, SquarePen as Edit2, Search, ChevronRight, Sailboat, ArrowUpDown, Upload, FileUp, Trash2, ClipboardPaste, ArrowRight, Zap, TriangleAlert as AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import { Skipper } from '../types';
import { getStoredMembers, isValidUUID, updateMember } from '../utils/storage';
import { Member, MemberBoat, BoatType } from '../types/member';
import { RaceEvent } from '../types/race';
import { boatTypeColors, defaultColorScheme } from '../constants/colors';
import { ConfirmationModal } from './ConfirmationModal';
import { supabase } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User } from '../types/auth';
import { getCountryFlag, getCountryName, SAILING_NATIONS } from '../utils/countryFlags';
import { useNotifications } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { bulkAddRaceOfficerContacts } from '../utils/raceOfficerContactsStorage';

interface SkipperModalProps {
  isOpen: boolean;
  onClose: () => void;
  skippers: Skipper[];
  onUpdateSkippers: (skippers: Skipper[]) => void;
  darkMode: boolean;
  skipperHasResults: (skipperIndex: number) => boolean;
  currentEvent?: RaceEvent;
}

interface MemberWithValidation extends Member {
  boats?: (MemberBoat & { isValid?: boolean })[];
}

interface EditableBoatData {
  memberId: string;
  boatId: string;
  sailNumber: string;
  hull: string;
  club: string;
}

export const SkipperModal: React.FC<SkipperModalProps> = ({
  isOpen,
  onClose,
  skippers,
  onUpdateSkippers,
  darkMode,
  skipperHasResults,
  currentEvent
}) => {
  const { addNotification } = useNotifications();
  const { isRaceOfficer } = useAuth();
  const [saveToContacts, setSaveToContacts] = useState(false);
  const [view, setView] = useState<'initial' | 'members' | 'manual' | 'import' | 'edit'>('initial');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMappings, setImportMappings] = useState<Record<string, string>>({});
  const [importAutoDetected, setImportAutoDetected] = useState<Set<string>>(new Set());
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'importing' | 'conflicts' | 'complete'>('upload');
  const [allParsedSkippers, setAllParsedSkippers] = useState<Skipper[]>([]);
  const [conflictGroups, setConflictGroups] = useState<{ sailNo: string; skippers: { index: number; skipper: Skipper }[] }[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [nameDisplayFormat, setNameDisplayFormat] = useState<'first_last' | 'last_first'>('first_last');
  const [members, setMembers] = useState<MemberWithValidation[]>([]);
  const [memberAvatars, setMemberAvatars] = useState<{[key: string]: string}>({});
  const [selectedMemberBoats, setSelectedMemberBoats] = useState<Record<string, MemberBoat>>({});
  const [manualSkipper, setManualSkipper] = useState({
    name: '',
    sailNo: '',
    hull: '',
    club: '',
    country: 'Australia',
    countryCode: 'AU',
    category: '',
    clubState: '',
    boatModel: currentEvent?.raceClass || '',
    startHcap: 0,
    nationalRanking: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipperToRemove, setSkipperToRemove] = useState<number | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [selectedSkippers, setSelectedSkippers] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [editingBoat, setEditingBoat] = useState<EditableBoatData | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMemberBoat, setEditingMemberBoat] = useState<EditableBoatData | null>(null);
  const [attendingMembers, setAttendingMembers] = useState<string[]>([]);
  const [editingSkipperIndex, setEditingSkipperIndex] = useState<number | null>(null);
  const [editMemberBoats, setEditMemberBoats] = useState<MemberBoat[]>([]);
  const [showAddBoatForEdit, setShowAddBoatForEdit] = useState(false);
  const [editNewBoatData, setEditNewBoatData] = useState({ sailNumber: '', hull: '' });
  const [showAddBoatModal, setShowAddBoatModal] = useState<Member | null>(null);
  const [newBoatData, setNewBoatData] = useState({ sailNumber: '', hull: '' });
  const [boatToDelete, setBoatToDelete] = useState<{ member: Member; boat: MemberBoat } | null>(null);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showOtherClubs, setShowOtherClubs] = useState(false);
  const [otherClubMembers, setOtherClubMembers] = useState<MemberWithValidation[]>([]);
  const [otherClubAvatars, setOtherClubAvatars] = useState<{[key: string]: string}>({});
  const [loadingOtherClubs, setLoadingOtherClubs] = useState(false);
  const navigate = useNavigate();

  // Reset view to initial when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView('initial');
      setImportFile(null);
      setImportData([]);
      setImportHeaders([]);
      setImportMappings({});
      setImportAutoDetected(new Set());
      setImportStep('upload');
      setPasteText('');
      setError(null);
      setEditingSkipperIndex(null);
      setShowOtherClubs(false);
      setShowAllMembers(false);
      setOtherClubMembers([]);
      setOtherClubAvatars({});
    }
  }, [isOpen]);

  // Clear error when view changes
  useEffect(() => {
    setError(null);
  }, [view]);

  useEffect(() => {
    const fetchMembers = async () => {
      if (isOpen && currentEvent?.raceClass && view === 'members') {
        try {
          setLoading(true);
          setError(null);
          
          // For interclub events, we need to fetch members from both clubs
          if (currentEvent.isInterclub && currentEvent.otherClubId) {
            // Validate club IDs
            const hostClubId = currentEvent.clubId;
            const otherClubId = currentEvent.otherClubId;
            
            if (!hostClubId || !isValidUUID(hostClubId)) {
              throw new Error('Invalid host club ID');
            }
            
            if (!isValidUUID(otherClubId)) {
              throw new Error('Invalid other club ID');
            }
            
            // Fetch members from host club
            const { data: hostClubMembers, error: hostClubError } = await supabase
              .from('members')
              .select('*, boats:member_boats(*)')
              .eq('club_id', hostClubId);
            
            if (hostClubError) throw hostClubError;
            
            // Fetch members from other club
            const { data: otherClubMembers, error: otherClubError } = await supabase
              .from('members')
              .select(`
                *,
                boats:member_boats(*)
              `)
              .eq('club_id', otherClubId);
            
            if (otherClubError) throw otherClubError;
            
            // Combine members from both clubs
            const allMembers = [...(hostClubMembers || []), ...(otherClubMembers || [])];
            
            // Filter members with the correct boat type and validate data completeness
            const validatedMembers = allMembers.map(member => {
              const validatedMember = { ...member };
              if (member.boats) {
                validatedMember.boats = member.boats.map(boat => {
                  // Check if this boat matches the event class and has all required data
                  const isValid = 
                    boat.boat_type === currentEvent.raceClass && 
                    !!boat.sail_number && 
                    !!boat.hull && 
                    !!member.club;
                  
                  return { ...boat, isValid };
                });
              }
              return validatedMember;
            });
            
            setMembers(validatedMembers);

            // Build avatar map using member.id as key, prioritizing member's own avatar_url
            const avatarMap: {[key: string]: string} = {};

            // First, add avatars directly from members table
            validatedMembers.forEach(member => {
              if ((member as any).avatar_url) {
                avatarMap[member.id] = (member as any).avatar_url;
              }
            });

            // Then fetch from profiles for members with user_id but no avatar
            const memberUserIdsWithoutAvatar = validatedMembers
              .filter(member => member.user_id && !avatarMap[member.id])
              .map(member => ({ id: member.id, user_id: member.user_id }));

            if (memberUserIdsWithoutAvatar.length > 0) {
              const userIds = memberUserIdsWithoutAvatar.map(m => m.user_id);
              const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, avatar_url')
                .in('id', userIds);

              if (!error && profiles) {
                profiles.forEach(profile => {
                  if (profile.id && profile.avatar_url) {
                    // Find the member with this user_id and set avatar by member.id
                    const member = memberUserIdsWithoutAvatar.find(m => m.user_id === profile.id);
                    if (member) {
                      avatarMap[member.id] = profile.avatar_url;
                    }
                  }
                });
              }
            }

            setMemberAvatars(avatarMap);
          } else {
            // Regular event - fetch members from current club only
            const storedMembers = await getStoredMembers();
            
            if (!Array.isArray(storedMembers)) {
              throw new Error('Invalid members data received');
            }

            // Validate data completeness for each member and their boats
            const validatedMembers = storedMembers.map(member => {
              const validatedMember = { ...member };
              if (member.boats) {
                validatedMember.boats = member.boats.map(boat => {
                  // Check if this boat matches the event class and has all required data
                  const isValid = 
                    boat.boat_type === currentEvent.raceClass && 
                    !!boat.sail_number && 
                    !!boat.hull && 
                    !!member.club;
                  
                  return { ...boat, isValid };
                });
              }
              return validatedMember;
            });
            
            setMembers(validatedMembers);

            // Build avatar map using member.id as key, prioritizing member's own avatar_url
            const avatarMap: {[key: string]: string} = {};

            // First, add avatars directly from members table
            validatedMembers.forEach(member => {
              if ((member as any).avatar_url) {
                avatarMap[member.id] = (member as any).avatar_url;
              }
            });

            // Then fetch from profiles for members with user_id but no avatar
            const memberUserIdsWithoutAvatar = validatedMembers
              .filter(member => member.user_id && !avatarMap[member.id])
              .map(member => ({ id: member.id, user_id: member.user_id }));

            if (memberUserIdsWithoutAvatar.length > 0) {
              const userIds = memberUserIdsWithoutAvatar.map(m => m.user_id);
              const { data: profiles, error } = await supabase
                .from('profiles')
                .select('id, avatar_url')
                .in('id', userIds);

              if (!error && profiles) {
                profiles.forEach(profile => {
                  if (profile.id && profile.avatar_url) {
                    // Find the member with this user_id and set avatar by member.id
                    const member = memberUserIdsWithoutAvatar.find(m => m.user_id === profile.id);
                    if (member) {
                      avatarMap[member.id] = profile.avatar_url;
                    }
                  }
                });
              }
            }

            setMemberAvatars(avatarMap);
          }
        } catch (err) {
          console.error('Error fetching members:', err);
          setError(err instanceof Error ? err.message : 'Failed to load members');
        } finally {
          setLoading(false);
        }
      }
    };

    fetchMembers();

    if (isOpen && view !== 'edit') {
      setManualSkipper({
        name: '',
        sailNo: '',
        hull: '',
        club: '',
        country: 'Australia',
        countryCode: 'AU',
        category: '',
        clubState: '',
        boatModel: currentEvent?.raceClass || '',
        startHcap: 0
      });
      setSelectedMemberBoats({});
      setEditingBoat(null);
      setUpdateSuccess(null);
      setSearchTerm('');

      // Default to members view if there are no skippers yet (only on initial open)
      if (skippers.length === 0 && view === 'initial') {
        setView('members');
      }
    }
  }, [isOpen, currentEvent?.raceClass, view, skippers.length, currentEvent?.isInterclub, currentEvent?.otherClubId, currentEvent?.clubId]);

  useEffect(() => {
    const fetchOtherClubMembers = async () => {
      if (!showOtherClubs || !currentEvent?.clubId || !currentEvent?.raceClass) return;
      if (otherClubMembers.length > 0) return;

      setLoadingOtherClubs(true);
      try {
        const clubIds = [currentEvent.clubId];
        if (currentEvent.otherClubId) clubIds.push(currentEvent.otherClubId);

        const { data: allMembers, error: fetchError } = await supabase
          .from('members')
          .select('*, boats:member_boats(*)')
          .not('club_id', 'in', `(${clubIds.join(',')})`);

        if (fetchError) throw fetchError;

        const validated = (allMembers || []).map(member => {
          const m = { ...member };
          if (member.boats) {
            m.boats = member.boats.map((boat: any) => ({
              ...boat,
              isValid: boat.boat_type === currentEvent.raceClass && !!boat.sail_number && !!boat.hull && !!member.club
            }));
          }
          return m;
        });

        setOtherClubMembers(validated);

        const avatarMap: {[key: string]: string} = {};
        validated.forEach((member: any) => {
          if (member.avatar_url) avatarMap[member.id] = member.avatar_url;
        });

        const needProfile = validated
          .filter((m: any) => m.user_id && !avatarMap[m.id])
          .map((m: any) => ({ id: m.id, user_id: m.user_id }));

        if (needProfile.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, avatar_url')
            .in('id', needProfile.map(m => m.user_id));

          if (profiles) {
            profiles.forEach(p => {
              if (p.avatar_url) {
                const mem = needProfile.find(m => m.user_id === p.id);
                if (mem) avatarMap[mem.id] = p.avatar_url;
              }
            });
          }
        }

        setOtherClubAvatars(avatarMap);
      } catch (err) {
        console.error('Error fetching other club members:', err);
      } finally {
        setLoadingOtherClubs(false);
      }
    };

    fetchOtherClubMembers();
  }, [showOtherClubs, currentEvent?.clubId, currentEvent?.raceClass, currentEvent?.otherClubId, otherClubMembers.length]);

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!isOpen || !currentEvent?.id) return;

      try {
        const eventId = currentEvent.id;
        const dbEventId = (() => {
          if (eventId.includes('-round-') || eventId.includes('-day-')) {
            const parts = eventId.split('-');
            return parts.slice(0, 5).join('-');
          }
          return eventId;
        })();

        let query;

        if (currentEvent.isSeriesEvent && currentEvent.seriesId) {
          const seriesId = (() => {
            const sid = currentEvent.seriesId!;
            if (sid.includes('-round-') || sid.includes('-day-')) {
              const parts = sid.split('-');
              return parts.slice(0, 5).join('-');
            }
            return sid;
          })();

          if (currentEvent.roundName) {
            query = supabase
              .from('event_attendance')
              .select('user_id, status')
              .eq('series_id', seriesId)
              .eq('round_name', currentEvent.roundName)
              .eq('status', 'yes');
          } else {
            query = supabase
              .from('event_attendance')
              .select('user_id, status')
              .eq('series_id', seriesId)
              .is('round_name', null)
              .eq('status', 'yes');
          }
        } else {
          query = supabase
            .from('event_attendance')
            .select('user_id, status')
            .eq('event_id', dbEventId)
            .eq('status', 'yes');
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error fetching attendance:', error);
          return;
        }

        const attendingUserIds = new Set((data || []).map(a => a.user_id));

        if (currentEvent.isPaid) {
          const { data: regData } = await supabase
            .from('event_registrations')
            .select('user_id')
            .eq('event_id', dbEventId)
            .neq('status', 'cancelled');

          if (regData) {
            regData.forEach(r => {
              if (r.user_id) attendingUserIds.add(r.user_id);
            });
          }
        }

        setAttendingMembers(Array.from(attendingUserIds));
      } catch (err) {
        console.error('Error in fetchAttendance:', err);
      }
    };

    fetchAttendance();
  }, [isOpen, currentEvent?.id, currentEvent?.isSeriesEvent, currentEvent?.seriesId, currentEvent?.roundName]);

  useEffect(() => {
    if (!isOpen || view !== 'members' || members.length === 0 || attendingMembers.length === 0) {
      return;
    }

    if (skippers.length > 0 || Object.keys(selectedMemberBoats).length > 0) {
      return;
    }

    const autoSelections: Record<string, MemberBoat> = {};
    const autoSelectedSailNos = new Set(skippers.map(s => s.sailNo));

    members.forEach(member => {
      if (member.user_id && attendingMembers.includes(member.user_id)) {
        const validBoat = member.boats?.find(boat =>
          boat.boat_type === currentEvent?.raceClass &&
          boat.sail_number &&
          boat.hull
        );

        if (validBoat) {
          const key = `${member.id}-${validBoat.id}`;
          if (!autoSelectedSailNos.has(validBoat.sail_number)) {
            autoSelections[key] = validBoat;
            autoSelectedSailNos.add(validBoat.sail_number);
          }
        }
      }
    });

    if (Object.keys(autoSelections).length > 0) {
      setSelectedMemberBoats(autoSelections);
    }
  }, [isOpen, view, members, attendingMembers, skippers, currentEvent?.raceClass]);

  if (!isOpen) return null;

  const handleMemberBoatSelect = (member: Member, boat: MemberBoat) => {
    // Check if the boat has all required data
    const isValid =
      boat.boat_type === currentEvent?.raceClass &&
      !!boat.sail_number &&
      !!boat.hull &&
      !!member.club;

    if (!isValid) {
      // If data is incomplete, prompt for editing instead of selecting
      setEditingBoat({
        memberId: member.id,
        boatId: boat.id,
        sailNumber: boat.sail_number || '',
        hull: boat.hull || '',
        club: member.club || ''
      });
      return;
    }

    const key = `${member.id}-${boat.id}`;

    const existingSkipperWithSailNo = skippers.find(s => s.sailNo === boat.sail_number);
    if (existingSkipperWithSailNo) {
      setError(`Sail number ${boat.sail_number} is already used by ${existingSkipperWithSailNo.name}`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const otherSelectedWithSailNo = Object.entries(selectedMemberBoats).find(([k, b]) =>
      !k.startsWith(`${member.id}-`) && b.sail_number === boat.sail_number
    );
    if (otherSelectedWithSailNo) {
      const otherMemberId = otherSelectedWithSailNo[0].split('-')[0];
      const otherMember = members.find(m => m.id === otherMemberId) || otherClubMembers.find(m => m.id === otherMemberId);
      const otherName = otherMember ? `${otherMember.first_name} ${otherMember.last_name}` : 'another member';
      setError(`Sail number ${boat.sail_number} is already selected by ${otherName}`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Check if this member is already in the skippers list
    const existingSkipper = skippers.find(s =>
      s.name === `${member.first_name} ${member.last_name}` &&
      s.sailNo === boat.sail_number
    );

    if (existingSkipper) {
      setError(`${member.first_name} ${member.last_name} with sail number ${boat.sail_number} is already added`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // First, remove any other boats for this member (only one boat per member allowed)
    const updatedSelections = { ...selectedMemberBoats };
    Object.keys(updatedSelections).forEach(existingKey => {
      if (existingKey.startsWith(`${member.id}-`)) {
        delete updatedSelections[existingKey];
      }
    });

    // Now toggle the current boat
    if (selectedMemberBoats[key]) {
      // If this boat was selected, it's now deselected (already removed above)
      setSelectedMemberBoats(updatedSelections);
    } else {
      // Select this boat
      setSelectedMemberBoats({
        ...updatedSelections,
        [key]: boat
      });
    }
  };

  const handleSelectAll = () => {
    const newSelections: Record<string, MemberBoat> = {};
    const usedSailNumbers = new Set(skippers.map(s => s.sailNo));

    membersWithMatchingBoats.forEach(member => {
      const matchingBoats = getMatchingBoats(member);

      const firstValidBoat = matchingBoats.find(boat => {
        return boat.isValid && !usedSailNumbers.has(boat.sail_number);
      });

      if (firstValidBoat) {
        const key = `${member.id}-${firstValidBoat.id}`;
        newSelections[key] = firstValidBoat;
        usedSailNumbers.add(firstValidBoat.sail_number);
      }
    });

    setSelectedMemberBoats(newSelections);
  };

  const handleDeselectAll = () => {
    setSelectedMemberBoats({});
  };

  const handleEditMemberBoat = (member: Member, boat: MemberBoat) => {
    setEditingMemberBoat({
      memberId: member.id,
      boatId: boat.id,
      sailNumber: boat.sail_number || '',
      hull: boat.hull || '',
      club: member.club || ''
    });
  };

  const handleAddNewBoat = async () => {
    if (!showAddBoatModal || !newBoatData.sailNumber || !newBoatData.hull) {
      setError('Please fill in all boat details');
      return;
    }

    setUpdateLoading(true);
    setError(null);

    try {
      const { data: newBoat, error: boatError } = await supabase
        .from('member_boats')
        .insert({
          member_id: showAddBoatModal.id,
          boat_type: currentEvent?.raceClass,
          sail_number: newBoatData.sailNumber,
          hull: newBoatData.hull
        })
        .select()
        .single();

      if (boatError) throw boatError;

      // Update local members state
      setMembers(prevMembers => {
        return prevMembers.map(member => {
          if (member.id === showAddBoatModal.id) {
            // Add validation flag to the new boat
            const validatedBoat = {
              ...newBoat,
              isValid:
                newBoat.boat_type === currentEvent?.raceClass &&
                !!newBoat.sail_number &&
                !!newBoat.hull &&
                !!member.club
            };

            return {
              ...member,
              boats: [...(member.boats || []), validatedBoat]
            };
          }
          return member;
        });
      });

      setUpdateSuccess('Boat added successfully!');
      setTimeout(() => setUpdateSuccess(null), 3000);

      // Reset and close
      setNewBoatData({ sailNumber: '', hull: '' });
      setShowAddBoatModal(null);
    } catch (err: any) {
      setError(err.message || 'Failed to add boat');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDeleteBoat = async () => {
    if (!boatToDelete) return;

    setUpdateLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('member_boats')
        .delete()
        .eq('id', boatToDelete.boat.id);

      if (deleteError) throw deleteError;

      // Update local members state
      setMembers(prevMembers => {
        return prevMembers.map(member => {
          if (member.id === boatToDelete.member.id) {
            return {
              ...member,
              boats: (member.boats || []).filter(b => b.id !== boatToDelete.boat.id)
            };
          }
          return member;
        });
      });

      // Remove from selected boats if it was selected
      const key = `${boatToDelete.member.id}-${boatToDelete.boat.id}`;
      if (selectedMemberBoats[key]) {
        const { [key]: _, ...rest } = selectedMemberBoats;
        setSelectedMemberBoats(rest);
      }

      setUpdateSuccess('Boat deleted successfully!');
      setTimeout(() => setUpdateSuccess(null), 3000);

      // Close confirmation modal
      setBoatToDelete(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete boat');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleUpdateMemberBoat = async () => {
    const boatToEdit = editingBoat || editingMemberBoat;
    if (!boatToEdit) return;

    setUpdateLoading(true);
    setError(null);

    try {
      // First, update the member's club if needed
      if (boatToEdit.club) {
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .update({ club: boatToEdit.club })
          .eq('id', boatToEdit.memberId)
          .select()
          .single();

        if (memberError) throw memberError;
      }

      // Then update the boat details
      const { data: boatData, error: boatError } = await supabase
        .from('member_boats')
        .update({
          sail_number: boatToEdit.sailNumber,
          hull: boatToEdit.hull
        })
        .eq('id', boatToEdit.boatId)
        .select()
        .single();

      if (boatError) throw boatError;

      // Update the local members state to reflect the changes
      setMembers(prevMembers => {
        return prevMembers.map(member => {
          if (member.id === boatToEdit.memberId) {
            // Update the member's club
            const updatedMember = { ...member, club: boatToEdit.club };

            // Update the specific boat
            if (updatedMember.boats) {
              updatedMember.boats = updatedMember.boats.map(boat => {
                if (boat.id === boatToEdit.boatId) {
                  return {
                    ...boat,
                    sail_number: boatToEdit.sailNumber,
                    hull: boatToEdit.hull,
                    isValid: true // Now it's valid
                  };
                }
                return boat;
              });
            }

            return updatedMember;
          }
          return member;
        });
      });

      if (editingBoat) {
        setEditMemberBoats(prev => prev.map(b =>
          b.id === boatToEdit.boatId
            ? { ...b, sail_number: boatToEdit.sailNumber, hull: boatToEdit.hull }
            : b
        ));
        setManualSkipper(prev => ({
          ...prev,
          sailNo: boatToEdit.sailNumber,
          hull: boatToEdit.hull,
          club: boatToEdit.club
        }));
      }

      setUpdateSuccess("Member information updated successfully");

      setTimeout(() => {
        setEditingBoat(null);
        setEditingMemberBoat(null);
        setUpdateSuccess(null);
      }, 2000);
      
    } catch (err) {
      console.error('Error updating member/boat:', err);
      setError(err instanceof Error ? err.message : 'Failed to update information');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleAddSelectedMembers = () => {
    const updatedSkippers = [...skippers];
    const newSkippers: any[] = [];
    const skippedDuplicates: string[] = [];
    const usedSailNumbers = new Set(skippers.map(s => s.sailNo));

    for (const boat of Object.values(selectedMemberBoats)) {
      const member = members.find(m => m.id === boat.member_id) || otherClubMembers.find(m => m.id === boat.member_id);
      if (member && boat.boat_type === currentEvent?.raceClass) {
        if (!boat.sail_number || !boat.hull || !member.club) {
          setError(`Cannot add ${member.first_name} ${member.last_name} - missing required information`);
          continue;
        }

        if (usedSailNumbers.has(boat.sail_number)) {
          skippedDuplicates.push(`${member.first_name} ${member.last_name} (${boat.sail_number})`);
          continue;
        }

        const newSkipper = {
          name: `${member.first_name} ${member.last_name}`,
          sailNo: boat.sail_number || '',
          hull: boat.hull || '',
          club: member.club || '',
          boatModel: boat.hull || boat.boat_type,
          startHcap: boat.handicap || 0,
          avatarUrl: (memberAvatars[member.id] || otherClubAvatars[member.id]) || undefined,
          memberId: member.id,
          boatId: boat.id,
          country_code: member.country_code,
          country: member.country,
          category: member.category,
          state: member.state
        };
        newSkippers.push(newSkipper);
        usedSailNumbers.add(boat.sail_number);
      }
    }

    if (skippedDuplicates.length > 0) {
      setError(`Skipped ${skippedDuplicates.length} member${skippedDuplicates.length !== 1 ? 's' : ''} with duplicate sail numbers: ${skippedDuplicates.join(', ')}`);
    }

    if (newSkippers.length > 0) {
      onUpdateSkippers([...updatedSkippers, ...newSkippers]);
      setView('initial');
      setSelectedMemberBoats({});
    }
  };

  const handleAddManualSkipper = (keepAdding: boolean = false) => {
    if (!manualSkipper.name || !manualSkipper.sailNo || !manualSkipper.hull || !manualSkipper.club) {
      setError('All fields are required: Name, Sail Number, Hull Design, and Club');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Check if sail number is already used (check all skippers and members)
    const existingSkipperWithSailNo = skippers.find(s =>
      s.sailNo === manualSkipper.sailNo
    );

    if (existingSkipperWithSailNo) {
      setError(`Sail number ${manualSkipper.sailNo} is already used by ${existingSkipperWithSailNo.name}`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Check if this skipper name is already in the list
    const existingSkipper = skippers.find(s =>
      s.name.toLowerCase() === manualSkipper.name.toLowerCase()
    );

    if (existingSkipper) {
      setError(`A skipper with the name "${manualSkipper.name}" is already added`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const updatedSkippers = [...skippers, {
      name: manualSkipper.name,
      sailNo: manualSkipper.sailNo,
      hull: manualSkipper.hull,
      club: manualSkipper.club,
      boatModel: manualSkipper.hull || manualSkipper.boatModel,
      startHcap: manualSkipper.startHcap || 0,
      country_code: manualSkipper.countryCode,
      country: manualSkipper.country,
      category: manualSkipper.category,
      ...(manualSkipper.nationalRanking > 0 ? { national_ranking: manualSkipper.nationalRanking } : {})
    }];

    onUpdateSkippers(updatedSkippers);

    setManualSkipper({
      name: '',
      sailNo: '',
      hull: '',
      club: '',
      country: 'Australia',
      countryCode: 'AU',
      category: '',
      clubState: '',
      boatModel: currentEvent?.raceClass || '',
      startHcap: 0,
      nationalRanking: 0
    });

    // If not keeping the form open, return to initial view
    if (!keepAdding) {
      setView('initial');
    }
  };
  
  const handleEditSkipper = async (index: number) => {
    const skipper = skippers[index];
    setEditingSkipperIndex(index);
    setManualSkipper({
      name: skipper.name || '',
      sailNo: skipper.sailNo || '',
      hull: skipper.hull || '',
      club: skipper.club || '',
      country: skipper.country || 'Australia',
      countryCode: skipper.country_code || 'AU',
      category: skipper.category || '',
      clubState: skipper.state || '',
      boatModel: currentEvent?.raceClass || '',
      startHcap: skipper.startHcap || 0,
      nationalRanking: skipper.national_ranking || 0
    });
    setShowAddBoatForEdit(false);
    setEditNewBoatData({ sailNumber: '', hull: '' });

    if (skipper.memberId) {
      try {
        const { data: boats } = await supabase
          .from('member_boats')
          .select('*')
          .eq('member_id', skipper.memberId)
          .eq('boat_type', currentEvent?.raceClass || '');
        setEditMemberBoats(boats || []);
      } catch {
        setEditMemberBoats([]);
      }
    } else {
      setEditMemberBoats([]);
    }

    setView('edit');
  };

  const handleUpdateSkipper = () => {
    if (editingSkipperIndex === null) return;

    const duplicateSailNo = skippers.find((s, i) =>
      i !== editingSkipperIndex && s.sailNo === manualSkipper.sailNo
    );
    if (duplicateSailNo) {
      setError(`Sail number ${manualSkipper.sailNo} is already used by ${duplicateSailNo.name}`);
      return;
    }

    const existingSkipper = skippers[editingSkipperIndex];
    const matchedBoat = editMemberBoats.find(
      b => b.sail_number === manualSkipper.sailNo && (b.hull || '') === manualSkipper.hull
    );

    const updatedSkippers = [...skippers];
    updatedSkippers[editingSkipperIndex] = {
      ...existingSkipper,
      name: manualSkipper.name,
      sailNo: manualSkipper.sailNo,
      hull: manualSkipper.hull,
      club: manualSkipper.club,
      country: manualSkipper.country,
      country_code: manualSkipper.countryCode,
      category: manualSkipper.category,
      state: manualSkipper.clubState,
      boatModel: manualSkipper.hull || currentEvent?.raceClass || '',
      ...(matchedBoat ? { boatId: matchedBoat.id } : {}),
      national_ranking: manualSkipper.nationalRanking > 0 ? manualSkipper.nationalRanking : undefined,
    };

    onUpdateSkippers(updatedSkippers);
    setEditingSkipperIndex(null);
    setView('initial');

    setManualSkipper({
      name: '',
      sailNo: '',
      hull: '',
      club: '',
      country: 'Australia',
      countryCode: 'AU',
      category: '',
      clubState: '',
      boatModel: currentEvent?.raceClass || '',
      startHcap: 0,
      nationalRanking: 0
    });
  };

  const handleAddBoatFromEdit = async () => {
    if (editingSkipperIndex === null) return;
    const skipper = skippers[editingSkipperIndex];
    if (!skipper.memberId || !editNewBoatData.sailNumber || !editNewBoatData.hull) return;

    setUpdateLoading(true);
    setError(null);

    try {
      const { data: newBoat, error: boatError } = await supabase
        .from('member_boats')
        .insert({
          member_id: skipper.memberId,
          boat_type: currentEvent?.raceClass,
          sail_number: editNewBoatData.sailNumber,
          hull: editNewBoatData.hull
        })
        .select()
        .single();

      if (boatError) throw boatError;

      setEditMemberBoats(prev => [...prev, newBoat]);
      setManualSkipper(prev => ({
        ...prev,
        sailNo: newBoat.sail_number,
        hull: newBoat.hull || ''
      }));
      setShowAddBoatForEdit(false);
      setEditNewBoatData({ sailNumber: '', hull: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to add boat');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleRemoveSkipper = (index: number) => {
    // Check if skipper has results
    if (skipperHasResults(index)) {
      setError("Cannot delete this skipper - scoring has already been applied. Remove race results before trying to delete this skipper.");
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
      return;
    }

    setSkipperToRemove(index);
    setShowRemoveConfirm(true);
  };
  
  const confirmRemoveSkipper = () => {
    if (skipperToRemove === null) return;

    const updatedSkippers = skippers.filter((_, i) => i !== skipperToRemove);
    onUpdateSkippers(updatedSkippers);
    setShowRemoveConfirm(false);
    setSkipperToRemove(null);
  };

  const toggleSelectSkipper = (index: number) => {
    setSelectedSkippers(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSkippers.size === skippers.length) {
      setSelectedSkippers(new Set());
    } else {
      setSelectedSkippers(new Set(skippers.map((_, i) => i)));
    }
  };

  const confirmBulkDelete = () => {
    const hasResultsBlocking = Array.from(selectedSkippers).some(i => skipperHasResults(i));
    if (hasResultsBlocking) {
      setError("Some selected skippers have race results. Remove race results before deleting them.");
      setTimeout(() => setError(null), 5000);
      setShowBulkDeleteConfirm(false);
      return;
    }
    const updatedSkippers = skippers.filter((_, i) => !selectedSkippers.has(i));
    onUpdateSkippers(updatedSkippers);
    setSelectedSkippers(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const cancelEditingBoat = () => {
    setEditingBoat(null);
    setEditingMemberBoat(null);
    setError(null);
    setUpdateSuccess(null);
  };

  // Filter members based on search term
  const filteredMembers = members.filter(member => {
    const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
    return fullName.includes(searchTerm.toLowerCase());
  });

  // Get matching boats for a member
  const getMatchingBoats = (member: MemberWithValidation) => {
    return member.boats?.filter(boat => boat.boat_type === currentEvent?.raceClass) || [];
  };

  // Check if a member has any matching boats
  const hasMatchingBoats = (member: MemberWithValidation) => {
    return getMatchingBoats(member).length > 0;
  };

  // Get initials from a name
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`;
  };

  const baseMembers = showOtherClubs
    ? otherClubMembers.filter(member => {
        const fullName = `${member.first_name} ${member.last_name}`.toLowerCase();
        return fullName.includes(searchTerm.toLowerCase());
      })
    : filteredMembers;

  const activeAvatars = showOtherClubs
    ? { ...memberAvatars, ...otherClubAvatars }
    : memberAvatars;

  const membersWithMatchingBoats = baseMembers
    .filter(m => showAllMembers || hasMatchingBoats(m))
    .sort((a, b) => {
      if (showAllMembers) {
        const aHas = hasMatchingBoats(a) ? 0 : 1;
        const bHas = hasMatchingBoats(b) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
      }
      const lastNameA = a.last_name.toLowerCase();
      const lastNameB = b.last_name.toLowerCase();
      if (lastNameA < lastNameB) return -1;
      if (lastNameA > lastNameB) return 1;
      const firstNameA = a.first_name.toLowerCase();
      const firstNameB = b.first_name.toLowerCase();
      return firstNameA.localeCompare(firstNameB);
    });

  // Edit boat modal
  const renderEditBoatModal = () => {
    const boatToEdit = editingBoat || editingMemberBoat;
    if (!boatToEdit) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
        <div className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
          <div className="p-6 border-b border-slate-700">
            <h3 className="text-lg font-medium text-slate-100">
              Complete Skipper Information
            </h3>
          </div>
          
          <div className="p-6 space-y-4">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-900/20 border border-red-900/30 text-red-400 text-sm">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {updateSuccess && (
              <div className="mb-4 p-3 rounded-md bg-green-900/20 border border-green-900/30 text-green-400 text-sm flex items-center gap-2">
                <Check size={16} />
                {updateSuccess}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Sail Number *
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={boatToEdit.sailNumber}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  if (editingBoat) {
                    setEditingBoat(prev => prev ? { ...prev, sailNumber: value } : null);
                  } else if (editingMemberBoat) {
                    setEditingMemberBoat(prev => prev ? { ...prev, sailNumber: value } : null);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter sail number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Boat Design (Hull) *
              </label>
              <input
                type="text"
                required
                value={boatToEdit.hull}
                onChange={(e) => {
                  if (editingBoat) {
                    setEditingBoat(prev => prev ? { ...prev, hull: e.target.value } : null);
                  } else if (editingMemberBoat) {
                    setEditingMemberBoat(prev => prev ? { ...prev, hull: e.target.value } : null);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter boat design (e.g., Trance, B6)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Club *
              </label>
              <input
                type="text"
                required
                value={boatToEdit.club}
                onChange={(e) => {
                  if (editingBoat) {
                    setEditingBoat(prev => prev ? { ...prev, club: e.target.value } : null);
                  } else if (editingMemberBoat) {
                    setEditingMemberBoat(prev => prev ? { ...prev, club: e.target.value } : null);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter club name"
              />
            </div>
            
            <p className="text-xs text-slate-400">
              This information will be saved to the member's profile and used for all future events.
            </p>
          </div>
          
          <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
            <button
              onClick={cancelEditingBoat}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors font-medium"
              disabled={updateLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateMemberBoat}
              disabled={updateLoading || !boatToEdit.sailNumber || !boatToEdit.hull || !boatToEdit.club}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Updating...</span>
                </>
              ) : (
                'Save Information'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (view === 'initial') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden flex flex-col backdrop-blur-sm bg-slate-800/95 border border-slate-700">
          {/* Blue gradient header */}
          <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="text-white" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Race Skippers
                </h2>
                <p className="text-sm text-blue-100">
                  {currentEvent?.raceClass} Class
                  {currentEvent?.isInterclub && " • Interclub Event"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-900/20 border border-red-900/30 text-red-400 text-sm">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {skippers.length > 0 ? (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-300">
                    Current Skippers ({skippers.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs px-2.5 py-1 rounded-md bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                    >
                      {selectedSkippers.size === skippers.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selectedSkippers.size > 0 && (
                      <button
                        onClick={() => setShowBulkDeleteConfirm(true)}
                        className="text-xs px-2.5 py-1 rounded-md bg-red-600/80 text-white hover:bg-red-600 transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        Delete ({selectedSkippers.size})
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {skippers.map((skipper, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-3 rounded-lg text-slate-200 transition-colors ${
                        selectedSkippers.has(index)
                          ? 'bg-blue-900/40 ring-1 ring-blue-500/50'
                          : 'bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          onClick={() => toggleSelectSkipper(index)}
                          className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                            selectedSkippers.has(index)
                              ? 'bg-blue-600 border-blue-500'
                              : 'border-slate-500 hover:border-slate-400'
                          }`}
                        >
                          {selectedSkippers.has(index) && <Check size={12} className="text-white" />}
                        </button>
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center">
                          {(() => {
                            const matchingMember = members.find(m =>
                              `${m.first_name} ${m.last_name}`.toLowerCase() === skipper.name.toLowerCase()
                            );

                            if (matchingMember && memberAvatars[matchingMember.id]) {
                              return (
                                <img
                                  src={memberAvatars[matchingMember.id]}
                                  alt={skipper.name}
                                  className="w-full h-full object-cover"
                                />
                              );
                            } else {
                              return (
                                <div className="w-full h-full flex items-center justify-center bg-slate-600">
                                  <span className="text-lg font-semibold text-slate-300">
                                    {getInitials(skipper.name.split(' ')[0], skipper.name.split(' ')[1] || '')}
                                  </span>
                                </div>
                              );
                            }
                          })()}
                        </div>
                        <div>
                          <div className="font-medium">{skipper.name}</div>
                          <div className="text-xs opacity-80">
                            {skipper.sailNo} {skipper.club && `• ${skipper.club}`} {skipper.hull && `• ${skipper.hull}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditSkipper(index)}
                          className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-900/30 transition-colors"
                          title="Edit skipper"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveSkipper(index)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                          title={skipperHasResults(index) ? "Cannot delete - has race results" : "Remove skipper"}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            
            <div className="space-y-4">
              <button
                onClick={() => setView('members')}
                className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-left"
              >
                <div className="p-3 rounded-lg bg-blue-600 text-white">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-200">
                    Add from Club Members
                  </h3>
                  <p className="text-sm text-slate-400">
                    {currentEvent?.isInterclub 
                      ? "Select from registered members of both clubs" 
                      : "Select from registered club members"}
                  </p>
                </div>
              </button>

              <button
                onClick={() => setView('manual')}
                className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-left"
              >
                <div className="p-3 rounded-lg bg-blue-600 text-white">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-200">
                    Add Skipper Manually
                  </h3>
                  <p className="text-sm text-slate-400">
                    Enter skipper details manually
                  </p>
                </div>
              </button>

              <button
                onClick={() => setView('import')}
                className="w-full flex items-center gap-4 p-4 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-left"
              >
                <div className="p-3 rounded-lg bg-blue-600 text-white">
                  <Upload size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-slate-200">
                    Import Skippers
                  </h3>
                  <p className="text-sm text-slate-400">
                    Upload CSV or XLS file with skipper details
                  </p>
                </div>
              </button>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Remove Confirmation Dialog */}
        {showRemoveConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
              <div className="p-6 border-b border-slate-700">
                <h3 className="text-lg font-medium text-slate-100">
                  Remove Skipper
                </h3>
              </div>
              
              <div className="p-6">
                <p className="text-slate-300">
                  Are you sure you want to remove this skipper?
                </p>
              </div>
              
              <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                <button
                  onClick={() => {
                    setShowRemoveConfirm(false);
                    setSkipperToRemove(null);
                  }}
                  className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveSkipper}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <div className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
              <div className="p-6 border-b border-slate-700">
                <h3 className="text-lg font-medium text-slate-100">
                  Delete {selectedSkippers.size} Skipper{selectedSkippers.size !== 1 ? 's' : ''}
                </h3>
              </div>
              <div className="p-6">
                <p className="text-slate-300">
                  Are you sure you want to remove {selectedSkippers.size} selected skipper{selectedSkippers.size !== 1 ? 's' : ''}? This cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                >
                  Delete {selectedSkippers.size} Skipper{selectedSkippers.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Boat Confirmation Dialog */}
        {boatToDelete && createPortal(
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
            style={{ zIndex: 9999 }}
            onClick={(e) => {
              console.log('Overlay clicked');
              e.stopPropagation();
            }}
          >
            {console.log('Rendering delete modal')}
            <div
              className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-700">
                <h3 className="text-lg font-medium text-slate-100">
                  Delete Boat
                </h3>
              </div>

              <div className="p-6">
                <p className="text-slate-300 mb-3">
                  Are you sure you want to delete this boat from {boatToDelete.member.first_name} {boatToDelete.member.last_name}'s garage?
                </p>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-sm text-slate-300">
                    <span className="font-medium">Sail #:</span> {boatToDelete.boat.sail_number}
                  </p>
                  <p className="text-sm text-slate-300">
                    <span className="font-medium">Hull:</span> {boatToDelete.boat.hull}
                  </p>
                </div>
                <p className="text-sm text-slate-400 mt-3">
                  Note: This will not affect any previous race results or scores with this boat.
                </p>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
                <button
                  onClick={() => setBoatToDelete(null)}
                  disabled={updateLoading}
                  className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteBoat}
                  disabled={updateLoading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateLoading ? 'Deleting...' : 'Delete Boat'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  if (view === 'manual') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
          {/* Blue gradient header */}
          <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserPlus className="text-white" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Add Skipper Manually
                </h2>
                {skippers.length > 0 && (
                  <p className="text-sm text-blue-100">
                    {skippers.length} skipper{skippers.length !== 1 ? 's' : ''} added
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-900/20 border border-red-900/30 text-red-400 text-sm">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-300">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Skipper Name *
              </label>
              <input
                type="text"
                required
                value={manualSkipper.name}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter skipper name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Sail Number *
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={manualSkipper.sailNo}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '');
                  setManualSkipper(prev => ({ ...prev, sailNo: value }));
                }}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter sail number"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Boat Design (Hull) *
              </label>
              <input
                type="text"
                required
                value={manualSkipper.hull}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, hull: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter boat design (e.g., Trance, B6)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Club *
              </label>
              <input
                type="text"
                required
                value={manualSkipper.club}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, club: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter club name"
              />
            </div>

            {/* Country field - ALWAYS shown */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Country <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={manualSkipper.countryCode || 'AU'}
                  onChange={(e) => {
                    const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                    setManualSkipper(prev => ({
                      ...prev,
                      countryCode: e.target.value,
                      country: country?.name || e.target.value
                    }));
                  }}
                  required
                  className="w-full pl-12 pr-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SAILING_NATIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-2xl pointer-events-none">
                  {getCountryFlag(manualSkipper.countryCode || 'AU')}
                </span>
              </div>
            </div>

            {/* Category field - ALWAYS shown */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={manualSkipper.category || ''}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, category: e.target.value }))}
                required
                className="w-full px-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                <option value="Junior">Junior</option>
                <option value="Open">Open</option>
                <option value="Master">Master</option>
                <option value="Grand Master">Grand Master</option>
                <option value="Legend">Legend</option>
              </select>
            </div>

            {/* National Ranking - optional */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                National Ranking
              </label>
              <input
                type="number"
                min="0"
                value={manualSkipper.nationalRanking || ''}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, nationalRanking: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="e.g. 5 (leave blank if unknown)"
              />
            </div>

            {/* Show State field if event display settings require it */}
            {currentEvent?.show_club_state && (
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">
                  State *
                </label>
                <input
                  type="text"
                  required
                  value={manualSkipper.clubState}
                  onChange={(e) => setManualSkipper(prev => ({ ...prev, clubState: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                  placeholder="Enter state (e.g., NSW, QLD)"
                />
              </div>
            )}

            <div className="flex justify-between gap-3 pt-4">
              <button
                onClick={() => setView('initial')}
                className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddManualSkipper(true)}
                  disabled={!manualSkipper.name || !manualSkipper.sailNo || !manualSkipper.hull || !manualSkipper.club || !manualSkipper.countryCode || !manualSkipper.category}
                  className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-600 text-white hover:bg-slate-700"
                >
                  Add & Continue
                </button>
                <button
                  onClick={() => handleAddManualSkipper(false)}
                  disabled={!manualSkipper.name || !manualSkipper.sailNo || !manualSkipper.hull || !manualSkipper.club || !manualSkipper.countryCode || !manualSkipper.category}
                  className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
                >
                  Add & Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Edit view
  if (view === 'edit') {
    const editingSkipper = editingSkipperIndex !== null ? skippers[editingSkipperIndex] : null;
    const isMemberLinked = !!editingSkipper?.memberId;

    return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700 max-h-[90vh] flex flex-col">
          <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <Edit2 className="text-white" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Edit Skipper Details
                </h2>
                <p className="text-sm text-blue-100">
                  Update skipper information
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setView('initial');
                setEditingSkipperIndex(null);
              }}
              className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-3 rounded-md bg-red-900/20 border border-red-900/30 text-red-400 text-sm">
                <div className="flex">
                  <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <p className="ml-3 text-sm text-red-300">{error}</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Skipper Name *
              </label>
              <input
                type="text"
                required
                value={manualSkipper.name}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter skipper name"
              />
            </div>

            {isMemberLinked && editMemberBoats.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-1.5 text-slate-300">
                  Select Boat
                </label>
                <div className="space-y-1.5">
                  {editMemberBoats.map((boat) => {
                    const isSelected = manualSkipper.sailNo === boat.sail_number && manualSkipper.hull === (boat.hull || '');
                    return (
                      <div key={boat.id} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setManualSkipper(prev => ({
                              ...prev,
                              sailNo: boat.sail_number || '',
                              hull: boat.hull || ''
                            }));
                          }}
                          className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
                            isSelected
                              ? 'border-blue-500 bg-blue-900/30'
                              : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                          }`}
                        >
                          <Sailboat size={16} className={isSelected ? 'text-blue-400' : 'text-slate-400'} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-white">Sail # {boat.sail_number}</span>
                            {boat.hull && (
                              <span className="text-sm text-slate-400 ml-2">{boat.hull}</span>
                            )}
                          </div>
                          {isSelected && <Check size={16} className="text-blue-400 flex-shrink-0" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const mId = editingSkipper?.memberId || boat.member_id;
                            if (mId) {
                              setEditingBoat({
                                memberId: mId,
                                boatId: boat.id,
                                sailNumber: boat.sail_number || '',
                                hull: boat.hull || '',
                                club: manualSkipper.club || ''
                              });
                            }
                          }}
                          className="p-2 rounded-lg border border-slate-600 bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors flex-shrink-0"
                          title="Edit boat details"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isMemberLinked && !showAddBoatForEdit && (
              <button
                type="button"
                onClick={() => setShowAddBoatForEdit(true)}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors text-sm font-medium"
              >
                <Plus size={16} />
                <span>Add New Boat for {manualSkipper.name.split(' ')[0]}</span>
              </button>
            )}

            {isMemberLinked && showAddBoatForEdit && (
              <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-900/10 space-y-3">
                <p className="text-sm font-medium text-blue-300">New Boat</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-400">Sail Number *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={editNewBoatData.sailNumber}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setEditNewBoatData(prev => ({ ...prev, sailNumber: value }));
                      }}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 text-sm"
                      placeholder="Sail #"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-slate-400">Hull Design *</label>
                    <input
                      type="text"
                      value={editNewBoatData.hull}
                      onChange={(e) => setEditNewBoatData(prev => ({ ...prev, hull: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 text-sm"
                      placeholder="e.g., Trance"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddBoatForEdit(false);
                      setEditNewBoatData({ sailNumber: '', hull: '' });
                    }}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBoatFromEdit}
                    disabled={updateLoading || !editNewBoatData.sailNumber || !editNewBoatData.hull}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {updateLoading ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Add Boat
                  </button>
                </div>
              </div>
            )}

            {(!isMemberLinked || editMemberBoats.length === 0) && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Sail Number *
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={manualSkipper.sailNo}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setManualSkipper(prev => ({ ...prev, sailNo: value }));
                    }}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                    placeholder="Enter sail number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">
                    Boat Design (Hull) *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualSkipper.hull}
                    onChange={(e) => setManualSkipper(prev => ({ ...prev, hull: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                    placeholder="Enter boat design (e.g., Trance, B6)"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Club *
              </label>
              <input
                type="text"
                required
                value={manualSkipper.club}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, club: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="Enter club name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Country <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  value={manualSkipper.countryCode || 'AU'}
                  onChange={(e) => {
                    const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                    setManualSkipper(prev => ({
                      ...prev,
                      countryCode: e.target.value,
                      country: country?.name || e.target.value
                    }));
                  }}
                  required
                  className="w-full pl-12 pr-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SAILING_NATIONS.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-2xl pointer-events-none">
                  {getCountryFlag(manualSkipper.countryCode || 'AU')}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                value={manualSkipper.category || ''}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, category: e.target.value }))}
                required
                className="w-full px-4 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Category</option>
                <option value="Junior">Junior</option>
                <option value="Open">Open</option>
                <option value="Master">Master</option>
                <option value="Grand Master">Grand Master</option>
                <option value="Legend">Legend</option>
              </select>
            </div>

            {/* National Ranking - optional */}
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-300">
                National Ranking
              </label>
              <input
                type="number"
                min="0"
                value={manualSkipper.nationalRanking || ''}
                onChange={(e) => setManualSkipper(prev => ({ ...prev, nationalRanking: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                placeholder="e.g. 5 (leave blank if unknown)"
              />
            </div>

            {currentEvent?.show_club_state && (
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">
                  State *
                </label>
                <input
                  type="text"
                  required
                  value={manualSkipper.clubState}
                  onChange={(e) => setManualSkipper(prev => ({ ...prev, clubState: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                  placeholder="Enter state (e.g., NSW, QLD)"
                />
              </div>
            )}

            <div className="flex justify-between gap-3 pt-4">
              <button
                onClick={() => {
                  setView('initial');
                  setEditingSkipperIndex(null);
                }}
                className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateSkipper}
                disabled={!manualSkipper.name || !manualSkipper.sailNo || !manualSkipper.hull || !manualSkipper.club || !manualSkipper.countryCode || !manualSkipper.category}
                className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
              >
                Update Skipper
              </button>
            </div>
          </div>
        </div>
      </div>
      {renderEditBoatModal()}
    </>
    );
  }

  // Import view
  if (view === 'import') {
    const SKIPPER_FIELDS: Array<{ key: string; label: string; required: boolean; aliases: string[] }> = [
      { key: 'full_name', label: 'Full Name (combined)', required: false, aliases: ['name', 'skipper', 'competitor', 'full name', 'full_name', 'fullname', 'skipper name', 'skipper_name', 'competitor name', 'helm', 'helmsman'] },
      { key: 'first_name', label: 'First Name', required: false, aliases: ['first name', 'first_name', 'firstname', 'fname', 'given name', 'given_name'] },
      { key: 'last_name', label: 'Last Name', required: false, aliases: ['last name', 'last_name', 'lastname', 'lname', 'surname', 'family name', 'family_name'] },
      { key: 'sail_number', label: 'Sail Number', required: true, aliases: ['sail no', 'sail_no', 'sail number', 'sail_number', 'sailno', 'sail', 'sail no.', 'sail no.', 'sailnumber', 'sail #'] },
      { key: 'club', label: 'Club', required: false, aliases: ['club', 'club name', 'club_name', 'organisation', 'organization', 'yacht club'] },
      { key: 'boat_type', label: 'Boat Type / Design', required: false, aliases: ['boat design', 'boat_design', 'boat type', 'boat_type', 'class', 'boat class', 'boat_class', 'design'] },
      { key: 'country_code', label: 'Country Code (IOC)', required: false, aliases: ['nat', 'nationality', 'nation', 'ioc', 'country code', 'country_code', 'nat.'] },
      { key: 'country', label: 'Country', required: false, aliases: ['country', 'country name', 'country_name'] },
      { key: 'state', label: 'State', required: false, aliases: ['state', 'province', 'region', 'state country', 'state\ncountry'] },
      { key: 'category', label: 'Category', required: false, aliases: ['category', 'age', 'age group', 'division', 'cat', 'cat.'] },
      { key: 'email', label: 'Email', required: false, aliases: ['email', 'e-mail', 'email address', 'contact email'] },
      { key: 'hull_number', label: 'Hull / Reg No', required: false, aliases: ['hull', 'hull reg no', 'hull_reg_no', 'hull number', 'hull_number', 'registration', 'reg no', 'reg_no'] },
      { key: 'national_ranking', label: 'National Ranking', required: false, aliases: ['ranking', 'national ranking', 'national_ranking', 'rank', 'nat ranking', 'nat_ranking', 'world ranking', 'world_ranking', 'seeding', 'seed'] },
    ];

    const autoDetectSkipperMappings = (headers: string[]): { mappings: Record<string, string>; autoDetected: Set<string> } => {
      const mappings: Record<string, string> = {};
      const autoDetected = new Set<string>();
      const usedFields = new Set<string>();
      const usedHeaders = new Set<string>();

      headers.forEach(header => {
        const normalizedHeader = header.toLowerCase().trim();
        const strippedHeader = normalizedHeader.replace(/[_ .]/g, '');
        for (const field of SKIPPER_FIELDS) {
          if (usedFields.has(field.key)) continue;
          const isMatch = field.aliases.some(alias => {
            if (normalizedHeader === alias) return true;
            if (strippedHeader === alias.replace(/[_ .]/g, '')) return true;
            return false;
          });
          if (isMatch) {
            mappings[header] = field.key;
            autoDetected.add(field.key);
            usedFields.add(field.key);
            usedHeaders.add(header);
            break;
          }
        }
      });

      const fuzzyRules: Array<{ field: string; match: (h: string) => boolean }> = [
        { field: 'first_name', match: h => (h.includes('first') && h.includes('name')) || h === 'fname' },
        { field: 'last_name', match: h => (h.includes('last') && h.includes('name')) || h.includes('surname') || h === 'lname' },
        { field: 'full_name', match: h => h === 'name' || h === 'skipper' || h === 'competitor' || h === 'helm' || h === 'helmsman' || (h.includes('skipper') && h.includes('name')) },
        { field: 'sail_number', match: h => h.includes('sail') || h === 'sail no.' || h === 'sail no' },
        { field: 'club', match: h => h.includes('club') },
        { field: 'boat_type', match: h => (h.includes('boat') && (h.includes('design') || h.includes('type') || h.includes('class'))) || (h === 'class') || (h === 'design') },
        { field: 'country_code', match: h => h === 'nat' || h === 'nat.' || h === 'nationality' || h === 'ioc' || (h.includes('country') && h.includes('code')) },
        { field: 'country', match: h => h === 'country' || h === 'country name' },
        { field: 'state', match: h => h === 'state' || h === 'province' || (h.includes('state') && h.includes('country')) },
        { field: 'category', match: h => h === 'category' || h === 'cat' || h === 'cat.' || h.includes('age group') },
        { field: 'email', match: h => h.includes('email') || h.includes('e-mail') },
        { field: 'hull_number', match: h => h.includes('hull') || (h.includes('reg') && h.includes('no')) },
      ];

      for (const rule of fuzzyRules) {
        if (usedFields.has(rule.field)) continue;
        const matchedHeader = headers.find(h => {
          if (usedHeaders.has(h)) return false;
          return rule.match(h.toLowerCase().trim());
        });
        if (matchedHeader) {
          mappings[matchedHeader] = rule.field;
          autoDetected.add(rule.field);
          usedFields.add(rule.field);
          usedHeaders.add(matchedHeader);
        }
      }

      return { mappings, autoDetected };
    };

    const parseImportText = (text: string) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as string[][];
          if (rows.length < 2) return;

          const headerKeywords = [
            'first name', 'first_name', 'firstname', 'fname',
            'last name', 'last_name', 'lastname', 'lname', 'surname',
            'name', 'skipper', 'competitor', 'full name', 'helm', 'helmsman',
            'sail no', 'sail number', 'sail_no', 'sail_number', 'sailno', 'sail no.',
            'club name', 'club_name', 'club',
            'boat design', 'boat_design', 'boat type', 'boat_type', 'boat class', 'class', 'design',
            'nat', 'nationality', 'country code', 'country_code', 'ioc',
            'country', 'state', 'state country', 'email', 'phone',
            'category', 'cat', 'cat.', 'hull', 'hull reg no', 'hull_reg_no', 'hull number',
            'competitor id', 'entry date', 'rank', 'pn', 'payment', '2.4 ghz',
          ];

          let bestRowIndex = 0;
          let bestScore = 0;

          for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            let score = 0;
            for (const cell of row) {
              const normalized = (cell || '').toLowerCase().trim();
              if (!normalized) continue;
              if (headerKeywords.includes(normalized)) {
                score += 2;
              } else if (headerKeywords.some(kw => normalized === kw.replace(/[_ ]/g, ''))) {
                score += 2;
              } else if (headerKeywords.some(kw => normalized.includes(kw) && normalized.length < kw.length + 8)) {
                score += 1;
              }
            }
            if (score > bestScore) {
              bestScore = score;
              bestRowIndex = i;
            }
          }

          if (bestScore < 3) {
            let maxCells = 0;
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
              const nonEmpty = rows[i].filter(c => c && c.trim()).length;
              if (nonEmpty > maxCells) {
                maxCells = nonEmpty;
                bestRowIndex = i;
              }
            }
          }

          const headerRow = rows[bestRowIndex];
          const dataRows = rows.slice(bestRowIndex + 1);

          const headers = headerRow.map((h, i) => {
            const trimmed = (h || '').trim();
            return trimmed || `Column_${i + 1}`;
          });

          const data = dataRows
            .filter(row => {
              const nonEmpty = row.filter(cell => cell && cell.trim()).length;
              return nonEmpty >= 2;
            })
            .map(row => {
              const obj: Record<string, string> = {};
              headers.forEach((header, i) => {
                obj[header] = (row[i] || '').trim();
              });
              return obj;
            });

          if (data.length === 0) return;

          setImportData(data);
          setImportHeaders(headers);
          const { mappings, autoDetected } = autoDetectSkipperMappings(headers);

          // Content-based validation: verify sail_number column actually contains sail-number-like data
          const sailColHeader = Object.entries(mappings).find(([, v]) => v === 'sail_number')?.[0];
          if (sailColHeader && data.length > 0) {
            const sailSamples = data.slice(0, Math.min(10, data.length)).map(r => (r[sailColHeader] || '').trim());
            const sailPattern = /^([A-Za-z]{2,3}\s+)?\d+/;
            const looksLikeSailNumbers = sailSamples.filter(s => s && sailPattern.test(s)).length;

            // If less than half look like sail numbers, try to find a better column
            if (looksLikeSailNumbers < sailSamples.filter(s => s).length * 0.5) {
              const currentBoatTypeHeader = Object.entries(mappings).find(([, v]) => v === 'boat_type')?.[0];

              // Check all unmapped headers and the boat_type header for sail-number-like data
              const candidateHeaders = headers.filter(h => {
                const mapped = mappings[h];
                return !mapped || mapped === 'boat_type';
              });

              let bestCandidate = '';
              let bestScore = looksLikeSailNumbers;

              for (const candidate of candidateHeaders) {
                const samples = data.slice(0, Math.min(10, data.length)).map(r => (r[candidate] || '').trim());
                const matchCount = samples.filter(s => s && sailPattern.test(s)).length;
                if (matchCount > bestScore) {
                  bestScore = matchCount;
                  bestCandidate = candidate;
                }
              }

              if (bestCandidate) {
                // Swap: move old sail_number mapping to boat_type (or remove), assign new one
                const oldSailMapping = sailColHeader;
                if (bestCandidate === currentBoatTypeHeader) {
                  // Swap sail_number and boat_type
                  mappings[bestCandidate] = 'sail_number';
                  mappings[oldSailMapping] = 'boat_type';
                } else {
                  // Assign the new candidate to sail_number
                  mappings[bestCandidate] = 'sail_number';
                  // If old sail col doesn't have a better fit, try assigning it to boat_type
                  if (!currentBoatTypeHeader) {
                    mappings[oldSailMapping] = 'boat_type';
                  } else {
                    delete mappings[oldSailMapping];
                  }
                }
              }
            }
          }

          setImportMappings(mappings);
          setImportAutoDetected(autoDetected);
          setImportStep('mapping');
        }
      });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        parseImportText(text);
      };
      reader.readAsText(file);
    };

    const handlePasteImport = () => {
      if (!pasteText.trim()) return;
      parseImportText(pasteText);
    };

    const handleImport = async () => {
      setImportStep('importing');
      const parsedSkippers: Skipper[] = [];

      const fieldToColumn: Record<string, string> = {};
      Object.entries(importMappings).forEach(([csvColumn, field]) => {
        fieldToColumn[field] = csvColumn;
      });

      const titleCase = (s: string) => {
        if (!s) return s;
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      };

      // Pre-detect if country codes are concatenated with names across the dataset
      // by checking if a majority of sail numbers share a country prefix that also appears at the start of names
      let detectedNamePrefix = '';
      if (fieldToColumn['sail_number'] && fieldToColumn['full_name']) {
        const sailCountryCodes = new Map<string, number>();
        for (const row of importData.slice(0, Math.min(20, importData.length))) {
          const sn = (row[fieldToColumn['sail_number']] || '').trim();
          const match = sn.match(/^([A-Za-z]{2,3})\s+\d+/);
          if (match) {
            const code = match[1].toUpperCase();
            sailCountryCodes.set(code, (sailCountryCodes.get(code) || 0) + 1);
          }
        }
        // Find the dominant country code
        let dominantCode = '';
        let dominantCount = 0;
        sailCountryCodes.forEach((count, code) => {
          if (count > dominantCount) {
            dominantCount = count;
            dominantCode = code;
          }
        });
        // Check if names also start with this code (indicating concatenation)
        if (dominantCode && dominantCount >= 3) {
          let nameMatchCount = 0;
          const nameCol = fieldToColumn['full_name'] || fieldToColumn['last_name'] || fieldToColumn['first_name'];
          if (nameCol) {
            for (const row of importData.slice(0, Math.min(20, importData.length))) {
              const name = (row[nameCol] || '').trim().toUpperCase();
              if (name.startsWith(dominantCode) && name.length > dominantCode.length) {
                nameMatchCount++;
              }
            }
            // If more than 60% of names start with the country code, it's a concatenation artifact
            const sampleSize = Math.min(20, importData.length);
            if (nameMatchCount > sampleSize * 0.6) {
              detectedNamePrefix = dominantCode;
            }
          }
        }
      }

      for (const row of importData) {
        let firstName = (row[fieldToColumn['first_name']] || '').trim();
        let lastName = (row[fieldToColumn['last_name']] || '').trim();
        const fullName = (row[fieldToColumn['full_name']] || '').trim();
        const club = (row[fieldToColumn['club']] || '').trim();
        const boatType = (row[fieldToColumn['boat_type']] || currentEvent?.raceClass || '').trim();
        let sailNo = (row[fieldToColumn['sail_number']] || '').trim();
        let countryCode = (row[fieldToColumn['country_code']] || '').trim();
        const country = (row[fieldToColumn['country']] || '').trim();
        const category = (row[fieldToColumn['category']] || '').trim();
        const state = (row[fieldToColumn['state']] || '').trim();
        const hullNumber = (row[fieldToColumn['hull_number']] || '').trim();
        const nationalRankingRaw = (row[fieldToColumn['national_ranking']] || '').trim();
        const nationalRanking = parseInt(nationalRankingRaw, 10) || 0;

        if (!firstName && !lastName && fullName) {
          if (fullName.includes(',')) {
            const parts = fullName.split(',').map(p => p.trim());
            lastName = parts[0];
            firstName = parts.slice(1).join(' ');
          } else {
            const parts = fullName.split(/\s+/);
            if (parts.length === 1) {
              firstName = parts[0];
              lastName = '';
            } else {
              const firstIsAllCaps = parts[0] === parts[0].toUpperCase() && parts[0].length > 1;
              const restAreNotAllCaps = parts.slice(1).some(p => p !== p.toUpperCase());
              if (firstIsAllCaps && restAreNotAllCaps) {
                lastName = parts[0];
                firstName = parts.slice(1).join(' ');
              } else {
                firstName = parts.slice(0, -1).join(' ');
                lastName = parts[parts.length - 1];
              }
            }
          }
          firstName = titleCase(firstName);
          lastName = titleCase(lastName);
        }

        const countryPrefixMatch = sailNo.match(/^([A-Za-z]{2,3})\s+(\d+.*)$/);
        if (countryPrefixMatch) {
          if (!countryCode) {
            countryCode = countryPrefixMatch[1].toUpperCase();
          }
          sailNo = countryPrefixMatch[2].trim();
        }

        // Strip country code prefix from names if concatenated during paste (e.g. "AUSALLEN" -> "ALLEN")
        // Only strip if pre-detection confirmed this is a dataset-wide concatenation issue
        if (detectedNamePrefix && lastName) {
          const upperLastName = lastName.toUpperCase();
          if (upperLastName.startsWith(detectedNamePrefix) && upperLastName.length > detectedNamePrefix.length + 1) {
            lastName = titleCase(lastName.slice(detectedNamePrefix.length));
          }
        }
        if (detectedNamePrefix && firstName) {
          const upperFirstName = firstName.toUpperCase();
          if (upperFirstName.startsWith(detectedNamePrefix) && upperFirstName.length > detectedNamePrefix.length + 1) {
            firstName = titleCase(firstName.slice(detectedNamePrefix.length));
          }
        }

        let skipperName = '';
        if (nameDisplayFormat === 'last_first' && firstName && lastName) {
          skipperName = `${lastName}, ${firstName}`;
        } else {
          skipperName = `${firstName} ${lastName}`.trim();
        }
        if (skipperName && sailNo) {
          parsedSkippers.push({
            name: skipperName,
            sailNo,
            club,
            boatModel: boatType,
            hull: hullNumber || boatType,
            startHcap: 0,
            country_code: countryCode,
            country: country,
            category: category,
            clubState: state,
            ...(nationalRanking > 0 ? { national_ranking: nationalRanking } : {})
          });
        }
      }

      // Find duplicate sail numbers within the imported data and against existing skippers
      const sailNoCounts = new Map<string, number[]>();
      parsedSkippers.forEach((s, idx) => {
        const existing = sailNoCounts.get(s.sailNo) || [];
        existing.push(idx);
        sailNoCounts.set(s.sailNo, existing);
      });

      const existingSailNos = new Set(skippers.map(s => s.sailNo));
      const groups: { sailNo: string; skippers: { index: number; skipper: Skipper }[] }[] = [];

      sailNoCounts.forEach((indices, sailNo) => {
        if (indices.length > 1 || existingSailNos.has(sailNo)) {
          const groupSkippers = indices.map(idx => ({ index: idx, skipper: parsedSkippers[idx] }));
          if (existingSailNos.has(sailNo) && indices.length === 1) {
            // Single new skipper conflicting with existing - show just the new one
            groups.push({ sailNo, skippers: groupSkippers });
          } else {
            groups.push({ sailNo, skippers: groupSkippers });
          }
        }
      });

      if (groups.length > 0) {
        setAllParsedSkippers(parsedSkippers);
        setConflictGroups(groups);
        setImportStep('conflicts');
        return;
      }

      finalizeImport(parsedSkippers);
    };

    const finalizeImport = async (allNewSkippers: Skipper[]) => {
      onUpdateSkippers([...skippers, ...allNewSkippers]);
      setError(null);
      const count = allNewSkippers.length;

      if (saveToContacts && isRaceOfficer && allNewSkippers.length > 0) {
        try {
          const contactRows = allNewSkippers.map(s => ({
            name: s.name,
            sail_number: s.sailNo || '',
            boat_class: s.hull || s.boatModel || '',
            boat_name: '',
            club_name: s.club || '',
            email: '',
            country: s.country_code || s.country || '',
            state: s.clubState || '',
          }));
          const saved = await bulkAddRaceOfficerContacts(contactRows);
          addNotification('success', `${count} skipper${count !== 1 ? 's' : ''} imported and ${saved.length} saved to contacts`);
        } catch {
          addNotification('success', `${count} skipper${count !== 1 ? 's' : ''} imported (contacts save failed)`);
        }
      } else {
        addNotification('success', `${count} skipper${count !== 1 ? 's' : ''} imported successfully`);
      }

      onClose();
    };

    const handleResolveConflicts = () => {
      // Check all sail numbers are unique across existing + all parsed skippers
      const allSailNos = [...skippers.map(s => s.sailNo)];
      const duplicates: string[] = [];

      for (const s of allParsedSkippers) {
        if (!s.sailNo.trim()) {
          setError('All skippers must have a sail number.');
          return;
        }
        if (allSailNos.includes(s.sailNo)) {
          duplicates.push(s.sailNo);
        }
        allSailNos.push(s.sailNo);
      }

      if (duplicates.length > 0) {
        setError(`Sail numbers must be unique. Still conflicting: ${[...new Set(duplicates)].join(', ')}`);
        return;
      }

      setError(null);
      finalizeImport(allParsedSkippers);
    };

    const updateConflictSailNo = (skipperIndex: number, newSailNo: string) => {
      setAllParsedSkippers(prev => {
        const updated = [...prev];
        updated[skipperIndex] = { ...updated[skipperIndex], sailNo: newSailNo };
        return updated;
      });
      // Also update the conflict groups reference
      setConflictGroups(prev => prev.map(group => ({
        ...group,
        skippers: group.skippers.map(s =>
          s.index === skipperIndex ? { ...s, skipper: { ...s.skipper, sailNo: newSailNo } } : s
        )
      })));
      setError(null);
    };

    const importFieldsList = SKIPPER_FIELDS;
    const mappedFields = new Set(Object.values(importMappings));
    const mappedCount = importFieldsList.filter(f => mappedFields.has(f.key)).length;
    const hasSailNumber = mappedFields.has('sail_number');
    const hasFullName = mappedFields.has('full_name');
    const hasFirstAndLast = mappedFields.has('first_name') && mappedFields.has('last_name');
    const hasNameField = hasFullName || hasFirstAndLast;
    const canImport = hasSailNumber && hasNameField;
    const autoDetectedCount = importAutoDetected.size;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-3xl rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700 max-h-[90vh] flex flex-col">
          <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Upload className="text-white" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Import Skippers
                </h2>
                <p className="text-sm text-blue-100">
                  Upload a file or paste skipper data
                </p>
              </div>
            </div>
            <button
              onClick={() => setView('initial')}
              className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {importStep === 'upload' && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-slate-500 transition-colors">
                  <FileUp className="mx-auto mb-3 text-slate-500" size={40} />
                  <h3 className="text-lg font-medium text-slate-200 mb-1">Upload Skipper File</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    CSV or XLS with skipper details (any format supported)
                  </p>
                  <label className="inline-block px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
                    Choose File
                    <input
                      type="file"
                      accept=".csv,.xls,.xlsx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-slate-700" />
                  <span className="text-sm text-slate-500 font-medium">OR</span>
                  <div className="flex-1 h-px bg-slate-700" />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ClipboardPaste size={16} className="text-slate-400" />
                    <h3 className="text-sm font-medium text-slate-300">Paste Data</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Copy rows from a spreadsheet, website table, or CSV and paste below. Include the header row.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"First Name,Surname,Sail No,Club Name,Country\nJohn,Smith,AUS42,Royal YC,Australia\nJane,Doe,NZL7,Auckland SC,New Zealand"}
                    className="w-full h-32 px-4 py-3 bg-slate-900/60 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 resize-none font-mono"
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handlePasteImport}
                      disabled={!pasteText.trim()}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <ArrowRight size={16} />
                      Process Pasted Data
                    </button>
                  </div>
                </div>
              </div>
            )}

            {importStep === 'mapping' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Map Your Fields</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {importData.length} skipper{importData.length !== 1 ? 's' : ''} detected with {importHeaders.length} columns
                    </p>
                  </div>
                  {autoDetectedCount > 0 && (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Zap size={14} className="text-emerald-400" />
                      <span className="text-emerald-400 font-medium">
                        {autoDetectedCount} auto-detected
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="grid grid-cols-[1fr,32px,1fr,36px] items-center gap-0 px-4 py-2.5 bg-slate-800/80 border-b border-slate-700/50">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Skipper Field</span>
                    <span />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your Column</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center">Status</span>
                  </div>
                  <div className="divide-y divide-slate-700/30 max-h-[340px] overflow-y-auto">
                    {importFieldsList.map(({ key, label, required }) => {
                      const mappedColumn = Object.keys(importMappings).find(k => importMappings[k] === key) || '';
                      const isMapped = !!mappedColumn;
                      const isAutoDetected = importAutoDetected.has(key);

                      return (
                        <div
                          key={key}
                          className="grid grid-cols-[1fr,32px,1fr,36px] items-center gap-0 px-4 py-2.5 hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-200">{label}</span>
                            {key === 'sail_number' && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                Required
                              </span>
                            )}
                            {key === 'full_name' && !hasFirstAndLast && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                Required*
                              </span>
                            )}
                            {(key === 'first_name' || key === 'last_name') && !hasFullName && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                Required*
                              </span>
                            )}
                          </div>
                          <div className="flex justify-center">
                            <ArrowRight size={12} className="text-slate-600" />
                          </div>
                          <select
                            value={mappedColumn}
                            onChange={(e) => {
                              const newMappings = { ...importMappings };
                              Object.keys(newMappings).forEach(k => {
                                if (newMappings[k] === key) delete newMappings[k];
                              });
                              if (e.target.value) newMappings[e.target.value] = key;
                              setImportMappings(newMappings);
                              const newAuto = new Set(importAutoDetected);
                              newAuto.delete(key);
                              setImportAutoDetected(newAuto);
                            }}
                            className={`w-full px-3 py-2 rounded-lg text-sm bg-slate-800/80 border text-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all ${
                              isMapped ? 'border-green-500/50' : 'border-slate-700/60'
                            }`}
                          >
                            <option value="">-- Skip --</option>
                            {importHeaders.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                          <div className="flex justify-center">
                            {(() => {
                              const isContextRequired = key === 'sail_number' ||
                                (key === 'full_name' && !hasFirstAndLast) ||
                                ((key === 'first_name' || key === 'last_name') && !hasFullName);
                              if (isMapped) {
                                return (
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isAutoDetected ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                                    <CheckCircle size={14} className={isAutoDetected ? 'text-emerald-400' : 'text-blue-400'} />
                                  </div>
                                );
                              }
                              if (isContextRequired) {
                                return (
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500/20">
                                    <AlertCircle size={14} className="text-red-400" />
                                  </div>
                                );
                              }
                              return (
                                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-700/50">
                                  <span className="text-slate-600 text-xs">-</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-slate-400">Mapped: </span>
                        <span className="text-white font-medium">{mappedCount}/{importFieldsList.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Required: </span>
                        <span className={`font-medium ${canImport ? 'text-emerald-400' : 'text-red-400'}`}>
                          {canImport ? 'OK' : 'Missing'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{importHeaders.length} columns in source</span>
                  </div>
                </div>

                {hasNameField && (
                  <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-300">Name Display Format</div>
                      <div className="flex items-center gap-1 bg-slate-900/60 rounded-lg p-0.5 border border-slate-700/50">
                        <button
                          onClick={() => setNameDisplayFormat('first_last')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            nameDisplayFormat === 'first_last'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          First Last
                        </button>
                        <button
                          onClick={() => setNameDisplayFormat('last_first')}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            nameDisplayFormat === 'last_first'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Last, First
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {nameDisplayFormat === 'first_last'
                        ? 'Names will appear as "John Smith" in results'
                        : 'Names will appear as "Smith, John" in results'}
                    </p>
                  </div>
                )}

                {!canImport && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-sm text-red-300">
                      <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                      Please map required fields: Sail Number + (Full Name OR First Name & Last Name).
                      {!hasSailNumber && ' Missing: Sail Number.'}
                      {!hasNameField && ' Missing: a name field (Full Name, or First Name + Last Name).'}
                    </div>
                  </div>
                )}

                {importData.length > 0 && (() => {
                  // Detect country code prefix in name column for preview display
                  const sailColHeader = Object.entries(importMappings).find(([, v]) => v === 'sail_number')?.[0];
                  const nameColHeader = Object.entries(importMappings).find(([, v]) => v === 'full_name' || v === 'last_name' || v === 'first_name')?.[0];
                  let previewNamePrefix = '';
                  if (sailColHeader && nameColHeader) {
                    const sailCodes = new Map<string, number>();
                    for (const row of importData.slice(0, 20)) {
                      const sn = (row[sailColHeader] || '').trim();
                      const m = sn.match(/^([A-Za-z]{2,3})\s+\d+/);
                      if (m) sailCodes.set(m[1].toUpperCase(), (sailCodes.get(m[1].toUpperCase()) || 0) + 1);
                    }
                    let dominant = '';
                    let domCount = 0;
                    sailCodes.forEach((c, code) => { if (c > domCount) { domCount = c; dominant = code; } });
                    if (dominant && domCount >= 3) {
                      let nameHits = 0;
                      for (const row of importData.slice(0, 20)) {
                        const n = (row[nameColHeader] || '').trim().toUpperCase();
                        if (n.startsWith(dominant) && n.length > dominant.length) nameHits++;
                      }
                      if (nameHits > Math.min(20, importData.length) * 0.6) previewNamePrefix = dominant;
                    }
                  }

                  const getPreviewValue = (header: string, value: string) => {
                    if (!previewNamePrefix || !value) return value;
                    if (header === nameColHeader) {
                      const upper = value.toUpperCase();
                      if (upper.startsWith(previewNamePrefix) && upper.length > previewNamePrefix.length + 1) {
                        return value.slice(previewNamePrefix.length);
                      }
                    }
                    return value;
                  };

                  return (
                    <div className="bg-slate-900/40 rounded-xl border border-slate-700/50 p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Data Preview (first 3 rows)</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-700/50">
                              <th className="text-left py-1 px-2 text-slate-500 font-medium">#</th>
                              {importHeaders.slice(0, 6).map(h => (
                                <th key={h} className="text-left py-1 px-2 text-slate-400 font-medium truncate max-w-[120px]">{h}</th>
                              ))}
                              {importHeaders.length > 6 && <th className="text-slate-500 px-2">...</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {importData.slice(0, 3).map((row, i) => (
                              <tr key={i} className="border-b border-slate-800/50">
                                <td className="py-1 px-2 text-slate-500">{i + 1}</td>
                                {importHeaders.slice(0, 6).map(h => (
                                  <td key={h} className="py-1 px-2 text-slate-300 truncate max-w-[120px]">{getPreviewValue(h, row[h] || '')}</td>
                                ))}
                                {importHeaders.length > 6 && <td className="text-slate-600 px-2">...</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {importStep === 'importing' && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-400">Importing skippers...</p>
              </div>
            )}

            {importStep === 'conflicts' && (
              <div className="py-4 px-1">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="text-amber-400" size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Sail Number Conflicts</h3>
                    <p className="text-sm text-slate-400">
                      {conflictGroups.length} sail number{conflictGroups.length !== 1 ? 's are' : ' is'} shared by multiple skippers. Update at least one skipper in each group so all sail numbers are unique.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                    {error}
                  </div>
                )}

                <div className="space-y-4 max-h-[40vh] overflow-y-auto">
                  {conflictGroups.map((group) => {
                    const existingWithSame = skippers.filter(s => s.sailNo === group.sailNo);
                    const allSailNosInGroup = group.skippers.map(s => s.skipper.sailNo);
                    const hasDuplicatesStill = allSailNosInGroup.some((sn, i) => {
                      if (!sn.trim()) return true;
                      if (existingWithSame.some(e => e.sailNo === sn)) return true;
                      return allSailNosInGroup.indexOf(sn) !== i;
                    });

                    return (
                      <div
                        key={group.sailNo}
                        className={`rounded-xl border p-4 transition-all ${
                          hasDuplicatesStill
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : 'border-emerald-500/40 bg-emerald-500/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Sail Number
                          </span>
                          <span className="text-sm font-bold font-mono text-amber-400">{group.sailNo}</span>
                          <span className="text-xs text-slate-500">
                            ({group.skippers.length + existingWithSame.length} skippers)
                          </span>
                          {!hasDuplicatesStill && <Check size={14} className="text-emerald-400 ml-auto" />}
                        </div>

                        {existingWithSame.length > 0 && (
                          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-700/30 border border-slate-600/30 mb-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-white truncate">{existingWithSame[0].name}</span>
                              {existingWithSame[0].club && (
                                <span className="text-xs text-slate-500 ml-2">({existingWithSame[0].club})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-slate-500 font-mono bg-slate-700/60 px-2 py-1 rounded">{existingWithSame[0].sailNo}</span>
                              <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Already in event</span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          {group.skippers.map((entry) => {
                            const otherSailNos = [
                              ...skippers.map(s => s.sailNo),
                              ...allParsedSkippers.filter((_, i) => i !== entry.index).map(s => s.sailNo),
                            ];
                            const isUnique = entry.skipper.sailNo.trim() !== '' && !otherSailNos.includes(entry.skipper.sailNo);

                            return (
                              <div
                                key={entry.index}
                                className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/40"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-white truncate">{entry.skipper.name}</span>
                                    {entry.skipper.club && (
                                      <span className="text-xs text-slate-500 truncate">({entry.skipper.club})</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <input
                                    type="text"
                                    value={entry.skipper.sailNo}
                                    onChange={(e) => updateConflictSailNo(entry.index, e.target.value)}
                                    className={`w-20 px-2.5 py-1.5 rounded-lg text-sm font-mono text-center border transition-all outline-none ${
                                      isUnique
                                        ? 'bg-slate-700/80 border-emerald-500/50 text-emerald-300 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30'
                                        : 'bg-slate-700/80 border-amber-500/50 text-white focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                                    }`}
                                  />
                                  {isUnique && <Check size={14} className="text-emerald-400" />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">
                      {allParsedSkippers.length} total skippers to import
                    </span>
                    <span className="text-slate-400">
                      {conflictGroups.filter(g => {
                        const existingWithSame = skippers.filter(s => s.sailNo === g.sailNo);
                        const allSailNosInGroup = g.skippers.map(s => s.skipper.sailNo);
                        return !allSailNosInGroup.some((sn, i) => {
                          if (!sn.trim()) return true;
                          if (existingWithSame.some(e => e.sailNo === sn)) return true;
                          return allSailNosInGroup.indexOf(sn) !== i;
                        });
                      }).length} of {conflictGroups.length} conflicts resolved
                    </span>
                  </div>
                </div>
              </div>
            )}

            {importStep === 'complete' && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="text-emerald-400" size={32} />
                </div>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Import Complete</h3>
                <p className="text-slate-400">
                  {skippers.length} skipper{skippers.length !== 1 ? 's' : ''} now in the list
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-3 p-6 border-t border-slate-700">
            <button
              onClick={() => {
                if (importStep === 'mapping') {
                  setImportStep('upload');
                  setImportData([]);
                  setImportHeaders([]);
                  setImportMappings({});
                  setImportAutoDetected(new Set());
                  setPasteText('');
                } else if (importStep === 'conflicts') {
                  setImportStep('mapping');
                  setConflictGroups([]);
                  setAllParsedSkippers([]);
                  setError(null);
                } else {
                  setView('initial');
                }
              }}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
            >
              {importStep === 'complete' ? 'Close' : importStep === 'conflicts' ? 'Back to Mapping' : importStep === 'mapping' ? 'Upload Different Data' : 'Back'}
            </button>
            {importStep === 'mapping' && isRaceOfficer && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToContacts}
                  onChange={e => setSaveToContacts(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-slate-700"
                />
                <span className="text-sm text-slate-300">Save to My Contacts</span>
              </label>
            )}
            {importStep === 'mapping' && (
              <button
                onClick={handleImport}
                disabled={!canImport}
                className={`px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                  canImport
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                Import {importData.length} Skipper{importData.length !== 1 ? 's' : ''}
              </button>
            )}
            {importStep === 'conflicts' && (
              <button
                onClick={handleResolveConflicts}
                className="px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors bg-amber-600 hover:bg-amber-700 text-white"
              >
                Import All {allParsedSkippers.length} Skippers
              </button>
            )}
            {importStep === 'complete' && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Members view with list-based selection
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] backdrop-blur-sm bg-slate-800/95 border border-slate-700">
        {/* Blue gradient header */}
        <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="text-white" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-white">
                Select Members to Add
              </h2>
              <p className="text-sm text-blue-100">
                {currentEvent?.raceClass} Class
                {currentEvent?.isInterclub && " • Interclub Event"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Search bar and Select All/Deselect All buttons */}
          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-700 text-slate-200 placeholder-slate-400 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ArrowUpDown size={14} />
                <span>Sorted by last name (A-Z)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setShowAllMembers(prev => !prev);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    showAllMembers
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users size={12} />
                  {showAllMembers ? 'All Boats' : `${currentEvent?.raceClass || 'Class'} Only`}
                </button>
                <button
                  onClick={() => {
                    setShowOtherClubs(prev => !prev);
                    setSelectedMemberBoats({});
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    showOtherClubs
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sailboat size={12} />
                  Other Clubs
                </button>
              </div>
            </div>

            {membersWithMatchingBoats.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAll}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>

          {(loading || (showOtherClubs && loadingOtherClubs)) ? (
            <div className="text-center py-12 bg-slate-700/50 rounded-lg border border-slate-600 m-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">{showOtherClubs ? 'Loading other clubs...' : 'Loading members...'}</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-red-900/10 border border-red-900/20 rounded-lg m-6">
              <p className="text-red-400">{error}</p>
            </div>
          ) : membersWithMatchingBoats.length === 0 ? (
            <div className="text-center py-12 bg-slate-700/50 rounded-lg border border-slate-600 m-6">
              <Users size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-lg font-medium text-slate-300 mb-2">No Members Found</p>
              <p className="text-slate-400">No members found{showAllMembers ? '' : ` with ${currentEvent?.raceClass} boats`}</p>
              {!showAllMembers && (
                <button
                  onClick={() => setShowAllMembers(true)}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Show All Members
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {membersWithMatchingBoats.map((member) => {
                const matchingBoats = getMatchingBoats(member);
                const hasBoats = matchingBoats.length > 0;
                const hasMultipleBoats = matchingBoats.length > 1;

                return (
                  <div key={member.id} className="bg-slate-700/50 rounded-lg overflow-hidden">
                    {/* Member Header */}
                    <div className="flex items-center gap-3 p-3 bg-slate-700">
                      <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                        {activeAvatars[member.id] ? (
                          <img
                            src={activeAvatars[member.id]}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-600">
                            <span className="text-lg font-semibold text-slate-300">
                              {getInitials(member.first_name, member.last_name)}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-white truncate">
                          {member.first_name} {member.last_name}
                        </h3>
                        <p className="text-xs text-slate-400 truncate">
                          {member.club || 'No club'} • {hasBoats ? `${matchingBoats.length} boat${matchingBoats.length !== 1 ? 's' : ''}` : `No ${currentEvent?.raceClass || ''} boats`}
                        </p>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-600">
                      {hasBoats ? matchingBoats.map((boat) => {
                        const key = `${member.id}-${boat.id}`;
                        const isSelected = !!selectedMemberBoats[key];
                        const isValid = boat.isValid;

                        const isAlreadyAdded = skippers.some(s =>
                          s.name === `${member.first_name} ${member.last_name}` &&
                          s.sailNo === boat.sail_number
                        );

                        return (
                          <div
                            key={key}
                            className={`
                              flex items-center justify-between p-3 transition-colors
                              ${isAlreadyAdded
                                ? 'bg-slate-700/30 text-slate-400 cursor-not-allowed'
                                : isSelected
                                  ? 'bg-blue-600/20 border-l-2 border-blue-500 text-white'
                                  : 'text-white cursor-pointer hover:bg-slate-700/70'
                              }
                              ${!isValid && !isAlreadyAdded ? 'border-l-2 border-amber-500' : ''}
                            `}
                            onClick={() => {
                              if (!isAlreadyAdded) {
                                handleMemberBoatSelect(member, boat);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(30, 58, 138, 0.3)' }}>
                                <Sailboat size={16} className="text-blue-400" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white">
                                    Sail # {boat.sail_number || 'No sail number'}
                                  </span>
                                  {boat.hull && (
                                    <span className="text-sm text-slate-400">
                                      • {boat.hull}
                                    </span>
                                  )}
                                </div>
                                {!isValid && !isAlreadyAdded && (
                                  <span className="text-xs text-amber-400">Missing required info</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {!isAlreadyAdded && isValid && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditMemberBoat(member, boat);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white transition-colors"
                                  title="Edit boat details"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                              {!isAlreadyAdded && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setBoatToDelete({ member, boat });
                                  }}
                                  className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 transition-colors"
                                  title="Delete boat"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {isAlreadyAdded ? (
                                <Check size={18} className="text-green-400" />
                              ) : isSelected ? (
                                <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-500 flex items-center justify-center">
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                              ) : !isValid ? (
                                <Edit2 size={16} className="text-amber-400" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-slate-400"></div>
                              )}
                            </div>
                          </div>
                        );
                      }) : (
                        <div className="p-3 text-center">
                          <p className="text-xs text-slate-500 mb-2">No {currentEvent?.raceClass} boat registered</p>
                        </div>
                      )}

                      <button
                        onClick={() => setShowAddBoatModal(member)}
                        className="flex items-center gap-2 p-3 text-blue-400 hover:bg-slate-700/50 transition-colors w-full text-left"
                      >
                        <Plus size={16} />
                        <span className="text-sm font-medium">Add New {currentEvent?.raceClass} Boat for {member.first_name}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 p-6 border-t border-slate-700">
          <div className="flex gap-2">
            <button
              onClick={() => setView('initial')}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
            >
              Back
            </button>
            <button
              onClick={() => setView('manual')}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700 flex items-center gap-2"
            >
              <UserPlus size={16} />
              Add Manually
            </button>
            <button
              onClick={() => setView('import')}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700 flex items-center gap-2"
            >
              <Upload size={16} />
              Import Skippers
            </button>
          </div>
          <button
            onClick={handleAddSelectedMembers}
            disabled={Object.keys(selectedMemberBoats).length === 0}
            className="btn-primary-green px-4 py-2 rounded-lg font-medium transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Selected ({Object.keys(selectedMemberBoats).length})
          </button>
        </div>
      </div>

      {/* Edit boat modal */}
      {renderEditBoatModal()}

      {/* Add New Boat Modal */}
      {showAddBoatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
            <div className="from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Plus className="text-white" size={24} />
                <h2 className="text-xl font-semibold text-white">
                  Add New Boat
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowAddBoatModal(null);
                  setNewBoatData({ sailNumber: '', hull: '' });
                }}
                className="rounded-full p-2 text-white hover:bg-white/20 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Adding boat for <span className="font-medium text-white">{showAddBoatModal.first_name} {showAddBoatModal.last_name}</span>
              </p>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">
                  Sail Number *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={newBoatData.sailNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setNewBoatData(prev => ({ ...prev, sailNumber: value }));
                  }}
                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                  placeholder="Enter sail number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">
                  Boat Design (Hull) *
                </label>
                <input
                  type="text"
                  required
                  value={newBoatData.hull}
                  onChange={(e) => setNewBoatData(prev => ({ ...prev, hull: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600"
                  placeholder="Enter boat design (e.g., Trance, B6)"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddBoatModal(null);
                    setNewBoatData({ sailNumber: '', hull: '' });
                  }}
                  className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors font-medium"
                  disabled={updateLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNewBoat}
                  disabled={updateLoading || !newBoatData.sailNumber || !newBoatData.hull}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Add Boat</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Boat Confirmation Dialog */}
      {boatToDelete && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
          style={{ zIndex: 9999 }}
          onClick={(e) => {
            console.log('Overlay clicked');
            e.stopPropagation();
          }}
        >
          {console.log('Rendering delete modal')}
          <div
            className="w-full max-w-md rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-lg font-medium text-slate-100">
                Delete Boat
              </h3>
            </div>

            <div className="p-6">
              <p className="text-slate-300 mb-3">
                Are you sure you want to delete this boat from {boatToDelete.member.first_name} {boatToDelete.member.last_name}'s garage?
              </p>
              <div className="bg-slate-700/50 p-3 rounded-lg">
                <p className="text-sm text-slate-300">
                  <span className="font-medium">Sail #:</span> {boatToDelete.boat.sail_number}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="font-medium">Hull:</span> {boatToDelete.boat.hull}
                </p>
              </div>
              <p className="text-sm text-slate-400 mt-3">
                Note: This will not affect any previous race results or scores with this boat.
              </p>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
              <button
                onClick={() => setBoatToDelete(null)}
                disabled={updateLoading}
                className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBoat}
                disabled={updateLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateLoading ? 'Deleting...' : 'Delete Boat'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};