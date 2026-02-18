import { Member, MemberFormData, MemberBoat } from '../types/member';
import { supabase } from './supabase';
import { useAuth } from '../contexts/AuthContext';
import { offlineStorage } from './offlineStorage';

const testSupabaseConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('members').select('id', { count: 'exact', head: true }).limit(1);
    return !error;
  } catch (error) {
    console.warn('Supabase connection test failed:', error);
    return false;
  }
};

// Local storage keys
const MEMBERS_STORAGE_KEY = 'cached_members';
const MEMBERS_TIMESTAMP_KEY = 'cached_members_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache management functions
const getCachedMembers = async (): Promise<Member[]> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId) return [];

    // Try IndexedDB first (offline storage)
    const cachedMembers = await offlineStorage.getCachedMembers(currentClubId);
    if (cachedMembers.length > 0) {
      console.log(`Using ${cachedMembers.length} members from IndexedDB cache`);
      return cachedMembers;
    }

    // Fallback to localStorage
    const cached = localStorage.getItem(MEMBERS_STORAGE_KEY);
    const timestamp = localStorage.getItem(MEMBERS_TIMESTAMP_KEY);

    if (!cached || !timestamp) return [];

    const cacheAge = Date.now() - parseInt(timestamp);
    if (cacheAge > CACHE_DURATION) {
      // Cache expired
      localStorage.removeItem(MEMBERS_STORAGE_KEY);
      localStorage.removeItem(MEMBERS_TIMESTAMP_KEY);
      return [];
    }
    
    return JSON.parse(cached);
  } catch (error) {
    console.error('Error reading cached members:', error);
    return [];
  }
};

const setCachedMembers = async (members: Member[]): Promise<void> => {
  try {
    // Save to localStorage (backwards compatibility)
    localStorage.setItem(MEMBERS_STORAGE_KEY, JSON.stringify(members));
    localStorage.setItem(MEMBERS_TIMESTAMP_KEY, Date.now().toString());

    // Also save to IndexedDB for offline storage
    await offlineStorage.cacheMembers(members);
  } catch (error) {
    console.error('Error caching members:', error);
  }
};

// Generic storage functions
export const getStoredData = async <T>(key: string, defaultValue: T): Promise<T> => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    return JSON.parse(stored);
  } catch (error) {
    console.error(`Error retrieving data for key ${key}:`, error);
    return defaultValue;
  }
};

