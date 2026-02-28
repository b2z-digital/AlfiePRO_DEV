import { supabase } from './supabase';

// Types
export interface ClubMembership {
  id: string;
  member_id: string;
  club_id: string;
  membership_type_id?: string;
  relationship_type: 'primary' | 'affiliate' | 'guest' | 'honorary';
  status: 'active' | 'pending' | 'expired' | 'archived';
  joined_date?: string;
  expiry_date?: string;
  payment_status: 'paid' | 'unpaid' | 'partial' | 'overdue';
  annual_fee_amount?: number;
  pays_association_fees: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MemberClaim {
  id: string;
  member_id?: string;
  email?: string;
  full_name?: string;
  date_of_birth?: string;
  phone?: string;
  club_id: string;
  association_id?: string;
  association_type?: 'state' | 'national';
  invited_by_user_id?: string;
  invited_by_club_id?: string;
  claim_type: 'association_import' | 'club_invite' | 'member_request';
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  membership_type_id?: string;
  relationship_type: 'primary' | 'affiliate' | 'guest' | 'honorary';
  match_confidence?: number;
  match_reasons?: string[];
  admin_notes?: string;
  rejection_reason?: string;
  expires_at: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

export interface MemberMatchSuggestion {
  id: string;
  claim_id: string;
  new_profile_email?: string;
  suggested_member_id: string;
  confidence_score: number;
  match_type: 'email_exact' | 'email_similar' | 'name_dob' | 'phone' | 'member_number';
  match_details: any;
  status: 'pending' | 'confirmed_match' | 'confirmed_different' | 'ignored';
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// Get all club memberships for a member
export async function getMemberClubMemberships(memberId: string): Promise<ClubMembership[]> {
  const { data, error } = await supabase
    .from('club_memberships')
    .select('*, clubs(name, state_association_id), membership_types(name, annual_fee)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching club memberships:', error);
    return [];
  }

  return data || [];
}

// Get all members for a club (including their relationship type)
export async function getClubMembersWithRelationships(clubId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('club_memberships')
    .select(`
      *,
      profiles(id, email, full_name, avatar, member_number, is_multi_club_member),
      membership_types(name, annual_fee)
    `)
    .eq('club_id', clubId)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching club members:', error);
    return [];
  }

  return data || [];
}

// Add club membership
export async function addClubMembership(membership: Partial<ClubMembership>): Promise<ClubMembership | null> {
  const { data, error } = await supabase
    .from('club_memberships')
    .insert([membership])
    .select()
    .single();

  if (error) {
    console.error('Error adding club membership:', error);
    return null;
  }

  return data;
}

// Update club membership
export async function updateClubMembership(id: string, updates: Partial<ClubMembership>): Promise<boolean> {
  const { error } = await supabase
    .from('club_memberships')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating club membership:', error);
    return false;
  }

  return true;
}

