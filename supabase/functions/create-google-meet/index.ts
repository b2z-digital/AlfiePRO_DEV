import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const {
      clubId,
      associationId,
      associationType,
      meetingName,
      meetingDescription,
      startDateTime,
      endDateTime,
      attendeeEmails
    } = await req.json();

    if ((!clubId && !associationId) || !meetingName || !startDateTime || !endDateTime) {
      throw new Error('Missing required parameters');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let integration;
    let integrationError;

    // Get the Google integration (club or association)
    if (clubId) {
      const result = await supabase
        .from('club_integrations')
        .select('*')
        .eq('club_id', clubId)
        .eq('provider', 'google')
        .eq('is_enabled', true)
        .maybeSingle();

      integration = result.data;
      integrationError = result.error;
    } else if (associationId && associationType) {
      const tableName = associationType === 'state'
        ? 'state_association_integrations'
        : 'national_association_integrations';
      const idColumn = associationType === 'state'
        ? 'state_association_id'
        : 'national_association_id';

      const result = await supabase
        .from(tableName)
        .select('*')
        .eq(idColumn, associationId)
        .eq('provider', 'google')
        .eq('is_enabled', true)
        .maybeSingle();

      integration = result.data;
      integrationError = result.error;
    }

    if (integrationError) {
      throw new Error(`Failed to fetch integration: ${integrationError.message}`);
    }

    if (!integration) {
      throw new Error('Google integration not found. Please connect Google Calendar first.');
    }

    // Check if token is expired and refresh if needed
    let accessToken = integration.access_token;
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();

    if (now >= expiresAt && integration.refresh_token) {
      accessToken = await refreshAccessToken(integration.refresh_token);

      // Update the new access token in the database
      const newExpiresAt = new Date(Date.now() + (3600 * 1000)).toISOString();

      if (clubId) {
        await supabase
          .from('club_integrations')
          .update({
            access_token: accessToken,
            token_expires_at: newExpiresAt
          })
          .eq('id', integration.id);
      } else if (associationId && associationType) {
        const tableName = associationType === 'state'
          ? 'state_association_integrations'
          : 'national_association_integrations';

        await supabase
          .from(tableName)
          .update({
            access_token: accessToken,
            token_expires_at: newExpiresAt
          })
          .eq('id', integration.id);
      }
    }

    // Create the calendar event with Google Meet
    const eventData = {
      summary: meetingName,
      description: meetingDescription || '',
      start: {
        dateTime: startDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      conferenceData: {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      },
      attendees: attendeeEmails ? attendeeEmails.map((email: string) => ({ email })) : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    const calendarId = integration.google_calendar_id || 'primary';
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      throw new Error(`Failed to create calendar event: ${errorText}`);
    }

    const eventResult = await calendarResponse.json();

    // Extract Google Meet link
    const meetLink = eventResult.hangoutLink || eventResult.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === 'video'
    )?.uri;

    if (!meetLink) {
      throw new Error('Failed to generate Google Meet link');
    }

    return new Response(
      JSON.stringify({
        success: true,
        meetingUrl: meetLink,
        calendarEventId: eventResult.id,
        calendarEventLink: eventResult.htmlLink
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Create Google Meet error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to create Google Meet'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400,
      }
    );
  }
});