export const setStoredData = async <T>(key: string, data: T): Promise<void> => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error storing data for key ${key}:`, error);
  }
};

// UUID validation function
export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const getStoredMembers = async (): Promise<Member[]> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      console.warn('Invalid or missing club ID, returning cached members');
      return await getCachedMembers();
    }

    // If offline, use cached data immediately
    if (!navigator.onLine) {
      console.log('Offline - using cached members');
      return await getCachedMembers();
    }

    // Get current user and club
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('No active session, returning cached members');
      return await getCachedMembers();
    }

    // Test Supabase connection first
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      console.warn('Supabase connection failed, using cached data');
      return await getCachedMembers();
    }
    
    // Fetch members for the current club only
    const { data, error } = await supabase
      .from('members')
      .select(`
        *,
        boats: member_boats (*)
      `)
      .eq('club_id', currentClubId);

    if (error) {
      console.error('Error fetching members:', error);
      // Return cached data as fallback
      return await getCachedMembers();
    }

    const members = data.map(member => ({
      ...member,
      boats: member.boats || []
    }));
    
    // Cache the successful result
    await setCachedMembers(members);
    
    return members;
  } catch (error) {
    console.error('Error in getStoredMembers:', error);
    // Return cached data as fallback
    return await getCachedMembers();
  }
};

export const addMember = async (formData: MemberFormData): Promise<Member | null> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }
    
    // Test connection before attempting to add
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }
    
    // Get current user to check if this member should be linked to the user account
    const { data: { user } } = await supabase.auth.getUser();
    
    // Only link the member to the user if the email addresses match
    const shouldLinkToUser = user && user.email && formData.email && user.email.toLowerCase() === formData.email.toLowerCase();
    const userId = shouldLinkToUser ? user.id : null;
    
    // Insert member
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .insert({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || null,
        phone: formData.phone || null,
        club: formData.club || null,
        club_id: currentClubId, // Associate with current club
        street: formData.street || null,
        city: formData.city || null,
        state: formData.state || null,
        postcode: formData.postcode || null,
        date_joined: formData.date_joined || null,
        membership_level: formData.membership_level || null,
        membership_level_custom: formData.membership_level_custom || null,
        is_financial: formData.is_financial,
        amount_paid: formData.amount_paid || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        emergency_contact_relationship: formData.emergency_contact_relationship || null,
        user_id: userId // Only link if emails match
      })
      .select()
      .single();

    if (memberError || !memberData) {
      console.error('Error adding member:', memberError);
      return null;
    }

    // Insert boats if any
    if (formData.boats.length > 0) {
      const { error: boatsError } = await supabase
        .from('member_boats')
        .insert(
          formData.boats.filter(boat => boat.boat_type).map(boat => ({
            member_id: memberData.id,
            boat_type: boat.boat_type || 'DF65',
            sail_number: boat.sail_number || null,
            hull: boat.hull || null,
            handicap: boat.handicap || null
          }))
        );

      if (boatsError) {
        console.error('Error adding boats:', boatsError);
        return null;
      }
    }

    // Fetch complete member data with boats
    const { data: completeMember, error: fetchError } = await supabase
      .from('members')
      .select(`
        *,
        boats: member_boats (*)
      `)
      .eq('id', memberData.id)
      .single();

    if (fetchError || !completeMember) {
      console.error('Error fetching complete member data:', fetchError);
      return null;
    }

    const newMember = {
      ...completeMember,
      boats: completeMember.boats || []
    };
    
    // Update cache with new member
    const cachedMembers = await getCachedMembers();
    const updatedMembers = [...cachedMembers, newMember];
    await setCachedMembers(updatedMembers);

    return newMember;
  } catch (error) {
    console.error('Error in addMember:', error);
    return null;
  }
};

export const addAdminMember = async (formData: MemberFormData, clubId: string): Promise<Member | null> => {
  try {
    if (!clubId || !isValidUUID(clubId)) {
      throw new Error('Invalid club ID provided for admin member addition.');
    }

    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }

    // Explicitly set user_id to NULL for admin-added members
    const userId = null;

    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .insert({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || null,
        phone: formData.phone || null,
        club: formData.club || null, // Use club name from form data
        club_id: clubId,
        street: formData.street || null,
        city: formData.city || null,
        state: formData.state || null,
        postcode: formData.postcode || null,
        date_joined: formData.date_joined || new Date().toISOString().split('T')[0],
        membership_level: formData.membership_level || null,
        membership_level_custom: formData.membership_level_custom || null,
        is_financial: formData.is_financial,
        amount_paid: formData.amount_paid || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        emergency_contact_relationship: formData.emergency_contact_relationship || null,
        user_id: userId // Explicitly NULL for admin additions
      })
      .select()
      .single();

    if (memberError || !memberData) {
      console.error('Error adding admin member:', memberError);
      throw memberError;
    }

    if (formData.boats.length > 0) {
      const { error: boatsError } = await supabase
        .from('member_boats')
        .insert(
          formData.boats.filter(boat => boat.boat_type).map(boat => ({
            member_id: memberData.id,
            boat_type: boat.boat_type || 'DF65',
            sail_number: boat.sail_number || null,
            hull: boat.hull || null,
            handicap: boat.handicap || null
          }))
        );

      if (boatsError) {
        console.error('Error adding boats for admin member:', boatsError);
        throw boatsError;
      }
    }

    const { data: completeMember, error: fetchError } = await supabase
      .from('members')
      .select(`
        *,
        boats: member_boats (*)
      `)
      .eq('id', memberData.id)
      .single();

    if (fetchError || !completeMember) {
      console.error('Error fetching complete admin member data:', fetchError);
      throw fetchError;
    }

    const newMember = {
      ...completeMember,
      boats: completeMember.boats || []
    };

    const cached = await getCachedMembers();
    await setCachedMembers([...cached, newMember]);

    return newMember;
  } catch (error) {
    console.error('Error in addAdminMember:', error);
    throw error;
  }
};

export const updateMember = async (id: string, formData: MemberFormData): Promise<Member | null> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }

    // Test connection before attempting to update
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }

    // Get existing member to check if email is changing
    const { data: existingMember } = await supabase
      .from('members')
      .select('email, user_id')
      .eq('id', id)
      .eq('club_id', currentClubId)
      .single();

    const emailChanged = existingMember &&
                        formData.email &&
                        existingMember.email !== formData.email;

    // If email changed and member is linked to auth user, use admin function
    if (emailChanged && existingMember?.user_id && formData.email) {
      const { data: updateResult, error: emailError } = await supabase
        .rpc('admin_update_member_email', {
          p_member_id: id,
          p_new_email: formData.email
        });

      if (emailError || !updateResult?.success) {
        console.error('Error updating member email:', emailError || updateResult?.error);
        throw new Error(updateResult?.error || 'Failed to update email');
      }
    }

    const updateFields: Record<string, any> = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email || null,
      phone: formData.phone || null,
      club: formData.club || null,
      street: formData.street || null,
      city: formData.city || null,
      state: formData.state || null,
      postcode: formData.postcode || null,
      date_joined: formData.date_joined || null,
      membership_level: formData.membership_level || null,
      membership_level_custom: formData.membership_level_custom || null,
      is_financial: formData.is_financial,
      amount_paid: formData.amount_paid || null,
      emergency_contact_name: formData.emergency_contact_name || null,
      emergency_contact_phone: formData.emergency_contact_phone || null,
      emergency_contact_relationship: formData.emergency_contact_relationship || null,
    };

    const { error: memberError } = await supabase
      .from('members')
      .update(updateFields)
      .eq('id', id)
      .eq('club_id', currentClubId);

    if (memberError) {
      console.error('Error updating member:', memberError);
      return null;
    }

    // Delete existing boats
    const { error: deleteError } = await supabase
      .from('member_boats')
      .delete()
      .eq('member_id', id);

    if (deleteError) {
      console.error('Error deleting boats:', deleteError);
      return null;
    }

    // Insert new boats
    if (formData.boats.length > 0) {
      const { error: boatsError } = await supabase
        .from('member_boats')
        .insert(
          formData.boats.filter(boat => boat.boat_type).map(boat => ({
            member_id: id,
            boat_type: boat.boat_type || 'DF65',
            sail_number: boat.sail_number || null,
            hull: boat.hull || null,
            handicap: boat.handicap || null
          }))
        );

      if (boatsError) {
        console.error('Error updating boats:', boatsError);
        return null;
      }
    }

    // Fetch updated member data
    const { data: updatedMember, error: fetchError } = await supabase
      .from('members')
      .select(`
        *,
        boats: member_boats (*)
      `)
      .eq('id', id)
      .eq('club_id', currentClubId) // Ensure we only fetch members from current club
      .single();

    if (fetchError || !updatedMember) {
      console.error('Error fetching updated member data:', fetchError);
      return null;
    }

    const member = {
      ...updatedMember,
      boats: updatedMember.boats || []
    };
    
    // Update cache
    const cachedMembers = await getCachedMembers();
    const updatedMembers = cachedMembers.map(m => m.id === id ? member : m);
    await setCachedMembers(updatedMembers);

    return member;
  } catch (error) {
    console.error('Error in updateMember:', error);
    return null;
  }
};

export const updateMemberBoat = async (
  memberId: string, 
  boatId: string, 
  updates: { sail_number?: string; hull?: string; }
): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }
    
    // Test connection before attempting to update
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }
    
    // Update the boat
    const { error } = await supabase
      .from('member_boats')
      .update(updates)
      .eq('id', boatId)
      .eq('member_id', memberId);
    
    if (error) {
      console.error('Error updating boat:', error);
      return false;
    }
    
    // Update cache
    const cachedMembers = await getCachedMembers();
    const updatedMembers = cachedMembers.map(member => {
      if (member.id === memberId && member.boats) {
        const updatedBoats = member.boats.map(boat => {
          if (boat.id === boatId) {
            return { ...boat, ...updates };
          }
          return boat;
        });
        return { ...member, boats: updatedBoats };
      }
      return member;
    });
    await setCachedMembers(updatedMembers);
    
    return true;
  } catch (error) {
    console.error('Error in updateMemberBoat:', error);
    return false;
  }
};

export const updateMemberClub = async (
  memberId: string,
  clubName: string
): Promise<boolean> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }
    
    // Test connection before attempting to update
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }
    
    // Update the member's club
    const { error } = await supabase
      .from('members')
      .update({ club: clubName })
      .eq('id', memberId)
      .eq('club_id', currentClubId);
    
    if (error) {
      console.error('Error updating member club:', error);
      return false;
    }
    
    // Update cache
    const cachedMembers = await getCachedMembers();
    const updatedMembers = cachedMembers.map(member => {
      if (member.id === memberId) {
        return { ...member, club: clubName };
      }
      return member;
    });
    await setCachedMembers(updatedMembers);
    
    return true;
  } catch (error) {
    console.error('Error in updateMemberClub:', error);
    return false;
  }
};

export const archiveMember = async (
  id: string,
  removeAuthAccess: boolean = false,
  reason?: string
): Promise<{ success: boolean; error?: string; details?: any }> => {
  try {
    // Get current club from localStorage
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to archive members');
    }

    // Test connection before attempting to archive
    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }

    // Use the archive function (preserves all data)
    const { data, error } = await supabase.rpc('archive_member', {
      p_member_id: id,
      p_club_id: currentClubId,
      p_archived_by: user.id,
      p_archive_reason: reason || null,
      p_delete_auth_user: removeAuthAccess
    });

    if (error) {
      console.error('Error archiving member:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to archive member'
      };
    }

    console.log('Member archive summary:', data);

    // Update cache - mark as archived but keep in cache
    const cachedMembers = await getCachedMembers();
    const updatedMembers = cachedMembers.map(m =>
      m.id === id
        ? { ...m, membership_status: 'archived', archived_at: new Date().toISOString() }
        : m
    );
    await setCachedMembers(updatedMembers);

    return {
      success: true,
      details: data
    };
  } catch (error) {
    console.error('Error in archiveMember:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

export const restoreMember = async (id: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const currentClubId = localStorage.getItem('currentClubId');
    if (!currentClubId || !isValidUUID(currentClubId)) {
      throw new Error('No club selected or invalid club ID');
    }

    const isConnected = await testSupabaseConnection();
    if (!isConnected) {
      throw new Error('Unable to connect to database. Please check your internet connection.');
    }

    const { data, error } = await supabase.rpc('restore_member', {
      p_member_id: id,
      p_club_id: currentClubId
    });

    if (error) {
      console.error('Error restoring member:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to restore member'
      };
    }

    // Update cache
    const cachedMembers = await getCachedMembers();
    const updatedMembers = cachedMembers.map(m =>
      m.id === id
        ? { ...m, membership_status: 'active', archived_at: null }
        : m
    );
    await setCachedMembers(updatedMembers);

    return { success: true };
  } catch (error) {
    console.error('Error in restoreMember:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

// Legacy function - kept for backwards compatibility but now uses archive
export const deleteMember = async (
  id: string,
  deleteAuthUser: boolean = false
): Promise<{ success: boolean; error?: string; details?: any }> => {
  // Now archives instead of deleting to preserve historical data
  return archiveMember(id, deleteAuthUser, 'Member deleted (archived)');
};

export const addMembers = async (formDataArray: MemberFormData[]): Promise<Member[]> => {
  const newMembers: Member[] = [];

  for (const formData of formDataArray) {
    const member = await addMember(formData);
    if (member) {
      newMembers.push(member);
    }
  }

  return newMembers;
};

// Helper functions
export const parseDate = (dateStr: string): string | null => {
  if (!dateStr) return null;

  const formats = [
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      parse: (matches: RegExpMatchArray) => {
        const day = matches[1].padStart(2, '0');
        const month = matches[2].padStart(2, '0');
        return `${matches[3]}-${month}-${day}`;
      }
    },
    {
      regex: /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/,
      parse: (matches: RegExpMatchArray) => {
        const months: Record<string, string> = {
          'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
          'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        const day = matches[1].padStart(2, '0');
        const month = months[matches[2].toLowerCase()] || '01';
        const year = parseInt(matches[3]) < 50 ? `20${matches[3]}` : `19${matches[3]}`;
        return `${year}-${month}-${day}`;
      }
    }
  ];

  for (const format of formats) {
    const matches = dateStr.match(format.regex);
    if (matches) {
      return format.parse(matches);
    }
  }

  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
};

export const parseAmount = (amountStr: string): number | null => {
  if (!amountStr) return null;

  const cleaned = amountStr.replace(/[$,\s]/g, '');
  const amount = parseFloat(cleaned);

  return isNaN(amount) ? null : amount;
};

// Session management functions
export const getEditSession = (): { memberId: string; timestamp: number } | null => {
  const session = sessionStorage.getItem('member-edit-session');
  if (!session) return null;
  return JSON.parse(session);
};

export const setEditSession = (memberId: string) => {
  sessionStorage.setItem('member-edit-session', JSON.stringify({
    memberId,
    timestamp: Date.now()
  }));
};

export const clearEditSession = () => {
  sessionStorage.removeItem('member-edit-session');
};

export const isEditSessionValid = (timeoutMinutes = 30): boolean => {
  const session = getEditSession();
  if (!session) return false;
  
  const now = Date.now();
  const elapsed = now - session.timestamp;
  const timeoutMs = timeoutMinutes * 60 * 1000;
  
  return elapsed < timeoutMs;
};