// Import association members in bulk
export async function importAssociationMembers(
  members: Array<{
    email: string;
    full_name: string;
    date_of_birth?: string;
    phone?: string;
    member_number?: string;
  }>,
  associationId: string,
  associationType: 'state' | 'national',
  countryCode: string = 'AUS'
): Promise<{ created: number; existing: number; errors: number }> {
  let created = 0;
  let existing = 0;
  let errors = 0;

  const associationKey = associationType === 'state' ? 'state_association_id' : 'national_association_id';

  for (const member of members) {
    try {
      const email = member.email.toLowerCase().trim();
      const nameParts = (member.full_name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || 'Unknown';

      const { data: existingMember } = await supabase
        .from('members')
        .select('id')
        .eq(associationKey, associationId)
        .ilike('email', email)
        .maybeSingle();

      if (existingMember) {
        const updateData: Record<string, any> = {};
        if (member.phone) updateData.phone = member.phone;
        if (Object.keys(updateData).length > 0) {
          await supabase.from('members').update(updateData).eq('id', existingMember.id);
        }
        existing++;
      } else {
        const { error: insertError } = await supabase
          .from('members')
          .insert([{
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: member.phone || null,
            country: countryCode,
            membership_status: 'active',
            [associationKey]: associationId,
          }]);

        if (insertError) {
          console.error('Error creating member:', insertError);
          errors++;
          continue;
        }
        created++;
      }
    } catch (err) {
      console.error('Error processing member:', err);
      errors++;
    }
  }

  return { created, existing, errors };
}

// Extended import: accepts mapped fields from smart CSV importer
export async function importAssociationMembersExtended(
  members: Array<Record<string, string>>,
  associationId: string,
  associationType: 'state' | 'national',
  countryCode: string = 'AUS'
): Promise<{ created: number; existing: number; errors: number }> {
  let created = 0;
  let existing = 0;
  let errors = 0;

  const associationKey = associationType === 'state' ? 'state_association_id' : 'national_association_id';

  for (const member of members) {
    try {
      const email = (member.email || '').toLowerCase().trim();
      const firstName = (member.first_name || '').trim();
      const lastName = (member.last_name || '').trim();

      if (!firstName && !lastName && !email) {
        errors++;
        continue;
      }

      let existingMemberQuery = supabase
        .from('members')
        .select('id')
        .eq(associationKey, associationId);

      if (email) {
        existingMemberQuery = existingMemberQuery.ilike('email', email);
      } else {
        existingMemberQuery = existingMemberQuery
          .ilike('first_name', firstName)
          .ilike('last_name', lastName);
      }

      const { data: existingMember } = await existingMemberQuery.maybeSingle();

      const memberData: Record<string, any> = {
        first_name: firstName || 'Unknown',
        last_name: lastName || 'Unknown',
        [associationKey]: associationId,
      };
      if (email) memberData.email = email;
      if (member.phone) memberData.phone = member.phone;
      if (member.street) memberData.street = member.street;
      if (member.city) memberData.city = member.city;
      if (member.state) memberData.state = member.state;
      if (member.postcode) memberData.postcode = member.postcode;
      if (member.country) memberData.country = member.country;
      if (member.membership_level) memberData.membership_level = member.membership_level;
      if (member.club_name) memberData.club = member.club_name;
      if (member.nickname && !member.club_name) memberData.club = member.nickname;
      if (member.club_id) memberData.club_id = member.club_id;
      if (member.membership_status) {
        memberData.membership_status = member.membership_status;
        if (member.membership_status === 'active') {
          memberData.is_financial = true;
        }
      }

      if (member.date_joined) memberData.date_joined = member.date_joined;
      else if (member.start_date) memberData.date_joined = member.start_date;

      if (member.end_date) memberData.renewal_date = member.end_date;

      if (existingMember) {
        const { error: updateError } = await supabase
          .from('members')
          .update(memberData)
          .eq('id', existingMember.id);

        if (updateError) {
          console.error('Error updating member:', updateError);
          errors++;
        } else {
          existing++;
        }
      } else {
        if (!memberData.membership_status) memberData.membership_status = 'active';
        const { error: insertError } = await supabase
          .from('members')
          .insert([memberData]);

        if (insertError) {
          console.error('Error creating member:', insertError);
          errors++;
        } else {
          created++;
        }
      }
    } catch (err) {
      console.error('Error processing member:', err);
      errors++;
    }
  }

  return { created, existing, errors };
}

// Create member claims for association import
export async function createMemberClaimsForClub(
  clubId: string,
  memberEmails: string[],
  membershipTypeId?: string,
  relationshipType: 'primary' | 'affiliate' = 'primary'
): Promise<{ created: number; alreadyClaimed: number }> {
  let created = 0;
  let alreadyClaimed = 0;

  for (const email of memberEmails) {
    try {
      // Find the profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, date_of_birth, registration_source')
        .eq('email', email.toLowerCase())
        .eq('registration_source', 'association_import')
        .maybeSingle();

      if (!profile) continue;

      // Check if already claimed by this club
      const { data: existingClaim } = await supabase
        .from('member_claims')
        .select('id')
        .eq('member_id', profile.id)
        .eq('club_id', clubId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingClaim) {
        alreadyClaimed++;
        continue;
      }

      // Check if already a member
      const { data: existingMembership } = await supabase
        .from('club_memberships')
        .select('id')
        .eq('member_id', profile.id)
        .eq('club_id', clubId)
        .maybeSingle();

      if (existingMembership) {
        alreadyClaimed++;
        continue;
      }

      // Create claim
      await supabase
        .from('member_claims')
        .insert([{
          member_id: profile.id,
          club_id: clubId,
          claim_type: 'association_import',
          status: 'pending',
          membership_type_id: membershipTypeId,
          relationship_type: relationshipType,
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days
        }]);

      created++;
    } catch (err) {
      console.error('Error creating claim:', err);
    }
  }

  return { created, alreadyClaimed };
}

// Get pending claims for a club
export async function getClubMemberClaims(clubId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('member_claims')
    .select(`
      *,
      profiles(id, email, full_name, date_of_birth, member_number),
      clubs(name),
      membership_types(name, annual_fee)
    `)
    .eq('club_id', clubId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching member claims:', error);
    return [];
  }

  return data || [];
}

// Accept member claim
export async function acceptMemberClaim(
  claimId: string,
  userId: string
): Promise<boolean> {
  try {
    // Get the claim details
    const { data: claim, error: claimError } = await supabase
      .from('member_claims')
      .select('*')
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      console.error('Error fetching claim:', claimError);
      return false;
    }

    let memberId = claim.member_id;

    // If no member_id, check if a profile with this email exists
    if (!memberId && claim.email) {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', claim.email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        memberId = existingProfile.id;

        // Update the claim with the found member_id
        await supabase
          .from('member_claims')
          .update({ member_id: memberId })
          .eq('id', claimId);
      }
    }

    if (!memberId) {
      // For members without accounts, send an invitation instead
      console.error('Member has not registered yet. Send them an invitation first.');
      alert('This member needs to be invited to create an account first. Use the "Send Invitation" button.');
      return false;
    }

    // Create the club membership
    const { error: membershipError } = await supabase
      .from('club_memberships')
      .insert([{
        member_id: memberId,
        club_id: claim.club_id,
        membership_type_id: claim.membership_type_id,
        relationship_type: claim.relationship_type,
        status: 'active',
        payment_status: 'unpaid',
        pays_association_fees: claim.relationship_type === 'primary',
        created_by: userId
      }]);

    if (membershipError) {
      console.error('Error creating membership:', membershipError);
      return false;
    }

    // Update claim status
    const { error: updateError } = await supabase
      .from('member_claims')
      .update({
        status: 'accepted',
        resolved_at: new Date().toISOString(),
        resolved_by: userId
      })
      .eq('id', claimId);

    if (updateError) {
      console.error('Error updating claim:', updateError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error accepting claim:', err);
    return false;
  }
}

// Reject member claim
export async function rejectMemberClaim(
  claimId: string,
  userId: string,
  reason?: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_claims')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      resolved_at: new Date().toISOString(),
      resolved_by: userId
    })
    .eq('id', claimId);

  if (error) {
    console.error('Error rejecting claim:', error);
    return false;
  }

  return true;
}

