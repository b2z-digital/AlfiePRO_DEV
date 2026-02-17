import { supabase } from './supabase';
import { Club } from '../types/club';
import { ClubRole } from '../types/auth';

export const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName
      }
    }
  });

  if (error) throw error;
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
};

export const signOut = async () => {
  console.log('Signing out from auth.ts');
  
  // Clear local storage first
  localStorage.removeItem('currentClubId');
  localStorage.removeItem('current-event');
  sessionStorage.clear();
  
  // Then sign out from Supabase
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Error in auth.ts signOut:', error);
    throw error;
  }
  
  console.log('Sign out successful in auth.ts');
};

export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const updateUserProfile = async (updates: { firstName?: string; lastName?: string; avatarUrl?: string }) => {
  const userData: Record<string, any> = {};
  
  if (updates.firstName !== undefined) {
    userData.first_name = updates.firstName;
  }
  
  if (updates.lastName !== undefined) {
    userData.last_name = updates.lastName;
  }
  
  if (updates.avatarUrl !== undefined) {
    userData.avatar_url = updates.avatarUrl;
  }
  
  const { error } = await supabase.auth.updateUser({
    data: userData
  });
  
  if (error) throw error;
};

export const uploadAvatar = async (file: File): Promise<string | null> => {
  try {
    const { compressImage } = await import('./imageCompression');
    const compressed = await compressImage(file, 'avatar');

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error('User not found');

    const fileExt = compressed.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;
    const filePath = fileName;

    const { error: uploadError } = await supabase.storage
      .from('user-avatars')
      .upload(filePath, compressed, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (uploadError) throw uploadError;
    
    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('user-avatars')
      .getPublicUrl(filePath);
    
    return publicUrl;
  } catch (error) {
    console.error('Error uploading avatar:', error);
    throw error;
  }
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

export const isAuthenticated = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error checking authentication status:', error.message);
      return false;
    }
    return !!session;
  } catch (err) {
    console.error('Unexpected error during authentication check:', err);
    return false;
  }
};

// Get user clubs with club details
export const getUserClubs = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // First get the user_clubs entries
    const { data: userClubsData, error: userClubsError } = await supabase
      .from('user_clubs')
      .select('id, role, club_id')
      .eq('user_id', user.id);

    if (userClubsError) {
      console.error('Error getting user clubs:', userClubsError);
      return [];
    }

    // For each club, get the club details
    const clubDetailsPromises = userClubsData.map(async (uc) => {
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('id, name, abbreviation, logo')
        .eq('id', uc.club_id)
        .single();

      if (clubError) {
        console.error(`Error getting club details for ${uc.club_id}:`, clubError);
        return {
          ...uc,
          club: null
        };
      }

      return {
        ...uc,
        club: clubData
      };
    });

    const clubsWithDetails = await Promise.all(clubDetailsPromises);
    return clubsWithDetails;
  } catch (error) {
    console.error('Error in getUserClubs:', error);
    return [];
  }
};

// Functions for team management - using only client-side safe operations
export const getClubMembers = async (clubId: string) => {
  try {
    // Only get user_clubs data - no user details from auth.users
    const { data, error } = await supabase
      .from('user_clubs')
      .select(`
        id,
        user_id,
        club_id,
        role,
        created_at,
        updated_at
      `)
      .eq('club_id', clubId);

    if (error) throw error;
    
    // Return the user_clubs data without any user profile information
    // The frontend will handle displaying appropriate information for the current user only
    return data || [];
  } catch (error) {
    console.error('Error in getClubMembers:', error);
    throw error;
  }
};

export const getClubInvitations = async (clubId: string) => {
  try {
    const { data, error } = await supabase
      .from('invitations')
      .select(`
        id,
        email,
        club_id,
        role,
        invited_by,
        token,
        expires_at,
        created_at,
        updated_at
      `)
      .eq('club_id', clubId);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error in getClubInvitations:', error);
    throw error;
  }
};

export const createInvitation = async (email: string, clubId: string, role: ClubRole) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Generate a random token for the invitation
    const token = crypto.randomUUID();

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        email,
        club_id: clubId,
        role,
        invited_by: user.id,
        token
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error in createInvitation:', error);
    throw error;
  }
};

export const deleteInvitation = async (invitationId: string) => {
  try {
    const { error } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;
  } catch (error) {
    console.error('Error in deleteInvitation:', error);
    throw error;
  }
};

