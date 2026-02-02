import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RenewalReminderRequest {
  member_id: string;
  club_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { member_id, club_id }: RenewalReminderRequest = await req.json();

    if (!member_id || !club_id) {
      return new Response(
        JSON.stringify({ error: 'Missing member_id or club_id' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch member details
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .select('id, first_name, last_name, email, user_id, renewal_date, membership_level')
      .eq('id', member_id)
      .single();

    if (memberError || !member) {
      return new Response(
        JSON.stringify({ error: 'Member not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch club details
    const { data: club, error: clubError } = await supabaseAdmin
      .from('clubs')
      .select('name, renewal_notification_days')
      .eq('id', club_id)
      .single();

    if (clubError || !club) {
      return new Response(
        JSON.stringify({ error: 'Club not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Calculate days until expiry
    const renewalDate = new Date(member.renewal_date);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Determine notification type
    let notificationType = 'custom';
    if (daysUntilExpiry === 30) notificationType = '30_days';
    else if (daysUntilExpiry === 14) notificationType = '14_days';
    else if (daysUntilExpiry === 7) notificationType = '7_days';
    else if (daysUntilExpiry === 1) notificationType = '1_day';
    else if (daysUntilExpiry <= 0) notificationType = 'expired';

    // Check if notification already sent
    const { data: existingNotification } = await supabaseAdmin
      .from('membership_renewal_notifications')
      .select('id')
      .eq('member_id', member_id)
      .eq('notification_type', notificationType)
      .eq('renewal_date', member.renewal_date)
      .maybeSingle();

    if (existingNotification) {
      return new Response(
        JSON.stringify({
          message: 'Notification already sent for this period',
          already_sent: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create in-app notification if member has user_id
    let notificationId = null;
    if (member.user_id) {
      const notificationMessage = daysUntilExpiry > 0
        ? `Your ${member.membership_level} membership expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. Please renew to continue enjoying club benefits.`
        : `Your ${member.membership_level} membership has expired. Please renew as soon as possible.`;

      const { data: notification, error: notificationError } = await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: member.user_id,
          club_id: club_id,
          type: 'system',
          title: 'Membership Renewal Reminder',
          message: notificationMessage,
          action_url: '/dashboard/membership',
          priority: daysUntilExpiry <= 7 ? 'high' : 'normal',
          read: false,
        })
        .select()
        .single();

      if (!notificationError && notification) {
        notificationId = notification.id;
      }
    }

    // Send renewal reminder email using the email template
    let emailSent = false;
    if (member.email) {
      try {
        const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-membership-notifications`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            email_type: 'renewal_reminder',
            recipient_email: member.email,
            member_data: {
              first_name: member.first_name,
              last_name: member.last_name,
              club_name: club.name,
              renewal_date: member.renewal_date,
              membership_type: member.membership_level,
              club_id: club_id,
              user_id: member.user_id
            }
          })
        });

        if (emailResponse.ok) {
          emailSent = true;
        } else {
          console.error('Failed to send renewal email:', await emailResponse.text());
        }
      } catch (emailError) {
        console.error('Error sending renewal email:', emailError);
      }
    }

    // Record that we sent this notification
    const { error: recordError } = await supabaseAdmin
      .from('membership_renewal_notifications')
      .insert({
        member_id: member_id,
        club_id: club_id,
        renewal_date: member.renewal_date,
        notification_date: today.toISOString().split('T')[0],
        notification_type: notificationType,
        days_before_expiry: daysUntilExpiry,
        sent_at: new Date().toISOString(),
        email_sent: emailSent,
        in_app_sent: notificationId !== null,
        notification_id: notificationId,
      });

    if (recordError) {
      console.error('Error recording notification:', recordError);
      // Don't fail the request if recording fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Renewal reminder sent successfully',
        days_until_expiry: daysUntilExpiry,
        notification_sent: notificationId !== null,
        email_sent: emailSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error sending renewal reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