// Get smart match suggestions for a claim
export async function getMatchSuggestionsForClaim(claimId: string): Promise<MemberMatchSuggestion[]> {
  const { data, error } = await supabase
    .from('member_match_suggestions')
    .select(`
      *,
      profiles(id, email, full_name, member_number)
    `)
    .eq('claim_id', claimId)
    .eq('status', 'pending')
    .order('confidence_score', { ascending: false });

  if (error) {
    console.error('Error fetching match suggestions:', error);
    return [];
  }

  return data || [];
}

// Find potential duplicate members
export async function findPotentialDuplicates(
  email: string,
  fullName?: string,
  dateOfBirth?: string
): Promise<any[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, date_of_birth, member_number')
    .or(`email.ilike.%${email}%,full_name.ilike.%${fullName || ''}%`)
    .limit(10);

  if (error) {
    console.error('Error finding duplicates:', error);
    return [];
  }

  return data || [];
}

// Change member relationship type (e.g., primary to affiliate)
export async function changeMemberRelationshipType(
  membershipId: string,
  newRelationshipType: 'primary' | 'affiliate' | 'guest' | 'honorary'
): Promise<boolean> {
  const { error } = await supabase
    .from('club_memberships')
    .update({
      relationship_type: newRelationshipType,
      pays_association_fees: newRelationshipType === 'primary',
      updated_at: new Date().toISOString()
    })
    .eq('id', membershipId);

  if (error) {
    console.error('Error changing relationship type:', error);
    return false;
  }

  return true;
}

// Get all unclaimed members (imported by association but not claimed by any club)
export async function getUnclaimedMembers(associationId: string, associationType: 'state' | 'national'): Promise<any[]> {
  const associationKey = associationType === 'state' ? 'state_association_id' : 'national_association_id';

  const { data, error } = await supabase
    .from('members')
    .select('id, email, first_name, last_name, created_at')
    .eq(associationKey, associationId)
    .is('club_id', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching unclaimed members:', error);
    return [];
  }

  return data || [];
}