export const acceptInvitation = async (token: string, password: string) => {
  try {
    // First get the invitation
    const { data: invitation, error: invitationError } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (invitationError) throw invitationError;
    if (!invitation) throw new Error('Invitation not found');

    // Check if invitation has expired
    if (new Date(invitation.expires_at) < new Date()) {
      throw new Error('Invitation has expired');
    }

    // Check if user already exists by trying to sign in
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password: password
      });

      if (signInError && signInError.message !== 'Invalid login credentials') {
        throw signInError;
      }

      if (signInData.user) {
        // User exists and signed in successfully, add them to the club
        const { error: addError } = await supabase
          .from('user_clubs')
          .insert({
            user_id: signInData.user.id,
            club_id: invitation.club_id,
            role: invitation.role
          });

        if (addError) throw addError;
        
        // Check if there's a member record with this email
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('*')
          .eq('email', invitation.email)
          .eq('club_id', invitation.club_id)
          .maybeSingle();
        
        if (memberError && memberError.code !== 'PGRST116') throw memberError;
        
        // If member record exists, link it to the user
        if (memberData) {
          const { error: updateError } = await supabase
            .from('members')
            .update({ user_id: signInData.user.id })
            .eq('id', memberData.id);
          
          if (updateError) throw updateError;
        }
      } else {
        // User doesn't exist, create new user
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: invitation.email,
          password: password
        });

        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('Failed to create user');

        // Add user to club
        const { error: addError } = await supabase
          .from('user_clubs')
          .insert({
            user_id: authData.user.id,
            club_id: invitation.club_id,
            role: invitation.role
          });

        if (addError) throw addError;
        
        // Check if there's a member record with this email
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('*')
          .eq('email', invitation.email)
          .eq('club_id', invitation.club_id)
          .maybeSingle();
        
        if (memberError && memberError.code !== 'PGRST116') throw memberError;
        
        // If member record exists, link it to the user
        if (memberData) {
          const { error: updateError } = await supabase
            .from('members')
            .update({ user_id: authData.user.id })
            .eq('id', memberData.id);
          
          if (updateError) throw updateError;
        }
      }
    } catch (error) {
      // If sign in failed, try to create new user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.email,
        password: password
      });

      if (signUpError) throw signUpError;
      if (!authData.user) throw new Error('Failed to create user');

      // Add user to club
      const { error: addError } = await supabase
        .from('user_clubs')
        .insert({
          user_id: authData.user.id,
          club_id: invitation.club_id,
          role: invitation.role
        });

      if (addError) throw addError;
      
      // Check if there's a member record with this email
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('email', invitation.email)
        .eq('club_id', invitation.club_id)
        .maybeSingle();
      
      if (memberError && memberError.code !== 'PGRST116') throw memberError;
      
      // If member record exists, link it to the user
      if (memberData) {
        const { error: updateError } = await supabase
          .from('members')
          .update({ user_id: authData.user.id })
          .eq('id', memberData.id);
        
        if (updateError) throw updateError;
      }
    }

    // Delete the invitation
    const { error: deleteError } = await supabase
      .from('invitations')
      .delete()
      .eq('id', invitation.id);

    if (deleteError) throw deleteError;
  } catch (error) {
    console.error('Error in acceptInvitation:', error);
    throw error;
  }
};

export const updateUserRole = async (userId: string, clubId: string, role: ClubRole) => {
  try {
    const { error } = await supabase
      .from('user_clubs')
      .update({ role })
      .match({ user_id: userId, club_id: clubId });

    if (error) throw error;
  } catch (error) {
    console.error('Error in updateUserRole:', error);
    throw error;
  }
};

export const removeUserFromClub = async (userId: string, clubId: string) => {
  try {
    const { error } = await supabase
      .from('user_clubs')
      .delete()
      .match({ user_id: userId, club_id: clubId });

    if (error) throw error;
  } catch (error) {
    console.error('Error in removeUserFromClub:', error);
    throw error;
  }
};

// Create a new club and add the current user as admin
export const createClub = async (name: string, abbreviation: string, logo?: string | null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Create the club using regular client - RLS policies will handle permissions
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .insert({
        name,
        abbreviation,
        logo,
        created_by_user_id: user.id
      })
      .select()
      .single();

    if (clubError) throw clubError;
    if (!club) throw new Error('Failed to create club');

    return club;
  } catch (error) {
    console.error('Error in createClub:', error);
    throw error;
  }
};

// Get all clubs for the current user
export const getUserClubsWithDetails = async (): Promise<Club[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('user_clubs')
      .select(`
        club:club_id (
          id,
          name,
          abbreviation,
          logo,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id);

    if (error) throw error;
    
    // Extract the club data from the results
    return data.map(item => item.club) || [];
  } catch (error) {
    console.error('Error in getUserClubsWithDetails:', error);
    return [];
  }
};

// Link member record to user account
export const linkMemberToUser = async (memberId: string, userId: string) => {
  try {
    const { error } = await supabase
      .from('members')
      .update({ user_id: userId })
      .eq('id', memberId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error linking member to user:', error);
    throw error;
  }
};