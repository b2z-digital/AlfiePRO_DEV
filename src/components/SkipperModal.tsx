import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Users, UserPlus, UserCog, AlertCircle, Check, Edit2, Search, ChevronRight, Sailboat, ArrowUpDown, Upload, FileUp, Trash2 } from 'lucide-react';
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
  const [view, setView] = useState<'initial' | 'members' | 'manual' | 'import' | 'edit'>('initial');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMappings, setImportMappings] = useState<Record<string, string>>({});
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'importing' | 'complete'>('upload');
  const [members, setMembers] = useState<MemberWithValidation[]>([]);
  const [memberAvatars, setMemberAvatars] = useState<{[key: string]: string}>({});
  const [selectedMemberBoats, setSelectedMemberBoats] = useState<Record<string, MemberBoat>>({});
  const [manualSkipper, setManualSkipper] = useState({
    name: '',
    sailNo: '',
    hull: '', // Added hull field for boat design
    club: '',
    country: 'Australia',
    countryCode: 'AU',
    category: '',
    clubState: '',
    boatModel: currentEvent?.raceClass || '',
    startHcap: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipperToRemove, setSkipperToRemove] = useState<number | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [editingBoat, setEditingBoat] = useState<EditableBoatData | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMemberBoat, setEditingMemberBoat] = useState<EditableBoatData | null>(null);
  const [attendingMembers, setAttendingMembers] = useState<string[]>([]);
  const [editingSkipperIndex, setEditingSkipperIndex] = useState<number | null>(null);
  const [showAddBoatModal, setShowAddBoatModal] = useState<Member | null>(null);
  const [newBoatData, setNewBoatData] = useState({ sailNumber: '', hull: '' });
  const [boatToDelete, setBoatToDelete] = useState<{ member: Member; boat: MemberBoat } | null>(null);
  const navigate = useNavigate();

  // Reset view to initial when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView('initial');
      setImportFile(null);
      setImportData([]);
      setImportHeaders([]);
      setImportMappings({});
      setImportStep('upload');
      setError(null);
      setEditingSkipperIndex(null);
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

    // Reset form data when modal opens
    if (isOpen) {
      setManualSkipper({
        name: '',
        sailNo: '',
        hull: '', // Reset hull field
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

      // Default to members view if there are no skippers yet
      if (skippers.length === 0) {
        setView('members');
      }
    }
  }, [isOpen, currentEvent?.raceClass, view, skippers.length, currentEvent?.isInterclub, currentEvent?.otherClubId, currentEvent?.clubId]);

  // Fetch attendance data when modal opens
  useEffect(() => {
    const fetchAttendance = async () => {
      if (!isOpen || !currentEvent?.id) return;

      try {
        // Extract the database UUID from the event ID
        // For series events like "uuid-round-1" or "uuid-day-2", we need the first 5 parts
        const dbEventId = (() => {
          const eventId = currentEvent.id;
          if (eventId.includes('-round-') || eventId.includes('-day-')) {
            const parts = eventId.split('-');
            return parts.slice(0, 5).join('-');
          }
          return eventId;
        })();

        console.log('🔍 SkipperModal: Fetching attendance for event:', {
          originalId: currentEvent.id,
          dbEventId,
          eventName: currentEvent.eventName
        });

        const { data, error } = await supabase
          .from('event_attendance')
          .select('user_id, status')
          .eq('event_id', dbEventId)
          .eq('status', 'yes');

        if (error) {
          console.error('❌ Error fetching attendance:', error);
          return;
        }

        console.log('✅ Attendance data fetched:', data);

        // Get user IDs of users who are attending
        if (data) {
          const attendingUserIds = data.map(a => a.user_id);
          console.log('👥 Attending user IDs:', attendingUserIds);
          setAttendingMembers(attendingUserIds);
        }
      } catch (err) {
        console.error('❌ Error in fetchAttendance:', err);
      }
    };

    fetchAttendance();
  }, [isOpen, currentEvent?.id]);

  // Auto-select members who marked themselves as attending
  useEffect(() => {
    console.log('🎯 Auto-selection check:', {
      isOpen,
      view,
      membersCount: members.length,
      attendingMembersCount: attendingMembers.length,
      skippersCount: skippers.length,
      existingSelectionsCount: Object.keys(selectedMemberBoats).length
    });

    if (!isOpen || view !== 'members' || members.length === 0 || attendingMembers.length === 0) {
      console.log('⏭️ Skipping auto-selection: preconditions not met');
      return;
    }

    // Only auto-select if no skippers exist yet and no selections have been made
    if (skippers.length > 0 || Object.keys(selectedMemberBoats).length > 0) {
      console.log('⏭️ Skipping auto-selection: skippers or selections already exist');
      return;
    }

    const autoSelections: Record<string, MemberBoat> = {};

    members.forEach(member => {
      // Check if this member's user_id is in the attending list
      if (member.user_id && attendingMembers.includes(member.user_id)) {
        console.log(`✅ Found attending member: ${member.first_name} ${member.last_name} (user_id: ${member.user_id})`);

        // Find a valid boat for this member that matches the event class
        const validBoat = member.boats?.find(boat =>
          boat.boat_type === currentEvent?.raceClass &&
          boat.sail_number &&
          boat.hull
        );

        if (validBoat) {
          console.log(`  ⛵ Found valid boat: ${validBoat.sail_number} (${validBoat.boat_type})`);
          const key = `${member.id}-${validBoat.id}`;
          // Check if this sail number isn't already used
          const sailNoInUse = skippers.some(s => s.sailNo === validBoat.sail_number);
          if (!sailNoInUse) {
            autoSelections[key] = validBoat;
            console.log(`  ✅ Auto-selecting boat ${validBoat.sail_number}`);
          } else {
            console.log(`  ⚠️ Sail number ${validBoat.sail_number} already in use`);
          }
        } else {
          console.log(`  ❌ No valid boat found for ${member.first_name} ${member.last_name}`);
          console.log(`     Boats:`, member.boats?.map(b => ({
            type: b.boat_type,
            sailNo: b.sail_number,
            hull: b.hull
          })));
        }
      }
    });

    console.log('🎯 Auto-selections to apply:', Object.keys(autoSelections).length);

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

    // Check if sail number is already used by any skipper
    const existingSkipperWithSailNo = skippers.find(s => s.sailNo === boat.sail_number);
    if (existingSkipperWithSailNo) {
      setError(`Sail number ${boat.sail_number} is already used by ${existingSkipperWithSailNo.name}`);
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

    membersWithMatchingBoats.forEach(member => {
      const matchingBoats = getMatchingBoats(member);

      // Only select the first valid boat for each member
      const firstValidBoat = matchingBoats.find(boat => {
        const isValid = boat.isValid;
        const isAlreadyAdded = skippers.some(s =>
          s.name === `${member.first_name} ${member.last_name}` &&
          s.sailNo === boat.sail_number
        );
        return isValid && !isAlreadyAdded;
      });

      if (firstValidBoat) {
        const key = `${member.id}-${firstValidBoat.id}`;
        newSelections[key] = firstValidBoat;
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

      setUpdateSuccess("Member information updated successfully");

      // Clear the editing state after a short delay
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
    const newSkippers = [];
    
    for (const boat of Object.values(selectedMemberBoats)) {
      const member = members.find(m => m.id === boat.member_id);
      if (member && boat.boat_type === currentEvent?.raceClass) {
        // Check if this member is already in the skippers list
        const existingSkipper = skippers.find(s => 
          s.name === `${member.first_name} ${member.last_name}` && 
          s.sailNo === boat.sail_number
        );
        
        if (!existingSkipper) {
          // Ensure all required data is present
          if (!boat.sail_number || !boat.hull || !member.club) {
            setError(`Cannot add ${member.first_name} ${member.last_name} - missing required information`);
            continue;
          }
          
          const newSkipper = {
            name: `${member.first_name} ${member.last_name}`,
            sailNo: boat.sail_number || '',
            hull: boat.hull || '', // Store hull information
            club: member.club || '',
            boatModel: boat.hull || boat.boat_type, // Use hull (boat model name) instead of boat_type
            startHcap: boat.handicap || 0,
            avatarUrl: memberAvatars[member.id] ? memberAvatars[member.id] : undefined,
            memberId: member.id,
            boatId: boat.id,
            country_code: member.country_code,
            country: member.country,
            category: member.category,
            state: member.state
          };
          newSkippers.push(newSkipper);
        }
      }
    }
    
    if (newSkippers.length > 0) {
      onUpdateSkippers([...updatedSkippers, ...newSkippers]);
      setView('initial'); // Return to initial view
      setSelectedMemberBoats({}); // Reset selections
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
      boatModel: manualSkipper.hull || manualSkipper.boatModel, // Use hull (boat design) as the boat model
      startHcap: manualSkipper.startHcap || 0,
      country_code: manualSkipper.countryCode, // Map camelCase to snake_case
      country: manualSkipper.country,
      category: manualSkipper.category
    }];

    onUpdateSkippers(updatedSkippers);

    // Reset form
    setManualSkipper({
      name: '',
      sailNo: '',
      hull: '', // Reset hull field
      club: '',
      country: 'Australia',
      countryCode: 'AU',
      category: '',
      clubState: '',
      boatModel: currentEvent?.raceClass || '',
      startHcap: 0
    });

    // If not keeping the form open, return to initial view
    if (!keepAdding) {
      setView('initial');
    }
  };
  
  const handleEditSkipper = (index: number) => {
    const skipper = skippers[index];
    setEditingSkipperIndex(index);
    setManualSkipper({
      name: skipper.name,
      sailNo: skipper.sailNo,
      hull: skipper.hull || '',
      club: skipper.club || '',
      country: skipper.country || 'Australia',
      countryCode: skipper.countryCode || 'AU',
      category: skipper.category || '',
      clubState: skipper.clubState || '',
      boatModel: currentEvent?.raceClass || '',
      startHcap: skipper.startHcap || 0
    });
    setView('edit');
  };

  const handleUpdateSkipper = () => {
    if (editingSkipperIndex === null) return;

    const updatedSkippers = [...skippers];
    updatedSkippers[editingSkipperIndex] = {
      ...updatedSkippers[editingSkipperIndex],
      name: manualSkipper.name,
      sailNo: manualSkipper.sailNo,
      hull: manualSkipper.hull,
      club: manualSkipper.club,
      country: manualSkipper.country,
      countryCode: manualSkipper.countryCode,
      category: manualSkipper.category,
      clubState: manualSkipper.clubState,
      boatModel: currentEvent?.raceClass || '',
    };

    onUpdateSkippers(updatedSkippers);
    setEditingSkipperIndex(null);
    setView('initial');

    // Reset form
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

  // Filter members to only show those with matching boats and sort alphabetically by last name
  const membersWithMatchingBoats = filteredMembers
    .filter(hasMatchingBoats)
    .sort((a, b) => {
      const lastNameA = a.last_name.toLowerCase();
      const lastNameB = b.last_name.toLowerCase();
      if (lastNameA < lastNameB) return -1;
      if (lastNameA > lastNameB) return 1;
      // If last names are equal, sort by first name
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
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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
                <h3 className="text-sm font-medium mb-3 text-slate-300">
                  Current Skippers
                </h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {skippers.map((skipper, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-slate-700 text-slate-200"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center">
                          {/* Try to find a matching member with this name who has an avatar */}
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
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-lg rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700">
          {/* Blue gradient header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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

            {/* Country field */}
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

            {/* Category field */}
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
    );
  }

  // Import view
  if (view === 'import') {
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setImportData(results.data);
            setImportHeaders(results.meta.fields || []);
            setImportStep('mapping');

            // Auto-detect mappings
            const autoMappings: Record<string, string> = {};
            results.meta.fields?.forEach(header => {
              const normalized = header.toLowerCase().trim();
              if (normalized.includes('first') || normalized.includes('fname')) autoMappings[header] = 'first_name';
              else if (normalized.includes('last') || normalized.includes('lname') || normalized.includes('surname')) autoMappings[header] = 'last_name';
              else if (normalized.includes('club')) autoMappings[header] = 'club';
              else if (normalized.includes('boat') || normalized.includes('class') || normalized.includes('type')) autoMappings[header] = 'boat_type';
              else if (normalized.includes('sail') || normalized.includes('number')) autoMappings[header] = 'sail_number';
              else if (normalized.includes('country') && (normalized.includes('code') || normalized.includes('ioc'))) autoMappings[header] = 'country_code';
              else if (normalized.includes('country')) autoMappings[header] = 'country';
              else if (normalized.includes('category') || normalized.includes('age')) autoMappings[header] = 'category';
            });
            setImportMappings(autoMappings);
          }
        });
      };
      reader.readAsText(file);
    };

    const handleImport = async () => {
      setImportStep('importing');
      const newSkippers: Skipper[] = [];

      // Reverse the mapping: field -> CSV column
      const fieldToColumn: Record<string, string> = {};
      Object.entries(importMappings).forEach(([csvColumn, field]) => {
        fieldToColumn[field] = csvColumn;
      });

      for (const row of importData) {
        const firstName = row[fieldToColumn['first_name']] || '';
        const lastName = row[fieldToColumn['last_name']] || '';
        const club = row[fieldToColumn['club']] || '';
        const boatType = row[fieldToColumn['boat_type']] || currentEvent?.raceClass || '';
        const sailNo = row[fieldToColumn['sail_number']] || '';
        const countryCode = row[fieldToColumn['country_code']] || '';
        const country = row[fieldToColumn['country']] || '';
        const category = row[fieldToColumn['category']] || '';

        if (firstName && lastName && sailNo) {
          newSkippers.push({
            name: `${firstName} ${lastName}`.trim(),
            sailNo,
            club,
            boatModel: boatType,
            hull: boatType, // Set hull to boat type so it displays under skipper name
            startHcap: 0,
            country_code: countryCode,
            country: country,
            category: category
          });
        }
      }

      onUpdateSkippers([...skippers, ...newSkippers]);
      setImportStep('complete');
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-3xl rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700 max-h-[90vh] flex flex-col">
          {/* Blue gradient header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Upload className="text-white" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Import Skippers
                </h2>
                <p className="text-sm text-blue-100">
                  Upload CSV or XLS file with skipper details
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
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center">
                  <FileUp className="mx-auto mb-4 text-slate-500" size={48} />
                  <h3 className="text-lg font-medium text-slate-200 mb-2">Upload Skipper File</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    CSV or XLS file with columns: First Name, Last Name, Club, Boat Type, Sail Number
                  </p>
                  <label className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
                    Choose File
                    <input
                      type="file"
                      accept=".csv,.xls,.xlsx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {importStep === 'mapping' && (
              <div className="space-y-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-slate-200 mb-4">Map Your Columns</h3>
                  <p className="text-sm text-slate-400 mb-4">
                    Found {importData.length} rows. Map your CSV columns to the required fields:
                  </p>
                  <div className="space-y-3">
                    {[
                      { field: 'first_name', label: 'First Name', required: true },
                      { field: 'last_name', label: 'Last Name', required: true },
                      { field: 'club', label: 'Club', required: false },
                      { field: 'boat_type', label: 'Boat Type', required: false },
                      { field: 'sail_number', label: 'Sail Number', required: true },
                      { field: 'country_code', label: 'Country Code (IOC)', required: false },
                      { field: 'country', label: 'Country Name', required: false },
                      { field: 'category', label: 'Category', required: false }
                    ].map(({ field, label, required }) => {
                      const isMapped = Object.values(importMappings).includes(field);
                      return (
                        <div key={field} className="flex items-center gap-4">
                          <label className="w-32 text-sm font-medium text-slate-300 flex items-center gap-2">
                            {label}
                            {required && <span className="text-red-400">*</span>}
                            {isMapped && <Check className="text-green-400" size={16} />}
                          </label>
                          <select
                            value={Object.keys(importMappings).find(k => importMappings[k] === field) || ''}
                            onChange={(e) => {
                              const newMappings = { ...importMappings };
                              Object.keys(newMappings).forEach(k => {
                                if (newMappings[k] === field) delete newMappings[k];
                              });
                              if (e.target.value) newMappings[e.target.value] = field;
                              setImportMappings(newMappings);
                            }}
                            className={`flex-1 px-3 py-2 rounded-lg border text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isMapped
                                ? 'bg-slate-700 border-green-500/50'
                                : 'bg-slate-700 border-slate-600'
                            }`}
                          >
                            <option value="">Select column...</option>
                            {importHeaders.map(header => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {importStep === 'importing' && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-400">Importing skippers...</p>
              </div>
            )}

            {importStep === 'complete' && (
              <div className="text-center py-12">
                <Check className="mx-auto mb-4 text-green-400" size={48} />
                <h3 className="text-lg font-medium text-slate-200 mb-2">Import Complete!</h3>
                <p className="text-slate-400">Successfully imported skippers</p>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-3 p-6 border-t border-slate-700">
            <button
              onClick={() => setView('initial')}
              className="px-4 py-2 rounded-lg font-medium transition-colors text-slate-300 hover:text-slate-100 hover:bg-slate-700"
            >
              {importStep === 'complete' ? 'Close' : 'Back'}
            </button>
            {importStep === 'mapping' && (
              <button
                onClick={handleImport}
                disabled={
                  !Object.values(importMappings).includes('first_name') ||
                  !Object.values(importMappings).includes('last_name') ||
                  !Object.values(importMappings).includes('sail_number')
                }
                className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
              >
                Import {importData.length} Skippers
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
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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

            {/* Sort indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-400 px-2">
              <ArrowUpDown size={14} />
              <span>Sorted by last name (A-Z)</span>
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

          {loading ? (
            <div className="text-center py-12 bg-slate-700/50 rounded-lg border border-slate-600 m-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading members...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-red-900/10 border border-red-900/20 rounded-lg m-6">
              <p className="text-red-400">{error}</p>
            </div>
          ) : membersWithMatchingBoats.length === 0 ? (
            <div className="text-center py-12 bg-slate-700/50 rounded-lg border border-slate-600 m-6">
              <Users size={48} className="mx-auto mb-4 text-slate-600" />
              <p className="text-lg font-medium text-slate-300 mb-2">No Members Found</p>
              <p className="text-slate-400">No members found with {currentEvent?.raceClass} boats</p>
            </div>
          ) : (
            <div className="space-y-3">
              {membersWithMatchingBoats.map((member) => {
                const matchingBoats = getMatchingBoats(member);
                const hasMultipleBoats = matchingBoats.length > 1;

                return (
                  <div key={member.id} className="bg-slate-700/50 rounded-lg overflow-hidden">
                    {/* Member Header */}
                    <div className="flex items-center gap-3 p-3 bg-slate-700">
                      <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                        {memberAvatars[member.id] ? (
                          <img
                            src={memberAvatars[member.id]}
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
                          {member.club || 'No club'} • {matchingBoats.length} boat{matchingBoats.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {/* Boats List */}
                    <div className="divide-y divide-slate-600">
                      {matchingBoats.map((boat) => {
                        const key = `${member.id}-${boat.id}`;
                        const isSelected = !!selectedMemberBoats[key];
                        const isValid = boat.isValid;

                        // Check if this member/boat is already in the skippers list
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
                            {/* Boat info */}
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

                            {/* Actions */}
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
                                    console.log('DELETE BUTTON CLICKED!', { member, boat });
                                    e.stopPropagation();
                                    e.preventDefault();
                                    console.log('About to set boatToDelete');
                                    setBoatToDelete({ member, boat });
                                    console.log('boatToDelete set');
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
                      })}

                      {/* Add New Boat Button */}
                      <button
                        onClick={() => setShowAddBoatModal(member)}
                        className="flex items-center gap-2 p-3 text-blue-400 hover:bg-slate-700/50 transition-colors w-full text-left"
                      >
                        <Plus size={16} />
                        <span className="text-sm font-medium">Add New Boat for {member.first_name}</span>
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
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
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