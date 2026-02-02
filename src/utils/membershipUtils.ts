import { supabase } from './supabase';

export interface WelcomeEmailData {
  first_name: string;
  last_name: string;
  email: string;
  club_name: string;
  club_id: string;
  user_id?: string;
}

export interface RenewalReminderData {
  first_name: string;
  last_name: string;
  email: string;
  club_name: string;
  renewal_date: string;
  club_id: string;
  user_id?: string;
}

export const sendWelcomeEmail = async (data: WelcomeEmailData): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'welcome',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending welcome email:', err);
    throw err;
  }
};

export const sendRenewalReminder = async (data: RenewalReminderData): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'renewal_reminder',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          renewal_date: data.renewal_date,
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending renewal reminder:', err);
    throw err;
  }
};

export const sendPaymentConfirmation = async (data: any): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'payment_confirmation',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          membership_type: data.membership_type,
          renewal_date: data.renewal_date,
          amount: data.amount,
          currency: data.currency || 'AUD',
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending payment confirmation:', err);
    throw err;
  }
};

export const sendApplicationApproved = async (data: any): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'application_approved',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          membership_type: data.membership_type,
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending application approved email:', err);
    throw err;
  }
};

export const sendApplicationRejected = async (data: any): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'application_rejected',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending application rejected email:', err);
    throw err;
  }
};

export interface EventInvitationData {
  first_name: string;
  last_name: string;
  email: string;
  club_name: string;
  event_name: string;
  event_date: string;
  event_location?: string;
  event_description?: string;
  club_id: string;
  user_id?: string;
}

export const sendEventInvitation = async (data: EventInvitationData): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke('send-membership-notifications', {
      body: {
        email_type: 'event',
        recipient_email: data.email,
        member_data: {
          first_name: data.first_name,
          last_name: data.last_name,
          club_name: data.club_name,
          club_id: data.club_id,
          user_id: data.user_id
        }
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Error sending event invitation:', err);
    throw err;
  }
};