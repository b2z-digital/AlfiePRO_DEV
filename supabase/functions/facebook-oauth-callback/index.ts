import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { code, redirectUri, clubId } = await req.json();

    if (!code || !redirectUri || !clubId) {
      throw new Error('Missing required parameters');
    }

    const appId = Deno.env.get('FACEBOOK_APP_ID');
    const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!appId || !appSecret || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${appId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `client_secret=${appSecret}&` +
      `code=${code}`
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorData}`);
    }

    const tokenData = await tokenResponse.json();
    const { access_token } = tokenData;

    if (!access_token) {
      throw new Error('No access token received');
    }

    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${access_token}`
    );

    if (!pagesResponse.ok) {
      const errorData = await pagesResponse.text();
      throw new Error(`Failed to fetch pages: ${errorData}`);
    }

    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('No Facebook pages found for this account');
    }

    return new Response(
      JSON.stringify({
        success: true,
        pages: pagesData.data.map((page: any) => ({
          id: page.id,
          name: page.name,
          access_token: page.access_token,
        })),
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Facebook OAuth callback error:', error);

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process Facebook OAuth callback'
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