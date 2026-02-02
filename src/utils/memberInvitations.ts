import { supabase } from './supabase';

export interface MemberInvitation {
  id: string;
  member_id: string;
  club_id: string;
  email: string;
  token: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipApplication {
  id: string;
  user_id: string;
  club_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  member_id?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export async function sendMemberInvitation(
  memberId: string,
  clubId: string
): Promise<{ success: boolean; error?: string; invitationId?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    console.log('Sending invitation for member:', memberId, 'in club:', clubId);

    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, first_name, last_name, email, user_id')
      .eq('id', memberId)
      .eq('club_id', clubId)
      .single();

    if (memberError || !member) {
      console.error('Member lookup failed:', { memberId, clubId, error: memberError });
      return {
        success: false,
        error: `Member not found in database. Please ensure the member record exists. Details: ${memberError?.message || 'Member ID not found'}`
      };
    }

    console.log('Member found for invitation:', { memberId: member.id, email: member.email, hasUserId: !!member.user_id });

    if (!member.email) {
      return { success: false, error: 'Member does not have an email address' };
    }

    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return { success: false, error: 'Club not found' };
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log('Creating invitation record directly in database');

    const { data: invitation, error: invitationError } = await supabase
      .from('member_invitations')
      .insert({
        member_id: member.id,
        club_id: club.id,
        email: member.email,
        token: token,
        invited_by: user.id,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (invitationError) {
      console.error('Invitation creation error:', invitationError);
      return {
        success: false,
        error: `Failed to create invitation: ${invitationError.message}`
      };
    }

    console.log('Invitation created:', invitation.id);

    const appUrl = window.location.origin;
    const invitationUrl = `${appUrl}/invite/${token}`;

    console.log('Attempting to send email via edge function');

    try {
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">You're Invited to Join ${club.name}!</h2>
          <p>Hi ${member.first_name} ${member.last_name},</p>
          <p><strong>${club.name}</strong> has invited you to join their club on Alfie PRO - the complete RC yacht club management platform.</p>
          <p>Click the link below to accept your invitation and create your account:</p>
          <p style="margin: 30px 0;">
            <a href="${invitationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
          </p>
          <p style="font-size: 14px; color: #666;">Or copy and paste this link into your browser:<br>
          <a href="${invitationUrl}" style="color: #2563eb;">${invitationUrl}</a></p>
          <p style="font-size: 14px; color: #666;">This invitation will expire in 7 days.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <h3 style="color: #1f2937;">What's Alfie PRO?</h3>
          <ul style="color: #4b5563;">
            <li>View race results and series standings</li>
            <li>Register for upcoming events</li>
            <li>Manage your membership and boats</li>
            <li>Stay updated with club news and announcements</li>
            <li>Access club documents and resources</li>
          </ul>
        </div>
      `;

      const { error: emailError } = await supabase.functions.invoke('send-notification', {
        body: {
          recipients: [{
            user_id: member.user_id,
            email: member.email,
            name: `${member.first_name} ${member.last_name}`,
          }],
          subject: `You're invited to join ${club.name} on Alfie PRO`,
          body: emailBody,
          type: 'invitation',
          club_id: clubId,
          send_email: true,
          sender_name: club.name,
          club_name: club.name,
        },
      });

      if (emailError) {
        console.warn('Email sending failed, but invitation was created:', emailError);
      } else {
        console.log('Email sent successfully');
      }
    } catch (emailError) {
      console.warn('Could not send email, but invitation was created:', emailError);
    }

    return { success: true, invitationId: invitation.id };
  } catch (error) {
    console.error('Unexpected error sending invitation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error occurred'
    };
  }
}

export async function getMemberInvitations(clubId: string): Promise<MemberInvitation[]> {
  try {
    const { data, error } = await supabase
      .from('member_invitations')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching invitations:', error);
    return [];
  }
}

export async function getMembershipApplications(clubId: string): Promise<MembershipApplication[]> {
  try {
    const { data, error } = await supabase
      .from('membership_applications')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'pending')
      .eq('is_draft', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching applications:', error);
    return [];
  }
}

export async function approveMembershipApplication(
  applicationId: string,
  membershipType: string = 'full'
): Promise<{ success: boolean; error?: string; memberId?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase.rpc('approve_membership_application', {
      p_application_id: applicationId,
      p_reviewed_by: user.id,
      p_membership_type: membershipType,
    });

    if (error) throw error;

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      memberId: data.member_id
    };
  } catch (error) {
    console.error('Error approving application:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve application'
    };
  }
}

export async function rejectMembershipApplication(
  applicationId: string,
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase.rpc('reject_membership_application', {
      p_application_id: applicationId,
      p_reviewed_by: user.id,
      p_rejection_reason: rejectionReason,
    });

    if (error) throw error;

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    console.error('Error rejecting application:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject application'
    };
  }
}

export async function validateInvitationToken(token: string): Promise<{
  valid: boolean;
  invitation?: MemberInvitation;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('member_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return {
        valid: false,
        error: 'Invalid or expired invitation'
      };
    }

    return { valid: true, invitation: data };
  } catch (error) {
    console.error('Error validating invitation:', error);
    return {
      valid: false,
      error: 'Failed to validate invitation'
    };
  }
}

export async function acceptInvitation(token: string): Promise<{
  success: boolean;
  clubId?: string;
  memberId?: string;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data, error } = await supabase.rpc('accept_invitation', {
      p_token: token,
      p_user_id: user.id,
    });

    if (error) throw error;

    if (!data.success) {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      clubId: data.club_id,
      memberId: data.member_id,
    };
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept invitation'
    };
  }
}
