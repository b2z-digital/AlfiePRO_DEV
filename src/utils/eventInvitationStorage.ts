import { supabase } from './supabase';

export interface EventInvitation {
  id: string;
  event_id: string;
  sender_id: string;
  sender_name: string;
  recipient_email: string;
  recipient_phone?: string;
  recipient_name?: string;
  personal_message?: string;
  status: 'pending' | 'registered' | 'declined' | 'expired';
  invitation_token: string;
  sent_at: string;
  registered_at?: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface InvitationDetails {
  invitation_id: string;
  event_id: string;
  event_name: string;
  event_date: string;
  sender_name: string;
  personal_message?: string;
  status: string;
  expires_at: string;
}

export const eventInvitationStorage = {
  async createInvitation(invitation: {
    event_id: string;
    sender_id: string;
    sender_name: string;
    recipient_email: string;
    recipient_phone?: string;
    recipient_name?: string;
    personal_message?: string;
  }): Promise<EventInvitation> {
    const { data, error } = await supabase
      .from('event_invitations')
      .insert(invitation)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getInvitationsByEvent(eventId: string): Promise<EventInvitation[]> {
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*')
      .eq('event_id', eventId)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getInvitationsBySender(senderId: string): Promise<EventInvitation[]> {
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*')
      .eq('sender_id', senderId)
      .order('sent_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getInvitationByToken(token: string): Promise<InvitationDetails | null> {
    const { data, error } = await supabase
      .rpc('get_invitation_by_token', { token });

    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async getInvitationDetails(invitationId: string): Promise<EventInvitation | null> {
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*')
      .eq('id', invitationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateInvitationStatus(
    invitationId: string,
    status: 'pending' | 'registered' | 'declined' | 'expired',
    registeredAt?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (registeredAt) {
      updateData.registered_at = registeredAt;
    }

    const { error } = await supabase
      .from('event_invitations')
      .update(updateData)
      .eq('id', invitationId);

    if (error) throw error;
  },

  async markInvitationAsRegistered(invitationId: string): Promise<void> {
    await this.updateInvitationStatus(
      invitationId,
      'registered',
      new Date().toISOString()
    );
  },

  async markInvitationAsDeclined(invitationId: string): Promise<void> {
    await this.updateInvitationStatus(invitationId, 'declined');
  },

  async expireOldInvitations(): Promise<void> {
    const { error } = await supabase.rpc('expire_old_invitations');
    if (error) throw error;
  },

  async getInvitationStats(eventId: string): Promise<{
    total: number;
    pending: number;
    registered: number;
    declined: number;
    expired: number;
  }> {
    const invitations = await this.getInvitationsByEvent(eventId);

    return {
      total: invitations.length,
      pending: invitations.filter(i => i.status === 'pending').length,
      registered: invitations.filter(i => i.status === 'registered').length,
      declined: invitations.filter(i => i.status === 'declined').length,
      expired: invitations.filter(i => i.status === 'expired').length,
    };
  },

  async checkExistingInvitation(
    eventId: string,
    recipientEmail: string
  ): Promise<EventInvitation | null> {
    const { data, error } = await supabase
      .from('event_invitations')
      .select('*')
      .eq('event_id', eventId)
      .eq('recipient_email', recipientEmail)
      .in('status', ['pending', 'registered'])
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async resendInvitation(invitationId: string): Promise<boolean> {
    const invitation = await this.getInvitationDetails(invitationId);
    if (!invitation) return false;

    const { data: event } = await supabase
      .from('quick_races')
      .select('event_name, race_date')
      .eq('id', invitation.event_id)
      .single();

    if (!event) return false;

    const inviteLink = `${window.location.origin}/event-registration?token=${invitation.invitation_token}`;

    const { error } = await supabase.functions.invoke('send-event-invitation', {
      body: {
        recipientEmail: invitation.recipient_email,
        recipientName: invitation.recipient_name || null,
        senderName: invitation.sender_name,
        eventName: event.event_name,
        eventDate: event.race_date,
        personalMessage: invitation.personal_message || null,
        invitationLink: inviteLink
      }
    });

    if (error) {
      console.error('Error resending invitation:', error);
      return false;
    }

    const { error: updateError } = await supabase
      .from('event_invitations')
      .update({
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invitationId);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      return false;
    }

    return true;
  },

  async deleteInvitation(invitationId: string): Promise<void> {
    const { error } = await supabase
      .from('event_invitations')
      .delete()
      .eq('id', invitationId);

    if (error) throw error;
  },

  subscribeToInvitations(
    eventId: string,
    callback: (invitation: EventInvitation) => void
  ) {
    return supabase
      .channel(`event_invitations:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_invitations',
          filter: `event_id=eq.${eventId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as EventInvitation);
          }
        }
      )
      .subscribe();
  }
};