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

    const lookups: { column: string; id: string }[] = [];
    if (associationId) {
      const assocColumn = associationType === 'state' ? 'state_association_id' : 'national_association_id';
      lookups.push({ column: assocColumn, id: associationId });
    }
    if (clubId) {
      lookups.push({ column: 'club_id', id: clubId });
    }

    let integration = null;
    for (const lookup of lookups) {
      const { data, error: integrationError } = await supabase
        .from('integrations')
        .select('id, credentials')
        .eq(lookup.column, lookup.id)
        .eq('platform', 'google')
        .eq('is_active', true)
        .maybeSingle();

      if (!integrationError && data?.credentials?.refresh_token) {
        integration = data;
        break;
      }
    }

    if (!integration || !integration.credentials) {
      throw new Error('Google integration not found. Please connect Google Calendar first.');
    }

    const creds = integration.credentials;
    let accessToken = creds.access_token;
    const expiresAt = new Date(creds.token_expires_at);
    const now = new Date();

    if (now >= expiresAt && creds.refresh_token) {
      accessToken = await refreshAccessToken(creds.refresh_token);

      const newExpiresAt = new Date(Date.now() + (3600 * 1000)).toISOString();
      const updatedCredentials = {
        ...creds,
        access_token: accessToken,
        token_expires_at: newExpiresAt,
      };

      await supabase
        .from('integrations')
        .update({ credentials: updatedCredentials })
        .eq('id', integration.id);
    }

    const eventData = {
      summary: meetingName,
      description: meetingDescription || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'Australia/Sydney',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Australia/Sydney',
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

    const calendarId = creds.google_calendar_id || 'primary';
    const calendarResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
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
